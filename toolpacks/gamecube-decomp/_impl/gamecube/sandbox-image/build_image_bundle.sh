#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --harness-root PATH --checkout PATH --out bundle.tar.zst" >&2
  exit 2
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

warn() {
  echo "WARNING: $*" >&2
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die "need sha256sum or shasum"
  fi
}

require_file() {
  [ -f "$1" ] || die "required file is missing: $1"
}

require_dir() {
  [ -d "$1" ] || die "required directory is missing: $1"
  [ -n "$(find "$1" -type f -print -quit)" ] || die "required directory is empty: $1"
}

HARNESS_ROOT=
CHECKOUT=
OUT=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --harness-root) [ "$#" -ge 2 ] || usage; HARNESS_ROOT=$2; shift 2 ;;
    --checkout) [ "$#" -ge 2 ] || usage; CHECKOUT=$2; shift 2 ;;
    --out) [ "$#" -ge 2 ] || usage; OUT=$2; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$HARNESS_ROOT" ] && [ -n "$CHECKOUT" ] && [ -n "$OUT" ] || usage
HARNESS_ROOT=$(cd "$HARNESS_ROOT" && pwd -P) || die "invalid harness root"
CHECKOUT=$(cd "$CHECKOUT" && pwd -P) || die "invalid checkout"
OUT_DIR=$(dirname "$OUT")
mkdir -p "$OUT_DIR"
OUT_DIR=$(cd "$OUT_DIR" && pwd -P) || die "invalid output directory"
OUT="$OUT_DIR/$(basename "$OUT")"
[ "$OUT" != "$CHECKOUT" ] || die "output cannot be the checkout"
command -v zstd >/dev/null 2>&1 || die "zstd is required to write .tar.zst"

STATE_TOOLS="$HARNESS_ROOT/projects/melee/state/tools"
IMPL="$HARNESS_ROOT/toolpacks/gamecube-decomp/_impl/gamecube"
WIBO_DIR="$STATE_TOOLS/wibo-1.2.0-opt1"
OBJDIFF_DIR="$STATE_TOOLS/objdiff-cli-3.6.1-score"
WIBO="$WIBO_DIR/wibo-linux-i686"
LINUX_OBJDIFF="$OBJDIFF_DIR/objdiff-cli-linux-x86_64"
CACHE_SHIM="$IMPL/tools/mwcc_objcache.py"
CACHE_INSTALLER="$IMPL/tools/install_mwcc_cache.py"

require_file "$WIBO"
require_file "$WIBO_DIR/README.md"
require_file "$WIBO_DIR/wibo-opt-vs-upstream-e8f4795.patch"
require_file "$OBJDIFF_DIR/README.md"
require_file "$CACHE_SHIM"
require_file "$CACHE_INSTALLER"
require_file "$CHECKOUT/configure.py"
require_file "$CHECKOUT/tools/download_tool.py"
require_file "$CHECKOUT/build.ninja"
require_file "$CHECKOUT/build/GALE01/report.json"
require_file "$CHECKOUT/build/tools/sjiswrap.exe"
require_dir "$CHECKOUT/build/compilers"
require_dir "$CHECKOUT/build/binutils"
[ -n "$(find "$CHECKOUT/build" -type f -name '*.o' -print -quit)" ] || \
  die "checkout has no built object files under build/"

if [ ! -f "$LINUX_OBJDIFF" ]; then
  warn "Linux score-server objdiff-cli is not built: $LINUX_OBJDIFF"
  warn "Build it from the patched v3.6.1 checkout with: cargo build --release --target x86_64-unknown-linux-musl"
fi

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/melee-image-bundle.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM
PAYLOAD="$TMP_ROOT/daytona-melee-image"
mkdir -p "$PAYLOAD/melee" "$PAYLOAD/provenance/wibo-1.2.0-opt1" \
  "$PAYLOAD/provenance/objdiff-cli-3.6.1-score" "$PAYLOAD/image-tools"

echo "Copying configured Melee checkout..." >&2
# A live macOS checkout can contain Git's fsmonitor Unix socket. It is transient,
# cannot be archived, and must not prevent packaging the remaining Git metadata.
tar -C "$CHECKOUT" --exclude='./.git/fsmonitor--daemon.ipc' -cf - . | \
  tar -C "$PAYLOAD/melee" -xf -
cp -a "$WIBO_DIR/README.md" "$WIBO_DIR/wibo-opt-vs-upstream-e8f4795.patch" \
  "$PAYLOAD/provenance/wibo-1.2.0-opt1/"
cp -a "$OBJDIFF_DIR/README.md" "$PAYLOAD/provenance/objdiff-cli-3.6.1-score/"
cp -a "$CACHE_SHIM" "$CACHE_INSTALLER" "$PAYLOAD/image-tools/"

# The optimized Linux wibo is the real executable. The image-side cache
# installer will rename it to wibo-real and install the shim at this path.
cp -a "$WIBO" "$PAYLOAD/melee/build/tools/wibo"
if [ -f "$LINUX_OBJDIFF" ]; then
  cp -a "$LINUX_OBJDIFF" "$PAYLOAD/melee/build/tools/objdiff-cli"
  cp -a "$LINUX_OBJDIFF" "$PAYLOAD/provenance/objdiff-cli-3.6.1-score/"
fi

echo "Artifact SHA-256:" >&2
for artifact in \
  "$PAYLOAD/melee/build/tools/wibo" \
  "$PAYLOAD/melee/build/tools/sjiswrap.exe" \
  "$PAYLOAD/melee/build/GALE01/report.json" \
  "$PAYLOAD/image-tools/mwcc_objcache.py" \
  "$PAYLOAD/image-tools/install_mwcc_cache.py"; do
  printf '%s  %s\n' "$(sha256_file "$artifact")" "${artifact#"$PAYLOAD"/}"
done
if [ -f "$LINUX_OBJDIFF" ]; then
  printf '%s  %s\n' "$(sha256_file "$PAYLOAD/melee/build/tools/objdiff-cli")" \
    "melee/build/tools/objdiff-cli"
fi

(cd "$TMP_ROOT" && tar -cf - daytona-melee-image) | zstd -T0 -f -o "$OUT"
printf '%s  %s\n' "$(sha256_file "$OUT")" "$OUT"
echo "Wrote $OUT" >&2
