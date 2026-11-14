# Authentication and operator tooling

Issue [#4](https://github.com/thrxpt/habitarc/issues/4) implements the F01 account boundary. Better Auth **1.7.23** uses Drizzle ORM **0.45.2**, Drizzle Kit **0.31.11**, and the `pg` connection driver. [ADR 0004](adr/0004-shared-drizzle-persistence.md) records why authentication and later features share Drizzle.

## Provision synthetic accounts privately

Run migrations first. Create a private UTF-8 JSON file outside the repository with permissions `0600`. Its array contains at least two distinct Participants and one Program Manager. Each object has `name`, `email`, `password`, and `role` (`participant` or `program-manager`); optional `timezone` defaults to `Asia/Bangkok`. Use unique synthetic email addresses and privately generated passwords of 12–128 characters. Timezones must be named IANA zones recognized by both the JavaScript runtime and PostgreSQL; `UTC` is also accepted.

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

Local verification on 2026-11-14: `vp check` passed formatting, lint, and type checks; `vp test` passed **19 tests in 2 files** against PostgreSQL 17; `vp run build` passed client and server production builds; `vp exec drizzle-kit check` passed migration-journal validation. Live Cloud Run behavior remains outside this evidence.

References: [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [TanStack integration](https://better-auth.com/docs/integrations/tanstack), [Drizzle node-postgres](https://orm.drizzle.team/docs/get-started-postgresql).
