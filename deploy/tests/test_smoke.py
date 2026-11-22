"""Offline unit and loopback tests for deploy/smoke_test.py."""

from __future__ import annotations

import contextlib
import http.client
import http.server
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "smoke_test", Path(__file__).parents[1] / "smoke_test.py"
)
assert SPEC is not None and SPEC.loader is not None
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)

NO_STORE = {"cache-control": "no-store"}
SIGN_IN_HTML = b"<!doctype html><html><body><h1>Sign in to Habitarc</h1></body></html>"


class _LoopbackAuthServer:
    """In-memory loopback HTTP server simulating Better Auth cookie sessions."""

    def __init__(self, expected_email: str, expected_password: str) -> None:
        self.expected_email = expected_email
        self.expected_password = expected_password
        self.active_cookie: str | None = None
        self.seen_origins: list[str | None] = []
        self.seen_cookies: list[str | None] = []
        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                return

            def _send_json(
                self,
                status: int,
                payload: object,
                extra_headers: dict[str, str] | None = None,
            ) -> None:
                body = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                if extra_headers:
                    for key, value in extra_headers.items():
                        self.send_header(key, value)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:
                if self.path == "/":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(SIGN_IN_HTML)))
                    self.end_headers()
                    self.wfile.write(SIGN_IN_HTML)
                    return

                if self.path == "/api/auth/get-session":
                    cookie = self.headers.get("Cookie")
                    outer.seen_cookies.append(cookie)
                    if (
                        outer.active_cookie is not None
                        and cookie == outer.active_cookie
                    ):
                        self._send_json(
                            200,
                            {
                                "user": {
                                    "email": outer.expected_email,
                                    "role": "participant",
                                }
                            },
                        )
                    else:
                        self._send_json(200, None)
                    return

                self.send_response(404)
                self.end_headers()

            def do_POST(self) -> None:
                origin = self.headers.get("Origin")
                outer.seen_origins.append(origin)
                expected_origin = f"http://127.0.0.1:{outer.port}"
                if origin != expected_origin:
                    self._send_json(403, {"error": "Forbidden"})
                    return

                length = int(self.headers.get("Content-Length", "0"))
                raw_body = self.rfile.read(length)
                payload = json.loads(raw_body) if raw_body else {}

                if self.path == "/api/auth/sign-in/email":
                    if (
                        payload.get("email") == outer.expected_email
                        and payload.get("password") == outer.expected_password
                    ):
                        outer.active_cookie = "habitarc_session=loopback-token"
                        self._send_json(
                            200,
                            {
                                "user": {
                                    "email": outer.expected_email,
                                    "role": "participant",
                                }
                            },
                            {
                                "Set-Cookie": (
                                    "habitarc_session=loopback-token; Path=/; HttpOnly"
                                )
                            },
                        )
                    else:
                        self._send_json(401, {"error": "Invalid credentials"})
                    return

                if self.path == "/api/auth/sign-out":
                    cookie = self.headers.get("Cookie")
                    outer.seen_cookies.append(cookie)
                    if cookie == outer.active_cookie:
                        outer.active_cookie = None
                    self._send_json(
                        200,
                        {"success": True},
                        {
                            "Set-Cookie": (
                                "habitarc_session=; Path=/; Max-Age=0; HttpOnly"
                            )
                        },
                    )
                    return

                self.send_response(404)
                self.end_headers()

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self) -> str:
        self.thread.start()
        return f"http://127.0.0.1:{self.port}"

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


