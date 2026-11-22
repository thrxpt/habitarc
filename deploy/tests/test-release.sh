#!/usr/bin/env bash
set -euo pipefail

release=$(cd "$(dirname "$0")/.." && pwd)/release.sh
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export TRACE="$scratch/trace"
export GITHUB_REF=refs/heads/main
export GITHUB_SHA=0123456789abcdef0123456789abcdef01234567
export GCP_PROJECT_ID=cpe-se-course-2026 GCP_REGION=asia-southeast1
export HABITARC_AUTH_SECRET_VERSION=4
export GITHUB_STEP_SUMMARY="$scratch/summary"
unset HABITARC_ACCOUNTS_SECRET_VERSION ROLLBACK_REVISION
export PATH="$scratch:$PATH"

cat > "$scratch/gcloud" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'gcloud %s\n' "$*" >> "$TRACE"
case "$*" in
  'run services describe '*--format=json)
    printf '%s\n' '{"status":{"traffic":[{"tag":"candidate","revisionName":"sd31d6c61-00002-ok","url":"https://candidate---sd31d6c61-example-as.a.run.app"}]}}' ;;
  'run services describe '*--format='value(status.url)')
    printf '%s\n' 'https://sd31d6c61-000000000000.asia-southeast1.run.app' ;;
  'run revisions describe '*--format=json)
    printf '%s\n' '{"metadata":{"labels":{"serving.knative.dev/service":"sd31d6c61"}},"status":{"conditions":[{"type":"Ready","status":"True"}]}}' ;;
  'artifacts docker images describe '*) printf 'sha256:%064d\n' 123 ;;
  'run jobs execute '*) [[ ${CASE:-} != migration-failure ]] || exit 27 ;;
  'run jobs update '*--remove-secrets*) [[ ${CASE:-} != cleanup-failure ]] ;;
  'run jobs describe '*|'auth configure-docker '*|'run jobs update '*|'run services update '*|'run services update-traffic '*) ;;
  *) exit 2 ;;
esac
STUB
cat > "$scratch/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'docker %s\n' "$*" >> "$TRACE"
case "$*" in
  'image inspect '*)
    [[ ${CASE:-} != wrong-label ]] && printf '%s\n' "$GITHUB_SHA" || printf 'wrong-revision\n' ;;
  'load '*|'tag '*|'push '*) ;;
  *) exit 2 ;;
esac
STUB
cat > "$scratch/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl %s\n' "$*" >> "$TRACE"
[[ ${CASE:-} != candidate-failure ]] || exit 22
case "$*" in
  *'/api/auth/get-session') printf 'null\n' ;;
  *) printf '<h1>Sign in to Habitarc</h1>\n' ;;
esac
STUB
chmod +x "$scratch/gcloud" "$scratch/docker" "$scratch/curl"

run_release() {
  : > "$TRACE"
  bash "$release" tested-image.tar > "$scratch/output" 2>&1
}
expect_trace() { grep -Eq -- "$1" "$TRACE" || { cat "$TRACE"; exit 1; }; }
reject_trace() { if grep -Eq -- "$1" "$TRACE"; then cat "$TRACE"; exit 1; fi; }
expect_failure() { if run_release; then cat "$scratch/output"; exit 1; fi; }
migration_only='run jobs update .*--command node --args dist/operators/migrate\.mjs --remove-env-vars BETTER_AUTH_URL --remove-secrets BETTER_AUTH_SECRET,/secrets/habitarc-provision/accounts\.json'
expect_cleanup_after_provisioning() {
  awk -v cleanup_pattern="$migration_only" '
    /run jobs execute / { execution = NR }
    $0 ~ cleanup_pattern { cleanup = NR }
    /run services update .*--no-traffic/ { candidate = NR }
    END { exit !(execution && cleanup > execution && (!candidate || cleanup < candidate)) }
  ' "$TRACE" || { cat "$TRACE"; exit 1; }
}

export DRY_RUN=1
run_release
[[ ! -s $TRACE ]]
grep -Eq 'sd31d6c61.*8080' "$scratch/output"
export DRY_RUN=0

run_release
expect_trace 'docker push asia-southeast1-docker\.pkg\.dev/cpe-se-course-2026/sd31d6c61/sd31d6c61:012345'
expect_trace 'run jobs update .*@sha256:.*--tasks 1 .*--command node --args dist/operators/migrate\.mjs'
expect_trace 'run services update .*@sha256:.*--port 8080 .*BETTER_AUTH_URL=https://sd31d6c61-000000000000\.asia-southeast1\.run\.app.*BETTER_AUTH_SECRET=sd31d6c61-app-secret-1:4.*--no-traffic'
expect_trace 'run services update-traffic .*sd31d6c61-00002-ok=100'
reject_trace 'DATABASE_URL|--set-env-vars|--set-secrets|--service-account|--set-cloudsql-instances|run jobs deploy|run deploy '
grep -Eq 'Image.*@sha256:' "$GITHUB_STEP_SUMMARY"

export HABITARC_ACCOUNTS_SECRET_VERSION=2
run_release
expect_trace 'run jobs update .*dist/operators/migrate\.mjs.*dist/operators/provision\.mjs.*sd31d6c61-app-secret-2:2'
expect_cleanup_after_provisioning
reject_trace 'run services update .*app-secret-2'

export CASE=migration-failure
status=0
run_release || status=$?
[[ $status == 27 ]] || { cat "$scratch/output"; exit 1; }
expect_cleanup_after_provisioning
reject_trace 'run services update '

export CASE=cleanup-failure
expect_failure
expect_cleanup_after_provisioning
grep -q 'Could not restore the migration job' "$scratch/output"
reject_trace 'run services update '
unset CASE
unset HABITARC_ACCOUNTS_SECRET_VERSION

run_release
expect_trace "$migration_only"

export CASE=migration-failure
expect_failure
expect_trace 'run jobs execute .*--wait'
reject_trace 'run services update '

export CASE=candidate-failure
expect_failure
expect_trace 'run services update .*--no-traffic'
reject_trace 'run services update-traffic'

export CASE=wrong-label
expect_failure
reject_trace 'docker push|run jobs update'
unset CASE

export HABITARC_AUTH_SECRET_VERSION=latest
expect_failure
[[ ! -s $TRACE ]]
export HABITARC_AUTH_SECRET_VERSION=4
export GCP_PROJECT_ID=wrong-project
expect_failure
[[ ! -s $TRACE ]]
export GCP_PROJECT_ID=cpe-se-course-2026

export ROLLBACK_REVISION=sd31d6c61-00001-ok
run_release
expect_trace 'run services update-traffic .*sd31d6c61-00001-ok=100'
reject_trace 'docker |run jobs |run services update '
export ROLLBACK_REVISION=other-team-revision
expect_failure
[[ ! -s $TRACE ]]

printf '%s\n' 'Portal release contract checks passed.'
