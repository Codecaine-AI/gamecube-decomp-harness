#!/usr/bin/env python3
"""Capture MWCC register-allocator state for one function.

Backends (`--backend auto|native|qemu`, default auto, chosen per capture):

- qemu: the stock compiler under qemu-i386 + gdb (`pcode`, `coloring`, `pair`,
  `trace`; PCode stages need it in milestone 1). Linux sandbox only.
- native: the traced compiler (`coloring-native`, `decisions`). Seconds, any
  host with the MWCC runner, function selected by name. The traced object
  must equal a stock compile of the same source.

Every result names the backend that produced it.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from native_backend import NATIVE_CAPTURES, QEMU_CAPTURES, choose_backend  # noqa: E402

SANDBOX_REQUIRED_GUIDANCE = (
    "mwcc_alloc_snapshot captures run inside the Linux sandbox; attach a "
    "sandbox-backed worker claim or run in the sandbox image."
)
FUNCTION_PATTERN = re.compile(r"^[A-Za-z_~][A-Za-z0-9_$@<>,.~-]{0,511}$")


def print_json(payload: dict) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo-root", help="Target project checkout root.")
    parser.add_argument("--unit", required=True, help="Translation unit relative to the project root.")
    parser.add_argument("--function", required=True, help="Function symbol to capture (mangled or plain name).")
    parser.add_argument(
        "--capture",
        choices=(*QEMU_CAPTURES, *NATIVE_CAPTURES),
        default="pair",
        help="Allocator state to capture.",
    )
    parser.add_argument("--backend", choices=("auto", "native", "qemu"), default="auto")
    parser.add_argument("--trace-detail", choices=("stages", "full"), default="stages")
    parser.add_argument("--out", "--out-dir", dest="out", help="Workspace-relative output directory.")
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=900,
        help="Maximum runtime for the build and capture.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON output.")
    return parser


def qemu_command(args: argparse.Namespace) -> list[str]:
    """The legacy capture-script invocation (unchanged for pcode/coloring/pair/trace)."""
    capture_script = API_DIR.parent / "sandbox" / "mwcc_alloc_capture.py"
    command = [
        sys.executable,
        str(capture_script),
        "--unit",
        args.unit,
        "--function",
        args.function,
        "--capture",
        args.capture,
        "--trace-detail",
        args.trace_detail,
        "--timeout-seconds",
        str(args.timeout_seconds),
        "--json",
    ]
    if args.repo_root:
        command.extend(("--repo-root", args.repo_root))
    if args.out:
        command.extend(("--out-dir", args.out))
    return command


def run_qemu(args: argparse.Namespace) -> None:
    gdb_path = shutil.which("gdb-multiarch")
    qemu_path = shutil.which("qemu-i386")
    if sys.platform != "linux" or not gdb_path or not qemu_path:
        print_json({"status": "sandbox_required", "backend": "qemu", "guidance": SANDBOX_REQUIRED_GUIDANCE})
        return
    result = subprocess.run(qemu_command(args), capture_output=True, text=True, errors="replace")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    if isinstance(payload, dict):
        payload.setdefault("backend", "qemu")
    print(json.dumps(payload, sort_keys=True))
    raise SystemExit(result.returncode)


def out_directory(repo_root: Path, raw: str | None, function: str) -> Path:
    if raw is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        raw = str(PurePosixPath("build") / "mwcc-alloc" / "native" / f"{function}-{stamp}")
    path = PurePosixPath(raw)
    if path.is_absolute() or ".." in path.parts or "\\" in raw:
        raise ValueError("--out must stay within the workspace root")
    out = (repo_root / raw).resolve()
    if not out.is_relative_to(repo_root):
        raise ValueError("--out must stay within the workspace root")
    if out.exists() and any(out.iterdir()):
        raise ValueError("--out must be a new or empty directory")
    return out


def run_native(args: argparse.Namespace) -> dict:
    """Traced compile of the working tree, then coloring snapshots and/or decisions."""
    import native_backend as nb

    nb.tools_dir()
    started = time.monotonic()
    deadline = started + max(10, min(1800, args.timeout_seconds))
    repo_root = Path(args.repo_root or os.getcwd()).resolve()
    os.environ["ORCH_GAME_REPO_ROOT"] = str(repo_root)
    import stack_check as sc  # noqa: E402

    from decisions import build_decisions  # noqa: E402
    from native_trace import NotTraced, TraceError, load_trace, object_has_function, replay_check, snapshot_name  # noqa: E402

    base = {"backend": "native", "capture": args.capture, "unit": args.unit, "requested_function": args.function}
    try:
        out = out_directory(repo_root, args.out, args.function)
        repo = sc.Repo(repo_root)
        unit = repo.unit(args.unit)
    except (ValueError, SystemExit) as error:
        return {**base, "status": "invalid_arguments", "error": str(error)}
    try:
        setup = nb.native_setup(repo, unit, nb.CAPTURE_POINTS[args.capture])
    except nb.NativeUnavailable as error:
        return {**base, "status": "unavailable", "unavailable": error.reason, **error.details}

    with tempfile.TemporaryDirectory(prefix="mwcc-native-") as temporary:
        work = Path(temporary)
        compiled = nb.compile_variant(sc, repo, repo.root, unit, setup, args.function, work, deadline)
        base.update({"version": setup.version, "provenance": setup.provenance(), "compile_seconds": compiled.seconds})
        if not compiled.ok:
            failure = {**base, "status": "unavailable" if compiled.unavailable != "build-failed" else "unit_build_failed",
                       "unavailable": compiled.unavailable, "error": compiled.error[-4000:]}
            if compiled.unavailable == "traced-object-mismatch":
                out.mkdir(parents=True, exist_ok=True)
                for path in (compiled.stock_obj, compiled.traced_obj):
                    shutil.copy2(path, out / path.name)
                failure["out_dir"] = str(out.relative_to(repo_root))
            return failure
        try:
            trace = load_trace(compiled.trace)
            if trace.overflow_reason():
                return {**base, "status": "unavailable", "unavailable": trace.overflow_reason()}
            fn = trace.select(args.function)
        except TraceError as error:
            return {**base, "status": "trace_invalid", "error": str(error)}
        except LookupError as error:
            functions = nb.object_functions(compiled.stock_obj)
            if isinstance(error, NotTraced) and object_has_function(functions, args.function):
                return {**base, "status": "no_decisions_traced", "summary": nb.NO_DECISIONS,
                        "traced_object_matches_stock": True}
            return {**base, "status": "function_not_found", "error": str(error), "unit_functions": functions[:50]}

        def normalize(path: str) -> str:
            return relative_source(path, repo_root)

        doc, captures = build_decisions(fn, unit=unit.source, version=setup.version, stock=setup.stock,
                                        available_points=setup.points, normalize=normalize)
        out.mkdir(parents=True, exist_ok=True)
        shutil.copy2(compiled.trace, out / "trace.jsonl")
        shutil.copy2(compiled.stock_obj, out / "capture.o")
        files = [{"path": str((out / "trace.jsonl").relative_to(repo_root)), "kind": "trace"},
                 {"path": str((out / "capture.o").relative_to(repo_root)), "kind": "compiled_object"}]
        (out / "decisions.json").write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        files.append({"path": str((out / "decisions.json").relative_to(repo_root)), "kind": "decisions"})
        replay = []
        if args.capture == "coloring-native":
            for capture in captures:
                for phase, snapshot in (("before", capture.before), ("after", capture.after)):
                    snapshot["provenance"] = setup.provenance()
                    path = out / snapshot_name(capture.cls, capture.attempt, phase)
                    path.write_text(json.dumps(snapshot, indent=1) + "\n", encoding="utf-8")
                    files.append({"path": str(path.relative_to(repo_root)), "kind": f"coloring_{phase}",
                                  "cls": capture.cls, "attempt": capture.attempt, "trace_pass": capture.pass_index,
                                  "nodes": len(snapshot["nodes"]), "synthesized_nodes": len(capture.synthesized)})
                replay.append(replay_check(capture))
        coloring = {cls: [{"pass": p["pass"], "nodes": len(p["nodes"]),
                           "spilled": sum(1 for n in p["nodes"] if n["spilled"]),
                           "available_colors": p["available_colors"]} for p in passes]
                    for cls, passes in doc["coloring"].items()}
        return {
            **base,
            "status": "ok",
            "format": "mwcc-alloc-native-capture-v1",
            "function": fn.fn,
            "display": fn.display,
            "traced_object_matches_stock": True,
            "available_points": doc["available_points"],
            "unavailable_points": doc["unavailable_points"],
            "out_dir": str(out.relative_to(repo_root)),
            "files": files,
            "replay": replay,
            "decisions_summary": {"vregs": len(doc["vregs"]), "inlines": len(doc["inlines"]), "cse": len(doc["cse"]),
                                  "frame_slots": len(doc["frame_slots"]), "coloring": coloring},
            "duration_seconds": round(time.monotonic() - started, 3),
        }


def relative_source(path: str, *roots: Path) -> str:
    """Trace source paths as repo-relative POSIX paths (shadow roots stripped)."""
    text = path.replace("\\", "/")
    if len(text) > 2 and text[1] == ":":  # wine/wibo drive letter
        text = text[2:]
    for root in roots:
        prefix = str(root).rstrip("/") + "/"
        if text.startswith(prefix):
            return text[len(prefix):]
        real = str(Path(root).resolve()).rstrip("/") + "/"
        if text.startswith(real):
            return text[len(real):]
    return text


def main() -> None:
    args = build_parser().parse_args()
    backend, reason = choose_backend(args.capture, args.backend)
    if backend is None:
        print_json({"status": "backend_unsupported", "backend": args.backend, "capture": args.capture, "reason": reason})
        return
    if backend == "qemu":
        run_qemu(args)
        return
    if not FUNCTION_PATTERN.fullmatch(args.function):
        print_json({"status": "invalid_arguments", "backend": "native", "error": "--function must be a symbol name"})
        return
    try:
        print_json(run_native(args))
    except Exception as error:  # noqa: BLE001 - one JSON object, always
        print_json({"status": "internal_error", "backend": "native", "error": f"{type(error).__name__}: {error}"})
        raise SystemExit(1)


if __name__ == "__main__":
    main()
