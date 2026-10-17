"""CAPABILITIES.json: which trace points each traced version may claim.

The generator tests build a fake binary, its presence report and byte-identity sweeps, and run them through the
sandbox image's gate (the one evidence rule). The committed-copy test checks native/CAPABILITIES.json.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import pytest

NATIVE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("capabilities", NATIVE / "tools" / "capabilities.py")
capabilities = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = capabilities
spec.loader.exec_module(capabilities)

ALL_SOURCES = sorted({s for sources in capabilities.POINT_SOURCES.values() for s in sources} | set(capabilities.COMMON))
IMPLEMENTED = capabilities.IMPLEMENTED
GATE = capabilities.load_gate()


def traced_ok(digest="t" * 40, missing=()):
    return {"sha1": digest, "original_sha1": "s" * 40,
            "linked_from_source": [s for s in ALL_SOURCES if s not in missing]}


def presence(digest="t" * 40, failing=("scheduling",)):
    return {"schema": "mwcc-native-event-presence-v1", "compiler_sha1": digest,
            "points": {p: ({"ok": False, "missing": "x"} if p in failing else {"ok": True})
                       for p in capabilities.POINT_SOURCES},
            "identity": {"off_equals_on": True, "stock_equals_off": True}}


def sweep(version, digest, mismatched=0, selection=None, game="sms", stock_failed=()):
    rows = [{"unit": f"build/u{i}.o", "version": version,
             "status": "stock_failed" if f"build/u{i}.o" in stock_failed else "mismatch" if i < mismatched
             else "identical", "ok_off": i >= mismatched, "ok_on": i >= mismatched} for i in range(10)]
    compared = 10 - len(stock_failed)
    return {"schema": "mwcc-native-byte-identity-v1", "checkout": f"/x/games/{game}/workspace/checkout",
            "selection": selection or {"all": True}, "traced_sha1": {version: digest}, "units": rows,
            "skipped": {"rules": {}, "versions": {}},
            "totals": {version: {"units": 10, "identical_off": compared - mismatched,
                                 "identical_on": compared - mismatched, "mismatched": mismatched,
                                 "traced_failed": 0, "stock_failed": len(stock_failed)}}}


def staged(tmp_path, version, sweeps=()):
    """A binary under <tmp>/bin/<ver>/, its presence report and SWEEPS under <tmp>/validation; its digest."""
    exe = tmp_path / "bin" / version / "mwcceppc.exe"
    exe.parent.mkdir(parents=True)
    exe.write_bytes(b"traced " + version.encode())
    digest = hashlib.sha1(exe.read_bytes()).hexdigest()
    validation = tmp_path / "validation"
    validation.mkdir()
    (validation / f"presence-{version}.json").write_text(json.dumps(presence(digest)))
    reports = []
    for index, report in enumerate(sweeps):
        path = tmp_path / f"sweep-{index}.json"
        path.write_text(json.dumps(report(digest) if callable(report) else report))
        reports.append(str(path))
    capabilities.copy_reports(reports, validation)
    return exe, validation, digest


def judged(version, exe, validation, digest, gate=GATE, games=None):
    entry = capabilities.candidate_entry(version, traced_ok(digest), presence(digest))
    return capabilities.gate_entry(version, entry, exe, validation, gate, games or {})


def test_candidates_need_linked_sources_and_events() -> None:
    entry = capabilities.candidate_entry("1.2.5n", traced_ok(missing=["src/backend/CodeGen.c"]),
                                         presence(failing=["frame", "scheduling"]))
    assert entry["points"] == [p for p in IMPLEMENTED if p != "frame"]
    assert "CodeGen.c" in entry["unavailable"]["frame"]
    assert "milestone 2" in entry["unavailable"]["scheduling"]


def test_claimed_point_without_events_fails_the_build() -> None:
    with pytest.raises(SystemExit, match="cse links from source but its events are missing"):
        capabilities.candidate_entry("1.2.5", traced_ok(), presence(failing=["cse", "scheduling"]))


def test_fixture_identity_failure_fails_the_build() -> None:
    report = presence()
    report["identity"]["off_equals_on"] = False
    with pytest.raises(SystemExit, match="differently with tracing on or off"):
        capabilities.candidate_entry("1.2.5", traced_ok(), report)


def test_a_build_without_sweeps_claims_nothing(tmp_path) -> None:
    assert GATE is not None
    exe, validation, digest = staged(tmp_path, "1.2.5")
    entry = judged("1.2.5", exe, validation, digest)
    assert entry["points"] == []
    assert entry["disabled"] == "no byte-identity evidence"
    assert entry["unavailable"]["coloring"] == "no byte-identity evidence"
    assert entry["byte_identity"]["status"] == "no evidence"


def test_a_passing_full_sweep_of_this_binary_enables_its_points(tmp_path) -> None:
    exe, validation, digest = staged(tmp_path, "1.2.5n", [lambda d: sweep("1.2.5n", d)])
    entry = judged("1.2.5n", exe, validation, digest)
    assert entry["points"] == IMPLEMENTED and "disabled" not in entry
    assert entry["byte_identity"]["status"] == "passed"


def test_evidence_for_another_binary_or_a_sample_does_not_count(tmp_path) -> None:
    exe, validation, digest = staged(tmp_path, "1.2.5", [sweep("1.2.5", "0" * 40),
                                                        lambda d: sweep("1.2.5", d, selection={"sample": 3})])
    entry = judged("1.2.5", exe, validation, digest)
    assert entry["points"] == [] and entry["disabled"] == "no byte-identity evidence"


def test_a_mismatch_in_any_sweep_disables(tmp_path) -> None:
    exe, validation, digest = staged(tmp_path, "1.2.5n", [lambda d: sweep("1.2.5n", d),
                                                         lambda d: sweep("1.2.5n", d, mismatched=1)])
    entry = judged("1.2.5n", exe, validation, digest)
    assert entry["points"] == [] and "byte identity failed" in entry["disabled"]
    assert entry["byte_identity"]["status"] == "failed"


def test_every_game_that_requires_the_version_needs_its_own_sweep(tmp_path) -> None:
    games = {"sms": {"required": ["1.2.5"]}, "melee": {"required": ["1.2.5"]}}
    exe, validation, digest = staged(tmp_path, "1.2.5", [lambda d: sweep("1.2.5", d, game="melee")])
    entry = judged("1.2.5", exe, validation, digest, games=games)
    assert entry["points"] == [] and entry["disabled"] == "no byte-identity evidence from sms"


def test_stock_failures_count_only_when_the_game_excludes_them(tmp_path) -> None:
    failing = ("build/u9.o",)
    exe, validation, digest = staged(tmp_path, "1.2.5", [lambda d: sweep("1.2.5", d, stock_failed=failing)])
    assert "unlisted stock failures" in judged("1.2.5", exe, validation, digest)["disabled"]
    games = {"sms": {"required": ["1.2.5"], "stock_exclusions": {"1.2.5": list(failing)}}}
    assert judged("1.2.5", exe, validation, digest, games=games)["points"] == IMPLEMENTED


def test_1_1p1_stays_disabled_with_passing_evidence(tmp_path) -> None:
    exe, validation, digest = staged(tmp_path, "1.1p1", [lambda d: sweep("1.1p1", d)])
    entry = judged("1.1p1", exe, validation, digest)
    assert entry["points"] == [] and "msgbuf" in entry["disabled"]


def test_without_the_gate_nothing_is_claimed(tmp_path) -> None:
    exe, validation, digest = staged(tmp_path, "1.2.5", [lambda d: sweep("1.2.5", d)])
    entry = judged("1.2.5", exe, validation, digest, gate=None)
    assert entry["points"] == [] and "no evidence gate" in entry["disabled"]


def test_copy_reports_files_by_game_and_replaces_earlier_evidence(tmp_path) -> None:
    validation = tmp_path / "validation"
    (validation / "byte-identity" / "old").mkdir(parents=True)
    (validation / "byte-identity" / "old" / "one-function.json").write_text("{}")
    (validation / "presence-1.2.5.json").write_text("{}")
    report = tmp_path / "r.json"
    report.write_text(json.dumps(sweep("1.2.5", "a" * 40)))
    capabilities.copy_reports([str(report), f"melee={report}"], validation)
    files = sorted(str(p.relative_to(validation)) for p in validation.rglob("*.json"))
    assert files == ["byte-identity/melee/one-function.json", "byte-identity/sms/one-function.json",
                     "presence-1.2.5.json"]


def test_committed_copy_matches_the_contract_schema() -> None:
    committed = json.loads((NATIVE / "CAPABILITIES.json").read_text())
    pin = json.loads((NATIVE / "PIN.json").read_text())
    assert committed["schema"] == "mwcc-native-capabilities-v1"
    assert committed["pin"] == pin["commit"]
    assert set(committed["versions"]) == set(pin["versions"])
    known = set(capabilities.POINT_SOURCES)
    assert committed["versions"]["1.1p1"]["points"] == []
    for version, entry in committed["versions"].items():
        assert entry["stock_sha1"] == pin["versions"][version]["stock_sha1"]
        assert len(entry["traced_sha1"]) == 40
        assert set(entry["points"]) <= known
        # (every point is either claimed or has a reason it is not; claims rest on passing evidence)
        assert set(entry["points"]) | set(entry["unavailable"]) == known
        if entry["points"]:
            assert entry["byte_identity"]["status"] == "passed"
            games = {s["game"] for s in entry["byte_identity"]["sweeps"] if s["selection"] == {"all": True}}
            assert {"sms", "melee"} <= games
        else:
            assert entry["disabled"]
