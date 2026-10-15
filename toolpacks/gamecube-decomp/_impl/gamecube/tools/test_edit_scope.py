"""edit_scope: the edit-scope fence over a fake readiness (no target objects needed)."""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
import types
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import edit_scope as es  # noqa: E402

# --------------------------------------------------------------------------
# Fake readiness
# --------------------------------------------------------------------------

UNITS = {
    "Enemy/Koopa": "src/Enemy/Koopa.cpp",
    "Enemy/Kuribo": "src/Enemy/Kuribo.cpp",
    "Enemy/Stub": "src/Enemy/Stub.cpp",
    "Enemy/Started": "src/Enemy/Started.cpp",
    "System/MarNameRefGen": "src/System/MarNameRefGen.cpp",
}
# class -> (owner_unit, provenance, declare, construct)
CLASSES = {
    "TKoopa": ("Enemy/Koopa", "vtable", "ready", "ready"),
    "TKuribo": ("Enemy/Kuribo", "vtable", "ready", "ready"),
    "TStub": ("Enemy/Stub", "vtable", "not_ready", "not_ready"),
    "JDrama::TNotReady": ("Enemy/Stub", "majority", "not_ready", "not_ready"),
    "TStarted": ("Enemy/Started", "majority", "ready", "not_ready"),
    "TAmbig": (None, "ambiguous", "unresolved", "unresolved"),
    "TShared": (None, "weak_only", "shared", "shared"),
    "TMarNameRefGen": ("System/MarNameRefGen", "vtable", "ready", "ready"),
    "TNameSpace": ("Enemy/Stub", "majority", "not_ready", "not_ready"),  # a namespace the map mangles like a class
}
IDENTITY = {"repo": "r", "rev": "base", "version": "GMSJ01", "target_stamp": "t", "map_sha": "m", "policy_hash": "p"}


class FakeReadiness:
    def __init__(self, unused=None, gated=("src/System/MarNameRefGen*.cpp",)):
        self._unused = unused or {}
        self._gated = gated
        self.identity = dict(IDENTITY)
        self.version = "GMSJ01"

    def class_state(self, qualified):
        owner, prov, declare, construct = CLASSES.get(qualified, (None, "absent", "unresolved", "unresolved"))
        return {"class": qualified, "owner_unit": owner, "provenance": prov, "started": declare == "ready",
                "construct": construct, "declare": declare}

    def is_namespace(self, name):
        return name == "TNameSpace"

    # the target's strong constructor signatures (readiness matches active definitions exactly)
    STRONG_CTORS = {"TStub": r"TStub::TStub\(\s*\)"}

    def class_state_with_sources(self, qualified, texts):
        st = self.class_state(qualified)
        sig = self.STRONG_CTORS.get(qualified)
        src = UNITS.get(st["owner_unit"])
        text = texts.get(src)
        if sig and text is not None and re.search(sig, text):
            st = dict(st, started=True, construct="ready", declare="ready")
        return st

    def gated(self, path):
        return any(fnmatch.fnmatchcase(path, g) for g in self._gated)

    def unit_for_source(self, path):
        return next((u for u, s in UNITS.items() if s == path), None)

    def source_of(self, unit):
        return UNITS.get(unit)

    def unused_symbols(self, unit):
        return self._unused.get(unit, [])


def run(files, target="Enemy/Koopa", readiness=None, **kw):
    rows = [{"path": p, "before": b, "after": a} for p, (b, a) in files.items()]
    kw.setdefault("policy", {})
    return es.classify(Path("."), kw.pop("base_rev", "abc1234def"), rows, target_unit=target,
                       readiness=readiness or FakeReadiness(), **kw)


def verdicts(res):
    return [(h["file"], h["class"], h["verdict"]) for h in res["hunks"]]


KOOPA_CPP = '#include "Enemy/Koopa.hpp"\n\nvoid TKoopa::init() { mHp = 1; }\n'

# --------------------------------------------------------------------------
# Class verdicts
# --------------------------------------------------------------------------


def test_own_class_in_target_cpp_and_own_header():
    res = run({
        "src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + "void TKoopa::walk(int n) { mX += n; }\n"),
        "include/Enemy/Koopa.hpp": ("class TKoopa { void init(); int mHp; };\n",
                                    "class TKoopa { void init(); void walk(int); int mHp; int mX; };\n"),
    })
    assert verdicts(res) == [("include/Enemy/Koopa.hpp", "TKoopa", "own_class"),
                             ("src/Enemy/Koopa.cpp", "TKoopa", "own_class")]
    assert res["verdict"] == "pass"
    assert res["limits"] == {"foreign_headers": 0, "foreign_header_lines": 0}
    assert set(res["identity"]) == {"base_rev", "patch_sha256", "readiness"}
    assert res["identity"]["readiness"] == IDENTITY


def test_ready_class_in_cpp_and_foreign_header():
    res = run({
        "src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + "void TKuribo::help() { mY = 2; }\n"),
        "include/Enemy/Kuribo.hpp": ("class TKuribo {\n int mY;\n};\n", "class TKuribo {\n int mY;\n void help();\n};\n"),
    })
    assert verdicts(res) == [("include/Enemy/Kuribo.hpp", "TKuribo", "foreign_header"),
                             ("src/Enemy/Koopa.cpp", "TKuribo", "ready")]
    assert res["verdict"] == "pass"
    assert res["limits"] == {"foreign_headers": 1, "foreign_header_lines": 1}


