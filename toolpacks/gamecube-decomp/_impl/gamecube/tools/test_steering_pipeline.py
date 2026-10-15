"""The worker's split steering pipeline equals `check`, and run_mwcc's
coverage and considered-function rules, on a fake toolchain.

Fake IR oracle and shape markers come from test_steering_check. The fake
MWCC "compiles" the toy dialect into real ELF32 objects that stack_compare
reads: one code word per source line (markers ignored, so a steering rewrite
changes code), a `bl` with an R_PPC_REL24 relocation per call, and one .data
symbol per `int name; // GLOBAL(name)` line in source order. The target
object is the same compiler run on the "original" text.
"""

from __future__ import annotations

import json
import os
import re
import struct
import subprocess
import sys
import zlib
from pathlib import Path
from typing import Optional

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import stack_check  # noqa: E402
import stack_compare as stc  # noqa: E402
import steering_check as sc  # noqa: E402
import steering_edits as se  # noqa: E402
from test_steering_check import FakeOracle, fake_classify, fake_units, git_repo  # noqa: E402

MARKERS = re.compile(r"\b(?:NEUTRAL|STEER|ACCESSOR|REAL|OTHER|VOLATILE|CALLADD|U2SEES)\b")
R_PPC_REL24 = 10


# --------------------------------------------------------------------------
# Toy compiler
# --------------------------------------------------------------------------


def toy_elf(text: str) -> bytes:
    functions: list[tuple[str, list[int]]] = []
    relocs: list[tuple[int, str]] = []
    externs: list[str] = []
    data = re.findall(r"^int (\w+); // GLOBAL", text, re.M)
    pos = 0
    for m in re.finditer(r"^void (\w+)\(\)\n\{\n(.*?)^\}", text, re.M | re.S):
        words = []
        for line in m.group(2).splitlines():
            key = re.sub(r"\s+", "", MARKERS.sub("", se.strip_code(line)))
            if not key:
                continue
            words.append((31 << 26) | (zlib.crc32(key.encode()) & 0x03FFFFFF))
            for callee in se.call_names([line]):
                relocs.append((pos + 4 * len(words), callee))
                words.append((18 << 26) | 1)
                if callee not in externs:
                    externs.append(callee)
        words.append(0x4E800020)  # blr
        functions.append((m.group(1), words))
        pos += 4 * len(words)
    return _elf(functions, relocs, data, externs)


def _elf(functions, relocs, data_syms, externs) -> bytes:
    text = b"".join(struct.pack(">I", w) for _, words in functions for w in words)
    data = b"\0" * (4 * len(data_syms) or 4)
    shstr = b"\0.text\0.data\0.rela.text\0.symtab\0.strtab\0.shstrtab\0"

    def off(name: str) -> int:
        return shstr.index(name.encode() + b"\0")

    strtab = b"\0"
    syms = [struct.pack(">IIIBBH", 0, 0, 0, 0, 0, 0)]
    index: dict[str, int] = {}

    def add(name: str, value: int, size: int, info: int, shndx: int) -> None:
        nonlocal strtab
        name_off = len(strtab)
        strtab += name.encode() + b"\0"
        index[name] = len(syms)
        syms.append(struct.pack(">IIIBBH", name_off, value, size, info, 0, shndx))

    p = 0
    for name, words in functions:
        add(name, p, 4 * len(words), (1 << 4) | stc.STT_FUNC, 1)
        p += 4 * len(words)
    for k, name in enumerate(data_syms):
        add(name, 4 * k, 4, (1 << 4) | 1, 2)
    for name in externs:
        add(name, 0, 0, 1 << 4, 0)
    rela = b"".join(struct.pack(">IIi", o, (index[s] << 8) | R_PPC_REL24, 0) for o, s in relocs)
    blobs = [text, data, rela, b"".join(syms), strtab, shstr]
    offsets, body, cursor = [], b"", 52
    for blob in blobs:
        offsets.append(cursor + len(body))
        body += blob + b"\0" * (-len(blob) % 4)
    shoff = 52 + len(body)
    sh = [b"\0" * 40]
    specs = [(".text", 1, 0x6, 0, 0, 4, 0), (".data", 1, 0x3, 0, 0, 4, 0), (".rela.text", 4, 0, 4, 1, 4, 12),
             (".symtab", 2, 0, 5, 1 + len(functions) * 0, 4, 16), (".strtab", 3, 0, 0, 0, 1, 0),
             (".shstrtab", 3, 0, 0, 0, 1, 0)]
    for (name, typ, flags, link, info, align, ent), blob, o in zip(specs, blobs, offsets):
        sh.append(struct.pack(">10I", off(name), typ, flags, 0, o, len(blob), link, info, align, ent))
    ident = b"\x7fELF\x01\x02\x01" + b"\0" * 9
    ehdr = ident + struct.pack(">HHIIIIIHHHHHH", 1, 20, 1, 0, 0, shoff, 0, 52, 0, 0, 40, len(sh), 6)
    return ehdr + body + b"".join(sh)


