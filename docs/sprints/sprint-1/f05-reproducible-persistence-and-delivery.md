# F05 — Reproducible persistence and delivery

Status: accepted contract baseline following Q25. Implementation and all verification are PLANNED.

Sprint 1 and Lab 5. FR-12, NFR-06–08. Infrastructure work begins alongside F01; release acceptance depends on F01–F04. Owner B for deployment, A for migrations/verification; each reviews the other's work.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F05-1 / STS-F05-1 | System | Teammate follows clean README setup, migration, synthetic account seed, build, and tests | Working local critical journey with real PostgreSQL; repeat setup preserves existing records; secrets absent from Git/output |
| AC-F05-2 / STS-F05-2 | CI/system | Open temporary branch with a deliberate required-check failure; attempt integration | Required check fails and blocks integration/release; preserve actual run evidence before removing the deliberate failure |
| AC-F05-3 / STS-F05-3 | Deployment/E2E | Release reviewed main image to GCP, record IDs/amounts, restart/redeploy the app, retrieve them | Durable records survive; deployed commit/image matches release evidence; backup configuration is recorded |
| AC-F05-4 / STS-F05-4 | Operational review | Inspect remaining credit, expiry, regional estimate, limits, secrets/IAM, migration job, and rollback procedure | Supported trial resources with budget runway; least-privilege identities; no paid upgrade; one controlled migration runner and documented recovery path |
