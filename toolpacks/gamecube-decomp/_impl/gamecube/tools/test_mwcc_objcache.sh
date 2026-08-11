#!/bin/bash

set -euo pipefail

EXPECTED_SHA256="33a2a70e3e7fa5256ed8266835b56ad7740860cbc91c1e7a6f2d76b487ef5246"
MAX_HIT_SECONDS="0.150"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
REPO_ROOT=$(cd "$SCRIPT_DIR/../../../../.." && pwd -P)
MELEE_ROOT="$REPO_ROOT/projects/melee/checkout"
SHIM="$SCRIPT_DIR/mwcc_objcache.py"
REAL_WIBO="$MELEE_ROOT/build/tools/wibo"
PYTHON="/Users/Ford/anaconda3/bin/python3"
TRANSFORM_DEP="$MELEE_ROOT/tools/transform_dep.py"
SJISWRAP="build/tools/sjiswrap.exe"
COMPILER="build/compilers/GC/1.2.5n/mwcceppc.exe"
SOURCE="src/melee/ft/chara/ftPopo/ftPp_SpecialLw.c"

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

for required in "$SHIM" "$REAL_WIBO" "$PYTHON" "$TRANSFORM_DEP" \
    "$MELEE_ROOT/$SJISWRAP" "$MELEE_ROOT/$COMPILER" "$MELEE_ROOT/$SOURCE"; do
    [ -e "$required" ] || fail "missing required file: $required"
done
[ -x "$SHIM" ] || fail "shim is not executable: $SHIM"
[ -x "$REAL_WIBO" ] || fail "real wibo is not executable: $REAL_WIBO"

TEST_ROOT=$(mktemp -d /tmp/mwcc-objcache-test.XXXXXX)
cleanup() {
    exit_code=$?
    if [ "$exit_code" -eq 0 ]; then
        rm -rf "$TEST_ROOT"
    else
        printf 'Test artifacts preserved at %s\n' "$TEST_ROOT" >&2
    fi
}
trap cleanup EXIT INT TERM

CACHE_DIR="$TEST_ROOT/cache"
MAIN_OUT="$TEST_ROOT/main-out"
HEADER_TREE="$TEST_ROOT/header-tree"
HEADER_OUT="$TEST_ROOT/header-out"
mkdir -p "$CACHE_DIR" "$MAIN_OUT" "$HEADER_OUT" \
    "$HEADER_TREE/src/melee/ft/chara/ftPopo"

export MWCC_CACHE_DIR="$CACHE_DIR"
export MWCC_CACHE_REAL_WIBO="$REAL_WIBO"
unset MWCC_CACHE_DISABLE MWCC_CACHE_STATS MWCC_CACHE_VERIFY
export MWCC_CACHE_DEPMODE=strict

CFLAGS=(
    -nowraplines
    -cwd source
    -Cpp_exceptions off
    -proc gekko
    -fp hardware
    -align powerpc
    -nosyspath
    -fp_contract on
    -O4,p
    -multibyte
    -enum int
    -nodefaults
    -inline auto
    -pragma "cats off"
    -pragma "warn_notinlined off"
    -RTTI off
    -str reuse
    -DBUILD_VERSION=0
    -DVERSION_GALE01
    -maxerrors 1
    -msgstyle std
    -warn off
    -requireprotos
    -i src
    -i src/MSL
    -i src/Runtime
    -i extern/dolphin/include
    -i src/melee
    -i src/melee/ft/chara
    -i src/sysdolphin
    -lang=c
    -sym off
)

MAIN_CMD=(
    "$SHIM" "$SJISWRAP" "$COMPILER"
    "${CFLAGS[@]}"
    -MMD -c "$SOURCE" -o "$MAIN_OUT"
)

sha256_file() {
    shasum -a 256 "$1" | awk '{print $1}'
}

assert_expected_object() {
    object_path=$1
    actual_sha256=$(sha256_file "$object_path")
    [ "$actual_sha256" = "$EXPECTED_SHA256" ] ||
        fail "unexpected object hash for $object_path: $actual_sha256"
}

timed_run() {
    label=$1
    shift
    time_log="$TEST_ROOT/$label.time"
    stdout_log="$TEST_ROOT/$label.stdout"
    /usr/bin/time -p "$@" >"$stdout_log" 2>"$time_log"
    elapsed=$(awk '$1 == "real" { value = $2 } END { print value }' "$time_log")
    [ -n "$elapsed" ] || fail "could not read elapsed time from $time_log"
    printf '%s\n' "$elapsed"
}

