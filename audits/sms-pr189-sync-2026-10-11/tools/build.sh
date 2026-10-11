#!/bin/sh
# Usage: build.sh <worktree> <name>   -> report at /tmp/sms-sync/<name>-report.json, log at /tmp/sms-sync/state-<name>/run.log
wt="$1"; name="$2"
st="/tmp/sms-sync/state-$name"
mkdir -p "$st"
cd /Users/Ford/workspace/harnesses/gamecube-decomp-harness || exit 2
set -a; . config/local.env; set +a
unset ORCH_BUILD_EXECUTION
rm -f "/tmp/sms-sync/$name-report.json"
bun /tmp/sms-sync/tools/daytona-report.ts --game sms --repo-root "$wt" --state-dir "$st" --out "/tmp/sms-sync/$name-report.json" > "$st/run.log" 2>&1
rc=$?
if [ -f "/tmp/sms-sync/$name-report.json" ]; then echo "BUILD $name OK"; else echo "BUILD $name FAILED rc=$rc"; sh /tmp/sms-sync/tools/errs.sh "$st" 80; fi
