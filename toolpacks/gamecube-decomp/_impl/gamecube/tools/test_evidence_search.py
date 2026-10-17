"""Tests for evidence_search.py.

Unit tests build a tiny SMS-shaped checkout (symbols.txt, a CodeWarrior map
excerpt, a header with inlines, report.json/objdiff.json, one source file)
and a fake JSystem refs root. Integration tests run against a real SMS
checkout and skip when none exists (set EVIDENCE_SMS_REPO to choose one).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import evidence_search as es  # noqa: E402

SYMBOLS = """\
execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor> = .text:0x802F44C4; // type:function size:0x294 scope:global align:4
__dt__19TNerveHanaSamboHideFv = .text:0x802F47B4; // type:function size:0x5C scope:weak align:4
moveObject__10THanaSamboFv = .text:0x802F5000; // type:function size:0x40 scope:global align:4
"""

MAP = """\
Link map of __start
  1] __start (func,weak) found in os.a __start.c
   2] moveObject__10THanaSamboFv (func,global) found in Enemy.a hanasambo.cpp
    3] mHeadJntIndex__10THanaSambo (object,global) found in Enemy.a hanasambo.cpp
    3] __vt__19TNerveHanaSamboHide (object,global) found in Enemy.a hanasambo.cpp
     4] __dt__19TNerveHanaSamboHideFv (func,weak) found in Enemy.a hanasambo.cpp
     4] execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor> (func,global) found in Enemy.a hanasambo.cpp
      5] @3510 (object,local) found in Enemy.a hanasambo.cpp
      5] setGlobalSRTMatrix__14JPABaseEmitterFPA4_f (func,global) found in JSystem.a JPAEmitter.cpp
       6] JPAGetRMtxSTVecElement__FPA4_fPA4_fRQ29JGeometry8TVec3<f>RQ29JGeometry8TVec3<f> (func,global) found in JSystem.a JPAMath.cpp
      5] _SDA_BASE_ found as linker generated symbol
         8] >>> UNREFERENCED DUPLICATE strlen
         8] >>> (func,weak) found in Runtime.PPCEABI.H.a __mem.c
     4] scale__Q29JGeometry8TVec3<f>Ff (func,weak) found in Enemy.a hanasambo.cpp
   2] __init_registers (func,local) found in os.a __start.c


.text section layout
  Starting        Virtual
  address  Size   address
  -----------------------
  00000000 000100 80005600  1 .text \tEnemy.a hanasambo.cpp
  00000000 000040 802f5000  4 moveObject__10THanaSamboFv \tEnemy.a hanasambo.cpp
  00000040 000294 802f44c4  4 execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor> \tEnemy.a hanasambo.cpp
  UNUSED   000064 ........ theNerve__19TNerveHanaSamboHideFv Enemy.a hanasambo.cpp
  000002d4 00005c 802f47b4  4 __dt__19TNerveHanaSamboHideFv \tEnemy.a hanasambo.cpp
  00000330 000030 802f4810  4 scale__Q29JGeometry8TVec3<f>Ff \tEnemy.a hanasambo.cpp
  00000400 000080 80300000  4 setGlobalSRTMatrix__14JPABaseEmitterFPA4_f \tJSystem.a JPAEmitter.cpp
  000876ec 000000 8008ccec __OSDBINTSTART (entry of __OSDBIntegrator) \tos.a OS.c


.data section layout
  Starting        Virtual
  address  Size   address
  -----------------------
  00000000 000010 803de714  4 __vt__19TNerveHanaSamboHide \tEnemy.a hanasambo.cpp


Memory map:
"""

HEADER = """\
#ifndef JG_VEC3_HPP
#define JG_VEC3_HPP
namespace JGeometry {

template <class T> class TVec3 { };

template <> class TVec3<f32> : public Vec {
public:
	TVec3() { }
	// "comment with { brace"
	void zero() { x = y = z = 0.0f; }

	template <class TY> void set(TY x_, TY y_, TY z_)
	{
		x = x_;
		y = y_;
		z = z_;
	}

	void scale(f32 scale)
	{
		x *= scale;
		y *= scale;
		z *= scale;
	}

	operator Vec*() const { return (Vec*)&x; }
	TVec3& operator+=(const TVec3& other);
	f32 length() const;
};

inline TVec3<f32>& TVec3<f32>::operator+=(const TVec3<f32>& other)
{
	x += other.x;
	return *this;
}

} // namespace JGeometry