assert_fast_hit() {
    label=$1
    elapsed=$2
    awk -v elapsed="$elapsed" -v limit="$MAX_HIT_SECONDS" \
        'BEGIN { exit !(elapsed < limit) }' ||
        fail "$label took ${elapsed}s; cache-hit limit is ${MAX_HIT_SECONDS}s"
}

milliseconds() {
    awk -v seconds="$1" 'BEGIN { printf "%.1f", seconds * 1000 }'
}

cd "$MELEE_ROOT"

printf '1/7 strict production target refusal and object hash...\n'
"${MAIN_CMD[@]}"
MAIN_OBJECT="$MAIN_OUT/ftPp_SpecialLw.o"
MAIN_DEPFILE="$MAIN_OUT/ftPp_SpecialLw.d"
[ -f "$MAIN_OBJECT" ] || fail "compile did not create $MAIN_OBJECT"
[ -f "$MAIN_DEPFILE" ] || fail "compile did not create $MAIN_DEPFILE"
assert_expected_object "$MAIN_OBJECT"
cp "$MAIN_OBJECT" "$TEST_ROOT/first.o"
cp "$MAIN_DEPFILE" "$TEST_ROOT/first.d"

ABSOLUTE_DEPS=0
if sed '1d' "$MAIN_DEPFILE" | grep -Eq '^[[:space:]]*([[:alpha:]]:[\\/]|/)'; then
    ABSOLUTE_DEPS=1
    printf '%s\n' \
        'PORTABILITY CAVEAT: raw MWCC .d header paths are absolute; strict mode correctly leaves this compile uncacheable.'
else
    printf '%s\n' 'Dependency paths are relative.'
fi

printf '   strict second invocation and absolute-path policy...\n'
rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
SECOND_SECONDS=$(timed_run strict-second "${MAIN_CMD[@]}")
[ -f "$MAIN_OBJECT" ] || fail "second compile did not restore $MAIN_OBJECT"
[ -f "$MAIN_DEPFILE" ] || fail "second compile did not restore $MAIN_DEPFILE"
cmp -s "$TEST_ROOT/first.o" "$MAIN_OBJECT" || fail "second object differs from first object"
cmp -s "$TEST_ROOT/first.d" "$MAIN_DEPFILE" || fail "second depfile differs from first depfile"
assert_expected_object "$MAIN_OBJECT"
if [ "$ABSOLUTE_DEPS" -eq 1 ]; then
    [ "$(awk '$1 == "miss" { count++ } END { print count + 0 }' "$CACHE_DIR/stats")" -eq 2 ] ||
        fail "absolute dependency entry was cached instead of compiling twice"
    printf 'Strict second compile latency (expected miss): %sms\n' "$(milliseconds "$SECOND_SECONDS")"
else
    assert_fast_hit "main cache hit" "$SECOND_SECONDS"
    printf 'Measured direct hit latency: %sms\n' "$(milliseconds "$SECOND_SECONDS")"
fi

# The checked-out MWCC emits absolute Wine paths before transform_dep.py runs.
# This test-only real-wibo wrapper removes only the exact Z:\<cwd>\ prefix so
# the relative-manifest hit, verify, and invalidation paths can still be tested
# without weakening the production shim's absolute-path refusal.
NORMALIZER="$TEST_ROOT/normalize_dep.py"
NORMALIZING_WIBO="$TEST_ROOT/wibo-relative-deps"
cat >"$NORMALIZER" <<'PY'
#!/Users/Ford/anaconda3/bin/python3
import os
import sys

path = sys.argv[1]
cwd = os.fsencode(sys.argv[2])
prefix = b"Z:" + cwd.replace(b"/", b"\\").replace(b" ", b"\\ ") + b"\\"
with open(path, "rb") as stream:
    data = stream.read()
separator = data.find(b": ", 2)
if separator >= 0:
    target = data[:separator]
    target = target.replace(b"/", b"\\").rsplit(b"\\", 1)[-1]
    data = target + data[separator:]
temporary = path + ".normalize.%d" % os.getpid()
with open(temporary, "wb") as stream:
    stream.write(data.replace(prefix, b""))
