#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --harness-root PATH --game ID [--profile NAME] [--checkout PATH]" >&2
  echo "       [--traced-compilers DIR] [--allow-disabled-traced] [--extra-revs-file FILE] --out bundle.tar.zst" >&2
  echo "  --traced-compilers  prebuilt traced MWCC with evidence (default games/<id>/runtime/tool-data/mwcc_native)" >&2
  echo "  --allow-disabled-traced  warn instead of failing when the evidence gate disables a version" >&2
  echo "                     the game requires (worker-image.json traced_compilers.required)" >&2
  echo "  --extra-revs-file  revisions to bake beside HEAD (one per line, # comments; default \$EXTRA_BAKED_REVS_FILE)" >&2
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
TRACED_OVERRIDE=
ALLOW_DISABLED_TRACED=0
EXTRA_REVS_FILE=${EXTRA_BAKED_REVS_FILE:-}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --harness-root) [ "$#" -ge 2 ] || usage; HARNESS_ROOT=$2; shift 2 ;;
    --game) [ "$#" -ge 2 ] || usage; GAME_ID=$2; shift 2 ;;
    --profile) [ "$#" -ge 2 ] || usage; PROFILE=$2; shift 2 ;;
    --checkout) [ "$#" -ge 2 ] || usage; CHECKOUT=$2; shift 2 ;;
    --out) [ "$#" -ge 2 ] || usage; OUT=$2; shift 2 ;;
    --traced-compilers) [ "$#" -ge 2 ] || usage; TRACED_OVERRIDE=$2; shift 2 ;;
    --allow-disabled-traced) ALLOW_DISABLED_TRACED=1; shift ;;
    --extra-revs-file) [ "$#" -ge 2 ] || usage; EXTRA_REVS_FILE=$2; shift 2 ;;
    -h|--help) usage ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$HARNESS_ROOT" ] && [ -n "$GAME_ID" ] && [ -n "$OUT" ] || usage
if [ -n "$EXTRA_REVS_FILE" ]; then
  [ -f "$EXTRA_REVS_FILE" ] || die "extra revisions file is missing: $EXTRA_REVS_FILE"
  EXTRA_REVS_FILE="$(cd "$(dirname "$EXTRA_REVS_FILE")" && pwd -P)/$(basename "$EXTRA_REVS_FILE")"
fi
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
  IFS= read -r SYMBOL_CHECK_MAP
  IFS= read -r DISC_DIR
  IFS= read -r TRACED_DIR
  IFS= read -r TRACED_VERSIONS
  IFS= read -r TRACED_REQUIRED
  IFS= read -r TRACED_REQUIREMENTS_JSON
  IFS= read -r ASM_WINDOW_TOOL_ID
  IFS= read -r ASM_WINDOW_DATA_ROOT
  IFS= read -r ASM_WINDOW_FILES
  IFS= read -r PLAN_JSON
} <<< "$PLAN"
if [ -n "$TRACED_OVERRIDE" ]; then
  TRACED_DIR=$(cd "$TRACED_OVERRIDE" && pwd -P) || die "invalid --traced-compilers directory: $TRACED_OVERRIDE"
fi
# A version the game requires but the image would not enable fails the bundle
# unless --allow-disabled-traced downgrades it to a warning.
traced_shortfall() {
  if [ "$ALLOW_DISABLED_TRACED" = 1 ]; then warn "$*"; else die "$* (pass --allow-disabled-traced to bake anyway)"; fi
}
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
GLOBAL_STANDARDS_REL="knowledge/global/sources/injectable/decomp_standards/standards"
GAME_STANDARDS_REL="games/$GAME_ID/knowledge/sources/injectable/decomp_standards/standards"
GLOBAL_STANDARDS="$HARNESS_ROOT/$GLOBAL_STANDARDS_REL"
GAME_STANDARDS="$HARNESS_ROOT/$GAME_STANDARDS_REL"
GAME_DESCRIPTOR="$HARNESS_ROOT/games/$GAME_ID/game.json"

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
require_dir "$GLOBAL_STANDARDS"
require_dir "$GAME_STANDARDS"
require_file "$GAME_DESCRIPTOR"
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
  "$PAYLOAD/provenance/objdiff-cli-3.6.1-score" "$PAYLOAD/image-tools" "$PAYLOAD/traced-compilers" \
  "$PAYLOAD/checkout/build/tools/mwcc-alloc" "$PAYLOAD/toolpacks/gamecube-decomp"

