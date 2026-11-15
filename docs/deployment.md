# Production delivery

Issue [#8](https://github.com/thrxpt/habitarc/issues/8), [F05](sprints/sprint-1/f05-reproducible-persistence-and-delivery.md), and [ADR 0002](adr/0002-cloud-run-and-cloud-sql.md) govern this release. The repository supplies a production image, an isolated image test, and a manually approved GitHub OIDC pipeline. **Live GCP acceptance remains INCOMPLETE.** No project, region, credit balance/expiry, regional estimate, quota, IAM configuration, backup, or deployed journey has been verified in this implementation session. The machine has no `gcloud` installation. No cloud resources were provisioned.

## Pre-provisioning review

Before authorizing resource creation, record these facts with dates and source links in the release evidence:

| Fact | Required review |
| --- | --- |
| Project and access | Exact project ID/number, active operator identity, billing-account association, permissions for the setup below |
| Trial | Remaining **general $300 credit**, signup and 90-day expiry dates from Billing's Credits page; trial billing remains non-upgraded; no separate 30-day SQL promotion |
| Region and quota | Supported common Cloud Run/Cloud SQL region, available regional CPU/SQL quota, Artifact Registry availability |
| Cost and runway | Current regional estimate for ordinary PostgreSQL compute, 10 GiB SSD, growth up to 20 GiB, seven daily backups, retained logs/PITR, Run CPU/memory/requests, migration jobs, image/artifact storage, Secret Manager, logging, and networking; compare the daily estimate with remaining credit and expiry |
| Continuity | Instructor's actual grading-access end date; backups, credit and expiry must cover that period; define a teardown date after access ends |
| Authorization | The user's `$implement #8` request authorizes implementation of this ticket within its accepted constraints. Record that request with the reviewed project, region, size and estimate before creating resources |

Read-only starting commands after installing the Google Cloud CLI and signing in:

```sh
gcloud auth list
gcloud projects describe "$GCP_PROJECT"
gcloud billing projects describe "$GCP_PROJECT"
gcloud services list --enabled --project "$GCP_PROJECT"
gcloud compute regions describe "$GCP_REGION" --project "$GCP_PROJECT"
gcloud sql tiers list --project "$GCP_PROJECT"
```

Use the [pricing calculator](https://cloud.google.com/products/calculator), [SQL pricing](https://cloud.google.com/sql/pricing), [Run pricing](https://cloud.google.com/run/pricing), Billing Credits and the project quota pages for the current evidence. CLI project access alone does not prove credit balance or trial status. Configure budget alerts at 50%, 75%, 90% and 100% of the approved remaining-credit budget and inspect costs and credit expiry daily. Alerts and scaling settings are not spending caps. Stop deployment if runway is insufficient; do not upgrade billing.

## Image and local proof

The multi-stage Dockerfile pins Node **26.13.1** and Bun **1.4.4** by manifest digest, installs the frozen lockfile, builds TanStack's client and fetch-style server bundles, and bundles the existing operator commands with `vp pack`. `srvx` **1.0.8** serves `dist/client` and forwards dynamic requests to `dist/server/server.js`, using TanStack's documented fetch-handler deployment shape. The runtime runs as UID 1000, binds `0.0.0.0:$PORT` (8080 by default), and contains neither local environment files nor Bun/build tooling. The OCI revision label identifies the source commit; the deployed registry digest identifies the exact bytes.

```sh
vp install --frozen-lockfile
docker build --build-arg REVISION="$(git rev-parse HEAD)" --tag habitarc:verify .
vp run test:image
```

The image test creates its own network and PostgreSQL container. It executes the image's migration/provisioning commands, signs in over real HTTP with production cookie policy, retrieves identity, repeats setup, restarts a read-only application container, retrieves the same session/identity, and logs out. It also checks built JavaScript delivery, disabled signup, and the non-root user. It removes only its uniquely named containers, database volume and network. Generated synthetic credentials are passed on stdin/environment and redacted from command failures. This test simulates Cloud Run headers; it does not prove managed ingress, live backups, GCP access or persistence of tracking entries in the deployed service.

## Authorized one-time infrastructure setup

Execute only after the review above. Use project-scoped commands with explicit `--project` and the approved region. No Terraform service or paid billing upgrade is required.

1. Enable `run.googleapis.com`, `sqladmin.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, `iam.googleapis.com`, `iamcredentials.googleapis.com`, and `sts.googleapis.com`.
2. Create one regional Docker Artifact Registry repository with immutable tags. Configure a reviewed cleanup policy that retains the assessed digest and compatible rollback digests through grading. The release pipeline pushes a commit tag once and deploys its digest; rerunning a previously published SHA with different bytes must fail rather than replace it.
3. Create an **ordinary**, single-zone, Enterprise-edition PostgreSQL 17 instance. Review `db-f1-micro` as the initial shared-core candidate against current regional availability and pricing; do not treat it as a final selection before the cost/quota review. Use 10 GiB SSD, bounded automatic growth to 20 GiB, deletion protection, a daily backup window, seven retained backups and seven days of PITR logs. Keep its public connection endpoint available for Cloud Run's supported authenticated socket integration; do not add public authorized networks. The app uses no custom proxy, CDN or load balancer.
4. Create database `habitarc`, an owning migration/provisioning PostgreSQL user, and a separate non-owning application user. Privately generate independent passwords. The owner must be able to install `btree_gist`. The application role gets only database connection, schema usage and DML on application/auth tables and sequences. Grant default privileges from the migration owner for future tables/sequences. Do not give the runtime DDL or a Cloud SQL administrative database role. Cloud SQL-created users may inherit `cloudsqlsuperuser`; remove that membership from the application user before release.
5. Create three distinct service accounts: runtime, migration and GitHub deploy. Grant runtime/migration `roles/cloudsql.client` on the project. Grant each account Secret Manager accessor **only on its own required secret(s)**. Grant deploy `roles/run.developer` on the project, `roles/artifactregistry.writer` on the one repository, and `roles/iam.serviceAccountUser` on the runtime and migration accounts. The deploy identity needs no database password or Secret Manager accessor role. Use separate operator privileges for infrastructure and IAM setup.
6. Create Secret Manager secrets `habitarc-database`, `habitarc-migration-database`, and `habitarc-auth`, with explicit numbered versions. The first two contain complete PostgreSQL URLs with percent-encoded usernames/passwords and `?host=/cloudsql/PROJECT:REGION:INSTANCE` for the managed Unix socket. The application URL uses the DML role; the migration URL uses the owner. The auth secret is a privately generated random value of at least 32 characters. Add values from private files/stdin, never literal CLI arguments. Keep this secret stable across revisions so existing sessions remain usable.
7. Create GitHub workload identity federation using issuer `https://token.actions.githubusercontent.com`. Map `google.subject=assertion.sub` and `attribute.repository_id=assertion.repository_id`. Bind the deploy account's `roles/iam.workloadIdentityUser` to the repository's **numeric ID**, not every pool member. The provider condition must require that numeric repository ID, `assertion.ref == 'refs/heads/main'`, `assertion.sub == 'repo:thrxpt/habitarc:environment:production'`, and `assertion.workflow_ref == 'thrxpt/habitarc/.github/workflows/deploy.yml@refs/heads/main'`. Tokens from forks, PRs, other workflows or other environments must be denied. No service-account key is needed.
8. Configure the `production` GitHub environment: allow only `main`, require a teammate reviewer, prevent self-review, and disable administrator bypass where supported. The release workflow also checks that the independent approval rule exists before requesting GCP credentials and fails closed if the environment API is unavailable. Enforce `Validate`, a current branch, and at least one approving teammate review on both `main` and the integration branch. The existing deliberate-failure evidence is linked below; do not manufacture a replacement failure.
9. Set the environment variables in the table below. `AUTH_ORIGIN` is the canonical direct Cloud Run HTTPS service URL without a trailing slash, not a candidate-tag URL. For first setup, determine the service's stable default URL from the chosen service name/project number/region and confirm it from the service description before accepting traffic. Grant public `roles/run.invoker` on this one service using the infrastructure operator, so the application can present its own login page; deploy lacks IAM-changing privileges. The candidate HTTP check fails until this binding is in place. Do not accept a first release until the default URL, origin policy and public access are verified.

For the database grants, run as the migration owner **before the first migration**, substituting the reviewed application role name. The default privileges then cover newly migrated tables; the existing-table grants also cover an already initialized database:

```sql
GRANT CONNECT ON DATABASE habitarc TO habitarc_app;
GRANT USAGE ON SCHEMA public TO habitarc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO habitarc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO habitarc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO habitarc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO habitarc_app;
```

Revoke default `PUBLIC` database/schema creation permissions where present. Do not grant the runtime access to the `drizzle` migration-history schema. Verify the actual role can read/write auth and tracking records and cannot create/alter/drop tables. The default-privilege statements must be run as the same owner that runs future migrations.

| GitHub production environment variable | Value |
| --- | --- |
| `GCP_PROJECT`, `GCP_REGION` | Reviewed project ID and common Run/SQL region |
| `ARTIFACT_REPOSITORY` | Regional Docker repository name |
| `RUN_SERVICE` | Stable Cloud Run service name; migration job is `<service>-migrate` |
| `CLOUD_SQL_INSTANCE` | `PROJECT:REGION:INSTANCE` |
| `RUNTIME_SERVICE_ACCOUNT`, `MIGRATION_SERVICE_ACCOUNT`, `DEPLOY_SERVICE_ACCOUNT` | Dedicated service-account emails |
| `WORKLOAD_IDENTITY_PROVIDER` | Full `projects/NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER` resource |
| `AUTH_ORIGIN` | Canonical direct service HTTPS origin |
| `DATABASE_SECRET_VERSION`, `MIGRATION_SECRET_VERSION`, `AUTH_SECRET_VERSION` | Explicit positive version numbers, never `latest` |

## Release, migrations and connection headroom

Dispatch **Release** on reviewed `main`. Other refs cannot deploy. The reusable CI job checks formatting/lint/types and migration history, discovers/runs the actual unit/integration and Chromium suites, builds the app and Docker image, and runs the production-image test. Only success uploads the tested image archive. The protected production job downloads that same archive, verifies its commit label, authenticates with GitHub OIDC, publishes it, and resolves the immutable registry digest. There is no second build after verification.

`scripts/deploy.sh` updates one Cloud Run migration job to that digest with one task, parallelism one, zero retries and a five-minute timeout, then waits for success. The job uses only the owner database secret and migration identity. The existing PostgreSQL advisory lock serializes accidental duplicate migrations too. GitHub's production concurrency group serializes whole releases without cancelling a migration in progress. Never execute a migration manually alongside a release, and never migrate on application startup.

Only after successful migration does the script stage a revision with zero minimum and two maximum **service-level** instances, 1 CPU, 512 MiB memory and request concurrency 20. Every process already limits its `pg` pool to five connections. Normal planned application demand is at most ten connections; reserve at least another ten for transient rollout overlap, five for a migration runner and five for operator/verification connections (30 total). Measure the selected SQL tier's actual connection/memory limits and application workload before approving this configuration. Run maximum instances can be temporarily exceeded; these figures are a planning review, not a hard database or billing cap.

The candidate tag starts the image without moving existing traffic. Anonymous page/session checks must pass before traffic moves to its exact ready revision. On the first-ever service creation there may be no previous revision to protect; verify access and origin before accepting the release. A migration or candidate check failure prevents promotion. Successful workflow summaries record commit, digest, migration job and revision, and the Actions run supplies its timestamp/run ID. Record the actual release tag and backup details with that evidence. A failed workflow after schema migration does not undo the schema.

If deployment fails after image publication, rerun only the failed GitHub jobs while the tested image artifact is retained (one day). Do not rebuild and overwrite the immutable commit tag. After artifact expiry, recover the recorded registry digest and re-verify that image in an explicitly reviewed recovery run, or release a new reviewed commit.

Provision the synthetic Participants/Program Manager once using `node dist/operators/provision.mjs` from the same immutable image, private JSON stdin and owner DB credentials through a supported Cloud SQL Auth Proxy connection. For this operator connection use a separate URL pointing at the proxy, not the Cloud Run-only socket path. Keep auth origin/secret consistent. Refer to [the private provisioning contract](auth.md#provision-synthetic-accounts-privately); reruns preserve credentials and records. Do not add plaintext credentials or an account seed to the workflow, image, logs or repository.

## Live acceptance and rollback

Before declaring #8 complete, record these checks against the actual GCP release:

1. Verify image digest, OCI commit label, Cloud Run revision, immutable Git release tag, successful CI/migration execution and substantive teammate review all identify the release under test. Inspect instance settings, service accounts, numbered secret references and same-region SQL attachment.
2. Sign in as a synthetic Participant and Program Manager over HTTPS, retrieve each server-owned identity/workspace, and log out. Replay the revoked cookie and confirm denial. Check Secure/HttpOnly/SameSite cookie flags and that public signup remains unavailable.
3. Record Participant/Habit/Activity Entry IDs and amounts; restart/redeploy only the application using the same immutable digest, database and secrets; retrieve those same records. Before logout, confirm the existing session survives that app lifecycle change. Repeat account setup and confirm established passwords and data remain usable. Do not reset or delete the database to simulate restart.
4. Verify direct Cloud Run ingress with forged `X-Forwarded-For` prefixes. The actual platform-appended suffix must identify the connecting client, and changing a caller prefix must not evade the shared ten-login-attempt limit. Locally simulated headers are insufficient evidence.
5. Inspect daily backup enablement, backup time, retention and PITR configuration and record a successful backup ID/time. The timed isolated restore exercise remains F12; never restore over assessed data. Confirm cost/credit runway and repeat the daily review through grading.

For a compatible application rollback, first verify the old revision works against the **current** schema and secret versions, then use the infrastructure operator or an approved serialized release window:

```sh
gcloud run services update-traffic "$RUN_SERVICE" \
  --project "$GCP_PROJECT" --region "$GCP_REGION" \
  --to-revisions "$PREVIOUS_COMPATIBLE_REVISION=100"
```

Keep the previous image/revision and its numbered secret versions available. Additive migrations should support both old and new app versions. Destructive or incompatible migrations require a reviewed backup, recovery plan and explicit maintenance authorization before release. Do not automatically reverse migrations or restore a backup during application rollback. Stop concurrent releases while recovering. Pin the assessed digest/tag through grading rather than replacing it with later work.

## Evidence status

The prior required-check failure is already genuine: [PR #25](https://github.com/thrxpt/habitarc/pull/25), [failed run 43592070147](https://github.com/thrxpt/habitarc/actions/runs/43592070147), GitHub merge state `BLOCKED`; see [the original evidence](auth.md#github-ci-evidence). It does not prove the new image/release workflow has executed on GitHub.

| Acceptance | Status for this change |
| --- | --- |
| AC-F05-2 required failure gate | Existing verified evidence retained; image build/test added to `Validate`; execution of the updated GitHub workflow pending |
| Production image/entrypoint | Local image execution recorded after validation; no deployed-release claim |
| AC-F05-3 deployed identity and record persistence | INCOMPLETE: requires authorized project access, actual release, accounts and live restart/retrieval evidence |
| AC-F05-4 cost, IAM, backup, migration and rollback review | Implementation/runbook prepared; live configuration, prices, trial balance/expiry and operational review INCOMPLETE |

### Local verification

Executed by **Codex on 2026-11-15 (Asia/Bangkok)** against implementation commit `160e4b6ff2fc5aaa2073a12ee390f2c6516c4915`. The subsequent documentation commit records these results and clarifies authorization; it does not change the tested application, image definition, workflows or scripts.

| Check | Actual result |
| --- | --- |
| `vp install` | PASS; pinned Bun 1.4.4 and frozen dependency versions used in the image |
| `vp check` | PASS; formatting, lint and types, 120 formatted files and 65 lint/type source files |
| `vp run typecheck` | PASS |
| `vp exec drizzle-kit check` | PASS |
| `TEST_DATABASE_URL=… vp test --run --passWithNoTests=false` | PASS; **97 tests in 11 files**, including six release-script tests |
| `TEST_DATABASE_URL=… vp run test:e2e` | PASS; **4 Chromium tests** |
| `vp run build`, `vp run build:operators` | PASS; also executed successfully inside the production Docker build |
| `docker build --build-arg REVISION=160e4b6ff2fc5aaa2073a12ee390f2c6516c4915 --tag habitarc:verify .` | PASS; Linux ARM64 local image |
| `vp run test:image` on that image | PASS; **1 full image/HTTP/database lifecycle test**, final run at 21:18 Asia/Bangkok |
| Actionlint 1.7.12 on both workflows | PASS; shellcheck integration disabled because shellcheck was unavailable |
| `bash -n scripts/deploy.sh`, `git diff --check` | PASS |

The exported image archive's actual OCI configuration contains revision label `160e4b6ff2fc5aaa2073a12ee390f2c6516c4915` and source `https://github.com/thrxpt/habitarc`. Its local image configuration ID is `sha256:f479397e7f0a64e5c5db46aa2f04211cc6a6a42e218553ec925006b2bc23e087`; this is **not** a published Artifact Registry digest. CI's Linux AMD64 build and the updated GitHub workflow remain unexecuted remotely. The new image test first failed against the absent image before the Dockerfile was implemented; that observed red run was uncommitted, and no historical test-only commit is claimed.

The release-script tests substitute only external cloud/container/HTTP CLIs. They verify migration failure prevents staging/promotion, candidate failure preserves traffic, successful ordering records immutable identity, and invalid secret versions/origins/regions fail before cloud mutations. They do not verify GCP permissions or command execution against a live project. The image test uses the real Docker image, PostgreSQL and HTTP boundary.

### Standards review

Independent Codex subagent review of `git diff 0f24d8fec1f26676ce510f7aafa4fc4468ee43f1...160e4b6ff2fc5aaa2073a12ee390f2c6516c4915`: no documented-standard violations or actionable baseline-smell findings identified. **0 findings.**

### Spec review

Independent Codex subagent review of the same diff against #8, its parent spec and F05: no additional Spec findings. The tested image is transferred without rebuilding; scoped OIDC identities and a serialized migration job precede staging; failed migration/candidate checks prevent promotion. Bootstrap covers separate database roles, secret access, first-service public access and compatible rollback. No scope creep found. Live acceptance remains explicitly incomplete. **0 implementation findings; live GCP acceptance outstanding.** These agent reviews do not supply the required student teammate review.