os.replace(temporary, path)
PY
chmod 755 "$NORMALIZER"
cat >"$NORMALIZING_WIBO" <<'SH'
#!/bin/bash
set -euo pipefail
source_path=
output_dir=
arguments=("$@")
for ((index = 0; index < ${#arguments[@]}; index++)); do
    if [ "${arguments[$index]}" = -c ]; then
        source_path=${arguments[$((index + 1))]}
    elif [ "${arguments[$index]}" = -o ]; then
        output_dir=${arguments[$((index + 1))]}
    fi
done
printf 'compile\n' >>"$MWCC_TEST_COMPILE_LOG"
"$MWCC_TEST_REAL_WIBO" "$@"
stem=$(basename "$source_path")
stem=${stem%.*}
if [ "${MWCC_TEST_CORRUPT_OBJECT:-0}" = 1 ]; then
    printf 'verification-mismatch' >>"$output_dir/$stem.o"
fi
physical_cwd=$(pwd -P)
"$MWCC_TEST_NORMALIZER" "$output_dir/$stem.d" "$physical_cwd"
SH
chmod 755 "$NORMALIZING_WIBO"

printf '2/7 strict v1 relative manifest: miss, hit, verify, concurrency...\n'
export MWCC_TEST_REAL_WIBO="$REAL_WIBO"
export MWCC_TEST_NORMALIZER="$NORMALIZER"
export MWCC_TEST_COMPILE_LOG="$TEST_ROOT/compiler-runs"
export MWCC_CACHE_REAL_WIBO="$NORMALIZING_WIBO"
export MWCC_CACHE_DIR="$TEST_ROOT/relative-cache"
rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE" "$MWCC_TEST_COMPILE_LOG"
"${MAIN_CMD[@]}"
assert_expected_object "$MAIN_OBJECT"
cp "$MAIN_OBJECT" "$TEST_ROOT/relative-first.o"
cp "$MAIN_DEPFILE" "$TEST_ROOT/relative-first.d"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "relative-manifest miss did not invoke the compiler exactly once"

rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
HIT_SECONDS=$(timed_run main-hit "${MAIN_CMD[@]}")
assert_fast_hit "main cache hit" "$HIT_SECONDS"
cmp -s "$TEST_ROOT/relative-first.o" "$MAIN_OBJECT" || fail "hit object differs"
cmp -s "$TEST_ROOT/relative-first.d" "$MAIN_DEPFILE" || fail "hit depfile differs"
assert_expected_object "$MAIN_OBJECT"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "cache hit invoked the compiler"
printf 'Measured hit latency: %sms\n' "$(milliseconds "$HIT_SECONDS")"

rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
MWCC_CACHE_STATS=1 "${MAIN_CMD[@]}" >"$TEST_ROOT/stats.stdout" \
    2>"$TEST_ROOT/stats.stderr"
grep -Eq 'mwcc_objcache: hits=[0-9]+ misses=[0-9]+' "$TEST_ROOT/stats.stderr" ||
    fail "MWCC_CACHE_STATS=1 did not print aggregate hit/miss counters"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "stats-enabled cache hit invoked the compiler"

rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
MWCC_CACHE_VERIFY=1 "${MAIN_CMD[@]}"
assert_expected_object "$MAIN_OBJECT"
cmp -s "$TEST_ROOT/relative-first.o" "$MAIN_OBJECT" ||
    fail "verified object differs from cached object"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq 2 ] ||
    fail "verify-on-hit did not invoke the compiler"

VERIFY_RUNS_BEFORE=$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')
rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
MWCC_TEST_CORRUPT_OBJECT=1 MWCC_CACHE_VERIFY=1 "${MAIN_CMD[@]}" \
    >"$TEST_ROOT/verify-mismatch.stdout" 2>"$TEST_ROOT/verify-mismatch.stderr"
[ "$(sha256_file "$MAIN_OBJECT")" != "$EXPECTED_SHA256" ] ||
    fail "verify mismatch did not preserve the newly compiled object"
grep -q 'verification failed; poisoned' "$TEST_ROOT/verify-mismatch.stderr" ||
    fail "verify mismatch was not logged"
[ -n "$(find "$MWCC_CACHE_DIR/poison" -type f -print -quit 2>/dev/null)" ] ||
    fail "verify mismatch did not create a poison tombstone"

rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
"${MAIN_CMD[@]}"
assert_expected_object "$MAIN_OBJECT"
rm -f "$MAIN_OBJECT" "$MAIN_DEPFILE"
"${MAIN_CMD[@]}"
assert_expected_object "$MAIN_OBJECT"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq "$((VERIFY_RUNS_BEFORE + 3))" ] ||
    fail "poisoned entry was reused instead of recompiling"

CONCURRENT_CACHE="$TEST_ROOT/concurrent-cache"
CONCURRENT_OUT_A="$TEST_ROOT/concurrent-out-a"
CONCURRENT_OUT_B="$TEST_ROOT/concurrent-out-b"
CONCURRENT_LOG="$TEST_ROOT/concurrent-compiler-runs"
mkdir -p "$CONCURRENT_OUT_A" "$CONCURRENT_OUT_B"
CONCURRENT_CMD_A=(
    "$SHIM" "$SJISWRAP" "$COMPILER" "${CFLAGS[@]}"
    -MMD -c "$SOURCE" -o "$CONCURRENT_OUT_A"
)
CONCURRENT_CMD_B=(
    "$SHIM" "$SJISWRAP" "$COMPILER" "${CFLAGS[@]}"
    -MMD -c "$SOURCE" -o "$CONCURRENT_OUT_B"
)
MWCC_CACHE_DIR="$CONCURRENT_CACHE" MWCC_TEST_COMPILE_LOG="$CONCURRENT_LOG" \
    "${CONCURRENT_CMD_A[@]}" &
CONCURRENT_PID_A=$!
MWCC_CACHE_DIR="$CONCURRENT_CACHE" MWCC_TEST_COMPILE_LOG="$CONCURRENT_LOG" \
    "${CONCURRENT_CMD_B[@]}" &
CONCURRENT_PID_B=$!
wait "$CONCURRENT_PID_A"
wait "$CONCURRENT_PID_B"
cmp -s "$CONCURRENT_OUT_A/ftPp_SpecialLw.o" \
    "$CONCURRENT_OUT_B/ftPp_SpecialLw.o" || fail "parallel misses produced different objects"
[ "$(wc -l <"$CONCURRENT_LOG" | tr -d ' ')" -eq 2 ] ||
    fail "parallel cold-cache test did not run two compilers"
rm -f "$CONCURRENT_OUT_A/ftPp_SpecialLw.o" "$CONCURRENT_OUT_A/ftPp_SpecialLw.d"
MWCC_CACHE_DIR="$CONCURRENT_CACHE" MWCC_TEST_COMPILE_LOG="$CONCURRENT_LOG" \
    "${CONCURRENT_CMD_A[@]}"
[ "$(wc -l <"$CONCURRENT_LOG" | tr -d ' ')" -eq 2 ] ||
    fail "parallel cache winner was not reusable"

printf '3/7 strict copied include tree invalidates on header content...\n'
cp "$MELEE_ROOT/src/sysdolphin/baselib/leak.h" "$HEADER_TREE/probe.h"
printf '\n#define MWCC_CACHE_HEADER_PROBE_VALUE 1\n' >>"$HEADER_TREE/probe.h"
printf '#include "probe.h"\nint probe = MWCC_CACHE_HEADER_PROBE_VALUE;\n' \
    >"$HEADER_TREE/probe.c"
HEADER_CMD=(
    "$SHIM" "$MELEE_ROOT/$SJISWRAP" "$MELEE_ROOT/$COMPILER"
    -cwd source -Cpp_exceptions off -proc gekko -fp hardware -nosyspath
    -nodefaults -i . -lang=c -MMD -c probe.c -o "$HEADER_OUT"
)
cd "$HEADER_TREE"
"${HEADER_CMD[@]}"
HEADER_OBJECT="$HEADER_OUT/probe.o"
HEADER_DEPFILE="$HEADER_OUT/probe.d"
HEADER_SHA_BEFORE=$(sha256_file "$HEADER_OBJECT")
HEADER_RUNS_BEFORE=$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')
rm -f "$HEADER_OBJECT" "$HEADER_DEPFILE"
HEADER_HIT_SECONDS=$(timed_run header-hit "${HEADER_CMD[@]}")
assert_fast_hit "copied-header cache hit" "$HEADER_HIT_SECONDS"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq "$HEADER_RUNS_BEFORE" ] ||
    fail "unchanged copied-header hit invoked the compiler"
