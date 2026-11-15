# F10 — In-app Reminders

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 2. FR-10, BR-05/07/11/15. Depends on F04/F07/F08. Owner A; B reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F10-1 / STS-F10-1 | Unit + E2E | Set reminder to 18:00; view app before/after 18:00 on a scheduled incomplete date | Due indicator appears only when eligible; local time is explicit; app refreshes/re-evaluates while open and on focus |
| AC-F10-2 / STS-F10-2 | Unit | Complete target, switch to unscheduled/archived date, disable reminder, or test DST transition | Indicator clears/is absent as appropriate; no duplicate notification or background delivery is claimed |