echo "Copying configured $GAME_ID checkout..." >&2
# Exclude measured local-development dead weight, including AI corpora that policy
# forbids in sandboxes. The live fsmonitor socket is transient and unarchivable.
# Follow symlinks (-h): checkouts link orig/<version>/sys/* to a shared
# repository tree, and the image needs the real disc files.
tar -h -C "$CHECKOUT" \
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
  --exclude='*.rvz' \
  --exclude='*.iso' \
  --exclude='*.gcm' \
  --exclude='*.ciso' \
  --exclude='*.wia' \
  -cf - . | \
  tar -C "$PAYLOAD/checkout" -xf -

# The map-symbol validator (tools/check-changed-symbol-order.py) reads the
# linker map out of the extracted disc. Upstream CI gets it from its build
# container's /orig; the image gets exactly that one file, extracted from the
# disc image in orig/<version>/ with the checkout's dtk. The disc image itself
# stays excluded above.
if [ -n "$SYMBOL_CHECK_MAP" ]; then
  echo "Staging symbol-check linker map $SYMBOL_CHECK_MAP..." >&2
  mkdir -p "$PAYLOAD/checkout/$(dirname "$SYMBOL_CHECK_MAP")"
  if [ -f "$CHECKOUT/$SYMBOL_CHECK_MAP" ]; then
    cp -a "$CHECKOUT/$SYMBOL_CHECK_MAP" "$PAYLOAD/checkout/$SYMBOL_CHECK_MAP"
  else
    DISC_IMAGE=$(find "$CHECKOUT/$DISC_DIR" -maxdepth 1 -type f \( -name '*.rvz' -o -name '*.iso' -o -name '*.gcm' -o -name '*.ciso' -o -name '*.wia' \) -print -quit)
    [ -n "$DISC_IMAGE" ] || die "no disc image under $CHECKOUT/$DISC_DIR to extract $SYMBOL_CHECK_MAP from"
    if [ -x "$CHECKOUT/build/tools/dtk" ]; then DTK="$CHECKOUT/build/tools/dtk"; else DTK=$(command -v dtk || true); fi
    [ -n "$DTK" ] || die "dtk is required to extract $SYMBOL_CHECK_MAP (configure the checkout or put dtk on PATH)"
    DISC_EXTRACT="$TMP_ROOT/disc-extract"
    "$DTK" disc extract "$DISC_IMAGE" "$DISC_EXTRACT" > "$TMP_ROOT/disc-extract.log" 2>&1 || \
      die "dtk disc extract failed: $(tail -5 "$TMP_ROOT/disc-extract.log")"
    MAP_IN_DISC="$DISC_EXTRACT/${SYMBOL_CHECK_MAP#"$DISC_DIR"/}"
    require_file "$MAP_IN_DISC"
    cp -a "$MAP_IN_DISC" "$PAYLOAD/checkout/$SYMBOL_CHECK_MAP"
    rm -rf "$DISC_EXTRACT"
  fi
  require_file "$PAYLOAD/checkout/$SYMBOL_CHECK_MAP"
fi