def test_shared_class_is_ready():
    res = run({"include/JSystem/TShared.h": ("struct TShared { int a; };\n", "struct TShared { int a; int b; };\n")})
    assert verdicts(res) == [("include/JSystem/TShared.h", "TShared", "foreign_header")]


def test_not_ready_class_in_foreign_header():
    res = run({"include/Enemy/Stub.hpp": (None, "class TStub : public TBase {\npublic:\n  void act();\n};\n")})
    [h] = res["hunks"]
    assert (h["class"], h["verdict"], h["line"]) == ("TStub", "not_ready", 1)
    assert "Enemy/Stub" in h["reason"]
    assert res["verdict"] == "reject"


def test_bypass_class_layout_in_target_cpp():
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + "class TStub {\n  int mPad[4];\n};\n")})
    assert verdicts(res) == [("src/Enemy/Koopa.cpp", "TStub", "not_ready")]
    assert res["hunks"][0]["line"] == 4


@pytest.mark.parametrize("alias", ["typedef TStub TStubAlias;", "using TStubAlias = TStub;"])
def test_bypass_alias(alias):
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + alias + "\nvoid TStubAlias::act() { mX = 3; }\n")})
    assert verdicts(res) == [("src/Enemy/Koopa.cpp", "TStub", "not_ready")]


def test_shared_header_with_several_classes_only_changed_class_judged():
    before = "class TKuribo { int a; };\nclass TStub { int b; };\n"
    res = run({"include/Enemy/Common.hpp": (before, before.replace("int b;", "int b; void act();"))})
    assert verdicts(res) == [("include/Enemy/Common.hpp", "TStub", "not_ready")]
    assert res["hunks"][0]["line"] == 2


def test_mixed_header_ready_and_not_ready():
    after = "class TKuribo { int a; int c; };\nclass TStub { int b; };\n"
    res = run({"include/Enemy/Common.hpp": ("class TKuribo { int a; };\n", after)})
    assert verdicts(res) == [("include/Enemy/Common.hpp", "TKuribo", "foreign_header"),
                             ("include/Enemy/Common.hpp", "TStub", "not_ready")]
    assert res["verdict"] == "reject"


def test_libs_include_with_namespace_identity():
    after = "namespace JDrama {\nclass TNotReady {\n  int x;\n};\n}\n"
    res = run({"libs/JSystem/include/JDrama/JDRNotReady.h": (None, after)})
    assert verdicts(res) == [("libs/JSystem/include/JDrama/JDRNotReady.h", "JDrama::TNotReady", "not_ready")]
    assert res["hunks"][0]["line"] == 2


def test_removal_only_is_not_a_change():
    res = run({"include/Enemy/Stub.hpp": ("class TStub { int a; int b; };\n", "class TStub { int a; };\n")})
    assert res["hunks"] == [] and res["verdict"] == "pass"


def test_comments_and_whitespace_are_not_changes():
    res = run({"include/Enemy/Stub.hpp": ("class TStub { int a; };\n", "class TStub {\n  int a; // pad\n};\n")})
    assert res["hunks"] == []


def test_added_code_in_if0_is_still_scanned_but_upstream_if0_is_not_flagged():
    # reference mode evaluates no condition: an added class inside `#if 0` is judged like any other
    after = KOOPA_CPP + "#if 0\nclass TStub { int x; };\n#endif\n"
    assert verdicts(run({"src/Enemy/Koopa.cpp": (KOOPA_CPP, after)})) == [("src/Enemy/Koopa.cpp", "TStub", "not_ready")]
    # an untouched upstream `#if 0` block is in both before and after: nothing added, nothing flagged
    both = KOOPA_CPP + "#if 0\nclass TStub { int x; };\nvoid* f() { return new TStub; }\n#endif\n"
    assert [h["class"] for h in run({"src/Enemy/Koopa.cpp": (both, both + "void TKoopa::walk() { mX = 1; }\n")})["hunks"]] == ["TKoopa"]