[ "$(sha256_file "$HEADER_OBJECT")" = "$HEADER_SHA_BEFORE" ] ||
    fail "unchanged copied-header hit produced a different object"

printf '\n#undef MWCC_CACHE_HEADER_PROBE_VALUE\n#define MWCC_CACHE_HEADER_PROBE_VALUE 2\n' \
    >>"$HEADER_TREE/probe.h"
rm -f "$HEADER_OBJECT" "$HEADER_DEPFILE"
HEADER_MISS_SECONDS=$(timed_run header-miss "${HEADER_CMD[@]}")
HEADER_SHA_AFTER=$(sha256_file "$HEADER_OBJECT")
[ "$HEADER_SHA_AFTER" != "$HEADER_SHA_BEFORE" ] ||
    fail "header content changed, but the shim returned the stale object"
[ "$(wc -l <"$MWCC_TEST_COMPILE_LOG" | tr -d ' ')" -eq "$((HEADER_RUNS_BEFORE + 1))" ] ||
    fail "header content change did not invoke the compiler"
printf 'Header invalidation compile latency: %sms\n' "$(milliseconds "$HEADER_MISS_SECONDS")"

printf '4/7 strict non-compile passthrough...\n'
cd "$MELEE_ROOT"
export MWCC_CACHE_REAL_WIBO="$REAL_WIBO"
set +e
"$REAL_WIBO" "$COMPILER" >"$TEST_ROOT/bare-real.stdout" 2>"$TEST_ROOT/bare-real.stderr"
BARE_REAL_RC=$?
"$SHIM" "$COMPILER" >"$TEST_ROOT/bare-shim.stdout" 2>"$TEST_ROOT/bare-shim.stderr"
BARE_SHIM_RC=$?
set -e
[ "$BARE_SHIM_RC" -eq "$BARE_REAL_RC" ] ||
    fail "bare passthrough exit $BARE_SHIM_RC differs from real wibo exit $BARE_REAL_RC"
