# F09 — Streaks

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 2. FR-09, BR-05/09–11/14. Depends on F06–F08. Owner B; A reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F09-1 / STS-F09-1 | Unit | Weekday Habit completes Friday and Monday; weekend has activity | Streak reaches two; weekend activity does not increment or interrupt it |
| AC-F09-2 / STS-F09-2 | Unit + integration | Monday remains incomplete while an earlier Streak exists; cross Monday's account midnight, then correct Monday within its window | Streak survives unfinished today, breaks after it ends, and recalculates after valid correction |
| AC-F09-3 / STS-F09-3 | Unit + E2E | Change future Schedule, archive, then create a new Habit from the same template | Historic Streak uses historical obligations; archived current Streak is not applicable; longest remains; new Habit begins independently |