# tar -h also dereferenced tracked symlinks; restore those so the packaged tree
# matches the commit (git records them as links, not file contents).
git -C "$CHECKOUT" ls-files -s -z | while IFS= read -r -d '' entry; do
  case "$entry" in
    120000\ *) link=${entry#*$'\t'}; target=$(readlink "$CHECKOUT/$link") || continue
      rm -rf "$PAYLOAD/checkout/$link" && ln -s "$target" "$PAYLOAD/checkout/$link" ;;
  esac
done

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

echo "Copying global and $GAME_ID standards..." >&2
# review_lint composes the global standards with the game's own slice. The
# image carries both under /opt (ORCH_PACKAGE_ROOT) for in-sandbox tool use;
# job-time uploads under /opt/build-orchestrator still take precedence.
# Harness trees go through copy_tree_within.py: it dereferences symlinks (slices
# may link rules.py into the toolpack tree, and a relative link is dangling once
# the tree is relocated into the image), but inventories every file it would
# follow, nested directory links included, and refuses any whose real path
# leaves the harness root, or a link loop, before copying anything.
copy_within() { python3 "$SCRIPT_DIR/copy_tree_within.py" "$HARNESS_ROOT" "$@" || die "refusing to bake ${1#"$HARNESS_ROOT"/}"; }
copy_within "$GLOBAL_STANDARDS" "$PAYLOAD/$GLOBAL_STANDARDS_REL" --exclude __pycache__ --exclude '*.pyc'
copy_within "$GAME_STANDARDS" "$PAYLOAD/$GAME_STANDARDS_REL" --exclude __pycache__ --exclude '*.pyc'
copy_within "$GAME_DESCRIPTOR" "$PAYLOAD/games/$GAME_ID/game.json"

echo "Copying worker QA-lint assets..." >&2
# The layout validation/build/daytona.ts uploads for QA tasks, baked at
# /opt/build-orchestrator with its .qa-ready stamp so provisioning can skip the
# per-sandbox QA sync. Banned-pattern data is Melee review-corpus data, so
# Melee's game descriptor and data always ride along. Optional trees may be
# absent. Nothing else may live here, or the host and baked stamps differ.
QA="$PAYLOAD/build-orchestrator"
# Same exclusions as provisioning's host-side stamp (any entry, file or
# directory); a symlink leaving the harness root is refused there too.
stage_qa() {
  copy_within "$HARNESS_ROOT/$1" "$QA/$1" --exclude __pycache__ --exclude '*.env' --exclude '*.pyc'
}
mkdir -p "$QA"
stage_qa "$GLOBAL_STANDARDS_REL"
for qa_game in "$GAME_ID" melee; do
  [ -f "$HARNESS_ROOT/games/$qa_game/game.json" ] || { [ "$qa_game" = melee ] && continue; die "missing games/$qa_game/game.json"; }
  mkdir -p "$QA/games/$qa_game"
  stage_qa "games/$qa_game/game.json"
  stage_qa "games/$qa_game/knowledge/sources/injectable/banned_patterns/data"
  if [ "$qa_game" = "$GAME_ID" ]; then
    stage_qa "games/$qa_game/config"
    stage_qa "games/$qa_game/knowledge/sources/injectable/decomp_standards/standards"
  fi
done
printf '%s\n' "$(bash "$SCRIPT_DIR/content_stamp.sh" "$QA" .qa-ready)" > "$QA/.qa-ready"

PAYLOAD_TOOLPACK="$PAYLOAD/toolpacks/gamecube-decomp"
require_file "$PAYLOAD_TOOLPACK/validation/checkdiff/api/run.py"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/checkdiff.py"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/permute.py"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/src_mutate.py"
require_file "$PAYLOAD_TOOLPACK/_shared/toolpack_runtime.py"
# The image's pinned-sources stage fetches /opt/mwcc and /opt/refs/jsystem from
# these locks; the traced-compilers stage reads compiler/mwcc_alloc/native.
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/mwcc_ref.lock.json"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/fetch_mwcc_ref.sh"
require_file "$PAYLOAD_TOOLPACK/_impl/gamecube/tools/refs.lock.json"
require_dir "$PAYLOAD_TOOLPACK/compiler/mwcc_alloc/native"

printf '%s\n' "$(bash "$SCRIPT_DIR/content_stamp.sh" "$PAYLOAD_TOOLPACK" .ready)" > "$PAYLOAD_TOOLPACK/.ready"
# Provisioning skips the toolpack sync when the host stamp equals the baked one.
cp "$PAYLOAD_TOOLPACK/.ready" "$PAYLOAD/provenance/toolpack-stamp.txt"
cp "$QA/.qa-ready" "$PAYLOAD/provenance/qa-stamp.txt"

# Traced compilers are built outside git (compiler/mwcc_alloc/native/build.sh)
# into the game's tool-data. Stage them only when every version is present;
# otherwise the image's traced-compilers stage builds them itself.
IFS=, read -r -a TRACED_VERSION_LIST <<< "$TRACED_VERSIONS"
TRACED_MISSING=()
[ -f "$TRACED_DIR/CAPABILITIES.json" ] || TRACED_MISSING+=("CAPABILITIES.json")
for ver in "${TRACED_VERSION_LIST[@]}"; do
  # build.sh writes <ver>/mwcceppc.exe with its lmgr326b.dll; the exe needs the DLL beside it.
  for file in mwcceppc.exe lmgr326b.dll; do
    [ -f "$TRACED_DIR/$ver/$file" ] || TRACED_MISSING+=("$ver/$file")
  done
done
# Context uploads drop empty directories; the Dockerfile COPYs this one.
printf 'Bundle-staged traced MWCC binaries (GC/<ver>/{mwcceppc.exe,lmgr326b.dll}, CAPABILITIES.json).\n' \
  > "$PAYLOAD/traced-compilers/README"
# Every game's required versions and stock-failure exclusions (worker-image.json
# traced_compilers), for the evidence gate in the bundle preview and the image.
printf '%s\n' "$TRACED_REQUIREMENTS_JSON" > "$PAYLOAD/traced-compilers/requirements.json"
if [ "${#TRACED_MISSING[@]}" -eq 0 ]; then
  echo "Staging traced compilers ($TRACED_VERSIONS) from $TRACED_DIR..." >&2
  for ver in "${TRACED_VERSION_LIST[@]}"; do
    mkdir -p "$PAYLOAD/traced-compilers/GC/$ver"
    cp "$TRACED_DIR/$ver/mwcceppc.exe" "$TRACED_DIR/$ver/lmgr326b.dll" "$PAYLOAD/traced-compilers/GC/$ver/"
  done
  cp "$TRACED_DIR/CAPABILITIES.json" "$PAYLOAD/traced-compilers/CAPABILITIES.json"
  cp "$TRACED_DIR/CAPABILITIES.json" "$PAYLOAD/provenance/traced-compilers-CAPABILITIES.json"
  # The validation evidence the image gate binds to each binary: build.sh's
  # presence-<ver>.json and the operator's byte-identity sweep reports
  # (validate/byte_identity.py --out ...; copy byte_identity.json here).
  # Sweep reports are filed per game: validation/byte-identity/<game>/*.json.
  if [ -d "$TRACED_DIR/validation" ]; then
    (cd "$TRACED_DIR/validation" && find . -type f -name '*.json' -print0) | while IFS= read -r -d '' file; do
      mkdir -p "$PAYLOAD/traced-compilers/validation/$(dirname "$file")"
      cp "$TRACED_DIR/validation/$file" "$PAYLOAD/traced-compilers/validation/$file"
    done
  fi
  (
    cd "$PAYLOAD/traced-compilers"
    find GC validation requirements.json -type f 2>/dev/null | LC_ALL=C sort | while IFS= read -r file; do
      printf '%s  %s\n' "$(sha256_file "$file")" "$file"
    done
  ) > "$PAYLOAD/traced-compilers/SHA256SUMS"
  cp "$PAYLOAD/traced-compilers/SHA256SUMS" "$PAYLOAD/provenance/traced-compilers.sha256"
  # Preview the image's evidence gate so a version it will disable shows up now.
  GATE_PREVIEW="$TMP_ROOT/traced-gate-preview"
  cp -R "$PAYLOAD/traced-compilers" "$GATE_PREVIEW"
  GATE_OUTPUT=$(python3 "$SCRIPT_DIR/gate_traced_capabilities.py" "$GATE_PREVIEW" "$TRACED_VERSIONS") || \
    die "traced compiler evidence gate failed on $TRACED_DIR"
  DISABLED_REQUIRED=()
  while IFS= read -r line; do
    case $line in
      *": disabled "*)
        warn "traced compiler $line"
        case ",$TRACED_REQUIRED," in *",${line%%:*},"*) DISABLED_REQUIRED+=("$line") ;; esac ;;
      ?*) echo "traced compiler $line" >&2 ;;
    esac
  done <<< "$GATE_OUTPUT"
  if [ "${#DISABLED_REQUIRED[@]}" -gt 0 ]; then
    traced_shortfall "the evidence gate disables traced compilers $GAME_ID requires: ${DISABLED_REQUIRED[*]}"
  fi
