# Verification context and submission status

Prepared on 15 November 2026 (Asia/Bangkok) by Codex under the team's instruction to complete Deliverable 1. Students: **67070501063 Theeraphat Jaingam** and **67070501058 Chanya Poolketkij**. Repository: https://github.com/thrxpt/habitarc. Theme: Habit and Activity Tracking for student study/movement routines.

**Submission edition — reviewed main release.** The assessed and freshly tested application commit is `9be6a80041c732cac97e20b87c83dfe8153f42ce` (main). Chanya Poolketkij (`chanya06`) approved release PR #32 at 16:27:21 UTC and merged it at 16:27:43 UTC on November 15, 2026 (23:27 Asia/Bangkok). PR #31's preparation/cursor correction was independently approved and merged into sprint staging first. This report identifies the immutable release commit rather than relying on a moving branch or inventing a tag.

The exact runtime/test/migration/config files match the source-hash manifest. The submission refresh changes documentation, evidence snapshots and PDF packaging; it adds no product behavior to the reviewed release. The current main CI run 43735599569 passed at this same release commit. Fresh local results below also execute this exact runtime version with real PostgreSQL and generated synthetic accounts.

The user's deadline corrections are Deliverable 1 on November 15 and Lab 5 on November 22, 2026. PR #30 remains separate delivery preparation, refreshed to staging at `5427ae6`, with passing CI. Its 98-test/Docker result is not counted as verification of this assessed main release, which has 92 Vitest and 4 Chromium tests. No live GCP deployment is claimed.

**Remaining evidence gap:** a teammate's clean setup/reproduction result for AC-F05-1 has not been recorded. Code/release review is complete; that missing human execution is disclosed in the results table and limitations. Agent-run operator tests and repeat setup are supporting evidence, not a substituted student observation. Issue #9 remains open for this and its Lab 5 criteria.

## Build and automated execution

All runs use the pinned Vite+ toolchain (local vite-plus 1.6.0, Vitest 5.1.0), Node 26.13.1, Bun 1.4.4, PostgreSQL 17, and synthetic generated accounts. The test database creator connects through `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/habitarc_auth_test`; each integration/E2E fixture creates and later drops only its uniquely named disposable database. A local PostgreSQL Compose service already occupied port 55432, so the new worktree's attempted Compose start reported a port conflict; the existing healthy loopback service was used without stopping/resetting it. This is an environment setup event, not a hidden failed test.

| Command | Actual result | Retained output |
| --- | --- | --- |
| `vp install` | PASS; pinned dependencies installed, prepare hook executed | Tool execution; no dependency changes |
| `vp check` | PASS formatting, lint, type-aware checks | evidence/check.log |
| `vp run typecheck` | PASS TypeScript project | evidence/typecheck.log |
| `vp exec drizzle-kit check` | PASS migration journal | evidence/migrations.log |
| `vp test --run --passWithNoTests=false --reporter=verbose` | 92 passed; 0 failed; 0 skipped, across 10 files | evidence/vitest.log; full exact names |
| `vp run test:e2e` | 4 passed; 0 failed; 0 skipped, Chromium | evidence/playwright.log |
| `vp run build` | PASS client and server production bundles | evidence/build.log |

The final suite includes the new F02 calendar-cursor boundary regression (earlier Sprint 1 run: 91 tests). Playwright and Vitest are distinct suites. Selected raw excerpts below preserve commands/counts rather than inferring success from a test file's presence. Non-failing tool color warnings are retained in the logs.

### AC-to-execution results

All rows inherit the tested main release, execution date, agent tester, and evidence paths above. `AC-Fxx-n` pairs one-to-one with `STS-Fxx-n`. Local PASS is a result at its stated test boundary; it does not imply whole-product completion, live cloud success, or human acceptance. Requirement IDs not allocated to Sprint 1 retain Part B's future allocation.