class SmokeTests(unittest.TestCase):
    def fake_response(
        self,
        base: str,
        path: str,
        data: object = None,
        origin: str | None = None,
        opener: object = None,
        *,
        logged_in: bool = False,
    ) -> tuple[bytes, dict[str, str]]:
        if path == "/":
            return SIGN_IN_HTML, NO_STORE
        if path == "/api/auth/get-session":
            if logged_in:
                return (
                    b'{"user":{"email":"participant@example.test","role":"participant"}}',
                    NO_STORE,
                )
            return b"null", NO_STORE
        if path == "/api/auth/sign-in/email":
            return (
                b'{"user":{"email":"participant@example.test","role":"participant"}}',
                NO_STORE,
            )
        if path == "/api/auth/sign-out":
            return b"{}", NO_STORE
        raise AssertionError(f"Unexpected path: {path}")

    @patch.dict("os.environ", {}, clear=True)
    def test_public_checks_pass_and_skip_optional_login(self) -> None:
        with patch.object(smoke, "request", side_effect=self.fake_response) as req:
            smoke.check("https://demo.test/")
        self.assertEqual(req.call_count, 2)

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_sign_in_marker_retries_five_times_and_fails(self) -> None:
        def wrong_html(base, path, data=None, origin=None, opener=None):
            if path == "/":
                return b"<html><body><h1>Other App</h1></body></html>", NO_STORE
            return self.fake_response(base, path, data, origin, opener)

        with (
            patch.object(smoke, "request", side_effect=wrong_html) as req,
            patch.object(smoke.time, "sleep") as sleep_mock,
        ):
            with self.assertRaisesRegex(RuntimeError, r"^Smoke check failed: /$"):
                smoke.check("https://demo.test")
        self.assertEqual(req.call_count, 5)
        self.assertEqual(sleep_mock.call_count, 4)

    @patch.dict("os.environ", {}, clear=True)
    def test_missing_no_store_header_fails(self) -> None:
        for bad_path in ("/", "/api/auth/get-session"):
            with self.subTest(bad_path=bad_path):
                def without_no_store(
                    base, path, data=None, origin=None, opener=None, target=bad_path
                ):
                    body, headers = self.fake_response(base, path, data, origin, opener)
                    if path == target:
                        return body, {"cache-control": "public, max-age=60"}
                    return body, headers

                with (
                    patch.object(smoke, "request", side_effect=without_no_store),
                    patch.object(smoke.time, "sleep"),
                ):
                    with self.assertRaisesRegex(RuntimeError, "Smoke check failed"):
                        smoke.check("https://demo.test")

    @patch.dict("os.environ", {}, clear=True)
    def test_non_null_anonymous_session_fails(self) -> None:
        def active_session(base, path, data=None, origin=None, opener=None):
            if path == "/api/auth/get-session":
                return b"{}", NO_STORE
            return self.fake_response(base, path, data, origin, opener)

        with (
            patch.object(smoke, "request", side_effect=active_session),
            patch.object(smoke.time, "sleep"),
        ):
            with self.assertRaisesRegex(
                RuntimeError, "/api/auth/get-session"
            ):
                smoke.check("https://demo.test")

    def test_partial_credentials_fail(self) -> None:
        for env in (
            {"SMOKE_EMAIL": "participant@example.test"},
            {"SMOKE_PASSWORD": "secret-password"},
        ):
            with self.subTest(env=list(env.keys())):
                with (
                    patch.dict("os.environ", env, clear=True),
                    patch.object(smoke, "request", side_effect=self.fake_response),
                ):
                    with self.assertRaisesRegex(
                        RuntimeError, "Set both SMOKE_EMAIL and SMOKE_PASSWORD"
                    ):
                        smoke.check("https://demo.test")

    def test_invalid_url_scheme_rejected_before_any_request(self) -> None:
        for bad_url in ("file:///etc/passwd", "ftp://demo.test", "demo.test"):
            with self.subTest(bad_url=bad_url):
                with patch.object(smoke, "request") as req:
                    with self.assertRaises(ValueError):
                        smoke.check(bad_url)
                req.assert_not_called()

    @patch.dict(
        "os.environ",
        {
            "SMOKE_EMAIL": "participant@example.test",
            "SMOKE_PASSWORD": "test-only-password",
        },
        clear=True,
    )
    def test_authenticated_happy_path_sends_origin_and_verifies_sign_out(self) -> None:
        state = {"signed_in": False}

        def auth_flow(base, path, data=None, origin=None, opener=None):
            if path == "/api/auth/sign-in/email":
                state["signed_in"] = True
                return self.fake_response(base, path, data, origin, opener)
            if path == "/api/auth/sign-out":
                state["signed_in"] = False
                return self.fake_response(base, path, data, origin, opener)
            return self.fake_response(
                base,
                path,
                data,
                origin,
                opener,
                logged_in=state["signed_in"],
            )

        stdout = io.StringIO()
        with (
            patch.object(smoke, "request", side_effect=auth_flow) as req,
            contextlib.redirect_stdout(stdout),
        ):
            smoke.check("https://demo.test")

        self.assertIn("PASS logout", stdout.getvalue())
        paths = [call.args[1] for call in req.call_args_list]
        self.assertEqual(
            paths,
            [
                "/",
                "/api/auth/get-session",
                "/api/auth/sign-in/email",
                "/api/auth/get-session",
                "/api/auth/sign-out",
                "/api/auth/get-session",
            ],
        )
        sign_in_call = req.call_args_list[2]
        self.assertEqual(sign_in_call.kwargs["origin"], "https://demo.test")
        sign_out_call = req.call_args_list[4]
        self.assertEqual(sign_out_call.kwargs["origin"], "https://demo.test")
        self.assertEqual(sign_out_call.kwargs["data"], {})

    @patch.dict(
        "os.environ",
        {
            "SMOKE_EMAIL": "participant@example.test",
            "SMOKE_PASSWORD": "test-only-password",
        },
        clear=True,
    )
    def test_authenticated_failure_still_attempts_sign_out(self) -> None:
        calls = 0

        def broken_auth_session(base, path, data=None, origin=None, opener=None):
            nonlocal calls
            calls += 1
            if path == "/api/auth/get-session" and calls > 2:
                raise ValueError("Broken session payload")
            return self.fake_response(base, path, data, origin, opener)

        stdout = io.StringIO()
        with (
            patch.object(
                smoke, "request", side_effect=broken_auth_session
            ) as req,
            contextlib.redirect_stdout(stdout),
        ):
            with self.assertRaisesRegex(RuntimeError, "Login smoke"):
                smoke.check("https://demo.test")

        self.assertNotIn("PASS logout", stdout.getvalue())
        last_call = req.call_args_list[-1]
        self.assertEqual(last_call.args[1], "/api/auth/sign-out")
        self.assertEqual(last_call.kwargs["origin"], "https://demo.test")
        self.assertEqual(last_call.kwargs["data"], {})

    @patch.dict("os.environ", {}, clear=True)
    def test_remote_disconnected_is_retried(self) -> None:
        calls = 0

        def flaky_connect(base, path, data=None, origin=None, opener=None):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise http.client.RemoteDisconnected(
                    "Remote end closed connection without response"
                )
            return self.fake_response(base, path, data, origin, opener)

        with (
            patch.object(smoke, "request", side_effect=flaky_connect) as req,
            patch.object(smoke.time, "sleep") as sleep_mock,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            smoke.check("https://demo.test")

        self.assertEqual(req.call_count, 3)
        self.assertEqual(sleep_mock.call_count, 1)

    def test_loopback_http_cookie_and_origin_round_trip(self) -> None:
        email = "participant@example.test"
        password = "loopback-test-password"
        server = _LoopbackAuthServer(email, password)
        base_url = server.start()
        self.addCleanup(server.stop)

        with patch.dict(
            "os.environ",
            {"SMOKE_EMAIL": email, "SMOKE_PASSWORD": password},
            clear=True,
        ):
            smoke.check(base_url)

        self.assertEqual(server.seen_origins, [base_url, base_url])
        self.assertEqual(
            server.seen_cookies,
            [
                None,
                "habitarc_session=loopback-token",
                "habitarc_session=loopback-token",
                None,
            ],
        )
        self.assertIsNone(server.active_cookie)


if __name__ == "__main__":
    unittest.main()
