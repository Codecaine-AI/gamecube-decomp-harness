#!/usr/bin/env python3
"""Event presence: for each trace point, the traced compiler writes the events the fixture predicts.

    event_presence.py --compiler <traced mwcceppc.exe> --version 1.2.5 [--stock <stock mwcceppc.exe>]
                      [--wibo <wibo>] [--out <dir>] [--json <report>]

The fixture (fixtures/trace_fixture.c) holds one construct per point, marked with `marker:<name>` comments; each check
names the event it expects and where. The fixture also compiles to the same object with tracing off and on (and to the
stock compiler's object when --stock is given). A point build.sh does not link from source fails here too, which is
how CAPABILITIES.json leaves it out.

The C++ fixture (fixtures/trace_fixture_overloads.cpp) checks naming: two overloads of one method and a same-named
method of another class each trace under their own mangled name in `fn` (plain name in `display`), selected by
`*`, by the plain name (all three) and by one mangled name (that one only).

Exit 1 if an object differs between tracing off, on and stock, or naming fails; point results are in the report.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

NATIVE = Path(__file__).resolve().parent.parent
FIXTURE = NATIVE / "fixtures" / "trace_fixture.c"
CPP_FIXTURE = NATIVE / "fixtures" / "trace_fixture_overloads.cpp"
CPP_FLAGS = ["-nodefaults", "-Cpp_exceptions", "off", "-RTTI", "off", "-proc", "gekko", "-fp", "hardware", "-O4,p",
             "-inline", "auto", "-lang=c++", "-c"]
OVERLOADS = {"step__7CounterFi", "step__7CounterFii", "step__5OtherFi"}
SCHEMA = "mwcc-native-event-presence-v1"
FLAGS = ["-nodefaults", "-Cpp_exceptions", "off", "-proc", "gekko", "-fp", "hardware", "-O4,p", "-inline", "auto",
         "-lang=c", "-c"]
POINTS = ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame", "scheduling"]
WIBO_CANDIDATES = [
    os.environ.get("MWCC_WIBO", ""),
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/melee/workspace/repository/build/tools/wibo",
    "/tmp/rmwcc/mwcc/build/tools/wibo",
]


def marker_lines(source: str) -> Dict[str, int]:
    """marker name -> 1-based line."""
    lines: Dict[str, int] = {}
    for number, line in enumerate(source.splitlines(), 1):
        for name in re.findall(r"marker:([\w-]+)", line):
            lines[name] = number
    return lines


def load_events(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def checks(markers: Dict[str, int]) -> Dict[str, Callable[[List[Dict[str, Any]]], Optional[str]]]:
    """point -> check returning None when the expected events are there, else what is missing."""

    def find(events: List[Dict[str, Any]], **fields: Any) -> List[Dict[str, Any]]:
        return [e for e in events if all(e.get(k) == v for k, v in fields.items())]

    def vreg_identity(events):
        hits = find(events, fn="fixture_main", ev="vreg", object="count", kind="local")
        if not hits:
            return "no vreg event for local `count` in fixture_main"
        if not any(str(h.get("decl_file")).endswith("/fixtures/" + FIXTURE.name)
                   and h.get("decl_line") == markers["decl-count"] for h in hits):
            return f"`count` lacks decl .../fixtures/{FIXTURE.name}:{markers['decl-count']}: {hits[0]}"
        # (exact declaration lines: the token the compiler declared each local with)
        for name, marker in (("copy", "decl-copy"), ("scaled", "decl-scaled")):
            found = find(events, fn="fixture_main", ev="vreg", object=name, kind="local")
            if not found or any(f.get("decl_line") != markers[marker] for f in found):
                return f"local `{name}` is not declared at line {markers[marker]}: {found[:1]}"
        args = find(events, fn="fixture_main", ev="vreg", object="pair", kind="arg")
        # (the compiler keeps no token for an argument: no line, only where the body opens)
        if args and not all(a.get("decl_file") is None and a.get("decl_line") is None
                            and a.get("decl_site") == "function_body" and a.get("body_line")
                            and str(a.get("body_file")).endswith("/fixtures/" + FIXTURE.name) for a in args):
            return f"argument `pair` has a declaration line or lacks its function body site: {args[0]}"
        if not args:
            return "no vreg event for argument `pair`"
        return None

    def interference(events):
        nodes = find(events, fn="fixture_main", ev="node")
        if not any(n.get("degree", 0) > 0 and n.get("neighbors") for n in nodes):
            return f"no node with neighbours in fixture_main ({len(nodes)} nodes)"
        return None

    def coloring(events):
        for ev in ("push", "color", "commit"):
            if not find(events, fn="fixture_main", ev=ev):
                return f"no {ev} event in fixture_main"
        if not any(re.fullmatch(r"[rf]\d+", str(e.get("reg"))) for e in find(events, fn="fixture_main", ev="commit")):
            return "no commit to a physical register"
        return None

    def coalescing(events):
        if not find(events, fn="fixture_forward", ev="coalesce", reason="copy"):
            return "no copy coalesce in fixture_forward"
        return None

    def inlining(events):
        site = f"/fixtures/{FIXTURE.name}:{markers['inline-helper']}"
        hits = find(events, fn="fixture_main", ev="inline", callee="fixture_helper", verdict="inlined")
        if not any(str(h.get("site")).endswith(site) and h.get("site_line") == markers["inline-helper"] for h in hits):
            return f"no inlined verdict for fixture_helper at ...{site}"
        if not find(events, fn="fixture_main", ev="inline", callee="fixture_extern", verdict="called"):
            return "no called verdict for fixture_extern"
        return None

    def cse(events):
        hits = find(events, fn="fixture_main", ev="cse")
        if not any("pair" in str(h.get("expr")) and str(h.get("temp", "")).startswith("@") for h in hits):
            return f"no common subexpression of `pair` ({len(hits)} cse events)"
        temps = {h["temp"] for h in hits}
        origins = [e for e in find(events, fn="fixture_main", ev="vreg") if e.get("object") in temps]
        if origins and not all(str(o.get("origin", "")).startswith("cse") for o in origins):
            return f"cse temporaries without a cse origin: {origins[:1]}"
        return None

    def frame(events):
        slots = find(events, fn="fixture_main", ev="frame_slot", owner="buf")
        if not slots:
            return "no frame slot owned by `buf`"
        if not (slots[0].get("size") == 16 and slots[0].get("reserved") is True):
            return f"unexpected slot for `buf`: {slots[0]}"
        return None

    def scheduling(events):
        return None if find(events, ev="schedule") else "no scheduling events (milestone 2)"

    return {"vreg_identity": vreg_identity, "interference": interference, "coloring": coloring,
            "coalescing": coalescing, "inlining": inlining, "cse": cse, "frame": frame, "scheduling": scheduling}


def compile_fixture(wibo: Path, compiler: Path, out: Path, env: Dict[str, str], source: Path = FIXTURE,
                    flags: List[str] = FLAGS) -> bytes:
    out.mkdir(parents=True, exist_ok=True)
    result = subprocess.run([str(wibo), str(compiler), *flags, source.name, "-o", str(out) + "/"],
                            cwd=source.parent, env={**os.environ, **env}, capture_output=True, text=True, timeout=120)
    obj = out / (source.stem + ".o")
    if result.returncode != 0 or not obj.exists():
        raise RuntimeError(f"{compiler}: exit {result.returncode}: {(result.stdout + result.stderr).strip()[:400]}")
    return obj.read_bytes()


def check_naming(wibo: Path, compiler: Path, out: Path, stock: Optional[Path]) -> Dict[str, Any]:
    """The C++ fixture traced by `*`, by plain name and by one mangled name."""
    problems: List[str] = []
    cpp_markers = marker_lines(CPP_FIXTURE.read_text())
    objects = {"off": compile_fixture(wibo, compiler, out / "cpp-off", {"MWCC_TRACE_OUT": ""}, CPP_FIXTURE, CPP_FLAGS)}
    if stock is not None:
        objects["stock"] = compile_fixture(wibo, stock, out / "cpp-stock", {}, CPP_FIXTURE, CPP_FLAGS)
    deferred = "fixture_deferred__FP6Box<i>i"
    for selector, expected in (("*", OVERLOADS | {deferred}), ("step", OVERLOADS),
                               ("step__7CounterFi", {"step__7CounterFi"}), ("fixture_deferred", {deferred})):
        trace = out / f"cpp-{len(objects)}.jsonl"
        trace.unlink(missing_ok=True)
        objects[selector] = compile_fixture(
            wibo, compiler, out / f"cpp-{len(objects)}",
            {"MWCC_TRACE_OUT": str(trace), "MWCC_TRACE_FUNC": selector, "MWCC_CACHE_DISABLE": "1"},
            CPP_FIXTURE, CPP_FLAGS)
        events = load_events(trace)
        names = {e.get("fn") for e in events}
        # (`*` may also trace inline bodies; every name it traces is a mangled one)
        if (names != expected if selector != "*" else not expected <= names or
                any("__" not in str(n) for n in names)):
            problems.append(f"{selector!r} traced {sorted(map(str, names))}, expected {sorted(expected)}")
        displays = {e.get("fn"): e.get("display") for e in events}
        if any(displays.get(n) != n.split("__")[0] for n in expected if n in displays):
            problems.append(f"{selector!r}: display is not the plain name: {displays}")
        sums = [e for e in events if e.get("fn") == deferred and e.get("ev") == "vreg" and e.get("object") == "sum"]
        if deferred in expected and (not sums or any(e.get("decl_line") != cpp_markers["decl-sum"] for e in sums)):
            problems.append(f"{selector!r}: `sum`, rebuilt from the saved body, is not declared at line "
                            f"{cpp_markers['decl-sum']}: {[e.get('decl_line') for e in sums]}")
        for name in expected:
            evs = {e["ev"] for e in events if e.get("fn") == name}
            if not {"function", "vreg", "commit"} <= evs:
                problems.append(f"{selector!r}: {name} lacks events ({sorted(evs)})")
        locals_ = [e for e in events if e.get("ev") == "vreg" and e.get("object") == "total"]
        if any(not str(e.get("decl_file", "")).endswith("fixtures/" + CPP_FIXTURE.name) for e in locals_):
            problems.append(f"{selector!r}: `total` lacks the fixture's path in decl_file")
        for name, marker in (("step__7CounterFi", "decl-total"), ("step__7CounterFii", "decl-total2")):
            lines = {e.get("decl_line") for e in locals_ if e.get("fn") == name}
            if name in expected and lines != {cpp_markers[marker]}:
                problems.append(f"{selector!r}: `total` in {name} declared at {sorted(map(str, lines))}, "
                                f"not {cpp_markers[marker]}")
    if len({value for value in objects.values()}) != 1:
        problems.append("the C++ fixture's object differs between stock, tracing off and tracing on")
    return {"ok": not problems, **({"missing": "; ".join(problems)} if problems else {})}


def run(compiler: Path, version: str, wibo: Path, out: Path, stock: Optional[Path]) -> Dict[str, Any]:
    trace = out / "trace.jsonl"
    trace.unlink(missing_ok=True)
    report: Dict[str, Any] = {"schema": SCHEMA, "version": version, "compiler": str(compiler),
                              "compiler_sha1": hashlib.sha1(compiler.read_bytes()).hexdigest(), "points": {},
                              "identity": {}}
    off = compile_fixture(wibo, compiler, out / "off", {"MWCC_TRACE_OUT": ""})
    on = compile_fixture(wibo, compiler, out / "on",
                         {"MWCC_TRACE_OUT": str(trace), "MWCC_TRACE_FUNC": "*", "MWCC_CACHE_DISABLE": "1"})
    report["identity"]["off_equals_on"] = off == on
    if stock is not None:
        report["identity"]["stock_equals_off"] = compile_fixture(wibo, stock, out / "stock", {}) == off
    events = load_events(trace)
    report["events"] = len(events)
    for point, check in checks(marker_lines(FIXTURE.read_text())).items():
        problem = check(events)
        report["points"][point] = {"ok": problem is None, **({"missing": problem} if problem else {})}
    report["ok_points"] = [p for p in POINTS if report["points"][p]["ok"]]
    report["naming"] = check_naming(wibo, compiler, out, stock)
    return report


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--compiler", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--stock", type=Path)
    parser.add_argument("--wibo")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--json", type=Path)
    args = parser.parse_args(argv)
    wibo = next((Path(c) for c in [args.wibo or "", *WIBO_CANDIDATES] if c and Path(c).exists()), None)
    if wibo is None:
        print("event_presence: no wibo (pass --wibo or set MWCC_WIBO)", file=sys.stderr)
        return 2
    out = args.out or Path(tempfile.mkdtemp(prefix=f"mwcc-presence-{args.version}-"))
    try:
        report = run(args.compiler.resolve(), args.version, wibo, out, args.stock.resolve() if args.stock else None)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"event_presence {args.version}: {error}", file=sys.stderr)
        return 1
    finally:
        if args.out is None:
            shutil.rmtree(out, ignore_errors=True)
    text = json.dumps(report, indent=2) + "\n"
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(text)
    for point in POINTS:
        state = report["points"][point]
        print(f"{args.version:7} {point:14} {'ok' if state['ok'] else 'MISSING: ' + state['missing']}")
    identity_ok = all(report["identity"].values())
    print(f"{args.version:7} identity       {report['identity']}")
    naming = report["naming"]
    print(f"{args.version:7} naming         {'ok' if naming['ok'] else 'FAILED: ' + naming['missing']}")
    return 0 if identity_ok and naming["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
