#!/usr/bin/env bash
# Build the traced MWCC compilers (mwcceppc.exe for GC 1.1p1, 1.2.5, 1.2.5n) from rayanht/mwcc at the commit in
# PIN.json with the trace patches in patches/, and write CAPABILITIES.json for them.
#
#   build.sh --out <dir> [--work <dir>] [--versions 1.1p1,1.2.5,1.2.5n] [--source <mwcc clone>] [--seed <mwcc build>]
#            [--byte-identity <report.json>]... [--capabilities-only] [--keep-work]
#
#   --out             <dir>/<ver>/mwcceppc.exe (+ lmgr326b.dll, traced-ok.json), <dir>/CAPABILITIES.json,
#                     <dir>/validation/presence-<ver>.json and overflow-<ver>.json, <dir>/BUILD-INFO.json, and
#                     <dir>/test-builds/small-limits/<ver>/ (the overflow check's test build, never provisioned).
#                     Never a path inside git.
#   --work            scratch directory (default: a new one under ${TMPDIR:-/tmp}); removed afterwards unless
#                     --keep-work or --work was given.
#   --source          a local clone of rayanht/mwcc to copy from instead of cloning (it must hold the pinned commit).
#   --seed            an mwcc checkout whose downloads (build/compilers, build/downloads, build/tools, lib) are
#                     reused, so the archives are not fetched again.
#   --byte-identity   validate/byte_identity.py reports (full sweeps of this build's binaries) copied into
#                     <out>/validation; repeatable. Without them no version has trace points: CAPABILITIES.json
#                     enables a point only with event-presence and byte-identity evidence for the exact binary.
#   --capabilities-only  regenerate CAPABILITIES.json from an existing --work (after a sweep) without building.
#
# Steps, per version: build the stock reconstruction and check it is the original (its SHA-1 in PIN.json); then build
# the traced variant (configure.py --traced: the trace module linked in, tools/link_traced.py writing traced-ok in
# place of the stock SHA-1 check); copy it out; check event presence on the fixture; write CAPABILITIES.json.
# Needs python3 (3.11+), ninja, git, and unshield (built from source at PIN.json's commit when not installed: cmake, a C
# compiler and zlib). Runs on macOS and Linux amd64 (wibo, which the build downloads, runs the Windows tools).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=""
WORK=""
VERSIONS="1.1p1,1.2.5,1.2.5n"
SOURCE=""
SEED=""
KEEP_WORK=0
CAPS_ONLY=0
BYTE_IDENTITY=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --work) WORK="$2"; KEEP_WORK=1; shift 2 ;;
    --versions) VERSIONS="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --seed) SEED="$2"; shift 2 ;;
    --byte-identity) BYTE_IDENTITY+=("--byte-identity" "$2"); shift 2 ;;
    --capabilities-only) CAPS_ONLY=1; shift ;;
    --keep-work) KEEP_WORK=1; shift ;;
    -h|--help) sed -n '2,/^set -euo pipefail/p' "$0" | sed '$d'; exit 0 ;;
    *) echo "build.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[[ -n "$OUT" ]] || { echo "build.sh: --out is required" >&2; exit 2; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
if git -C "$OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    && [[ -z "$(git -C "$OUT" check-ignore "$OUT" 2>/dev/null)" ]]; then
  echo "build.sh: $OUT is inside a git work tree and not ignored; binaries never go into git" >&2
  exit 2
fi
if [[ -z "$WORK" ]]; then
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/mwcc-native.XXXXXX")"
fi
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"
cleanup() { if [[ $KEEP_WORK -eq 0 ]]; then rm -rf "$WORK"; fi; }
trap cleanup EXIT

pin() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(eval("d"+sys.argv[2]))' "$HERE/PIN.json" "$1"; }
COMMIT="$(pin '["commit"]')"
REPO="$(pin '["repository"]')"
IFS=',' read -r -a VERSION_LIST <<< "$VERSIONS"
log() { printf '[mwcc-native] %s\n' "$*" >&2; }

for tool in python3 ninja git; do
  command -v "$tool" >/dev/null || { echo "build.sh: $tool is required" >&2; exit 2; }
