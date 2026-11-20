# Habit setup

Issue [#6](https://github.com/thrxpt/habitarc/issues/6) implements the [F03 contract](sprints/sprint-1/f03-habit-setup.md). Participants select an active Activity Template, set a whole-number Daily Target from its minimum through its unit ceiling (1,440 minutes or 1,000,000 counts), and select one or more weekdays. The per-entry maximum does not limit the Daily Target. All seven weekdays means every day.

## Persistence and access

`createHabit` and `listHabits` are TanStack server functions. Both require a Participant session. The session supplies the owner; owner, start-date, and timezone fields sent by callers confer no authority. Reads filter by that owner. Program Managers retain template access without private Habit access. Expected field validation failures return a typed `invalid` result with HTTP 400 so field details survive TanStack serialization; the form associates those details with the inputs. Stale or unavailable Activity Templates return a typed `conflict` result with HTTP 409. Authentication and unexpected failures remain thrown errors.

Habit creation locks the selected Activity Template row before checking eligibility, its displayed version, and bounds, then locks the Participant row before checking existing tracking periods. PostgreSQL supplies today's date in the stored Account Timezone after both locks are acquired. One transaction inserts the Habit and its initial Goal Revision, effective from the start date. A failed revision leaves no Habit. The weekday Schedule uses seven bits, Monday first, with 127 meaning every day.

`archived_from` is the exclusive end of a Habit's tracking period. An archive beginning tomorrow still blocks creation today; a period that ended today permits a fresh Habit with a separate history. An existing active Habit is returned with its actual target and Schedule so concurrent creation or a retry can show the saved commitment.

Migration `0003_habits.sql` uses PostgreSQL's `btree_gist` extension and an exclusion constraint on owner, template, and date range. This prevents overlapping periods even for direct database writes. Run migrations with a role permitted to install the extension; PostgreSQL 17 provides it. The migration is additive and retains existing account/template data. Roll back application traffic to a compatible release if necessary; do not drop Habit tables to roll back an application release.

A template UPDATE/archive takes the same row lock as creation. A database trigger freezes unit and entry bounds once any Habit references the template, including an ended Habit. Description edits and archive remain possible. If an edit or archive wins the lock, a stale creation request is rejected. If creation wins, a waiting measurement edit is rejected. The [F08 contract](sprints/sprint-2/f08-template-and-habit-lifecycle.md#activity-template-maintenance) describes the manager controls.

## Goal revisions

Participants can open **Edit goal settings** under **Your Habits**. The workspace displays the current Daily Target and Schedule and any pending settings with their effective date. Tomorrow starts at midnight in the Account Timezone.

`reviseGoal` checks ownership and the Habit version under the Participant and Habit locks. It locks any existing pending Goal Revision before checking the effective date in the write. Saving a second edit for the same account date replaces the pending revision. A stale version or a form left open across midnight requires reloading the workspace before saving again. Retries with the same request key confirm the original save without changing the latest settings.

Migration `0005_habit-goal-version.sql` initializes existing Habits at version 1 and preserves their Goal Revisions. Each save updates the pending revision, Habit version, and mutation receipt in one transaction. Date-sensitive reads wait for in-flight tracking saves before sampling the account date. Today and Your Habits share that date, and History resolves the applicable Goal Revision for each date. The workspace refreshes at the next Account Timezone date boundary and when the window regains focus. It marks a draft for a prior date as expired. An eligible Activity Entry correction updates actual totals under that date’s existing target and schedule.

## Verification boundaries

The user approved tests through the Habit service with real PostgreSQL, running TanStack HTTP server functions, and rendered participant screens. Run the focused checks with:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/habitarc_auth_test vp test --run tests/habits.integration.test.ts tests/templates.integration.test.ts tests/workspace-habits.test.tsx
```

| Contract | Automated coverage |
| --- | --- |
| AC-F03-1 | Target 60 on a 5–45 minute template, persisted reads across independent pools, account-date start, initial Goal Revision, rollback on a failed revision, persisted HTTP reload |
| AC-F03-2 | Empty/invalid/duplicate weekdays, fractional/below-minimum/over-ceiling targets, both inclusive unit ceilings, missing/archived templates; associated form errors and retry behavior |
| AC-F03-3 | Concurrent creates, direct overlapping-period rejection, Participant tracking-lock serialization, tomorrow's pending archive, fresh history after the prior period ends |
| AC-F03-4 | Explicitly blocked edit/archive before creation and blocked measurement edit after creation; used-template freeze with descriptive edits/archive allowed |
| Privacy and presentation | Anonymous/wrong-role HTTP rejection, forged-owner rejection, another Participant's empty reads, private server rendering, labeled keyboard-operated inputs, every-day display, existing-Habit feedback |

Integration tests create and remove uniquely named disposable databases. Test-only barrier and failure triggers exercise actual maintenance calls and simulate storage failures. Tests observe actual lock waits before releasing barriers.

The Vitest checks establish service, HTTP, and rendered-component behavior. The Playwright suite below adds local Chromium E2E coverage. Deployed Cloud Run, independent acceptance, substantive human teammate review, other browser engines, full accessibility, and zoom measurements remain outside this evidence.

Local verification on 2026-11-15: `vp check`, `vp run typecheck`, `vp exec drizzle-kit check`, and `vp run build` passed. The complete suite (`vp test --run --passWithNoTests=false` with disposable PostgreSQL) passed **73 tests in 7 files**, with none skipped. Separate standards and specification reviews each found one issue: missing Participant tracking-lock acquisition and discarded server field errors. Both were corrected with failing-then-passing regression tests; HTTP validation results additionally verify that field details survive serialization.

## Playwright browser coverage

Run `vp exec playwright install chromium`, then `vp run test:e2e` with `TEST_DATABASE_URL` in `.env.local` or exported. An exported value takes precedence; no fallback to the development `DATABASE_URL` is used. Playwright owns a separate server on loopback port 4173 and a newly migrated disposable database with generated synthetic credentials. It never reuses a running application. Teardown stops its processes and drops only its generated database.

Three local Chromium tests pass: sign-in remains disabled before hydration with a POST fallback; a Program Manager publishes a 5–45 minute template and Participant A starts target 60 on Monday–Friday, reloads, sees duplicate prevention, switches accounts to check privacy, and signs back in to retrieve the Habit; a Participant corrects invalid target/weekday settings and uses the keyboard to choose every day on a 390px viewport. Account date/start-date assertions use `Asia/Bangkok` despite the browser's `America/Los_Angeles` timezone. These journeys supply local browser evidence for AC-F03-1 and supplementary validation/privacy presentation checks.

The first browser run exposed an enabled server-rendered sign-in form submitting a native GET before hydration. A JavaScript-disabled regression test reproduced it; the sign-in controls now wait for TanStack's hydration signal, and the form explicitly uses POST. The browser test waits for confirmed Habit persistence before reloading. CI installs Chromium and executes these tests after Vitest.

## F07 verification ledger

The initial implementation at `a9f20a3` was verified locally with PostgreSQL 17 and Chromium. `vp test --run --passWithNoTests=false` passed 103 tests in 10 files. `vp run test:e2e` passed all seven browser tests. `vp check`, `vp run typecheck`, `vp exec drizzle-kit check`, and `vp run build` passed.

The completed follow-up at `179d202` passed 104 Vitest tests and seven Chromium tests locally, and its [CI validation](https://github.com/thrxpt/habitarc/actions/runs/44585633925/job/135777667050) passed. The review fixes at `308e85f` passed 105 Vitest tests and seven Chromium tests locally on 2026-11-20. `vp check`, `vp run typecheck`, `vp exec drizzle-kit check`, and `vp run build` also passed for that revision.

| Requirement | Feature / AC / STS | Actual test | Status | Commit | Evidence | Tester | Date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-07, BR-03, BR-10 | F07 / AC-F07-1 / STS-F07-1 | Tomorrow's target and weekdays apply only from their effective date. Chromium History retains yesterday's 40 / 60 minutes after tomorrow's target changes to 30. | PASS | `a9f20a3` | [PostgreSQL integration](../tests/entries.integration.test.ts) and [Chromium](../e2e/activity-entries.spec.ts) | Codex | 2026-11-20 |
| FR-07, BR-04, BR-07, BR-10, NFR-01, NFR-02 | F07 / AC-F07-2 / STS-F07-2 | Concurrent edits conflict, same-day edits replace the pending revision, and a save waiting on that row expires at midnight. Includes target and weekday validation, retry, and HTTP 401/403/404 cases. | PASS | `a9f20a3` | [PostgreSQL and HTTP integration](../tests/entries.integration.test.ts) | Codex | 2026-11-20 |
| FR-07, BR-05, BR-10 | F07 / AC-F07-3 / STS-F07-3 | Adding a weekday creates obligations only from the effective date. Entry correction recalculates the original date's completion. | PASS | `a9f20a3` | [Unit test](../tests/entries.unit.test.ts) and [PostgreSQL integration](../tests/entries.integration.test.ts) | Codex | 2026-11-20 |
| FR-07, BR-03–05, BR-07, BR-10, NFR-01, NFR-02 | F07 / AC-F07-1–3 / STS-F07-1–3 | Full Vitest and Chromium suites, including concurrent saves, history, expiry, delayed refresh, and consecutive account midnights. | PASS | `179d202` | [CI validation](https://github.com/thrxpt/habitarc/actions/runs/44585633925/job/135777667050) and local runs | Codex | 2026-11-20 |
| FR-07, BR-03, BR-04, BR-07 | F07 / AC-F07-2 / STS-F07-2 | Goal validation uses a unit-neutral preliminary error and template-specific bounds. Workspace refresh accounts for 23-hour and 25-hour Los Angeles DST days. | PASS | `308e85f` | [Goal validation integration](../tests/entries.integration.test.ts) and [DST unit test](../tests/tracking.unit.test.ts) | Codex | 2026-11-20 |

Teammate review, sprint integration, deployed verification, and independent acceptance remain INCOMPLETE.
