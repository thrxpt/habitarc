# F12 — Final quality and assessed handoff

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 3. FR-12, NFR-01–08. Depends on all required features plus independent UAT and the separate maintenance exercise. Owner A leads final QA/evidence; B leads release packaging; both present together.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F12-1 / STS-F12-1 | System + accessibility + performance | Run final-commit regression, access matrix, viewport/keyboard/zoom checks, automated accessibility, and the specified load workload | Compare actual counts/measurements to every NFR target; no required skipped test or undisclosed incomplete feature |
| AC-F12-2 / STS-F12-2 | Recovery/system | Restore a recent backup to isolated storage, time it, verify sample IDs/amounts and auth/account setup | Restore within NFR-06 target; assessed database untouched; recovery point and restoration duration recorded |
| AC-F12-3 / STS-F12-3 | Independent acceptance | Partner team executes at least normal, boundary, role/ownership, and history/persistence cases; re-test accepted fixes and maintenance impacts | Named independent testers, expected/actual outcomes, defect links, and fixed/re-tested release IDs; developer self-checks do not substitute |
| AC-F12-4 / STS-F12-4 | Release/evidence review | Review final traceability/DoD, deploy immutable accepted release, inspect PDF and ≤4-minute video access | All baseline features accounted for; final evidence matches deployed commit; both students present together; no credentials exposed; access retained through grading |
