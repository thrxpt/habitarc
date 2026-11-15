#!/usr/bin/env bash
set -euo pipefail

# All values come from the reviewed production environment, never PR input.
for variable in GCP_PROJECT GCP_REGION ARTIFACT_REPOSITORY RUN_SERVICE \
  RUNTIME_SERVICE_ACCOUNT MIGRATION_SERVICE_ACCOUNT CLOUD_SQL_INSTANCE \
  AUTH_ORIGIN DATABASE_SECRET_VERSION MIGRATION_SECRET_VERSION AUTH_SECRET_VERSION \
  GITHUB_SHA GITHUB_STEP_SUMMARY; do
  if [[ -z ${!variable:-} ]]; then
    echo "Missing deployment setting: $variable" >&2
    exit 1
  fi
done
for version in "$DATABASE_SECRET_VERSION" "$MIGRATION_SECRET_VERSION" "$AUTH_SECRET_VERSION"; do
  if [[ ! $version =~ ^[1-9][0-9]*$ ]]; then
    echo 'Secret versions must be explicit positive version numbers.' >&2
    exit 1
  fi
done
if [[ $CLOUD_SQL_INSTANCE != "$GCP_PROJECT:$GCP_REGION:"* ]]; then
  echo 'Use same-project, same-region Cloud SQL.' >&2
  exit 1
fi
node --input-type=module -e '
  const origin = process.env.AUTH_ORIGIN;
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin) {
    throw new Error("Use a canonical HTTPS origin without a path or trailing slash.");
  }
'

registry="$GCP_REGION-docker.pkg.dev"
image="$registry/$GCP_PROJECT/$ARTIFACT_REPOSITORY/habitarc"
gcloud auth configure-docker "$registry" --quiet
docker load --input "$1"
revision_label=$(docker image inspect "habitarc:$GITHUB_SHA" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
if [[ $revision_label != "$GITHUB_SHA" ]]; then
  echo 'The tested image does not match this release commit.' >&2
  exit 1
fi
docker tag "habitarc:$GITHUB_SHA" "$image:$GITHUB_SHA"
docker push "$image:$GITHUB_SHA"
digest=$(gcloud artifacts docker images describe "$image:$GITHUB_SHA" --project "$GCP_PROJECT" --format='value(image_summary.digest)')
if [[ ! $digest =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'Artifact Registry did not return an immutable image digest.' >&2
  exit 1
fi
immutable_image="$image@$digest"
job="$RUN_SERVICE-migrate"

gcloud run jobs deploy "$job" --project "$GCP_PROJECT" --region "$GCP_REGION" \
  --image "$immutable_image" --service-account "$MIGRATION_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE" \
  --set-secrets "DATABASE_URL=habitarc-migration-database:$MIGRATION_SECRET_VERSION" \
  --command node --args dist/operators/migrate.mjs \
  --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 300s \
  --cpu 1 --memory 512Mi --quiet
gcloud run jobs execute "$job" --project "$GCP_PROJECT" --region "$GCP_REGION" --wait --quiet

# Keep existing traffic until the new revision starts and its HTTP smoke passes.
gcloud run deploy "$RUN_SERVICE" --project "$GCP_PROJECT" --region "$GCP_REGION" \
  --image "$immutable_image" --service-account "$RUNTIME_SERVICE_ACCOUNT" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE" \
  --set-env-vars "BETTER_AUTH_URL=$AUTH_ORIGIN" \
  --set-secrets "DATABASE_URL=habitarc-database:$DATABASE_SECRET_VERSION,BETTER_AUTH_SECRET=habitarc-auth:$AUTH_SECRET_VERSION" \
  --execution-environment gen2 --ingress all \
  --min 0 --max 2 --concurrency 20 --cpu 1 --memory 512Mi --timeout 60s \
  --no-traffic --tag candidate --quiet
service_json=$(gcloud run services describe "$RUN_SERVICE" --project "$GCP_PROJECT" --region "$GCP_REGION" --format=json)
revision=$(jq -er '.status.traffic[] | select(.tag == "candidate") | .revisionName' <<< "$service_json")
candidate_url=$(jq -er '.status.traffic[] | select(.tag == "candidate") | .url' <<< "$service_json")
curl --fail --silent --show-error --retry 3 "$candidate_url/" --output /dev/null
curl --fail --silent --show-error "$candidate_url/api/auth/get-session" | jq -e '. == null'
gcloud run services update-traffic "$RUN_SERVICE" --project "$GCP_PROJECT" --region "$GCP_REGION" --to-revisions "$revision=100" --quiet

{
  echo "Release commit: $GITHUB_SHA"
  echo "Image: $immutable_image"
  echo "Cloud Run revision: $revision"
  echo "Migration job: $job (completed before deployment)"
  echo "Origin: $AUTH_ORIGIN"
  echo 'Anonymous HTTP smoke passed. Complete the signed-in, restart, and ingress acceptance checks in docs/deployment.md.'
} >> "$GITHUB_STEP_SUMMARY"
