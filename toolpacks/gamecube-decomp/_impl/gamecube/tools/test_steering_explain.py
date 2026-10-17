"""The gate's fidelity record, fresh depfiles, and the steering-explain job's tool (plan 3.4.1).

Fake-toolchain tests run everywhere. The real-compiler tests run MWCC on a
scratch clone of the Melee (C) and SMS (C++) checkouts and need
MWCC_NATIVE_TEST_ROOT (a traced root: `<ver>/mwcceppc.exe` + CAPABILITIES.json,
e.g. /tmp/wcl-native/bin) and a wibo runner; they are skipped otherwise.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import stack_check  # noqa: E402
import steering_check as sc  # noqa: E402
import steering_edits as se  # noqa: E402
import steering_explain as sx  # noqa: E402
from test_steering_check import FakeOracle, fake_units  # noqa: E402
from test_steering_pipeline import TARGET, FakeMwcc, toolchain  # noqa: E402,F401


# --------------------------------------------------------------------------
# Depfiles
# --------------------------------------------------------------------------


def test_parse_depfile_maps_wine_paths_into_the_root(tmp_path: Path) -> None:
    root = tmp_path / "w0"
    (root / "inc").mkdir(parents=True)
    (root / "src/x").mkdir(parents=True)
    (root / "src/x/t.c").write_text("int f;\n")
    (root / "inc/a.h").write_text("#define A 1\n")
    outside = tmp_path / "sys.h"
    outside.write_text("// system\n")
    zroot = "Z:" + str(root).replace("/", "\\")
    text = (f"Z:\\tmp\\out\\t.o: src\\x\\t.c \\\r\n\t{zroot}\\inc\\a.h \\\r\n"
            f"\tZ:{str(outside).replace('/', chr(92))} \\\r\n\tC:\\windows\\x.h \r\n")
    deps, problems = stack_check.parse_depfile(root, text)
    assert set(deps) == {"src/x/t.c", "inc/a.h", f"external:{outside}"}
    assert deps["inc/a.h"] == sc.sha256_bytes(b"#define A 1\n")
    assert problems == ["unresolvable dependency path C:/windows/x.h"]


# A fake mwcceppc (run by `/bin/sh`): copies the source to -o and, with -MD, writes
# `<stem>.d` into its cwd the way MWCC does, listing the source and each -i dir's a.h.
FAKE_MWCC = r"""out=""; src=""; md=0; incs=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift;;
    -c) src="$2"; shift;;
    -i) incs="$incs $2"; shift;;
    -MD) md=1;;
  esac
  shift
done
cat "$src" > "$out"
if [ $md = 1 ]; then
  stem=$(basename "$src"); stem="${stem%.*}"
  { printf 'Z:%s: %s' "$out" "$src"; for i in $incs; do printf ' \\\nZ:%s/a.h' "$(pwd)/$i"; done; printf '\n'; } \
    | tr '/' '\\' > "$stem.d"
fi
"""


def fake_repo(tmp_path: Path):
    root = tmp_path / "repo"
    (root / "src").mkdir(parents=True)
    (root / "include").mkdir()
    (root / "src/a.c").write_text("int a;\n")
    (root / "include/a.h").write_text("#define H 1\n")
    compiler = root / "build/compilers/GC/1.2.5/mwcceppc.exe"
    compiler.parent.mkdir(parents=True)
    compiler.write_text(FAKE_MWCC)
    edge = stack_check.Edge("mwcc", "src/a.c", "GC/1.2.5", "-O4,p -i include", None)
    unit = stack_check.Unit("a", "build/V/src/a.o", "build/V/obj/a.o", "src/a.c")
    repo = type("R", (), {"root": root, "edges": {unit.obj: edge}, "runner": "/bin/sh"})()
    return repo, unit


def test_compile_in_writes_a_fresh_depfile_hashed_before_the_root_is_reused(tmp_path: Path) -> None:
    repo, unit = fake_repo(tmp_path)
    shadow = tmp_path / "w0"
    stack_check.make_shadow_root(repo.root, shadow)
    (shadow / "a.d").write_text("Z:\\stale.o: src\\gone.c\n")  # left by an earlier compile in this root
    stack_check.write_file(shadow, "include/a.h", b"#define H 2\n")  # this variant's header
    out = tmp_path / "o" / "a.o"
    out.parent.mkdir()
    res = stack_check.compile_in(repo, shadow, unit, out, depfile=True)
    assert res.ok and res.depfile_error is None, res
    assert res.deps == {"src/a.c": sc.sha256_bytes(b"int a;\n"), "include/a.h": sc.sha256_bytes(b"#define H 2\n")}
    assert not (shadow / "a.d").exists()  # consumed: the next compile in this root starts clean
    plain = stack_check.compile_in(repo, shadow, unit, out)
    assert plain.ok and plain.deps is None and not (shadow / "a.d").exists()


def test_compile_in_reports_a_missing_depfile(tmp_path: Path) -> None:
    repo, unit = fake_repo(tmp_path)
    (repo.root / "build/compilers/GC/1.2.5/mwcceppc.exe").write_text(
        'while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done; : > "$out"\n')
    shadow = tmp_path / "w0"
    stack_check.make_shadow_root(repo.root, shadow)
    res = stack_check.compile_in(repo, shadow, unit, tmp_path / "a.o", depfile=True)
    assert res.ok and res.deps is None and res.depfile_error == "depfile not written"


# --------------------------------------------------------------------------
# The fidelity record on the fake toolchain
# --------------------------------------------------------------------------


class RecordingMwcc(FakeMwcc):
    """FakeMwcc that records what a fidelity build read, like RepoBackend's depfile."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.records: dict[str, dict] = {}

    def compile(self, unit, texts, label):
        ok, out, err = super().compile(unit, texts, label)
        if ok and label in sc.FIDELITY_LABELS:
            src = texts.get(unit.source) or b""
            self.records[str(out)] = {"deps": {unit.source: sc.sha256_bytes(src), "include/h.h": "0" * 64},
                                      "depfile_error": None}
        return ok, out, err

    def compile_record(self, obj):
        return self.records.get(str(obj))

    def compile_command(self, unit):
        return {"rule": "mwcc", "mw_version": "GC/1.2.5", "src": unit.source, "cflags": "-O4,p",
                "extab_padding": None, "compiler": {"path": "build/compilers/GC/1.2.5/mwcceppc.exe", "sha256": "c" * 64},
                "runner": {"path": "/wibo", "sha256": "r" * 64}, "wrappers": [], "post": []}