| AC / STS | Requirements | Actual tests / measurement | Result and boundary |
| --- | --- | --- | --- |
| AC-F01-1 / STS-F01-1 | FR-01; NFR-01 | tests/auth.integration.test.ts: two pre-provisioned Participants and a Program Manager sign in with server-owned identity; invalid credentials are generic for existing and unknown accounts. e2e/habit-setup.spec.ts: a Participant starts a private weekday Habit and retrieves it after reload and a new sign-in. | PASS integration + Chromium |
| AC-F01-2 / STS-F01-2 | FR-02; BR-01; NFR-01 | tests/auth.integration.test.ts: only login, current session, and logout are mounted; signup, recovery, and role changes cannot bypass this. tests/entries.integration.test.ts: TanStack Start enforces Today and entry recording authorization, idempotency, conflict serialization, and reload persistence over HTTP. | PASS currently implemented operations |
| AC-F01-3 / STS-F01-3 | FR-01; NFR-01 | tests/auth.integration.test.ts: production cookies expire in seven days and logout revokes the session on both instances; session reads stay read-only, trusted POST renews at most daily, and expiry is shared. | PASS two real DB pools |
| AC-F01-4 / STS-F01-4 | FR-02; NFR-01 | tests/auth.integration.test.ts: cross-origin and missing-origin writes fail before credentials or logout are processed; the eleventh login in a minute is throttled across replicas and forged forwarding prefixes cannot evade it; concurrent login requests cannot exceed ten admissions across independent pools. | PASS local/simulated headers; live ingress pending Lab 5 |
| AC-F02-1 / STS-F02-1 | FR-03; BR-02/12 | tests/templates.integration.test.ts: `Program Manager creates an Activity Template and Participant sees persisted details across independent pools`; `bounded keyset pagination returns every created template beyond 200 without skips or duplicates`. e2e/habit-setup.spec.ts: a Participant starts a private weekday Habit and retrieves it after reload and a new sign-in (manager creation then Participant selection). | PASS PostgreSQL + Chromium |
| AC-F02-2 / STS-F02-2 | FR-03; BR-02 | tests/templates.unit.test.ts: rejects unsupported units, non-integer bounds, zero/negative bounds, inverted ranges, and ceiling overflows; template cursors reject normalized impossible UTC dates while preserving valid microseconds. tests/templates.integration.test.ts: `invalid template definitions are rejected without partial writes and database constraints enforce bounds`. | PASS unit + real DB |
| AC-F02-3 / STS-F02-3 | FR-02/03; NFR-01 | tests/templates.integration.test.ts: `Participants cannot create templates directly through the template service`; `TanStack Start enforces template authorization, validation, and persisted reload visibility over HTTP`. | PASS integration |
| AC-F03-1 / STS-F03-1 | FR-04; BR-01/03/05/07/08 | tests/habits.integration.test.ts: Participant starts a persisted scheduled Habit with target 60 on a 5–45 minute template; Account Timezones determine start dates across the date line and caller timezone fields are ignored. e2e/habit-setup.spec.ts: private weekday Habit/reload/sign-in journey. | PASS integration + Chromium |
| AC-F03-2 / STS-F03-2 | FR-04; BR-03/04/12 | tests/habits.integration.test.ts: `invalid Habit settings ... leave no partial Habit` (13 parameterized cases; exact expanded names in the retained log); missing/archived templates. e2e/habit-setup.spec.ts: a narrow-screen Participant corrects invalid settings and starts an every-day Habit. | PASS integration + rendered form + Chromium |
| AC-F03-3 / STS-F03-3 | FR-04; BR-11; NFR-02 | tests/habits.integration.test.ts: concurrent creates return one active Habit and direct overlapping periods are rejected; tomorrow's pending archive blocks today, and an ended Habit permits a fresh history. | PASS real DB concurrency |
| AC-F03-4 / STS-F03-4 | FR-04; BR-12; NFR-02 | tests/habits.integration.test.ts: a measurement edit waiting behind Habit creation cannot change the newly used template; template-lock race cases. Manager edit/archive is simulated using real SQL because F08 APIs are not implemented. | PASS storage invariant; F08 APIs not claimed |
| AC-F04-1 / STS-F04-1 | FR-05; BR-09/13 | tests/entries.integration.test.ts: AC-F04-1: multiple deliberate entries accumulate and show overachievement with fill capped at 100%. e2e/activity-entries.spec.ts: Participant records durable progress and safely retries lost responses and failed saves. | PASS integration + Chromium |
| AC-F04-2 / STS-F04-2 | FR-05; BR-06; NFR-02 | tests/entries.integration.test.ts: AC-F04-2: concurrent idempotent retry counts once, payload mismatch conflicts, and distinct keys create distinct entries; AC-F04-2: receipt and entry persist atomically, and auth/ownership run before receipt lookup. | PASS PostgreSQL concurrency |
| AC-F04-3 / STS-F04-3 | FR-05; BR-05/07/08/09 | tests/entries.integration.test.ts: AC-F04-3: account midnight, 7-day window, pre-start, post-archive, off-schedule, and DST/timezone independence. tests/entries.unit.test.ts: entry date eligibility enforces today, 6-day lookback, startDate, and exclusive archivedFrom. | PASS unit + integration |
| AC-F04-4 / STS-F04-4 | FR-05; BR-03/04; NFR-02 | tests/entries.integration.test.ts: AC-F04-4: concurrent ceiling writes cannot exceed 1,440 minutes or 1,000,000 counts, and rejected writes leave no receipt. | PASS real DB race + unit bounds |
| AC-F04-5 / STS-F04-5 | FR-05; NFR-04 | e2e/activity-entries.spec.ts: Participant records durable progress and safely retries lost responses and failed saves. tests/workspace-today.test.tsx: uncertainty/retry/form-close cases. | PASS Chromium + rendered form; 360px no overflow |
| AC-F05-1 / STS-F05-1 | FR-12; NFR-07 | tests/auth.integration.test.ts: repeat provisioning and migration preserve existing passwords, identities, and sessions; local account generation is private, concurrent-safe, and preserves working credentials on reruns. README command runs below. | PARTIAL: agent run passes; teammate clean setup/acceptance still required |
| AC-F05-2 / STS-F05-2 | FR-12; NFR-07 | Historical PR #25: required CI Validate deliberately failed in run 43592070147; mergeStateStatus BLOCKED; branch closed without merge. Source: docs/auth.md and GitHub run/PR. | PASS historical CI gate; no new deliberate failure |
| AC-F05-3 / STS-F05-3 | FR-12; NFR-06/07 | GCP deployed-image restart/retrieval, immutable digest and backup evidence. | NOT EXECUTED here; separate Lab 5 gate |
| AC-F05-4 / STS-F05-4 | NFR-08 | Trial credit/expiry, cost, IAM, migration runner and recovery operational review. | NOT EXECUTED here; separate Lab 5 gate |