namespace Other {
struct TVec3 {
	void scale(f32 s) { x *= s; }
};
}
#endif
"""

SOURCE = """\
#include <JSystem/JGeometry/JGVec3.hpp>

void THanaSambo::moveObject()
{
	JGeometry::TVec3<f32> scale(1.0f, 2.0f, 3.0f);
	mPos.scale(mSpeed);
}

void THanaSambo::init(TLiveManager* manager)
{
	JGeometry::TVec3<f32> v;
	v.scale(2.0f);
}

void TNerveHanaSamboHide::execute(TSpineBase<TLiveActor>* spine) const
{
	JGeometry::TVec3<f32> scale(1.0f, 2.0f, 3.0f);
}
"""

REPORT = {
    "units": [
        {
            "name": "mario/Enemy/hanasambo",
            "functions": [
                {"name": "moveObject__10THanaSamboFv", "size": "64", "fuzzy_match_percent": 100.0},
                {"name": "init__10THanaSamboFP12TLiveManager", "size": "64", "fuzzy_match_percent": 87.5},
                {"name": "execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor>", "size": "660", "fuzzy_match_percent": 100.0},
            ],
        }
    ]
}

OBJDIFF = {
    "units": [
        {
            "name": "mario/Enemy/hanasambo",
            "target_path": "build/GMSJ01/obj/Enemy/hanasambo.o",
            "base_path": "build/GMSJ01/src/Enemy/hanasambo.o",
            "metadata": {"source_path": "src/Enemy/hanasambo.cpp"},
        }
    ]
}


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    root = tmp_path / "repo"
    (root / "config" / "GMSJ01").mkdir(parents=True)
    (root / "config" / "GMSJ01" / "symbols.txt").write_text(SYMBOLS)
    (root / "orig" / "GMSJ01" / "files").mkdir(parents=True)
    (root / "orig" / "GMSJ01" / "files" / "mario.MAP").write_text(MAP)
    header = root / "libs" / "JSystem" / "include" / "JSystem" / "JGeometry" / "JGVec3.hpp"
    header.parent.mkdir(parents=True)
    header.write_text(HEADER)
    (root / "src" / "Enemy").mkdir(parents=True)
    (root / "src" / "Enemy" / "hanasambo.cpp").write_text(SOURCE)
    (root / "build" / "GMSJ01").mkdir(parents=True)
    (root / "build" / "GMSJ01" / "report.json").write_text(json.dumps(REPORT))
    (root / "objdiff.json").write_text(json.dumps(OBJDIFF))
    return root


@pytest.fixture()
def cache(tmp_path: Path) -> Path:
    return tmp_path / "cache"


def test_map_calls_resolves_readable_name_and_lists_first_reference_callees(repo: Path, cache: Path) -> None:
    result = es.map_calls(repo, "TNerveHanaSamboHide::execute", cache=cache)
    assert result["found"] is True
    assert result["mangled"] == "execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor>"
    assert result["object"] == "Enemy.a hanasambo.cpp"
    assert result["size"] == 0x294
    assert result["address"] == "0x802F44C4"
    callees = [(c["mangled"], c["kind"], c["scope"]) for c in result["callees"]]
    # Direct children only: the grandchild JPAGetRMtxSTVecElement belongs to setGlobalSRTMatrix,
    # and UNREFERENCED DUPLICATE rows are not references.
    assert callees == [
        ("@3510", "object", "local"),
        ("setGlobalSRTMatrix__14JPABaseEmitterFPA4_f", "func", "global"),
        ("_SDA_BASE_", "linker", "global"),
    ]
    assert result["callees"][1]["name"].startswith("JPABaseEmitter::setGlobalSRTMatrix")
    assert result["referenced_by"]["mangled"] == "__vt__19TNerveHanaSamboHide"
    assert "first" in result["note"]


def test_map_calls_accepts_mangled_and_full_readable_queries(repo: Path, cache: Path) -> None:
    mangled = es.map_calls(repo, "__dt__19TNerveHanaSamboHideFv", cache=cache)
    assert mangled["found"] and mangled["scope"] == "weak"
    readable = es.map_calls(repo, "JGeometry::TVec3<float>::scale (float)", cache=cache)
    assert readable["mangled"] == "scale__Q29JGeometry8TVec3<f>Ff"
    loose = es.map_calls(repo, "JGeometry::TVec3<f32>::scale", cache=cache)
    assert loose["mangled"] == "scale__Q29JGeometry8TVec3<f>Ff"


def test_map_calls_not_found_suggests_close_names(repo: Path, cache: Path) -> None:
    result = es.map_calls(repo, "TNerveHanaSamboHide::exec", cache=cache)
    assert result["found"] is False
    assert result["available"] is True


def test_map_unit_lists_weak_and_unused_functions_by_unit_name_or_path(repo: Path, cache: Path) -> None:
    for query in ("mario/Enemy/hanasambo", "src/Enemy/hanasambo.cpp", "hanasambo", "Enemy.a hanasambo.cpp"):
        result = es.map_unit(repo, query, cache=cache)
        assert result["found"], query
        assert result["objects"] == ["Enemy.a hanasambo.cpp"]
    result = es.map_unit(repo, "mario/Enemy/hanasambo", cache=cache)
    assert result["unit"] == "mario/Enemy/hanasambo"
    rows = {f["mangled"]: f for f in result["functions"]}
    assert ".text" not in rows
    assert "setGlobalSRTMatrix__14JPABaseEmitterFPA4_f" not in rows
    assert rows["__dt__19TNerveHanaSamboHideFv"]["kind"] == "weak"
    assert rows["theNerve__19TNerveHanaSamboHideFv"]["unused"] is True
    assert rows["theNerve__19TNerveHanaSamboHideFv"]["size"] == 0x64
    assert rows["moveObject__10THanaSamboFv"]["kind"] == "global"
    assert result["counts"] == {"functions": 5, "weak": 2, "local": 0, "unused": 1}


def test_map_parse_is_cached_by_mtime_and_size(repo: Path, cache: Path) -> None:
    es.map_calls(repo, "TNerveHanaSamboHide::execute", cache=cache)
    files = sorted(cache.glob("map-*.json"))
    assert len(files) == 1
    map_path = repo / "orig" / "GMSJ01" / "files" / "mario.MAP"
    map_path.write_text(MAP.replace("@3510", "@9999"))
    result = es.map_calls(repo, "TNerveHanaSamboHide::execute", cache=cache)
    assert result["callees"][0]["mangled"] == "@9999"
    assert len(sorted(cache.glob("map-*.json"))) == 2
    assert not list(repo.rglob("*.json.tmp"))


def test_missing_map_reports_unavailable(tmp_path: Path, cache: Path) -> None:
    root = tmp_path / "melee"
    (root / "config" / "GALE01").mkdir(parents=True)
    (root / "config" / "GALE01" / "symbols.txt").write_text("")
    assert es.map_calls(root, "fn", cache=cache)["available"] is False
    unit = es.map_unit(root, "main/melee/lb/lbmemory", cache=cache)
    assert unit["available"] is False and unit["functions"] == []


def test_inlines_finds_class_body_and_out_of_class_inline_members(repo: Path) -> None:
    rows = es.inlines(repo, "JGeometry::TVec3")
    names = [r["name"] for r in rows]
    assert "TVec3<f32>::scale" in names
    assert "TVec3<f32>::set" in names  # template member, not mistaken for a nested class
    assert "TVec3<f32>::operator Vec*" in names
    assert "TVec3<f32>::length" not in names  # declaration only
    assert "TVec3::operator+=" in names
    assert all(r["file"] == "libs/JSystem/include/JSystem/JGeometry/JGVec3.hpp" for r in rows)
    # Namespace qualifier excludes Other::TVec3.
    assert all(r["line"] < 40 for r in rows)
    scale = es.inlines(repo, "TVec3<float>", member="scale")
    assert len(scale) == 1
    assert scale[0]["body"].startswith("void scale(f32 scale)")
    assert "z *= scale;" in scale[0]["body"]
    assert scale[0]["kind"] == "class_body"
    out_of_class = [r for r in rows if r["name"] == "TVec3::operator+="][0]
    assert out_of_class["kind"] == "inline"
    unqualified = es.inlines(repo, "TVec3", member="scale")
    assert len(unqualified) == 2


def test_usage_reports_matching_callers_and_skips_variable_declarations(repo: Path) -> None:
    rows = es.usage(repo, "TVec3::scale")
    assert [(r["function"].split(" ")[0], r["match_percent"]) for r in rows] == [("THanaSambo::moveObject", 100.0)]
    assert rows[0]["unit"] == "mario/Enemy/hanasambo"
    assert rows[0]["call"] == "mPos.scale(mSpeed);"
    everything = es.usage(repo, "TVec3::scale", min_percent=0)
    assert {r["function"].split(" ")[0] for r in everything} == {"THanaSambo::moveObject", "THanaSambo::init"}
    assert es.usage(repo, "TVec3::scale", unit="src/Enemy/other.cpp") == []


def test_usage_without_report_is_unavailable(repo: Path) -> None:
    (repo / "build" / "GMSJ01" / "report.json").unlink()
    es.project_layout._cached_project_layout.cache_clear()
    with pytest.raises(es.EvidenceUnavailable):
        es.usage(repo, "TVec3::scale")


def test_jsystem_searches_refs_and_hints_when_missing(tmp_path: Path) -> None:
    refs = tmp_path / "refs"
    tp = refs / "tp" / "libs" / "JSystem" / "include"
    tp.mkdir(parents=True)
    (tp / "JPAEmitter.h").write_text("class JPABaseEmitter {\n  void setGlobalSRTMatrix(const Mtx m) {\n  }\n};\n")
    result = es.jsystem("setGlobalSRTMatrix", refs_root=refs)
    assert result["available"] is True
    assert result["total"] == 1
    hit = result["hits"][0]
    assert (hit["game"], hit["file"], hit["line"]) == ("tp", "libs/JSystem/include/JPAEmitter.h", 2)
    assert result["missing_games"] == ["tww"]
    assert "fetch_jsystem_refs.sh" in result["fetch_hint"]
    folded = es.jsystem("SETGLOBALSRTMATRIX", refs_root=refs)
    assert folded["total"] == 1
    missing = es.jsystem("x", refs_root=tmp_path / "none")
    assert missing["available"] is False and "fetch_jsystem_refs.sh" in missing["fetch_hint"]


def test_default_refs_root_order(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    sandbox = tmp_path / "opt-refs"
    monkeypatch.setattr(es, "SANDBOX_REFS_ROOT", sandbox)
    monkeypatch.setenv("ORCH_GAME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.delenv(es.REFS_ROOT_ENV, raising=False)
    # No sandbox refs: the state dir.
    assert es.default_refs_root() == tmp_path / "state" / "refs" / "jsystem"
    # Sandbox refs present: they win over the state dir.
    sandbox.mkdir()
    assert es.default_refs_root() == sandbox
    # An explicit override wins over both.
    monkeypatch.setenv(es.REFS_ROOT_ENV, str(tmp_path / "explicit"))
    assert es.default_refs_root() == tmp_path / "explicit"
    monkeypatch.delenv(es.REFS_ROOT_ENV)
    monkeypatch.delenv("ORCH_GAME_STATE_DIR")
    assert es.default_refs_root() == sandbox


def test_cli_uses_host_repo_env_over_sandbox_repo_env(repo: Path, tmp_path: Path) -> None:
    env = {
        **os.environ,
        "ORCH_GAME_HOST_REPO_ROOT": str(repo),
        "ORCH_GAME_REPO_ROOT": "/sandbox/does-not-exist",
        "ORCH_GAME_STATE_DIR": str(tmp_path / "state"),
    }
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "evidence_search.py"), "map-unit", "--unit", "mario/Enemy/hanasambo", "--json"],
        env=env, capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["status"] == "ok"
    assert payload["repo"] == str(repo)
    assert list((tmp_path / "state" / "cache" / "evidence").glob("map-*.json"))

    env.pop("ORCH_GAME_HOST_REPO_ROOT")
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "evidence_search.py"), "map-unit", "--unit", "x", "--json"],
        env=env, capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 0
    assert json.loads(proc.stdout)["status"] == "unavailable"


def test_refs_lock_pins_contract_commits() -> None:
    lock = json.loads((TOOLS / "refs.lock.json").read_text())
    assert lock["tp"]["commit"] == "c8fa8c9e2aab72cf4e5db0e5d1c84a9ea6ee6eb0"
    assert lock["tp"]["paths"] == ["libs/JSystem"]
    assert lock["tww"]["commit"] == "8b93b372dc8e841f12ddfb7e0215626f62b05417"
    assert lock["tww"]["paths"] == ["include/JSystem", "src/JSystem"]


# --------------------------------------------------------------------------
# Integration: real SMS checkout
# --------------------------------------------------------------------------

SMS_REPO = Path(os.environ.get(
    "EVIDENCE_SMS_REPO",
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up7f",
))
requires_sms = pytest.mark.skipif(
    not (SMS_REPO / "orig" / "GMSJ01" / "files" / "mario.MAP").is_file(), reason="no SMS checkout with mario.MAP"
)


@requires_sms
def test_sms_map_calls_hanasambo(tmp_path: Path) -> None:
    result = es.map_calls(SMS_REPO, "TNerveHanaSamboHide::execute", cache=tmp_path)
    assert result["found"] and result["object"] == "Enemy.a hanasambo.cpp"
    assert result["size"] == 0x294
    assert "TNerveHanaSamboAppear::__vt" in [c["name"] for c in result["callees"]]


@requires_sms
def test_sms_map_unit_hanasambo(tmp_path: Path) -> None:
    result = es.map_unit(SMS_REPO, "mario/Enemy/hanasambo", cache=tmp_path)
    assert result["found"] and result["counts"]["weak"] > 0 and result["counts"]["unused"] > 0
    assert any(f["name"].startswith("TNerveHanaSamboHide::theNerve") and f["unused"] for f in result["functions"])


@requires_sms
def test_sms_inlines_tvec3() -> None:
    names = {r["name"] for r in es.inlines(SMS_REPO, "JGeometry::TVec3", limit=200)}
    assert {"TVec3<f32>::scale", "TVec3<f32>::setAll", "TVec3<s16>::add"} <= names


# --------------------------------------------------------------------------
# usage certification (plan 3.0): matched = 100% and not "100% but unverified"
# --------------------------------------------------------------------------

UNVERIFIED_LIST = {
    "schema": "orch-unverified-matches-v1",
    "game_id": "sms",
    "gate": "enforce",
    "gate_active": True,
    "revision": "head-rev-1234567890",
    "generated_at": "2026-10-17T00:00:00.000Z",
    "unverified": [
        {"unit": "mario/Enemy/hanasambo", "symbol": "moveObject__10THanaSamboFv", "analyzed_rev": "backfill-rev-abc", "base_rev": "base-rev"},
    ],
}


def _add_certified_sibling(repo: Path) -> None:
    """A second 100% caller of TVec3::scale, so one sibling is certified and one unverified."""
    source = repo / "src" / "Enemy" / "hanasambo.cpp"
    source.write_text(source.read_text() + "\nvoid THanaSambo::calc()\n{\n\tmPos.scale(2.0f);\n}\n")
    report_path = repo / "build" / "GMSJ01" / "report.json"
    report = json.loads(report_path.read_text())
    report["units"][0]["functions"].append({"name": "calc__10THanaSamboFv", "size": "32", "fuzzy_match_percent": 100.0})
    report_path.write_text(json.dumps(report))


def _git(repo: Path, *args: str) -> str:
    env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
    return subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *args],
                          env=env, capture_output=True, text=True, check=True).stdout.strip()


def _commit(repo: Path, message: str = "base") -> str:
    if not (repo / ".git").exists():
        _git(repo, "init", "-q")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "--allow-empty", "-m", message)
    return _git(repo, "rev-parse", "HEAD")


def _gated(repo: Path, **over) -> dict:
    """UNVERIFIED_LIST bound to a commit of the checkout as it is now."""
    return {**UNVERIFIED_LIST, "revision": _commit(repo), **over}


def _write_list(path: Path, body: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body))
    return path


def test_usage_reports_certification_and_revision(repo: Path, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv(es.UNVERIFIED_ENV, raising=False)
    _add_certified_sibling(repo)
    body = _gated(repo)
    cert = es.load_certification(repo, _write_list(tmp_path / "unverified.json", body))
    rows = {r["mangled"]: r for r in es.usage(repo, "TVec3::scale", certification=cert)}
    assert rows["moveObject__10THanaSamboFv"]["certification"] == "unverified"
    assert rows["moveObject__10THanaSamboFv"]["revision"] == "backfill-rev-abc"
    assert rows["moveObject__10THanaSamboFv"]["matched"] is False
    assert rows["calc__10THanaSamboFv"]["certification"] == "certified"
    assert rows["calc__10THanaSamboFv"]["revision"] == body["revision"]
    assert rows["calc__10THanaSamboFv"]["matched"] is True
    # Matched siblings sort first.
    assert es.usage(repo, "TVec3::scale", certification=cert)[0]["mangled"] == "calc__10THanaSamboFv"


@pytest.fixture()
def no_gate_env(monkeypatch):
    for key in (es.UNVERIFIED_ENV, "ORCH_STEERING_GATE", "ORCH_GAME_DIR"):
        monkeypatch.delenv(key, raising=False)
    return monkeypatch


def test_usage_without_certification_data_is_unknown_not_evidence(repo: Path, no_gate_env) -> None:
    cert = es.load_certification(repo)
    assert cert.status == "unknown" and "unknown" in (cert.note or "")
    rows = es.usage(repo, "TVec3::scale")
    assert [(r["certification"], r["match_percent"], r["matched"]) for r in rows] == [("unknown", 100.0, False)]


def test_missing_or_corrupt_certification_file_is_unknown(repo: Path, tmp_path: Path, no_gate_env) -> None:
    _add_certified_sibling(repo)
    missing = es.load_certification(repo, tmp_path / "absent.json")
    assert missing.status == "unknown" and "not found" in (missing.note or "")
    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text('{"schema": "orch-unverified-matches-v1", "gate_active": tr')
    malformed = [
        {k: v for k, v in UNVERIFIED_LIST.items() if k != "unverified"},  # no list: must not certify everyone
        {**UNVERIFIED_LIST, "revision": None},
        {**UNVERIFIED_LIST, "gate": "enforce", "gate_active": False},
        {**UNVERIFIED_LIST, "gate": "strict"},
        {**UNVERIFIED_LIST, "unverified": [{"unit": "mario/Enemy/hanasambo"}]},
        {**UNVERIFIED_LIST, "schema": "other"},
    ]
    files = [corrupt] + [_write_list(tmp_path / f"bad{i}.json", body) for i, body in enumerate(malformed)]
    for path in files:
        cert = es.load_certification(repo, path)
        assert cert.status == "unknown", path
        rows = es.usage(repo, "TVec3::scale", certification=cert)
        assert rows and all(r["certification"] == "unknown" and not r["matched"] for r in rows), path
    # Through the env, too: a named file that is missing never falls back to the checkout default.
    _write_list(repo / es.UNVERIFIED_DEFAULT, UNVERIFIED_LIST)
    no_gate_env.setenv(es.UNVERIFIED_ENV, str(tmp_path / "absent.json"))
    assert es.load_certification(repo).status == "unknown"


def test_certification_sources_and_gate_off(repo: Path, tmp_path: Path, no_gate_env) -> None:
    # The checkout default is picked up without a flag or env.
    gated = _gated(repo)
    _write_list(repo / es.UNVERIFIED_DEFAULT, gated)
    assert es.load_certification(repo).classify("mario/Enemy/hanasambo", "moveObject__10THanaSamboFv")[0] == "unverified"
    # The env wins over the default; a game whose gate is off is ungated, and ungated 100% siblings are evidence.
    off = _write_list(tmp_path / "off.json", {**UNVERIFIED_LIST, "gate": "off", "gate_active": False, "unverified": []})
    no_gate_env.setenv(es.UNVERIFIED_ENV, str(off))
    assert es.load_certification(repo).classify("mario/Enemy/hanasambo", "moveObject__10THanaSamboFv") == ("ungated", "head-rev-1234567890")
    assert all(r["matched"] for r in es.usage(repo, "TVec3::scale"))
    # A symbol listed under another unit name still counts as unverified.
    cert = es.load_certification(repo, _write_list(tmp_path / "u.json", gated))
    assert cert.classify("main/Enemy/hanasambo", "moveObject__10THanaSamboFv")[0] == "unverified"
    assert cert.classify("mario/Enemy/hanasambo", "calc__10THanaSamboFv")[0] == "certified"


def test_without_a_file_only_a_confirmed_gate_off_is_ungated(repo: Path, tmp_path: Path, no_gate_env) -> None:
    no_gate_env.setenv("ORCH_STEERING_GATE", "off")
    assert es.load_certification(repo).status == "ungated"
    no_gate_env.setenv("ORCH_STEERING_GATE", "enforce")
    assert es.load_certification(repo).status == "unknown"
    no_gate_env.delenv("ORCH_STEERING_GATE")
    game = tmp_path / "game"
    game.mkdir()
    no_gate_env.setenv("ORCH_GAME_DIR", str(game))
    assert es.load_certification(repo).status == "unknown"  # no game.json: not confirmed
    (game / "game.json").write_text(json.dumps({"id": "melee"}))
    assert es.load_certification(repo).status == "ungated"  # registry default: off
    (game / "game.json").write_text(json.dumps({"id": "sms", "matching": {"steeringGate": "enforce"}}))
    assert es.load_certification(repo).status == "unknown"


def test_cli_usage_lists_uncertified_siblings_as_hypotheses(repo: Path, tmp_path: Path) -> None:
    _add_certified_sibling(repo)
    env = {**os.environ, "ORCH_GAME_HOST_REPO_ROOT": str(repo), "ORCH_GAME_STATE_DIR": str(tmp_path / "state"),
           es.UNVERIFIED_ENV: str(_write_list(tmp_path / "unverified.json", _gated(repo)))}
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "evidence_search.py"), "usage", "--inline", "TVec3::scale", "--json"],
        env=env, capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert [(r["mangled"], r["certification"]) for r in payload["results"]] == [("calc__10THanaSamboFv", "certified")]
    assert [(r["mangled"], r["certification"]) for r in payload["hypotheses"]] == [("moveObject__10THanaSamboFv", "unverified")]
    assert payload["total"] == 1 and payload["hypotheses_total"] == 1
    assert payload["certification"]["gated"] is True and payload["certification"]["unverified_count"] == 1


def test_cli_usage_with_a_corrupt_file_lists_no_evidence(repo: Path, tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.json"
    corrupt.write_text("not json")
    env = {**os.environ, "ORCH_GAME_HOST_REPO_ROOT": str(repo), "ORCH_GAME_STATE_DIR": str(tmp_path / "state"),
           es.UNVERIFIED_ENV: str(corrupt)}
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "evidence_search.py"), "usage", "--inline", "TVec3::scale", "--json"],
        env=env, capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["results"] == [] and payload["total"] == 0
    assert [(r["mangled"], r["certification"]) for r in payload["hypotheses"]] == [("moveObject__10THanaSamboFv", "unknown")]
    assert payload["certification"]["status"] == "unknown" and "unreadable" in payload["certification"]["note"]


@pytest.mark.parametrize("certification_file", ["missing", "corrupt"])
def test_probe_keeps_unknown_siblings_out_of_evidence_after_fit(repo: Path, tmp_path: Path, no_gate_env,
                                                                certification_file: str) -> None:
    """Missing/corrupt certification data through usage -> prefetch_evidence -> the probe's fit() cap."""
    import steering_diagnose as sd

    _add_certified_sibling(repo)
    path = tmp_path / "unverified.json"
    if certification_file == "corrupt":
        path.write_text('{"schema": "orch-unverified-matches-v1", "game_id": "sms", "gate": "enforce", "gate_active": true}')
    no_gate_env.setenv(es.UNVERIFIED_ENV, str(path))
    evidence = sd.prefetch_evidence(repo, "moveObject__10THanaSamboFv", "mario/Enemy/hanasambo", "TVec3", "scale")
    assert evidence["sibling_uses"] == []
    assert {s["certification"] for s in evidence["sibling_hypotheses"]} == {"unknown"}
    long = "x" * 3000
    probe = sd.fit({"function": "THanaSambo::moveObject()", "symbol": "moveObject__10THanaSamboFv", "unit": "mario/Enemy/hanasambo",
                    "decision": "steering_located", "match": {}, "steering_edits": [], "unresolved": [],
                    "hypotheses": [{"cause": "c", "why": long, "how_to_check": "x"}],
                    "evidence": evidence, "lessons": [], "rulings": []})
    assert len(json.dumps(probe, separators=(",", ":"))) <= sd.PROBE_LIMIT
    kept = probe.get("evidence") or {}
    assert kept.get("sibling_uses", []) == []
    assert kept["sibling_hypotheses"] and all(s["certification"] == "unknown" for s in kept["sibling_hypotheses"])



