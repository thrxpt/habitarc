# Authentication and operator tooling

Issue [#4](https://github.com/thrxpt/habitarc/issues/4) implements the F01 account boundary. Better Auth **1.7.23** uses Drizzle ORM **0.45.2**, Drizzle Kit **0.31.11**, and the `pg` connection driver. [ADR 0004](adr/0004-shared-drizzle-persistence.md) records why authentication and later features share Drizzle.

## Provision synthetic accounts privately

For the standard local accounts, configure `.env.local`, start Compose, run migrations, then run `vp run accounts:local`. This generates two Participants (`one@example.test`, `two@example.test`) and one Program Manager (`manager@example.test`) with independent random 32-character passwords and the `Asia/Bangkok` Account Timezone. Credentials are saved outside the repository in `~/.local/share/habitarc/local-accounts.json` (`0600`); an optional positional argument selects a different private file. Passwords never appear in command output. The command refuses production mode and non-loopback databases.

Reruns reuse the same credentials file and the existing transactional provisioner. The shared provisioning lock also protects the initial existence check and file generation, so concurrent runs cannot replace passwords. If any standard account already exists but the credentials file is missing, the command stops without creating accounts or a replacement file. Restore the original file; this command does not reset passwords. Keep the file private while using these local accounts.

For custom account batches, use the stdin command below.

Start the local PostgreSQL service with `docker compose up -d --wait postgres`, then run migrations. Compose creates the development and test databases on first startup and preserves them in a named volume. Create a private UTF-8 JSON file outside the repository with permissions `0600`. Its array contains at least two distinct Participants and one Program Manager. Each object has `name`, `email`, `password`, and `role` (`participant` or `program-manager`); optional `timezone` defaults to `Asia/Bangkok`. Use unique synthetic email addresses and privately generated passwords of 12–128 characters. Timezones must be named IANA zones recognized by both the JavaScript runtime and PostgreSQL; `UTC` is also accepted.

Do not put credentials in command arguments, shell history, source files, screenshots, or logs. The command accepts stdin only:

```sh
vp run accounts:provision < /private/path/synthetic-accounts.json
```

It validates the entire input before creating accounts, serializes concurrent provisioning with a PostgreSQL transaction lock, and uses a separate, unmounted Better Auth instance’s supported `signUpEmail` API. Better Auth owns password hashing and credential records. Account creation runs transactionally, including the user/credential pair. Any failure rolls back that batch. Repeating setup skips existing normalized email addresses and preserves their passwords, roles, Account Timezones, sessions, and application data. Counts are the only success output; errors are redacted. This is initial account provisioning, not a password-reset or account-edit command. Remove the private input file when it is no longer needed.

## Schema and migrations

`src/server/schema.ts` is the shared Drizzle schema, initially generated with `auth@1.7.23` and reviewed for application invariants. It retains Better Auth field mappings, timezone-aware timestamps for absolute instants, a role CHECK, a default Account Timezone, and session indexes. The custom migration validates Account Timezones against PostgreSQL’s named zones.

```sh
vp run db:generate
vp run db:migrate
```

Review and commit the generated SQL, snapshots, and journal in `drizzle/`. The migration command uses Drizzle’s migration history and a PostgreSQL session advisory lock. It applies migrations once in a controlled release job, never on application startup. Reruns preserve existing data. Use new migrations to change an applied schema; do not rewrite applied migrations or use `push` against persistent databases. The discarded pre-Drizzle draft was used only in disposable test databases.

When Better Auth’s configuration/version changes, generate a candidate schema with the matching pinned CLI and merge its changes into the reviewed shared schema:

```sh
vp dlx -- auth@1.7.23 generate --config scripts/auth.config.ts --output /tmp/habitarc-auth-schema.ts --yes
```

Do not overwrite the reviewed schema blindly: the generator’s default timestamps and omitted application constraints are insufficient. Auth adapter transactions are explicitly enabled. Raw SQL is reserved for database constraints and locks; application queries use Drizzle.

## Serving boundary

The only mounted Better Auth operations are `POST /api/auth/sign-in/email`, `GET/POST /api/auth/get-session`, and `POST /api/auth/sign-out`. Signup is also disabled in the serving configuration. Recovery, invitation, administrator, profile mutation, password mutation, and alternative sign-in paths are not mounted. No administrator plugin or third application role is installed.

Roles and Account Timezones are server-owned additional fields. The server validates the session and role for each workspace operation; browser identity is never authority. Participants see their own workspace and Program Managers see the Activity Templates workspace. Future operations must apply this role check and scope private records to the validated participant ID. This slice does not implement or claim coverage of future tracking operations.

Sessions live in PostgreSQL. Cookie-session caching is disabled. Expiry rolls forward seven days, at most once per day; session refresh writes are deferred to origin-protected POST requests, which the Better Auth client makes automatically after a GET reports that renewal is due when the app opens or regains focus. GET session lookup and server-side identity reads do not renew or delete database sessions. Production cookies use Secure, HttpOnly, and SameSite=Lax. Logout deletes the database session, so another instance rejects the old cookie immediately. The UI never stores bearer tokens in local storage.

Both auth writes and all TanStack application writes require the exact configured Origin and reject cross-site Fetch Metadata. The application never infers the trusted origin from forwarding headers. Pages and authentication responses use `Cache-Control: no-store`.

## Runtime and trusted client addresses

Set `DATABASE_URL`, a private high-entropy `BETTER_AUTH_SECRET` of at least 32 characters, and an explicit canonical `BETTER_AUTH_URL` without a trailing slash. Production requires HTTPS and managed Cloud Run execution (`K_SERVICE`); use the same secret/origin/database across replicas. The pool allows at most five connections per instance, following [ADR 0002](adr/0002-cloud-run-and-cloud-sql.md).

Local mode ignores all caller-supplied address headers and uses one loopback rate-limit bucket. Production supports direct managed Cloud Run ingress only: the adapter takes the final platform-appended client address in `X-Forwarded-For`, rejects a missing/malformed suffix, and replaces its private internal IP header before Better Auth sees it. User-supplied prefixes, `X-Real-IP`, and forged internal IP headers cannot select the bucket. Better Auth groups IPv6 addresses by its default /64 policy and atomically enforces ten login attempts per IP in a sixty-second window in PostgreSQL, across replicas.

`K_SERVICE` identifies execution on Cloud Run; it does not prove the proxy chain. Before deployment acceptance, verify the actual ingress appends the connecting client after any forged prefix and confirm the rate-limit bucket remains the same. An extra load balancer, CDN, or proxy requires an explicitly reviewed address policy and new tests; do not reuse the direct-ingress policy silently. Cloud resources and live ingress were not provisioned or verified by this local implementation. [Cloud Run HTTPS behavior](https://docs.cloud.google.com/run/docs/triggering/https-request) and [Google load-balancer forwarding semantics](https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header) describe why topology matters.

## Verification

Run the commands in the root README with real PostgreSQL. Integration tests exercise private provisioning and safe repeat runs; invalid credentials; server-owned identity; role denial; disabled endpoints; production cookie attributes; seven-day rolling expiry/daily renewal; logout across independent pools; exact-origin write protection; spoofed/malformed forwarding headers; and sequential/concurrent shared throttling. A running TanStack Start smoke test verifies actual mounted endpoints, rendered identities/workspaces, logout, signup denial, and global cross-origin write rejection. Component tests exercise the rendered login, error/rate-limit feedback, role workspaces, and logout.

Local verification on 2026-11-14: `vp check` passed formatting, lint, and type checks; `vp run typecheck` passed; `vp test --run --passWithNoTests=false` passed **23 tests in 2 files** (17 integration tests and 6 rendered-form tests) against PostgreSQL 17; `vp run build` passed client and server production builds; `vp exec drizzle-kit check` passed migration-journal validation. The [F01 verification ledger](#f01-verification-ledger) maps requirements and AC/STS IDs to executed tests and records the tested revision and open acceptance gates. Live Cloud Run behavior remains outside this evidence.

## F01 verification ledger

Local execution on **2026-11-14**, by **Codex**, re-checked for [PR #24](https://github.com/thrxpt/habitarc/pull/24). Reviewed [issue #4](https://github.com/thrxpt/habitarc/issues/4), the [F01 contract](sprints/sprint-1/f01-accounts-and-authorization.md), and the approved Drizzle, Docker Compose, shadcn/ui, and three-test-boundary decisions. This re-check does not replace the required substantive student teammate review or integrated-release verification.

The tested implementation revision is [`1f484bf644217da5a1b8bd39b0944558cadba8cc`](https://github.com/thrxpt/habitarc/commit/1f484bf644217da5a1b8bd39b0944558cadba8cc). It includes private local-account setup, the Tailwind refactor, invalid-field feedback, softer green focus styling, CI, and the named migration advisory lock. The ledger refresh following that revision changes only `docs/auth.md`; application code, tests, dependencies, and CI configuration match the tested revision. Local execution and GitHub CI evidence are recorded separately below; neither constitutes deployed-release evidence.

### Requirement results

Test names below are exact. The commit, tester, and date columns reference the execution context above. PASS applies only to the stated local scope; whole-product requirements remain subject to later slices and release verification.

| Requirement ID | Feature / AC / STS | Actual test file / name or measurement | Execution status | Commit | Evidence | Tester | Date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-01, NFR-01 | F01 / AC-F01-1 / STS-F01-1 | [auth.integration.test.ts](../tests/auth.integration.test.ts): `two pre-provisioned Participants and a Program Manager sign in with server-owned identity`; `invalid credentials are generic for existing and unknown accounts`; `operator commands accept private stdin, support twelve-character passwords, and never print credentials`; `TanStack Start serves sign in, server-validated role workspaces, logout, and global write protection` | PASS (local) | Tested revision above | Local run below | Codex | 2026-11-14 |
| FR-02, BR-01, NFR-01 | F01 / AC-F01-2 / STS-F01-2 | [auth.integration.test.ts](../tests/auth.integration.test.ts): `only login, current session, and logout are mounted; signup, recovery, and role changes cannot bypass this`; `workspace authorization rejects anonymous and wrong-role calls and returns only the signed-in identity` | PASS (current workspace operations only) | Tested revision above | Local run below | Codex | 2026-11-14 |
| FR-01, NFR-01 | F01 / AC-F01-3 / STS-F01-3 | [auth.integration.test.ts](../tests/auth.integration.test.ts): `production cookies expire in seven days and logout revokes the session on both instances`; `session reads stay read-only, trusted POST renews at most daily, and expiry is shared` | PASS (local, two independent pools) | Tested revision above | Local run below | Codex | 2026-11-14 |
| FR-02, NFR-01 | F01 / AC-F01-4 / STS-F01-4 | [auth.integration.test.ts](../tests/auth.integration.test.ts): `cross-origin and missing-origin writes fail before credentials or logout are processed`; `the eleventh login in a minute is throttled across replicas and forged forwarding prefixes cannot evade it`; `concurrent login requests cannot exceed ten admissions across independent pools`; `local requests cannot choose their own IP and malformed production forwarding fails closed` | PASS (simulated proxy headers); live ingress INCOMPLETE | Tested revision above | Local run and deployment gate below | Codex | 2026-11-14 |
| BR-07 (account configuration), NFR-07 (local setup) | F01 / issue #4 provisioning | [auth.integration.test.ts](../tests/auth.integration.test.ts): `repeat provisioning and migration preserve existing passwords, identities, and sessions`; `invalid provisioning is rejected before creating any accounts`; `a rejected credential in a provisioning batch leaves no partially created accounts`; `local account generation is private, concurrent-safe, and preserves working credentials on reruns`; `local account generation rejects production, remote databases, and repository credential paths` | PASS (local); calendar behavior belongs to later slices | Tested revision above | Local run below | Codex | 2026-11-14 |
| FR-01 | F01 / AC-F01-1, AC-F01-3 / STS-F01-1, STS-F01-3 | [account-screen.test.tsx](../tests/account-screen.test.tsx): `invalid sign in gives generic feedback and clears the password for a retry`; `fields show native validation after interaction and clear it when corrected`; `submitting an empty form marks both required fields without sending a request`; `a valid sign in refreshes the server-validated workspace`; `a Program Manager sees their own identity and can sign out`; `throttled sign in explains how to retry` | PASS (rendered forms) | Tested revision above | Local run below | Codex | 2026-11-14 |

### Local run

PostgreSQL 17 Alpine ran healthy through Docker Compose at `127.0.0.1:55432`. The integration suite created and removed its own uniquely named database. No persistent accounts were reset during this re-check.

```text
vp install --frozen-lockfile
  Checked 528 installs across 709 packages (no changes).
vp check
  PASS (formatting, lint, and types).
vp run typecheck
  PASS (tsc --noEmit).
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/habitarc_auth_test vp test --run --passWithNoTests=false
  Test Files: 2 passed (2). Tests: 23 passed (23).
  Start: 22:29:59 Asia/Bangkok. Duration: 8.37s.
vp run build
  PASS (client and server production bundles).
vp exec drizzle-kit check
  PASS (migration journal).
git diff --check
  PASS.
```

The suite covers the approved boundaries: HTTP authentication with real PostgreSQL and two instances; private provisioning commands; and rendered account forms. The running TanStack HTTP journey additionally proves compatibility with the installed application toolchain. Production cookie flags are checked through HTTPS requests to the configured handler; this is not deployed HTTPS evidence.

### GitHub CI evidence

The `Validate` job passed on the tested implementation revision `1f484bf644217da5a1b8bd39b0944558cadba8cc`: [run 43610596605](https://github.com/thrxpt/habitarc/actions/runs/43610596605), completed on 2026-11-14 at 15:31:59 UTC. It used frozen dependencies and Compose PostgreSQL, then checked formatting/lint/types, the TypeScript project, migration history, all 23 tests, and the application build. The earlier PR-head evidence remains available in [run 43591916881](https://github.com/thrxpt/habitarc/actions/runs/43591916881) for `0b0cebc0de31b4d4f02f805e4c9cfde1eb7b8f25`; the newer run also covers the named-lock refactor.

Required-check enforcement was separately verified with [temporary PR #25](https://github.com/thrxpt/habitarc/pull/25). An intentional TypeScript syntax error [failed `Validate` in run 43592070147](https://github.com/thrxpt/habitarc/actions/runs/43592070147), and GitHub reported `mergeStateStatus: BLOCKED`. That PR was closed without merging and its temporary branch deleted. The CI work covers part of [issue #8](https://github.com/thrxpt/habitarc/issues/8); container image creation, GCP deployment, and deployed-release verification remain incomplete.

### Open acceptance gates

| Requirement / gate | Status | Remaining evidence |
| --- | --- | --- |
| NFR-01 / AC-F01-4 live proxy handling | INCOMPLETE | Verify actual managed Cloud Run ingress and appended client address under forged forwarding prefixes. Additional proxies require a reviewed policy. See [runtime policy](#runtime-and-trusted-client-addresses). |
| NFR-03 / NFR-04 delivered-screen accessibility and responsiveness | INCOMPLETE | Manual keyboard/focus/error announcement checks, automated accessibility results, 360px/1280px layouts, and 200% zoom. Rendered component tests do not prove these measurements. |
| NFR-07 / feature Definition of Done | INCOMPLETE | Substantive student teammate review, sprint-staging integration, and re-verification of the integrated/deployed release with its immutable commit and CI evidence. |

Future protected operations must extend STS-F01-2 with their own role and ownership cases. No cross-participant tracking operation exists in this slice. Other features retain the planned status in the [baseline traceability matrix](traceability.md); this ledger does not claim whole-product completion.

References: [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [TanStack integration](https://better-auth.com/docs/integrations/tanstack), [Drizzle node-postgres](https://orm.drizzle.team/docs/get-started-postgresql).
