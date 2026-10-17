"""The UNUSED stub test (objectives/sms-real-codegen/unused-rule.md).

Fake MWCC from test_steering_pipeline (toy compiler) with optional inlining:
a function named in `inline` has its body pasted over every `name();` call
line before the toy compiler runs, as MWCC inlines a small function into its
callers in the same TU. The `@needs_sandbox` cases run the real tool against
the read-only SMS sandbox at upstream 7fed828b with overlays.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_check as sc  # noqa: E402
import steering_edits as se  # noqa: E402
from test_steering_check import FakeOracle, fake_classify, fake_units, git_repo  # noqa: E402
from test_steering_pipeline import FakeMwcc  # noqa: E402


class InliningMwcc(FakeMwcc):
    def __init__(self, *a, inline: tuple[str, ...] = (), fail_labels: tuple[str, ...] = (), **kw):
        super().__init__(*a, **kw)
        self.inline = set(inline)
        self.fail_labels = set(fail_labels)

    def compile(self, unit, texts, label):
        if label in self.fail_labels:
            self.built.append((unit.name, label))
            return False, None, f"fake MWCC error in {label}"
        text = se.decode(texts.get(unit.source))
        if text is not None and self.inline:
            bodies = {m.group(1): m.group(2) for m in re.finditer(r"^void (\w+)\(\)\n\{\n(.*?)^\}", text, re.M | re.S)
                      if m.group(1) in self.inline}
            for name, body in bodies.items():
                text = re.sub(rf"^[ \t]*{name}\(\)[^\n]*\n", lambda _m, b=body: b, text, flags=re.M)
            texts = dict(texts, **{unit.source: se.encode(text)})
        return super().compile(unit, texts, label)


def fn(name: str, body: list[str]) -> str:
    return f"void {name}()\n{{\n" + "".join(f"    {line}\n" for line in body) + "}\n"


BASE = fn("g", ["a();", "h();"]) + fn("h", [])
CAND = fn("g", ["a();", "h();"]) + fn("h", ["x(1) REAL;", "y(2) REAL;"])
TARGET_INLINED = fn("g", ["a();", "x(1);", "y(2);"])  # h inlined into g, then dead-stripped
TARGET_DEAD = fn("g", ["a();"])  # h's empty body inlined: nothing left


@pytest.fixture
def repo(tmp_path, monkeypatch):
    monkeypatch.setattr(sc, "classify", fake_classify)
    r = git_repo(tmp_path, {"src/a.c": BASE})
    (r / "src/a.c").write_text(CAND)
    return r


def pipeline(repo: Path, tmp: Path, target: str, *, unused=None, inline=(), fail_labels=()) -> tuple[dict, dict, dict]:
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    red = sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    backend = InliningMwcc(tmp / "m", target, unused={"u1": ["h__Fv"]} if unused is None else (unused or None),
                           inline=inline, fail_labels=fail_labels)
    mw = json.loads(json.dumps(sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red),
                                           attribute=red, jobs=1, backend=backend)))
    dec = sc.decide(red, mw, probes=False)
    return edits, mw, dec


def test_dead_body_is_a_rule_violation(repo, tmp_path) -> None:
    edits, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD)
    [check] = mw["unused_checks"]
    assert check["status"] == "dead" and check["function"] == "h(void)" and check["mangled"] == "h__Fv"
    assert check["stub"] == "{ }" and check["changed"] == [] and check["line"] == 6
    assert dec["attempt"] == "rule_violation"
    assert dec["violations"] == [{"kind": "dead_unused_body", "unit": "u1", "file": "src/a.c",
                                  "function": "h(void)", "line": 6}]
    assert any("dead UNUSED bodies" in r for r in dec["reasons"])


def test_inlined_body_is_allowed_with_callers_as_evidence(repo, tmp_path) -> None:
    _, mw, dec = pipeline(repo, tmp_path, TARGET_INLINED, inline=("h",))
    [check] = mw["unused_checks"]
    assert check["status"] == "inlined"
    [changed] = check["changed"]
    assert changed["function"] == "g" and changed["before"]["status"] == "exact"
    assert changed["after"]["status"] == "mismatch" and changed["after"]["match_percent"] < 100.0
    [caller] = check["callers"]
    assert caller["function"] == "g" and caller["delta"] == round(changed["after"]["match_percent"] - 100.0, 4) < 0
    assert dec["violations"] == [] and dec["attempt"] == "pass"


def test_worse_caller_that_calls_f_out_of_line_is_inconclusive(repo, tmp_path) -> None:
    # the original g still calls h: an UNUSED h cannot be called, so the evidence is contradictory
    _, mw, dec = pipeline(repo, tmp_path, fn("g", ["a();", "x(1);", "y(2);", "h();"]), inline=("h",))
    [check] = mw["unused_checks"]
    assert check["status"] == "inconclusive" and "out of line" in check["reason"]
    assert check["callers"] == [] and check["changed"][0]["function"] == "g"
    assert dec["attempt"] == "unresolved"


def test_changes_that_only_improve_are_inconclusive(repo, tmp_path) -> None:
    # the original g has nothing of h: inlining the body makes g worse, stubbing it improves g
    _, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD, inline=("h",))
    [check] = mw["unused_checks"]
    assert check["status"] == "inconclusive" and "only improves" in check["reason"]
    assert check["callers"] == [] and check["changed"][0]["after"]["status"] == "exact"
    assert dec["attempt"] == "unresolved" and dec["violations"] == []


def test_checks_are_bound_to_the_patch(repo, tmp_path) -> None:
    edits, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD)
    [check] = mw["unused_checks"]
    assert check["base_rev"] == edits["base_rev"] and check["edits_hash"] == edits["edits_hash"]
    body = "{\n    x(1) REAL;\n    y(2) REAL;\n}"
    assert check["body_sha256"] == hashlib.sha256(body.encode()).hexdigest()
    assert dec["unused_checks"][0]["body_sha256"] == check["body_sha256"]


def test_stub_build_failure_is_inconclusive(repo, tmp_path) -> None:
    _, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD, fail_labels=("unused",))
    [check] = mw["unused_checks"]
    assert check["status"] == "inconclusive" and "stub build failed" in check["reason"]
    assert dec["attempt"] == "unresolved" and dec["violations"] == []
    assert any("UNUSED stub test inconclusive" in r for r in dec["reasons"])


def test_not_unused_or_no_map_is_not_checked(repo, tmp_path) -> None:
    _, mw, dec = pipeline(repo, tmp_path / "a", TARGET_DEAD, unused={"u1": ["other__Fv"]})
    assert mw["unused_checks"] == [] and dec["attempt"] == "pass"
    _, mw, _ = pipeline(repo, tmp_path / "b", TARGET_DEAD, unused={})
    assert mw["unused_checks"] == []


def test_non_trivial_base_body_is_not_checked(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(sc, "classify", fake_classify)
    repo = git_repo(tmp_path, {"src/a.c": fn("g", ["a();"]) + fn("h", ["x(1);"])})
    (repo / "src/a.c").write_text(fn("g", ["a();"]) + fn("h", ["x(2) REAL;"]))
    _, mw, _ = pipeline(repo, tmp_path, TARGET_DEAD)
    assert mw["unused_checks"] == []


def test_absent_in_base_is_checked(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(sc, "classify", fake_classify)
    repo = git_repo(tmp_path, {"src/a.c": fn("g", ["a();"])})
    (repo / "src/a.c").write_text(fn("g", ["a();"]) + fn("h", ["x(2) REAL;"]))
    _, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD)
    assert [c["status"] for c in mw["unused_checks"]] == ["dead"] and dec["attempt"] == "rule_violation"


def test_other_verdicts_keep_their_kind_with_violations(repo, tmp_path) -> None:
    edits, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD)
    red = {"edits_hash": edits["edits_hash"], "analysis": "complete", "incomplete_reasons": [], "global_incomplete": [],
           "groups": [{"id": "g1", "status": "removable", "file": "src/a.c", "units": ["u1"], "functions": ["g"],
                       "shapes": ["temp_alias"], "real_shapes": [], "edit_ids": []}], "units": []}
    dec = sc.decide(red, mw, probes=False)
    assert dec["attempt"] == "steering_located" and len(dec["violations"]) == 1
    mw2 = dict(mw, unused_checks=mw["unused_checks"] + [dict(mw["unused_checks"][0], status="inconclusive",
                                                               function="k(void)", mangled="k__Fv")])
    dec = sc.decide(red, mw2, probes=False)
    assert dec["attempt"] == "unresolved" and len(dec["violations"]) == 1


def test_apply_restores_base_stub_or_removes_definition(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(sc, "classify", fake_classify)
    for base, want in ((BASE, BASE), (fn("g", ["a();", "h();"]), fn("g", ["a();", "h();"]))):
        root = tmp_path / str(len(base))
        root.mkdir()
        repo = git_repo(root, {"src/a.c": base})
        (repo / "src/a.c").write_text(CAND)
        _, mw, dec = pipeline(repo, root, TARGET_DEAD)
        assert dec["attempt"] == "rule_violation"
        edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
        report = {"edits": sc.omit_texts(edits), "reduce": {"groups": []}, "mwcc": mw, "decision": dec}
        dry = sc.run_apply(report, dry_run=True)
        assert dry["files"][0]["unused_restored"] == ["h"] and (repo / "src/a.c").read_text() == CAND
        sc.run_apply(report, dry_run=False)
        assert (repo / "src/a.c").read_text() == want


def test_trivial_bodies() -> None:
    text = """