cmp -s "$TEST_ROOT/bare-real.stdout" "$TEST_ROOT/bare-shim.stdout" ||
    fail "bare passthrough stdout differs from real wibo"
cmp -s "$TEST_ROOT/bare-real.stderr" "$TEST_ROOT/bare-shim.stderr" ||
    fail "bare passthrough stderr differs from real wibo"

# Count compiler invocations without changing the raw dependency file.  Unlike
# NORMALIZING_WIBO above, this wrapper is suitable for synthesize-mode tests.
COUNTING_WIBO="$TEST_ROOT/wibo-counting"
cat >"$COUNTING_WIBO" <<'SH'
#!/bin/bash
set -euo pipefail
printf 'compile\n' >>"$MWCC_TEST_COMPILE_LOG"
exec "$MWCC_TEST_REAL_WIBO" "$@"
SH
chmod 755 "$COUNTING_WIBO"

printf '5/7 default synthesize mode across two copied checkout roots...\n'
unset MWCC_CACHE_DEPMODE
SYNTH_CACHE="$TEST_ROOT/synthesize-cache"
SYNTH_LOG="$TEST_ROOT/synthesize-compiler-runs"
SYNTH_TREE_A="$TEST_ROOT/worktree a"
SYNTH_TREE_B="$TEST_ROOT/worktree b"
for tree in "$SYNTH_TREE_A" "$SYNTH_TREE_B"; do
    mkdir -p "$tree/src" "$tree/include" "$tree/build"
    cp "$MELEE_ROOT/src/sysdolphin/baselib/leak.h" "$tree/include/probe.h"
    printf '\n#define MWCC_CACHE_SYNTH_PROBE 7\n' >>"$tree/include/probe.h"
    printf '#include "probe.h"\nint probe = MWCC_CACHE_SYNTH_PROBE;\n' \
        >"$tree/src/probe.c"
done
SYNTH_ARGS=(
    "$MELEE_ROOT/$SJISWRAP" "$MELEE_ROOT/$COMPILER"
    -cwd source -Cpp_exceptions off -proc gekko -fp hardware -nosyspath
    -nodefaults -i include -lang=c -MMD -c src/probe.c
)
SYNTH_CMD_A=("$SHIM" "${SYNTH_ARGS[@]}" -o "$SYNTH_TREE_A/build")
SYNTH_CMD_B=("$SHIM" "${SYNTH_ARGS[@]}" -o "$SYNTH_TREE_B/build")
export MWCC_CACHE_DIR="$SYNTH_CACHE"
export MWCC_CACHE_REAL_WIBO="$COUNTING_WIBO"
export MWCC_TEST_REAL_WIBO="$REAL_WIBO"
export MWCC_TEST_COMPILE_LOG="$SYNTH_LOG"

cd "$SYNTH_TREE_A"
"${SYNTH_CMD_A[@]}"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "synthesize worktree A miss did not invoke MWCC exactly once"
"$PYTHON" - "$SYNTH_CACHE" <<'PY'
import json
import pathlib
import sys