class FakeMwcc:
    """run_mwcc backend over the toy compiler (one unit per source file)."""

    jobs = 1

    def __init__(self, tmp: Path, target_text: str, fail: Optional[set] = None,
                 units: Optional[dict[str, str]] = None, repo: Optional[Path] = None,
                 targets: Optional[dict[str, str]] = None, unused: Optional[dict[str, list[str]]] = None):
        self.unused_names = unused  # unit -> UNUSED map symbols (None: no link map)
        self.tmp = tmp
        self.tmp.mkdir(parents=True, exist_ok=True)
        self.fail = fail or set()  # {(unit, label)}
        self.repo = repo  # unchanged unit sources are read from here
        self.unit_sources = units or {"u1": "src/a.c"}
        self.units_ = {n: stack_check.Unit(n, f"build/src/{n}.o", f"build/obj/{n}.o", src)
                       for n, src in self.unit_sources.items()}
        self.targets = {}
        for n in self.units_:
            path = tmp / f"target-{n}.o"
            path.write_bytes(toy_elf((targets or {}).get(n, target_text)))
            self.targets[n] = path
        self.target = self.targets[next(iter(self.units_))]
        self.n = 0
        self.built: list[tuple[str, str]] = []

    def units(self, paths):
        by_path, header_units = {}, {}
        for p in paths:
            if p.startswith("include/"):  # every unit includes every header
                by_path[p] = list(self.units_.values())
                header_units[p] = sorted(self.units_)
            else:
                by_path[p] = [u for u in self.units_.values() if u.source == p]
        return by_path, header_units

    def compile(self, unit, texts, label):
        self.built.append((unit.name, label))
        if (unit.name, label) in self.fail:
            return False, None, f"fake MWCC error in {label}"
        text = texts.get(unit.source)
        if unit.source not in texts and self.repo is not None:
            text = (self.repo / unit.source).read_bytes()
        if text is None:
            return False, None, "source absent"
        self.n += 1
        out = self.tmp / f"{unit.name}-{label}-{self.n}.o"
        out.write_bytes(toy_elf(se.decode(text)))
        return True, out, ""

    def classify(self, obj, unit):
        a = stc.ElfObject.from_path(str(self.targets[unit.name]))
        b = stc.ElfObject.from_path(str(obj))
        fa, fb = a.keyed_functions(), b.keyed_functions()
        functions = []
        for name, fn in fa.items():
            other = fb.get(name)
            if other is None:
                functions.append({"name": name, "demangled": name, "compiled_name": None, "status": "missing",
                                  "match_percent": 0.0, "frame_target": None, "frame_compiled": None, "first_diff": None})
                continue
            cls = stc.compare_function(a, fn, b, other, name).cls
            wa, wb = stc._function_words(a, fn), stc._function_words(b, other)
            same = sum(1 for x, y in zip(wa, wb) if x == y)
            pct = 100.0 if cls == "identical" else round(100.0 * same / max(len(wa), len(wb)), 4)
            functions.append({"name": name, "demangled": name, "compiled_name": name,
                              "status": "exact" if cls == "identical" else "mismatch", "match_percent": pct,
                              "frame_target": None, "frame_compiled": None, "first_diff": None})
        order_a, order_b = sc.data_symbol_order(a).get(".data", []), sc.data_symbol_order(b).get(".data", [])
        sections = [{"name": ".data", "kind": "SECTION_DATA", "match_percent": 100.0 if order_a == order_b else 50.0}]
        return {"functions": functions, "sections": sections}

    def target_path(self, unit):
        return self.targets[unit.name]

    def unused(self, unit, base_rev):
        if self.unused_names is None:
            return None
        return [sc.demangled_symbol(n) for n in self.unused_names.get(unit.name, [])]

    def close(self):
        pass


