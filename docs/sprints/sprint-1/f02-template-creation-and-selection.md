# F02 — Template creation and selection

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 1. FR-03, BR-02/12, NFR-01. Depends on F01. Owner B; A reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F02-1 / STS-F02-1 | Integration + E2E | M creates a Focused Study template, minutes, bounds 5–45; A opens selection after reload | Exact persisted template appears with unit/range guidance |
| AC-F02-2 / STS-F02-2 | Unit + integration | Submit zero/fractional/inverted bounds, unsupported units, or maximum above unit ceiling | Backend rejects invalid definitions without partial writes |
| AC-F02-3 / STS-F02-3 | Integration | A attempts template creation directly; unauthenticated caller attempts restricted reads/writes | Forbidden operation fails; no template or private record is changed |

Mutable library maintenance is F08; template-use constraints must already be represented safely in the Sprint 1 data model.
