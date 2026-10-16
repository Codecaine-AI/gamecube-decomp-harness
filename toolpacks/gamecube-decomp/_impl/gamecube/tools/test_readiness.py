"""readiness.py: class owners, revision-bound readiness, function readiness, CLI.

Fixture: real ELF32 target objects (functions with code relocations, vtable
data symbols, global and weak bindings) under build/V/obj, an objdiff.json,
a tiny link map, and a git history of the owner sources.
"""

from __future__ import annotations

import json
import os
import struct
import subprocess
import sys
from pathlib import Path
from typing import Optional

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import readiness as rd  # noqa: E402

GLOBAL, WEAK = 1, 2
R_PPC_REL24, R_PPC_ADDR32 = 10, 1


def fixture_elf(functions: list[tuple[str, int, list[str]]], data: list[tuple[str, int]] = ()) -> bytes:
    """ELF32 big-endian relocatable: each function = one word per call (`bl`
    with an R_PPC_REL24 relocation) + blr; data symbols 4 bytes in .data."""
    words_all: list[int] = []
    relocs: list[tuple[int, str]] = []
    fsyms: list[tuple[str, int, int, int]] = []  # name, bind, value, size
    for name, bind, calls in functions:
        start = 4 * len(words_all)
        for callee in calls:
            relocs.append((4 * len(words_all), callee))
            words_all.append((18 << 26) | 1)
        words_all.append(0x4E800020)
        fsyms.append((name, bind, start, 4 * len(words_all) - start))
    text = b"".join(struct.pack(">I", w) for w in words_all)
    data_blob = b"\0" * (4 * len(data) or 4)
    shstr = b"\0.text\0.data\0.rela.text\0.symtab\0.strtab\0.shstrtab\0"
    strtab = b"\0"
    syms = [struct.pack(">IIIBBH", 0, 0, 0, 0, 0, 0)]
    index: dict[str, int] = {}

    def add(name: str, value: int, size: int, info: int, shndx: int) -> None:
        nonlocal strtab
        off = len(strtab)
        strtab += name.encode() + b"\0"
        index[name] = len(syms)
        syms.append(struct.pack(">IIIBBH", off, value, size, info, 0, shndx))

    for name, bind, value, size in fsyms:
        add(name, value, size, (bind << 4) | 2, 1)
    for k, (name, bind) in enumerate(data):
        add(name, 4 * k, 4, (bind << 4) | 1, 2)
    for _, callee in relocs:
        if callee not in index:
            add(callee, 0, 0, GLOBAL << 4, 0)
    rela = b"".join(struct.pack(">IIi", o, (index[s] << 8) | R_PPC_REL24, 0) for o, s in relocs)
    blobs = [text, data_blob, rela, b"".join(syms), strtab, shstr]
    offsets, body, cursor = [], b"", 52
    for blob in blobs:
        offsets.append(cursor + len(body))
        body += blob + b"\0" * (-len(blob) % 4)
    shoff = 52 + len(body)
    sh = [b"\0" * 40]
    specs = [(".text", 1, 0x6, 0, 0, 4, 0), (".data", 1, 0x3, 0, 0, 4, 0), (".rela.text", 4, 0, 4, 1, 4, 12),
             (".symtab", 2, 0, 5, 1, 4, 16), (".strtab", 3, 0, 0, 0, 1, 0), (".shstrtab", 3, 0, 0, 0, 1, 0)]

    def name_off(n: str) -> int:
        return shstr.index(n.encode() + b"\0")

    for (n, typ, flags, link, info, align, ent), blob, o in zip(specs, blobs, offsets):
        sh.append(struct.pack(">10I", name_off(n), typ, flags, 0, o, len(blob), link, info, align, ent))
    ident = b"\x7fELF\x01\x02\x01" + b"\0" * 9
    ehdr = ident + struct.pack(">HHIIIIIHHHHHH", 1, 20, 1, 0, 0, shoff, 0, 52, 0, 0, 40, len(sh), 6)
    return ehdr + body + b"".join(sh)


