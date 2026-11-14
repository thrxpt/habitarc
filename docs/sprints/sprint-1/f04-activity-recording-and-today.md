# F04 — Activity recording and Today

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 1. FR-05, BR-01/03–09/13, NFR-02/04. Depends on F03. Owner B; A reviews. Today is the first complete participant journey.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F04-1 / STS-F04-1 | Integration + E2E | For target 60, record two deliberate 25-minute entries, reload, then add 25 more | Totals are 50 then 75; actual progress is 125%, fill stops at 100%; entries remain individually visible |
| AC-F04-2 / STS-F04-2 | Integration | Retry one save concurrently with the same request key/payload; reuse its key with a different amount | Only one entry is created; changed-payload reuse returns conflict; separate deliberate keys still create separate entries |
| AC-F04-3 / STS-F04-3 | Unit + integration | Around account midnight, test today−6, today−7, tomorrow, pre-start, off-schedule, and another device timezone | Only eligible account dates are writable; off-schedule activity is retained without completion credit; device timezone has no effect |
| AC-F04-4 / STS-F04-4 | Integration | Start at 1,430 minutes and race two +10 writes; exercise count ceiling, zero, fractions, and range violations | No total exceeds its unit ceiling; exactly one +10 succeeds; rejected operations leave no partial record/receipt |
| AC-F04-5 / STS-F04-5 | E2E | Lose a save response and retry; simulate backend failure; inspect empty state and reload | Safe retry cannot duplicate activity; failure is never labeled saved; empty state directs to Habit setup |
