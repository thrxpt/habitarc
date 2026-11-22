#!/usr/bin/env bash
set -euo pipefail

# Preview the same release run that GitHub Actions invokes after validation.
export DRY_RUN=1
exec bash "$(dirname "$0")/release.sh" "$@"
