#!/usr/bin/env python3
"""The native backend: traced MWCC builds, their capabilities, and bounded traced compiles.

The traced compiler is a rebuild of the stock MWCC with trace points that
write `mwcc-trace-v1` lines to `MWCC_TRACE_OUT` (never stderr). It must
compile byte-identical objects; every capture checks that against a stock
compile of the same input before trusting the trace.

Lookup order for a version `<ver>` (`1.2.5`, `1.2.5n`, `1.1p1`):

1. `$ORCH_MWCC_TRACED_ROOT/<ver>/mwcceppc.exe` or `.../GC/<ver>/mwcceppc.exe`
   (with `CAPABILITIES.json` in that root);
2. `<repo>/build/compilers-traced/GC/<ver>/mwcceppc.exe` (the sandbox image).

Capabilities come from `CAPABILITIES.json` beside the binaries, else
`$ORCH_MWCC_NATIVE_CAPABILITIES`, else the toolpack's committed
`native/CAPABILITIES.json`. A trace point the file does not list is
reported unavailable, never as empty.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

API_DIR = Path(__file__).resolve().parent
TOOL_DIR = API_DIR.parent
CAPABILITIES_SCHEMA = "mwcc-native-capabilities-v1"
NATIVE_CAPTURES = ("coloring-native", "decisions")
NO_DECISIONS = "no decisions traced: the function has no allocator, inlining, CSE or frame decisions (empty, asm or __sinit)"
QEMU_CAPTURES = ("pcode", "coloring", "pair", "trace")
CAPTURE_POINTS = {"coloring-native": ("interference", "coloring"), "decisions": ("coloring",)}
DEFAULT_TRACE_CAP = 64 * 1024 * 1024
STDOUT_CAP = 1024 * 1024


class NativeUnavailable(Exception):
    """The native backend cannot serve this request; `reason` says why."""

    def __init__(self, reason: str, **details: Any) -> None:
        super().__init__(reason)
        self.reason = reason
        self.details = details


def tools_dir() -> Path:
    """The shared gamecube tools (stack_check, ninja_compile, bounded_run)."""
    candidates = []
    if os.environ.get("ORCH_TOOL_IMPL_ROOT"):
        candidates.append(Path(os.environ["ORCH_TOOL_IMPL_ROOT"]) / "tools")
    candidates += [parent / "_impl" / "gamecube" / "tools" for parent in TOOL_DIR.parents]
    candidates.append(Path("/opt/toolpacks/gamecube-decomp/_impl/gamecube/tools"))
    for candidate in candidates:
        if (candidate / "stack_check.py").is_file():
            if str(candidate) not in sys.path:
                sys.path.insert(0, str(candidate))
            return candidate
    raise ImportError("could not locate the gamecube-decomp tools (stack_check.py)")


def choose_backend(capture: str, requested: str) -> tuple[Optional[str], Optional[str]]:
    """(backend, None) or (None, reason) for one capture under --backend."""
    if capture in NATIVE_CAPTURES:
        if requested == "qemu":
            return None, f"capture {capture} is produced only by the native traced compiler"
        return "native", None
    if requested == "native":
        return None, (f"capture {capture} needs PCode blocks and operands, which milestone 1 does not trace; "
                      "use backend auto or qemu")
    return "qemu", None


def sha1_file(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def short_version(mw_version: str) -> str:
    return mw_version.split("/", 1)[1] if "/" in mw_version else mw_version


def traced_roots(repo_root: Path) -> list[Path]:
    roots = []
    if os.environ.get("ORCH_MWCC_TRACED_ROOT"):
        roots.append(Path(os.environ["ORCH_MWCC_TRACED_ROOT"]))
    roots.append(repo_root / "build" / "compilers-traced")
    return roots


def find_traced_compiler(repo_root: Path, version: str) -> tuple[Optional[Path], Optional[Path]]:
    """(traced mwcceppc.exe, the root it was found under)."""
    for root in traced_roots(repo_root):
        for candidate in (root / version / "mwcceppc.exe", root / "GC" / version / "mwcceppc.exe"):
            if candidate.is_file():
                return candidate, root
    return None, None


def load_capabilities(root: Optional[Path]) -> tuple[dict, Path]:
    candidates = []
    if root is not None:
        candidates.append(root / "CAPABILITIES.json")
    if os.environ.get("ORCH_MWCC_NATIVE_CAPABILITIES"):
        candidates.append(Path(os.environ["ORCH_MWCC_NATIVE_CAPABILITIES"]))
    candidates.append(TOOL_DIR / "native" / "CAPABILITIES.json")
    for candidate in candidates:
        if candidate.is_file():
            data = json.loads(candidate.read_text(encoding="utf-8"))
            if data.get("schema") != CAPABILITIES_SCHEMA or not isinstance(data.get("versions"), dict):
                raise NativeUnavailable("capabilities-invalid", path=str(candidate))
            return data, candidate
    raise NativeUnavailable("capabilities-missing", searched=[str(c) for c in candidates])


@dataclass
class NativeSetup:
    mw_version: str
    version: str
    stock: dict
    traced: dict
    points: list[str]
    capabilities: dict = field(default_factory=dict)

    def provenance(self) -> dict:
        return {
            "backend": "native",
            "traced_sha1": self.traced["sha1"],
            "stock_identity": self.stock,
            "version": self.version,
            "capabilities": self.capabilities,
        }


def native_setup(repo: Any, unit: Any, required: tuple[str, ...] = ()) -> NativeSetup:
    """Resolve and verify the stock and traced compilers for `unit`'s version."""
    edge = repo.edges[unit.obj]
    version = short_version(edge.mw_version)
    stock_path = repo.root / "build" / "compilers" / edge.mw_version / "mwcceppc.exe"
    if not stock_path.is_file():
        raise NativeUnavailable("stock-compiler-missing", path=str(stock_path))
    traced_path, root = find_traced_compiler(repo.root, version)
    if traced_path is None:
        raise NativeUnavailable(f"no traced build for {edge.mw_version}",
                                searched=[str(r) for r in traced_roots(repo.root)])
    caps, caps_path = load_capabilities(root)
    entry = caps["versions"].get(version)
    if not isinstance(entry, dict):
        raise NativeUnavailable(f"{edge.mw_version} has no validated traced build in {caps_path}")
    stock_sha1 = sha1_file(stock_path)
    if entry.get("stock_sha1") and entry["stock_sha1"] != stock_sha1:
        raise NativeUnavailable("stock-compiler-identity-mismatch", expected=entry["stock_sha1"], actual=stock_sha1)
    traced_sha1 = sha1_file(traced_path)
    if entry.get("traced_sha1") and entry["traced_sha1"] != traced_sha1:
        raise NativeUnavailable("traced-binary-mismatch", expected=entry["traced_sha1"], actual=traced_sha1)
    points = [str(p) for p in entry.get("points", ())]
    missing = [p for p in required if p not in points]
    if missing:
        reasons = entry.get("unavailable") if isinstance(entry.get("unavailable"), dict) else {}
        why = sorted({str(reasons[p]) for p in missing if p in reasons})
        raise NativeUnavailable(f"{edge.mw_version} traced build lacks trace points: {', '.join(missing)}"
                                + (f" ({'; '.join(why)})" if why else ""),
                                available_points=points, unavailable_reasons=reasons)
    return NativeSetup(
        mw_version=edge.mw_version,
        version=version,
        stock={"path": str(stock_path), "sha1": stock_sha1, "sha256": sha256_file(stock_path), "label": edge.mw_version},
        traced={"path": str(traced_path), "sha1": traced_sha1},
        points=points,
        capabilities={"path": str(caps_path), "pin": caps.get("pin")},
    )


