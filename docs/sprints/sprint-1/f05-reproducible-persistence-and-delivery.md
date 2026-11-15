# F05 — Reproducible persistence and delivery

Status: accepted contract baseline following Q25. The CI portion is implemented, and AC-F05-2 / STS-F05-2 required-check blocking is verified through an actual deliberately failed check; see [CI evidence](../../auth.md#github-ci-evidence). Container image creation, GCP deployment, and the remaining system/operational verification are PLANNED. This partial CI result does not establish release acceptance.

Sprint 1 and Lab 5, with Lab 5 submission extended to **November 22, 2026**, as confirmed by the user on November 15. Deliverable 1 remains due November 15; F05 acceptance criteria remain unchanged. FR-12, NFR-06–08. Infrastructure work begins alongside F01; release acceptance depends on F01–F04. Owner B for deployment, A for migrations/verification; each reviews the other's work.

Read the [SRS](../../srs.md), [System-Level SDS](../../system-sds.md), [feature inventory](../../features.md), [traceability matrix](../../traceability.md), [sprint plan](../plan.md), and [shared verification and Definition of Done](../README.md).

## Acceptance criteria and Software Test Specification

| AC / planned STS | Level | Setup and action | Required outcome |
| --- | --- | --- | --- |
| AC-F05-1 / STS-F05-1 | System | Teammate follows clean README setup, migration, synthetic account seed, build, and tests | Working local critical journey with real PostgreSQL; repeat setup preserves existing records; secrets absent from Git/output |
| AC-F05-2 / STS-F05-2 | CI/system | Open temporary branch with a deliberate required-check failure; attempt integration | Required check fails and blocks integration/release; preserve actual run evidence before removing the deliberate failure |
| AC-F05-3 / STS-F05-3 | Deployment/E2E | Release reviewed main image to GCP, record IDs/amounts, restart/redeploy the app, retrieve them | Durable records survive; deployed commit/image matches release evidence; backup configuration is recorded |
| AC-F05-4 / STS-F05-4 | Operational review | Inspect remaining credit, expiry, regional estimate, limits, secrets/IAM, migration job, and rollback procedure | Supported trial resources with budget runway; least-privilege identities; no paid upgrade; one controlled migration runner and documented recovery path |

## Checkpoint boundary and design

For Project Deliverable 1, establish local durable PostgreSQL, explicit repeatable migrations, private synthetic provisioning, documented build/test commands, and a reviewed increment on main. Completed Docker, CI/CD, and GCP deployment are assessed separately in Lab 5 by the course reference. AC-F05-3/4 remain visible as Lab 5 obligations; the local PDF must not claim they passed. Existing CI evidence may be included without making cloud deployment a prerequisite invented for this checkpoint.

No new product UI or public API is required. README is the operator interface: install pinned tools, configure ignored environment variables, start Compose, migrate, provision accounts, run/build/test. Migrations preserve existing source records; account reruns preserve passwords and identities. Application storage remains in PostgreSQL's named volume across app/container restarts. Synthetic passwords live outside Git/PDF in a private local file. Future packaging uses a stateless Cloud Run image and external Cloud SQL, controlled migrations, managed secrets, and compatible application rollback as designed in the SDS.

STS-F05-1 requires a real teammate's clean setup and acceptance. Automated operator/integration tests are supporting evidence, not a substitute for that human result. STS-F05-2's failed-check blocking evidence already exists in PR #25. Current local command results and remaining main-release/human gates are recorded in the Deliverable 1 evidence ledger.
