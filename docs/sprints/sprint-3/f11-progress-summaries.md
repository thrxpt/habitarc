# F11 — Progress summaries

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 3. FR-11, BR-09–10/13–14/16–17, NFR-03–05. Depends on F06–F09. Owner B; A reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F11-1 / STS-F11-1 | Unit + integration + E2E | In a completed seven-date window, five scheduled dates contain three completions and two misses; add off-schedule activity and today's entry | Completion Rate is 3/5 = 60%; activity totals include eligible off-schedule amounts; today is separate; period labels are unambiguous |
| AC-F11-2 / STS-F11-2 | Unit | Choose 30 dates, a newly created Habit, an archived Habit, zero scheduled dates, and historical goal changes | Only active-period dates/appropriate revisions count; empty denominator shows “Not scheduled”; no combined unrelated activity total |
| AC-F11-3 / STS-F11-3 | Integration + E2E | Correct an eligible past entry, refresh report, navigate by keyboard and screen-reader-friendly text | Figures update from the same source rules as history; charts have usable textual equivalents and labels |
