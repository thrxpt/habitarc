# F03 — Habit setup

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 1. FR-04, BR-01–05/07–08/11–12. Depends on F01/F02. Owner A; B reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F03-1 / STS-F03-1 | Integration + E2E | A selects the 5–45 minute template, target 60, weekdays Monday–Friday | Habit and initial Goal Revision persist atomically; start date is today's account date; target above entry maximum is accepted |
| AC-F03-2 / STS-F03-2 | Unit + integration | Submit empty weekdays, fractional/below-minimum/over-ceiling target, or an archived template | Clear field/eligibility failure; no partial Habit/revision |
| AC-F03-3 / STS-F03-3 | Integration | Concurrently create two Habits for A/template; repeat with a prior Habit archiving tomorrow and then with it already archived | At most one eligible active Habit exists; pending archive still blocks today; an ended prior period permits a new Habit |
| AC-F03-4 / STS-F03-4 | Integration | Race template edit/archive against Habit creation | Result is serialized: no used template's measurement meaning changes and no new Habit selects an already archived template |
