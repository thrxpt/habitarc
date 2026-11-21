# F02 — Template creation and selection

Status: implemented and integrated into `sprint-1` through reviewed PR #26. Current execution results and remaining release gates are recorded in the [Deliverable 1 evidence ledger](../../deliverables/deliverable-1/part-f.md). The reviewed increment is now released on main through PR #32; its exact version and known verification gaps are recorded in Part F.

Sprint 1. FR-03, BR-02/12, NFR-01. Depends on F01. Owner B; A reviews.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F02-1 / STS-F02-1 | Integration + E2E | M creates a Focused Study template, minutes, bounds 5–45; A opens selection after reload | Exact persisted template appears with unit/range guidance |
| AC-F02-2 / STS-F02-2 | Unit + integration | Submit zero/fractional/inverted bounds, unsupported units, or maximum above unit ceiling | Backend rejects invalid definitions without partial writes |
| AC-F02-3 / STS-F02-3 | Integration | A attempts template creation directly; unauthenticated caller attempts restricted reads/writes | Forbidden operation fails; no template or private record is changed |

Mutable library maintenance is F08; template-use constraints must already be represented safely in the Sprint 1 data model.

## Feature design: UI, application, and persistence

The Program Manager's Templates screen contains a labeled creation form and the active template library. Participants see the library and Habit selection action, without a creation form. Display the Measurement Unit and inclusive per-entry range on each template. Empty libraries explain that a manager must publish a template; loading and failed reads never appear as an empty successful result. Preserve input on save failure, disable duplicate pending submission, and associate validation feedback with its field.

`createTemplate` is a POST TanStack server function under `/_serverFn/<generated-id>`. Its input is `{name, description, unit, entryMinimum, entryMaximum}`. Names are trimmed, nonempty, and at most 120 characters; descriptions are trimmed and at most 500 characters. Units are `minutes` or `counts`; integer bounds must satisfy 1 <= minimum <= maximum <= 1,440 or 1,000,000 respectively. The server checks the manager's session before writing. Success returns an Activity Template with server-generated ID, version 1, timestamps, and `archivedAt: null`. Validation throws a safe HTTP 400 TemplateError; anonymous/wrong-role requests receive 401/403 and storage failures receive a generic 503. No caller-selected creator/role is authoritative.

`listTemplates` is a GET server function for either authenticated role. Input `{limit?, cursor?}` defaults to 50, capped at 200; cursor fields are name, creation timestamp, and ID. Response is `{items, nextCursor}` ordered by that tuple, excluding archived templates. Malformed pagination fails with 400. Generated server-function IDs are build-specific transport details, not stable public REST endpoints.

Migration `0002_activity-templates.sql` creates `activity_template` with text ID/name/description/unit, integer entry bounds/version, archive timestamp, and creation/update timestamps. Database checks repeat text/range/unit constraints. Migration `0003_habits.sql` prevents measurement changes once referenced by any Habit (ADR 0001). There is no deletion operation or template edit/archive UI in F02. F08 adds maintenance under the existing invariant.