def test_gated_list_must_describe_this_checkout(repo: Path, tmp_path: Path, no_gate_env) -> None:
    _add_certified_sibling(repo)
    first = _commit(repo, "first")
    # A list derived at an ancestor of HEAD still binds; the file is unchanged since then.
    head = _commit(repo, "second")
    assert es.load_certification(repo, _write_list(tmp_path / "a.json", {**UNVERIFIED_LIST, "revision": first})).status == "gated"
    assert es.load_certification(repo, _write_list(tmp_path / "b.json", {**UNVERIFIED_LIST, "revision": head})).status == "gated"
    # A revision this checkout does not contain, or that is not an ancestor of HEAD, does not.
    for bad in ("0" * 40, "head-rev-1234567890", "--output=x"):
        cert = es.load_certification(repo, _write_list(tmp_path / "bad.json", {**UNVERIFIED_LIST, "revision": bad}))
        assert cert.status == "unknown" and "does not describe this checkout" in (cert.note or ""), bad
    _git(repo, "checkout", "-q", first)
    detached = es.load_certification(repo, _write_list(tmp_path / "later.json", {**UNVERIFIED_LIST, "revision": head}))
    assert detached.status == "unknown"
    # Another game's list never binds.
    no_gate_env.setenv("ORCH_GAME_ID", "melee")
    assert es.load_certification(repo, _write_list(tmp_path / "game.json", {**UNVERIFIED_LIST, "revision": first})).status == "unknown"
    no_gate_env.setenv("ORCH_GAME_ID", "sms")
    assert es.load_certification(repo, _write_list(tmp_path / "game.json", {**UNVERIFIED_LIST, "revision": first})).status == "gated"


