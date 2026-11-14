# Habit setup

Issue [#6](https://github.com/thrxpt/habitarc/issues/6) implements the [F03 contract](sprints/sprint-1/f03-habit-setup.md). Participants select an active Activity Template, set a whole-number Daily Target from its minimum through its unit ceiling (1,440 minutes or 1,000,000 counts), and select one or more weekdays. The per-entry maximum does not limit the Daily Target. All seven weekdays means every day.

## Persistence and access

`createHabit` and `listHabits` are TanStack server functions. Both require a Participant session. The session supplies the owner; owner, start-date, and timezone fields sent by callers confer no authority. Reads filter by that owner. Program Managers retain template access without private Habit access. Expected field validation failures return a typed `invalid` result with HTTP 400 so field details survive TanStack serialization; the form associates those details with the inputs. Authentication, eligibility, and unexpected failures remain thrown errors.

Habit creation locks the selected Activity Template row before checking eligibility and bounds, then locks the Participant row before checking existing tracking periods. PostgreSQL supplies today's date in the stored Account Timezone after both locks are acquired. One transaction inserts the Habit and its initial Goal Revision, effective from the start date. A failed revision leaves no Habit. The weekday Schedule uses seven bits, Monday first, with 127 meaning every day.

`archived_from` is the exclusive end of a Habit's tracking period. An archive beginning tomorrow still blocks creation today; a period that ended today permits a fresh Habit with a separate history. An existing active Habit is returned with its actual target and Schedule so concurrent creation or a retry can show the saved commitment.

Migration `0003_habits.sql` uses PostgreSQL's `btree_gist` extension and an exclusion constraint on owner, template, and date range. This prevents overlapping periods even for direct database writes. Run migrations with a role permitted to install the extension; PostgreSQL 17 provides it. The migration is additive and retains existing account/template data. Roll back application traffic to a compatible release if necessary; do not drop Habit tables to roll back an application release.

A template UPDATE/archive takes the same row lock as creation. A database trigger freezes unit and entry bounds once any Habit references the template, including an ended Habit. Description edits and archive remain possible. If an edit/archive wins the lock, creation rechecks the committed definition; if creation wins, a waiting measurement edit is rejected. New manager mutation endpoints and Habit archive/goal-edit controls belong to later work.

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

Integration tests create and remove uniquely named disposable databases. Template mutation SQL and test-only barrier/failure triggers simulate later lifecycle operations and storage failures without adding product APIs. Tests observe actual lock waits before releasing barriers.

These checks establish local implementation behavior. jsdom and HTTP server rendering do not establish real-browser end-to-end, viewport/zoom, deployed Cloud Run, independent acceptance, or substantive human teammate-review evidence. Those release gates remain open.

Local verification on 2026-11-15: `vp check`, `vp run typecheck`, `vp exec drizzle-kit check`, and `vp run build` passed. The complete suite (`vp test --run --passWithNoTests=false` with disposable PostgreSQL) passed **73 tests in 7 files**, with none skipped. Separate standards and specification reviews each found one issue: missing Participant tracking-lock acquisition and discarded server field errors. Both were corrected with failing-then-passing regression tests; HTTP validation results additionally verify that field details survive serialization.