# --------------------------------------------------------------------------
# Fixture: a map-call keep, a data-order move, a steering temp
# --------------------------------------------------------------------------

BASE = """int gB; // GLOBAL(gB)
int gA; // GLOBAL(gA)
void f()
{
    a();
    v = foo->mX NEUTRAL;
    b();
}
void g()
{
    c();
    d(1) NEUTRAL;
}
"""
CAND = """int gA; // GLOBAL(gA)
int gB; // GLOBAL(gB)
void f()
{
    a();
    v = foo->getX() NEUTRAL ACCESSOR;
    b();
}
void g()
{
    c();
    int t = 1 NEUTRAL STEER;
    d(t) NEUTRAL;
}
"""
TARGET = """int gA; // GLOBAL(gA)
int gB; // GLOBAL(gB)
void f()
{
    a();
    v = foo->getX();
    b();
}
void g()
{
    c();
    d(1);
}
"""


@pytest.fixture
def toolchain(monkeypatch, tmp_path):
    import evidence_search

    monkeypatch.setattr(sc, "classify", fake_classify)
    monkeypatch.setattr(evidence_search, "map_calls", lambda repo, sym, version=None: {
        "available": True, "found": True, "callees": [{"name": "getX", "mangled": "getX"}]})
    monkeypatch.setattr(evidence_search, "map_unit", lambda repo, unit, version=None: {"functions": []})
    repo = git_repo(tmp_path, {"src/a.c": BASE})
    (repo / "src/a.c").write_text(CAND)
    approvals = tmp_path / "approvals.jsonl"
    approvals.write_text("")
    return repo, tmp_path, approvals


def canon(obj) -> str:
    return json.dumps(obj, sort_keys=True)


def test_split_pipeline_equals_check(toolchain) -> None:
    repo, tmp, approvals = toolchain
    common = dict(budget=60, max_groups=16, jobs=1, approvals_path=approvals, evidence_repo=repo)
    report = sc.run_check(repo, "HEAD", cache_dir=tmp / "c1", oracle=FakeOracle(),
                          backend=FakeMwcc(tmp / "m1", TARGET), unit_resolver=fake_units, functions=["f"],
                          **common)
    # The worker path: every hand-off is a JSON file, as between sandbox and host.
    edits = json.loads(json.dumps(sc.build_edits(repo, "HEAD", unit_resolver=fake_units)))
    (tmp / "edits.json").write_text(json.dumps(edits))
    red = sc.run_reduce(json.loads((tmp / "edits.json").read_text()), repo, tmp / "c2",
                        oracle=FakeOracle(), **common)
    (tmp / "reduce.json").write_text(json.dumps(red))
    revert = sc.revert_edit_ids(json.loads((tmp / "reduce.json").read_text()))
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], revert, functions=["f"],
                     attribute=json.loads((tmp / "reduce.json").read_text()), jobs=1,
                     backend=FakeMwcc(tmp / "m2", TARGET))
    (tmp / "mwcc.json").write_text(json.dumps(mw))
    dec = sc.decide(json.loads((tmp / "reduce.json").read_text()), json.loads((tmp / "mwcc.json").read_text()),
                    evidence_repo=repo, approvals=[], version=edits.get("game_version"))

    assert canon(dec) == canon(json.loads(json.dumps(report["decision"])))
    assert canon(mw["functions"]) == canon(json.loads(json.dumps(report["mwcc"]["functions"])))
    # and the fixture exercised what it is for
    assert dec["evidence_keeps"], dec
    updates = {u["id"]: u["status"] for u in dec["group_updates"]}
    move = next(g for g in red["groups"] if g.get("data_order"))
    assert updates.get(move["id"]) == "real" and mw["data_evidence"][0]["improves"]
    fns = {f["name"]: f for f in dec["functions"]}
    assert fns["f"]["decision"] == "pass" and fns["f"]["evidence_sstar"]
    assert fns["g"]["decision"] == "steering_located"  # changed, so considered although not requested
    assert dec["attempt"] == "steering_located"
    assert dec["units"] == [{"unit": "u1", "built": True, "compared": True,
                             "builds": {"base": "ok", "candidate": "ok", "sstar": "ok"}}]