## Selected program demonstrations

All images were freshly captured by the existing Chromium tests against the assessed main release identified above. Accounts use Asia/Bangkok while Chromium uses America/Los_Angeles. Screenshots show synthetic data, not secrets. Cropped surfaces are captured directly by Playwright locators for readable evidence; captions state role, starting conditions, steps, expected and actual result.

### DEMO-01: normal journey and saved retrieval

F02/F03/F04; AC-F02-1, AC-F03-1, AC-F04-1/2/5. A Program Manager signs in and creates a Focused Study template (minutes, 5–45 per entry). Participant C signs in, starts an every-day Habit with target 60, saves two deliberate 25-minute entries, reloads and observes total 50. The third +25 is committed but its response is deliberately dropped; close/reopen preserves the request, and Retry save confirms the already stored result. Reload retrieves exactly three entries, total 75, actual percentage 125%, visual fill 100%. Expected and actual: no duplicate from the retry, persisted completed progress. The same automated journey simulates a separate 503, verifies unchanged storage in a fresh tab, then retries the identical request and retrieves total 85/four entries.

![Persisted Today progress](evidence/persisted-progress.png)

A separate private weekday-Habit journey starts target 60 with Monday–Friday, reloads, checks the existing-Habit rejection, signs out/switches accounts, then signs in again to retrieve the same Habit. Expected and actual: private persisted target/Schedule, with no second active Habit. Backend tests also read persisted rows through an independent pool, proving the UI is backed by PostgreSQL rather than browser-only state.

![Persisted Habit](evidence/persisted-habit.png)

### DEMO-02: meaningful rule/boundary rejection

F03/F04; AC-F03-2, AC-F04-4. On a 5–45 minute template, Participant B submits Daily Target 4.5 and no weekdays. Expected and actual: associated whole-number/minimum and nonempty-weekday errors; no Habit is created. Correcting target to 60 and selecting every weekday by keyboard succeeds and survives reload. The pictured error is UI evidence; corresponding real-database tests submit invalid targets/ranges directly and verify no partial Habit/revision. F04's backend race below separately proves atomic rejection when two writes would exceed the daily ceiling.

![Rejected Habit settings](evidence/rejected-habit-settings.png)

### DEMO-03: login, logout, and backend forbidden operations

F01/F04; AC-F01-1/2/3, AC-F02-3. Participant A submits an incorrect password. Expected and actual: generic error without identity disclosure. Password is cleared before capture. A valid login displays the server-owned identity; Sign out returns the login form. Tests reuse revoked cookies across independent auth instances and reject them; expiry and cookie attributes are asserted separately.

![Invalid login](evidence/invalid-login.png)

![Signed out](evidence/signed-out.png)

