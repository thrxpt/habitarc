# Habitarc system design

Status: accepted implementation design following user confirmation of Q25. This document does not claim these components exist or that the integration spike has passed. The inspected repository contains only the TanStack Start starter.

## Architecture and ownership

Use the existing TanStack Start application as a modular monolith. React routes render the product; authenticated server functions own application operations; PostgreSQL owns durable data and transactional concurrency. Keep date/progress calculations in a small domain module shared by Today, history, Streaks, and reports. Do not introduce separate microservices, queues, background reminder workers, or generic repository interfaces with one implementation.

Suggested responsibilities, to place within the existing source tree as features are implemented:

- Authentication configuration and session lookup: library integration plus explicit application role checks.
- Tracking rules: eligibility, applicable Goal Revision, numerical limits, completion, Streaks, and reporting periods. Pass a server-derived account date/time into calculations so tests can exercise boundaries deterministically.
- Tracking operations: transactions, ownership-scoped queries, validation, request deduplication, and mutation conflicts.
- Template operations: manager authorization, template validation, used-template immutability, and retirement.
- Routes/components: accessible forms, pending/error/empty states, and rendering server-authoritative results.

Browser input never determines role, owner, trusted current date, or derived totals. Route navigation guards improve usability; every server operation independently authenticates and authorizes access.

## Authentication design

Use Better Auth with its PostgreSQL adapter and documented TanStack Start integration, subject to an early compatibility spike against the installed toolchain. This adds a maintained dependency instead of implementing password/session cryptography. Pin the selected version; no compatibility claim is established by this plan.

- Mount the library handler at `/api/auth/$`. Use its client for login/logout so handler-level security and rate limiting run.
- Enable email/password login and disable signup in the serving configuration. No recovery/invitation/admin plugin endpoints are part of this release.
- Provision synthetic accounts through an operator-only script using a separate, unmounted provisioning configuration and supported credential APIs. Never manipulate password hashes manually. Production account provisioning reads secrets from private input, not committed defaults or logs; rerunning setup must not reset existing passwords or erase tracking data.
- Use a server-owned application role and fixed Account Timezone; client requests cannot assign either. A Program Manager is not a library administrator.
- Accepted session policy: library-managed seven-day rolling expiry with renewal no more frequently than daily, database validation, and cookie-session caching disabled so logout/revocation is observed across instances. Retain HttpOnly/Secure/SameSite=Lax production cookies, trusted-origin checks, and explicit production base URL.
- Protect application server-function mutations against cross-origin requests as well; auth-handler protections alone do not cover them. Keep reads side-effect free.
- Use database-backed login throttling across Cloud Run instances. Limit: 10 login attempts per trusted client IP per minute, with a generic authentication failure and a clear rate-limit response. Verify the trusted proxy/IP chain before trusting forwarding headers. Minimum new password length: 12 characters; use generated credentials for shared course demos.
- Test expiry, revoked sessions, missing cookies, direct backend requests, role tampering, cross-user identifiers, signup denial, cross-origin writes, and replica-wide throttling. Never persist a bearer token in browser local storage.

