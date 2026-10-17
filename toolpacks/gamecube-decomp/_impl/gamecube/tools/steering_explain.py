#!/usr/bin/env python3
"""The steering-explain job's tool: what did the probe edits change inside MWCC?

For one function a steering gate run did not pass, rebuild exactly the
candidate and the S* (probe edits reverted) its verdict used, prove the rebuild
is the gate's, and diff MWCC's decisions between the two with the traced
compiler (plan 3.4.1, D2: a separate job after the gate, never on the worker's
validation path).

  prepare (--check CHECK.json | --edits E.json --mwcc M.json --decision D.json)
          --unit U --function F --observation-id ID [--probe PROBE.json]
          [--variant global|evidence_sstar|steering_sstar] [--label gate|ablation]
          [--expect-fidelity-hash H] --out IN.json
      Host side, JSON only (no compiler, no git): the compact sandbox input
      `steering-explain-input-v1` (the function's fidelity record, its unit's
      compile command, the edited files the two builds read, the revert set).
      Prints {status: ok, input_hash, out} or {status: unavailable,
      compiler_delta: {unavailable}}: no fidelity record, an incomplete one,
      or an S* that is the candidate object.

  run --input IN.json [--timeout-seconds N] [--json]
      In a build sandbox at the checkout: verifies the compile command, the
      stock compiler, wrappers and every dependency hash the gate recorded
      (the materialized base + overlay must reproduce each input byte for
      byte), then runs mwcc_alloc compare_sources (stock and traced compiles;
      traced must equal stock) and requires both stock objects to equal the
      gate's. Any mismatch publishes `{unavailable: "reconstruction: ..."}`,
      never a delta. Prints `steering-explain-result-v1`:
      {status: ok|unavailable|error, observation_id, input_hash,
       compiler_delta, probe, retryable, error?}.

A unit whose compiler version has no validated traced build gets
`{unavailable: "<reason>"}` from CAPABILITIES.json. A function the traced
compiler recorded no decision for is "no decisions traced", never an empty
delta.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
TOOLPACK = TOOLS.parents[2]
COMPARE_API = TOOLPACK / "compiler" / "mwcc_alloc" / "api"

INPUT_SCHEMA = "steering-explain-input-v1"
RESULT_SCHEMA = "steering-explain-result-v1"
VARIANT_BUILDS = {"global": "sstar", "evidence_sstar": "sstar_evidence", "steering_sstar": "sstar_steering"}
SOURCE_DIRS = ("src", "include", "libs")
MANIFEST_SUFFIXES = (".c", ".cpp", ".cp", ".cxx", ".h", ".hpp", ".hh", ".inc", ".inl")
DEFAULT_TIMEOUT = 900
NINJA_TIMEOUT = 600
REASON_LIMIT = 400


def sha256_bytes(data: Optional[bytes]) -> Optional[str]:
    return None if data is None else hashlib.sha256(data).hexdigest()


def sha256_json(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def unavailable(reason: str) -> dict:
    return {"unavailable": reason[:REASON_LIMIT]}


def _load(path: Optional[str]) -> Optional[dict]:
    if not path:
        return None
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else None


# --------------------------------------------------------------------------
# prepare (host)
# --------------------------------------------------------------------------


def _function_row(decision: dict, unit: str, function: str) -> Optional[dict]:
    rows = [r for r in decision.get("functions") or [] if isinstance(r, dict) and r.get("unit") == unit]
    return next((r for r in rows if r.get("name") == function), None) or next(
        (r for r in rows if r.get("demangled") == function), None)


def _build_problem(name: str, build: Optional[dict]) -> Optional[str]:
    if not build:
        return f"the gate recorded no {name} build"
    if not build.get("obj_sha256"):
        return f"{name}: no object hash"
    if build.get("depfile") != "ok" or not build.get("deps"):
        return f"{name}: no dependency record ({build.get('depfile') or 'missing'})"
    return None


CHANGED = "reconstruction: the gate artifacts changed since the observation was recorded"


def _record_problem(fidelity: dict, builds: dict, expect: Optional[str]) -> Optional[str]:
    """Do the artifacts still say what the queued fidelity record says? (The job names files on
    disk; a later gate run may have replaced them.)"""
    body = {k: v for k, v in fidelity.items() if k != "input_hash"}
    import steering_check as sc

    if fidelity.get("input_hash") != sc.sha256_json(body):
        return f"{CHANGED}: the decision's fidelity record does not hash to its input_hash"
    if expect is not None and fidelity.get("input_hash") != expect:
        return f"{CHANGED} (fidelity {str(fidelity.get('input_hash'))[:12]}, queued {expect[:12]})"
    for side in ("candidate", "sstar"):
        ref = fidelity.get(side) or {}
        build = builds.get(ref.get("build") or "") or {}
        if ref.get("obj_sha256") != build.get("obj_sha256") or ref.get("deps_sha256") != build.get("deps_sha256"):
            return f"{CHANGED}: the mwcc report's {ref.get('build') or side} build differs from the decision's record"
    return None


def prepare(edits: dict, mwcc: dict, decision: dict, *, unit: str, function: str, observation_id: Any,
            probe: Optional[dict] = None, variant: Optional[str] = None, label: str = "gate",
            expect_fidelity_hash: Optional[str] = None) -> dict:
    """{status: ok, input, input_hash, fidelity_input_hash} or {status: unavailable, compiler_delta}.
    `expect_fidelity_hash`: the queued job's fidelity `input_hash`; artifacts that no longer carry
    that record (replaced since the observation) are never prepared."""
    import steering_edits as se

    row = _function_row(decision, unit, function)
    if row is None:
        return {"status": "unavailable", "compiler_delta": unavailable(
            f"reconstruction: the gate's decision has no row for {unit} {function}")}
    fidelity = row.get("fidelity")
    if not isinstance(fidelity, dict):
        return {"status": "unavailable", "compiler_delta": unavailable(
            "reconstruction: the gate recorded no fidelity record for this function (a gate from before the record)")}
    variant = variant or row.get("sstar_variant") or fidelity.get("variant") or "global"
    if variant not in VARIANT_BUILDS:
        return {"status": "error", "error": f"unknown S* variant {variant}"}
    unit_record = ((mwcc.get("fidelity") or {}).get("units") or {}).get(unit) or {}
    builds = unit_record.get("builds") or {}
    changed = _record_problem(fidelity, builds, expect_fidelity_hash)
    if changed:
        return {"status": "unavailable", "compiler_delta": unavailable(changed)}
    compile_ = unit_record.get("compile")
    cand, sstar = builds.get("cand"), builds.get(VARIANT_BUILDS[variant])
    problems = [p for p in (_build_problem("candidate", cand), _build_problem(f"S* ({variant})", sstar)) if p]
    if not isinstance(compile_, dict) or not compile_.get("src"):
        problems.append("no compile command recorded")
    if problems:
        return {"status": "unavailable", "compiler_delta": unavailable("reconstruction: " + "; ".join(problems))}
    if sstar.get("same_as") == "cand" or sstar.get("obj_sha256") == cand.get("obj_sha256"):
        return {"status": "unavailable", "compiler_delta": unavailable(
            f"no distinct S*: the gate's S* ({variant}) compiles to the candidate object, so no decision differs")}
    base_rev, edits_hash = mwcc.get("base_rev"), mwcc.get("edits_hash")
    files = edits.get("files") or []
    if not base_rev or edits.get("base_rev") != base_rev or se.edits_hash(base_rev, files) != edits_hash \
            or edits.get("edits_hash") != edits_hash or fidelity.get("edits_hash") != edits_hash:
        return {"status": "unavailable", "compiler_delta": unavailable(
            "reconstruction: the edits do not match the gate's edits_hash")}
    read = set(cand["deps"]) | set(sstar["deps"]) | {compile_["src"]}
    data = {
        "schema": INPUT_SCHEMA,
        "label": label,
        "variant": variant,
        "unit": unit,
        "function": row.get("name") or function,
        "base_rev": base_rev,
        "edits_hash": edits_hash,
        "game_version": edits.get("game_version"),
        "revert_ids": sorted(sstar.get("revert_ids") or []),
        "files": [{k: f.get(k) for k in ("path", "base_exists", "cand_exists", "base_text", "cand_text")}
                  for f in files if f.get("path") in read],
        "compile": compile_,
        "candidate": {"obj_sha256": cand["obj_sha256"], "deps": cand["deps"]},
        "sstar": {"obj_sha256": sstar["obj_sha256"], "deps": sstar["deps"]},
        "fidelity_input_hash": fidelity.get("input_hash"),
    }
    input_hash = sha256_json(data)
    return {"status": "ok", "input_hash": input_hash, "fidelity_input_hash": fidelity.get("input_hash"),
            "input": {**data, "input_hash": input_hash, "observation_id": observation_id, "probe": probe}}


def cmd_prepare(args: argparse.Namespace) -> int:
    try:
        if args.check:
            check = _load(args.check) or {}
            edits, mwcc, decision = check.get("edits") or {}, check.get("mwcc") or {}, check.get("decision") or {}
        else:
            edits, mwcc, decision = _load(args.edits) or {}, _load(args.mwcc) or {}, _load(args.decision) or {}
        probe = _load(args.probe)
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "unavailable", "compiler_delta": unavailable(
            f"reconstruction: gate artifacts unreadable: {error}")}))
        return 0
    observation_id: Any = int(args.observation_id) if str(args.observation_id).isdigit() else args.observation_id
    out = prepare(edits, mwcc, decision, unit=args.unit, function=args.function, observation_id=observation_id,
                  probe=probe, variant=args.variant, label=args.label, expect_fidelity_hash=args.expect_fidelity_hash)
    if out["status"] == "ok":
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(out["input"]) + "\n", encoding="utf-8")
        print(json.dumps({"status": "ok", "input_hash": out["input_hash"],
                          "fidelity_input_hash": out["fidelity_input_hash"], "out": args.out}))
    else:
        print(json.dumps(out))
    return 0


# --------------------------------------------------------------------------
# run (build sandbox)
# --------------------------------------------------------------------------


def git(repo: Path, *args: str, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=check)


def variant_texts(files: list[dict], revert_ids: list[str]) -> tuple[dict[str, Optional[bytes]], dict[str, Optional[bytes]]]:
    """(candidate, S*) file contents, exactly as `steering_check.run_mwcc` builds them."""
    import steering_edits as se

    wanted = set(revert_ids)
    cand: dict[str, Optional[bytes]] = {}
    sstar: dict[str, Optional[bytes]] = {}
    for f in files:
        edits = se.enumerate_edits(f["path"], f.get("base_text"), f.get("cand_text"))
        ids = [e.id for e in edits if e.id in wanted]
        cand[f["path"]] = se.encode(f["cand_text"]) if f.get("cand_exists") else None
        sstar[f["path"]] = se.encode(se.apply_reverts(f.get("base_text"), f.get("cand_text"), edits, ids,
                                                      base_exists=f.get("base_exists"), cand_exists=f.get("cand_exists"),
                                                      preserve_lines=True))
    return cand, sstar


class Tree:
    """What compare_sources materializes for a manifest at `base_rev`: the shadow root of the
    checkout with src/include/libs at `base_rev`, then the overlay (compare_sources.materialize)."""

    def __init__(self, repo: Path, base_rev: str, overlay: dict[str, Optional[bytes]]):
        self.repo, self.base_rev, self.overlay = repo, base_rev, overlay
        self.cache: dict[str, Optional[bytes]] = {}

    def read(self, key: str) -> Optional[bytes]:
        if key in self.overlay:
            return self.overlay[key]
        if key.startswith("external:"):
            path = Path(key[len("external:"):])
            return path.read_bytes() if path.is_file() else None
        if key not in self.cache:
            if key.split("/", 1)[0] in SOURCE_DIRS:
                shown = git(self.repo, "show", f"{self.base_rev}:{key}")
                self.cache[key] = shown.stdout if shown.returncode == 0 else None
            else:
                path = self.repo / key
                self.cache[key] = path.read_bytes() if path.is_file() else None
        return self.cache[key]

    def mismatches(self, deps: dict[str, str]) -> list[str]:
        out = []
        for key, want in sorted(deps.items()):
            got = sha256_bytes(self.read(key))
            if got != want:
                out.append(key if got else f"{key} (missing)")
        return out


def _ninja_targets(paths: list[str]) -> list[str]:
    """Generated inputs a build sandbox may simply not have built yet (PCH, generated includes)."""
    return [p.removesuffix(" (missing)") for p in paths
            if p.startswith("build/") and (p.endswith((".mch", ".pch")) or "/include/" in p)]


def _compile_problems(repo: Any, unit: Any, recorded: dict) -> list[str]:
    edge = repo.edges[unit.obj]
    problems = [f"{field} differs ({recorded.get(field)!r} recorded, {have!r} here)"
                for field, have in (("rule", edge.rule), ("mw_version", edge.mw_version), ("src", edge.src),
                                    ("cflags", edge.cflags), ("extab_padding", edge.extab_padding))
                if recorded.get(field) != have]

    def same(identity: Optional[dict], path: Path, what: str) -> None:
        if not identity or not identity.get("sha256"):
            problems.append(f"no {what} hash recorded")
            return
        try:
            have = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            problems.append(f"{what} missing here ({path})")
            return
        if have != identity["sha256"]:
            problems.append(f"{what} differs ({path.name})")

    same(recorded.get("compiler"), repo.root / "build/compilers" / edge.mw_version / "mwcceppc.exe", "stock compiler")
    same(recorded.get("runner"), Path(repo.runner), "compiler runner")
    for identity in list(recorded.get("wrappers") or []) + list(recorded.get("post") or []):
        if identity and identity.get("path"):
            same(identity, repo.root / identity["path"], identity["path"].rsplit("/", 1)[-1])
    return problems


def _manifest(path: Path, base_rev: str, overlay: dict[str, Optional[bytes]]) -> Optional[str]:
    files: dict[str, Optional[str]] = {}
    for rel, content in sorted(overlay.items()):
        if rel.split("/", 1)[0] not in SOURCE_DIRS or not rel.lower().endswith(MANIFEST_SUFFIXES):
            return f"{rel} cannot travel in an overlay manifest (not a C/C++ source under src/, include/ or libs/)"
        try:
            files[rel] = None if content is None else content.decode("utf-8")
        except UnicodeDecodeError:
            return f"{rel} is not UTF-8 and cannot travel in an overlay manifest"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"files": files, "base": base_rev}), encoding="utf-8")
    return None


def _stock_problem(stock: dict, data: dict) -> Optional[str]:
    """Why the rebuilt stock objects are not the gate's, or None."""
    for side, key, rec in (("candidate", "a_obj_sha", data["candidate"]), ("S*", "b_obj_sha", data["sstar"])):
        if stock.get(key) != rec.get("obj_sha256"):
            return (f"reconstruction: the rebuilt {side} object differs from the gate's "
                    f"({str(rec.get('obj_sha256'))[:12]} recorded, {str(stock.get(key))[:12]} rebuilt)")
    return None


