#!/usr/bin/env python3
"""Write CAPABILITIES.json (mwcc-native-capabilities-v1): per version, the trace points the traced compiler has.

    capabilities.py --pin PIN.json --mwcc <traced checkout> --binaries <dir> --validation <dir>
                    [--byte-identity [<game>=]<report>...] [--requirements <file>] --out <file>

A point is a candidate when every source its hooks live in was linked from source into that version's executable
(build/<VER>/traced-ok, which tools/link_traced.py writes from the upstream configs' Matching sources); a candidate
whose events the fixture did not show (validate/event_presence.py, <validation>/presence-<ver>.json) fails the build:
the patches claim something the compiler does not do.

Candidates become points only with evidence bound to the exact binary (<binaries>/<ver>/mwcceppc.exe), judged by the
sandbox image's gate (_impl/gamecube/sandbox-image/gate_traced_capabilities.py, the one rule for both): its presence
report names that SHA-1, every game that requires the version has a full byte-identity sweep naming it, and every
sweep naming it passes (stock failures only where the game excludes them). Requirements come from --requirements
({"games": {<game>: {"required": [...], "stock_exclusions": {...}}}}, as the image bundle writes it), else from the
repo's games/*/config/worker-image.json "traced_compilers". --byte-identity reports are filed as the gate reads them,
<validation>/byte-identity/<game>/<one-function|all-functions>.json (the game from <game>= or the report's checkout
path), replacing earlier ones. Without evidence a version has no points ("no byte-identity evidence", ...). 1.1p1 has
none whatever the evidence: it miscompiles MetroTRK msgbuf.c (VALIDATION.md). Every left-out point gets its reason
under "unavailable", and a version without points says why under "disabled".
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import inspect
import json
import os
import shutil
import sys
from pathlib import Path
from types import ModuleType
from typing import Any, Dict, List, Optional

TOOLS = Path(__file__).resolve().parent
# (where the gate lives: next to native/ in the image build, under the toolpack's sandbox-image in the repo)
GATE_CANDIDATES = [
    os.environ.get("MWCC_CAPABILITY_GATE", ""),
    str(TOOLS.parents[1] / "gate_traced_capabilities.py"),
    str(TOOLS.parents[3] / "_impl" / "gamecube" / "sandbox-image" / "gate_traced_capabilities.py"),
]
DISABLED = {"1.1p1": "miscompiles MetroTRK msgbuf.c (byte identity fails, VALIDATION.md)"}
REPO_GAMES = TOOLS.parents[4].parent / "games" if len(TOOLS.parents) > 5 else None

SCHEMA = "mwcc-native-capabilities-v1"
VERSIONS = {"1.1p1": "GC_1_1p1", "1.2.5": "GC_1_2_5", "1.2.5n": "GC_1_2_5n"}
# (the trace module and the inliner's function selection serve every point)
COMMON = ["src/trace/MwccTrace.c", "src/frontend/CInline.c"]
POINT_SOURCES: Dict[str, List[str]] = {
    "vreg_identity": ["src/backend/Coloring.c"],
    "interference": ["src/backend/Coloring.c", "src/backend/InterferenceGraph.c"],
    "coloring": ["src/backend/Coloring.c"],
    "coalescing": ["src/backend/InterferenceGraph.c"],
    "inlining": [],
    "cse": ["src/optimizer/IroCSE.c"],
    "frame": ["src/backend/CodeGen.c", "src/backend/InterferenceGraph.c"],
    "scheduling": ["src/backend/Scheduler.c"],
}
# (points whose hooks exist; scheduling is milestone 2)
IMPLEMENTED = ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame"]


def load_gate() -> Optional[ModuleType]:
    for candidate in GATE_CANDIDATES:
        if candidate and Path(candidate).is_file():
            spec = importlib.util.spec_from_file_location("gate_traced_capabilities", candidate)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    return None


def candidate_entry(version: str, traced_ok: Dict[str, Any], presence: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The points the build links from source and the fixture shows (not yet backed by evidence)."""
    linked = set(traced_ok["linked_from_source"])
    points: List[str] = []
    unavailable: Dict[str, str] = {}
    for point, sources in POINT_SOURCES.items():
        missing = [s for s in COMMON + sources if s not in linked]
        if point not in IMPLEMENTED:
            unavailable[point] = "not traced yet (milestone 2)"
        elif missing:
            unavailable[point] = "not linked from source in this version: " + ", ".join(missing)
        elif presence is None:
            unavailable[point] = "no event-presence evidence"
        elif not presence["points"].get(point, {}).get("ok"):
            raise SystemExit(f"{version}: {point} links from source but its events are missing: "
                             f"{presence['points'].get(point, {}).get('missing')}")
        else:
            points.append(point)
    if presence is not None and not all(presence.get("identity", {}).values()):
        raise SystemExit(f"{version}: the fixture compiles differently with tracing on or off: {presence['identity']}")
    return {
        "stock_sha1": traced_ok["original_sha1"],
        "traced_sha1": traced_ok["sha1"],
        "points": points,
        "unavailable": unavailable,
        "event_presence": "passed" if presence is not None else "not_run",
    }