Official references: [TanStack integration](https://better-auth.com/docs/integrations/tanstack), [PostgreSQL](https://better-auth.com/docs/adapters/postgresql), [email/password](https://better-auth.com/docs/authentication/email-password), [sessions](https://better-auth.com/docs/concepts/session-management), [security](https://better-auth.com/docs/reference/security), and [rate limiting](https://better-auth.com/docs/concepts/rate-limit).

## Data model

Names describe responsibilities, not a frozen SQL migration. Use foreign keys, integer/check constraints, indexes, and versioned migrations. Auth-owned tables follow the pinned library schema rather than a duplicate custom session model.

| Record | Essential data and constraints |
| --- | --- |
| Auth user/credential/session/rate-limit records | Library schema; application role and valid IANA Account Timezone are server-owned. At least two Participants and one Program Manager in synthetic demo setup |
| Activity Template | ID, name, description, unit, entry minimum/maximum, archive timestamp, concurrency version. BR-02 constraints. Preserve every referenced template; no destructive deletion UI |
| Habit | ID, owner ID, template ID, start date, optional archive-effective date, optional reminder local time, concurrency version. Archive date is exclusive: start ≤ eligible date < archive date |
| Goal Revision | Habit ID, effective-from date, Daily Target, nonempty weekday set. Unique Habit/effective-from. Initial revision starts on Habit start date; only tomorrow's pending revision may be replaced |
| Activity Entry | ID, Habit ID, activity date, amount, created/updated instants, concurrency version. Whole-number amount; date stored as the participant's explicit calendar date, not inferred later from a creation timestamp |
| Mutation receipt | Actor ID, request key, operation, normalized payload fingerprint, outcome reference/status. Unique actor/request key. Retain receipts across deletion so retrying an old create cannot resurrect an entry |

Indexes support owner-scoped Habits, Habit/date entries, template-use lookup, revision resolution by date, and auth/session expiry. Reports derive totals from source entries and revisions; do not introduce independently editable totals or Streak counters that can drift.

Account Timezones are fixed; record event instants separately in UTC. Use one authoritative date/time calculation per request, including midnight eligibility checks. Local Reminder comparison needs no background scheduler: an elapsed local time on the current date is sufficient, including after a DST clock jump. Test an alternate IANA timezone and DST boundaries despite Bangkok being the default.

## Transactions and conflicts

- All participant tracking mutations serialize through a locked participant row before the affected Habit row. This intentionally modest approach fits course-scale traffic and gives one clear place to protect daily ceilings, revisions, archives, and the one-active-Habit rule. Keep transactions short; avoid external calls inside them.
- Habit creation also locks the chosen template before participant tracking locks. Manager edits/archive take the template lock, so a template cannot be edited as unused while a concurrent Habit begins using it. Keep this lock order consistent. Once used, unit/bounds remain immutable without a new versioning subsystem.
- Check overlapping active periods while holding the participant lock; a pending archive tomorrow still occupies today's active slot. Do not rely on a partial unique index whose predicate depends on the moving current date.
- Authenticate/authorize before looking up or replaying an actor's receipt. A retry with the same key and payload returns the already-applied outcome; reusing a key with a different payload fails as a conflict. Validate and persist the mutation and receipt atomically.
- Edit requests carry the last-seen entry/Habit version. A stale version returns a conflict and preserves the newer record. For entry date edits, both old and destination dates must remain eligible; subtract the old amount and validate both affected totals in one transaction. Deletes are retry-safe.
- A deleted entry's receipt remains; a retry reports the operation as previously applied and the entry as subsequently deleted. It must not recreate it.
- After an applied mutation, return or refetch authoritative totals/history. If a response is lost, offer retry with the same request key. Never present an unconfirmed write as saved.

## Date and history calculations

For a requested date, find the latest Goal Revision whose effective-from date is not after it. That date has an obligation only if it is inside the Habit tracking period and its weekday is selected. Sum eligible stored entries independently of whether the date is scheduled.

Completion is total ≥ target on scheduled dates. Percentages use that date's target; visual fill is capped but numeric percentage is not. A future date is never missed. Empty scheduled dates become missed after their account-calendar date ends.

Current Streak ends at the last completed scheduled date before or on today; an incomplete scheduled today is ignored until it ends, but an earlier missed scheduled date breaks the run. Off-schedule dates never affect the count. The longest Streak is derived across the Habit tracking period. On archived Habits, display current Streak as not applicable and retain longest Streak/history; a new Habit never inherits it.

Report periods are the seven or thirty calendar dates immediately before today, intersected with the tracking period. Count scheduled dates using their revisions. Use “Not scheduled” for an empty completion-rate denominator and show amounts per Habit. Display lifetime current/longest Streaks separately and label them clearly so they are not mistaken for window-only counts.

Archiving a Habit makes tomorrow the exclusive end date. Today's target remains due. A pending Goal Revision effective on/after the archive date has no applicable dates; reject further future revision edits on that pending-archive Habit. Do not reactivate archived Habits or templates in this release; existing Habits can continue using an archived template. Preserve historical rows and allow only eligible entry corrections to dates before the archive date.

## Screens and application contracts

Use a small responsive application shell with current identity and logout. Participant navigation is Today, History, and Progress; the template picker and Habit settings are contextual flows. Manager navigation is Templates. Avoid exposing backend/infrastructure terminology in these product screens.

| Surface | Operations and expected behavior |
| --- | --- |
| Login | Email/password, generic invalid-credential feedback, pending/rate-limited states; role-directed landing |
| Participant Today | Scheduled Habits, totals/target, add-entry action, separate unscheduled activity section; reminder indicator; empty-state template picker |
| Create Habit | Browse active templates; choose target/weekdays; display unit/range, start date, account timezone, and an existing active Habit if one prevents creation |
| Entry form/history | Amount/date inputs, range/window guidance, chronological entries, edit/delete for eligible rows, read-only older rows; reconfirm destructive deletion |
| Habit settings | Show current and pending target/schedule, explain tomorrow's effect, optional reminder time, archive confirmation and effective date |
| Progress | Select Habit and 7/30-date period; per-date amounts and completion states, textual equivalents for charts, completion counts/rate, lifetime Streak labels; separate Today |
| Manager Templates | Create, descriptive edits, unused-template measurement edits, archive confirmation; clearly explain frozen measurement fields and archive effects |

Use typed server functions rather than creating a second public REST API. Operations are `listTemplates`, `createTemplate`, `updateTemplate`, `archiveTemplate`; `listHabits`, `createHabit`, `reviseGoal`, `setReminder`, `archiveHabit`; `listEntries`, `createEntry`, `updateEntry`, `deleteEntry`; and `getToday`, `getHistory`, `getProgress`. Inputs use explicit IDs, dates, amounts, expected versions, and request keys where applicable. Resolve owner from session; never accept it as authority from the browser.

Common outcomes: unauthenticated (sign in), wrong role (forbidden), missing/not-owned private record (indistinguishable not found), invalid input (field errors), stale/conflicting mutation (refresh/retry guidance), and temporary service failure (safe retry with unchanged request key). Bound and validate query ranges/pagination. Server-side limits and authorization apply even when the UI hides an action.

UI details above, including permanent template retirement, no reporting export, date-edit conflict behavior, and archived-current-Streak presentation, were accepted with the complete baseline in Q25.

## Deployment and release

Build a production Docker image using the pinned toolchain and official TanStack Start production build conventions; prove the exact entrypoint in the initial deployment spike. Bind the Cloud Run port, keep secrets out of the image, and keep durable records/sessions out of its disposable filesystem. Local integration tests use real PostgreSQL in a disposable database.

Use one Cloud Run service and one ordinary single-zone Cloud SQL PostgreSQL instance in the same supported region. Choose the smallest configuration that passes the agreed checks after comparing current regional pricing. Initial planning limits: zero minimum Cloud Run instances, maximum two instances, and at most five DB connections per application instance, subject to measured headroom for rollout overlap, migration, and administration. Do not treat those limits as a billing cap.

Use a dedicated runtime service account with Cloud SQL connection permission and access only to required Secret Manager secrets. Prefer the supported Cloud SQL connector/socket integration; database credentials and application authorization remain necessary. Use GitHub OIDC/workload identity for deployment rather than committing service-account keys. Region, project, precise instance size, and trial expiry are deployment prerequisites.

Required CI sequence: install pinned dependencies; generate route/build artifacts as needed; `vp check`; `vp test --run` with unit and real-DB integration suites; selected browser/E2E and accessibility checks; `vp run build`; build the image. Make failed required checks block staging and main merges. Capture one deliberately failed check on a temporary branch for Lab 5. CI tests must fail when no required tests are discovered.

After a reviewed release reaches main, publish an immutable image, run migrations once in a controlled job, deploy that image, and verify the critical journey and retrieval of preexisting data. Record commit, tag, CI run, image digest, deployment revision, test counts, and relevant screenshots. Manual pipeline approval is allowed. Never run migrations independently on each starting app instance.

Use backward-compatible additive migrations where possible. Before risky schema changes, verify a backup and a reviewed recovery plan. Roll back application traffic to a compatible previous revision; do not assume database rollback is safe or automatic. Recovery drills restore into an isolated database and never overwrite the assessed data.

Keep the exact assessed release reachable through grading. Do not silently replace its tag or deploy incompatible changes over it. Cost review includes build artifacts, backups, secrets, logs, and networking, not just application traffic. Daily backup retention and credit runway must cover the instructor's access period; confirm that period before promising availability.
