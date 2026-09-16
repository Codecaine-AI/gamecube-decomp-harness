#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --harness-root PATH --game ID [--profile NAME] [--checkout PATH] --out bundle.tar.zst" >&2
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
GAME_ID=
PROFILE=
OUT=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --harness-root) [ "$#" -ge 2 ] || usage; HARNESS_ROOT=$2; shift 2 ;;
    --game) [ "$#" -ge 2 ] || usage; GAME_ID=$2; shift 2 ;;
    --profile) [ "$#" -ge 2 ] || usage; PROFILE=$2; shift 2 ;;
    --checkout) [ "$#" -ge 2 ] || usage; CHECKOUT=$2; shift 2 ;;
    --out) [ "$#" -ge 2 ] || usage; OUT=$2; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$HARNESS_ROOT" ] && [ -n "$GAME_ID" ] && [ -n "$OUT" ] || usage
HARNESS_ROOT=$(cd "$HARNESS_ROOT" && pwd -P) || die "invalid harness root"
command -v bun >/dev/null 2>&1 || die "bun is required to resolve the game descriptor"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
PLAN=$(bun "$SCRIPT_DIR/bundle-plan.ts" "$HARNESS_ROOT" "$GAME_ID" "$PROFILE" "$CHECKOUT") || die "invalid image configuration"
{
  IFS= read -r CHECKOUT
  IFS= read -r STATE_TOOLS
  IFS= read -r REPORT_PATH
  IFS= read -r PAYLOAD_NAME
  IFS= read -r WORKSPACE_ROOT
  IFS= read -r PLAN_JSON
} <<< "$PLAN"
CHECKOUT=$(cd "$CHECKOUT" && pwd -P) || die "invalid checkout"
OUT_DIR=$(dirname "$OUT")
mkdir -p "$OUT_DIR"
OUT_DIR=$(cd "$OUT_DIR" && pwd -P) || die "invalid output directory"
OUT="$OUT_DIR/$(basename "$OUT")"
[ "$OUT" != "$CHECKOUT" ] || die "output cannot be the checkout"
command -v zstd >/dev/null 2>&1 || die "zstd is required to write .tar.zst"

IMPL="$HARNESS_ROOT/toolpacks/gamecube-decomp/_impl/gamecube"
WIBO_DIR="$STATE_TOOLS/wibo-1.2.0-opt1"
OBJDIFF_DIR="$STATE_TOOLS/objdiff-cli-3.6.1-score"
WIBO="$WIBO_DIR/wibo-linux-i686"
STOCK_WIBO="$STATE_TOOLS/wibo-1.2.0-stock/wibo-i686"
LINUX_OBJDIFF="$OBJDIFF_DIR/objdiff-cli-linux-x86_64"
CACHE_SHIM="$IMPL/tools/mwcc_objcache.py"
CACHE_INSTALLER="$IMPL/tools/install_mwcc_cache.py"
MWCC_ALLOC_DIR="$HARNESS_ROOT/toolpacks/gamecube-decomp/compiler/mwcc_alloc/sandbox"
TOOLPACK_SOURCE="$HARNESS_ROOT/toolpacks/gamecube-decomp"

require_file "$WIBO"
require_file "$STOCK_WIBO"
require_file "$WIBO_DIR/README.md"
require_file "$WIBO_DIR/wibo-opt-vs-upstream-e8f4795.patch"
require_file "$OBJDIFF_DIR/README.md"
require_file "$CACHE_SHIM"
require_file "$CACHE_INSTALLER"
require_file "$MWCC_ALLOC_DIR/allocator_snapshot.py"
require_file "$MWCC_ALLOC_DIR/gdb_allocator_snapshot.py"
require_file "$MWCC_ALLOC_DIR/compare_coloring_snapshots.py"
require_file "$MWCC_ALLOC_DIR/mwcc_alloc_capture.py"
require_file "$MWCC_ALLOC_DIR/gdb_modern_capture.py"
require_file "$MWCC_ALLOC_DIR/../api/analyze.py"
require_file "$MWCC_ALLOC_DIR/../vendor/mwcc-decomp/PIN.json"
require_dir "$TOOLPACK_SOURCE"
require_file "$CHECKOUT/configure.py"
require_file "$CHECKOUT/tools/download_tool.py"
require_file "$CHECKOUT/build.ninja"
require_file "$CHECKOUT/$REPORT_PATH"
require_file "$CHECKOUT/build/tools/sjiswrap.exe"
require_dir "$CHECKOUT/build/compilers"
require_dir "$CHECKOUT/build/binutils"
[ -n "$(find "$CHECKOUT/build" -type f -name '*.o' -print -quit)" ] || \
  die "checkout has no built object files under build/"