manifests = [json.loads(path.read_text()) for path in pathlib.Path(sys.argv[1]).glob("manifests/*/*.json")]
portable = [manifest for manifest in manifests if manifest.get("dependency_mode") == "synthesize"]
assert len(portable) == 1, "expected one synthesis manifest"
manifest = portable[0]
assert manifest["worktree_only"] is False, "in-tree dependencies were tagged worktree-only"
assert all(not pathlib.Path(dep["path"]).is_absolute() for dep in manifest["dependencies"]), "portable dependency was not cwd-relative"
assert [dep["mwcc_path_kind"] for dep in manifest["dependencies"]] == ["relative", "absolute"], "source/header MWCC emission kinds were not preserved"
PY
cp build/probe.o "$TEST_ROOT/synthesize-a-compiled.o"
cp build/probe.d "$TEST_ROOT/synthesize-a-compiled.d"
rm -f build/probe.o build/probe.d
SYNTH_A_HIT_SECONDS=$(timed_run synthesize-a-hit "${SYNTH_CMD_A[@]}")
assert_fast_hit "synthesize worktree A cache hit" "$SYNTH_A_HIT_SECONDS"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "synthesize worktree A hit invoked MWCC"
cmp -s "$TEST_ROOT/synthesize-a-compiled.o" build/probe.o ||
    fail "synthesize worktree A hit object differs from real compile"
cmp -s "$TEST_ROOT/synthesize-a-compiled.d" build/probe.d ||
    fail "synthesize worktree A depfile is not byte-identical to real MWCC"

# Establish worktree B's expected bytes with a real compile, then require the
# shared cache to reproduce those root-specific bytes without another compile.
cd "$SYNTH_TREE_B"
"$REAL_WIBO" "${SYNTH_ARGS[@]}" -o "$SYNTH_TREE_B/build"
cp build/probe.o "$TEST_ROOT/synthesize-b-compiled.o"
cp build/probe.d "$TEST_ROOT/synthesize-b-compiled.d"
rm -f build/probe.o build/probe.d
SYNTH_B_HIT_SECONDS=$(timed_run synthesize-b-hit "${SYNTH_CMD_B[@]}")
assert_fast_hit "synthesize worktree B cross-root cache hit" "$SYNTH_B_HIT_SECONDS"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "synthesize worktree B cross-root hit invoked MWCC"
cmp -s "$TEST_ROOT/synthesize-b-compiled.o" build/probe.o ||
    fail "synthesize worktree B hit object differs from real compile"
cmp -s "$TEST_ROOT/synthesize-b-compiled.d" build/probe.d ||
    fail "synthesize worktree B depfile is not byte-identical to real MWCC"
cmp -s "$TEST_ROOT/synthesize-a-compiled.d" \
    "$TEST_ROOT/synthesize-b-compiled.d" &&
    fail "real MWCC depfiles unexpectedly ignored their different checkout roots"
"$PYTHON" - "$TEST_ROOT/synthesize-a-compiled.d" <<'PY'
import pathlib
import sys

data = pathlib.Path(sys.argv[1]).read_bytes()
assert data.startswith(b"Z:\\"), "absolute MWCC target did not use Z:\\"
assert b" \\\r\n\tZ:\\" in data, "missing MWCC CRLF continuation plus tab"
assert b"worktree\\ a" in data, "MWCC path space was not backslash-escaped"
assert data.endswith(b" \r\n"), "final MWCC dependency did not end space+CRLF"
assert b"\n" not in data.replace(b"\r\n", b""), "depfile contains bare LF"
PY
printf 'Measured synthesize hits: A=%sms, B=%sms\n' \
    "$(milliseconds "$SYNTH_A_HIT_SECONDS")" \
    "$(milliseconds "$SYNTH_B_HIT_SECONDS")"

# An include outside cwd remains absolute in the manifest and prevents reuse
# from a different worktree root, even when the relative layout is identical.
OUTSIDE_ROOT_A="$TEST_ROOT/outside a"
OUTSIDE_ROOT_B="$TEST_ROOT/outside b"
for root in "$OUTSIDE_ROOT_A" "$OUTSIDE_ROOT_B"; do
    mkdir -p "$root/worktree/src" "$root/worktree/build" "$root/external"
    cp "$MELEE_ROOT/src/sysdolphin/baselib/leak.h" "$root/external/probe.h"
    printf '\n#define MWCC_CACHE_OUTSIDE_PROBE 9\n' >>"$root/external/probe.h"
    printf '#include "probe.h"\nint probe = MWCC_CACHE_OUTSIDE_PROBE;\n' \
        >"$root/worktree/src/probe.c"
done
OUTSIDE_ARGS=(
    "$MELEE_ROOT/$SJISWRAP" "$MELEE_ROOT/$COMPILER"
    -cwd source -Cpp_exceptions off -proc gekko -fp hardware -nosyspath
    -nodefaults -i ../external -lang=c -MMD -c src/probe.c
)
cd "$OUTSIDE_ROOT_A/worktree"
"$SHIM" "${OUTSIDE_ARGS[@]}" -o "$OUTSIDE_ROOT_A/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 2 ] ||
    fail "outside-cwd worktree A miss did not invoke MWCC"
