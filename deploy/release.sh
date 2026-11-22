#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
smoke_test="$script_dir/smoke_test.py"
project=cpe-se-course-2026
region=asia-southeast1
team=sd31d6c61
job="$team-migrate"
registry="$region-docker.pkg.dev"
image="$registry/$project/$team/$team"
dry_run=${DRY_RUN:-0}
sha=${GITHUB_SHA:-0000000000000000000000000000000000000000}
auth_version=${HABITARC_AUTH_SECRET_VERSION:-}
accounts_version=${HABITARC_ACCOUNTS_SECRET_VERSION:-}
rollback=${ROLLBACK_REVISION:-}
cloud=(--project "$project" --region "$region" --quiet)

[[ $dry_run == 0 || $dry_run == 1 ]] || fail 'DRY_RUN must be 0 or 1.'
[[ ${GCP_PROJECT_ID:-$project} == "$project" && ${GCP_REGION:-$region} == "$region" ]] ||
  fail 'GitHub variables must match the assigned Student Cloud project and region.'
[[ $sha =~ ^[0-9a-f]{40}$ ]] || fail 'Expected a full Git commit SHA.'
if [[ $dry_run == 0 ]]; then
  [[ ${GITHUB_REF:-} == refs/heads/main && -n ${GITHUB_SHA:-} ]] ||
    fail 'Run the live release through GitHub Actions on reviewed main.'
  [[ ${GCP_PROJECT_ID:-} == "$project" && ${GCP_REGION:-} == "$region" ]] ||
    fail 'Set GCP_PROJECT_ID and GCP_REGION in the GitHub demo environment.'
fi