done

# unshield unpacks the CodeWarrior Pro 5.3 updater the upstream build downloads.
ensure_unshield() {
  if command -v unshield >/dev/null; then return; fi
  local prefix="$WORK/unshield"
  if [[ ! -x "$prefix/bin/unshield" ]]; then
    log "building unshield from source"
    command -v cmake >/dev/null || { echo "build.sh: unshield is missing and cmake is not installed" >&2; exit 2; }
    local src="$WORK/unshield-src"
    rm -rf "$src"
    git init -q "$src"
    git -C "$src" fetch -q --depth 1 "$(pin '["unshield"]["repository"]')" "$(pin '["unshield"]["commit"]')"
    git -C "$src" checkout -q FETCH_HEAD
    cmake -S "$src" -B "$src/build" -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_RPATH="$prefix/lib" -DUSE_OUR_OWN_MD5=ON >/dev/null
    cmake --build "$src/build" -j >/dev/null
    cmake --install "$src/build" >/dev/null
  fi
  export PATH="$prefix/bin:$PATH"
  export LD_LIBRARY_PATH="$prefix/lib:$prefix/lib64:${LD_LIBRARY_PATH:-}"
  export DYLD_LIBRARY_PATH="$prefix/lib:${DYLD_LIBRARY_PATH:-}"
}

checkout_pin() {
  local dest="$1"
  rm -rf "$dest"
  if [[ -n "$SOURCE" ]]; then
    git clone -q "$SOURCE" "$dest"
    git -C "$dest" checkout -q "$COMMIT"
  else
    git init -q "$dest"
    git -C "$dest" fetch -q --depth 1 "$REPO" "$COMMIT"
    git -C "$dest" checkout -q FETCH_HEAD
  fi
  [[ "$(git -C "$dest" rev-parse HEAD)" == "$COMMIT" ]] || { echo "build.sh: $dest is not at $COMMIT" >&2; exit 1; }
}

# Downloads (compilers archive, Pro 4/5/5.3/6 compilers, the MSL/runtime sources, wibo) from SEED into DEST.
seed_downloads() {
  local from="$1" dest="$2"
  [[ -n "$from" && -d "$from" ]] || return 0
  mkdir -p "$dest/build"
  for dir in build/compilers build/downloads build/tools; do
    if [[ -d "$from/$dir" && ! -e "$dest/$dir" ]]; then cp -R "$from/$dir" "$dest/$dir"; fi
  done
  if [[ -f "$from/lib/ok" && ! -f "$dest/lib/ok" ]]; then cp -R "$from/lib/." "$dest/lib/"; fi
}

config_of() { pin "[\"versions\"][\"$1\"][\"config\"]"; }

build_stock() {
  local stock="$WORK/stock"
  checkout_pin "$stock"
  seed_downloads "$SEED" "$stock"
  for version in "${VERSION_LIST[@]}"; do
    local config; config="$(config_of "$version")"
    log "stock $config"
    (cd "$stock" && python3 configure.py --version "$config" && ninja "build/$config/ok" >"$WORK/stock-$config.log" 2>&1) \
      || { tail -20 "$WORK/stock-$config.log" >&2; echo "build.sh: the stock $config build failed" >&2; exit 1; }
    local want got
    want="$(pin "[\"versions\"][\"$version\"][\"stock_sha1\"]")"
    got="$(python3 -c 'import hashlib,sys; print(hashlib.sha1(open(sys.argv[1],"rb").read()).hexdigest())' \
      "$stock/build/$config/mwcceppc.exe")"
    [[ "$got" == "$want" ]] || { echo "build.sh: stock $config is $got, not $want" >&2; exit 1; }
  done
}