The screenshot of a missing manager control is not the authorization proof. The passing HTTP integration journey calls the actual generated TanStack server functions: anonymous getToday/createEntry -> 401; manager getToday/createEntry -> 403; Participant B writing A's Habit -> 404; cross-origin write -> 403; invalid amount 4 on bounds 5–45 -> 400 with field errors. Auth integration additionally tests disabled signup/role mutation, missing-origin writes, shared login throttling, expiry, and logout/revocation. Actual assertions and passing test output are embedded below.

## Selected actual automated test excerpts

### Important domain rule: concurrent daily ceiling

Source: tests/entries.integration.test.ts, test `AC-F04-4: concurrent ceiling writes cannot exceed 1,440 minutes or 1,000,000 counts, and rejected writes leave no receipt`. Setup creates a Participant Habit using a 5–45 minute template, then stores 31 * 45 + 35 = 1,430 minutes in the real database. Two independent service/pool instances race +10 writes with distinct keys. The excerpt below is copied from the actual test; setup commentary is this caption rather than invented test code.

```typescript
const keyOne = randomUUID();
const keyTwo = randomUUID();
const results = await Promise.allSettled([
  entries.createEntry(participantA, {
    habitId: minuteHabit.id,
    activityDate: today,
    amount: 10,
    requestKey: keyOne,
  }),
  otherEntries.createEntry(participantA, {
    habitId: minuteHabit.id,
    activityDate: today,
    amount: 10,
    requestKey: keyTwo,
  }),
]);

const fulfilled = results.filter((result) => result.status === "fulfilled");
const rejected = results.filter((result) => result.status === "rejected");
expect(fulfilled).toHaveLength(1);
expect(rejected).toHaveLength(1);
expect(fulfilled[0]?.value.dailyTotal).toBe(1440);
expect(rejected[0]?.reason).toMatchObject({ status: 409 });

const todayAfterRace = await otherEntries.getToday(participantA);
expect(todayAfterRace.scheduled[0]?.progress.dailyTotal).toBe(1440);

// Rejected race contender left no receipt.
const receipts = await pool.query<{ count: string }>(
  "SELECT count(*) FROM mutation_receipt WHERE actor_id = $1 AND request_key IN ($2, $3)",
  [participantA.id, keyOne, keyTwo]
);
expect(Number(receipts.rows[0]?.count)).toBe(1);
```

Expected and actual: exactly one write succeeds at 1,440; one conflicts with 409; stored total remains 1,440 and only one race receipt exists. This test passes in the final 92-test run.

### Role/ownership restriction through the actual HTTP application

Source: tests/entries.integration.test.ts, `TanStack Start enforces Today and entry recording authorization, idempotency, conflict serialization, and reload persistence over HTTP`. Setup starts TanStack with the real isolated PostgreSQL database, signs in A/B/manager through `/api/auth/sign-in/email`, creates the template as manager and Habit as A, and retrieves the server's account date. `callServerFn` discovers actual generated transport IDs and deserializes the real response.

```typescript
expect(
  await callServerFn("getToday", {
    method: "GET",
    cookie: managerCookie,
  })
).toMatchObject({ status: 403 });

expect(
  await callServerFn("createEntry", {
    method: "POST",
    cookie: managerCookie,
    data: {
      habitId,
      activityDate: todayDate,
      amount: 25,
      requestKey: "m1",
    },
  })
).toMatchObject({ status: 403 });

expect(
  await callServerFn("createEntry", {
    method: "POST",
    cookie: otherCookie,
    data: {
      habitId,
      activityDate: todayDate,
      amount: 25,
      requestKey: "b1",
    },
  })
).toMatchObject({ status: 404 });
```

Expected and actual: manager access is 403; cross-Participant write is 404 without revealing private data. This is a passing HTTP/PostgreSQL test, not a mocked role selector. Complete setup/remaining assertions and names are retained in source/logs.

## Genuine TDD evidence and version history

The baseline contract/test-design files were recorded at `07f143a` (14 Nov 2026, 11:13:10 +07), with course alignment `03f2d40` (12:51:39 +07), before F01 implementation `41e0494` (14:39:33 +07). F03 implementation `5d93c31` followed on 15 Nov at 05:35:54 +07; browser design/verification expanded at `743b2a6` (14:51:17 +07). PR #27's review found confirmation/ARIA defects; the author's response reports both regressions failing before correction in `865310f`, and the teammate explicitly verified those corrections before approval. The original red terminal output for that historical feature work was not retained in this package; review testimony is not relabeled as a captured red log.

