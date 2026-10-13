#!/bin/sh
# snap.sh <name>: snapshot pr189-sync working tree (vs fede613d) into worktree /tmp/sms-sync-<name>, then build it in Daytona in background.
set -e
name=$1; src=/Users/Ford/workspace/harnesses/gamecube-decomp-harness/games/sms/workspace/pr189-sync; wt=/tmp/sms-sync-$name
co=/Users/Ford/workspace/harnesses/gamecube-decomp-harness/games/sms/workspace/checkout
[ -d "$wt" ] || git -C $co worktree add --detach "$wt" fede613d >/dev/null 2>&1
git -C "$wt" reset -q --hard fede613d; git -C "$wt" clean -fdq -e build -e build.ninja -e objdiff.json -e compile_commands.json
git -C $src diff --binary fede613d > /tmp/sms-sync/$name.patch
git -C "$wt" apply --index --binary /tmp/sms-sync/$name.patch
echo "snapshot $name: $(git -C "$wt" diff --cached --stat fede613d | tail -1)"
