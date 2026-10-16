#!/usr/bin/env bash
# Dry-run steering backfill check for one shard of the SMS integration checkout.
# Read-only on the repo: `steering_check.py check` builds in shadow roots;
# the only write is ninja_compile's cache under build/.ninja_compile_cache.
# Resumable: a batch whose JSON exists is skipped. One compile job per shard
# (3 shards in parallel = 3 compiles, the build limit).
#
# usage: run_shard.sh <shard-index> [batch-size]
set -uo pipefail

SHARD="$1"
BATCH="${2:-3}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$(cd "$HERE/../../../toolpacks/gamecube-decomp/_impl/gamecube/tools" && pwd)"
# Host clone of the integration checkout at the same HEAD, with a fresh PCH and the
# link map (the live checkout's build/ comes from the Daytona sandbox and is stale).
REPO="${BACKFILL_REPO:-/tmp/sms-fence-repo}"
RUNS="${BACKFILL_RUNS:-runs}"
BATCH_TIMEOUT="${BATCH_TIMEOUT:-1200}"
BASE="81248bdac58da1ff74128ba8c3a3798372fa5371"
OUT="$HERE/$RUNS/shard$SHARD"
CACHE="$HERE/$RUNS/cache"
# MWCC runs under wibo: keep the shadow-root path short (Windows path limits
# truncate long include paths and the unit silently fails to build).
TMPROOT="/tmp/sbf/s$SHARD"
mkdir -p "$OUT" "$CACHE" "$TMPROOT"

SOURCES=(); while IFS= read -r l; do [[ -n "$l" ]] && SOURCES+=("$l"); done < "$HERE/shards/shard$SHARD.txt"
HEADERS=(); while IFS= read -r l; do [[ -n "$l" ]] && HEADERS+=("$l"); done < "$HERE/headers.txt"

n=0
for ((i = 0; i < ${#SOURCES[@]}; i += BATCH)); do
  n=$((n + 1))
  name=$(printf "batch%03d" "$n")
  [[ -s "$OUT/$name.json" ]] && continue
  files=("${SOURCES[@]:i:BATCH}")
  printf '%s\n' "${files[@]}" > "$OUT/$name.files"
  echo "[$(date +%H:%M:%S)] shard$SHARD $name: ${files[*]}"
  start=$SECONDS
  # perl alarm: macOS has no timeout(1); a hung batch fails instead of stalling the shard
  perl -e 'alarm shift; exec @ARGV' "$BATCH_TIMEOUT" python3 "$TOOLS/steering_check.py" check \
    --repo "$REPO" --oracle-repo "$REPO" --base-ref "$BASE" \
    --paths "${files[@]}" "${HEADERS[@]}" \
    --jobs 1 --budget-seconds 3600 --max-groups 4000 \
    --cache-dir "$CACHE" --tmp "$TMPROOT/$name" \
    --json --out "$OUT/$name.json" > "$OUT/$name.log" 2>&1
  rc=$?
  rm -rf "$TMPROOT/$name"
  echo "[$(date +%H:%M:%S)] shard$SHARD $name exit $rc in $((SECONDS - start))s"
  [[ $rc -ne 0 ]] && mv -f "$OUT/$name.json" "$OUT/$name.failed.json" 2>/dev/null
done
echo "shard$SHARD done"