def test_if0_added_construction_in_a_gated_file_is_flagged():
    res = run({REG: (REG_BASE, reg(["#if 0", "  if (b) return new TStub();", "#endif"]))}, target="System/MarNameRefGen")
    assert [h["class"] for h in res["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]
    upstream = reg(["#if 0", "  if (b) return new TStub();", "#endif"])
    res = run({REG: (upstream, upstream.replace("return 0;", "return 0; // tidy"))}, target="System/MarNameRefGen")
    assert [h for h in res["hunks"] if h["verdict"] == "order_gated"] == []


def test_unsigned_hex_condition_does_not_hide_references_or_unused_bodies():
    # `#if 0xffffffffffffffff == -1` is true in C (unsigned semantics); reference mode scans it regardless
    wrap = ["#if 0xffffffffffffffff == -1", "  if (b) return new TStub();", "#endif"]
    res = run({REG: (REG_BASE, reg(wrap))}, target="System/MarNameRefGen")
    assert [h["class"] for h in res["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    w = lambda t: "#if 0xffffffffffffffff == -1\n" + t + "#endif\n"  # noqa: E731
    res = run({"src/Enemy/Koopa.cpp": (w(UNUSED_BEFORE), w(UNUSED_AFTER))}, readiness=r, unused_checks=[])
    assert unused_verdicts(res) == [("TKoopa", "unused_unverified")]


def test_moved_identical_definition_allowed_and_changed_move_is_a_change():
    a = "class TStub {\n  int x;\n};\n"
    moved = run({"include/Enemy/A.hpp": (a, ""), "include/Enemy/B.hpp": ("", "\n" + a)})
    assert verdicts(moved) == [("include/Enemy/B.hpp", "TStub", "moved")]
    assert moved["verdict"] == "pass" and "include/Enemy/A.hpp" in moved["hunks"][0]["reason"]
    changed = run({"include/Enemy/A.hpp": (a, ""), "include/Enemy/B.hpp": ("", a.replace("int x;", "int x; int y;"))})
    assert verdicts(changed) == [("include/Enemy/B.hpp", "TStub", "not_ready")]


def test_tu_local_helper_and_header_absent_class():
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + "struct KoopaWork {\n  int a;\n};\n")})
    assert verdicts(res) == [("src/Enemy/Koopa.cpp", "KoopaWork", "local_helper")]
    assert res["verdict"] == "pass" and any("KoopaWork" in w for w in res["warnings"])
    hdr = run({"include/Enemy/Work.hpp": (None, "struct KoopaWork { int a; };\n")})
    assert verdicts(hdr) == [("include/Enemy/Work.hpp", "KoopaWork", "unresolved")]
    assert hdr["verdict"] == "reject"


def test_ambiguous_owner_is_unresolved():
    res = run({"include/Enemy/Ambig.hpp": ("class TAmbig { int a; };\n", "class TAmbig { int a; int b; };\n")})
    [h] = res["hunks"]
    assert h["verdict"] == "unresolved" and "ambiguous" in h["reason"]


def test_namespace_member_definitions_are_not_classes():
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + "void TNameSpace::helper() { gX = 1; }\n"
                                       "void Unknown::helper() { gY = 2; }\n")})
    assert res["hunks"] == [] and res["verdict"] == "pass"
    assert any("Unknown" in w for w in res["warnings"])


def test_forward_declaration_allowed():
    res = run({"include/Enemy/Koopa.hpp": ("class TKoopa { int a; };\n", "class TStub;\nclass TKoopa { int a; };\n")})
    assert verdicts(res) == [("include/Enemy/Koopa.hpp", "TStub", "forward_decl")]
    assert res["verdict"] == "pass"


def test_soft_limits_warn_only():
    files = {f"include/Enemy/K{i}.hpp": ("class TKuribo { int a; };\n" if i == 0 else "",
                                         ("class TKuribo { int a; int b; };\n" if i == 0 else "int g%d;\n" % i))
             for i in range(3)}
    res = run(files, policy={"scope": {"maxForeignHeaders": 2, "maxForeignHeaderLines": 2}})
    assert res["limits"] == {"foreign_headers": 3, "foreign_header_lines": 3}
    assert res["verdict"] == "pass"
    assert len([w for w in res["warnings"] if w.startswith("soft limit")]) == 2
    assert not any(w.startswith("soft limit") for w in run(files)["warnings"])  # defaults 3 / 25


def test_patch_sha256_canonical():
    a = [{"path": "src/b.cpp", "before": "x", "after": "y"}, {"path": "src/a.cpp", "before": None, "after": "z"}]
    assert es.patch_sha256(a) == es.patch_sha256(list(reversed(a)))
    assert es.patch_sha256(a) != es.patch_sha256([dict(a[0], after="w"), a[1]])

# --------------------------------------------------------------------------
# Order-gated files
# --------------------------------------------------------------------------

REG = "src/System/MarNameRefGen.cpp"
REG_BASE = '#include "System/MarNameRefGen.hpp"\n\nvoid* TMarNameRefGen::getNameRef(const char* name) {\n  return 0;\n}\n'


def reg(lines):
    return REG_BASE.replace("  return 0;", "\n".join(lines) + "\n  return 0;")


def test_order_gated_ready_not_ready_unresolved():
    after = reg(["  if (a) return new TKuribo(name);", "  if (b) return new TStub(name);",
                 "  if (c) return new TAmbig(name);", "  if (d) TStarted::make();",
                 "  // new TStub(name);", "  TMarNameRefGen::check();"])
    res = run({REG: (REG_BASE, after)}, target="System/MarNameRefGen")
    got = [(h["class"], h["verdict"], h["line"]) for h in res["hunks"]]
    assert got == [("TMarNameRefGen", "own_class", 3), ("TStub", "order_gated", 5), ("TAmbig", "order_gated", 6),
                   ("TStarted", "order_gated", 7)]
    assert res["verdict"] == "reject"
    ok = run({REG: (REG_BASE, reg(["  if (a) return new TKuribo(name);"]))}, target="System/MarNameRefGen")
    assert [h["verdict"] for h in ok["hunks"]] == ["own_class"] and ok["verdict"] == "pass"