def test_considered_functions_are_union_of_requested_and_changed(toolchain) -> None:
    repo, tmp, approvals = toolchain
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], functions=["g"], backend=FakeMwcc(tmp / "m", TARGET))
    names = {f["name"]: f for f in mw["functions"]}
    assert set(names) == {"f", "g"}  # f changed although only g was requested
    assert names["g"]["requested"] and not names["f"]["requested"]


def test_added_and_removed_functions_are_considered(toolchain, tmp_path) -> None:
    repo, tmp, _ = toolchain
    (repo / "src/a.c").write_text(CAND.replace("void g()", "void h()"))
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], backend=FakeMwcc(tmp / "m", TARGET))
    rows = {f["name"]: f for f in mw["functions"]}
    assert {"g", "h"} <= set(rows)
    assert rows["g"]["in_candidate"] is False and rows["g"]["base_vs_candidate"] == "only_a"
    assert rows["h"]["base_vs_candidate"] == "only_b"


def test_failed_build_is_explicit_coverage_gap(toolchain) -> None:
    repo, tmp, _ = toolchain
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    red = sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    revert = sc.revert_edit_ids(red)
    for label in ("cand", "sstar", "base"):
        mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], revert, attribute=red,
                         backend=FakeMwcc(tmp / f"m-{label}", TARGET, fail={("u1", label)}))
        assert mw["coverage"][0]["compared"] is False and mw["functions"] == []
        dec = sc.decide(red, mw, probes=False)
        assert dec["attempt"] == "unresolved", label
        assert dec["units"][0]["compared"] is False


def test_unit_without_build_is_a_coverage_gap(toolchain) -> None:
    repo, tmp, _ = toolchain
    (repo / "src/b.c").write_text("void z()\n{\n    q();\n}\n")
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], backend=FakeMwcc(tmp / "m", TARGET))
    gaps = [c for c in mw["coverage"] if not c["compared"]]
    assert gaps and "src/b.c" in gaps[0]["unit"]
    red = {"edits_hash": edits["edits_hash"], "analysis": "complete", "incomplete_reasons": [],
           "global_incomplete": [], "groups": [], "units": []}
    assert sc.decide(red, mw, probes=False)["attempt"] == "unresolved"


def test_new_source_unit_has_absent_base(toolchain) -> None:
    repo, tmp, _ = toolchain
    (repo / "src/b.c").write_text("void z()\n{\n    q();\n}\n")
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    backend = FakeMwcc(tmp / "m", TARGET, units={"u1": "src/a.c", "u2": "src/b.c"})
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], backend=backend)
    cov = {c["unit"]: c for c in mw["coverage"]}
    assert cov["u2"]["built"]["base"] == "absent" and cov["u2"]["compared"]
    z = next(f for f in mw["functions"] if f["name"] == "z")
    assert z["base_vs_candidate"] == "only_b" and z["sstar_vs_candidate"] == "identical"


def test_mwcc_touch_sets_and_steering_only_sstar(toolchain) -> None:
    repo, tmp, _ = toolchain
    # g: a removable temp (NEUTRAL) and, in f, a retained steering-only edit (IR changes)
    cand = CAND.replace("    b();\n}", "    b() STEER;\n}")
    (repo / "src/a.c").write_text(cand)
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    red = sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    steer = next(g for g in red["groups"] if any("b() STEER" in x for x in g["cand_lines"]))
    assert steer["status"] == "unresolved" and sc.steering_only_retained(steer)
    assert steer["ir_functions"] == ["f"]
    temp = next(g for g in red["groups"] if any("int t" in x for x in g["cand_lines"]))
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red), attribute=red,
                     backend=FakeMwcc(tmp / "m", TARGET))
    assert mw["group_touch"][temp["id"]] == {"u1": ["g"]}
    f = next(x for x in mw["functions"] if x["name"] == "f")
    assert f["steering_sstar"]["groups"] == [steer["id"]] and f["steering_sstar"]["sstar_vs_candidate"] == "code"
    dec = sc.decide(red, mw, probes=False)
    fd = next(x for x in dec["functions"] if x["name"] == "f")
    assert fd["decision"] == "unresolved" and fd["semantic"] == "steering"
    gd = next(x for x in dec["functions"] if x["name"] == "g")
    assert gd["groups"] == [temp["id"]] and gd["decision"] == "steering_located"



