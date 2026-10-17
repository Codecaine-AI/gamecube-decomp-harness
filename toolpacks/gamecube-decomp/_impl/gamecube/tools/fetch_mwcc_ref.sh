#!/usr/bin/env bash
# Fetch the pinned MWCC compiler source (rayanht/mwcc) searched by
# `evidence_search.py compiler` (real_code_evidence, command compiler).
#
# Usage: fetch_mwcc_ref.sh [--strip-git] [--source <git url | local clone>] [dest]
#   dest     defaults to $ORCH_GAME_STATE_DIR/refs/mwcc (the host ref path).
#            The sandbox image puts it at /opt/mwcc:
#              fetch_mwcc_ref.sh --strip-git /opt/mwcc
#            and links <checkout>/../mwcc to it.
#   --source fetch the locked commit from another remote or a local clone
#            (e.g. the clone an image build stage already made); the result is
#            still checked against the locked commit.
#   --strip-git  remove dest/.git after the checkout (images). The commit stays
#            recorded in dest/.mwcc-ref.
#   MWCC_REF_LOCK overrides the lock file (default mwcc_ref.lock.json here).
#
# dest becomes a shallow (depth 1), blob-filtered, sparse checkout of the
# locked commit limited to the locked paths, plus dest/.mwcc-ref, a JSON stamp
# {"repo","commit","paths"}. A dest whose stamp (and .git HEAD, when kept)
# already names the locked commit is left alone; anything else is replaced.
# Read-only reference data: nothing here is built (the traced compilers come
# from compiler/mwcc_alloc/native/build.sh).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
lock="${MWCC_REF_LOCK:-$here/mwcc_ref.lock.json}"
strip_git=0
source_override=""
dest=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --strip-git) strip_git=1; shift ;;
    --source) source_override="${2:?--source needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) dest="$1"; shift ;;
  esac
done
dest="${dest:-${ORCH_GAME_STATE_DIR:+$ORCH_GAME_STATE_DIR/refs/mwcc}}"
if [[ -z "$dest" ]]; then
  echo "usage: $0 [--strip-git] [--source <repo>] [dest]  (or set ORCH_GAME_STATE_DIR)" >&2
  exit 2
fi

# repo, commit, then the sparse paths, tab-separated.
IFS=$'\t' read -r -a entry <<<"$(python3 - "$lock" <<'PY'
import json, sys
mwcc = json.load(open(sys.argv[1], encoding="utf-8"))["mwcc"]
print("\t".join([mwcc["repo"], mwcc["commit"], *mwcc["paths"]]))
PY
)"
repo="${entry[0]}"
commit="${entry[1]}"
paths=("${entry[@]:2}")
remote="${source_override:-$repo}"
# A local clone is fetched over file:// so --depth works.
if [[ -d "$remote" ]]; then
  remote="file://$(cd "$remote" && pwd)"
fi

stamp_commit() {
  python3 - "$1/.mwcc-ref" <<'PY' 2>/dev/null || true
import json, sys
print(json.load(open(sys.argv[1], encoding="utf-8")).get("commit", ""))
PY
}

if [[ -f "$dest/.mwcc-ref" ]] && [[ "$(stamp_commit "$dest")" == "$commit" ]]; then
  if [[ ! -d "$dest/.git" ]] || [[ "$(git -C "$dest" rev-parse HEAD 2>/dev/null || true)" == "$commit" ]]; then
    echo "mwcc: already at ${commit:0:8} -> $dest"
    exit 0
  fi
fi

parent="$(dirname "$dest")"
mkdir -p "$parent"
work="$(mktemp -d "$parent/.mwcc.XXXXXX")"
trap 'rm -rf "$work"' EXIT
git -C "$work" init -q
git -C "$work" remote add origin "$remote"
git -C "$work" config remote.origin.promisor true
git -C "$work" config remote.origin.partialclonefilter blob:none
git -C "$work" sparse-checkout init --cone
git -C "$work" sparse-checkout set "${paths[@]}"
git -C "$work" fetch -q --depth 1 --filter=blob:none origin "$commit"
git -C "$work" checkout -q --detach FETCH_HEAD
got="$(git -C "$work" rev-parse HEAD)"
if [[ "$got" != "$commit" ]]; then
  echo "mwcc: fetched $got, expected $commit" >&2
  exit 1
fi
for path in "${paths[@]}"; do
  if [[ ! -d "$work/$path" ]]; then
    echo "mwcc: $commit has no $path/" >&2
    exit 1
  fi
done
python3 - "$work/.mwcc-ref" "$repo" "$commit" "${paths[@]}" <<'PY'
import json, sys
out, repo, commit, *paths = sys.argv[1:]
with open(out, "w", encoding="utf-8") as handle:
    json.dump({"repo": repo, "commit": commit, "paths": paths}, handle)
    handle.write("\n")
PY
if [[ "$strip_git" == 1 ]]; then
  rm -rf "$work/.git"
fi
# mktemp makes the directory 0700; the sandbox user reads an image copy.
chmod 755 "$work"
rm -rf "$dest"
mv "$work" "$dest"
trap - EXIT
echo "mwcc: ${commit:0:8} -> $dest (${paths[*]})"