def gate(repo: Path, tmp: Path, backend=None) -> tuple[dict, dict, dict, dict]:
    edits = json.loads(json.dumps(sc.build_edits(repo, "HEAD", unit_resolver=fake_units)))
    red = json.loads(json.dumps(sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1,
                                              approvals_path=None, evidence_repo=repo, oracle=FakeOracle())))
    backend = backend or RecordingMwcc(tmp / "m", TARGET, repo=repo)
    mw = json.loads(json.dumps(sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red), attribute=red,
                                           jobs=1, backend=backend)))
    dec = json.loads(json.dumps(sc.decide(red, mw, evidence_repo=repo, approvals=[], version=edits["game_version"])))
    return edits, red, mw, dec


def test_mwcc_records_every_candidate_and_sstar_build(toolchain) -> None:
    repo, tmp, _ = toolchain
    edits, red, mw, _ = gate(repo, tmp)
    fid = mw["fidelity"]
    assert fid["schema"] == sc.FIDELITY_SCHEMA and fid["edits_hash"] == edits["edits_hash"]
    builds = fid["units"]["u1"]["builds"]
    assert set(builds) == {"cand", "sstar", "sstar_evidence"}  # the map-call keep builds the evidence S*
    revert = set(sc.revert_edit_ids(red))
    assert set(builds["sstar"]["revert_ids"]) == revert and builds["cand"]["revert_ids"] == []
    assert set(builds["sstar_evidence"]["revert_ids"]) < revert  # the kept call's edits are not reverted
    assert all(b["depfile"] == "ok" and b["deps_sha256"] and len(b["obj_sha256"]) == 64 for b in builds.values())
    assert fid["units"]["u1"]["compile"]["mw_version"] == "GC/1.2.5"
    assert {"coverage", "functions", "group_touch", "unused_checks", "errors"} <= set(mw)  # legacy fields kept


def test_decide_names_the_sstar_its_verdict_used(toolchain) -> None:
    repo, tmp, _ = toolchain
    _, _, mw, dec = gate(repo, tmp)
    rows = {f["name"]: f for f in dec["functions"]}
    assert rows["f"]["sstar_variant"] == "evidence_sstar"  # verdict on S* with the map-backed call kept
    assert rows["g"]["sstar_variant"] == "global"
    for row in rows.values():
        fid = row["fidelity"]
        assert fid["complete"] and fid["problems"] == [], fid
        assert fid["sstar"]["build"] == sc.VARIANT_BUILDS[row["sstar_variant"]]
        assert fid["sstar"]["obj_sha256"] == mw["fidelity"]["units"]["u1"]["builds"][fid["sstar"]["build"]]["obj_sha256"]
        assert fid["input_hash"] == sc.sha256_json({k: v for k, v in fid.items() if k != "input_hash"})