# --------------------------------------------------------------------------
# Fixtures of real decide/reduce output for the TypeScript side
# --------------------------------------------------------------------------

FIXTURES = TOOLS.parents[4] / "apps/server/src/core/validation/steering/__fixtures__"
PASS_CAND = BASE.replace("    c();\n", "    c(2) REAL;\n")
PASS_TARGET = BASE.replace("    c();\n", "    c(2);\n")
VIOLATION_FN = "void u()\n{\n    w() REAL;\n}\n"

# Decompile-in-order evidence: link map, report.json and objdiff.json in the
# evidence repo (untracked, as in a real checkout). TKoopa's unit is a blank
# stub (no measures); TTinKoopa's is 98.5%.
ORDER_FILE = "src/System/MarNameRefGen_Enemy.cpp"
ORDER_UNITS = {"u1": "src/a.c", "u2": ORDER_FILE}
ORDER_CAND = """void getNameRef()
{
    a();
    if (strcmp(name, "TinKoopa") == 0) return new TTinKoopa("x") REAL;
    if (strcmp(name, "Koopa") == 0) return new TKoopa("y") REAL;
}
"""
ORDER_TARGET = ORDER_CAND.replace(" REAL", "")
ORDER_SOURCES = {
    "src/Enemy/Koopa.cpp": "// blank stub unit\n",
    "src/Enemy/tinkoopa.cpp": "TTinKoopa::TTinKoopa(const char* name) { }\n",
    "src/System/MarNameRefGen.cpp": "JDrama::TNameRef* TMarNameRefGen::getNameRef(const char* name) const { return 0; }\n",
}


def write_order_evidence(repo: Path, version: str = "V1") -> None:
    """Readiness evidence: target objects + objdiff.json + link map (untracked)
    and the owner sources committed at HEAD (readiness reads them from git).
    TKoopa's strong constructor is not defined in its blank stub unit;
    TTinKoopa's is. report.json gives owner progress for context."""
    from test_readiness import GLOBAL, write_readiness_repo

    units = {
        "mario/Enemy/Koopa": ("src/Enemy/Koopa.cpp", [("__ct__6TKoopaFPCc", GLOBAL, [])], [("__vt__6TKoopa", GLOBAL)]),
        "mario/Enemy/tinkoopa": ("src/Enemy/tinkoopa.cpp", [("__ct__9TTinKoopaFPCc", GLOBAL, [])],
                                 [("__vt__9TTinKoopa", GLOBAL)]),
        "mario/System/MarNameRefGen": ("src/System/MarNameRefGen.cpp",
                                       [("getNameRef__14TMarNameRefGenCFPCc", GLOBAL, [])],
                                       [("__vt__14TMarNameRefGen", GLOBAL)]),
    }
    write_readiness_repo(repo, version, units, map_text="Link map of __start\n")
    report = {"units": [{"name": "mario/Enemy/Koopa", "metadata": {"source_path": "src/Enemy/Koopa.cpp"}, "measures": {}},
                        {"name": "mario/Enemy/tinkoopa", "metadata": {"source_path": "src/Enemy/tinkoopa.cpp"},
                         "measures": {"fuzzy_match_percent": 98.5}}]}
    (repo / f"build/{version}/report.json").write_text(json.dumps(report))
    for rel, text in ORDER_SOURCES.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    subprocess.run(["git", "-C", str(repo), "add", *ORDER_SOURCES], check=True)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                    "commit", "-q", "-m", "owner sources"], check=True)


def order_units_resolver(units: dict[str, str]):
    def resolve(files):
        rows = [{"unit": n, "source": src, "object": "o", "target": "t", "flags": ["cc"]} for n, src in units.items()]
        return "V1", rows, {}
    return resolve
VOLATILE = ("edits_hash", "base_rev", "elapsed_s", "compiles")


def split_pipeline(repo: Path, tmp: Path, target: str, unused: Optional[dict] = None,
                   units: Optional[dict[str, str]] = None, targets: Optional[dict[str, str]] = None) -> tuple[dict, dict]:
    """edits -> reduce -> mwcc --attribute -> decide, each hand-off through JSON."""
    resolver = fake_units if units is None else order_units_resolver(units)
    edits = json.loads(json.dumps(sc.build_edits(repo, "HEAD", unit_resolver=resolver)))
    red = json.loads(json.dumps(sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1,
                                              approvals_path=None, evidence_repo=repo, oracle=FakeOracle())))
    mw = json.loads(json.dumps(sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red), attribute=red,
                                           jobs=1, backend=FakeMwcc(tmp / "m", target, unused=unused, units=units,
                                                                    targets=targets, repo=repo))))
    dec = json.loads(json.dumps(sc.decide(red, mw, evidence_repo=repo, approvals=[], version=edits["game_version"])))
    return red, dec