This preparation found the already-reviewed F02 cursor-date defect: JavaScript normalized 30 February and accepted it until PostgreSQL failed the cast, producing 503 instead of validation failure. This is a real validation correction under F02's bounded/predictable-error contract. The regression was written and executed first at the existing public `validateTemplateListQuery` boundary; its real red log and test were committed at `f3841fd`. The minimal correction then compared parsed UTC calendar components while retaining original microsecond precision. The same test passed and was committed at `87ad604`. Invalid 30-February/non-leap 29-February/31-April/24:00 cursors reject; valid leap-day and microsecond cursors remain accepted.

These red/green runs occurred now, on 15 Nov, without backdating or reconstructing earlier feature evidence. No claim is made that this pagination regression alone proves original domain-rule TDD for F03/F04. Earlier rule-test red logs remain a disclosed evidence limitation.

### tdd-red.log

```text
 FAIL  tests/templates.unit.test.ts > template cursors reject normalized impossible UTC dates while preserving valid microseconds
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  22:19:33
   Duration  137ms (tests 42%, transform 37%, import 16%, worker 5%)

```

### tdd-green.log

```text
 ✓ tests/templates.unit.test.ts > template cursors reject normalized impossible UTC dates while preserving valid microseconds 0ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  22:19:52
   Duration  150ms (transform 53%, tests 28%, import 14%, worker 5%)

```

## Engineering workflow and teammate participation

Source: GitHub API snapshot evidence/github.json, captured at its recorded UTC timestamp; repository history retains authorship and actual commit dates. Feature/preparation branches target sprint-1; release PR #32 targets main. PR authors and reviewers are different GitHub accounts. The actual approved staging and main merge records below establish integration, independently of Issue state.

| Feature / Issue | Branch and PR | Author -> reviewer | Substantive review and integration |
| --- | --- | --- | --- |
| F01 / #4 | feat/auth-workspaces; PR #24 | thrxpt -> chanya06 | Ledger/version drift, dangling skills, named constants/shared components corrected; approved 14 Nov 17:59:44 UTC; merged sprint-1 as e00dd69 |
| F02 / #5 | feat/activity-templates; PR #26 | chanya06 -> thrxpt | First-200-template truncation blocked review; bounded keyset pagination + Load more corrected; approved 14 Nov 21:42:30 UTC; merged b63a7b1. Calendar cursor P3 was corrected in #31 and is included in the assessed main release |
| F03 / #6 | feat/scheduled-habits; PR #27 | thrxpt -> chanya06 | Saved confirmation became duplicate warning after refresh; dangling ARIA IDs. Both fixed 865310f and explicitly verified in approval 15 Nov 10:02:47 UTC; merged 0a40e39 |
| F04 / #7 | feat/activity-entries; PR #28 | chanya06 -> thrxpt | Lost-response requests were discarded on close; separate failed-save coverage missing. Fix d13929e retains retries; original author hydration fix 454c6a3 retained; approved 15 Nov 13:47:15 UTC; merged 0f24d8f |
| Preparation / #9 | docs/complete-deliverable-one; PR #31 | thrxpt -> chanya06 | Verified UTC cursor validation, engineering package and passing CI at 35e628d; approved 15 Nov 16:11:24 UTC; merged into sprint-1 as 2a41472 |
| Main release / #9 | sprint-1 -> main; PR #32 | thrxpt -> chanya06 | Verified complete staging integration, migrations/core workflows and CI; approved 15 Nov 16:27:21 UTC; merged main as 9be6a80. Clean teammate setup and Lab 5 remain open |

### Selected readable review evidence

PR #26; thrxpt; APPROVED; 2026-11-14T21:42:30Z; reviewed bbee3c3d3f7e45222f831ef1a65707e6a210641d.

Re-reviewed commits 3674362 and bbee3c3 and the author's follow-up comment.

The previous pagination blocker is resolved: bounded keyset pagination and the Load more control make templates beyond the first 200 accessible. The schema checks now use the shared validation constants. No blocking findings remain.

Nonblocking P3 — src/templates.ts:265: Date.parse normalizes impossible dates such as 2026-02-30T00:00:00.000000Z, allowing them through cursor validation. PostgreSQL rejects the timestamp cast, which the error middleware maps to 503 rather than 400. Consider checking calendar components while preserving microsecond precision. Normal server-generated cursors are unaffected.

Verification: GitHub Actions CI run 17 passed for bbee3c3d3f7e45222f831ef1a65707e6a210641d. I also ran the current cursor validator locally and confirmed PostgreSQL rejects the impossible date using a read-only SELECT. I did not rerun the full test suite locally.

Approved.

PR #27; chanya06; APPROVED; 2026-11-15T10:02:47Z; reviewed 865310fa58e194ede20a4a8b511ebccd57d29f77.