def test_a_backend_without_compile_records_leaves_the_record_incomplete(toolchain) -> None:
    repo, tmp, _ = toolchain
    _, _, _, dec = gate(repo, tmp, backend=FakeMwcc(tmp / "m2", TARGET, repo=repo))
    fid = dec["functions"][0]["fidelity"]
    assert not fid["complete"] and any("records no compile inputs" in p for p in fid["problems"])


# --------------------------------------------------------------------------
# prepare
# --------------------------------------------------------------------------


def test_prepare_selects_the_verdicts_variant_and_only_the_files_it_read(toolchain) -> None:
    repo, tmp, _ = toolchain
    edits, red, mw, dec = gate(repo, tmp)
    out = sx.prepare(edits, mw, dec, unit="u1", function="g", observation_id=7, probe={"function": "g", "unit": "u1"})
    assert out["status"] == "ok", out
    data = out["input"]
    assert data["variant"] == "global" and data["observation_id"] == 7 and data["label"] == "gate"
    assert [f["path"] for f in data["files"]] == ["src/a.c"]
    assert set(data["revert_ids"]) == set(sc.revert_edit_ids(red))
    assert data["sstar"]["obj_sha256"] == mw["fidelity"]["units"]["u1"]["builds"]["sstar"]["obj_sha256"]
    # The S* the job rebuilds is byte for byte the S* the gate compiled.
    cand, sstar = sx.variant_texts(data["files"], data["revert_ids"])
    assert sx.sha256_bytes(sstar["src/a.c"]) == data["sstar"]["deps"]["src/a.c"]
    assert sx.sha256_bytes(cand["src/a.c"]) == data["candidate"]["deps"]["src/a.c"]
    # Same input, other observation: same input hash (the job key adds the observation and the tool).
    assert sx.prepare(edits, mw, dec, unit="u1", function="g", observation_id=8)["input_hash"] == out["input_hash"]
    ablation = sx.prepare(edits, mw, dec, unit="u1", function="f", observation_id=7, variant="global", label="ablation")
    assert ablation["input"]["variant"] == "global" and ablation["input"]["label"] == "ablation"


def test_prepare_never_turns_a_missing_record_into_a_delta(toolchain) -> None:
    repo, tmp, _ = toolchain
    edits, _, mw, dec = gate(repo, tmp)
    legacy = json.loads(json.dumps(dec))
    for row in legacy["functions"]:
        row.pop("fidelity")
    out = sx.prepare(edits, mw, legacy, unit="u1", function="g", observation_id=1)
    assert out["status"] == "unavailable" and "no fidelity record" in out["compiler_delta"]["unavailable"]
    tampered = json.loads(json.dumps(edits))
    tampered["files"][0]["cand_text"] += "\n"
    out = sx.prepare(tampered, mw, dec, unit="u1", function="g", observation_id=1)
    assert out["compiler_delta"] == {"unavailable": "reconstruction: the edits do not match the gate's edits_hash"}
    same = json.loads(json.dumps(mw))
    builds = same["fidelity"]["units"]["u1"]["builds"]
    builds["sstar"]["obj_sha256"] = builds["cand"]["obj_sha256"]
    out = sx.prepare(edits, same, rerecord(dec, same), unit="u1", function="g", observation_id=1)
    assert out["compiler_delta"]["unavailable"].startswith("no distinct S*")
    nodeps = json.loads(json.dumps(mw))
    nodeps["fidelity"]["units"]["u1"]["builds"]["cand"].update(deps={}, deps_sha256=None, depfile="depfile not written")
    out = sx.prepare(edits, nodeps, rerecord(dec, nodeps), unit="u1", function="g", observation_id=1)
    assert out["compiler_delta"]["unavailable"].startswith("reconstruction: candidate: no dependency record")


def rerecord(dec: dict, mw: dict) -> dict:
    """The decision as a gate over `mw` would have recorded it."""
    out = json.loads(json.dumps(dec))
    rows = {f["name"]: f for f in mw["functions"]}
    for row in out["functions"]:
        row["fidelity"] = sc.function_fidelity(mw, rows[row["name"]], row["sstar_variant"])
    return out