def test_added_includes_are_not_references():
    # an existing header declares nothing new; a moved include adds nothing
    after = REG_BASE.replace('.hpp"\n', '.hpp"\n#include "Enemy/Stub.hpp"\n#include "Enemy/Kuribo.hpp"\n')
    res = run({REG: (REG_BASE, after),
               "include/Enemy/Stub.hpp": ("class TStub { int a; };\nstruct StubParams { int b; };\n",) * 2,
               "include/Enemy/Kuribo.hpp": ("class TKuribo { int a; };\n",) * 2},
              target="System/MarNameRefGen")
    assert res["hunks"] == [] and res["verdict"] == "pass"


def test_precedent_construction_in_the_same_file_is_ready():
    # the base text already constructs TStub (accepted by humans): another use in that file is not order-gated
    base = reg(["  if (x) return new TStub;"])
    after = reg(["  if (x) return new TStub;", "  if (y) return new TStub(1);"])
    res = run({REG: (base, after)}, target="System/MarNameRefGen")
    assert not [h for h in res["hunks"] if h["verdict"] == "order_gated"], res["hunks"]
    fresh = run({REG: (REG_BASE, reg(["  if (y) return new TStub(1);"]))}, target="System/MarNameRefGen")
    assert [(h["class"], h["verdict"]) for h in fresh["hunks"] if h["verdict"] == "order_gated"] == [("TStub", "order_gated")]


def test_ungated_file_has_no_order_check():
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP, KOOPA_CPP + "void TKoopa::spawn() { new TStub(); }\n")})
    assert verdicts(res) == [("src/Enemy/Koopa.cpp", "TKoopa", "own_class")]

# --------------------------------------------------------------------------
# UNUSED reconstruction evidence
# --------------------------------------------------------------------------

UNUSED_BEFORE = KOOPA_CPP + "void TKoopa::rolling() {}\n"
UNUSED_AFTER = KOOPA_CPP + "void TKoopa::rolling() {\n  mX += 2;\n  mHp--;\n}\n"
MANGLED = "rolling__6TKoopaFv"


def body_sha():
    import steering_check as sc

    [d] = [d for d in sc.function_defs(UNUSED_AFTER) if d.qualified == "TKoopa::rolling"]
    return sc.body_sha256(UNUSED_AFTER, d)


def unused_run(checks, **kw):
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    return run({"src/Enemy/Koopa.cpp": (UNUSED_BEFORE, UNUSED_AFTER)}, readiness=r, unused_checks=checks, **kw)


def check_row(**kw):
    row = {"unit": "Enemy/Koopa", "file": "src/Enemy/Koopa.cpp", "function": "TKoopa::rolling(void)",
           "mangled": MANGLED, "status": "inlined", "base_rev": "abc1234def0123456789", "edits_hash": "e1",
           "body_sha256": body_sha(), "reason": "TKoopa::execute 86% -> 45%"}
    row.update(kw)
    return row


def unused_verdicts(res):
    return [(h["class"], h["verdict"]) for h in res["hunks"] if "UNUSED" in h["reason"]]


def test_unused_inlined_bound_passes():
    res = unused_run([check_row()])
    assert unused_verdicts(res) == [("TKoopa", "ready")]
    assert "86% -> 45%" in [h for h in res["hunks"] if "UNUSED" in h["reason"]][0]["reason"]
    assert res["verdict"] == "pass"


def test_unused_dead_rejects():
    res = unused_run([check_row(status="dead")])
    assert unused_verdicts(res) == [("TKoopa", "dead_unused")] and res["verdict"] == "reject"


@pytest.mark.parametrize("checks,why", [
    ([], "no unused check"),
    ([{"status": "inlined", "mangled": MANGLED, "file": "src/Enemy/Koopa.cpp", "base_rev": "abc1234",
       "body_sha256": "0" * 64}], "stale"),
    ([{"status": "inlined", "mangled": MANGLED, "file": "src/Enemy/Koopa.cpp", "base_rev": "ffff999",
       "body_sha256": None}], "stale"),
    (None, "no unused check"),
])
def test_unused_missing_or_stale_rejects(checks, why):
    if checks and checks[0]["body_sha256"] is None:
        checks[0]["body_sha256"] = body_sha()  # right body, wrong base_rev
    res = unused_run(checks)
    [h] = [h for h in res["hunks"] if "UNUSED" in h["reason"]]
    assert h["verdict"] == "unused_unverified" and why in h["reason"]
    assert res["verdict"] == "reject"


def test_unused_inconclusive_and_edits_hash_binding():
    assert unused_verdicts(unused_run([check_row(status="inconclusive")])) == [("TKoopa", "unused_unverified")]
    assert unused_verdicts(unused_run([check_row()], edits_hash="e1")) == [("TKoopa", "ready")]
    assert unused_verdicts(unused_run([check_row()], edits_hash="e2")) == [("TKoopa", "unused_unverified")]
    assert unused_verdicts(unused_run([check_row()], policy={"edits_hash": "e2"})) == [("TKoopa", "unused_unverified")]