def normalize(obj):
    if isinstance(obj, dict):
        return {k: ("<volatile>" if k in VOLATILE else normalize(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [normalize(v) for v in obj]
    return obj


def fixture_cases(toolchain) -> dict[str, tuple[dict, dict]]:
    repo, tmp, _ = toolchain
    out = {"": split_pipeline(repo, tmp / "steer", TARGET)}
    (repo / "src/a.c").write_text(PASS_CAND)
    out["-pass"] = split_pipeline(repo, tmp / "pass", PASS_TARGET)
    (repo / "src/a.c").write_text(BASE)
    out["-nochange"] = split_pipeline(repo, tmp / "none", TARGET)
    # A dead UNUSED body: `u` is UNUSED in the map, absent in the base, and
    # stubbing it changes no target function -> rule_violation.
    (repo / "src/a.c").write_text(PASS_CAND + VIOLATION_FN)
    out["-violation"] = split_pipeline(repo, tmp / "violation", PASS_TARGET, unused={"u1": ["u__Fv"]})
    # Out of order: a MarNameRefGen factory line for a class whose unit is a blank stub.
    (repo / "src/a.c").write_text(BASE)
    write_order_evidence(repo)
    (repo / ORDER_FILE).parent.mkdir(parents=True, exist_ok=True)
    (repo / ORDER_FILE).write_text(ORDER_CAND)
    out["-order"] = split_pipeline(repo, tmp / "order", TARGET, units=ORDER_UNITS,
                                   targets={"u1": BASE, "u2": ORDER_TARGET})
    return out


def test_fixture_cases_and_committed_fixtures(toolchain) -> None:
    cases = fixture_cases(toolchain)
    assert cases[""][1]["attempt"] == "steering_located" and cases["-pass"][1]["attempt"] == "pass"
    assert [cases[k][1]["no_changes"] for k in ("", "-pass", "-nochange")] == [False, False, True]
    violation = cases["-violation"][1]
    assert violation["attempt"] == "rule_violation", violation["reasons"]
    assert violation["violations"] == [{"kind": "dead_unused_body", "unit": "u1", "file": "src/a.c",
                                        "function": "u(void)", "line": 14}]
    assert [c["status"] for c in violation["unused_checks"]] == ["dead"]
    assert next(f for f in violation["functions"] if f["name"] == "u")["unused_check"] == "dead"
    order = cases["-order"][1]
    assert order["attempt"] == "rule_violation", order["reasons"]
    assert order["violations"] == [{"kind": "out_of_order", "file": ORDER_FILE, "line": 5, "class": "TKoopa",
                                    "owner_unit": "mario/Enemy/Koopa", "owner_progress": 0.0,
                                    "reason": order["violations"][0]["reason"]}]
    assert [(c["class"], c["status"]) for c in order["order_checks"]] == [("TTinKoopa", "ok"), ("TKoopa", "out_of_order")]
    assert cases["-order"][0]["order_refs"][0]["via"] == "new"
    assert all(not d[1]["violations"] and not d[1]["unused_checks"] and not d[1]["order_checks"]
               for k, d in cases.items() if k not in ("-violation", "-order"))
    nochange = cases["-nochange"][1]
    assert nochange["attempt"] == "pass" and nochange["functions"] == [] and nochange["units"] == []
    for suffix, (red, dec) in cases.items():
        assert all(set(r) == {"unit", "built", "compared", "builds"} and r["built"] is True and r["compared"] is True
                   for r in dec["units"])
        assert isinstance(dec["no_changes"], bool)
        if os.environ.get("STEERING_WRITE_FIXTURES") == "1":
            FIXTURES.mkdir(parents=True, exist_ok=True)
            (FIXTURES / f"reduce-real{suffix}.json").write_text(json.dumps(normalize(red), indent=1) + "\n")
            (FIXTURES / f"decide-real{suffix}.json").write_text(json.dumps(normalize(dec), indent=1) + "\n")
        committed = FIXTURES / f"decide-real{suffix}.json"
        assert committed.is_file(), "regenerate with STEERING_WRITE_FIXTURES=1"
        assert json.loads(committed.read_text()) == normalize(dec), "stale fixture: regenerate with STEERING_WRITE_FIXTURES=1"
        assert json.loads((FIXTURES / f"reduce-real{suffix}.json").read_text()) == normalize(red)



HEADER_UNITS = {"u1": "src/a.c", "u2": "src/b.c"}


def header_units_resolver(files):
    units = [{"unit": n, "source": src, "object": "o", "target": "t", "flags": ["cc"]} for n, src in HEADER_UNITS.items()]
    return "V1", units, {f["path"]: sorted(HEADER_UNITS) for f in files if f["path"].startswith("include/")}


def test_every_header_consumer_is_built(toolchain) -> None:
    """A header edit reaches every including unit: each gets base + candidate
    MWCC builds and a comparison, even when its IR is unchanged. S* is only
    shared with the candidate when the unit's S* inputs are byte-identical."""
    repo, tmp, _ = toolchain
    (repo / "include").mkdir()
    (repo / "include/h.h").write_text("int k; NEUTRAL\n")
    (repo / "src/b.c").write_text("void z()\n{\n    q();\n}\n")
    (repo / "src/a.c").write_text(BASE)
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                    "commit", "-q", "-m", "hdr"], check=True)
    (repo / "include/h.h").write_text("int k2; NEUTRAL REAL\n")  # IR-neutral header edit, retained-real shape
    (repo / "src/a.c").write_text(BASE.replace("    c();\n", "    c(2) REAL;\n"))
    edits = sc.build_edits(repo, "HEAD", unit_resolver=header_units_resolver)
    red = sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    assert {u["unit"]: u["ir_changed"] for u in red["units"]}["u2"] is False
    backend = FakeMwcc(tmp / "m", TARGET, units=HEADER_UNITS, repo=repo,
                       targets={"u2": "void z()\n{\n    q();\n}\n"})
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red), attribute=red, backend=backend)
    cov = {c["unit"]: c for c in mw["coverage"]}
    assert set(cov) == {"u1", "u2"} and all(c["compared"] for c in cov.values())
    assert {(n, k) for n, k in backend.built if k in ("base", "cand")} == {
        ("u1", "base"), ("u1", "cand"), ("u2", "base"), ("u2", "cand")}
    assert "ir_unchanged_units" not in mw
    dec = sc.decide(red, mw, probes=False)
    assert all(set(r) == {"unit", "built", "compared", "builds"} and r["built"] and r["compared"] for r in dec["units"])
    assert [r["unit"] for r in dec["units"]] == ["u1", "u2"]
    assert all(r["builds"]["sstar"] in ("ok", "same_as_candidate") for r in dec["units"])