else
  warn "traced compilers not staged (missing under $TRACED_DIR: ${TRACED_MISSING[*]})"
  # An image build from source carries no byte-identity sweep, so its versions come out disabled.
  if [ -n "$TRACED_REQUIRED" ]; then
    traced_shortfall "$GAME_ID requires traced compilers $TRACED_REQUIRED but $TRACED_DIR has no complete set"
  fi
  if [ -f "$PAYLOAD_TOOLPACK/compiler/mwcc_alloc/native/build.sh" ]; then
    warn "the image build will run compiler/mwcc_alloc/native/build.sh (slow, needs network)"
  else
    warn "the toolpack has no compiler/mwcc_alloc/native/build.sh either: the image build will fail"
    warn "unless it is built with --build-arg TRACED_COMPILERS=optional (local test images only)"
  fi
fi

# The asm-window index provisioning would otherwise upload to every worker
# sandbox (37-54 MB), baked at /opt/tool-data/<toolId>/ with the .ready stamp
# ensureSandboxToolData compares: the toolpack scheme over exactly these files,
# paths relative to the tool's data root. Optional: without it the sandbox tool
# reports its prerequisite missing.
TOOL_DATA="$PAYLOAD/tool-data"
mkdir -p "$TOOL_DATA"
# Context uploads drop empty directories; the Dockerfile COPYs this one.
printf 'Prebuilt tool data, one directory per tool id with its .ready stamp.\n' > "$TOOL_DATA/README"
IFS=, read -r -a ASM_WINDOW_FILE_LIST <<< "$ASM_WINDOW_FILES"
ASM_WINDOW_MISSING=()
for file in "${ASM_WINDOW_FILE_LIST[@]}"; do
  [ -f "$ASM_WINDOW_DATA_ROOT/$file" ] || ASM_WINDOW_MISSING+=("$file")