# unit -> (source, target object functions, data symbols)
UNITS = {
    "mario/Enemy/Koopa": ("src/Enemy/Koopa.cpp",
                          [("__ct__6TKoopaFPCc", GLOBAL, []), ("fall__6TKoopaFv", GLOBAL, [])],
                          [("__vt__6TKoopa", GLOBAL)]),
    "mario/Enemy/tinkoopa": ("src/Enemy/tinkoopa.cpp",
                             [("__ct__9TTinKoopaFPCc", GLOBAL, []),
                              ("move__9TTinKoopaFv", GLOBAL, ["__ct__6TKoopaFPCc", "fall__6TKoopaFv"])],
                             [("__vt__9TTinKoopa", GLOBAL)]),
    "mario/Enemy/Kukku": ("src/Enemy/Kukku.cpp",
                          [("__ct__6TKukkuFv", WEAK, []), ("act__6TKukkuFv", GLOBAL, [])],
                          [("__vt__6TKukku", GLOBAL)]),
    "mario/Map/a": ("src/Map/a.cpp",
                    [("f__4TMajFv", GLOBAL, []), ("g__4TMajFv", GLOBAL, []), ("__dt__4TMajFv", GLOBAL, []),
                     ("f__4TTieFv", GLOBAL, []), ("useTie__Fv", GLOBAL, ["__dt__4TTieFv", "__ct__4TTieFv"])], []),
    "mario/Map/b": ("src/Map/b.cpp",
                    [("h__4TMajFv", GLOBAL, []), ("g__4TTieFv", GLOBAL, []), ("__ct__4TTieFv", WEAK, []),
                     ("__ct__5TWeakFv", WEAK, []), ("get__5TWeakFv", WEAK, []),
                     ("GetValue__6JDramaFPCc", GLOBAL, [])], []),
    "mario/Map/asm": (None, [("__ct__5TAsmXFv", GLOBAL, [])], [("__vt__5TAsmX", GLOBAL)]),
    "mario/System/MarNameRefGen_Enemy": ("src/System/MarNameRefGen_Enemy.cpp",
                                         [("getNameRef_Enemy__14TMarNameRefGenCFPCc", GLOBAL,
                                           ["__ct__6TKoopaFPCc", "__ct__9TTinKoopaFPCc", "__ct__6TKukkuFv",
                                            "__ct__5TWeakFv", "__ct__4TTieFv", "__ct__5TAsmXFv"])], []),
}
MAP = """Link map of __start
  1] __start (func,global) found in os.a __start.c

.text section layout
  Starting        Virtual
  address  Size   address
  -----------------------
  UNUSED   000010 ........ stripped__6TKoopaFv Enemy.a Koopa.cpp
  UNUSED   000010 ........ unusedOnly__7TGhostXFv Enemy.a Koopa.cpp
"""
HEADER = "class TKoopa {\npublic:\n    TKoopa(const char* name) { }  // bogus inline ctor\n    void fall();\n};\n"
TIN = ("#include <Enemy/Koopa.hpp>\nTTinKoopa::TTinKoopa(const char* name) { }\n"
       "void TTinKoopa::move() { fall(); }\n")


def git(repo: Path, *args: str) -> str:
    env = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"]
    return subprocess.run(["git", "-C", str(repo), *env, *args], capture_output=True, check=True).stdout.decode().strip()


def commit(repo: Path, files: dict[str, str], msg: str) -> str:
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    git(repo, "add", "-A", "src", "include")
    git(repo, "commit", "-q", "--allow-empty", "-m", msg)
    return git(repo, "rev-parse", "HEAD")


def write_readiness_repo(repo: Path, version: str = "V", units: Optional[dict] = None, map_text: str = MAP) -> None:
    """Target objects, objdiff.json and link map (untracked, as in a real checkout)."""
    units = units or UNITS
    rows = []
    for name, (src, funcs, data) in units.items():
        stem = name.split("/", 1)[1]
        target = f"build/{version}/obj/{stem}.o"
        (repo / target).parent.mkdir(parents=True, exist_ok=True)
        (repo / target).write_bytes(fixture_elf(funcs, data))
        rows.append({"name": name, "target_path": target, "base_path": f"build/{version}/src/{stem}.o",
                     "metadata": {"source_path": src} if src else {}})
    (repo / "objdiff.json").write_text(json.dumps({"units": rows}))
    (repo / f"orig/{version}/files").mkdir(parents=True, exist_ok=True)
    (repo / f"orig/{version}/files/game.MAP").write_text(map_text)