Verified `865310f` — both blockers from the previous review are fixed and well covered by the new Vitest and Playwright regressions:

- **Post-creation confirmation**: `result?.kind === "created" && result.habit.id === saved.id` keeps `"Your Habit is saved."` intact after `router.invalidate()`, and the E2E journey now asserts it directly.
- **ARIA descriptions**: `aria-describedby` includes `habit-target-error` / `habit-weekdays-error` only when defined, and the new regression checks target existence before validation, on error, and after correction.

Approving to unblock merge. A couple of minor non-blocking follow-ups to keep on the radar (or address in a small follow-up):

- **Verification ledger consistency (`docs/sprints/README.md`)**:
  - `docs/auth.md` removes `AC-F01-1 / STS-F01-1 browser E2E` from Open acceptance gates, but the `#f01-verification-ledger` rows (L78, L83) still say `browser E2E INCOMPLETE`.
  - `docs/habits.md` uses a 2-column summary table rather than the full verification ledger columns (`requirement ID, feature/AC/STS ID, actual test file/name or measurement, execution status, commit, CI/run or evidence reference, tester, date`).
- **Remaining open coverage**: `NFR-04` (`360px` viewport, zero horizontal overflow, `200%` zoom) and `AC-F03-2` stale-UI submission against an archived template (currently covered at the service/DB layer).
- **Previously noted non-blocking cleanups**: `Habit.goal` → `goalRevision` (`GLOSSARY.md`), named constants in `src/habits.ts` (`200`, `WEEKDAYS.length`), shared active-Habit predicate, and moving the Habit HTTP tests out of `tests/templates.integration.test.ts`.

### Final preparation and main-release approvals

PR #31; chanya06; APPROVED; 2026-11-15T16:11:24Z; reviewed 35e628d552093a404e2abdde87e255153639e98e. Merge commit 2a41472787e08c57b1f294c0c1e4c5175de549b2.

Reviewed `0f24d8f...35e628d`:

- Verified engineering docs (Parts A–F) and `src/templates.ts` UTC cursor calendar component check (`tests/templates.unit.test.ts`).
- Confirmed GitHub Actions `CI / Validate` run `43732959599` passed cleanly against PR #31 head `35e628d`.
- Non-blocking notes for final polish if time permits: extract magic number `19` in `src/templates.ts:271-273`, clean up `$dailyTarget $weekdays $templateId` in `docs/deliverables/deliverable-1/part-f.md`, and add `encoding="utf-8"` in `scripts/deliverable_pdf.py`.

Approving to unblock `sprint-1` → `main` release integration (`#32`).

PR #32; chanya06; APPROVED; 2026-11-15T16:27:21Z; reviewed 2a41472787e08c57b1f294c0c1e4c5175de549b2. Merge commit 9be6a80041c732cac97e20b87c83dfe8153f42ce.

Reviewed `7993d06...2a41472` (`sprint-1` → `main`):

- Verified GitHub Actions `CI / Validate` passed on the integrated staging head (`2a41472`, runs `43734133090` and `43734128572`).
- Verified PR #31 assessment package (`Parts A–F`), schema migrations (`drizzle/0000`–`0004`), and core Sprint 1 workflows are integrated on `sprint-1`.
- Non-blocking follow-ups for after Deliverable 1 / Sprint 2:
  1. Preserve `fieldErrors` cleanly on server-side `createTemplateFn` validation errors (matching `createHabitFn`/`createEntryFn`).
  2. Mention Program Manager template publishing in the Participant empty-library message (`src/components/template-library.tsx`).
  3. Update `readHabits` in `src/server/habits.ts` to resolve the latest effective `goal_revision` (`<= accountDate`, ADR-0003) before F07 goal revisions.
  4. Replace remaining inline length/bound literals (`1000000`, `128`, `200`, `32`, `19`) with named constants and remove or expose `listEntries`.

Approving release integration into `main` so we can tag the release commit, update final release metadata/PDF for submission, and keep Issue #9 open for clean teammate acceptance + Lab 5 delivery.

### Board snapshot and contributions

GitHub Project: https://github.com/users/thrxpt/projects/13. Snapshot captured at 2026-11-15T16:39:17.893357+00:00. Features #4–#7 remain Done and CLOSED. Product spec #3 is In progress; #8 is In review for open PR #30; #9 is In progress because human clean setup and Lab 5 criteria remain incomplete. #9 was automatically closed by the main release Development link and then reopened with its remaining scope recorded. Later unstarted issues stay Backlog. No incomplete issue is marked Done just because the local release was merged.

