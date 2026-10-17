#!/usr/bin/env bash
# Runs in the Dockerfile's traced-compilers stage. Produces
# OUT/GC/<ver>/mwcceppc.exe for each requested version and OUT/CAPABILITIES.json
# (contract: build/compilers-traced/GC/<ver>/mwcceppc.exe in the sandbox).
#
# Usage: stage_traced_compilers.sh PREBUILT NATIVE OUT VERSIONS MODE
#   PREBUILT  bundle-staged binaries: GC/<ver>/{mwcceppc.exe,lmgr326b.dll}, CAPABILITIES.json
#             and SHA256SUMS (copied from games/<id>/runtime/tool-data/mwcc_native/)
#   NATIVE    the toolpack's compiler/mwcc_alloc/native (PIN, patches, build.sh)
#   VERSIONS  comma-separated, e.g. 1.1p1,1.2.5,1.2.5n
#   MODE      required (default) fails when no source can produce the binaries;
#             optional writes an empty capability file instead (local test
#             builds only: a snapshot without traced compilers fails the game's
#             worker-image.json verification).
#
# Prebuilt binaries win when every requested version is staged; otherwise the
# pinned build.sh builds all of them. Binaries never touch git. Either way
# gate_traced_capabilities.py (next to this script) then disables every version
# whose staged exe lacks matching validation evidence (traced_sha1, event
# presence, a full byte-identity sweep). A source build carries no sweep, so its
# versions stay on disk but are advertised with no points.
set -euo pipefail

prebuilt=$1 native=$2 out=$3 versions=$4 mode=${5:-required}
case $mode in required|optional) ;; *) echo "TRACED_COMPILERS must be required or optional, got: $mode" >&2; exit 2 ;; esac
IFS=, read -r -a vers <<<"$versions"
[ "${#vers[@]}" -gt 0 ] || { echo "no traced compiler versions requested" >&2; exit 2; }
mkdir -p "$out/GC"

prebuilt_complete() {
  [ -f "$prebuilt/CAPABILITIES.json" ] || return 1
  for ver in "${vers[@]}"; do
    [ -f "$prebuilt/GC/$ver/mwcceppc.exe" ] && [ -f "$prebuilt/GC/$ver/lmgr326b.dll" ] || return 1
  done
}

if prebuilt_complete; then
  echo "traced compilers: using bundle-staged binaries for ${versions}"
  # The bundle records the hashes it staged; a context upload must not alter them.
  if [ -f "$prebuilt/SHA256SUMS" ]; then (cd "$prebuilt" && sha256sum -c --quiet SHA256SUMS); fi
  for ver in "${vers[@]}"; do
    install -D -m 0755 "$prebuilt/GC/$ver/mwcceppc.exe" "$out/GC/$ver/mwcceppc.exe"
    install -m 0644 "$prebuilt/GC/$ver/lmgr326b.dll" "$out/GC/$ver/lmgr326b.dll"
  done
  install -m 0644 "$prebuilt/CAPABILITIES.json" "$out/CAPABILITIES.json"
  if [ -d "$prebuilt/validation" ]; then cp -R "$prebuilt/validation" "$out/validation"; fi
elif [ -f "$native/build.sh" ]; then
  echo "traced compilers: building ${versions} with $native/build.sh"
  # build.sh (S4) writes BUILD/<ver>/{mwcceppc.exe,lmgr326b.dll,traced-ok.json}
  # and BUILD/CAPABILITIES.json. It needs python3 >= 3.11, ninja, git, and builds
  # unshield from source (cmake, a C compiler, zlib) when not installed; it
  # downloads wibo plus the stock compilers, so this stage needs network access.
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential cmake curl git ninja-build python3 python3-pip python3-venv zlib1g-dev
  build=$(mktemp -d)
  bash "$native/build.sh" --out "$build" --versions "$versions"
  for ver in "${vers[@]}"; do
    install -D -m 0755 "$build/$ver/mwcceppc.exe" "$out/GC/$ver/mwcceppc.exe"
    install -m 0644 "$build/$ver/lmgr326b.dll" "$out/GC/$ver/lmgr326b.dll"
  done
  install -m 0644 "$build/CAPABILITIES.json" "$out/CAPABILITIES.json"
  if [ -d "$build/validation" ]; then cp -R "$build/validation" "$out/validation"; fi
  rm -rf "$build"
else
  if [ "$mode" != optional ]; then
    echo "traced compilers: no bundle-staged binaries for ${versions} and no $native/build.sh." >&2
    echo "Stage games/<id>/runtime/tool-data/mwcc_native/<ver>/mwcceppc.exe and CAPABILITIES.json," >&2
    echo "ship compiler/mwcc_alloc/native/build.sh in the toolpack, or build with" >&2
    echo "--build-arg TRACED_COMPILERS=optional for a local test image." >&2
    exit 1
  fi
  echo "traced compilers: none available; TRACED_COMPILERS=optional writes an empty capability file" >&2
  printf '{"schema":"mwcc-native-capabilities-v1","pin":null,"versions":{},"unavailable":"traced compilers not baked"}\n' \
    > "$out/CAPABILITIES.json"
  exit 0
fi

for ver in "${vers[@]}"; do
  for file in mwcceppc.exe lmgr326b.dll; do
    [ -s "$out/GC/$ver/$file" ] || { echo "traced compiler missing after staging: GC/$ver/$file" >&2; exit 1; }
  done
done
python3 - "$out/CAPABILITIES.json" "${vers[@]}" <<'PY'
import json, sys
caps = json.load(open(sys.argv[1], encoding="utf-8"))
if caps.get("schema") != "mwcc-native-capabilities-v1":
    sys.exit(f"{sys.argv[1]}: unexpected schema {caps.get('schema')!r}")
missing = [ver for ver in sys.argv[2:] if ver not in (caps.get("versions") or {})]
if missing:
    sys.exit(f"{sys.argv[1]}: no capability entry for {', '.join(missing)}")
PY
# The bundle writes every game's required versions and stock exclusions here.
if [ -f "$prebuilt/requirements.json" ]; then install -m 0644 "$prebuilt/requirements.json" "$out/requirements.json"; fi
python3 "$(dirname "$0")/gate_traced_capabilities.py" "$out" "$versions"
(cd "$out" && find GC -type f -name mwcceppc.exe | LC_ALL=C sort | xargs sha256sum)
