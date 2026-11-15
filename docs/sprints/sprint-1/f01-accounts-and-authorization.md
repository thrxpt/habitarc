# F01 — Accounts and authorization

Status: accepted contract baseline following Q25. Implemented locally with real-PostgreSQL integration, rendered-form, and running TanStack HTTP tests; see [operator instructions](../../auth.md) and the [verification ledger](../../auth.md#f01-verification-ledger). Current Chromium coverage and remaining release/accessibility/cloud gates are recorded in the [Deliverable 1 ledger](../../deliverables/deliverable-1/part-f.md). Earlier feature-level results remain historical evidence.

Sprint 1. FR-01–02, BR-01/07, NFR-01/07. No feature prerequisites. Deliver secure provisioning, login/logout/current identity, and reusable server-side role/ownership checks. Owner A; teammate B reviews and attempts misuse. The Better Auth compatibility/provisioning spike is an early gate.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F01-1 / STS-F01-1 | Integration + E2E | Provision A, B, M; sign in using valid and invalid passwords | Valid users receive the correct identity/role; invalid credentials disclose no account details; no credential is logged |
| AC-F01-2 / STS-F01-2 | Integration | Call signup directly, submit a forged role, then call every newly added protected operation anonymously/as wrong role/as B against A's records | Signup/role escalation fail; private records are never disclosed or mutated; manager template privileges never imply participant-history access |
| AC-F01-3 / STS-F01-3 | Integration | Login on instance 1; logout/revoke, then reuse the cookie on instance 2; advance past expiry | Revoked/expired sessions fail immediately on the next validated request; required cookie attributes are present |
| AC-F01-4 / STS-F01-4 | Integration | Send cross-origin writes, exceed login limit across replicas, and attempt spoofed forwarding headers | Unsafe writes fail; shared limiter blocks excess attempts; untrusted headers cannot evade the configured identity policy |

Extend STS-F01-2's protected-operation matrix with each feature. F01's first delivery does not prove future endpoints secure.

## Feature design: login, API, and data

The sign-in screen accepts email/password with labels, required-field feedback, generic invalid-credential errors, rate-limit guidance, and disabled pending/unhydrated controls. The form uses POST even before JavaScript attaches. A validated session displays current name/email/role and the corresponding workspace. Sign out revokes the database session, then refreshes identity. Failed logout remains an error, rather than implying success.

Better Auth owns `/api/auth/sign-in/email` (POST `{email,password}`), `/api/auth/get-session` (GET, identity/session or null), and `/api/auth/sign-out` (POST). No signup, recovery, invitation, or role-changing route is mounted. Passwords are hashed by Better Auth's credential APIs; provisioning requires at least twelve characters. Never store credentials in client local storage, logs, or Git. Use only private synthetic-account provisioning. The session cookie is HttpOnly, Secure in production, SameSite=Lax; expiry is seven days, with rolling renewal at most daily and no cookie-session cache. Revalidate persisted sessions on every protected operation, including across independent instances after logout/expiry.

`getIdentity` (GET server function) returns the session-derived `{id,name,email,role,timezone}` or null. `getWorkspace` (GET, requested role) checks that role against the persisted identity; input cannot change it. HTTP 401 is unauthenticated, 403 forbidden, 400 invalid workspace, 429 login throttling, and 503 safe service failure. Shared canonical-origin checks reject unsafe application writes; login throttling admits at most ten requests per IP/minute atomically in PostgreSQL. Actual cloud proxy behavior remains a deployment check.

Migrations `0000_auth.sql` and `0001_account-timezone.sql` create Better Auth user/account/session/verification/rate-limit persistence and add the fixed server-owned Account Timezone. Drizzle and `pg` share the application database; the library owns hashing and token creation. No separate authentication store or public account-administration UI is required. Operator input, replay-safe provisioning, credential-file permissions, and exact environment-variable rules are documented in `docs/auth.md` and README.