done
if [ "${#ASM_WINDOW_MISSING[@]}" -eq 0 ]; then
  echo "Staging the $ASM_WINDOW_TOOL_ID index from $ASM_WINDOW_DATA_ROOT..." >&2
  for file in "${ASM_WINDOW_FILE_LIST[@]}"; do
    mkdir -p "$TOOL_DATA/$ASM_WINDOW_TOOL_ID/$(dirname "$file")"
    cp "$ASM_WINDOW_DATA_ROOT/$file" "$TOOL_DATA/$ASM_WINDOW_TOOL_ID/$file"
    # The host keeps the index 0600; the sandbox user reads the image copy.
    chmod 0644 "$TOOL_DATA/$ASM_WINDOW_TOOL_ID/$file"
  done
  printf '%s\n' "$(bash "$SCRIPT_DIR/content_stamp.sh" "$TOOL_DATA/$ASM_WINDOW_TOOL_ID" .ready)" \
    > "$TOOL_DATA/$ASM_WINDOW_TOOL_ID/.ready"
  cp "$TOOL_DATA/$ASM_WINDOW_TOOL_ID/.ready" "$PAYLOAD/provenance/$ASM_WINDOW_TOOL_ID-stamp.txt"
  echo "$ASM_WINDOW_TOOL_ID .ready stamp: $(cat "$TOOL_DATA/$ASM_WINDOW_TOOL_ID/.ready")" >&2
else
  warn "$ASM_WINDOW_TOOL_ID index not baked (missing under $ASM_WINDOW_DATA_ROOT: ${ASM_WINDOW_MISSING[*]});"
  warn "provisioning uploads it per sandbox when the host has it, else the sandbox tool reports its prerequisite missing"
fi