| Issue | Work item | Final board status |
| --- | --- | --- |
| #3 | Spec: Habitarc habit and activity tracking across three sprints | In progress |
| #4 | Sign in to secure Participant and Program Manager workspaces | Done |
| #5 | Create and browse Activity Templates | Done |
| #6 | Start a scheduled Habit from an Activity Template | Done |
| #7 | Record Activity Entries and show trustworthy Today progress | Done |
| #8 | Deploy signed-in workspaces to GCP through gated CI | In review |
| #9 | Release and reproduce the Sprint 1 tracking journey | In progress |
| #10 | Browse and correct recent Activity Entry history | Backlog |
| #11 | Revise Daily Targets and Schedules from tomorrow | Backlog |
| #12 | Maintain and retire Activity Templates safely | Backlog |
| #13 | Archive a Habit without erasing its history | Backlog |
| #14 | Show current and longest scheduled-day Streaks | Backlog |
| #15 | Configure and display in-app Reminders | Backlog |
| #16 | Release Sprint 2 and complete independent UAT | Backlog |
| #17 | Explain progress with seven- and thirty-date Habit reports | Backlog |
| #18 | Verify integrated access, accessibility and performance targets | Backlog |
| #19 | Prove backup recovery without touching assessed data | Backlog |
| #20 | Deliver one approved maintenance change with regression evidence | Backlog |
| #21 | Publish the November 29 integrated candidate and evidence | Backlog |
| #22 | Release the final assessed product with PDF and joint demo | Backlog |

| Student | Recorded concrete contributions | Evidence |
| --- | --- | --- |
| 67070501063 Theeraphat Jaingam / thrxpt | Planning baseline, F01 auth/provisioning/CI, F03 Habit implementation and fixes; reviewed F02/F04; preserved retry-state fix and follow-up tests in F04 | PR #23/#24/#27 authorship; #26/#28 reviews; commits 865310f/d13929e |
| 67070501058 Chanya Poolketkij / chanya06 | F02 template and F04 Activity Entry implementation/tests; hydration fix; substantive F01/F03/#31/#32 reviews with findings and verified fixes | PR #26/#28 authorship; #24/#27/#31/#32 reviews and #31/#32 merges; commit 454c6a3 |

The user supplied both names/IDs for this report. Contributions above are limited to observable GitHub evidence. No unrecorded pair session or teammate clean-setup result is claimed. The actual teammate code/release approvals are recorded above.

AI-use declaration: AI agents assisted with requirements/design documents, code, test development, review analysis, and this evidence/PDF preparation. GitHub PRs retain authorship/review context. This report's fresh commands and assembly were executed by Codex, not an independent student tester. Students remain responsible for validating the work and explaining the design, tests, and released behavior.

## Reproduction summary and safe access

Install pinned tooling, copy `.env.example` to ignored `.env.local`, set a private random auth secret of at least 32 characters and canonical origin http://localhost:3000, start PostgreSQL, migrate, generate local synthetic accounts, and run the app. Existing PostgreSQL on the same loopback port can service disposable fixtures; do not stop another worktree's database or erase its volume. `btree_gist` installation and test database creation privileges are required. Full README remains in the repository.

```sh
vp install
cp .env.example .env.local
chmod 600 .env.local
# Privately set BETTER_AUTH_SECRET; do not print it in evidence.
docker compose up -d --wait postgres
vp run db:migrate
vp run accounts:local
vp run dev
# In a separate shell, export the disposable TEST_DATABASE_URL.
vp check
vp run typecheck
vp exec drizzle-kit check
vp test --run --passWithNoTests=false
vp exec playwright install chromium
vp run test:e2e
vp run build
```

`accounts:local` provisions one@example.test/two@example.test Participants and manager@example.test Program Manager with generated passwords in ~/.local/share/habitarc/local-accounts.json (0600). That private file is outside the repository; do not embed its contents or any password/token in this PDF. Reruns preserve existing credentials. Browser tests instead provision their own synthetic accounts and random credentials in an isolated database. PostgreSQL's named Compose volume survives app restarts and ordinary compose down. Never remove production/assessed storage to repeat a test.

## Known limitations and incomplete work

