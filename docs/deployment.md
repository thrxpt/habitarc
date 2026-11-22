# Deploy Habitarc through Student Cloud Portal

The Lab 5 release uses the resources the TA assigned to team `sd31d6c61` in `cpe-se-course-2026`, region `asia-southeast1`. The Portal manages Cloud Run, Cloud SQL, Artifact Registry and IAM. The team configures app secrets in its existing Secret Manager slots. The deadline is November 22, 2026. See [F05](sprints/sprint-1/f05-reproducible-persistence-and-delivery.md) and [issue #8](https://github.com/thrxpt/habitarc/issues/8) for acceptance criteria.

## Portal and GitHub setup

1. Open **Team resources** in the Portal and confirm service `sd31d6c61`, job `sd31d6c61-migrate`, registry `sd31d6c61` and SQL instance `sd31d6c61-pg`. Use the Gmail registered in the Portal for CLI access. Confirm backup configuration, quota and access through grading with the TA.
2. Create the GitHub environment **`demo`** with `main` as the deployment branch. Add a teammate as a required reviewer, enable **Prevent self-review** and disable administrator bypass. Copy `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` from the Portal into its **Environment variables**.
3. Add a generated Better Auth secret to Portal slot `sd31d6c61-app-secret-1`. Set `HABITARC_AUTH_SECRET_VERSION` in GitHub to the enabled version number. Keep that version stable across releases to preserve existing sessions.
4. For first-run account setup, prepare a private JSON file outside the repository with two Participants and one Program Manager. Add its contents to Portal slot `sd31d6c61-app-secret-2` and set `HABITARC_ACCOUNTS_SECRET_VERSION` in GitHub to that version number. See the [account input contract](auth.md#provision-synthetic-accounts-privately).

Optional CLI commands for the TA's downloaded `project-kit` under `.local/project-kit`:

```sh
openssl rand -hex 32 | bash .local/project-kit/kit.sh --env-file deploy/project-kit/resources.env secrets add 1 --from-stdin
bash .local/project-kit/kit.sh --env-file deploy/project-kit/resources.env secrets add 2 --from-file /private/path/habitarc-accounts.json
```

Use only references and version numbers in GitHub. The existing `DATABASE_URL` binding and Cloud SQL Unix socket stay on both Portal resources. The image uses `pg`, which accepts the Portal's PostgreSQL URL. Drizzle needs permission to use `btree_gist`. If the job reports a permission error, give the TA the job name and the redacted error.

## Preview and release

```sh
bash deploy/deploy.sh
bash deploy/tests/test-release.sh
python3 -m unittest discover -s deploy/tests -p 'test_smoke.py'
```

The preview prints the release commands with placeholder image and revision values. `Validate` runs the release-script and smoke-test checks, regular suites and the production image test. The image test covers migration, private account setup, login, identity, logout and session persistence across app container replacement against disposable PostgreSQL.

After review and integration into `main`, open **Actions → Deploy demo → Run workflow** and have the `demo` reviewer approve. Select `provision_accounts` on the first release to create the synthetic accounts. Provisioning skips existing accounts and preserves their passwords. Optionally set `SMOKE_EMAIL` (environment variable) and `SMOKE_PASSWORD` (environment secret) to a non-privileged synthetic Participant account in `demo` to include a live sign-in/sign-out verification after promotion or rollback.

Dispatching from any branch other than `main` fails before testing or authenticating to GCP. GitHub enforces the `demo` environment policy and pauses the deploy job for the independent reviewer before the job starts or requests an OIDC credential.

1. Lab 5's `test-and-docker` invokes `Validate` and uploads the tested image archive for the same commit.
2. The deploy job authenticates through Portal OIDC, publishes the tested image and resolves its registry digest.
3. `deploy/release.sh` updates the assigned migration job to run `node dist/operators/migrate.mjs` using that digest, with one task and zero retries. Optional provisioning runs `node dist/operators/provision.mjs --file /secrets/habitarc-provision/accounts.json` against the mounted secret file in that job. When provisioning finishes or fails, the release restores the migration command and removes `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and the mounted accounts file from the job. A routine release removes those settings before running migrations. The migration job and any cleanup must succeed before the service update. If a runner interruption or cleanup failure leaves the settings attached, rerun the workflow with `provision_accounts` off to clear them.
4. The assigned service listens on port 8080 using the image's default command. It derives `BETTER_AUTH_URL` from the existing service URL. It uses up to one instance per revision with five PostgreSQL connections per app process. It stages a candidate and runs `deploy/smoke_test.py` (public read-only checks for the Habitarc sign-in page and anonymous session response) before promoting that revision, then `.github/workflows/deploy.yml` runs `python3 deploy/smoke_test.py "$SERVICE_URL"` against the live service URL after promotion or rollback.

### Cloud SQL connection headroom

Budget up to **10 connections** for the current and candidate revisions together (one instance per revision, five connections per instance). Reserve **5 more** for the single migration or provisioning task, even though the job finishes before the candidate starts. Plan for **15 connections for Habitarc**, plus room for TA and operator connections and any brief Cloud Run scaling above the configured limit. Confirm available capacity with the TA before the first release. These figures are planning estimates for the Portal database.

Keep the commit, workflow URL, image digest, revision and live URL from the summary. Verify login, identity, logout and retrieval of the same saved Activity Entries and account data after a revision change using the synthetic accounts. Record the TA's backup and retention configuration. The earlier [required-check failure](https://github.com/thrxpt/habitarc/actions/runs/43592070147) and [production image CI run](https://github.com/thrxpt/habitarc/actions/runs/43735877612) remain available as prior evidence. Live Portal release and persistence verification are pending.

To roll back, identify a ready revision of this service that was released successfully and works with the current database schema. Run **Deploy demo** with `rollback_revision` set to that revision. Rollback switches traffic and leaves the database schema in place. Work with the TA for infrastructure changes, backup recovery or cleanup.

## Project Kit status and dry run

Use the TA's Project Kit for status and logs. The repo profile in `deploy/project-kit/` contains public resource identifiers and sample secret references. The Portal workflow is the release path used for Lab 5 evidence.

```sh
bash .local/project-kit/kit.sh --env-file deploy/project-kit/resources.env doctor
bash .local/project-kit/kit.sh \
  --env-file deploy/project-kit/resources.env \
  --app-env deploy/project-kit/app.env.example \
  --secrets-map deploy/project-kit/secrets.map.example \
  --dry-run deploy
```