def test_prepare_refuses_artifacts_replaced_after_the_observation(toolchain) -> None:
    """Review F r1 job #1: the job names files on disk; a later gate may have replaced them."""
    repo, tmp, _ = toolchain
    edits, _, mw, dec = gate(repo, tmp)
    queued = next(f for f in dec["functions"] if f["name"] == "g")["fidelity"]["input_hash"]
    ok = sx.prepare(edits, mw, dec, unit="u1", function="g", observation_id=1, expect_fidelity_hash=queued)
    assert ok["status"] == "ok" and ok["fidelity_input_hash"] == queued
    # Another gate's (consistent) artifacts under the same paths: a different fidelity record.
    other = json.loads(json.dumps(mw))
    other["fidelity"]["units"]["u1"]["builds"]["sstar"]["obj_sha256"] = "f" * 64
    out = sx.prepare(edits, other, rerecord(dec, other), unit="u1", function="g", observation_id=1,
                     expect_fidelity_hash=queued)
    assert out["status"] == "unavailable" and out["compiler_delta"]["unavailable"].startswith(sx.CHANGED)
    # A replaced mwcc report under the old decision: the two no longer agree.
    out = sx.prepare(edits, other, dec, unit="u1", function="g", observation_id=1, expect_fidelity_hash=queued)
    assert "mwcc report's sstar build differs" in out["compiler_delta"]["unavailable"]
    # A hand-edited record no longer hashes to its input_hash.
    forged = json.loads(json.dumps(dec))
    next(f for f in forged["functions"] if f["name"] == "g")["fidelity"]["sstar"]["obj_sha256"] = "f" * 64
    out = sx.prepare(edits, mw, forged, unit="u1", function="g", observation_id=1)
    assert "does not hash to its input_hash" in out["compiler_delta"]["unavailable"]


def test_prepare_cli_writes_the_input_from_a_check_report(toolchain, tmp_path: Path) -> None:
    repo, tmp, _ = toolchain
    edits, red, mw, dec = gate(repo, tmp)
    check = tmp_path / "check.json"
    check.write_text(json.dumps({"edits": edits, "reduce": red, "mwcc": mw, "decision": dec}))
    out = tmp_path / "in.json"
    res = subprocess.run([sys.executable, str(TOOLS / "steering_explain.py"), "prepare", "--check", str(check),
                          "--unit", "u1", "--function", "g", "--observation-id", "42", "--out", str(out)],
                         capture_output=True, text=True, check=True)
    printed = json.loads(res.stdout)
    assert printed["status"] == "ok" and json.loads(out.read_text())["observation_id"] == 42
    assert json.loads(out.read_text())["input_hash"] == printed["input_hash"]


def test_run_refuses_an_input_that_does_not_match_its_hash(tmp_path: Path) -> None:
    res = sx.run({"schema": sx.INPUT_SCHEMA, "input_hash": "x", "unit": "u", "function": "f"}, tmp_path)
    assert res["status"] == "error" and not res["retryable"] and "compiler_delta" not in res


# --------------------------------------------------------------------------
# Real MWCC: the gate's mwcc step, then the explain run, on scratch clones
# --------------------------------------------------------------------------


def harness_roots() -> list[Path]:
    """This checkout, then the main one (game checkouts are untracked, so a worktree lacks them)."""
    roots = [TOOLS.parents[4]]
    common = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=TOOLS, capture_output=True, text=True)
    if common.returncode == 0:
        roots.append((TOOLS / common.stdout.strip()).resolve().parent)
    return roots


def checkout(env: str, rel: str) -> Path:
    if os.environ.get(env):
        return Path(os.environ[env])
    return next((r / rel for r in harness_roots() if (r / rel).is_dir()), Path("/nonexistent"))


TRACED = Path(os.environ.get("MWCC_NATIVE_TEST_ROOT", "/nonexistent"))
MELEE = checkout("MELEE_CHECKOUT", "games/melee/workspace/repository")
SMS = checkout("SMS_CHECKOUT", "games/sms/workspace/checkout")
WIBO = next((w for w in (os.environ.get("MWCC_WIBO", ""), str(MELEE / "build/tools/wibo")) if w and Path(w).is_file()), None)
READY = (TRACED / "CAPABILITIES.json").is_file() and WIBO is not None


def scratch_clone(source: Path, version_dir: str, tmp: Path) -> Path:
    """A writable checkout sharing `source`'s objects; `source` is never written."""
    root = tmp / source.name
    subprocess.run(["git", "clone", "-q", "--shared", "--no-checkout", str(source), str(root)], check=True)
    subprocess.run(["git", "checkout", "-q", "HEAD"], cwd=root, check=True)
    shutil.copy2(source / "build.ninja", root / "build.ninja")
    (root / "build" / version_dir).mkdir(parents=True)
    for rel in ("build/compilers", "build/tools", f"build/{version_dir}/include"):
        (root / rel).symlink_to(source / rel)
    return root


def tool(script: str, *args: str, timeout: int = 900) -> dict:
    env = {**os.environ, "ORCH_MWCC_TRACED_ROOT": str(TRACED), "MWCC_WIBO": str(WIBO), "ORCH_MWCC_NATIVE_CAPABILITIES": ""}
    res = subprocess.run([sys.executable, str(TOOLS / script), *args], capture_output=True, text=True, env=env,
                         timeout=timeout)
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