def _compare_reason(res: dict, function: str, data: dict) -> Optional[dict]:
    """compare_sources' non-ok result -> the final `{unavailable}` delta, or None for the one
    transient outcome (its deadline ran out), which the job retries. Every other status is terminal:
    rerunning the same inputs gives the same answer, so it is published, never retried."""
    status = str(res.get("status") or "internal_error")
    detail = str(res.get("unavailable") or res.get("error") or res.get("summary") or "")[:300]
    if status == "unavailable" and res.get("unavailable") == "timeout":
        return None
    if status == "no_decisions_traced":
        # Both stock objects were built: they must still be the gate's before anything is said about them.
        problem = _stock_problem(res.get("stock") or {}, data)
        if problem:
            return unavailable(problem)
        sides = ", ".join({"a": "candidate", "b": "S*"}.get(str(v), str(v)) for v in res.get("variants_without_decisions") or [])
        return unavailable(f"no decisions traced for {function}" + (f" ({sides})" if sides else "")
                           + (f": {detail}" if detail else ""))
    if status == "unit_build_failed":
        side = {"a": "candidate", "b": "S*"}.get(str(res.get("variant")), "a variant")
        return unavailable(f"reconstruction: the rebuilt {side} does not compile: {detail}")
    if status == "function_not_found":
        return unavailable(f"no decisions traced for {function}: {detail}")
    if status == "trace_invalid":
        return unavailable(f"trace-invalid: {detail}")
    if status == "unavailable":
        if res.get("unavailable") == "trace-missing":
            return unavailable(f"no decisions traced for {function}: the traced compiler wrote no trace")
        return unavailable(str(res.get("unavailable") or "unavailable"))
    return unavailable(f"compare_sources {status}: {detail}" if detail else f"compare_sources {status}")