cp build/probe.d "$TEST_ROOT/outside-a-compiled.d"
rm -f build/probe.o build/probe.d
"$SHIM" "${OUTSIDE_ARGS[@]}" -o "$OUTSIDE_ROOT_A/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 2 ] ||
    fail "outside-cwd entry missed in its original worktree"
cmp -s "$TEST_ROOT/outside-a-compiled.d" build/probe.d ||
    fail "outside-cwd synthesized depfile differs in its original worktree"
"$PYTHON" - "$SYNTH_CACHE" "$(pwd -P)" <<'PY'
import json
import pathlib
import sys

manifests = [json.loads(path.read_text()) for path in pathlib.Path(sys.argv[1]).glob("manifests/*/*.json")]
restricted = [manifest for manifest in manifests if manifest.get("worktree_only") is True]
assert len(restricted) == 1, "expected one worktree-only synthesis manifest"
manifest = restricted[0]
assert manifest["worktree_cwd"] == sys.argv[2], "worktree-only manifest cwd is wrong"
assert any(pathlib.Path(dep["path"]).is_absolute() for dep in manifest["dependencies"]), "outside-cwd dependency was not stored absolute"
PY
cd "$OUTSIDE_ROOT_B/worktree"
"$SHIM" "${OUTSIDE_ARGS[@]}" -o "$OUTSIDE_ROOT_B/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 3 ] ||
    fail "worktree-only entry was reused from a different cwd"
cd "$OUTSIDE_ROOT_A/worktree"
rm -f build/probe.o build/probe.d
"$SHIM" "${OUTSIDE_ARGS[@]}" -o "$OUTSIDE_ROOT_A/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 3 ] ||
    fail "worktree B displaced worktree A's restricted manifest"

# A relative -c path may itself point outside cwd. Its manifest identity stays
# absolute/worktree-only, while synthesis must recover MWCC's relative spelling.
for root in "$OUTSIDE_ROOT_A" "$OUTSIDE_ROOT_B"; do
    mkdir -p "$root/source"
    printf 'int outside_source = 11;\n' >"$root/source/probe.c"
done
OUTSIDE_SOURCE_ARGS=(
    "$MELEE_ROOT/$SJISWRAP" "$MELEE_ROOT/$COMPILER"
    -cwd source -Cpp_exceptions off -proc gekko -fp hardware -nosyspath
    -nodefaults -lang=c -MMD -c ../source/probe.c
)
cd "$OUTSIDE_ROOT_A/worktree"
"$SHIM" "${OUTSIDE_SOURCE_ARGS[@]}" -o "$OUTSIDE_ROOT_A/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 4 ] ||
    fail "relative outside-cwd source miss did not invoke MWCC"
cp build/probe.d "$TEST_ROOT/outside-relative-a-compiled.d"
rm -f build/probe.o build/probe.d
"$SHIM" "${OUTSIDE_SOURCE_ARGS[@]}" -o "$OUTSIDE_ROOT_A/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 4 ] ||
    fail "relative outside-cwd source missed in its original worktree"
cmp -s "$TEST_ROOT/outside-relative-a-compiled.d" build/probe.d ||
    fail "relative outside-cwd source was synthesized with the wrong spelling"
cd "$OUTSIDE_ROOT_B/worktree"
"$SHIM" "${OUTSIDE_SOURCE_ARGS[@]}" -o "$OUTSIDE_ROOT_B/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 5 ] ||
    fail "relative outside-cwd source cache crossed worktree roots"
cd "$OUTSIDE_ROOT_A/worktree"
rm -f build/probe.o build/probe.d
"$SHIM" "${OUTSIDE_SOURCE_ARGS[@]}" -o "$OUTSIDE_ROOT_A/worktree/build"
[ "$(wc -l <"$SYNTH_LOG" | tr -d ' ')" -eq 5 ] ||
    fail "relative outside-cwd source entry was displaced by worktree B"

