# F06 — History and corrections

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 2. FR-06, BR-01/03–09/13, NFR-02. Depends on F04. Owner A; B reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F06-1 / STS-F06-1 | Integration + E2E | View mixed scheduled/off-schedule history, edit an eligible amount/date, delete an eligible entry | Dated history and affected totals update correctly; changed dates validate both source/destination; old records display read-only |
| AC-F06-2 / STS-F06-2 | Integration | Edit yesterday at the window edge, advance account date, retry; attempt correction of a now-ineligible source or destination | Seven-date rule is enforced at mutation time; no partial move or lost record |
| AC-F06-3 / STS-F06-3 | Integration | Two tabs edit the same version; retry a prior create after its entry was deleted | One stale edit conflicts; deleted entry is not resurrected; privacy checks precede any replay |
| AC-F06-4 / STS-F06-4 | Unit + integration | Correct a completed date to below target and restore it | Completion and dependent derived results change consistently; later Streak/report tests reuse this scenario |