if [ ! -f "$LINUX_OBJDIFF" ]; then
  warn "Linux score-server objdiff-cli is not built: $LINUX_OBJDIFF"
  warn "Build it from the patched v3.6.1 checkout with: cargo build --release --target x86_64-unknown-linux-musl"
fi

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/game-image-bundle.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM
PAYLOAD="$TMP_ROOT/$PAYLOAD_NAME"
SHALLOW_REPO="$TMP_ROOT/shallow"
mkdir -p "$PAYLOAD/checkout" "$PAYLOAD/provenance/wibo-1.2.0-opt1" \
  "$PAYLOAD/provenance/objdiff-cli-3.6.1-score" "$PAYLOAD/image-tools" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc" "$PAYLOAD/toolpacks/gamecube-decomp"

echo "Copying configured $GAME_ID checkout..." >&2
# Exclude measured local-development dead weight, including AI corpora that policy
# forbids in sandboxes. The live fsmonitor socket is transient and unarchivable.
tar -C "$CHECKOUT" \
  --exclude='./ai_docs' \
  --exclude='./local.env' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./.pi-sessions' \
  --exclude='./.pi-agent' \
  --exclude='./build/orchestrator-direct-compile' \
  --exclude='./build/mwcc-dump' \
  --exclude='./build/cargo' \
  --exclude='./.venv' \
  --exclude='./.cache' \
  --exclude='./.decomp-orchestrator-state' \
  --exclude='./.git' \
  --exclude='./.git/fsmonitor--daemon.ipc' \
  -cf - . | \
  tar -C "$PAYLOAD/checkout" -xf -

echo "Copying gamecube-decomp toolpack..." >&2
(
  cd "$TOOLPACK_SOURCE"
  find . \
    \( -path './_impl/gamecube/mwcc_debug' \
       -o -path './_impl/gamecube/sandbox-image' \
       -o \( -type d \( -name tests -o -name __pycache__ \) \) \) -prune \
    -o \( \( -type f -o -type l \) ! -name '*.pyc' \) -print0 | \
    tar --null -T - -cf -
) | \
  tar -C "$PAYLOAD/toolpacks/gamecube-decomp" -xf -

PAYLOAD_TOOLPACK="$PAYLOAD/toolpacks/gamecube-decomp"
require_file "$PAYLOAD_TOOLPACK/validation/checkdiff/api/run.py"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/checkdiff.py"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/permute.py"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/src_mutate.py"
require_file "$PAYLOAD_TOOLPACK/_shared/toolpack_runtime.py"

STAMP_INPUT="$TMP_ROOT/toolpack-stamp-input.txt"
(
  cd "$PAYLOAD_TOOLPACK"
  find . -type f ! -path './.ready' | LC_ALL=C sort | while IFS= read -r file; do
    printf '%s  %s\n' "$(sha256_file "$file")" "$file"
  done
) > "$STAMP_INPUT"
printf '%s\n' "$(sha256_file "$STAMP_INPUT")" > "$PAYLOAD_TOOLPACK/.ready"

BAKED_HEAD=$(git -C "$CHECKOUT" rev-parse --verify 'HEAD^{commit}')
git clone --quiet --depth 1 --no-checkout "file://$CHECKOUT" "$SHALLOW_REPO"
[ "$(git -C "$SHALLOW_REPO" rev-parse --verify 'HEAD^{commit}')" = "$BAKED_HEAD" ] || \
  die "shallow clone HEAD does not match checkout HEAD"
