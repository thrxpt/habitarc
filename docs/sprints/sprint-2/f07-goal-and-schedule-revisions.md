# F07 — Goal and schedule revisions

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 2. FR-07, BR-03–05/10/13. Depends on F03/F06. Owner B; A reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F07-1 / STS-F07-1 | Integration + E2E | Yesterday's target was 60 and actual 40; lower target to 30 today | Yesterday remains incomplete; today retains its original target; new target applies tomorrow |
| AC-F07-2 / STS-F07-2 | Integration | Change tomorrow's weekdays/target twice today; race stale edits; cross midnight | One coherent pending revision remains; stale edit conflicts; newly effective revision is no longer retroactively replaceable |
| AC-F07-3 / STS-F07-3 | Unit + integration | Evaluate dates around a schedule change, including a formerly unscheduled weekday | Each date uses its applicable revision; no past obligation or completion is invented |
