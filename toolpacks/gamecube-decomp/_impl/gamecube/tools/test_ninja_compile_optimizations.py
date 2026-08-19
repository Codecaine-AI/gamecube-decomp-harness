#!/usr/bin/env python3
"""Real-Melee correctness gate and benchmark for ninja_compile.py caches."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.util
import json
import os
import shlex
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import ModuleType
from typing import Dict, Iterator, List, Optional, Tuple


SCRIPT = Path(__file__).resolve().with_name("ninja_compile.py")
REPO_ROOT = SCRIPT.parents[5]
DEFAULT_MELEE_ROOT = REPO_ROOT / "projects/melee/checkout"
UNITS = (
    "melee/ft/chara/ftPopo/ftPp_SpecialLw",
    "melee/lb/lbtime",
    "dolphin/vi/vi",
)
BATCH_UNIT = "melee/lb/lbtime"
CLEAN_UNIT = "sysdolphin/baselib/psdisp"


def fail(message: str) -> None:
    raise RuntimeError(message)


@contextlib.contextmanager
def environment(**updates: Optional[str]) -> Iterator[None]:
    previous = {name: os.environ.get(name) for name in updates}
    try:
        for name, value in updates.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        yield
    finally:
        for name, value in previous.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def load_ninja_compile(root: Path, suffix: str) -> ModuleType:
    tools_dir = str(SCRIPT.parent)
    if tools_dir not in sys.path:
        sys.path.insert(0, tools_dir)
    module_name = f"ninja_compile_test_{suffix}_{time.time_ns()}"
    spec = importlib.util.spec_from_file_location(module_name, SCRIPT)
    if spec is None or spec.loader is None:
        fail(f"cannot import {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    with environment(ORCH_GAME_REPO_ROOT=str(root)):
        spec.loader.exec_module(module)
    return module


def require_paths(paths: List[Path]) -> None:
    missing = [str(path) for path in paths if not path.exists()]
    if missing:
        fail("missing prerequisite(s): " + ", ".join(missing))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_checked(command: List[str], *, cwd: Path) -> float:
    started = time.perf_counter()
    result = subprocess.run(command, cwd=cwd, capture_output=True)
    elapsed = time.perf_counter() - started
    if result.returncode != 0:
        sys.stdout.buffer.write(result.stdout)
        sys.stderr.buffer.write(result.stderr)
        fail(f"command exited {result.returncode}: {shlex.join(command)}")
    return elapsed


def raw_compile(
    melee_root: Path,
    block: object,
    unit: str,
    wrapped: bool,
    output_dir: Path,
) -> Tuple[Path, Path, float]:
    output_dir.mkdir(parents=True)
    runner = melee_root / "build/tools/wibo"
    wrapper = melee_root / "build/tools/sjiswrap.exe"
    compiler = melee_root / "build/compilers" / block.mw_version / "mwcceppc.exe"
    command = [str(runner)]
    if wrapped:
        command.append(str(wrapper))
    command += [str(compiler), *shlex.split(block.cflags)]
    command += ["-MMD", "-c", block.src, "-o", str(output_dir)]
    elapsed = run_checked(command, cwd=melee_root)
    stem = Path(block.src).stem
    obj = output_dir / f"{stem}.o"
    depfile = output_dir / f"{stem}.d"
    require_paths([obj, depfile])
    return obj, depfile, elapsed


def normalize_mwcc_depfile(raw: Path, output: Path, unit: str) -> None:
    """Convert raw MWCC DOS paths without damaging escaped spaces."""
    lines = raw.read_bytes().splitlines()
    if not lines:
        fail(f"empty MWCC depfile: {raw}")
    separator = lines[0].find(b": ", 2)
    if separator < 0:
        fail(f"unrecognized MWCC depfile: {raw}")
    dependency_lines = [lines[0][separator + 2 :], *lines[1:]]
    dependencies: List[str] = []
    for line in dependency_lines:
        value = line.strip()
        if value.endswith(b" \\"):
            value = value[:-2]
        if not value:
            continue
        value = value.replace(b"\\ ", b"\0")
        if value[:3].lower() == b"z:\\":
            value = b"/" + value[3:]
        value = value.replace(b"\\", b"/").replace(b"\0", b" ")
        dependencies.append(os.fsdecode(value))
    if not dependencies:
        fail(f"MWCC depfile has no dependencies: {raw}")

    def make_escape(path: str) -> str:
        return path.replace("\\", "\\\\").replace(" ", "\\ ").replace("#", "\\#")

    output.parent.mkdir(parents=True, exist_ok=True)
    target = f"{Path(unit).name}.o"
    rendered = f"{target}: \\\n" + "".join(
        f"\t{make_escape(path)}" + (" \\\n" if index + 1 < len(dependencies) else "\n")
        for index, path in enumerate(dependencies)
    )
    output.write_text(rendered, encoding="utf-8")


def make_test_root(melee_root: Path, test_root: Path) -> Path:
    mirror = test_root / "checkout"
    (mirror / "build/GALE01").mkdir(parents=True)
    # Candidate compilation writes beside the real TU. Keep the tested checkout
    # read-only by giving the mirror its own source tree.
    shutil.copytree(melee_root / "src", mirror / "src", symlinks=True)
    (mirror / "extern").symlink_to(
        melee_root / "extern", target_is_directory=True
    )
    (mirror / "build/tools").symlink_to(
        melee_root / "build/tools", target_is_directory=True
    )
    (mirror / "build/compilers").symlink_to(
        melee_root / "build/compilers", target_is_directory=True
    )
    shutil.copy2(melee_root / "build.ninja", mirror / "build.ninja")
    shutil.copy2(
        melee_root / "build/GALE01/report.json",
        mirror / "build/GALE01/report.json",
    )
    return mirror


def first_report_symbol(report_path: Path) -> Tuple[str, str]:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    for unit in report.get("units", []):
        for function in unit.get("functions", []):
            name = function.get("name")
            if isinstance(name, str):
                return name, unit.get("name", "").removeprefix("main/")
    fail(f"no function symbols in {report_path}")


def compile_via_module(
    module: ModuleType,
    unit: str,
    destination: Path,
    *,
    metadata_cache: bool,
    sjis_bypass: bool,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with environment(
        NINJA_COMPILE_NO_METADATA_CACHE=None if metadata_cache else "1",
        MWCC_NO_SJIS_BYPASS=None if sjis_bypass else "1",
    ):
        compiled = module.direct_compile(unit, quiet=False)
    if compiled is None:
        fail(f"direct_compile failed for {unit}")
    try:
        shutil.copy2(compiled.obj, destination)
    finally:
        compiled.tmpdir.cleanup()


def benchmark_metadata(
    module: ModuleType, symbol: str, unit: str, iterations: int
) -> Dict[str, Tuple[float, float]]:
    results: Dict[str, Tuple[float, float]] = {}
    lookups = {
        "report.json": lambda: module.find_unit_for_function(symbol),
        "build.ninja": lambda: module.find_build_block(unit),
    }
    for label, lookup in lookups.items():
        uncached: List[float] = []
        with environment(NINJA_COMPILE_NO_METADATA_CACHE="1"):
            for _ in range(iterations):
                module._METADATA_MEMORY.clear()
                started = time.perf_counter()
                lookup()
                uncached.append(time.perf_counter() - started)

        with environment(NINJA_COMPILE_NO_METADATA_CACHE=None):
            module._METADATA_MEMORY.clear()
            lookup()
            cached: List[float] = []
            for _ in range(iterations):
                module._METADATA_MEMORY.clear()
                started = time.perf_counter()
                lookup()
                cached.append(time.perf_counter() - started)
        results[label] = (statistics.median(uncached), statistics.median(cached))
    return results


def legacy_batch_fallback(
    module: ModuleType, unit: str, sources: List[str]
) -> Tuple[List[Optional[bytes]], float]:
    """The former failed-batch + one compile per missing object behavior."""
    started = time.perf_counter()
    block = module.find_build_block(unit)
    src_dir = module.source_dir_for(unit)
    cfiles: List[Path] = []
    outdir = tempfile.TemporaryDirectory(prefix="legacy-batch-", dir=module.ROOT / "build")
    cleanups: List[object] = [outdir]
    try:
        for source in sources:
            fd, name = tempfile.mkstemp(
                suffix=".c", prefix=".permute-", dir=str(src_dir)
            )
            path = Path(name)
            module._TEMP_CANDIDATES.add(path)
            with os.fdopen(fd, "w") as stream:
                stream.write(source)
            cfiles.append(path)

        source_args = [module._root_rel(path) for path in cfiles]
        prefix = module._compiler_prefix(
            block, obj_path=unit, sources=source_args, quiet=True
        )
        if prefix is None:
            fail("legacy batch could not resolve MWCC")
        command = [*prefix, *shlex.split(block.cflags)]
        command += ["-o", module._root_rel(Path(outdir.name)), "-c", *source_args]
        module.subprocess.run(
            command, cwd=module.ROOT, capture_output=True, text=True
        )

        objects: List[Optional[Path]] = []
        for cfile in cfiles:
            obj = Path(outdir.name) / f"{cfile.stem}.o"
            objects.append(obj if obj.exists() else None)

        for index, obj in enumerate(objects):
            if obj is None:
                compiled = module.compile_source_text(unit, sources[index])
                if compiled is not None:
                    objects[index] = compiled.obj
                    cleanups.append(compiled.tmpdir)
        output = [obj.read_bytes() if obj is not None else None for obj in objects]
        return output, time.perf_counter() - started
    finally:
        for cfile in cfiles:
            try:
                cfile.unlink()
            except OSError:
                pass
            module._TEMP_CANDIDATES.discard(cfile)
        for cleanup in cleanups:
            cleanup.cleanup()


def optimized_batch(
    module: ModuleType, unit: str, sources: List[str]
) -> Tuple[List[Optional[bytes]], float]:
    started = time.perf_counter()
    objects, cleanups = module.compile_batch(unit, sources)
    elapsed = time.perf_counter() - started
    try:
        return [obj.read_bytes() if obj is not None else None for obj in objects], elapsed
    finally:
        for cleanup in cleanups:
            cleanup.cleanup()


@contextlib.contextmanager
def deterministic_candidate_names(module: ModuleType) -> Iterator[None]:
    """Make old/new MWCC objects directly byte-comparable across test runs."""
    original = module.tempfile.mkstemp
    next_index = 0

    def deterministic_mkstemp(
        suffix: str = "", prefix: str = "tmp", dir: Optional[str] = None
    ) -> Tuple[int, str]:
        nonlocal next_index
        if prefix != ".permute-" or dir is None:
            return original(suffix=suffix, prefix=prefix, dir=dir)
        while True:
            path = Path(dir) / f".permute-candidate-{next_index:04d}{suffix}"
            next_index += 1
            try:
                fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
                return fd, str(path)
            except FileExistsError:
                continue

    module.tempfile.mkstemp = deterministic_mkstemp
    try:
        yield
    finally:
        module.tempfile.mkstemp = original


@contextlib.contextmanager
def record_mwcc_commands(module: ModuleType) -> Iterator[List[List[str]]]:
    original = module.subprocess.run
    commands: List[List[str]] = []

    def recording(command: List[str], *args: object, **kwargs: object) -> object:
        if any(str(argument).endswith("mwcceppc.exe") for argument in command):
            commands.append([str(argument) for argument in command])
        return original(command, *args, **kwargs)

    module.subprocess.run = recording
    try:
        yield commands
    finally:
        module.subprocess.run = original


def source_counts(commands: List[List[str]]) -> List[int]:
    counts: List[int] = []
    for command in commands:
        compile_index = command.index("-c")
        counts.append(
            sum(argument.endswith(".c") for argument in command[compile_index + 1 :])
        )
    return counts


def benchmark_clean_cache(
    module: ModuleType, raw_obj: Path, test_root: Path, repeats: int
) -> Tuple[float, float, str]:
    dtk = module.ROOT / "build/tools/dtk"
    work = test_root / "dtk-clean"
    work.mkdir()
    fresh = work / "fresh.o"
    cold = work / "cold.o"
    warm = work / "warm.o"
    shutil.copy2(raw_obj, fresh)
    fresh_elapsed = run_checked(
        [str(dtk), "extab", "clean", "--padding", "", str(fresh), str(fresh)],
        cwd=module.ROOT,
    )

    shutil.copy2(raw_obj, cold)
    cache_path = module._clean_object_cache_path(cold, dtk, "")
    if cache_path is None:
        fail("clean-object cache key could not be calculated")
    try:
        cache_path.unlink()
    except FileNotFoundError:
        pass

    dtk_calls: List[List[str]] = []
    original = module.subprocess.run

    def recording(command: List[str], *args: object, **kwargs: object) -> object:
        if command and str(command[0]) == str(dtk):
            dtk_calls.append([str(argument) for argument in command])
        return original(command, *args, **kwargs)

    module.subprocess.run = recording
    try:
        if not module._run_extab_clean(cold, dtk, "", quiet=False):
            fail("cold cached DTK clean failed")
        shutil.copy2(raw_obj, warm)
        if not module._run_extab_clean(warm, dtk, "", quiet=False):
            fail("warm cached DTK clean failed")
    finally:
        module.subprocess.run = original
    if len(dtk_calls) != 1:
        fail(f"expected one DTK process for cold+warm clean, got {len(dtk_calls)}")
    require_paths([cache_path])
    if list(cache_path.parent.glob(f".{cache_path.name}.*.tmp")):
        fail("clean-object cache left a temporary file after atomic install")
    if not (fresh.read_bytes() == cold.read_bytes() == warm.read_bytes()):
        fail("fresh, cold-cache, and warm-cache DTK outputs differ")

    padding_probe = work / "padding-probe.o"
    shutil.copy2(raw_obj, padding_probe)
    other_padding = module._clean_object_cache_path(padding_probe, dtk, "00")
    if other_padding is None or other_padding == cache_path:
        fail("DTK padding flags did not affect the clean-object cache key")

    direct_times: List[float] = [fresh_elapsed]
    warm_times: List[float] = []
    for index in range(max(3, repeats)):
        direct_obj = work / f"direct-{index}.o"
        shutil.copy2(raw_obj, direct_obj)
        direct_times.append(
            run_checked(
                [
                    str(dtk),
                    "extab",
                    "clean",
                    "--padding",
                    "",
                    str(direct_obj),
                    str(direct_obj),
                ],
                cwd=module.ROOT,
            )
        )
        warm_obj = work / f"warm-{index}.o"
        shutil.copy2(raw_obj, warm_obj)
        started = time.perf_counter()
        if not module._run_extab_clean(warm_obj, dtk, "", quiet=False):
            fail("warm DTK cache benchmark failed")
        warm_times.append(time.perf_counter() - started)
        if warm_obj.read_bytes() != fresh.read_bytes():
            fail("warm benchmark object differs from fresh DTK output")

    return statistics.median(direct_times), statistics.median(warm_times), sha256(warm)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--melee-root", type=Path, default=DEFAULT_MELEE_ROOT)
    parser.add_argument("--timing-repeats", type=int, default=2)
    parser.add_argument("--keep", action="store_true", help="keep /tmp artifacts")
    args = parser.parse_args()
    melee_root = args.melee_root.resolve()
    if args.timing_repeats < 1:
        fail("--timing-repeats must be at least 1")

    require_paths(
        [
            melee_root / "build.ninja",
            melee_root / "build/GALE01/report.json",
            melee_root / "build/tools/wibo",
            melee_root / "build/tools/sjiswrap.exe",
        ]
    )
    test_root = Path(tempfile.mkdtemp(prefix="ninja-compile-optimizations-", dir="/tmp"))
    success = False
    try:
        mirror = make_test_root(melee_root, test_root)
        with environment(
            NINJA_COMPILE_NO_METADATA_CACHE="1",
            MWCC_NO_SJIS_BYPASS="1",
        ):
            source_module = load_ninja_compile(melee_root, "source")
            blocks = {
                unit: source_module.find_build_block(unit)
                for unit in (*UNITS, CLEAN_UNIT)
            }

        transformed_depfiles: Dict[str, Path] = {}
        timing_deltas: List[float] = []
        print("1/6 sjiswrap byte-identity gate")
        for unit_index, unit in enumerate(UNITS):
            block = blocks[unit]
            source = melee_root / block.src
            if not source.read_bytes().isascii():
                fail(f"selected source is not ASCII: {source}")
            mode_times: Dict[str, List[float]] = {"wrapped": [], "direct": []}
            mode_objects: Dict[str, List[Path]] = {"wrapped": [], "direct": []}
            for repeat in range(args.timing_repeats):
                modes = ("wrapped", "direct")
                if (unit_index + repeat) % 2:
                    modes = tuple(reversed(modes))
                for mode in modes:
                    output_dir = (
                        test_root
                        / "raw"
                        / unit.replace("/", "_")
                        / f"{repeat}-{mode}"
                    )
                    obj, depfile, elapsed = raw_compile(
                        melee_root, block, unit, mode == "wrapped", output_dir
                    )
                    mode_times[mode].append(elapsed)
                    mode_objects[mode].append(obj)
                    if mode == "wrapped" and unit not in transformed_depfiles:
                        normalized = (
                            test_root
                            / "normalized-deps"
                            / f"{unit.replace('/', '_')}.d"
                        )
                        normalize_mwcc_depfile(depfile, normalized, unit)
                        transformed_depfiles[unit] = normalized
            wrapped_bytes = mode_objects["wrapped"][0].read_bytes()
            direct_bytes = mode_objects["direct"][0].read_bytes()
            if wrapped_bytes != direct_bytes:
                fail(f"sjiswrap changed object bytes for {unit}")
            if any(path.read_bytes() != wrapped_bytes for paths in mode_objects.values() for path in paths):
                fail(f"repeated object output changed for {unit}")
            timing_deltas.extend(
                wrapped - direct
                for wrapped, direct in zip(mode_times["wrapped"], mode_times["direct"])
            )
            print(
                f"  PASS {unit}: {len(wrapped_bytes)} bytes, "
                f"sha256={hashlib.sha256(wrapped_bytes).hexdigest()}"
            )
        clean_raw, _clean_depfile, _clean_compile_time = raw_compile(
            melee_root,
            blocks[CLEAN_UNIT],
            CLEAN_UNIT,
            True,
            test_root / "raw-clean-object",
        )

        test_module = load_ninja_compile(mirror, "mirror")
        first_unit = UNITS[0]
        first_block = test_module.find_build_block(first_unit)
        if test_module._can_bypass_sjiswrap(first_unit, first_block, [first_block.src]):
            fail("bypass was enabled without a retained depfile")
        for unit, depfile in transformed_depfiles.items():
            destination = mirror / f"build/GALE01/src/{unit}.d"
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(depfile, destination)

        print("2/6 bypass safety and cache fallback")
        for unit in UNITS:
            block = test_module.find_build_block(unit)
            with environment(MWCC_NO_SJIS_BYPASS=None):
                if not test_module._can_bypass_sjiswrap(unit, block, [block.src]):
                    fail(f"ASCII bypass did not activate for {unit}")
            with environment(MWCC_NO_SJIS_BYPASS="1"):
                if test_module._can_bypass_sjiswrap(unit, block, [block.src]):
                    fail(f"MWCC_NO_SJIS_BYPASS did not disable bypass for {unit}")
        non_ascii = test_root / "non-ascii.c"
        non_ascii.write_bytes(b"/* \x80 */\n")
        with environment(MWCC_NO_SJIS_BYPASS=None):
            if test_module._can_bypass_sjiswrap(
                first_unit, first_block, [str(non_ascii)]
            ):
                fail("non-ASCII source override bypassed sjiswrap")

        ascii_cache = test_module._sjis_base_cache_path(first_unit)
        ascii_cache.write_text("{corrupt", encoding="utf-8")
        test_module._SJIS_BASE_MEMORY.clear()
        with environment(MWCC_NO_SJIS_BYPASS=None):
            if not test_module._can_bypass_sjiswrap(
                first_unit, first_block, [first_block.src]
            ):
                fail("corrupt ASCII cache did not fall back to a fresh scan")
        json.loads(ascii_cache.read_text(encoding="utf-8"))
        print("  PASS missing .d, kill-switch, non-ASCII, and corrupt-cache cases")

        print("3/6 metadata-cache + sjis-bypass object parity")
        for unit in UNITS:
            off = test_root / "parity/off" / f"{unit.replace('/', '_')}.o"
            on = test_root / "parity/on" / f"{unit.replace('/', '_')}.o"
            compile_via_module(
                test_module,
                unit,
                off,
                metadata_cache=False,
                sjis_bypass=False,
            )
            compile_via_module(
                test_module,
                unit,
                on,
                metadata_cache=True,
                sjis_bypass=True,
            )
            if off.read_bytes() != on.read_bytes():
                fail(f"features off/on object mismatch for {unit}")
            print(f"  PASS {unit}: sha256={sha256(on)}")

        symbol, expected_unit = first_report_symbol(
            mirror / "build/GALE01/report.json"
        )
        if test_module.find_unit_for_function(symbol) != expected_unit:
            fail("cached report symbol index returned the wrong unit")
        metadata_paths = [
            mirror / "build/.ninja_compile_cache/build-edge-index-v1.json",
            mirror / "build/.ninja_compile_cache/report-symbol-index-v1.json",
        ]
        require_paths(metadata_paths)
        for cache_path in metadata_paths:
            cache_path.write_text("{corrupt", encoding="utf-8")
        test_module._METADATA_MEMORY.clear()
        test_module.find_build_block(first_unit)
        test_module.find_unit_for_function(symbol)
        for cache_path in metadata_paths:
            json.loads(cache_path.read_text(encoding="utf-8"))

        print("4/6 failed-batch salvage parity and process bound")
        batch_source = (mirror / test_module.find_build_block(BATCH_UNIT).src).read_text()
        batch_sources = [
            f"{batch_source}\n/* batch candidate {index} */\n" for index in range(8)
        ]
        broken_index = 2
        batch_sources[broken_index] = (
            "#error deliberately broken batch candidate\n" + batch_sources[broken_index]
        )
        with deterministic_candidate_names(test_module):
            legacy_output, legacy_elapsed = legacy_batch_fallback(
                test_module, BATCH_UNIT, batch_sources
            )
        with deterministic_candidate_names(test_module):
            with record_mwcc_commands(test_module) as commands:
                optimized_output, optimized_elapsed = optimized_batch(
                    test_module, BATCH_UNIT, batch_sources
                )
        expected_counts = [len(batch_sources), 1, len(batch_sources) - broken_index - 1]
        actual_counts = source_counts(commands)
        if actual_counts != expected_counts:
            fail(
                f"batch salvage MWCC source counts {actual_counts}, "
                f"expected {expected_counts}"
            )
        legacy_failures = [index for index, obj in enumerate(legacy_output) if obj is None]
        optimized_failures = [
            index for index, obj in enumerate(optimized_output) if obj is None
        ]
        if legacy_failures != [broken_index] or optimized_failures != legacy_failures:
            fail(
                f"failure attribution changed: legacy={legacy_failures}, "
                f"optimized={optimized_failures}"
            )
        if optimized_output != legacy_output:
            fail("batch salvage object set differs from per-object fallback")

        two_failure_sources = list(batch_sources)
        second_broken_index = 5
        two_failure_sources[second_broken_index] = (
            "#error second deliberately broken batch candidate\n"
            + two_failure_sources[second_broken_index]
        )
        with deterministic_candidate_names(test_module):
            two_failure_legacy, _ = legacy_batch_fallback(
                test_module, BATCH_UNIT, two_failure_sources
            )
        with deterministic_candidate_names(test_module):
            with record_mwcc_commands(test_module) as two_failure_commands:
                two_failure_optimized, _ = optimized_batch(
                    test_module, BATCH_UNIT, two_failure_sources
                )
        two_failure_counts = source_counts(two_failure_commands)
        expected_two_failure_counts = [8, 1, 5, 1, 2]
        if two_failure_counts != expected_two_failure_counts:
            fail(
                f"two-failure MWCC source counts {two_failure_counts}, "
                f"expected {expected_two_failure_counts}"
            )
        if two_failure_optimized != two_failure_legacy:
            fail("two-failure batch salvage differs from per-object fallback")
        if [
            index
            for index, obj in enumerate(two_failure_optimized)
            if obj is None
        ] != [broken_index, second_broken_index]:
            fail("two-failure batch attribution changed")

        legacy_times = [legacy_elapsed]
        optimized_times = [optimized_elapsed]
        for repeat in range(1, args.timing_repeats):
            modes = ("legacy", "optimized")
            if repeat % 2:
                modes = tuple(reversed(modes))
            for mode in modes:
                with deterministic_candidate_names(test_module):
                    if mode == "legacy":
                        output, elapsed = legacy_batch_fallback(
                            test_module, BATCH_UNIT, batch_sources
                        )
                        legacy_times.append(elapsed)
                    else:
                        output, elapsed = optimized_batch(
                            test_module, BATCH_UNIT, batch_sources
                        )
                        optimized_times.append(elapsed)
                if output != legacy_output:
                    fail(f"{mode} batch benchmark output changed")
        legacy_batch_time = statistics.median(legacy_times)
        optimized_batch_time = statistics.median(optimized_times)
        print(
            f"  PASS failures={optimized_failures}, MWCC source counts={actual_counts}; "
            f"two failures={two_failure_counts}"
        )
        print(
            f"  batch failure: {legacy_batch_time * 1000:.2f} ms per-object -> "
            f"{optimized_batch_time * 1000:.2f} ms suffix-batched "
            f"({(legacy_batch_time - optimized_batch_time) * 1000:.2f} ms saved)"
        )

        print("5/6 DTK clean-object cache byte-identity and timing")
        fresh_clean, warm_clean, clean_hash = benchmark_clean_cache(
            test_module, clean_raw, test_root, args.timing_repeats
        )
        print(f"  PASS fresh/cached sha256={clean_hash}")
        print(
            f"  dtk clean: {fresh_clean * 1000:.2f} ms fresh -> "
            f"{warm_clean * 1000:.2f} ms warm "
            f"({(fresh_clean - warm_clean) * 1000:.2f} ms saved)"
        )

        print("6/6 measured metadata and sjiswrap savings")
        metadata = benchmark_metadata(test_module, symbol, first_unit, 7)
        for label, (uncached, cached) in metadata.items():
            print(
                f"  {label}: {uncached * 1000:.2f} ms uncached -> "
                f"{cached * 1000:.2f} ms cached "
                f"({(uncached - cached) * 1000:.2f} ms saved)"
            )
        print(
            f"  sjiswrap: median paired saving "
            f"{statistics.median(timing_deltas) * 1000:.2f} ms/compile"
        )
        success = True
        return 0
    finally:
        if success and not args.keep:
            shutil.rmtree(test_root)
        else:
            print(f"artifacts={test_root}", file=sys.stderr)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