build_traced() {
  local traced="$WORK/traced"
  checkout_pin "$traced"
  seed_downloads "$WORK/stock" "$traced"
  for patch in "$HERE"/patches/*.patch; do
    git -C "$traced" apply "$patch"
  done
  for version in "${VERSION_LIST[@]}"; do
    local config; config="$(config_of "$version")"
    log "traced $config"
    (cd "$traced" && python3 configure.py --version "$config" --traced && ninja "build/$config/traced-ok" \
      >"$WORK/traced-$config.log" 2>&1) \
      || { tail -20 "$WORK/traced-$config.log" >&2; echo "build.sh: the traced $config build failed" >&2; exit 1; }
    mkdir -p "$OUT/$version"
    cp "$traced/build/$config/mwcceppc.exe" "$OUT/$version/mwcceppc.exe"
    cp "$traced/build/compilers/GC/$version/lmgr326b.dll" "$OUT/$version/lmgr326b.dll"
    cp "$traced/build/$config/traced-ok" "$OUT/$version/traced-ok.json"
  done
}

check_presence() {
  mkdir -p "$OUT/validation"
  for version in "${VERSION_LIST[@]}"; do
    log "event presence $version"
    MWCC_WIBO="$WORK/stock/build/tools/wibo" python3 "$HERE/validate/event_presence.py" \
      --compiler "$OUT/$version/mwcceppc.exe" --stock "$WORK/stock/build/compilers/GC/$version/mwcceppc.exe" \
      --version "$version" --json "$OUT/validation/presence-$version.json" >&2
  done
}

# The trace's capacity limits: a test build with tiny tables must say what it dropped (overflow records), and the
# traced build must drop nothing on the fixtures. One version suffices (the trace module is the same in all).
check_overflow() {
  local version="${VERSION_LIST[0]}" candidate
  for candidate in "${VERSION_LIST[@]}"; do
    if [[ "$candidate" != "1.1p1" ]]; then version="$candidate"; break; fi
  done
  local config; config="$(config_of "$version")"
  local small="$WORK/traced-small"
  log "overflow check $version (test build with small trace limits)"
  rm -rf "$small"
  cp -R "$WORK/traced" "$small"
  (cd "$small" && python3 configure.py --version "$config" --traced --trace-small-limits \
    && ninja "build/$config/traced-ok" >"$WORK/traced-small-$config.log" 2>&1) \
    || { tail -20 "$WORK/traced-small-$config.log" >&2; echo "build.sh: the small-limit $config build failed" >&2; exit 1; }
  mkdir -p "$OUT/test-builds/small-limits/$version"
  cp "$small/build/$config/mwcceppc.exe" "$OUT/test-builds/small-limits/$version/mwcceppc.exe"
  cp "$small/build/compilers/GC/$version/lmgr326b.dll" "$OUT/test-builds/small-limits/$version/lmgr326b.dll"
  MWCC_WIBO="$WORK/stock/build/tools/wibo" python3 "$HERE/validate/overflow_check.py" \
    --small "$OUT/test-builds/small-limits/$version/mwcceppc.exe" --normal "$OUT/$version/mwcceppc.exe" \
    --version "$version" --json "$OUT/validation/overflow-$version.json" >&2
}

write_capabilities() {
  python3 "$HERE/tools/capabilities.py" --pin "$HERE/PIN.json" --mwcc "$WORK/traced" --binaries "$OUT" \
    --validation "$OUT/validation" --versions "$VERSIONS" ${BYTE_IDENTITY[@]+"${BYTE_IDENTITY[@]}"} \
    --out "$OUT/CAPABILITIES.json" >&2
  python3 - "$OUT" "$COMMIT" "$VERSIONS" <<'EOF'
import json, platform, sys, time
out, commit, versions = sys.argv[1:4]
info = {"pin": commit, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "host": platform.platform(),
        "versions": {v: json.load(open(f"{out}/{v}/traced-ok.json")) for v in versions.split(",") if v}}
json.dump(info, open(f"{out}/BUILD-INFO.json", "w"), indent=2)
EOF
}

if [[ $CAPS_ONLY -eq 1 ]]; then
  [[ -d "$WORK/traced" ]] || { echo "build.sh: --capabilities-only needs the --work of a finished build" >&2; exit 2; }
  write_capabilities
  exit 0
fi

ensure_unshield
build_stock
build_traced
check_presence
check_overflow
write_capabilities
log "done: $OUT"