run() {
  if [[ $dry_run == 1 ]]; then
    printf '[DRY RUN]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

service_origin() {
  [[ $1 =~ ^https://[a-z0-9-]+(\.[a-z0-9-]+)*\.run\.app$ ]]
}

if [[ -n $rollback ]]; then
  [[ $rollback =~ ^sd31d6c61-[a-z0-9-]+$ ]] || fail 'Enter a revision of the assigned service.'
  if [[ $dry_run == 0 ]]; then
    revision_json=$(gcloud run revisions describe "$rollback" "${cloud[@]}" --format=json)
    jq -e --arg service "$team" '
      .metadata.labels["serving.knative.dev/service"] == $service and
      any(.status.conditions[]; .type == "Ready" and .status == "True")
    ' <<< "$revision_json" > /dev/null || fail 'Rollback requires a ready revision of this service.'
    origin=$(gcloud run services describe "$team" "${cloud[@]}" --format='value(status.url)')
    service_origin "$origin" || fail 'The assigned service must have a canonical Cloud Run HTTPS URL.'
  fi
  run gcloud run services update-traffic "$team" "${cloud[@]}" --to-revisions "$rollback=100"
  if [[ $dry_run == 0 && -n ${GITHUB_ENV:-} ]]; then
    printf 'SERVICE_URL=%s\n' "$origin" >> "$GITHUB_ENV"
  fi
  printf 'Rollback revision: %s\n' "$rollback" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
fi

if [[ $dry_run == 1 && -z $auth_version ]]; then auth_version=1; fi
[[ $auth_version =~ ^[1-9][0-9]*$ ]] || fail 'Set HABITARC_AUTH_SECRET_VERSION to the numbered version in app-secret-1.'
[[ -z $accounts_version || $accounts_version =~ ^[1-9][0-9]*$ ]] || fail 'Use a numbered version in app-secret-2 for optional account provisioning.'
archive=${1:-habitarc-image.tar}

if [[ $dry_run == 1 ]]; then
  origin="https://$team-000000000000.$region.run.app"
  digest=$(printf 'sha256:%064d' 0)
  printf '%s\n' '[DRY RUN] Origin, digest and candidate revision below are placeholders.'
else
  origin=$(gcloud run services describe "$team" "${cloud[@]}" --format='value(status.url)')
  service_origin "$origin" || fail 'The assigned service must have a canonical Cloud Run HTTPS URL.'
  gcloud run jobs describe "$job" "${cloud[@]}" --format='value(metadata.name)' > /dev/null
fi

run docker load --input "$archive"
if [[ $dry_run == 0 ]]; then
  revision_label=$(docker image inspect "habitarc:$sha" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  [[ $revision_label == "$sha" ]] || fail 'The tested image does not match the release commit.'
fi
run gcloud auth configure-docker "$registry" --quiet
run docker tag "habitarc:$sha" "$image:$sha"
run docker push "$image:$sha"
if [[ $dry_run == 0 ]]; then
  digest=$(gcloud artifacts docker images describe "$image:$sha" --project "$project" --format='value(image_summary.digest)')
  [[ $digest =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'Artifact Registry did not return an image digest.'
fi
immutable_image="$image@$digest"

# Preserve the Portal's service account, SQL socket and DATABASE_URL on both resources.
(
  accounts_file=/secrets/habitarc-provision/accounts.json
  migration_only=(
    --command node --args dist/operators/migrate.mjs
    --remove-env-vars BETTER_AUTH_URL
    --remove-secrets "BETTER_AUTH_SECRET,$accounts_file"
  )
  migration=("${migration_only[@]}")
  if [[ -n $accounts_version ]]; then
    # Restore the migration-only job before staging the service, even if provisioning fails.
    trap 'run gcloud run jobs update "$job" "${cloud[@]}" "${migration_only[@]}" ||
      fail "Could not restore the migration job after provisioning. Retry the release to remove the provisioning settings."' EXIT
    migration=(
      --command sh
      --args "^@^-ec@node dist/operators/migrate.mjs && node dist/operators/provision.mjs < $accounts_file"
      --update-env-vars "BETTER_AUTH_URL=$origin,NODE_ENV=production"
      --update-secrets "BETTER_AUTH_SECRET=$team-app-secret-1:$auth_version,$accounts_file=$team-app-secret-2:$accounts_version"
    )
  fi
  run gcloud run jobs update "$job" "${cloud[@]}" --image "$immutable_image" \
    --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 300s "${migration[@]}"
  run gcloud run jobs execute "$job" "${cloud[@]}" --wait
)

run gcloud run services update "$team" "${cloud[@]}" --image "$immutable_image" \
  --command "" --args "" --port 8080 --min-instances 0 --max-instances 1 --memory 512Mi --cpu 1 \
  --update-env-vars "BETTER_AUTH_URL=$origin,NODE_ENV=production" \
  --update-secrets "BETTER_AUTH_SECRET=$team-app-secret-1:$auth_version" \
  --no-traffic --tag candidate

if [[ $dry_run == 1 ]]; then
  candidate_url="https://candidate---$team-example-as.a.run.app"
  revision="$team-example"
  run env -u SMOKE_EMAIL -u SMOKE_PASSWORD python3 "$smoke_test" "$candidate_url"
else
  service_json=$(gcloud run services describe "$team" "${cloud[@]}" --format=json)
  revision=$(jq -er '.status.traffic[] | select(.tag == "candidate") | .revisionName' <<< "$service_json")
  [[ $revision =~ ^sd31d6c61-[a-z0-9-]+$ ]] || fail 'Expected a candidate revision for the assigned service.'
  candidate_url=$(jq -er '.status.traffic[] | select(.tag == "candidate") | .url' <<< "$service_json")
  service_origin "$candidate_url" || fail 'Expected the direct HTTPS URL for the candidate revision.'
  env -u SMOKE_EMAIL -u SMOKE_PASSWORD python3 "$smoke_test" "$candidate_url"
fi

run gcloud run services update-traffic "$team" "${cloud[@]}" --to-revisions "$revision=100"
if [[ $dry_run == 0 ]]; then
  if [[ -n ${GITHUB_ENV:-} ]]; then
    printf 'SERVICE_URL=%s\nDEPLOYED_IMAGE=%s\n' "$origin" "$immutable_image" >> "$GITHUB_ENV"
  fi
  {
    printf '### Habitarc demo deployment\n\n'
    printf -- '- Commit `%s`\n- Image `%s`\n- Revision `%s`\n- Migration job `%s`\n- URL %s\n' \
      "$sha" "$immutable_image" "$revision" "$job" "$origin"
    printf '%s\n' '- Anonymous sign-in page and session checks passed.'
  } | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
fi
