# F01 — Accounts and authorization

Status: accepted contract baseline following Q25. Implemented locally with real-PostgreSQL integration, rendered-form, and running TanStack HTTP tests; see [operator instructions](../../auth.md) and the [verification ledger](../../auth.md#f01-verification-ledger). Live Cloud Run deployment and its actual proxy/IP chain, screen accessibility/responsiveness measurements, and independent integrated-release acceptance remain unverified.

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