def test_a_sibling_edited_since_the_certified_revision_is_unknown(repo: Path, tmp_path: Path, no_gate_env) -> None:
    """A worker edits a certified sibling (a new call to the inline) without certifying it: not evidence."""
    import steering_diagnose as sd

    source = repo / "src" / "Enemy" / "hanasambo.cpp"
    source.write_text(source.read_text() + "\nvoid THanaSambo::calc()\n{\n\tmPos.zero();\n}\n")
    report_path = repo / "build" / "GMSJ01" / "report.json"
    report = json.loads(report_path.read_text())
    report["units"][0]["functions"].append({"name": "calc__10THanaSamboFv", "size": "32", "fuzzy_match_percent": 100.0})
    report_path.write_text(json.dumps(report))
    no_gate_env.setenv(es.UNVERIFIED_ENV, str(_write_list(tmp_path / "unverified.json", _gated(repo, unverified=[]))))
    # At the certified revision the sibling does not call scale(); the edit adds the call.
    source.write_text(source.read_text().replace("mPos.zero();", "mPos.scale(2.0f);"))
    rows = {r["mangled"]: r for r in es.usage(repo, "TVec3::scale")}
    assert rows["calc__10THanaSamboFv"]["certification"] == "unknown" and rows["calc__10THanaSamboFv"]["matched"] is False
    assert rows["moveObject__10THanaSamboFv"]["certification"] == "unknown"  # same file, also edited
    evidence = sd.prefetch_evidence(repo, "calc__10THanaSamboFv", "mario/Enemy/hanasambo", "TVec3", "scale")
    assert evidence["sibling_uses"] == []
    assert {s["certification"] for s in evidence["sibling_hypotheses"]} == {"unknown"}
    probe = sd.fit({"function": "THanaSambo::calc()", "symbol": "calc__10THanaSamboFv", "unit": "mario/Enemy/hanasambo",
                    "decision": "steering_located", "match": {}, "steering_edits": [], "unresolved": [],
                    "hypotheses": [{"cause": "c", "why": "x" * 3000, "how_to_check": "x"}],
                    "evidence": evidence, "lessons": [], "rulings": []})
    assert (probe.get("evidence") or {}).get("sibling_uses", []) == []
    # Restoring the certified text makes the sibling evidence again.
    source.write_text(source.read_text().replace("mPos.scale(2.0f);", "mPos.zero();"))
    assert "calc__10THanaSamboFv" not in {r["mangled"] for r in es.usage(repo, "TVec3::scale")}
    assert [r["certification"] for r in es.usage(repo, "TVec3::scale")] == ["certified"]
