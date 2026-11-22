"""Public and optional authenticated smoke checks for deployed Habitarc.

Credentials, cookies, and session tokens are never printed. Uses only the
Python standard library (Python 3.9+) so CI and Cloud Run verification need
no third-party packages.
"""

import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT_SECONDS = 30
MAX_ATTEMPTS = 5
RETRY_DELAY_SECONDS = 3
VALID_ROLES = frozenset({"participant", "program-manager"})


def validate_base_url(raw_url: str) -> tuple[str, str]:
    """Normalize the target base URL and return (base_url, origin)."""
    base = raw_url.rstrip("/")
    parsed = urllib.parse.urlsplit(base)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.netloc
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Invalid service URL.")
    return base, f"{parsed.scheme}://{parsed.netloc}"


def has_no_store(headers: dict[str, str]) -> bool:
    """Return True when response headers include Cache-Control: no-store."""
    cache_controls = [
        value
        for key, value in headers.items()
        if key.lower() == "cache-control"
    ]
    return any("no-store" in value.lower() for value in cache_controls)


def request(
    base: str,
    path: str,
    data: object = None,
    origin: str | None = None,
    opener: urllib.request.OpenerDirector | None = None,
) -> tuple[bytes, dict[str, str]]:
    """Send an HTTP request and return (body_bytes, lowercase_headers)."""
    headers: dict[str, str] = {}
    payload: bytes | None = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(data).encode("utf-8")
    if origin is not None:
        headers["Origin"] = origin
    req = urllib.request.Request(base + path, headers=headers, data=payload)
    open_url = opener.open if opener is not None else urllib.request.urlopen
    with open_url(req, timeout=TIMEOUT_SECONDS) as response:
        body = response.read()
        response_headers: dict[str, str] = {}
        for key, value in response.headers.items():
            lower_key = key.lower()
            if lower_key in response_headers:
                response_headers[lower_key] = (
                    f"{response_headers[lower_key]}, {value}"
                )
            else:
                response_headers[lower_key] = value
        return body, response_headers


def is_sign_in_page(body: bytes, headers: dict[str, str]) -> bool:
    """Verify the rendered anonymous Habitarc sign-in document."""
    return (
        has_no_store(headers)
        and b"<html" in body.lower()
        and b"Sign in to Habitarc" in body
    )


def is_anonymous_session(body: bytes, headers: dict[str, str]) -> bool:
    """Verify Better Auth returns null with no-store when signed out."""
    return has_no_store(headers) and json.loads(body) is None


def check(raw_base: str) -> None:
    """Run public read-only smoke checks and optional Participant sign-in."""
    base, origin = validate_base_url(raw_base)

    for path, predicate in (
        ("/", is_sign_in_page),
        ("/api/auth/get-session", is_anonymous_session),
    ):
        for attempt in range(MAX_ATTEMPTS):
            try:
                body, headers = request(base, path)
                if not predicate(body, headers):
                    raise ValueError("Unexpected response")
                break
            except (urllib.error.URLError, TimeoutError, ValueError):
                if attempt == MAX_ATTEMPTS - 1:
                    raise RuntimeError(f"Smoke check failed: {path}") from None
                time.sleep(RETRY_DELAY_SECONDS)
        print(f"PASS {path}")

    raw_email = os.getenv("SMOKE_EMAIL")
    email = raw_email.strip() if raw_email is not None else ""
    password = os.getenv("SMOKE_PASSWORD") or ""
    if bool(email) != bool(password):
        raise RuntimeError(
            "Set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither."
        )
    if not email:
        print("SKIP login: optional smoke credentials not configured")
        return

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    signed_in = False
    login_failed = False

    try:
        login_body, login_headers = request(
            base,
            "/api/auth/sign-in/email",
            data={"email": email, "password": password},
            origin=origin,
            opener=opener,
        )
        signed_in = True
        login = json.loads(login_body)
        if not (
            has_no_store(login_headers)
            and isinstance(login, dict)
            and isinstance(login.get("user"), dict)
        ):
            raise ValueError("Unexpected sign-in response")

        session_body, session_headers = request(
            base,
            "/api/auth/get-session",
            opener=opener,
        )
        session = json.loads(session_body)
        user = session.get("user") if isinstance(session, dict) else None
        if not (
            has_no_store(session_headers)
            and isinstance(user, dict)
            and isinstance(user.get("email"), str)
            and user["email"].lower() == email.lower()
            and user.get("role") in VALID_ROLES
        ):
            raise ValueError("Unexpected session response")
        print("PASS login and authenticated /api/auth/get-session")
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError):
        login_failed = True
        raise RuntimeError("Login smoke check failed") from None
    finally:
        if signed_in:
            try:
                request(
                    base,
                    "/api/auth/sign-out",
                    data={},
                    origin=origin,
                    opener=opener,
                )
                if not login_failed:
                    after_body, after_headers = request(
                        base,
                        "/api/auth/get-session",
                        opener=opener,
                    )
                    if not is_anonymous_session(after_body, after_headers):
                        raise ValueError("Session remained active after sign-out")
                print("PASS logout")
            except (urllib.error.URLError, TimeoutError, ValueError):
                if not login_failed:
                    raise RuntimeError("Logout smoke check failed") from None


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 deploy/smoke_test.py SERVICE_URL")
    try:
        check(sys.argv[1])
    except (ValueError, RuntimeError) as error:
        sys.exit(str(error))