def run(data: dict, repo_root: Path, timeout: int = DEFAULT_TIMEOUT) -> dict:
    base = {"schema": RESULT_SCHEMA, "observation_id": data.get("observation_id"), "input_hash": data.get("input_hash"),
            "label": data.get("label") or "gate", "variant": data.get("variant")}
    function, unit_name = str(data.get("function") or ""), str(data.get("unit") or "")

    def finish(status: str, delta: Optional[dict], *, retryable: bool = False, error: Optional[str] = None) -> dict:
        out = {**base, "status": status, "retryable": retryable}
        if delta is not None:
            if "unavailable" not in delta:
                delta = {**delta, "observation_id": data.get("observation_id"), "variant": data.get("variant"),
                         "label": base["label"]}
            out["compiler_delta"] = delta
            probe = None
            if base["label"] == "gate":
                import steering_diagnose

                probe = steering_diagnose.apply_compiler_delta(data.get("probe"), delta, function=function, unit=unit_name)
            out["probe"] = probe
        if error:
            out["error"] = error[:2000]
        return out

    def gone(reason: str) -> dict:
        return finish("unavailable", unavailable(reason))

    if data.get("schema") != INPUT_SCHEMA:
        return finish("error", None, error=f"input is not {INPUT_SCHEMA}")
    if sha256_json({k: v for k, v in data.items() if k not in ("input_hash", "observation_id", "probe")}) != data.get("input_hash"):
        return finish("error", None, error="input_hash does not match the input")
    started = time.monotonic()
    os.environ["ORCH_GAME_REPO_ROOT"] = str(repo_root)
    import stack_check

    try:
        repo = stack_check.Repo(repo_root)
        unit = repo.unit(unit_name)
    except SystemExit as error:
        return gone(f"reconstruction: {error}")
    sys.path.insert(0, str(COMPARE_API))
    import native_backend as nb

    try:
        nb.native_setup(repo, unit, ("coloring",))
    except nb.NativeUnavailable as error:
        return gone(error.reason)
    problems = _compile_problems(repo, unit, data.get("compile") or {})
    if problems:
        return gone("reconstruction: compile command: " + "; ".join(problems[:3]))
    base_rev = str(data.get("base_rev") or "")
    if not base_rev or git(repo.root, "cat-file", "-e", f"{base_rev}^{{commit}}").returncode != 0:
        return gone(f"reconstruction: base revision {base_rev[:12] or '?'} is not in this checkout")
    cand, sstar = variant_texts(data.get("files") or [], data.get("revert_ids") or [])
    trees = {"candidate": (Tree(repo.root, base_rev, cand), data["candidate"]),
             "S*": (Tree(repo.root, base_rev, sstar), data["sstar"])}

    def drift() -> list[str]:
        return [f"{side}: {path}" for side, (tree, rec) in trees.items() for path in tree.mismatches(rec.get("deps") or {})]

    changed = drift()
    targets = sorted({t for d in changed for t in _ninja_targets([d.split(": ", 1)[1]])})
    if targets:  # generated inputs (PCH, generated includes) this sandbox has not built: build them once
        subprocess.run(["ninja", *targets], cwd=str(repo.root), capture_output=True,
                       timeout=min(NINJA_TIMEOUT, max(60, timeout // 3)))
        for tree, _ in trees.values():
            tree.cache.clear()
        changed = drift()
    if changed:
        more = f" (+{len(changed) - 3} more)" if len(changed) > 3 else ""
        return gone("reconstruction: dependency differs from the gate's: " + ", ".join(changed[:3]) + more)
    work = repo.root / "build" / "steering" / "explain" / f"{data.get('observation_id')}-{str(data.get('input_hash'))[:12]}"
    for label, overlay in (("a", cand), ("b", sstar)):
        problem = _manifest(work / f"{label}.json", base_rev, overlay)
        if problem:
            return gone(f"reconstruction: {problem}")
    import compare_sources as cs

    out_rel = (work / f"compare-{int(time.time())}").relative_to(repo.root).as_posix()
    args = cs.build_parser().parse_args([
        "--repo-root", str(repo.root), "--unit", unit_name, "--function", function,
        "--a", str((work / "a.json").relative_to(repo.root)), "--b", str((work / "b.json").relative_to(repo.root)),
        "--base-rev", base_rev, "--out", out_rel,
        "--timeout-seconds", str(max(60, int(timeout - (time.monotonic() - started)))),
    ])
    res = cs.run(args)
    if res.get("status") != "ok":
        delta = _compare_reason(res, function, data)
        if delta is None:
            return finish("error", None, retryable=True, error=f"compare_sources {res.get('status')}: "
                                                                 f"{res.get('unavailable') or res.get('error')}")
        return finish("unavailable", delta)
    stock = res.get("stock") or {}
    problem = _stock_problem(stock, data)
    if problem:
        return gone(problem)
    if not res.get("traced_object_matches_stock"):
        return gone("traced-object-mismatch")
    lines = [str(x) for x in res.get("summary_lines") or []]
    if not res.get("changes") and stock.get("code_class") not in (None, "identical"):
        lines.append("The objects differ outside the traced points ("
                     + (", ".join(res.get("unavailable_points") or []) or "untraced decisions") + ").")
    delta = {
        "summary_lines": lines,
        "changes": res.get("changes") or [],
        "change_counts": res.get("change_counts") or {},
        "changes_truncated": bool(res.get("changes_truncated")),
        "version": res.get("version"),
        "available_points": res.get("available_points") or [],
        "unavailable_points": res.get("unavailable_points") or [],
        "stock": stock,
        "a": "candidate (probe edits kept)",
        "b": f"S* (probe edits reverted, {data.get('variant')})",
        "full_report": res.get("full_report"),
    }
    return finish("ok", delta)


def cmd_run(args: argparse.Namespace) -> int:
    try:
        data = _load(args.input) or {}
    except (OSError, ValueError) as error:
        print(json.dumps({"schema": RESULT_SCHEMA, "status": "error", "retryable": False, "error": f"input: {error}"}))
        return 0
    try:
        result = run(data, Path(args.repo_root or os.getcwd()).resolve(), args.timeout_seconds)
    except subprocess.TimeoutExpired as error:
        result = {"schema": RESULT_SCHEMA, "status": "error", "retryable": True, "observation_id": data.get("observation_id"),
                  "input_hash": data.get("input_hash"), "error": f"timeout: {error}"}
    except Exception as error:  # noqa: BLE001 - one JSON object, always; bounded retries decide
        result = {"schema": RESULT_SCHEMA, "status": "error", "retryable": True, "observation_id": data.get("observation_id"),
                  "input_hash": data.get("input_hash"), "error": f"{type(error).__name__}: {error}"}
    print(json.dumps(result, indent=None if args.json else 1))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare", help="host: the compact sandbox input for one function")
    p.add_argument("--check")
    p.add_argument("--edits")
    p.add_argument("--mwcc")
    p.add_argument("--decision")
    p.add_argument("--unit", required=True)
    p.add_argument("--function", required=True)
    p.add_argument("--observation-id", required=True)
    p.add_argument("--probe")
    p.add_argument("--variant", choices=sorted(VARIANT_BUILDS))
    p.add_argument("--label", choices=("gate", "ablation"), default="gate")
    p.add_argument("--expect-fidelity-hash", help="the queued job's fidelity input_hash; other artifacts are refused")
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_prepare)
    r = sub.add_parser("run", help="build sandbox: verify the rebuild and diff the decisions")
    r.add_argument("--input", required=True)
    r.add_argument("--repo-root")
    r.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT)
    r.add_argument("--json", action="store_true")
    r.set_defaults(func=cmd_run)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "prepare" and not args.check and not (args.edits and args.mwcc and args.decision):
        print(json.dumps({"status": "error", "error": "prepare needs --check or --edits, --mwcc and --decision"}))
        return 2
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
