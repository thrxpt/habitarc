# F08 — Template and Habit lifecycle

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 2. FR-08, BR-08/11–12. Depends on F02/F03/F07. Owner A; B reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F08-1 / STS-F08-1 | Integration + E2E | M edits an unused template, creates a Habit from it, then attempts a unit/bounds edit and a name edit | Unused measurement edit is validated; used measurement edit fails; descriptive edit succeeds without changing historical amounts |
| AC-F08-2 / STS-F08-2 | Integration | Archive template used by A; try creating a new Habit and logging against A's existing Habit | New selection fails; existing Habit continues normally |
| AC-F08-3 / STS-F08-3 | Integration + E2E | A archives a Habit today, records today, advances to tomorrow, corrects an eligible earlier entry, and starts anew | Today remains an obligation; post-archive dates reject activity; history/corrections survive; new Habit has separate history and no inherited Streak |
| AC-F08-4 / STS-F08-4 | Integration | Attempt archive as B, reactivate/delete history, or revise a pending-archive Habit for tomorrow | Unauthorized/unsupported transitions fail; pending goal rules cannot extend the archived tracking period |
