#!/usr/bin/env bash
# usage: run_unused_one.sh <idx> <file> <qualified-function>
# UNUSED stub test in the isolated clone /tmp/sms-fence-repo (never the live checkout); 1 compile job.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$(cd "$HERE/../../../../toolpacks/gamecube-decomp/_impl/gamecube/tools" && pwd)"
REPO=/tmp/sms-fence-repo
OUT="$HERE/unused/$1.json"
[[ -s "$OUT" ]] && exit 0
start=$SECONDS
env -u ORCH_GAME_STATE_DIR ORCH_GAME_REPO_ROOT="$REPO" GIT_OPTIONAL_LOCKS=0 \
  python3 "$TOOLS/steering_check.py" unused-test --repo "$REPO" --base-ref 81248bdac58da1ff74128ba8c3a3798372fa5371 \
  --file "$2" --function "$3" --jobs 1 --tmp "/tmp/sms-fence-tmp/$1" --json --out "$OUT.tmp" > "$HERE/unused/$1.log" 2>&1
rc=$?
rm -rf "/tmp/sms-fence-tmp/$1"
if [[ -s "$OUT.tmp" ]]; then mv "$OUT.tmp" "$OUT"; else echo "{\"error\":\"exit $rc\",\"file\":\"$2\",\"function\":\"$3\"}" > "$OUT.failed"; fi
echo "[$(date +%H:%M:%S)] $1 $3 rc=$rc $((SECONDS-start))s"
