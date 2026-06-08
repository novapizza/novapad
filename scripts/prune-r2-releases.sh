#!/usr/bin/env bash
#
# Prune old NovaPad release artifacts from the R2 (S3-compatible) bucket,
# keeping only the newest KEEP versions. Run after a release publishes.
#
# Why keep 2 and not 1: electron-updater's differential download needs the
# *previous* version's .blockmap to delta-patch from N-1 to N. Keeping the
# last two versions preserves delta updates; older versions are dead weight.
#
# Only versioned artifacts are eligible for deletion:
#   NovaPad-Setup-<ver>.exe[.blockmap]      (Windows NSIS)
#   NovaPad-<ver>-mac-<arch>.zip[.blockmap] (macOS zip — used by the updater)
# Unversioned keys are NEVER touched:
#   latest.yml / latest-mac.yml / latest-mac-arm64.yml (update manifests)
#   NovaPad-<arch>.dmg                                  (overwritten each build)
# A key with no extractable X.Y.Z is skipped by design — that is the safety net
# protecting the manifests and DMGs.
#
# Env (set by CI):
#   R2_RELEASES_ACCOUNT_ID, R2_RELEASES_BUCKET
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# Optional:
#   KEEP     number of versions to retain (default 2)
#   DRY_RUN  "1" to print deletions without executing (default 0)
#
set -euo pipefail

KEEP="${KEEP:-2}"
DRY_RUN="${DRY_RUN:-0}"
ENDPOINT="https://${R2_RELEASES_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_DEFAULT_REGION="auto"

aws_s3() { aws s3api "$@" --endpoint-url "$ENDPOINT"; }

echo "Listing objects in bucket '${R2_RELEASES_BUCKET}'…"
mapfile -t KEYS < <(
  aws_s3 list-objects-v2 --bucket "$R2_RELEASES_BUCKET" \
    --query 'Contents[].Key' --output text | tr '\t' '\n' | sed '/^$/d'
)
echo "Found ${#KEYS[@]} object(s)."

# Distinct versions present, newest first (semver sort via sort -V).
mapfile -t VERSIONS < <(
  printf '%s\n' "${KEYS[@]}" \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' \
    | sort -uV -r
)

if [ "${#VERSIONS[@]}" -le "$KEEP" ]; then
  echo "Only ${#VERSIONS[@]} version(s) present (<= KEEP=${KEEP}). Nothing to prune."
  exit 0
fi

KEEP_VERSIONS=("${VERSIONS[@]:0:$KEEP}")
PRUNE_VERSIONS=("${VERSIONS[@]:$KEEP}")
echo "Keeping: ${KEEP_VERSIONS[*]}"
echo "Pruning: ${PRUNE_VERSIONS[*]}"

in_keep() {
  local v
  for v in "${KEEP_VERSIONS[@]}"; do [ "$v" = "$1" ] && return 0; done
  return 1
}

DELETE_KEYS=()
for key in "${KEYS[@]}"; do
  ver="$(printf '%s' "$key" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
  # No version in the key (manifests, dmg) → never delete.
  [ -z "$ver" ] && continue
  in_keep "$ver" || DELETE_KEYS+=("$key")
done

if [ "${#DELETE_KEYS[@]}" -eq 0 ]; then
  echo "No stale keys to delete."
  exit 0
fi

echo "Will delete ${#DELETE_KEYS[@]} key(s):"
printf '  %s\n' "${DELETE_KEYS[@]}"

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN=1 — no objects deleted."
  exit 0
fi

# delete-objects takes a batch of up to 1000 keys.
OBJECTS_JSON="$(printf '%s\n' "${DELETE_KEYS[@]}" \
  | jq -R '{Key: .}' | jq -s '{Objects: ., Quiet: false}')"

aws_s3 delete-objects --bucket "$R2_RELEASES_BUCKET" --delete "$OBJECTS_JSON"
echo "Pruned ${#DELETE_KEYS[@]} object(s)."