1. **AC-F05-1: teammate clean setup remains unrecorded.** No independent student result exists yet for clean README setup, migration/seed reruns and saved retrieval. The real-DB operator/integration tests pass; this does not complete the human criterion. The local release and final evidence packaging do not certify full Product DoD completion.
2. Original historical domain-rule red logs were not retained. The actual baseline-before-code chronology, teammate review testimony, current passing domain tests, and newly captured F02 red/green logs are preserved without reconstructing or backdating earlier TDD.
3. Full WCAG automation/manual screen-reader assessment, 200% zoom and specified workload/performance measurements remain unexecuted here. Existing keyboard/labels/error associations and 360px/390px Chromium journeys are scoped evidence. Final integrated measurements remain allocated to Parts A/B/D.
4. Live GCP ingress, deployment/restart retrieval, backup/restore, budget and access continuity are separate Lab 5/later obligations under #8/#9. Open PR #30 prepares Docker/pipeline delivery with its own passing CI; it is not part of this frozen main release and is not deployed evidence. Lab 5 is due November 22.
5. F06–F12 and the approved maintenance exercise remain later-sprint work. Release review #32 also notes non-blocking follow-ups for template field-error serialization/empty copy, effective Goal Revision reads before F07, and named constants. They are not silently represented as completed features.
6. Final automated verification has zero failing/skipped tests. The separately labeled intentional TDD red run failed as expected before correction. The assessed main commit is immutable; later preparation or feature commits do not silently replace it.

## External evidence references

Repository: https://github.com/thrxpt/habitarc. Selected Issues: /issues/4, /issues/5, /issues/6, /issues/7, /issues/9. Selected reviewed PRs: /pull/24, /pull/26, /pull/27, /pull/28, /pull/31, /pull/32 (all relative to that repository URL). Required-check failure: https://github.com/thrxpt/habitarc/actions/runs/43592070147 and https://github.com/thrxpt/habitarc/pull/25. Earlier F01 passing run: https://github.com/thrxpt/habitarc/actions/runs/43619543768. Main release: https://github.com/thrxpt/habitarc/commit/9be6a80041c732cac97e20b87c83dfe8153f42ce. Passing main CI: https://github.com/thrxpt/habitarc/actions/runs/43735599569. These URLs support targeted verification; all assessed engineering content and selected execution/review evidence appear directly in this PDF.

## Selected actual command output

These fresh outputs execute the assessed main release 9be6a80041c732cac97e20b87c83dfe8153f42ce on November 15. Full exact test names are retained in evidence/vitest.log.

### check.log

```text
note: You are running `vp check` as a Vite+ built-in command. If you meant to run the check npm script, use `vpr check` instead.
pass: All 123 files are correctly formatted (689ms, 10 threads)
pass: Found no warnings, lint errors, or type errors in 62 files (2.0s, 10 threads)
```

### typecheck.log

```text
$ tsc --noEmit ⊘ cache disabled
```

### migrations.log

```text
No config path provided, using default 'drizzle.config.ts'
Reading config file '/Users/thrxpt/.t3/worktrees/habitarc/t3-b1e2232b-af9c2957e0670e2c/drizzle.config.ts'
Everything's fine 🐶🔥
```

### vitest.log

```text
 ✓ tests/templates.unit.test.ts > template cursors reject normalized impossible UTC dates while preserving valid microseconds 1ms
 ✓ tests/entries.integration.test.ts > AC-F04-4: concurrent ceiling writes cannot exceed 1,440 minutes or 1,000,000 counts, and rejected writes leave no receipt 154ms
 ✓ tests/entries.integration.test.ts > TanStack Start enforces Today and entry recording authorization, idempotency, conflict serialization, and reload persistence over HTTP 3342ms
 ✓ tests/auth.integration.test.ts > a rejected credential in a provisioning batch leaves no partially created accounts 208ms

 Test Files  10 passed (10)
      Tests  92 passed (92)
   Start at  23:38:43
   Duration  17.90s (tests 72%, import 14%, transform 9%, environment 4%)
```

### playwright.log

```text
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 [chromium] › e2e/activity-entries.spec.ts:44:1 › Participant records durable progress and safely retries lost responses and failed saves (4.9s)
  ✓  2 [chromium] › e2e/habit-setup.spec.ts:41:1 › sign-in cannot submit before hydration and its fallback uses POST (141ms)
  ✓  3 [chromium] › e2e/habit-setup.spec.ts:59:1 › a Participant starts a private weekday Habit and retrieves it after reload and a new sign-in (4.1s)
  ✓  4 [chromium] › e2e/habit-setup.spec.ts:157:1 › a narrow-screen Participant corrects invalid settings and starts an every-day Habit (2.0s)

  4 passed (15.0s)
```

### build.log

```text
$ vp build ⊘ cache disabled
✓ built in 767ms
✓ built in 764ms
```
