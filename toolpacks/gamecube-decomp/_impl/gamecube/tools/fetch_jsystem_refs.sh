#!/usr/bin/env bash
# Fetch the pinned JSystem reference sources used by `evidence_search.py jsystem`.
#
# Usage: fetch_jsystem_refs.sh [dest]
#   dest defaults to $ORCH_GAME_STATE_DIR/refs/jsystem.
#
# Each game in refs.lock.json becomes dest/<game>: a shallow (depth 1),
# blob-filtered, sparse checkout of the locked commit limited to the locked
# paths. A checkout already at the locked commit is left alone; a different
# commit is replaced. Read-only reference data: nothing here is built.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lock="$here/refs.lock.json"
dest="${1:-${ORCH_GAME_STATE_DIR:+$ORCH_GAME_STATE_DIR/refs/jsystem}}"
if [[ -z "$dest" ]]; then
  echo "usage: $0 [dest]  (or set ORCH_GAME_STATE_DIR)" >&2
  exit 2
fi
mkdir -p "$dest"

# One line per game: name, repo, commit, then the sparse paths.
entries="$(python3 - "$lock" <<'PY'
import json, sys
lock = json.load(open(sys.argv[1], encoding="utf-8"))
for name, entry in sorted(lock.items()):
    print("\t".join([name, entry["repo"], entry["commit"], *entry["paths"]]))
PY
)"

while IFS=$'\t' read -r name repo commit paths_line; do
  [[ -z "$name" ]] && continue
  IFS=$'\t' read -r -a paths <<<"$paths_line"
  target="$dest/$name"
  if [[ -d "$target/.git" ]] && [[ "$(git -C "$target" rev-parse HEAD 2>/dev/null || true)" == "$commit" ]]; then
    echo "$name: already at ${commit:0:8}"
    continue
  fi
  work="$(mktemp -d "$dest/.$name.XXXXXX")"
  trap 'rm -rf "$work"' EXIT
  git -C "$work" init -q
  git -C "$work" remote add origin "$repo"
  git -C "$work" config remote.origin.promisor true
  git -C "$work" config remote.origin.partialclonefilter blob:none
  git -C "$work" sparse-checkout init --cone
  git -C "$work" sparse-checkout set "${paths[@]}"
  git -C "$work" fetch -q --depth 1 --filter=blob:none origin "$commit"
  git -C "$work" checkout -q --detach FETCH_HEAD
  got="$(git -C "$work" rev-parse HEAD)"
  if [[ "$got" != "$commit" ]]; then
    echo "$name: fetched $got, expected $commit" >&2
    exit 1
  fi
  rm -rf "$target"
  mv "$work" "$target"
  trap - EXIT
  echo "$name: ${commit:0:8} -> $target (${paths[*]})"
done <<<"$entries"
