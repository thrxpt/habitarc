# F03 — Habit setup

Status: implemented and integrated into `sprint-1` through teammate-reviewed PR #27. Local implementation, automated coverage, and Chromium E2E evidence are documented in [Habit setup](../../habits.md). Current results and remaining release gates are in the [Deliverable 1 evidence ledger](../../deliverables/deliverable-1/part-f.md).

Sprint 1. FR-04, BR-01–05/07–08/11–12. Depends on F01/F02. Owner A; B reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F03-1 / STS-F03-1 | Integration + E2E | A selects the 5–45 minute template, target 60, weekdays Monday–Friday | Habit and initial Goal Revision persist atomically; start date is today's account date; target above entry maximum is accepted |
| AC-F03-2 / STS-F03-2 | Unit + integration | Submit empty weekdays, fractional/below-minimum/over-ceiling target, or an archived template | Clear field/eligibility failure; no partial Habit/revision |
| AC-F03-3 / STS-F03-3 | Integration | Concurrently create two Habits for A/template; repeat with a prior Habit archiving tomorrow and then with it already archived | At most one eligible active Habit exists; pending archive still blocks today; an ended prior period permits a new Habit |
| AC-F03-4 / STS-F03-4 | Integration | Race template edit/archive against Habit creation | Result is serialized: no used template's measurement meaning changes and no new Habit selects an already archived template |

## Feature design: UI, application, and persistence

Participants select an active template and enter a whole-number Daily Target plus one or more labeled weekdays. Display unit/range, Account Timezone, start date, pending/error feedback, and an existing active Habit when it blocks creation. Targets may exceed the per-entry maximum. All seven selected weekdays display Every day. Successful confirmation remains visible after refreshed server props; errors reference only rendered field descriptions. The form is keyboard usable; managers do not receive this private workspace.

`createHabit` is a POST TanStack server function at `/_serverFn/<generated-id>` accepting `{templateId, dailyTarget, weekdays}`. Daily Target is an integer from the template minimum through its unit ceiling; weekdays are unique integers 1 (Monday) through 7 (Sunday), with a nonempty set. Success returns `{kind: "created" | "existing", habit}` including ID, template, server-owned start date, archive boundary, and initial Goal Revision (`effectiveFrom`, `dailyTarget`, `weekdays`). HTTP 400 returns `{kind: "invalid", message, fieldErrors}`. Unavailable/archived templates return 409; anonymous/manager calls return 401/403; unexpected storage errors return generic 503. `listHabits` is GET with no owner input, returning `{accountDate, timezone, items}` filtered to the session owner. Browser-supplied owner/timezone/start date is never authority.

Migration `0003_habits.sql` adds Habit owner/template FKs, start date, exclusive archive date/creation timestamp, and Goal Revision Habit FK/effective date/target/weekday mask. Goal Revision has a unique Habit/effective date. Template then Participant locks serialize selection and active-period checks; PostgreSQL computes the Account Timezone date after locking. Habit and initial revision commit atomically. A `btree_gist` exclusion constraint prevents overlapping owner/template periods, including direct inserts. Reminder settings and Habit concurrency-version fields are later-sprint migrations, not columns claimed present in 0003. Future archive/goal-revision screens need no Sprint 1 UI; persistence already protects their boundaries. Test SQL simulates those future operations without claiming F08 endpoints exist.
