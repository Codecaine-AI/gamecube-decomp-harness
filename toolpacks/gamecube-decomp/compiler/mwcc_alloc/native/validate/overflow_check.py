#!/usr/bin/env python3
"""Overflow records: a trace that runs out of room says so.

    overflow_check.py --small <test-build mwcceppc.exe> --normal <traced mwcceppc.exe> --version <ver>
                      [--wibo <wibo>] [--json <report>]

The test build (configure.py --traced --trace-small-limits, which build.sh makes) has tiny trace tables. Traced with
every function on, the C and C++ fixtures must make it write an overflow record ({"ev":"overflow","what":...}) for
every table, and still compile the same objects as the traced build with tracing off; a local's declaration line is
then null or exact, never another line. The traced build itself must write no overflow record for the fixtures.
Exit 1 when any of that fails.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import event_presence  # noqa: E402

SCHEMA = "mwcc-native-overflow-check-v1"
KINDS = ["line", "origins", "frame_slots", "deferred_events", "function_files", "saved_locals", "rebuilt_locals"]


def traced_events(wibo: Path, compiler: Path, out: Path, name: str) -> Dict[str, Any]:
    """Objects and events of both fixtures with every function traced."""
    result: Dict[str, Any] = {"objects": {}, "events": []}
    for source, flags in ((event_presence.FIXTURE, event_presence.FLAGS),
                          (event_presence.CPP_FIXTURE, event_presence.CPP_FLAGS)):
        trace = out / f"{name}-{source.stem}.jsonl"
        trace.unlink(missing_ok=True)
        result["objects"][source.name] = event_presence.compile_fixture(
            wibo, compiler, out / f"{name}-{source.stem}",
            {"MWCC_TRACE_OUT": str(trace), "MWCC_TRACE_FUNC": "*", "MWCC_CACHE_DISABLE": "1"}, source, flags)
        result["events"] += event_presence.load_events(trace)
    return result


def check(small: Path, normal: Path, version: str, wibo: Path, out: Path) -> Dict[str, Any]:
    problems: List[str] = []
    plain = {source.name: event_presence.compile_fixture(wibo, normal, out / f"off-{source.stem}",
                                                         {"MWCC_TRACE_OUT": ""}, source, flags)
             for source, flags in ((event_presence.FIXTURE, event_presence.FLAGS),
                                   (event_presence.CPP_FIXTURE, event_presence.CPP_FLAGS))}
    tiny = traced_events(wibo, small, out, "small")
    full = traced_events(wibo, normal, out, "normal")
    seen = sorted({e.get("what") for e in tiny["events"] if e.get("ev") == "overflow"})
    missing = [kind for kind in KINDS if kind not in seen]
    if missing:
        problems.append(f"the test build wrote no overflow record for {', '.join(missing)}")
    for source, data in plain.items():
        if tiny["objects"][source] != data or full["objects"][source] != data:
            problems.append(f"{source} compiles differently with tracing on")
    extra = [e for e in full["events"] if e.get("ev") == "overflow"]
    if extra:
        problems.append(f"the traced build overflowed on the fixtures: {extra[:2]}")
    markers = {**event_presence.marker_lines(event_presence.FIXTURE.read_text()),
               **event_presence.marker_lines(event_presence.CPP_FIXTURE.read_text())}
    expected = {"count": markers["decl-count"], "copy": markers["decl-copy"], "scaled": markers["decl-scaled"],
                "sum": markers["decl-sum"], "twice": markers["decl-twice"]}
    for event in tiny["events"]:
        name = event.get("object")
        if event.get("ev") == "vreg" and name in expected and event.get("decl_line") not in (None, expected[name]):
            problems.append(f"`{name}` declared at {event.get('decl_line')} in the test build, not "
                            f"{expected[name]} or null")
    return {"schema": SCHEMA, "version": version, "small": str(small), "normal": str(normal),
            "overflow_kinds": seen, "ok": not problems, **({"problems": problems} if problems else {})}


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--small", required=True, type=Path)
    parser.add_argument("--normal", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--wibo")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args(argv)
    wibo = next((Path(c) for c in [args.wibo or "", *event_presence.WIBO_CANDIDATES] if c and Path(c).exists()), None)
    if wibo is None:
        print("overflow_check: no wibo (pass --wibo or set MWCC_WIBO)", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="mwcc-overflow-") as out:
        report = check(args.small.resolve(), args.normal.resolve(), args.version, wibo, Path(out))
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2) + "\n")
    print(f"{args.version:7} overflow       {'ok' if report['ok'] else 'FAILED: ' + '; '.join(report['problems'])}"
          f" ({', '.join(report['overflow_kinds'])})")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