def test_unused_body_already_in_base_is_not_a_reconstruction():
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    res = run({"src/Enemy/Koopa.cpp": (UNUSED_AFTER, UNUSED_AFTER + "void TKoopa::other() { mX = 1; }\n")},
              readiness=r)
    assert unused_verdicts(res) == []

# --------------------------------------------------------------------------
# Git-backed: incremental attempts and the CLI
# --------------------------------------------------------------------------

GIT_ENV = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()


def write(repo: Path, files: dict) -> None:
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)


def commit(repo: Path, files: dict, msg: str) -> str:
    write(repo, files)
    git(repo, "add", "-A")
    git(repo, *GIT_ENV, "commit", "-q", "-m", msg)
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    r = tmp_path / "repo"
    r.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(r)], check=True)
    commit(r, {"src/Enemy/Koopa.cpp": KOOPA_CPP, "include/Enemy/Stub.hpp": "class TStub;\n",
               REG: REG_BASE, "docs/x.md": "x\n"}, "base")
    return r


@pytest.fixture
def fake_module(monkeypatch):
    monkeypatch.setenv("ORCH_ORDERING_POLICY", json.dumps({"gatedPaths": ["src/System/MarNameRefGen*.cpp"]}))
    mod = types.ModuleType("readiness")
    calls = []

    class ReadinessError(Exception):
        def __init__(self, kind, detail):
            super().__init__(detail)
            self.kind, self.detail = kind, detail

    def load(repo, rev, *, version=None, policy=None, cache_dir=None):
        calls.append({"rev": rev, "policy": policy})
        if (policy or {}).get("fail"):
            raise ReadinessError("missing_objects", "no build/GMSJ01/obj")
        return FakeReadiness()

    mod.load, mod.ReadinessError, mod.calls = load, ReadinessError, calls
    monkeypatch.setitem(sys.modules, "readiness", mod)
    return mod


def cli(capsys, *argv):
    code = es.main(list(argv))
    out = capsys.readouterr()
    return code, (json.loads(out.out) if out.out.strip() else None), out.err


def test_incremental_attempts_are_cumulative(repo: Path, fake_module, capsys):
    base = git(repo, "rev-parse", "HEAD")
    commit(repo, {"include/Enemy/Stub.hpp": "class TStub {\n  int a;\n};\n"}, "part 1")
    head = commit(repo, {"include/Enemy/Stub.hpp": "class TStub {\n  int a;\n  void act();\n};\n"}, "part 2")
    code, out, _ = cli(capsys, "check", "--repo", str(repo), "--base-rev", base, "--head-rev", head, "--json")
    assert code == 0 and out["verdict"] == "reject"
    assert verdicts(out) == [("include/Enemy/Stub.hpp", "TStub", "not_ready")]
    assert out["identity"]["base_rev"] == base and fake_module.calls[-1]["rev"] == base


def test_cli_check_overlay_and_worktree(repo: Path, fake_module, capsys, tmp_path: Path):
    base = git(repo, "rev-parse", "HEAD")
    ov = tmp_path / "ov"
    write(ov, {"src/Enemy/Koopa.cpp": KOOPA_CPP + "class TStub { int x; };\n", "docs/x.md": "y\n"})
    code, out, _ = cli(capsys, "check", "--repo", str(repo), "--base-rev", "HEAD", "--overlay-dir", str(ov),
                       "--target-unit", "Enemy/Koopa", "--json")
    assert code == 0 and verdicts(out) == [("src/Enemy/Koopa.cpp", "TStub", "not_ready")]
    assert out["identity"]["base_rev"] == base
    # worktree: an untracked helper header plus a tracked edit; the target unit is inferred
    write(repo, {"include/Enemy/New.hpp": "class TStub { int y; };\n",
                 "src/Enemy/Koopa.cpp": KOOPA_CPP + "void TKoopa::walk() { mX = 1; }\n"})
    policy = json.dumps({"gatedPaths": ["src/System/MarNameRefGen*.cpp"], "scope": {"maxForeignHeaders": 0}})
    code, out, _ = cli(capsys, "check", "--repo", str(repo), "--base-rev", base, "--worktree",
                       "--policy-json", policy, "--json")
    assert code == 0
    assert verdicts(out) == [("include/Enemy/New.hpp", "TStub", "not_ready"),
                             ("src/Enemy/Koopa.cpp", "TKoopa", "own_class")]
    assert any(w.startswith("soft limit") for w in out["warnings"])
    assert fake_module.calls[-1]["policy"]["gatedPaths"] == ["src/System/MarNameRefGen*.cpp"]


def test_cli_unused_checks_file(repo: Path, fake_module, capsys, tmp_path: Path, monkeypatch):
    base = commit(repo, {"src/Enemy/Koopa.cpp": UNUSED_BEFORE}, "stub")
    head = commit(repo, {"src/Enemy/Koopa.cpp": UNUSED_AFTER}, "body")
    monkeypatch.setattr(fake_module, "load", lambda *a, **k: FakeReadiness(unused={"Enemy/Koopa": [MANGLED]}))
    checks = tmp_path / "checks.json"
    checks.write_text(json.dumps({"unused_checks": [check_row(base_rev=base)]}))
    code, out, _ = cli(capsys, "check", "--repo", str(repo), "--base-rev", base, "--head-rev", head,
                       "--unused-checks", str(checks), "--json")
    assert code == 0 and unused_verdicts(out) == [("TKoopa", "ready")]


