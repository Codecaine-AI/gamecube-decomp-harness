#!/usr/bin/env bash
# Print the content stamp of a baked tree: list every regular file under DIR
# except ./STAMP_NAME as `<sha256hex>  ./<path>` lines, sorted LC_ALL=C, and
# print the SHA-256 of that listing. This is the scheme of the toolpack `.ready`
# and `/opt/build-orchestrator/.qa-ready`; provisioning recomputes it on the
# host and skips the sync when the stamps match, so it must stay byte-identical.
#
# Usage: content_stamp.sh DIR STAMP_NAME
set -euo pipefail
[ "$#" -eq 2 ] || { echo "Usage: $0 DIR STAMP_NAME" >&2; exit 2; }
if command -v sha256sum >/dev/null 2>&1; then sha=(sha256sum); else sha=(shasum -a 256); fi
cd "$1"
find . -type f ! -path "./$2" | LC_ALL=C sort | while IFS= read -r file; do
  printf '%s  %s\n' "$("${sha[@]}" "$file" | awk '{print $1}')" "$file"
done | "${sha[@]}" | awk '{print $1}'