def explain(root: Path, tmp: Path, function: str, mutate=None) -> tuple[dict, dict]:
    """edits + the gate's mwcc step (every edit reverted, so S* is the base) on the real backend,
    then prepare and the explain run."""
    short = Path(tempfile.mkdtemp(prefix="sx-", dir="/tmp"))
    try:
        edits = tool("steering_check.py", "edits", "--repo", str(root), "--base-ref", "HEAD", "--json")
        ids = [e.id for f in edits["files"] for e in se.enumerate_edits(f["path"], f["base_text"], f["cand_text"])]
        mw = tool("steering_check.py", "mwcc", "--repo", str(root), "--base-ref", "HEAD", "--edits-hash",
                  edits["edits_hash"], "--revert-edits", ",".join(ids), "--functions", function, "--jobs", "1",
                  "--tmp", str(short), "--json")
    finally:
        shutil.rmtree(short, ignore_errors=True)
    row = next(f for f in mw["functions"] if f["name"] == function)
    if mutate:
        mutate(mw["fidelity"]["units"][row["unit"]])
    decision = {"functions": [{"unit": row["unit"], "name": function, "sstar_variant": "global",
                               "fidelity": sc.function_fidelity(mw, row, "global")}]}
    out = sx.prepare(edits, mw, decision, unit=row["unit"], function=function, observation_id=11,
                     probe={"function": function, "unit": row["unit"], "hypotheses": [{"cause": "missing inline function"}]})
    assert out["status"] == "ok", (out, decision)
    (tmp / "in.json").write_text(json.dumps(out["input"]))
    return mw, tool("steering_explain.py", "run", "--input", str(tmp / "in.json"), "--repo-root", str(root), "--json")


MIRROR = "    a->x += unit_mirror_axis->x * f;\n    a->y += unit_mirror_axis->y * f;\n"


@pytest.mark.skipif(not (READY and MELEE.is_dir()), reason="needs MWCC_NATIVE_TEST_ROOT, a wibo runner and the Melee checkout")
def test_real_c_function_rebuilds_verifies_and_diffs(tmp_path: Path) -> None:
    root = scratch_clone(MELEE, "GALE01", tmp_path)
    path = root / "src/melee/lb/lbvector.c"
    text = path.read_text()
    assert MIRROR in text
    path.write_text(text.replace(MIRROR, "    float ax = unit_mirror_axis->x * f;\n    a->x += ax;\n"
                                         "    a->y += unit_mirror_axis->y * f;\n"))
    mw, res = explain(root, tmp_path, "lbVector_Mirror")
    unit_record = next(iter(mw["fidelity"]["units"].values()))
    cand = unit_record["builds"]["cand"]
    assert cand["depfile"] == "ok" and "src/melee/lb/lbvector.c" in cand["deps"]
    assert any(k.endswith(".h") for k in cand["deps"]), sorted(cand["deps"])[:10]
    assert unit_record["compile"]["mw_version"].startswith("GC/") and unit_record["compile"]["compiler"]["sha1"]
    assert res["status"] == "ok", res
    delta = res["compiler_delta"]
    assert delta["summary_lines"] and delta["observation_id"] == 11 and delta["stock"]["code_class"] != "identical"
    probe = res["probe"]
    assert probe["compiler_delta"]["summary_lines"] and probe["hypotheses_basis"].startswith("shape table")
    assert len(json.dumps(probe, separators=(",", ":"))) <= 3072


@pytest.mark.skipif(not (READY and MELEE.is_dir()), reason="needs MWCC_NATIVE_TEST_ROOT, a wibo runner and the Melee checkout")
def test_real_dependency_drift_is_unavailable_never_a_delta(tmp_path: Path) -> None:
    root = scratch_clone(MELEE, "GALE01", tmp_path)
    path = root / "src/melee/lb/lbvector.c"
    path.write_text(path.read_text().replace(MIRROR, MIRROR.replace("unit_mirror_axis->y * f", "f * unit_mirror_axis->y")))

    def drift(unit_record: dict) -> None:  # the gate read another header than this checkout holds
        for build in unit_record["builds"].values():
            header = next(k for k in sorted(build["deps"]) if k.endswith(".h"))
            build["deps"][header] = "0" * 64

    _, res = explain(root, tmp_path, "lbVector_Mirror", mutate=drift)
    assert res["status"] == "unavailable", res
    assert res["compiler_delta"]["unavailable"].startswith("reconstruction: dependency differs from the gate's")
    assert "summary_lines" not in res["compiler_delta"]
    assert res["probe"]["compiler_delta"] == res["compiler_delta"]