def test_cli_errors_exit_2(repo: Path, fake_module, capsys):
    code, out, err = cli(capsys, "check", "--repo", str(repo), "--base-rev", "HEAD", "--worktree",
                         "--policy-json", '{"fail": true}', "--json")
    assert code == 2 and out is None and json.loads(err) == {"error": "missing_objects", "detail": "no build/GMSJ01/obj"}
    code, _, err = cli(capsys, "check", "--repo", str(repo), "--base-rev", "nope", "--json")
    assert code == 2 and json.loads(err)["error"] == "bad_rev"


def test_cli_pr_size_and_same_pr_prerequisites(repo: Path, fake_module, capsys):
    base = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-q", "-b", "feature")
    commit(repo, {"src/Enemy/Stub.cpp": '#include "Enemy/Stub.hpp"\nTStub::TStub() { mX = 0; }\n',
                  "include/Enemy/Stub.hpp": "class TStub {\npublic:\n  TStub();\n  int mX;\n};\n"}, "stub unit")
    commit(repo, {REG: reg(["  if (b) return new TStub(name);"]),
                  "src/Enemy/Koopa.cpp": KOOPA_CPP + "void TKoopa::walk() { mX = 1; }\n"}, "registry")
    git(repo, "checkout", "-q", "main")
    main_head = commit(repo, {"docs/x.md": "main moved\n"}, "unrelated")
    code, out, _ = cli(capsys, "pr", "--repo", str(repo), "--base", "main", "--head", "feature", "--json")
    assert code == 0
    assert out["identity"]["base_rev"] == base  # merge-base is the before side
    assert fake_module.calls[-1]["rev"] == main_head  # readiness at the PR base
    assert out["verdict"] == "pass"
    got = {(h["file"], h["class"]): h["verdict"] for h in out["hunks"]}
    assert got[("include/Enemy/Stub.hpp", "TStub")] == "own_class"
    assert got[("src/Enemy/Stub.cpp", "TStub")] == "own_class"
    assert got[(REG, "TStub")] == "ready"
    [p] = out["same_pr_prerequisites"]
    assert (p["class"], p["file"], p["line"]) == ("TStub", REG, 4)
    assert p["suggestion"] == "split: land the class's own unit first"
    size = out["pr_size"]
    assert (size["units"], size["files"]) == (3, 4) and size["changed_lines"] > 0
    assert any("3 units" in w for w in size["warnings"])