def load_requirements(path: Optional[Path]) -> Dict[str, Any]:
    """{game: {"required": [...], "stock_exclusions": {...}}}."""
    if path is not None:
        return json.loads(path.read_text()).get("games") or {}
    games: Dict[str, Any] = {}
    if REPO_GAMES is not None and REPO_GAMES.is_dir():
        for config in sorted(REPO_GAMES.glob("*/config/worker-image.json")):
            traced = json.loads(config.read_text()).get("traced_compilers")
            if traced:
                games[config.parent.parent.name] = traced
    return games


def gate_entry(version: str, entry: Dict[str, Any], exe: Path, validation: Path,
               gate: Optional[ModuleType], games: Dict[str, Any]) -> Dict[str, Any]:
    """ENTRY with its points kept only when the evidence for EXE passes the gate."""
    digest = hashlib.sha1(exe.read_bytes()).hexdigest() if exe.is_file() else None
    reports = gate.byte_identity_reports(validation) if gate is not None else []
    sweeps = []
    for game, name, report in reports:
        totals = (report.get("totals") or {}).get(version) or {}
        if digest is not None and (report.get("traced_sha1") or {}).get(version) == digest and totals.get("units"):
            sweeps.append({"game": game, "file": name, "selection": report.get("selection"),
                           "trace_all": report.get("trace_all", False),
                           **{k: totals.get(k) for k in ("units", "identical_off", "identical_on", "mismatched",
                                                          "traced_failed", "stock_failed")}})
    if version in DISABLED:
        reason = DISABLED[version]
    elif gate is None:
        reason = "no evidence gate (gate_traced_capabilities.py not found)"
    elif "games" in inspect.signature(gate.reason_to_disable).parameters:
        reason = gate.reason_to_disable(version, entry, exe, validation, reports, games)
    else:
        reason = gate.reason_to_disable(version, entry, exe, validation, reports)
    failed = sum(int(s["mismatched"] or 0) + int(s["traced_failed"] or 0) for s in sweeps)
    entry["byte_identity"] = {"status": "no evidence" if not sweeps else "failed" if failed else "passed",
                              "sweeps": sweeps}
    if reason is not None:
        for point in entry["points"]:
            entry["unavailable"][point] = reason
        entry["points"] = []
        entry["disabled"] = reason
    return entry


def report_game(spec: str) -> tuple[str, Path]:
    """(game, path) of a --byte-identity argument: GAME=PATH, or PATH with the game in its checkout path."""
    if "=" in spec:
        game, path = spec.split("=", 1)
        return game, Path(path)
    path = Path(spec)
    parts = Path(str(json.loads(path.read_text()).get("checkout", ""))).parts
    game = parts[parts.index("games") + 1] if "games" in parts[:-1] else "unknown"
    return game, path


def copy_reports(specs: List[str], validation: Path) -> None:
    """File SPECS' reports under VALIDATION/byte-identity/<game>/, replacing earlier evidence."""
    root = validation / "byte-identity"
    shutil.rmtree(root, ignore_errors=True)
    for spec in specs:
        game, path = report_game(spec)
        kind = "all-functions" if json.loads(path.read_text()).get("trace_all") else "one-function"
        target = root / game / f"{kind}.json"
        index = 1
        while target.exists():
            index += 1
            target = root / game / f"{kind}-{index}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--pin", required=True, type=Path)
    parser.add_argument("--mwcc", required=True, type=Path, help="the traced checkout (build/<VER>/traced-ok)")
    parser.add_argument("--binaries", required=True, type=Path, help="<ver>/mwcceppc.exe, the binaries judged")
    parser.add_argument("--validation", required=True, type=Path,
                        help="presence-<ver>.json and byte-identity-*.json (the gate's evidence)")
    parser.add_argument("--byte-identity", action="append", default=[],
                        help="[GAME=]REPORT: validate/byte_identity.py reports to file into --validation (replacing "
                             "earlier ones)")
    parser.add_argument("--requirements", type=Path,
                        help="the image bundle's requirements.json (default: games/*/config/worker-image.json)")
    parser.add_argument("--versions", default=",".join(VERSIONS))
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    pin = json.loads(args.pin.read_text())
    if args.byte_identity:
        copy_reports(args.byte_identity, args.validation)
    gate = load_gate()
    games = load_requirements(args.requirements)
    versions: Dict[str, Any] = {}
    for version in [v for v in args.versions.split(",") if v]:
        traced_ok = json.loads((args.mwcc / "build" / VERSIONS[version] / "traced-ok").read_text())
        presence_path = args.validation / f"presence-{version}.json"
        presence = json.loads(presence_path.read_text()) if presence_path.exists() else None
        entry = candidate_entry(version, traced_ok, presence)
        versions[version] = gate_entry(version, entry, args.binaries / version / "mwcceppc.exe", args.validation, gate,
                                       games)
    capabilities = {"schema": SCHEMA, "pin": pin["commit"], "versions": versions}
    args.out.write_text(json.dumps(capabilities, indent=2) + "\n")
    for version, entry in versions.items():
        print(f"{version:7} points: {', '.join(entry['points']) or '- (' + entry.get('disabled', '') + ')'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
