# F08 — Template and Habit lifecycle

Status: accepted contract baseline following Q25. Issue [#12](https://github.com/thrxpt/habitarc/issues/12) covers Activity Template maintenance and retirement (AC-F08-1 and AC-F08-2).

Sprint 2. FR-08, BR-08/11–12. Depends on F02/F03/F07. Owner A; B reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F08-1 / STS-F08-1 | Integration + E2E | M edits an unused template, creates a Habit from it, then attempts a unit/bounds edit and a name edit | Unused measurement edit is validated; used measurement edit fails; descriptive edit succeeds without changing historical amounts |
| AC-F08-2 / STS-F08-2 | Integration | Archive template used by A; try creating a new Habit and logging against A's existing Habit | New selection fails; existing Habit continues normally |
| AC-F08-3 / STS-F08-3 | Integration + E2E | A archives a Habit today, records today, advances to tomorrow, corrects an eligible earlier entry, and starts anew | Today remains an obligation; post-archive dates reject activity; history/corrections survive; new Habit has separate history and no inherited Streak |
| AC-F08-4 / STS-F08-4 | Integration | Attempt archive as B, reactivate/delete history, or revise a pending-archive Habit for tomorrow | Unauthorized/unsupported transitions fail; pending goal rules cannot extend the archived tracking period |

## Activity Template maintenance

Program Managers can edit published templates or confirm permanent archival. The manager library includes a measurement-lock flag derived from whether any Habit references the template. The edit form keeps fixed measurement fields read-only and accepts name and description corrections. Both roles' libraries list published templates. If a refreshed library changes or removes the selected template, the Habit form closes and the Participant is prompted to choose again. A stale submission receives HTTP 409 and refreshes the library.

`updateTemplate` takes a template ID, the displayed version, and the same fields and validation as `createTemplate`. `archiveTemplate` takes the ID and displayed version. Both POST server functions authorize the Program Manager from the session. HTTP 400 carries field validation and HTTP 409 carries stale, unavailable, or frozen-template feedback. Each successful write increments the version and updates the timestamp. The archive also sets the archive timestamp.

Maintenance and Habit creation acquire the same PostgreSQL row lock. Maintenance checks for any referencing Habit after taking the lock. Habit creation checks the selected version after taking the lock, so a pending request cannot use newly edited measurements. The existing database trigger protects fixed measurements, and existing Habits continue to read their template and validate Activity Entries against the same unit and bounds.

## Issue #12 verification ledger

Local verification passed on disposable PostgreSQL and Chromium. The full Vitest suite passed 107 tests in 11 files, and Playwright passed eight Chromium tests. `vp check`, `vp run typecheck`, and `vp run build` passed.

| Requirement | Feature / AC / STS | Actual test | Status | Commit | Evidence | Tester | Date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-08, BR-12 | F08 / AC-F08-1 / STS-F08-1 | Invalid unused bounds and used measurement edits fail. Descriptive edits persist. Lock races and refreshed selections require the Participant to use the current definition. Management rejects anonymous and Participant calls. | PASS | `871a352` | [Template HTTP](../../../tests/templates.integration.test.ts), [Habit races](../../../tests/habits.integration.test.ts), [Refreshed form](../../../tests/workspace-habits.test.tsx), [Chromium](../../../e2e/habit-setup.spec.ts) | Codex | 2026-11-20 |
| FR-08, BR-08, BR-12 | F08 / AC-F08-2 / STS-F08-2 | The archived template disappears on reload and rejects new Habits. An existing Habit retains its original 25-minute entry, rejects 31 minutes, and accepts a 30-minute entry. | PASS | `871a352` | [PostgreSQL integration](../../../tests/entries.integration.test.ts), [Chromium](../../../e2e/habit-setup.spec.ts) | Codex | 2026-11-20 |

Teammate review, sprint integration, deployed verification, and independent acceptance remain pending.