@dataclass
class VariantCompile:
    ok: bool
    stock_obj: Optional[Path] = None
    traced_obj: Optional[Path] = None
    trace: Optional[Path] = None
    unavailable: Optional[str] = None
    error: str = ""
    seconds: dict = field(default_factory=dict)

    @property
    def stock_sha256(self) -> Optional[str]:
        return sha256_file(self.stock_obj) if self.stock_obj and self.stock_obj.is_file() else None


def compile_variant(
    sc: Any, repo: Any, root: Path, unit: Any, setup: NativeSetup, function: str, workdir: Path,
    deadline: float, trace_cap: int = DEFAULT_TRACE_CAP, trace_function: bool = True,
) -> VariantCompile:
    """Stock and traced compile of one source tree; the traced object must equal stock.

    The traced run disables the MWCC object cache: a cache hit replays the
    object and stderr without running the compiler, so no trace would be written.
    """
    workdir.mkdir(parents=True, exist_ok=True)
    stock_obj, traced_obj, trace = workdir / "stock.o", workdir / "traced.o", workdir / "trace.jsonl"
    trace.unlink(missing_ok=True)

    def remaining() -> float:
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError("deadline reached before the compile started")
        return left

    seconds = {}
    try:
        started = time.monotonic()
        stock = sc.compile_in(repo, root, unit, stock_obj, timeout=remaining(), output_cap=STDOUT_CAP)
        seconds["stock"] = round(time.monotonic() - started, 3)
        if not stock.ok:
            return VariantCompile(False, unavailable="build-failed", error=stock.error, seconds=seconds)
        env = {"MWCC_TRACE_OUT": str(trace), "MWCC_CACHE_DISABLE": "1"}
        if trace_function:
            env["MWCC_TRACE_FUNC"] = function
        started = time.monotonic()
        traced = sc.compile_in(repo, root, unit, traced_obj, timeout=remaining(), compiler=Path(setup.traced["path"]),
                               env=env, output_cap=STDOUT_CAP, file_caps=[(trace, trace_cap)])
        seconds["traced"] = round(time.monotonic() - started, 3)
    except TimeoutError as error:
        return VariantCompile(False, unavailable="timeout", error=str(error), seconds=seconds)
    if not traced.ok:
        reason = "trace-too-large" if "exceeded" in traced.error else "traced-compile-failed"
        return VariantCompile(False, stock_obj=stock_obj, unavailable=reason, error=traced.error, seconds=seconds)
    if stock_obj.read_bytes() != traced_obj.read_bytes():
        return VariantCompile(False, stock_obj=stock_obj, traced_obj=traced_obj, trace=trace,
                              unavailable="traced-object-mismatch", seconds=seconds)
    if not trace.is_file():
        # A function without decisions (empty, asm, __sinit) gets no lines, and
        # the tracer may then not create the file at all.
        trace.touch()
    return VariantCompile(True, stock_obj, traced_obj, trace, seconds=seconds)


def object_functions(path: Path) -> list[str]:
    """Function symbols of a compiled object (for not-found hints)."""
    import stack_compare as sc_compare

    try:
        return [fn.name for fn in sc_compare.ElfObject.from_path(str(path)).functions]
    except Exception:  # noqa: BLE001 - a hint only
        return []