printf '6/7 default synthesize mode in projects/melee/checkout...\n'
REAL_SYNTH_CACHE="$TEST_ROOT/real-checkout-cache"
REAL_SYNTH_OUT="$TEST_ROOT/real checkout out"
REAL_SYNTH_LOG="$TEST_ROOT/real-checkout-compiler-runs"
mkdir -p "$REAL_SYNTH_OUT"
REAL_SYNTH_CMD=(
    "$SHIM" "$SJISWRAP" "$COMPILER" "${CFLAGS[@]}"
    -MMD -c "$SOURCE" -o "$REAL_SYNTH_OUT"
)
export MWCC_CACHE_DIR="$REAL_SYNTH_CACHE"
export MWCC_CACHE_REAL_WIBO="$COUNTING_WIBO"
export MWCC_TEST_COMPILE_LOG="$REAL_SYNTH_LOG"
cd "$MELEE_ROOT"
"${REAL_SYNTH_CMD[@]}"
[ "$(wc -l <"$REAL_SYNTH_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "real-checkout synthesize miss did not invoke MWCC exactly once"
assert_expected_object "$REAL_SYNTH_OUT/ftPp_SpecialLw.o"
cp "$REAL_SYNTH_OUT/ftPp_SpecialLw.o" "$TEST_ROOT/real-checkout-compiled.o"
cp "$REAL_SYNTH_OUT/ftPp_SpecialLw.d" "$TEST_ROOT/real-checkout-compiled.d"
grep -Fq 'Github\ Repos' "$TEST_ROOT/real-checkout-compiled.d" ||
    fail "real MWCC depfile did not escape the checkout path's space"
rm -f "$REAL_SYNTH_OUT/ftPp_SpecialLw.o" "$REAL_SYNTH_OUT/ftPp_SpecialLw.d"
REAL_SYNTH_HIT_SECONDS=$(timed_run real-checkout-synthesize-hit \
    "${REAL_SYNTH_CMD[@]}")
assert_fast_hit "real-checkout synthesize cache hit" "$REAL_SYNTH_HIT_SECONDS"
[ "$(wc -l <"$REAL_SYNTH_LOG" | tr -d ' ')" -eq 1 ] ||
    fail "real-checkout synthesize hit invoked MWCC"
cmp -s "$TEST_ROOT/real-checkout-compiled.o" \
    "$REAL_SYNTH_OUT/ftPp_SpecialLw.o" ||
    fail "real-checkout synthesized object differs from real compile"
cmp -s "$TEST_ROOT/real-checkout-compiled.d" \
    "$REAL_SYNTH_OUT/ftPp_SpecialLw.d" ||
    fail "real-checkout synthesized depfile is not byte-identical to real MWCC"
printf 'Measured real-checkout synthesize hit: %sms\n' \
    "$(milliseconds "$REAL_SYNTH_HIT_SECONDS")"

rm -f "$REAL_SYNTH_OUT/ftPp_SpecialLw.o" "$REAL_SYNTH_OUT/ftPp_SpecialLw.d"
MWCC_CACHE_VERIFY=1 "${REAL_SYNTH_CMD[@]}"
[ "$(wc -l <"$REAL_SYNTH_LOG" | tr -d ' ')" -eq 2 ] ||
    fail "synthesize-mode MWCC_CACHE_VERIFY did not invoke MWCC once"
cmp -s "$TEST_ROOT/real-checkout-compiled.o" \
    "$REAL_SYNTH_OUT/ftPp_SpecialLw.o" ||
    fail "synthesize-mode verified object differs from real compile"
cmp -s "$TEST_ROOT/real-checkout-compiled.d" \
    "$REAL_SYNTH_OUT/ftPp_SpecialLw.d" ||
    fail "synthesize-mode verified depfile differs from real compile"

printf '7/7 transform_dep pipeline equivalence and idempotence...\n'
cp "$TEST_ROOT/real-checkout-compiled.d" "$TEST_ROOT/compiled-transformed.d"
"$PYTHON" "$TRANSFORM_DEP" "$TEST_ROOT/compiled-transformed.d" \
    "$TEST_ROOT/compiled-transformed.d"
cp "$REAL_SYNTH_OUT/ftPp_SpecialLw.d" "$TEST_ROOT/synthesized-transformed.d"
"$PYTHON" "$TRANSFORM_DEP" "$TEST_ROOT/synthesized-transformed.d" \
    "$TEST_ROOT/synthesized-transformed.d"
cmp -s "$TEST_ROOT/compiled-transformed.d" \
    "$TEST_ROOT/synthesized-transformed.d" ||
    fail "transform_dep output differs between compile and synthesized hit"
cp "$TEST_ROOT/synthesized-transformed.d" \
    "$TEST_ROOT/synthesized-transformed-once.d"
"$PYTHON" "$TRANSFORM_DEP" "$TEST_ROOT/synthesized-transformed.d" \
    "$TEST_ROOT/synthesized-transformed.d"
cmp -s "$TEST_ROOT/synthesized-transformed-once.d" \
    "$TEST_ROOT/synthesized-transformed.d" ||
    fail "transform_dep is not idempotent on a synthesized depfile"

printf 'PASS: MWCC object cache end-to-end tests passed.\n'
