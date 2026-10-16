"""Decompile-in-order gate (objectives/sms-real-codegen/order-rule.md section 1).

Evidence (link map, report.json, objdiff.json) comes from
test_steering_pipeline.write_order_evidence: TKoopa's unit is a blank stub,
TTinKoopa's is at 98.5%. The `@needs_sandbox` case runs against the read-only
SMS sandbox at upstream 7fed828b with the boss-enemy factory commit 866973a4.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import steering_check as sc  # noqa: E402
from test_steering_check import git_repo  # noqa: E402
from test_steering_pipeline import ORDER_FILE, write_order_evidence  # noqa: E402

BASE = 'void getNameRef()\n{\n    if (strcmp(name, "A") == 0) return new TMarNameRefGen;\n}\n'
HEADER = "#ifndef K\n#define K\nclass TKoopa : public TSpineEnemy {\npublic:\n    TKoopa(const char*);\n};\n#endif\n"


@pytest.fixture
def repo(tmp_path):
    r = git_repo(tmp_path, {ORDER_FILE: BASE, "include/Enemy/Koopa.hpp": HEADER,
                            "include/Enemy/Mystery.hpp": "class TMystery {};\n"})
    write_order_evidence(r)
    return r


def files(repo: Path, cand: str, path: str = ORDER_FILE) -> list[dict]:
    (repo / path).write_text(cand)
    return sc.build_edits(repo, "HEAD", unit_resolver=lambda fs: ("V1", [], {}))["files"]


def decide(repo: Path, cand: str, path: str = ORDER_FILE, evidence: bool = True) -> tuple[dict, dict]:
    fs = files(repo, cand, path)
    base_rev = sc.rev_parse(repo, "HEAD")
    refs = sc.order_refs(fs, lambda inc: sc._header_text({"files": fs, "base_rev": base_rev}, repo, inc))
    red = {"edits_hash": "h", "analysis": "complete", "incomplete_reasons": [], "global_incomplete": [],
           "groups": [], "units": [], "base_rev": base_rev, "order_refs": refs}
    mw = {"edits_hash": "h", "coverage": [], "functions": []}
    dec = sc.decide(red, mw, evidence_repo=repo if evidence else None, probes=False, version="V1")
    return red, dec


def add(line: str) -> str:
    return BASE.replace("}\n", f"    {line}\n}}\n")


def test_decompiled_class_passes(repo) -> None:
    red, dec = decide(repo, add('if (strcmp(name, "Tin") == 0) return new TTinKoopa("x");'))
    assert [(r["class"], r["via"]) for r in red["order_refs"]] == [("TTinKoopa", "new")]
    assert dec["attempt"] == "pass" and dec["violations"] == []
    assert dec["order_checks"][0]["status"] == "ok" and dec["order_checks"][0]["owner_progress"] == 98.5
    assert dec["order_checks"][0]["owner_unit"] == "mario/Enemy/tinkoopa"


def test_undecompiled_class_is_out_of_order(repo) -> None:
    _, dec = decide(repo, add('if (strcmp(name, "Koopa") == 0) return new TKoopa("y");'))
    assert dec["attempt"] == "rule_violation"
    [v] = dec["violations"]
    assert v["kind"] == "out_of_order" and v["class"] == "TKoopa" and v["line"] == 4
    assert v["owner_unit"] == "mario/Enemy/Koopa" and v["owner_progress"] == 0.0 and "constructor" in v["reason"]


def test_scope_and_call_references(repo) -> None:
    red, dec = decide(repo, add("TKoopa::instance(); TTinKoopa(1);"))
    assert {(r["class"], r["via"]) for r in red["order_refs"]} == {("TKoopa", "scope"), ("TTinKoopa", "call")}
    assert [v["class"] for v in dec["violations"]] == ["TKoopa"]


def test_added_includes_are_not_references(repo) -> None:
    red, dec = decide(repo, "#include <Enemy/Koopa.hpp>\n#include <Enemy/Mystery.hpp>\n" + BASE)
    assert red["order_refs"] == [] and dec["attempt"] == "pass" and dec["violations"] == []


def test_precedent_in_the_base_text_is_ready(repo) -> None:
    base = add('if (strcmp(name, "Koopa") == 0) return new TKoopa("y");')
    (repo / ORDER_FILE).write_text(base)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                    "commit", "-qam", "upstream already constructs TKoopa"], check=True)
    red, dec = decide(repo, base.replace("}\n", '    if (strcmp(name, "Koopa2") == 0) return new TKoopa("z");\n}\n'))
    assert [(r["class"], r["precedent_names"]) for r in red["order_refs"]] == [("TKoopa", ["TKoopa"])]
    assert dec["attempt"] == "pass" and dec["order_checks"][0]["status"] == "ok"
    assert "precedent" in dec["order_checks"][0]["reason"]


def test_unknown_owner_is_unresolved(repo) -> None:
    _, dec = decide(repo, add("return new TMystery;"))
    assert dec["attempt"] == "unresolved" and dec["violations"] == []
    assert any("decompile-in-order" in r for r in dec["reasons"])


def test_readiness_unavailable_is_unresolved(repo) -> None:
    (repo / "build/V1/report.json").unlink()  # progress is context only
    _, dec = decide(repo, add('return new TTinKoopa("x");'))
    assert dec["attempt"] == "pass" and dec["order_checks"][0]["owner_progress"] is None
    (repo / "orig/V1/files/game.MAP").unlink()
    sc._READINESS_CACHE.clear()
    _, dec = decide(repo, add('return new TTinKoopa("x");'))
    assert dec["attempt"] == "unresolved" and dec["order_checks"][0]["status"] == "unknown"
    assert "missing_map" in dec["order_checks"][0]["reason"]
    _, dec = decide(repo, add('return new TTinKoopa("x");'), evidence=False)
    assert dec["attempt"] == "unresolved"


def test_comments_and_other_files_are_ignored(repo) -> None:
    red, dec = decide(repo, add('// return new TKoopa("y");'))
    assert red["order_refs"] == [] and dec["attempt"] == "pass" and dec["order_checks"] == []
    (repo / "src/Other.cpp").write_text("void f() { new TKoopa; }\n")
    red, _ = decide(repo, BASE)
    assert red["order_refs"] == []


def test_apply_reverts_out_of_order_hunks(repo) -> None:
    cand = add('if (strcmp(name, "Koopa") == 0) return new TKoopa("y");')
    red, dec = decide(repo, cand)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=lambda fs: ("V1", [], {}))
    report = {"edits": sc.omit_texts(edits), "reduce": {"groups": []}, "mwcc": {"revert_edits": []}, "decision": dec}
    out = sc.run_apply(report, dry_run=False)
    assert out["files"][0]["path"] == ORDER_FILE and out["files"][0]["reverted"]
    text = (repo / ORDER_FILE).read_text()  # S* is line-preserving: the reverted line stays blank
    assert "TKoopa" not in text and text.replace("\n\n}", "\n}") == BASE


# --------------------------------------------------------------------------
# Real SMS sandbox (read-only): upstream 7fed828b vs the boss-enemy factory commit
# --------------------------------------------------------------------------

SANDBOX = Path(os.environ.get(
    "STEERING_SMS_SANDBOX",
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up7f",
))
UPSTREAM, FACTORY = "7fed828b", "866973a4"
BOSS = "src/System/MarNameRefGen_BossEnemy.cpp"


def _sandbox_git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(SANDBOX), *args], capture_output=True, check=check)


needs_sandbox = pytest.mark.skipif(
    not ((SANDBOX / "build/GMSJ01/report.json").is_file() and (SANDBOX / "objdiff.json").is_file()
         and all(_sandbox_git("cat-file", "-e", f"{r}^{{commit}}", check=False).returncode == 0
                 for r in (UPSTREAM, FACTORY))) if SANDBOX.is_dir() else True,
    reason="needs the SMS sandbox at 7fed828b with commit 866973a4 (set STEERING_SMS_SANDBOX)")


def real_decide(tmp_path: Path, text: str) -> tuple[dict, dict]:
    overlay = tmp_path / "overlay"
    (overlay / BOSS).parent.mkdir(parents=True, exist_ok=True)
    (overlay / BOSS).write_text(text)
    state = _sandbox_git("status", "--porcelain").stdout
    edits = sc.build_edits(SANDBOX, UPSTREAM, overlay_dir=overlay, unit_resolver=lambda fs: ("GMSJ01", [], {}))
    refs = sc.order_refs(edits["files"], lambda inc: sc._header_text(edits, SANDBOX, inc))
    red = {"edits_hash": "h", "analysis": "complete", "incomplete_reasons": [], "global_incomplete": [],
           "groups": [], "units": [], "base_rev": edits["base_rev"], "order_refs": refs}
    dec = sc.decide(red, {"edits_hash": "h", "coverage": [], "functions": []}, evidence_repo=SANDBOX,
                    probes=False, version="GMSJ01")
    assert _sandbox_git("status", "--porcelain").stdout == state
    return red, dec


@needs_sandbox
def test_real_boss_enemy_factory_is_out_of_order(tmp_path) -> None:
    text = _sandbox_git("show", f"{FACTORY}:{BOSS}").stdout.decode()
    _, dec = real_decide(tmp_path, text)
    late = {v["class"]: v for v in dec["violations"]}
    assert dec["attempt"] in ("rule_violation", "unresolved"), dec["reasons"]
    assert {"TKoopa", "TKoopaManager", "TKoopaJr", "TBossHanachan", "TBossWanwan"} <= set(late)
    assert late["TKoopa"]["owner_unit"] == "mario/Enemy/Koopa" and late["TKoopa"]["owner_progress"] == 0.0
    print("real #347 order:", dec["attempt"], len(dec["violations"]), sorted(late),
          sorted({c["class"] for c in dec["order_checks"] if c["status"] == "unknown"}))


@needs_sandbox
def test_real_decompiled_class_line_passes(tmp_path) -> None:
    up = _sandbox_git("show", f"{UPSTREAM}:{BOSS}").stdout.decode()
    needle = '\tif (strcmp(name, "TinKoopaManager") == 0)'
    assert up.count(needle) == 1
    text = up.replace(needle, '\tif (strcmp(name, "TinKoopa2") == 0)\n\t\treturn new TTinKoopa("x");\n\n' + needle)
    text = text.replace(needle, '\tif (strcmp(name, "ChuuHana2") == 0)\n\t\treturn new TChuuHana("y");\n\n' + needle)
    _, dec = real_decide(tmp_path, text)
    assert dec["attempt"] == "pass" and dec["violations"] == []
    checks = {c["class"]: c for c in dec["order_checks"]}
    assert checks["TTinKoopa"]["status"] == "ok" and "precedent" in checks["TTinKoopa"]["reason"]  # upstream has it
    assert checks["TChuuHana"]["status"] == "ok" and checks["TChuuHana"]["owner_unit"] == "mario/Enemy/chuuhana"


def test_multiline_and_placement_new_are_references(repo) -> None:
    red, dec = decide(repo, add('if (strcmp(name, "Koopa") == 0) return new\n        TKoopa("y");').replace(
        "}\n", '    if (p) return new (gArena) TKoopa;\n}\n'))
    assert sorted((r["class"], r["line"]) for r in red["order_refs"]) == [("TKoopa", 4), ("TKoopa", 6)]
    assert dec["attempt"] == "rule_violation" and {v["line"] for v in dec["violations"]} == {4, 6}


def test_precedent_needs_canonical_identity(repo) -> None:
    # the base constructs Other::TKoopa (no such class in the map): it does not cover TKoopa
    base = add("if (x) return new Other::TKoopa;")
    (repo / ORDER_FILE).write_text(base)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                    "commit", "-qam", "other TKoopa"], check=True)
    red, dec = decide(repo, base.replace("}\n", '    if (y) return new TKoopa("z");\n}\n'))
    assert red["order_refs"][0]["precedent_names"] == ["Other::TKoopa"]
    assert [v["class"] for v in dec["violations"]] == ["TKoopa"]


def test_unsigned_hex_and_if0_conditions_do_not_hide_order_references(repo) -> None:
    for cond in ("#if 0xffffffffffffffff == -1", "#if 0"):
        red, dec = decide(repo, add(cond + '\n    return new TKoopa("y");\n#endif'))
        assert [r["class"] for r in red["order_refs"]] == ["TKoopa"], cond
        assert dec["attempt"] == "rule_violation", cond
