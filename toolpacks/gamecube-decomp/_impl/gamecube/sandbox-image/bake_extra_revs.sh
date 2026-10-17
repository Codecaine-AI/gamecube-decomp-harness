#!/usr/bin/env bash
# Bake extra commits into the image's shallow clone beside its baked HEAD.
#
#   bake_extra_revs.sh CHECKOUT SHALLOW_REPO REVS_FILE PROVENANCE_OUT
#
# REVS_FILE lists one revision per line (`#` starts a comment; blank lines are
# ignored), e.g. the output of extra-baked-revs.ts. Each one resolves to a full
# SHA in CHECKOUT (a revision the host lacks fails loudly, before anything is
# fetched), is fetched into SHALLOW_REPO at depth 1 and keeps a real ref
# (refs/baked-extra/<sha>) so build-context uploads and git never drop it.
# PROVENANCE_OUT receives the sorted, de-duplicated full SHAs.
#
# The fetch names raw SHAs, which a protocol-v0 upload-pack refuses unless
# uploadpack.allowAnySHA1InWant is set on its side; a client `-c` does not
# reach a local upload-pack, so the setting rides in --upload-pack.
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

[ "$#" -eq 4 ] || die "usage: $0 CHECKOUT SHALLOW_REPO REVS_FILE PROVENANCE_OUT"
CHECKOUT=$1
SHALLOW_REPO=$2
REVS_FILE=$3
PROVENANCE_OUT=$4
[ -f "$REVS_FILE" ] || die "extra revisions file is missing: $REVS_FILE"

RESOLVED=()
MISSING=()
while IFS= read -r line || [ -n "$line" ]; do
  rev=${line%%#*}
  rev=$(printf '%s' "$rev" | tr -d '[:space:]')
  [ -n "$rev" ] || continue
  case $rev in
    *[!0-9a-fA-F]*) MISSING+=("$rev (not a SHA)"); continue ;;
  esac
  if sha=$(git -C "$CHECKOUT" rev-parse --verify --quiet "$rev^{commit}"); then
    RESOLVED+=("$sha")
  else
    MISSING+=("$rev")
  fi
done < "$REVS_FILE"
[ "${#MISSING[@]}" -eq 0 ] || die "extra baked revisions are not commits in $CHECKOUT: ${MISSING[*]}"

: > "$PROVENANCE_OUT"
[ "${#RESOLVED[@]}" -gt 0 ] || { echo "No extra baked revisions listed in $REVS_FILE" >&2; exit 0; }
SHAS=()
while IFS= read -r sha; do SHAS+=("$sha"); done < <(printf '%s\n' "${RESOLVED[@]}" | LC_ALL=C sort -u)

FETCH=()
for sha in "${SHAS[@]}"; do
  git -C "$SHALLOW_REPO" cat-file -e "$sha^{commit}" 2>/dev/null || FETCH+=("$sha")
done
echo "Baking ${#SHAS[@]} extra revision(s) (${#FETCH[@]} to fetch) into the shallow clone..." >&2
if [ "${#FETCH[@]}" -gt 0 ]; then
  git -C "$SHALLOW_REPO" fetch --quiet --depth 1 --no-tags \
    --upload-pack 'git -c uploadpack.allowAnySHA1InWant=true upload-pack' \
    "file://$CHECKOUT" "${FETCH[@]}" || die "fetching extra baked revisions from $CHECKOUT failed"
fi
for sha in "${SHAS[@]}"; do
  git -C "$SHALLOW_REPO" cat-file -e "$sha^{commit}" 2>/dev/null || die "extra baked revision $sha is missing after fetch"
  git -C "$SHALLOW_REPO" update-ref "refs/baked-extra/$sha" "$sha"
done
printf '%s\n' "${SHAS[@]}" > "$PROVENANCE_OUT"