BAKED_HEAD=$(git -C "$CHECKOUT" rev-parse --verify 'HEAD^{commit}')
git clone --quiet --depth 1 --no-checkout "file://$CHECKOUT" "$SHALLOW_REPO"
[ "$(git -C "$SHALLOW_REPO" rev-parse --verify 'HEAD^{commit}')" = "$BAKED_HEAD" ] || \
  die "shallow clone HEAD does not match checkout HEAD"
# A detached source leaves refs/ with only empty directories, which image build
# context uploads drop; git then no longer recognizes the repository. Record a
# real ref so the baked clone always carries refs/heads/<file>.
git -C "$SHALLOW_REPO" update-ref refs/heads/baked "$BAKED_HEAD"
# Extra commits (e.g. unverified targets' trusted bases older than HEAD, listed
# by extra-baked-revs.ts) baked depth-1 under refs/baked-extra/<sha>, so
# provisioning finds them instead of shipping a full-history seed bundle.
if [ -n "$EXTRA_REVS_FILE" ]; then
  bash "$SCRIPT_DIR/bake_extra_revs.sh" "$CHECKOUT" "$SHALLOW_REPO" "$EXTRA_REVS_FILE" "$PAYLOAD/provenance/baked-extra-revs.txt" || \
    die "baking extra revisions from $EXTRA_REVS_FILE failed"
else
  : > "$PAYLOAD/provenance/baked-extra-revs.txt"
fi
cp -a "$SHALLOW_REPO/.git" "$PAYLOAD/checkout/.git"
printf '%s\n' "$BAKED_HEAD" > "$PAYLOAD/provenance/baked-head.txt"
cp -a "$WIBO_DIR/README.md" "$WIBO_DIR/wibo-opt-vs-upstream-e8f4795.patch" \
  "$PAYLOAD/provenance/wibo-1.2.0-opt1/"
cp -a "$OBJDIFF_DIR/README.md" "$PAYLOAD/provenance/objdiff-cli-3.6.1-score/"
cp -a "$CACHE_SHIM" "$CACHE_INSTALLER" "$PAYLOAD/image-tools/"
cp -a "$SCRIPT_DIR/prepare_linux_image.py" "$SCRIPT_DIR/ninja-cgroup-jobs.sh" \
  "$SCRIPT_DIR/fetch_pinned_sources.py" "$SCRIPT_DIR/stage_traced_compilers.sh" "$SCRIPT_DIR/gate_traced_capabilities.py" \
  "$SCRIPT_DIR/content_stamp.sh" "$PAYLOAD/image-tools/"
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
if [ -n "$SYMBOL_CHECK_MAP" ]; then
  printf '%s  %s\n' "$(sha256_file "$PAYLOAD/checkout/$SYMBOL_CHECK_MAP")" "checkout/$SYMBOL_CHECK_MAP"
fi
if [ -f "$LINUX_OBJDIFF" ]; then
  printf '%s  %s\n' "$(sha256_file "$PAYLOAD/checkout/build/tools/objdiff-cli")" \
    "checkout/build/tools/objdiff-cli"
fi
if [ -f "$PAYLOAD/traced-compilers/SHA256SUMS" ]; then
  sed 's#  #  traced-compilers/#' "$PAYLOAD/traced-compilers/SHA256SUMS"
fi
echo "Toolpack .ready stamp: $(cat "$PAYLOAD/provenance/toolpack-stamp.txt")" >&2
echo "QA-lint .qa-ready stamp: $(cat "$PAYLOAD/provenance/qa-stamp.txt")" >&2

printf '%s\n' "$PLAN_JSON" > "$PAYLOAD/provenance/image-plan.json"
cp "$SCRIPT_DIR/Dockerfile" "$SCRIPT_DIR/.dockerignore" "$PAYLOAD/"
printf '%s\n' "$WORKSPACE_ROOT" > "$PAYLOAD/provenance/workspace-root.txt"
(cd "$TMP_ROOT" && tar -cf - "$PAYLOAD_NAME") | zstd -T0 -f -o "$OUT"
printf '%s  %s\n' "$(sha256_file "$OUT")" "$OUT"
echo "Wrote $OUT" >&2