@pytest.fixture
def history(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    write_readiness_repo(repo)
    revs = {}
    revs["stub"] = commit(repo, {"src/Enemy/Koopa.cpp": "// stub\n", "include/Enemy/Koopa.hpp": HEADER,
                                 "src/Enemy/tinkoopa.cpp": TIN, "src/Enemy/Kukku.cpp": "\n",
                                 "src/Map/a.cpp": "\n", "src/Map/b.cpp": "namespace JDrama {}\n",
                                 "src/System/MarNameRefGen_Enemy.cpp": "\n"}, "stub")
    revs["started"] = commit(repo, {"src/Enemy/Koopa.cpp": "#include <Enemy/Koopa.hpp>\nvoid TKoopa::fall() { }\n"},
                             "trivial member")
    revs["inactive"] = commit(repo, {"src/Enemy/Koopa.cpp": (
        "#include <Enemy/Koopa.hpp>\nvoid TKoopa::fall() { }\n#if 0\nTKoopa::TKoopa(const char* n) { }\n#endif\n"
        "// TKoopa::TKoopa(const char* n) { }\n/* TKoopa::TKoopa(const char* n) { } */\n")}, "inactive ctor")
    revs["wrong_sig"] = commit(repo, {"src/Enemy/Koopa.cpp": (
        "#include <Enemy/Koopa.hpp>\nvoid TKoopa::fall() { }\nTKoopa::TKoopa(int n) { }\n")}, "wrong signature")
    revs["ready"] = commit(repo, {"src/Enemy/Koopa.cpp": (
        "#include <Enemy/Koopa.hpp>\nvoid TKoopa::fall() { }\n#if 1\nTKoopa::TKoopa(const char* n) { }\n#else\n#endif\n")},
        "constructor")
    return repo, revs


POLICY = {"gatedPaths": ["src/System/MarNameRefGen*.cpp"]}


def load(repo: Path, rev: str, tmp: Path, policy=POLICY):
    return rd.load(repo, rev, policy=policy, cache_dir=tmp / "cache")


def test_owners_and_provenance(history, tmp_path) -> None:
    repo, revs = history
    r = load(repo, revs["stub"], tmp_path)
    st = {c: r.class_state(c) for c in ("TKoopa", "TMaj", "TTie", "TWeak", "TKukku", "TGhostX", "TNoSuch")}
    assert (st["TKoopa"]["owner_unit"], st["TKoopa"]["provenance"]) == ("mario/Enemy/Koopa", "vtable")
    assert (st["TMaj"]["owner_unit"], st["TMaj"]["provenance"]) == ("mario/Map/a", "majority")  # 3 strong vs 1
    assert (st["TTie"]["owner_unit"], st["TTie"]["provenance"]) == (None, "ambiguous")  # 1 vs 1
    assert st["TTie"]["construct"] == "unresolved"
    assert st["TWeak"]["provenance"] == "weak_only" and st["TWeak"]["construct"] == "shared"
    assert st["TGhostX"]["provenance"] == "majority"  # only the map knows it (UNUSED rows)
    assert st["TNoSuch"]["provenance"] == "absent" and st["TNoSuch"]["construct"] == "unresolved"
    assert r.class_state("TAsmX")["construct"] == "unresolved"  # owner unit without a source path
    assert r.class_state("JDrama")["provenance"] == "absent"  # a namespace, not a class
    assert r.unused_symbols("mario/Enemy/Koopa") == ["stripped__6TKoopaFv", "unusedOnly__7TGhostXFv"]
    assert r.unit_for_source("src/Enemy/Koopa.cpp") == "mario/Enemy/Koopa"
    assert r.gated("src/System/MarNameRefGen_Enemy.cpp") and not r.gated("src/Enemy/Koopa.cpp")


def test_header_inline_ctor_does_not_grant_readiness(history, tmp_path) -> None:
    repo, revs = history
    r = load(repo, revs["stub"], tmp_path)
    koopa = r.class_state("TKoopa")
    assert koopa["started"] is False and koopa["construct"] == "not_ready" and koopa["declare"] == "not_ready"
    tin = r.class_state("TTinKoopa")
    assert tin["started"] and tin["construct"] == "ready" and tin["declare"] == "ready"
    kukku = r.class_state("TKukku")  # weak (inline) ctor in the target: shared for construction, not started
    assert kukku["construct"] == "shared" and kukku["declare"] == "not_ready"


def test_started_vs_construct_ready_across_history(history, tmp_path) -> None:
    repo, revs = history
    states = {k: load(repo, v, tmp_path).class_state("TKoopa") for k, v in revs.items()}
    assert (states["started"]["started"], states["started"]["construct"]) == (True, "not_ready")
    assert states["inactive"]["construct"] == "not_ready"  # #if 0, // and /* */ definitions are inactive
    assert states["wrong_sig"]["construct"] == "not_ready"  # signature-exact
    assert states["ready"]["construct"] == "ready" and states["ready"]["declare"] == "ready"
    # the earlier bogus header inline ctor (still present) never counted
    assert "TKoopa(const char* name) { }" in git(repo, "show", f"{revs['ready']}:include/Enemy/Koopa.hpp")


def test_function_readiness_and_index(history, tmp_path) -> None:
    repo, revs = history
    r = load(repo, revs["stub"], tmp_path)
    reg = r.function("mario/System/MarNameRefGen_Enemy", "getNameRef_Enemy__14TMarNameRefGenCFPCc")
    assert [(u["class"], u["kind"]) for u in reg["unmet"]] == [("TKoopa", "construct")]
    assert {u["class"] for u in reg["unresolved"]} == {"TTie", "TAsmX"}
    move = r.function("mario/Enemy/tinkoopa", "move__9TTinKoopaFv")  # calls don't count, construct does
    assert [u["class"] for u in move["unmet"]] == ["TKoopa"]
    idx = r.index()
    f = idx["functions"]
    assert f["mario/System/MarNameRefGen_Enemy::getNameRef_Enemy__14TMarNameRefGenCFPCc"]["state"] == "blocked"
    assert f["mario/Enemy/tinkoopa::move__9TTinKoopaFv"]["state"] == "deferred"
    assert f["mario/Map/a::useTie__Fv"]["state"] == "deferred"  # unresolved only
    assert f["mario/Enemy/Koopa::fall__6TKoopaFv"]["state"] == "ready"
    assert idx["summary"]["blocked"] == 1 and idx["summary"]["deferred"] == 2
    assert set(idx["identity"]) == {"repo", "rev", "version", "target_stamp", "map_sha", "policy_hash"}
    ready = load(repo, revs["ready"], tmp_path).index()["functions"]
    assert ready["mario/Enemy/tinkoopa::move__9TTinKoopaFv"]["state"] == "ready"
    assert ready["mario/System/MarNameRefGen_Enemy::getNameRef_Enemy__14TMarNameRefGenCFPCc"]["state"] == "deferred"


def test_identity_and_caches(history, tmp_path) -> None:
    repo, revs = history
    a = load(repo, revs["stub"], tmp_path)
    a.index()
    a.close()
    b = load(repo, revs["stub"], tmp_path)
    assert a.identity == b.identity and b._states  # revision facts served from the cache
    c = load(repo, revs["stub"], tmp_path, policy={"gatedPaths": []})
    assert c.identity["policy_hash"] != a.identity["policy_hash"] and not c._states
    d = load(repo, revs["ready"], tmp_path)
    assert d.identity["rev"] == revs["ready"] and d.identity["target_stamp"] == a.identity["target_stamp"]
    files = sorted(p.name for p in (tmp_path / "cache").rglob("*.json"))
    assert sum(f.startswith("static-") for f in files) == 1


def test_errors(history, tmp_path) -> None:
    repo, revs = history
    with pytest.raises(rd.ReadinessError) as e:
        load(repo, "nope", tmp_path)
    assert e.value.kind == "bad_rev"
    (repo / "orig/V/files/game.MAP").unlink()
    with pytest.raises(rd.ReadinessError) as e:
        load(repo, revs["stub"], tmp_path / "x")
    assert e.value.kind == "missing_map"
    (repo / "objdiff.json").write_text("{not json")
    with pytest.raises(rd.ReadinessError) as e:
        load(repo, revs["stub"], tmp_path / "y")
    assert e.value.kind == "malformed"
    (repo / "objdiff.json").unlink()
    with pytest.raises(rd.ReadinessError) as e:
        load(repo, revs["stub"], tmp_path / "z")
    assert e.value.kind == "missing_objects"


def test_active_text() -> None:
    text = "a\n#if 0\nb\n#elif 1\nc\n#else\nd\n#endif\n#ifdef X\ne\n#endif\n#define Y\n#ifndef Y\nf\n#else\ng\n#endif\n"
    assert rd.active_text(text) == text  # reference mode: no condition evaluated, every branch scanned
    lines = rd.active_text(text, unknown="inactive").split("\n")
    assert [x for x in lines if x.strip() and not x.startswith("#")] == ["a", "c", "g"]  # `#ifdef X`: undecidable
    assert len(lines) == len(text.split("\n"))


def test_definitions_handle_macros_and_signatures() -> None:
    defs = rd.definitions("DEFINE_NERVE(TNerveFoo, TLiveActor) { return true; }\n"
                          "void TFoo::bar(s32 a, const char* b) { }\n")
    assert ("TNerveFoo::execute", None) in defs
    [bar] = [d for d in defs if not isinstance(d, tuple)]
    assert bar.qualified == "TFoo::bar"
    # exact identity: `char const *` is not `char *`, and s32 is whatever the repo's typedef says
    idx = rd.signatures_index_for_test({"include/types.h": "typedef signed long s32;\n"})
    [bar] = [d for d in rd.definitions("void TFoo::bar(s32 a, const char* b) { }\n", None, idx) if not isinstance(d, tuple)]
    assert rd._defines([bar], "bar__4TFooFlPCc") and not rd._defines([bar], "bar__4TFooFiPCc")
    assert not rd._defines([bar], "bar__4TFooFlPc")


def run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(TOOLS / "readiness.py"), *args], capture_output=True, text=True)