@pytest.mark.skipif(not (READY and SMS.is_dir()), reason="needs MWCC_NATIVE_TEST_ROOT, a wibo runner and the SMS checkout")
def test_real_cpp_method_rebuilds_verifies_and_diffs(tmp_path: Path) -> None:
    root = scratch_clone(SMS, "GMSJ01", tmp_path)
    path = root / "src/Enemy/bosseel.cpp"
    text = path.read_text()
    pair = "\t\tmEyes[eyeIndex]->setBckAnm(1);\n\t\tmEyes[eyeIndex]->mPairedEye->setBckAnm(1);\n"
    assert pair in text
    swapped = "\t\tmEyes[eyeIndex]->mPairedEye->setBckAnm(1);\n\t\tmEyes[eyeIndex]->setBckAnm(1);\n"
    path.write_text(text.replace(pair, swapped, 1))  # call order changes the code: S* differs from the candidate
    _, res = explain(root, tmp_path, "updateTearsCnt__8TBossEelFv")
    assert res["status"] == "ok", res
    delta = res["compiler_delta"]
    assert delta["summary_lines"] and delta["version"] == "1.2.5" and delta["stock"]["code_class"] != "identical"


# --------------------------------------------------------------------------
# The probe with a measured delta (plan 3.4.2)
# --------------------------------------------------------------------------

import steering_diagnose as sd  # noqa: E402

DELTA = {
    "summary_lines": ["gpr pass 0: +1 node `probe` (src/Enemy/bosseel.cpp:812, local), coalesced neighbour of `this`",
                      "gpr pass 0: `this` degree 28 -> 29; coloured first; r28 -> r31"],
    "changes": [{"kind": "node_added", "summary": "gpr pass 0: +1 node `probe`", "match": "by_site", "a": None, "b": {"vreg": 41}},
                {"kind": "degree", "summary": "gpr pass 0: `this` degree 28 -> 29", "match": "exact", "a": {"vreg": 32}, "b": {"vreg": 32}},
                {"kind": "register", "summary": "gpr pass 0: `this` r28 -> r31", "match": "exact", "a": {}, "b": {}}],
    "change_counts": {"node_added": 1, "degree": 1, "register": 1},
    "version": "1.2.5", "observation_id": 7, "variant": "global", "label": "gate",
}


def big_probe(groups: int = 8) -> dict:
    return sd.build_probe(
        {"name": "updateTearsCnt__8TBossEelFv", "demangled": "TBossEel::updateTearsCnt()", "unit": "Enemy/bosseel",
         "decision": "steering_located", "match": {"base": 90.0, "candidate": 100.0, "real_only": 95.5}},
        [{"id": f"g{i}", "status": "removable", "file": "src/Enemy/bosseel.cpp", "line": 800 + i,
          "shapes": ["temp_alias", "decl_reorder", "operand_order"], "base_lines": ["x" * 150], "cand_lines": ["y" * 150]}
         for i in range(groups)], {"attribution": [{"group": f"g{i}", "delta": 1.0} for i in range(groups)]}, prefetch=False)


def test_a_measured_delta_leads_with_candidates_then_the_shape_fallback() -> None:
    probe = sd.apply_compiler_delta(big_probe(2), DELTA)
    keys = list(probe)
    assert keys.index("compiler_delta") < keys.index("candidate_constructs") < keys.index("hypotheses")
    assert probe["compiler_delta"]["summary_lines"] == DELTA["summary_lines"]
    assert all("a" not in c and "b" not in c for c in probe["compiler_delta"]["changes"])  # raw ids stay in the job row
    rows, kinds = probe["candidate_constructs"], probe["construct_kinds"]
    assert [r["change_kind"] for r in rows] == ["node_added", "degree", "register"]
    assert set(rows[0]["kinds"]) >= {"web split", "CSE birth"} and rows[1]["kinds"][0] == "degree limit"
    assert kinds["degree limit"] == {"why": sd.CONSTRUCT_KINDS["degree"][0][1], "see": "#the-degree-limit-this-in-r31-instead-of-r28",
                                     "mwcc": "Coloring.c"}
    assert set(kinds) == {k for r in rows for k in r["kinds"]}  # each fact once
    assert probe["candidate_basis"].startswith("candidate construct kinds") and probe["hypotheses_basis"].startswith("shape table")
    assert len(json.dumps(probe, separators=(",", ":"))) <= sd.PROBE_LIMIT


def test_fit_keeps_the_measured_summary_and_drops_detail_first() -> None:
    delta = {**DELTA, "summary_lines": [f"gpr pass 0: change {i} " + "z" * 60 for i in range(12)],
             "changes": [{"kind": "register", "summary": f"r{i} " + "q" * 120, "match": "exact", "a": {"x": "w" * 50}}
                         for i in range(12)]}
    probe = sd.apply_compiler_delta(big_probe(), delta)
    assert len(json.dumps(probe, separators=(",", ":"))) <= sd.PROBE_LIMIT
    assert probe["compiler_delta"]["summary_lines"] == delta["summary_lines"]  # all 12 lines survive
    assert probe["compiler_delta"].get("changes_omitted") and probe["compiler_delta"]["change_counts"]  # tally kept
    assert probe.get("hypotheses", []) == [] or len(probe["hypotheses"]) <= 1  # the fallback went before the summary
    huge = {**delta, "summary_lines": ["x" * 200 for _ in range(40)]}
    small = sd.apply_compiler_delta(big_probe(), huge)
    assert len(json.dumps(small, separators=(",", ":"))) <= sd.PROBE_LIMIT
    assert small["compiler_delta"]["summary_lines"] and small["compiler_delta"].get("summary_lines_truncated")