def test_cli_policy_comes_from_flag_or_env_and_is_required(repo: Path, fake_module, capsys, monkeypatch):
    base = git(repo, "rev-parse", "HEAD")
    head = commit(repo, {REG: reg(["  if (b) return new TStub(name);"])}, "registry line")
    # $ORCH_ORDERING_POLICY (set by the fixture) applies when --policy-json is absent
    code, out, _ = cli(capsys, "pr", "--repo", str(repo), "--base", base, "--head", head, "--json")
    assert code == 0 and [h["class"] for h in out["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]
    assert fake_module.calls[-1]["policy"] == {"gatedPaths": ["src/System/MarNameRefGen*.cpp"]}
    # neither: exit 2, never a silently empty policy
    monkeypatch.delenv("ORCH_ORDERING_POLICY")
    for argv in (("pr", "--repo", str(repo), "--base", base, "--head", head),
                 ("check", "--repo", str(repo), "--base-rev", base, "--head-rev", head)):
        code, out, err = cli(capsys, *argv, "--json")
        assert code == 2 and out is None and "ORCH_ORDERING_POLICY" in json.loads(err)["detail"]
    # an explicit flag wins over the environment
    monkeypatch.setenv("ORCH_ORDERING_POLICY", json.dumps({"gatedPaths": []}))
    code, out, _ = cli(capsys, "pr", "--repo", str(repo), "--base", base, "--head", head, "--policy-json",
                       json.dumps({"gatedPaths": ["src/System/*.cpp"]}), "--json")
    assert code == 0 and [h["class"] for h in out["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]
    code, _, err = cli(capsys, "pr", "--repo", str(repo), "--base", base, "--head", head, "--policy-json", "[1]",
                       "--json")
    assert code == 2 and "gatedPaths" in json.loads(err)["detail"]


def test_hunk_line_is_the_first_changed_member_line():
    before = "// header\n#include <x.h>\n\nclass TStub {\npublic:\n    TStub();\n    int a;\n};\n"
    after = "// header\n#include <x.h>\n\nclass TStub {\npublic:\n    TStub();\n    int a;\n    void act();\n    int b;\n};\n"
    res = run({"include/Enemy/Stub.hpp": (before, after)})
    [h] = res["hunks"]
    assert (h["class"], h["verdict"], h["line"], h["class_line"]) == ("TStub", "not_ready", 8, 4)
    new = run({"include/Enemy/Stub2.hpp": (None, "\n\nclass TStub {\n    int a;\n};\n")})
    assert (new["hunks"][0]["line"], new["hunks"][0]["class_line"]) == (3, 3)  # introduced: head = first line


def test_pr_prerequisite_needs_the_target_constructor_signature(repo: Path, fake_module, capsys):
    base = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-q", "-b", "bogus")
    head = commit(repo, {"src/Enemy/Stub.cpp": '#include "Enemy/Stub.hpp"\nTStub::TStub(Unrelated* u) { mX = 0; }\n',
                         REG: reg(["  if (b) return new TStub(name);"])}, "unrelated overload")
    code, out, _ = cli(capsys, "pr", "--repo", str(repo), "--base", base, "--head", head, "--json")
    assert code == 0 and out["same_pr_prerequisites"] == []
    assert [(h["class"], h["verdict"]) for h in out["hunks"] if h["file"] == REG and h["class"] == "TStub"] == [
        ("TStub", "order_gated")]


def test_order_refs_span_lines_and_placement_new():
    res = run({REG: (REG_BASE, reg(["  if (b) return new", "      TStub;", "  if (c) return new (gArena) TStub2;"]))},
              target="System/MarNameRefGen")
    # `new` and the class on different lines; placement new: both found, line = first added line of the expression
    assert sorted((h["class"], h["line"]) for h in res["hunks"] if h["verdict"] == "order_gated") == [
        ("TStub", 4), ("TStub2", 6)]
    # only the class line added (the `new` already there): still a reference
    base = reg(["  if (b) return new", "      TOld;"])
    res = run({REG: (base, reg(["  if (b) return new", "      TStub;"]))}, target="System/MarNameRefGen")
    assert [(h["class"], h["line"]) for h in res["hunks"] if h["verdict"] == "order_gated"] == [("TStub", 5)]


def test_precedent_uses_canonical_identity():
    class Qualified(FakeReadiness):
        def class_state(self, qualified):
            st = super().class_state(qualified.split("::")[-1] if qualified.startswith("Ready::") else qualified)
            return dict(st, **{"class": qualified})

    base = reg(["  if (x) return new Ready::TStub;"])
    after = reg(["  if (x) return new Ready::TStub;", "  if (y) return new TStub;"])
    res = run({REG: (base, after)}, target="System/MarNameRefGen", readiness=Qualified())
    assert [h["class"] for h in res["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]


def _inputs_sha(texts):
    import steering_check as sc

    return sc.unit_inputs_sha256(list(texts), lambda p: None if texts[p] is None else texts[p].encode())


def test_unused_certificate_bound_by_unit_inputs():
    header = "class TKoopa { void rolling(); int mX; int mHp; };\n"
    inputs = {"src/Enemy/Koopa.cpp": UNUSED_AFTER, "include/Enemy/Koopa.hpp": header}
    row = check_row(base_rev="0000000feedface", edits_hash="other", unit_inputs=sorted(inputs),
                    unit_inputs_sha256=_inputs_sha(inputs))
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    files = {"src/Enemy/Koopa.cpp": (UNUSED_BEFORE, UNUSED_AFTER), "include/Enemy/Koopa.hpp": (header, header)}
    # same unit inputs, different base revision and edits hash: still bound
    res = run(files, readiness=r, unused_checks=[row], edits_hash="e9")
    assert unused_verdicts(res) == [("TKoopa", "ready")]
    # a header the unit includes changed since certification: stale
    changed = dict(files, **{"include/Enemy/Koopa.hpp": (header, header.replace("int mHp;", "int mHp; int mY;"))})
    res = run(changed, readiness=r, unused_checks=[row])
    [h] = [h for h in res["hunks"] if "UNUSED" in h["reason"]]
    assert h["verdict"] == "unused_unverified" and "stale certificate (unit inputs changed); re-certify" in h["reason"]


def test_unit_inputs_vector_matches_the_shared_fixture():
    import steering_check as sc

    vec = json.loads((Path(__file__).resolve().parents[5] / "apps/server/src/core/validation/steering/__fixtures__/"
                      "unit-inputs-vector.json").read_text())
    for case in vec["cases"]:
        texts = {f["path"]: f["text"] for f in case["files"]}
        got = sc.unit_inputs_sha256(list(texts), lambda p: None if texts[p] is None else texts[p].encode("utf-8"))
        assert got == case["sha256"], case["name"]


INACTIVE_PREFIX = "#if 0\nint removed_text;\n#endif\n"


def test_inactive_prefix_does_not_shift_order_references():
    res = run({REG: (INACTIVE_PREFIX + REG_BASE, INACTIVE_PREFIX + reg(["  if (b) return new TStub();"]))},
              target="System/MarNameRefGen")
    assert [(h["class"], h["verdict"], h["line"]) for h in res["hunks"] if h["verdict"] == "order_gated"] == [
        ("TStub", "order_gated", 7)]


def test_inactive_prefix_does_not_hide_an_unused_reconstruction():
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    res = run({"src/Enemy/Koopa.cpp": (INACTIVE_PREFIX + UNUSED_BEFORE, INACTIVE_PREFIX + UNUSED_AFTER)},
              readiness=r, unused_checks=[])
    assert unused_verdicts(res) == [("TKoopa", "unused_unverified")] and res["verdict"] == "reject"


def test_unused_certificate_bound_by_compile_flags():
    import hashlib as _h

    class Flags(FakeReadiness):
        flags = "-O4,p -inline auto"

        def unit_flags(self, unit):
            return self.flags

    row = check_row(unit_flags_sha256=_h.sha256(b"-O4,p -inline auto").hexdigest())
    r = Flags(unused={"Enemy/Koopa": [MANGLED]})
    files = {"src/Enemy/Koopa.cpp": (UNUSED_BEFORE, UNUSED_AFTER)}
    assert unused_verdicts(run(files, readiness=r, unused_checks=[row])) == [("TKoopa", "ready")]
    r.flags = "-O4,s -inline auto"
    [h] = [h for h in run(files, readiness=r, unused_checks=[row])["hunks"] if "UNUSED" in h["reason"]]
    assert h["verdict"] == "unused_unverified" and "compile flags changed" in h["reason"]
    r.flags = None
    [h] = [h for h in run(files, readiness=r, unused_checks=[row])["hunks"] if "UNUSED" in h["reason"]]
    assert h["verdict"] == "unused_unverified" and "cannot verify" in h["reason"]


def test_macro_expansion_and_uncertain_macros_do_not_hide_references():
    # `#define A 1 + 2` / `#if A * 3 == 7` is true in C: the reference inside is live
    base = reg(["#define A 1 + 2", "#if A * 3 == 7", "#endif"])
    after = reg(["#define A 1 + 2", "#if A * 3 == 7", "  if (b) return new TStub();", "#endif"])
    res = run({REG: (base, after)}, target="System/MarNameRefGen")
    assert [h["class"] for h in res["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]
    # an #undef inside an undecidable branch makes FLAG uncertain: `#if FLAG` is scanned, not dropped
    lines = ["#define FLAG 1", "#if UNKNOWN", "#undef FLAG", "#endif", "#if FLAG"]
    res = run({REG: (reg(lines + ["#endif"]), reg(lines + ["  if (b) return new TStub();", "#endif"]))},
              target="System/MarNameRefGen")
    assert [h["class"] for h in res["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]
    # unsigned arithmetic is not modelled: `!(-1 < 1U)` (true in C) is undecidable, so the line is scanned
    res = run({REG: (reg(["#if !(-1 < 1U)", "#endif"]), reg(["#if !(-1 < 1U)", "  return new TStub();", "#endif"]))},
              target="System/MarNameRefGen")
    assert [h["class"] for h in res["hunks"] if h["verdict"] == "order_gated"] == ["TStub"]


def test_macro_conditions_hide_no_unused_reconstruction():
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    wrap = lambda t: "#define A 1 + 2\n#if A * 3 == 7\n" + t + "#endif\n"  # noqa: E731
    res = run({"src/Enemy/Koopa.cpp": (wrap(UNUSED_BEFORE), wrap(UNUSED_AFTER))}, readiness=r, unused_checks=[])
    assert unused_verdicts(res) == [("TKoopa", "unused_unverified")]


COMMENTED_DEFINE_BASE = ("#undef ENABLED\n/*\n#define ENABLED 1\n*/\n#if ENABLED\n"
                         "void TKoopa::rolling() { mX += 1; }\n#endif\n")
COMMENTED_DEFINE_CAND = ("#undef ENABLED\n/*\n#define ENABLED 1\n*/\n#define ENABLED 1\n#if ENABLED\n"
                         "void TKoopa::rolling() { mX += 2; }\n#endif\n")


def test_directives_in_comments_are_not_interpreted():
    # the base body is inside `#if ENABLED` with ENABLED #undef'd (the commented #define is no define):
    # it does not exempt the candidate's reconstruction, which needs a certificate
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP + COMMENTED_DEFINE_BASE, KOOPA_CPP + COMMENTED_DEFINE_CAND)},
              readiness=r, unused_checks=[])
    assert unused_verdicts(res) == [("TKoopa", "unused_unverified")] and res["verdict"] == "reject"


TRIGRAPH_BASE = ("#undef ENABLED\n// ??/\n#define ENABLED 1\n#if ENABLED\nvoid TKoopa::rolling() { mX += 1; }\n#endif\n")
TRIGRAPH_CAND = ("#undef ENABLED\n// ordinary comment\n#define ENABLED 1\n#if ENABLED\n"
                 "void TKoopa::rolling() { mX += 2; }\n#endif\n")


def test_trigraph_splice_in_a_comment_gives_no_evidence():
    # `??/` is a backslash: in C the newline is spliced and the #define is commented out
    r = FakeReadiness(unused={"Enemy/Koopa": [MANGLED]})
    res = run({"src/Enemy/Koopa.cpp": (KOOPA_CPP + TRIGRAPH_BASE, KOOPA_CPP + TRIGRAPH_CAND)},
              readiness=r, unused_checks=[])
    assert unused_verdicts(res) == [("TKoopa", "unused_unverified")] and res["verdict"] == "reject"