def test_sstar_shared_only_when_inputs_identical(toolchain) -> None:
    repo, tmp, _ = toolchain
    edits = sc.build_edits(repo, "HEAD", unit_resolver=fake_units)
    backend = FakeMwcc(tmp / "m", TARGET)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], [], backend=backend)
    assert mw["coverage"][0]["built"]["sstar"] == "same_as_candidate"
    assert ("u1", "sstar") not in backend.built
    red = sc.run_reduce(edits, repo, tmp / "c", budget=60, max_groups=16, jobs=1, approvals_path=None,
                        evidence_repo=None, oracle=FakeOracle())
    backend = FakeMwcc(tmp / "m2", TARGET)
    mw = sc.run_mwcc(repo, "HEAD", edits["edits_hash"], sc.revert_edit_ids(red), backend=backend)
    assert mw["coverage"][0]["built"]["sstar"] == "ok" and ("u1", "sstar") in backend.built


def test_header_cap_is_96() -> None:
    assert sc.HEADER_UNIT_CAP == 96


def test_tmp_dir_is_created(tmp_path) -> None:
    class FakeRepo:
        root = tmp_path / "root"
        units = {}

    FakeRepo.root.mkdir()
    (FakeRepo.root / "src").mkdir()
    target = tmp_path / "does" / "not" / "exist"
    pool = sc.ShadowCompiler(FakeRepo(), 1, str(target))
    try:
        assert target.is_dir() and pool.tmp.parent == target
    finally:
        pool.close()