def test_an_unavailable_delta_is_recorded_and_never_an_empty_one() -> None:
    before = big_probe()
    probe = sd.apply_compiler_delta(before, {"unavailable": "no traced build for GC/1.1p1"})
    assert probe["compiler_delta"] == {"unavailable": "no traced build for GC/1.1p1"}
    assert "candidate_constructs" not in probe and probe["hypotheses"] == before["hypotheses"]
    assert sd.construct_candidates({"unavailable": "x"}) == ([], {}) and not sd.delta_present({"changes": []})


def test_build_probe_takes_the_delta_directly() -> None:
    fn = {"name": "f", "unit": "u", "decision": "steering_located", "match": {}}
    probe = sd.build_probe(fn, [], None, prefetch=False, compiler_delta=DELTA)
    assert probe["compiler_delta"]["summary_lines"] == DELTA["summary_lines"] and probe["candidate_constructs"]
    assert "compiler_delta" not in sd.build_probe(fn, [], None, prefetch=False)  # no delta: today's probe


EXPLAIN_FIXTURE = TOOLS.parents[4] / "apps/server/src/core/validation/steering/__fixtures__/explain-check.json"


def test_committed_explain_fixture_still_prepares(toolchain) -> None:
    """The check report the server's steering-explain job test feeds the real `prepare`
    (regenerate with STEERING_WRITE_FIXTURES=1 after a format change)."""
    if os.environ.get("STEERING_WRITE_FIXTURES") == "1" or not EXPLAIN_FIXTURE.is_file():
        repo, tmp, _ = toolchain
        edits, red, mw, dec = gate(repo, tmp)
        text = json.dumps({"edits": edits, "reduce": red, "mwcc": mw, "decision": dec}, indent=1) + "\n"
        EXPLAIN_FIXTURE.write_text(text.replace(str(repo), "<repo>").replace(str(tmp), "<tmp>"))
    check = json.loads(EXPLAIN_FIXTURE.read_text())
    out = sx.prepare(check["edits"], check["mwcc"], check["decision"], unit="u1", function="g", observation_id=1)
    assert out["status"] == "ok", out


def test_fit_drops_change_details_before_any_summary_line() -> None:
    """Review F r1 #3: the summary alone fits, the summary plus the changes does not."""
    lines = [f"gpr pass {i // 4}: node v{40 + i:03d} `local_variable_{i:02d}` (src/Enemy/bosseel.cpp:{100 + i}) degree {20 + i} -> {21 + i}"
             for i in range(30)]
    assert len(json.dumps(lines)) < sd.PROBE_LIMIT - 300 < len(json.dumps(lines)) + 30 * len("{\"kind\":\"degree\"},") - 300
    delta = {**DELTA, "summary_lines": lines, "change_counts": {"degree": 30},
             "changes": [{"kind": "degree", "summary": line, "match": "by_site"} for line in lines]}
    probe = sd.apply_compiler_delta({"function": "f", "unit": "u", "decision": "steering_located", "match": {}}, delta)
    assert len(json.dumps(probe, separators=(",", ":"))) <= sd.PROBE_LIMIT
    assert probe["compiler_delta"]["summary_lines"] == lines
    assert "changes" not in probe["compiler_delta"] and probe["compiler_delta"]["changes_omitted"]