int A::a() { return 0; }
void A::b() { return; }
void A::c() { /* empty */ }
bool A::d() { return FALSE; }
f32 A::e() { return -1.5f; }
int A::f() { return mX; }
void A::g() { foo(); }
const char* A::h() { return "x;y"; }
int A::i() { return ++COUNTER; }
int A::j() { return FOO(); }
int A::k() { return *PTR; }
int A::l() { return (s32)(FLAG_A | FLAG_B) << 2; }
int A::m() { return OBJ.field; }
int A::n() { return -(int)0x10; }
"""
    triv = {d.qualified: d.trivial for d in sc.function_defs(text)}
    assert triv == {"A::a": True, "A::b": True, "A::c": True, "A::d": True, "A::e": True,
                    "A::f": False, "A::g": False, "A::h": True, "A::i": False, "A::j": False, "A::k": False,
                    "A::l": True, "A::m": False, "A::n": True}


def test_non_void_stub_keeps_signature_and_lines() -> None:
    text = "int T::f(int x)\n{\n    int y = x * 2;\n    return y;\n}\nT::T() : m(0) {\n    init();\n}\nT::~T() { fini(); }\n"
    defs = {d.qualified: d for d in sc.function_defs(text)}
    assert not defs["T::f"].void and defs["T::T"].void and defs["T::~T"].void
    stubbed, label = sc.stub_definition(text, defs["T::f"])
    assert label == "{ return 0; }"
    assert stubbed.startswith("int T::f(int x)\n{ return 0;\n\n\n}") and stubbed.count("\n") == text.count("\n")
    stubbed, label = sc.stub_definition(text, defs["T::~T"])
    assert label == "{ }" and "T::~T() { }" in stubbed


def test_in_class_definitions_and_comments() -> None:
    text = "class T {\npublic:\n    void f() { /* } */ g(\"}\"); }\n    int k() const { return 1; }\n};\n"
    defs = {d.qualified: d for d in sc.function_defs(text)}
    assert set(defs) == {"T::f", "T::k"} and not defs["T::f"].trivial and defs["T::k"].trivial


def test_overloads_are_disambiguated_by_parameters() -> None:
    base = "void T::f(int a) { }\nvoid T::f(float a) { }\nvoid T::f(const char* s, int n) { }\n"
    cand = ("void T::f(int a) { use(a); }\nvoid T::f(float a) { use2(a); }\n"
            "void T::f(const char* s, int n) { use3(s); }\n")
    pick = lambda m: [(c["def"].line, c["symbol"]["mangled"]) for c in  # noqa: E731
                      sc.unused_candidates(base, cand, [sc.demangled_symbol(m)])]
    assert pick("f__1TFi") == [(1, "f__1TFi")]
    assert pick("f__1TFf") == [(2, "f__1TFf")]
    assert pick("f__1TFPCci") == [(3, "f__1TFPCci")]
    assert pick("f__1TFUc") == []  # exact identity: f(unsigned char) is neither f(int) nor f(float)
    assert pick("f__1TFv") == []
    assert pick("f__1TFl") == []  # long is not int (no folding)


def test_unused_test_command_on_a_plain_checkout(repo, tmp_path) -> None:
    backend = InliningMwcc(tmp_path / "m", TARGET_INLINED, unused={"u1": ["h__Fv"]}, inline=("h",), repo=repo)
    out = sc.run_unused_test(repo, "HEAD", "src/a.c", "h", backend=backend)
    assert out["status"] == "inlined" and out["map"] == {"available": True, "unused": True, "mangled": ["h__Fv"]}
    assert out["checks"][0]["base"] == "trivial" and out["checks"][0]["callers"][0]["function"] == "g"
    assert out["checks"][0]["edits_hash"] == sc.build_edits(repo, "HEAD", unit_resolver=fake_units)["edits_hash"]
    backend = InliningMwcc(tmp_path / "m2", TARGET_DEAD, unused=None, repo=repo)
    out = sc.run_unused_test(repo, "HEAD", "src/a.c", "h()", backend=backend)
    assert out["status"] == "dead" and out["map"]["available"] is False
    assert (repo / "src/a.c").read_text() == CAND  # never writes the repo
    with pytest.raises(sc.ToolFailure, match="no definition"):
        sc.run_unused_test(repo, "HEAD", "src/a.c", "nope", backend=backend)


# --------------------------------------------------------------------------
# Real SMS sandbox (read-only), upstream 7fed828b, bodies from sb-c1 adffbc21
# --------------------------------------------------------------------------

SANDBOX = Path(os.environ.get(
    "STEERING_SMS_SANDBOX",
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up7f",
))
UPSTREAM, BODIES = "7fed828b", "adffbc21"


def _sandbox_git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(SANDBOX), *args], capture_output=True, check=check)


def _sandbox_ready() -> bool:
    if not all((SANDBOX / rel).exists() for rel in ("build.ninja", "build/tools/objdiff-cli", "build/GMSJ01/obj", ".git")):
        return False
    return all(_sandbox_git("cat-file", "-e", f"{rev}^{{commit}}", check=False).returncode == 0
               for rev in (UPSTREAM, BODIES))


needs_sandbox = pytest.mark.skipif(not _sandbox_ready(), reason="needs the SMS sandbox at upstream 7fed828b "
                                   "with adffbc21 objects (set STEERING_SMS_SANDBOX)")


@pytest.fixture(scope="module")
def sandbox_bound():
    import importlib

    old = os.environ.get("ORCH_GAME_REPO_ROOT")
    os.environ["ORCH_GAME_REPO_ROOT"] = str(SANDBOX.resolve())
    if "ninja_compile" in sys.modules:
        importlib.reload(sys.modules["ninja_compile"])
    state = (_sandbox_git("rev-parse", "HEAD").stdout, _sandbox_git("status", "--porcelain").stdout)
    yield
    assert (_sandbox_git("rev-parse", "HEAD").stdout, _sandbox_git("status", "--porcelain").stdout) == state
    if old is None:
        os.environ.pop("ORCH_GAME_REPO_ROOT", None)
    else:
        os.environ["ORCH_GAME_REPO_ROOT"] = old
    if "ninja_compile" in sys.modules:
        importlib.reload(sys.modules["ninja_compile"])


def body_overlay(tmp: Path, rel: str, qualified: str) -> Path:
    """Upstream file with the single function body taken from adffbc21."""
    up = _sandbox_git("show", f"{UPSTREAM}:{rel}").stdout.decode()
    sb = _sandbox_git("show", f"{BODIES}:{rel}").stdout.decode()
    [u] = [d for d in sc.function_defs(up) if d.qualified == qualified]
    [s] = [d for d in sc.function_defs(sb) if d.qualified == qualified]
    root = tmp / "overlay"
    (root / rel).parent.mkdir(parents=True, exist_ok=True)
    (root / rel).write_text(up[:u.start] + sb[s.start:s.close + 1] + up[u.close + 1:])
    return root


@needs_sandbox
def test_real_emit_effect_is_dead(sandbox_bound, tmp_path) -> None:
    rel = "src/Map/MapEventMare.cpp"
    overlay = body_overlay(tmp_path, rel, "TMareEventDepressWall::emitEffect")
    out = sc.run_unused_test(SANDBOX, UPSTREAM, rel, "TMareEventDepressWall::emitEffect(int)",
                             overlay_dir=overlay, jobs=3, tmp=str(tmp_path / "shadow"))
    assert out["map"]["mangled"] == ["emitEffect__21TMareEventDepressWallFi"]
    [check] = out["checks"]
    assert check["status"] == "dead" and check["base"] == "trivial" and check["changed"] == []
    # the gate's mwcc step finds the same and decide makes it a violation
    edits = sc.build_edits(SANDBOX, UPSTREAM, overlay_dir=overlay)
    mw = sc.run_mwcc(SANDBOX, UPSTREAM, edits["edits_hash"], [], overlay_dir=overlay, jobs=3,
                     tmp=str(tmp_path / "shadow2"))
    [row] = mw["unused_checks"]
    assert row["status"] == "dead" and row["mangled"] == "emitEffect__21TMareEventDepressWallFi"
    red = {"edits_hash": edits["edits_hash"], "analysis": "complete", "incomplete_reasons": [],
           "global_incomplete": [], "groups": [], "units": []}
    dec = sc.decide(red, mw, probes=False)
    assert dec["attempt"] == "rule_violation", dec["reasons"]
    assert dec["violations"][0]["function"] == "TMareEventDepressWall::emitEffect(int)"


@needs_sandbox
def test_real_rolling_is_inlined(sandbox_bound, tmp_path) -> None:
    rel = "src/Enemy/chuuhana.cpp"
    overlay = body_overlay(tmp_path, rel, "TChuuHana::rolling")
    out = sc.run_unused_test(SANDBOX, UPSTREAM, rel, "TChuuHana::rolling()", overlay_dir=overlay, jobs=3,
                             tmp=str(tmp_path / "shadow"))
    [check] = out["checks"]
    assert check["status"] == "inlined", check
    changed = {c["function"]: c for c in check["changed"]}
    roll = next(v for k, v in changed.items() if k.startswith("TNerveChuuHanaRoll::execute"))
    assert roll["after"]["match_percent"] < roll["before"]["match_percent"] - 20
    callers = {c["function"]: c for c in check["callers"]}
    roll = next(v for k, v in callers.items() if k.startswith("TNerveChuuHanaRoll::execute"))
    assert roll["delta"] < -20 and check["body_sha256"] and check["base_rev"].startswith(UPSTREAM)
    print("rolling callers:", [(c["function"], c["before"], c["after"], c["delta"]) for c in check["callers"]])


def test_known_different_base_signature_is_another_overload() -> None:
    # base has a real T::f(float); the candidate adds UNUSED T::f(int): a reconstruction, not exempt
    base = "void T::f(float a) { use(a); }\n"
    cand = base + "void T::f(int a) { use2(a); }\n"
    rows = sc.unused_candidates(base, cand, [sc.demangled_symbol("f__1TFi")])
    assert [(r["def"].line, r.get("unresolved")) for r in rows] == [(2, None)]
    # same signature in the base with a body: not a reconstruction
    assert sc.unused_candidates("void T::f(int a) { use(a); }\n", "void T::f(int a) { use3(a); }\n",
                                [sc.demangled_symbol("f__1TFi")]) == []


def test_undecidable_base_identity_is_inconclusive(tmp_path) -> None:
    # a templated base body cannot be identified with f(int) exactly: the reconstruction is tested but unresolved
    base = "template <typename X> void T::f(X a) { use(a); }\n"
    cand = base + "void T::f(int a) { use2(a); }\n"
    rows = sc.unused_candidates(base, cand, [sc.demangled_symbol("f__1TFi")])
    assert [(r["def"].line, bool(r.get("unresolved"))) for r in rows] == [(2, True)]
    # an undecidable candidate definition (templated) is unresolved too
    rows = sc.unused_candidates("", "template <typename X> void T::f(X a) { use(a); }\n", [sc.demangled_symbol("f__1TFi")])
    assert [bool(r.get("unresolved")) for r in rows] == [True]

def test_rows_bind_unit_inputs(repo, tmp_path) -> None:
    _, mw, _ = pipeline(repo, tmp_path, TARGET_DEAD)
    [check] = mw["unused_checks"]
    assert check["unit_inputs"] == ["src/a.c"]
    assert check["unit_inputs_sha256"] == sc.unit_inputs_sha256(["src/a.c"], lambda p: CAND.encode())


def test_missing_map_coverage_is_incomplete_when_required(repo, tmp_path, monkeypatch) -> None:
    edits, mw, dec = pipeline(repo, tmp_path, TARGET_DEAD, unused=False)  # no link map
    assert mw["unused_checks"] == [] and mw["unused_map"]["u1"]["available"] is False
    assert dec["attempt"] == "pass"  # no map expected (not SMS, no ORCH_LINK_MAP_REQUIRED)
    monkeypatch.setenv("ORCH_LINK_MAP_REQUIRED", "1")
    red = {"edits_hash": edits["edits_hash"], "analysis": "complete", "incomplete_reasons": [], "global_incomplete": [],
           "groups": [], "units": []}
    dec = sc.decide(red, mw, probes=False)
    assert dec["attempt"] == "unresolved" and any("link-map coverage" in r for r in dec["reasons"])
    # The backfill reads the category, not the wording: the function rows can all pass.
    assert [i for i in dec["attempt_issues"] if i["category"] == "unused_map_gap"] == [
        {"category": "unused_map_gap", "units": ["u1"], "groups": [], "files": [], "detail": dec["attempt_issues"][-1]["detail"]}]
    assert all(f["decision"] == "pass" for f in dec["functions"])


def test_link_map_required_policy(tmp_path) -> None:
    import game_policy

    game = tmp_path / "g"
    game.mkdir()
    (game / "game.json").write_text(json.dumps({"kind": "doldecomp-sms", "matching": {"steeringGate": "shadow"}}))
    assert game_policy.link_map_required({"ORCH_GAME_DIR": str(game)})
    assert not game_policy.link_map_required({"ORCH_GAME_DIR": str(game), "ORCH_LINK_MAP_REQUIRED": "0"})
    (game / "game.json").write_text(json.dumps({"kind": "doldecomp-melee"}))
    assert not game_policy.link_map_required({"ORCH_GAME_DIR": str(game)})


def test_the_stubbed_function_is_not_its_own_caller(repo, tmp_path) -> None:
    # a target that (wrongly) still contains h: h getting worse is not inline evidence
    target = fn("g", ["a();"]) + fn("h", ["x(1);", "y(2);"])
    _, mw, _ = pipeline(repo, tmp_path, target)
    [check] = mw["unused_checks"]
    assert check["status"] != "inlined" and all(c["function"] != "h" for c in check["callers"])


def test_unknown_typedef_in_candidate_makes_the_gate_inconclusive(tmp_path) -> None:
    # MyInt is declared nowhere: the candidate may be the UNUSED f(int); it must be checked, not skipped
    cand = "void T::f(MyInt a)\n{\n    use(a);\n}\n"
    rows = sc.unused_candidates("", cand, [sc.demangled_symbol("f__1TFi")])
    assert [(r["def"].line, bool(r.get("unresolved"))) for r in rows] == [(1, True)]

    class Backend:
        jobs = 1

        def unused(self, unit, base_rev):
            return [sc.demangled_symbol("f__1TFi")]

        def compile(self, *a):  # never reached: an unresolved identity is inconclusive without a build
            raise AssertionError("no stub build expected")

    import stack_check

    unit = stack_check.Unit("u1", "o", "t", "src/a.cpp")
    files = [{"path": "src/a.cpp", "base_exists": True, "cand_exists": True, "base_text": "", "cand_text": cand}]
    checks, _ = sc.run_unused_checks(Backend(), "rev", {"u1": unit}, {}, files, {"src/a.cpp": cand.encode()}, {"u1"})
    assert [(c["status"], "identity unresolved" in c["reason"]) for c in checks] == [("inconclusive", True)]
    red = {"edits_hash": "h", "analysis": "complete", "incomplete_reasons": [], "global_incomplete": [],
           "groups": [], "units": []}
    dec = sc.decide(red, {"edits_hash": "h", "coverage": [], "functions": [], "unused_checks": checks}, probes=False)
    assert dec["attempt"] == "unresolved" and dec["violations"] == []


def test_inactive_prefix_does_not_hide_an_unused_reconstruction() -> None:
    prefix = "#if 0\nint removed_text;\n#endif\n"
    rows = sc.unused_candidates(prefix + "void T::f(int a) { }\n", prefix + "void T::f(int a) { use(a); }\n",
                                [sc.demangled_symbol("f__1TFi")])
    assert [r["def"].line for r in rows] == [4]


def test_certificate_binds_unchanged_included_headers(tmp_path, monkeypatch) -> None:
    """A header the unit includes but the patch does not change is still a unit input:
    when a later integration changes it, the certificate is stale."""
    import edit_scope

    monkeypatch.setattr(sc, "classify", fake_classify)
    header = "struct H { int x; };\n"
    base = '#include "h.h"\n' + BASE
    cand = '#include "h.h"\n' + CAND
    repo = git_repo(tmp_path, {"src/a.c": base, "include/h.h": header})
    (repo / "src/a.c").write_text(cand)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    red = sc.run_reduce(edits, repo, tmp_path / "c", budget=60, max_groups=16, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    backend = InliningMwcc(tmp_path / "m", TARGET_INLINED, unused={"u1": ["h__Fv"]}, inline=("h",), repo=repo)
    backend.root = repo
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red), attribute=red, jobs=1,
                     backend=backend)
    [check] = mw["unused_checks"]
    assert check["status"] == "inlined" and check["unit_inputs"] == ["include/h.h", "src/a.c"]

    class R:
        identity = {}

        def class_state(self, q):
            return {"class": q, "owner_unit": "u1", "provenance": "vtable", "started": True,
                    "construct": "ready", "declare": "ready"}

        def gated(self, path):
            return False

        def unit_for_source(self, path):
            return "u1" if path == "src/a.c" else None

        def source_of(self, unit):
            return "src/a.c"

        def unused_symbols(self, unit):
            return ["h__Fv"]

    def scope(header_after):
        files = [{"path": "src/a.c", "before": base, "after": cand},
                 {"path": "include/h.h", "before": header, "after": header_after}]
        res = edit_scope.classify(repo, edits["base_rev"], files, target_unit="u1", readiness=R(),
                                  unused_checks=[check], policy={})
        return [h for h in res["hunks"] if "UNUSED" in h["reason"]]

    assert [h["verdict"] for h in scope(header)] == ["ready"]  # certified inputs unchanged
    [stale] = scope(header.replace("int x;", "int x; int y;"))  # a later integration changed h.h
    assert stale["verdict"] == "unused_unverified" and "unit inputs changed" in stale["reason"]


def test_unit_inputs_undeterminable_is_inconclusive(repo, tmp_path) -> None:
    (repo / "src/a.c").write_text('#include "missing.h"\n' + CAND)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], jobs=1,
                     backend=InliningMwcc(tmp_path / "m", TARGET_DEAD, unused={"u1": ["h__Fv"]}))
    [check] = mw["unused_checks"]
    assert check["status"] == "inconclusive" and "inputs cannot be determined" in check["reason"]


def test_computed_include_without_deps_is_inconclusive(repo, tmp_path) -> None:
    (repo / "src/a.c").write_text('#define HEADER "h.h"\n#include HEADER\n' + CAND)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], jobs=1,
                     backend=InliningMwcc(tmp_path / "m", TARGET_DEAD, unused={"u1": ["h__Fv"]}))
    [check] = mw["unused_checks"]
    assert check["status"] == "inconclusive" and "inputs cannot be determined" in check["reason"]


def test_ninja_deps_are_authoritative_and_unioned_with_literal_includes(tmp_path) -> None:
    import stack_check

    class B:
        root = None

        def deps(self, unit):
            return {"src/a.cpp", "include/dep.h"}

        def include_dirs(self, unit):
            return ["include"]

    unit = stack_check.Unit("u1", "o", "t", "src/a.cpp")
    texts = {"src/a.cpp": b'#define HEADER "x.h"\n#include HEADER\n#include "new.h"\n', "include/new.h": b"int n;\n"}
    assert sc.unit_inputs_of(B(), unit, texts) == ["include/dep.h", "include/new.h", "src/a.cpp"]
    del B.deps
    assert sc.unit_inputs_of(B(), unit, texts) is None  # no deps and a computed include


def test_unsigned_hex_condition_does_not_hide_an_unused_reconstruction() -> None:
    w = lambda t: "#if 0xffffffffffffffff == -1\n" + t + "#endif\n"  # noqa: E731
    rows = sc.unused_candidates(w("void T::f(int a) { }\n"), w("void T::f(int a) { use(a); }\n"),
                                [sc.demangled_symbol("f__1TFi")])
    assert [r["def"].line for r in rows] == [2]
    # a base body inside `#if 0` does not exempt a body made active in the candidate
    rows = sc.unused_candidates("#if 0\nvoid T::f(int a) { use(a); }\n#endif\n", "void T::f(int a) { use(a); }\n",
                                [sc.demangled_symbol("f__1TFi")])
    assert [r["def"].line for r in rows] == [1]


def test_directives_in_comments_are_not_interpreted() -> None:
    base = ("#undef ENABLED\n/*\n#define ENABLED 1\n*/\n#if ENABLED\nvoid TKoopa::rolling() { mX += 1; }\n#endif\n")
    cand = ("#undef ENABLED\n/*\n#define ENABLED 1\n*/\n#define ENABLED 1\n#if ENABLED\n"
            "void TKoopa::rolling() { mX += 2; }\n#endif\n")
    rows = sc.unused_candidates(base, cand, [sc.demangled_symbol("rolling__6TKoopaFv")])
    assert [r["def"].line for r in rows] == [7]


def test_translation_phase_gaps_are_handled_or_undecidable() -> None:
    import preprocess

    ev = lambda t: preprocess.active_text(t, unknown="inactive")  # noqa: E731
    assert "yes" in ev("# /*c*/ define X 1\n#if X\nyes\n#endif\n")  # a comment inside a directive
    assert "yes" in ev("#   define X 1\n#if X\nyes\n#endif\n")
    assert "yes" in ev("#def\\\nine X 1\n#if X\nyes\n#endif\n")  # a splice inside a directive
    assert "yes" in ev('char* s = "#if 0";\nyes\n')  # `#if` inside a string is not a directive
    for t in ("%:define X 1\nyes\n", "??=define X 1\nyes\n", "#define X 1\n/* open\nyes\n"):
        out = ev(t)
        assert "yes" not in out and len(out) == len(t), t  # digraph/trigraph/unterminated: undecidable


def test_trigraph_splice_in_a_comment_gives_no_evidence() -> None:
    base = "#undef ENABLED\n// ??/\n#define ENABLED 1\n#if ENABLED\nvoid TKoopa::rolling() { mX += 1; }\n#endif\n"
    cand = ("#undef ENABLED\n// ordinary comment\n#define ENABLED 1\n#if ENABLED\n"
            "void TKoopa::rolling() { mX += 2; }\n#endif\n")
    rows = sc.unused_candidates(base, cand, [sc.demangled_symbol("rolling__6TKoopaFv")])
    assert [r["def"].line for r in rows] == [5]


def test_unmodelled_translation_constructs_make_the_whole_file_undecidable() -> None:
    import preprocess

    ev = lambda t: preprocess.active_text(t, unknown="inactive")  # noqa: E731
    before = "void TKoopa::fall() { }\n"
    for tail in ("// ??/\n", "int a = b ??' c;\n", "%:define X\n", "int a<:2:>;\n", "<% %>\n",
                 'const char* s = R"(raw)";\n', "int x; \\ \nint y;\n", "int x;\\", "int x;\\\rint y;\n"):
        text = before + tail
        out = ev(text)
        assert "TKoopa" not in out and len(out) == len(text), tail  # lines before the construct too
        assert preprocess.undecidable_file(text), tail
    assert preprocess.undecidable_file(before + 'printf("%d", a ? b : c);\n') is None  # no false alarm
    assert ev("#def\\\nine X 1\n#if X\nyes\n#endif\n").count("yes") == 1  # a plain splice is modelled


def test_stubs_follow_the_return_type() -> None:
    text = ("TNerveMantaMove& TNerveMantaMove::theNerve()\n{\n    static TNerveMantaMove n;\n    return n;\n}\n"
            "const JGeometry::TVec3<f32>& T::pos() const { return mPos; }\n"
            "TFoo T::make(int a) { return TFoo(a); }\n"
            "s32 T::n() { return mN; }\nTFoo* T::p() { return mP; }\nvoid T::v() { x(); }\nT::~T() { x(); }\n"
            "EState T::state() { return mS; }\n")
    stubs = {d.qualified: sc.stub_label(d) for d in sc.function_defs(text)}
    assert stubs == {"TNerveMantaMove::theNerve": "{ return *(TNerveMantaMove*)0; }",
                     "T::pos": "{ return *(const JGeometry::TVec3<f32>*)0; }",
                     "T::make": "{ TFoo* p = 0; return *p; }", "T::n": "{ return 0; }", "T::p": "{ return 0; }",
                     "T::v": "{ }", "T::~T": "{ }", "T::state": "{ EState* p = 0; return *p; }"}
    d = sc.function_defs(text)[0]
    stubbed, label = sc.stub_definition(text, d)
    assert stubbed.count("\n") == text.count("\n") and "{ return *(TNerveMantaMove*)0;\n" in stubbed


def test_a_hung_compile_is_a_failed_build(tmp_path, monkeypatch) -> None:
    import stack_check

    monkeypatch.setenv("ORCH_MWCC_COMPILE_TIMEOUT", "7")
    assert stack_check.compile_timeout() == 7.0

    hang = tmp_path / "hang.sh"
    hang.write_text("#!/bin/sh\nsleep 30\n")
    hang.chmod(0o755)

    class Repo:
        root = tmp_path
        runner = str(hang)
        edges = {"o.o": type("E", (), {"rule": "mwcc", "src": "a.c", "mw_version": "x", "cflags": "", "extab_padding": None})()}

    unit = stack_check.Unit("u", "o.o", "t.o", "a.c")
    res = stack_check.compile_in(Repo(), tmp_path, unit, tmp_path / "out.o", timeout=1)
    assert res.ok is False and "timed out" in res.error


def test_mwcc_budget_exhausted_leaves_units_uncompared(repo, tmp_path) -> None:
    class Slow(InliningMwcc):
        deadline = None

        def set_deadline(self, deadline):
            self.deadline = deadline

        def compile(self, unit, texts, label):
            import time as _t

            if self.deadline is not None and _t.time() > self.deadline:
                return False, None, "mwcc budget exceeded: not built (analysis incomplete)"
            return super().compile(unit, texts, label)

    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], jobs=1, budget=-1,
                     backend=Slow(tmp_path / "m", TARGET_DEAD, unused={"u1": ["h__Fv"]}))
    assert mw["coverage"][0]["compared"] is False and "budget" in mw["errors"][0]["error"]
    red = {"edits_hash": edits["edits_hash"], "analysis": "complete", "incomplete_reasons": [], "global_incomplete": [],
           "groups": [], "units": []}
    assert sc.decide(red, mw, probes=False)["attempt"] == "unresolved"