cp -a "$SHALLOW_REPO/.git" "$PAYLOAD/checkout/.git"
printf '%s\n' "$BAKED_HEAD" > "$PAYLOAD/provenance/baked-head.txt"
cp -a "$WIBO_DIR/README.md" "$WIBO_DIR/wibo-opt-vs-upstream-e8f4795.patch" \
  "$PAYLOAD/provenance/wibo-1.2.0-opt1/"
cp -a "$OBJDIFF_DIR/README.md" "$PAYLOAD/provenance/objdiff-cli-3.6.1-score/"
cp -a "$CACHE_SHIM" "$CACHE_INSTALLER" "$PAYLOAD/image-tools/"
cp -a "$SCRIPT_DIR/prepare_linux_image.py" "$PAYLOAD/image-tools/"
if [ -f "$HARNESS_ROOT/games/$GAME_ID/config/worker-image.json" ]; then
  cp -a "$HARNESS_ROOT/games/$GAME_ID/config/worker-image.json" "$PAYLOAD/image-tools/worker-image.json"
else
  printf '{}\n' > "$PAYLOAD/image-tools/worker-image.json"
fi
cp -a "$MWCC_ALLOC_DIR/allocator_snapshot.py" \
  "$MWCC_ALLOC_DIR/gdb_allocator_snapshot.py" \
  "$MWCC_ALLOC_DIR/gdb_modern_capture.py" \
  "$MWCC_ALLOC_DIR/compare_coloring_snapshots.py" \
  "$MWCC_ALLOC_DIR/mwcc_alloc_capture.py" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc/"
cp -a "$MWCC_ALLOC_DIR/../api/analyze.py" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc/mwcc_alloc_analyze.py"
cp -a "$MWCC_ALLOC_DIR/../vendor" "$PAYLOAD/checkout/build/tools/mwcc-alloc/"
find "$PAYLOAD/checkout/build/tools/mwcc-alloc/vendor" -name "*.pyc" -delete

# The optimized Linux wibo is the real executable. The image-side cache
# installer will rename it to wibo-real and install the shim at this path.
cp -a "$WIBO" "$PAYLOAD/checkout/build/tools/wibo"
# Stock wibo for qemu-based allocator captures; optimized wibo crashes under qemu-user.
cp -a "$STOCK_WIBO" "$PAYLOAD/checkout/build/tools/wibo-qemu"
if [ -f "$LINUX_OBJDIFF" ]; then
  cp -a "$LINUX_OBJDIFF" "$PAYLOAD/checkout/build/tools/objdiff-cli"
  cp -a "$LINUX_OBJDIFF" "$PAYLOAD/provenance/objdiff-cli-3.6.1-score/"
fi

echo "Artifact SHA-256:" >&2
for artifact in \
  "$PAYLOAD/checkout/build/tools/wibo" \
  "$PAYLOAD/checkout/build/tools/wibo-qemu" \
  "$PAYLOAD/checkout/build/tools/sjiswrap.exe" \
  "$PAYLOAD/checkout/$REPORT_PATH" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc/allocator_snapshot.py" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc/gdb_allocator_snapshot.py" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc/compare_coloring_snapshots.py" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc/mwcc_alloc_capture.py" \
  "$PAYLOAD/image-tools/mwcc_objcache.py" \
  "$PAYLOAD/image-tools/install_mwcc_cache.py"; do
  printf '%s  %s\n' "$(sha256_file "$artifact")" "${artifact#"$PAYLOAD"/}"
done
if [ -f "$LINUX_OBJDIFF" ]; then
  printf '%s  %s\n' "$(sha256_file "$PAYLOAD/checkout/build/tools/objdiff-cli")" \
    "checkout/build/tools/objdiff-cli"
fi

printf '%s\n' "$PLAN_JSON" > "$PAYLOAD/provenance/image-plan.json"
cp "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/.dockerignore" "$PAYLOAD/"
printf '%s\n' "$WORKSPACE_ROOT" > "$PAYLOAD/provenance/workspace-root.txt"
(cd "$TMP_ROOT" && tar -cf - "$PAYLOAD_NAME") | zstd -T0 -f -o "$OUT"
printf '%s  %s\n' "$(sha256_file "$OUT")" "$OUT"
echo "Wrote $OUT" >&2