def test_decide_records_steering_sstar_when_both_variants_apply(monkeypatch) -> None:
    """Review F r1 #1: a kept map call (evidence S*) and a steering-only retained group (steering S*):
    the verdict's real_only comes from the steering S*, and so must the fidelity record."""
    monkeypatch.setattr(sc, "_map_confirms", lambda *a, **k: True)
    exact = {"status": "exact", "match_percent": 100.0}
    red = {"edits_hash": "h", "base_rev": "r", "analysis": "complete", "global_incomplete": [], "changed_files": ["src/a.c"],
           "units": [{"unit": "u1", "ok": True}], "groups": [
               {"id": "g1", "status": "removable", "file": "src/a.c", "units": ["u1"], "functions": ["f"],
                "shapes": ["call_added"], "real_shapes": [], "new_calls": ["foo"], "edit_ids": ["e1"], "ir_functions": ["f"]},
               {"id": "g2", "status": "unresolved", "file": "src/a.c", "units": ["u1"], "functions": ["f"],
                "shapes": ["temp_alias"], "real_shapes": [], "edit_ids": ["e2"], "ir_functions": ["f"], "reason": "steering"}]}
    builds = {"cand": {"obj_sha256": "c", "deps": {"src/a.c": "x"}, "deps_sha256": "dc", "depfile": "ok", "revert_ids": []},
              "sstar": {"obj_sha256": "s", "deps": {"src/a.c": "y"}, "deps_sha256": "ds", "depfile": "ok", "revert_ids": ["e1", "e2"]},
              "sstar_evidence": {"obj_sha256": "e", "deps": {"src/a.c": "z"}, "deps_sha256": "de", "depfile": "ok", "revert_ids": ["e2"]},
              "sstar_steering": {"obj_sha256": "t", "deps": {"src/a.c": "w"}, "deps_sha256": "dt", "depfile": "ok",
                                 "revert_ids": ["e1", "e2"]}}
    mw = {"edits_hash": "h", "base_rev": "r", "changed_files": ["src/a.c"], "missing_functions": [],
          "coverage": [{"unit": "u1", "built": {"base": "ok", "candidate": "ok", "sstar": "ok"}, "compared": True}],
          "functions": [{"unit": "u1", "name": "f", "demangled": "f", "target_name": "f", "base": exact, "candidate": exact,
                         "real_only": {"status": "mismatch", "match_percent": 90.0}, "sstar_vs_candidate": "code",
                         "target_relocs": ["foo"], "candidate_relocs": ["foo"], "sstar_relocs": [], "attribution": [],
                         "call_evidence": [{"group": "g1", "callee": "foo", "target": 1, "sstar": 0, "with": 1, "relocs_ok": True}],
                         "evidence_sstar": {"groups": ["g1"], "real_only": {"status": "mismatch", "match_percent": 99.0},
                                            "sstar_vs_candidate": "identical"},
                         "steering_sstar": {"groups": ["g2"], "real_only": {"status": "mismatch", "match_percent": 97.0},
                                            "sstar_vs_candidate": "code"}}],
          "group_touch": {}, "data_evidence": [], "unused_checks": [], "unused_map": {}, "errors": [],
          "fidelity": {"schema": sc.FIDELITY_SCHEMA, "units": {"u1": {"compile": {"mw_version": "GC/1.2.5"}, "builds": builds}}}}
    row = sc.decide(red, mw, approvals=[], probes=False)["functions"][0]
    assert row["evidence_sstar"] and row["steering_sstar"] and row["match"]["real_only"] == 97.0
    assert row["sstar_variant"] == "steering_sstar"
    assert row["fidelity"]["sstar"]["build"] == "sstar_steering" and row["fidelity"]["sstar"]["obj_sha256"] == "t"


INPUT = {"candidate": {"obj_sha256": "ca"}, "sstar": {"obj_sha256": "sb"}}


@pytest.mark.parametrize("res, reason", [
    ({"status": "no_decisions_traced", "variants_without_decisions": ["b"], "summary": "no events",
      "stock": {"a_obj_sha": "ca", "b_obj_sha": "sb"}}, "no decisions traced for f (S*): no events"),
    ({"status": "no_decisions_traced", "stock": {"a_obj_sha": "ca", "b_obj_sha": "zz"}},
     "reconstruction: the rebuilt S* object differs from the gate's (sb recorded, zz rebuilt)"),
    ({"status": "function_not_found", "error": "f not in trace"}, "no decisions traced for f: f not in trace"),
    ({"status": "trace_invalid", "error": "bad line 3"}, "trace-invalid: bad line 3"),
    ({"status": "unit_build_failed", "variant": "b", "error": "x.c:1 error"},
     "reconstruction: the rebuilt S* does not compile: x.c:1 error"),
    ({"status": "unavailable", "unavailable": "traced-object-mismatch"}, "traced-object-mismatch"),
    ({"status": "invalid_arguments", "error": "--out exists"}, "compare_sources invalid_arguments: --out exists"),
    ({"status": "internal_error", "error": "KeyError: x"}, "compare_sources internal_error: KeyError: x"),
    ({"status": "something_new"}, "compare_sources something_new"),
])
def test_every_terminal_compare_status_publishes_unavailable(res, reason) -> None:
    """Review F r1 #2: a terminal compare_sources status is published, never retried until the job gives up."""
    assert sx._compare_reason(res, "f", INPUT) == {"unavailable": reason}


def test_only_a_compare_timeout_is_retried() -> None:
    assert sx._compare_reason({"status": "unavailable", "unavailable": "timeout"}, "f", INPUT) is None