def test_cli_index_and_errors(history, tmp_path) -> None:
    repo, revs = history
    out = run_cli("index", "--repo", str(repo), "--rev", revs["stub"], "--policy-json", json.dumps(POLICY),
                  "--cache-dir", str(tmp_path / "c"), "--json")
    assert out.returncode == 0, out.stderr
    payload = json.loads(out.stdout)
    assert payload["summary"]["blocked"] == 1 and payload["identity"]["rev"] == revs["stub"]
    assert payload["classes"]["TKoopa"]["construct"] == "not_ready"
    bad = run_cli("index", "--repo", str(repo), "--rev", "nope", "--json")
    assert bad.returncode == 2 and json.loads(bad.stderr.strip().splitlines()[-1])["error"] == "bad_rev"
    cls = run_cli("class", "--repo", str(repo), "--rev", revs["ready"], "--cache-dir", str(tmp_path / "c"),
                  "TKoopa", "--json")
    assert json.loads(cls.stdout)["classes"][0]["construct"] == "ready"


# --------------------------------------------------------------------------
# Real SMS sandbox (read-only)
# --------------------------------------------------------------------------

SANDBOX = Path(os.environ.get(
    "READINESS_SMS_SANDBOX",
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up84"))


@pytest.mark.skipif(not (SANDBOX / "objdiff.json").is_file() or not (SANDBOX / "orig/GMSJ01/files/mario.MAP").is_file(),
                    reason="needs the SMS sandbox sb-up84 (set READINESS_SMS_SANDBOX)")
def test_real_registry_blocked_sets(tmp_path) -> None:
    before = subprocess.run(["git", "-C", str(SANDBOX), "status", "--porcelain"], capture_output=True).stdout
    r = rd.load(SANDBOX, "84bca82f", policy=POLICY, cache_dir=tmp_path / "c")
    enemy = r.function("mario/System/MarNameRefGen_Enemy", "getNameRef_Enemy__14TMarNameRefGenCFPCc")
    boss = r.function("mario/System/MarNameRefGen_BossEnemy", "getNameRef_BossEnemy__14TMarNameRefGenCFPCc")
    assert len({u["class"] for u in enemy["unmet"]}) == 14 and len({u["class"] for u in boss["unmet"]}) == 14
    assert {"TKoopa", "TKoopaManager", "TBossHanachan"} <= {u["class"] for u in boss["unmet"]}
    assert r.class_state("TTinKoopa")["construct"] == "ready" and r.class_state("JDrama")["provenance"] == "absent"
    assert subprocess.run(["git", "-C", str(SANDBOX), "status", "--porcelain"], capture_output=True).stdout == before


def test_precedent_makes_a_construction_ready_in_that_file(history, tmp_path) -> None:
    repo, revs = history
    reg = "src/System/MarNameRefGen_Enemy.cpp"
    rev = commit(repo, {reg: 'void* f(const char* n) { return new TKoopa(n); }\n// new TTie\n',
                        "src/Enemy/Koopa.cpp": "// stub again\n"}, "upstream factory, stub owner")
    r = load(repo, rev, tmp_path)
    f = r.function("mario/System/MarNameRefGen_Enemy", "getNameRef_Enemy__14TMarNameRefGenCFPCc")
    assert f["unmet"] == [] and [p["class"] for p in f["precedent"]] == ["TKoopa"]
    assert {u["class"] for u in f["unresolved"]} == {"TTie", "TAsmX"}  # a comment is no precedent
    assert r.class_state("TKoopa", reg)["provenance"] == "precedent"
    assert r.class_state("TKoopa")["construct"] == "not_ready"  # global state unchanged
    assert r.index()["functions"][f"mario/System/MarNameRefGen_Enemy::getNameRef_Enemy__14TMarNameRefGenCFPCc"][
        "state"] == "deferred"


def test_undecidable_or_false_conditions_give_no_readiness(history, tmp_path) -> None:
    repo, revs = history
    for body in ("#define ENABLE 0\n#if ENABLE\nTKoopa::TKoopa(const char* n) { }\n#endif\n",
                 "#if 2 - 2\nTKoopa::TKoopa(const char* n) { }\n#endif\n",
                 "#if SOME_HEADER_MACRO\nTKoopa::TKoopa(const char* n) { }\n#endif\n",
                 "#ifdef FROM_A_HEADER\n#else\nTKoopa::TKoopa(const char* n) { }\n#endif\n"):
        rev = commit(repo, {"src/Enemy/Koopa.cpp": "void TKoopa::fall() { }\n" + body}, "conditional ctor")
        assert load(repo, rev, tmp_path).class_state("TKoopa")["construct"] == "not_ready", body
    rev = commit(repo, {"src/Enemy/Koopa.cpp": "#define ENABLE 1\n#if ENABLE && (3 > 2)\n"
                        "TKoopa::TKoopa(const char* n) { }\n#endif\n"}, "decidable true")
    assert load(repo, rev, tmp_path).class_state("TKoopa")["construct"] == "ready"


def test_unit_defines_decide_conditions() -> None:
    text = "#ifdef VERSION_GMSJ01\na\n#else\nb\n#endif\n#if NDEBUG\nc\n#endif\n"
    flags = "-proc gekko -DVERSION_GMSJ01 -DNDEBUG=1 -O4"
    lines = rd.active_text(text, rd.defines_from_flags(flags), unknown="inactive").split("\n")
    assert [x for x in lines if x.strip() and not x.startswith("#")] == ["a", "c"]
    assert rd.eval_condition("defined(A) && 1", {}, set()) is None  # an undecidable operand stays undecidable
    assert rd.eval_condition("defined(A) || 1", {}, set()) is True  # ...unless the other side decides it


def test_candidate_sources_judged_with_the_same_rules(history, tmp_path) -> None:
    repo, revs = history
    r = load(repo, revs["stub"], tmp_path)
    src = "src/Enemy/Koopa.cpp"
    assert r.class_state_with_sources("TKoopa", {src: "TKoopa::TKoopa(Unrelated* u) { }\n"})["construct"] == "not_ready"
    assert r.class_state_with_sources("TKoopa", {src: "TKoopa::TKoopa(const char* n) { }\n"})["construct"] == "ready"
    assert r.class_state("TKoopa")["construct"] == "not_ready"  # rev facts untouched


def test_precedent_is_by_canonical_identity(history, tmp_path) -> None:
    repo, revs = history
    reg = "src/System/MarNameRefGen_Enemy.cpp"
    rev = commit(repo, {reg: "void* f() { return new Other::TKoopa; }\nvoid* g() { return new\n   TKukku; }\n",
                        "src/Enemy/Koopa.cpp": "// stub\n"}, "qualified elsewhere")
    r = load(repo, rev, tmp_path)
    assert r.class_state("TKoopa", reg)["construct"] == "not_ready"  # Other::TKoopa is not TKoopa
    assert "TKukku" in r.precedent(reg)  # a `new` spanning lines still counts


def test_preprocessor_groups_and_c_expressions() -> None:
    import preprocess

    E = lambda e, m=None, u=None: preprocess.eval_condition(e, m or {}, u or set())  # noqa: E731
    assert E("1 & 2 == 0") is False  # C precedence: 1 & (2 == 0)
    assert E("FLAG == 1", {"FLAG": "(1 << 2)"}) is False and E("FLAG == 4", {"FLAG": "(1 << 2)"}) is True
    assert E("-7 / 2 == -3") is True and E("0x10 > 15u ? 1 : 0") is None and E("0x10 > 15L ? 1 : 0") is None and E("0 && UNKNOWN") is False
    assert E("UNKNOWN") is None and E("UNKNOWN", u={"UNKNOWN"}) is False and E("F(1)", {"F": None}) is None
    assert E("defined X") is None and E("defined(X) && 1", {"X": "1"}) is True and E("'a'") is None
    text = "#if UNKNOWN\na\n#elif 0\nb\n#else\nTKoopa::TKoopa(const char* n) { }\n#endif\n"
    blanked = preprocess.active_text(text, unknown="inactive")
    assert "TKoopa" not in blanked and len(blanked) == len(text)  # #else after an undecidable #if is undecidable
    assert "TKoopa" in preprocess.active_text(text, unknown="active")
    assert preprocess.active_text(text, unknown="active") == text  # reference mode scans every branch


def test_preprocessor_macro_expansion_and_uncertainty() -> None:
    import preprocess

    E = lambda e, m=None: preprocess.eval_condition(e, m or {}, set())  # noqa: E731
    assert E("A * 3 == 7", {"A": "1 + 2"}) is True  # token-level expansion, no implicit parentheses
    assert E("!(-1 < 1U)") is None and E("(int)1") is None and E("sizeof(int) == 4") is None
    assert E("A", {"A": "A"}) is None and E("A", {"A": "B", "B": "A"}) is None  # self-reference
    assert E("defined(A)", {"A": preprocess.UNKNOWN}) is None
    text = "#define FLAG 1\n#if UNKNOWN\n#undef FLAG\n#endif\n#if FLAG\nTKoopa::TKoopa(const char* n) { }\n#endif\n"
    assert "TKoopa" not in preprocess.active_text(text, unknown="inactive")  # never positive evidence
    assert "TKoopa" in preprocess.active_text(text, unknown="active")  # still scanned for references


def test_evidence_mode_is_strictly_32_bit() -> None:
    import preprocess

    E = lambda e: preprocess.eval_condition(e, {}, set())  # noqa: E731
    assert E("0xffffffffffffffff == -1") is None  # unsigned semantics: never evidence
    assert E("2147483648 > 0") is None and E("0x80000000 != 0") is None and E("1L") is None
    assert E("2147483647 + 1 > 0") is None and E("-2147483647 - 2 < 0") is None and E("1 << 31") is None
    assert E("65536 * 65536 == 0") is None and E("2147483647 > 0") is True and E("-2147483647 - 1 < 0") is True
    text = "#if 0xffffffffffffffff == -1\nTKoopa::TKoopa(const char* n) { }\n#endif\n"
    assert "TKoopa" not in preprocess.active_text(text, unknown="inactive")


def test_commented_code_is_never_evidence(history, tmp_path) -> None:
    repo, revs = history
    rev = commit(repo, {"src/Enemy/Koopa.cpp": "/* TKoopa::TKoopa(const char* n) { }\nvoid TKoopa::fall() { } */\n"
                        "// TKoopa::TKoopa(const char* n) { }\n",
                        "src/System/MarNameRefGen_Enemy.cpp": "/* return new TKoopa(n); */\n// new TKoopa\n"},
                 "commented out")
    r = load(repo, rev, tmp_path)
    st = r.class_state("TKoopa")
    assert st["started"] is False and st["construct"] == "not_ready"  # a commented ctor is not a definition
    assert "TKoopa" not in r.precedent("src/System/MarNameRefGen_Enemy.cpp")  # a commented `new TX` is no precedent
    rev = commit(repo, {"src/Enemy/Koopa.cpp": "#undef ON\n/*\n#define ON 1\n*/\n#if ON\nTKoopa::TKoopa(const char* n) { }\n#endif\n"},
                 "commented define")
    assert load(repo, rev, tmp_path).class_state("TKoopa")["construct"] == "not_ready"


def test_trigraph_file_gives_no_readiness_or_precedent(history, tmp_path) -> None:
    repo, revs = history
    rev = commit(repo, {"src/Enemy/Koopa.cpp": "TKoopa::TKoopa(const char* n) { }  // '????'\nvoid TKoopa::fall() { }\n",
                        "src/System/MarNameRefGen_Enemy.cpp": "void* f() { return new TKoopa(\"??=\"); }\n"},
                 "trigraphs")
    r = load(repo, rev, tmp_path)
    st = r.class_state("TKoopa")
    assert st["started"] is False and st["construct"] == "not_ready"  # fail closed: the file is undecidable
    assert "TKoopa" not in r.precedent("src/System/MarNameRefGen_Enemy.cpp")


def test_own_unit_function_uses_the_map_placement(history, tmp_path) -> None:
    repo, revs = history
    r = load(repo, revs["stub"], tmp_path)
    text = "void TMaj::h() { }\nvoid TMaj::f() { }\nvoid TMaj::h(int a) { }\n"
    # TMaj's owner is Map/a, but h() lives in Map/b's object: b's own function
    at = lambda needle: text.index("{", text.index(needle))  # noqa: E731  (the definition's body offset)
    assert r.own_unit_function("mario/Map/b", text, at("TMaj::h()"), "src/Map/b.cpp") is True
    assert r.own_unit_function("mario/Map/b", text, at("TMaj::f()"), "src/Map/b.cpp") is None  # f() is in Map/a
    assert r.own_unit_function("mario/Map/b", text, at("TMaj::h(int"), "src/Map/b.cpp") is None  # another signature
    # two definitions on one line: each is judged on its own
    same = "void TMaj::h() { } void TMaj::f() { }\n"
    assert r.own_unit_function("mario/Map/b", same, same.index("{"), "src/Map/b.cpp") is True
    assert r.own_unit_function("mario/Map/b", same, same.rindex("{"), "src/Map/b.cpp") is None
    assert r.own_unit_function("mario/Map/b", same, 3, "src/Map/b.cpp") is None  # not a definition's body


def test_missing_map_message_names_the_expected_path(history, tmp_path) -> None:
    repo, revs = history
    (repo / "orig/V/files/game.MAP").unlink()
    with pytest.raises(rd.ReadinessError) as e:
        load(repo, revs["stub"], tmp_path / "x")
    assert e.value.kind == "missing_map" and f"{repo.resolve()}/orig/V/files/" in e.value.detail
    import steering_check as sc

    why: dict = {}
    assert sc.map_unused(repo, revs["stub"], "GMSJ01", "src/a.cpp", why) is None
    assert "orig/GMSJ01/files/mario.MAP" in why["src/a.cpp"] and "link map missing" in why["src/a.cpp"]
