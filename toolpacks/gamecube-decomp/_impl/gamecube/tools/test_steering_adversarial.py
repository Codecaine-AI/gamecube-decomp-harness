"""Adversarial suite for the steering gate (objectives/sms-real-codegen plan 8.2).

Each test applies one synthetic edit to a real SMS function that matches the
original 100% at upstream 7fed828b, runs ``steering_check.run_check`` in
process (IR oracle on a cached ``git archive`` of the base, MWCC in shadow
roots) and asserts the outcome the plan fixed before tuning. The candidate is
an overlay directory; the sandbox is only read.

A case whose observed outcome contradicts the plan keeps the plan's assertion
and is marked ``xfail(strict=True)`` with the observed result, so a tool fix
turns it into an XPASS failure that asks for the marker to be removed.

Needs clang (``ir_oracle.find_clang``) and a built SMS sandbox at upstream
(``STEERING_SMS_SANDBOX``, default ``.../games/sms/workspace/sb-up7f``).
"""

from __future__ import annotations

import copy
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import ir_oracle  # noqa: E402
import steering_check as sc  # noqa: E402

SANDBOX = Path(os.environ.get(
    "STEERING_SMS_SANDBOX",
    "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up7f",
))
BASE = "HEAD"
JOBS = 3
HANA = "src/Enemy/hanasambo.cpp"
HANA_HPP = "include/Enemy/HanaSambo.hpp"
SCENE = "src/MSound/MSoundScene.cpp"


def _sandbox_ready() -> bool:
    try:
        clang = ir_oracle.find_clang()
    except Exception:
        clang = None
    return bool(clang) and all((SANDBOX / rel).exists() for rel in (
        "build.ninja", "build/tools/objdiff-cli", "build/GMSJ01/obj", ".git"))


steering_sandbox = pytest.mark.skipif(
    not _sandbox_ready(),
    reason="steering_sandbox: needs clang and a built SMS sandbox at upstream 7fed828b "
           "(set STEERING_SMS_SANDBOX)",
)
pytestmark = [steering_sandbox]


# --------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------


def _git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(SANDBOX), *args], capture_output=True, check=True).stdout.decode()


def _sandbox_state() -> tuple[str, str]:
    return _git("rev-parse", "HEAD"), _git("status", "--porcelain", "--untracked-files=all")


@pytest.fixture(scope="module", autouse=True)
def ninja_compile_bound_to_sandbox():
    """stack_check.Repo needs ninja_compile bound to the sandbox; another test
    module may have imported it bound elsewhere. Rebind for this module only."""
    import importlib

    old = os.environ.get("ORCH_GAME_REPO_ROOT")
    os.environ["ORCH_GAME_REPO_ROOT"] = str(SANDBOX.resolve())
    if "ninja_compile" in sys.modules:
        importlib.reload(sys.modules["ninja_compile"])
    yield
    if old is None:
        os.environ.pop("ORCH_GAME_REPO_ROOT", None)
    else:
        os.environ["ORCH_GAME_REPO_ROOT"] = old
    if "ninja_compile" in sys.modules:
        importlib.reload(sys.modules["ninja_compile"])


@pytest.fixture(scope="module")
def sandbox_state() -> tuple[str, str]:
    return _sandbox_state()


@pytest.fixture(autouse=True)
def sandbox_untouched(sandbox_state: tuple[str, str]):
    """Case 12: no test writes into the sandbox (HEAD and `git status` unchanged)."""
    yield
    assert _sandbox_state() == sandbox_state, "the steering gate wrote into the sandbox"


@pytest.fixture(scope="module")
def cache_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return tmp_path_factory.mktemp("steering-cache")


@pytest.fixture
def approvals(tmp_path: Path) -> Path:
    path = tmp_path / "approvals.jsonl"
    path.write_text("")  # hermetic: no curated evidence approvals
    return path


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def head_text(rel: str) -> str:
    return _git("show", f"{BASE}:{rel}")


def make_overlay(tmp_path: Path, edits: dict[str, list[tuple[str, str]]]) -> Path:
    """Write HEAD text with each (needle, replacement) applied; needles must be unique."""
    root = tmp_path / "overlay"
    for rel, pairs in edits.items():
        text = head_text(rel)
        for needle, replacement in pairs:
            assert text.count(needle) == 1, f"{rel}: needle occurs {text.count(needle)}x: {needle!r}"
            text = text.replace(needle, replacement)
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(text.encode("utf-8"))
    return root


def check(tmp_path: Path, cache_dir: Path, approvals: Path, edits: dict[str, list[tuple[str, str]]],
          functions: list[str]) -> dict:
    overlay = make_overlay(tmp_path, edits)
    shadow = tmp_path / "shadow"
    shadow.mkdir()
    report = sc.run_check(SANDBOX, BASE, overlay_dir=str(overlay), cache_dir=cache_dir, functions=functions,
                          jobs=JOBS, tmp=str(shadow), approvals_path=approvals)
    assert report["edits"]["files"], "the overlay produced no changed file"
    return report


def function(report: dict, mangled_prefix: str, unit: Optional[str] = None) -> dict:
    rows = [f for f in report["decision"]["functions"]
            if f["name"].startswith(mangled_prefix) and (unit is None or f["unit"] == unit)]
    assert len(rows) == 1, f"{mangled_prefix}: {[f['name'] for f in report['decision']['functions']]}"
    return rows[0]


def final_status(report: dict, group: dict) -> Optional[str]:
    """Group status after `decide` (call-construct checks, evidence keeps)."""
    for update in report["decision"]["group_updates"]:
        if update["id"] == group["id"]:
            return update["status"]
    return group["status"]


def summary(report: dict) -> str:
    """Compact observed outcome, for assertion messages and xfail reasons."""
    groups = [{k: g.get(k) for k in ("id", "status", "shapes", "real_shapes", "reason")}
              | {"final": final_status(report, g)} for g in report["reduce"]["groups"]]
    fns = [{k: f.get(k) for k in ("name", "decision", "semantic", "analysis", "match", "sstar_vs_candidate")}
           for f in report["decision"]["functions"]]
    return (f"attempt={report['decision']['attempt']} analysis={report['reduce']['analysis']} "
            f"groups={groups} functions={fns}")


def assert_never_pass(report: dict, fn: dict) -> None:
    assert fn["decision"] != "pass", summary(report)
    assert report["decision"]["attempt"] != "pass", summary(report)


# --------------------------------------------------------------------------
# Plan 8.2 cases
# --------------------------------------------------------------------------


def test_coupled_temp_and_real_condition_fix_never_passes(tmp_path, cache_dir, approvals) -> None:
    """Case 1: a single-use temp and a real `==` -> `!=` fix in one hunk."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [(
        "\tif (param_2 == HIT_MESSAGE_SPRAYED_BY_WATER) {\n\t\tif (!unk150)",
        "\tu32 msg = param_2;\n\tif (msg != HIT_MESSAGE_SPRAYED_BY_WATER) {\n\t\tif (!unk150)",
    )]}, ["TSamboFlower::receiveMessage"])
    fn = function(report, "receiveMessage__12TSamboFlower")
    assert_never_pass(report, fn)
    assert fn["decision"] in ("unresolved", "steering_located"), summary(report)


def test_volatile_local_is_unresolved_directive(tmp_path, cache_dir, approvals) -> None:
    """Case 2: `volatile` on a local is a codegen directive, never reverted or credited."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [
        ("\tf32 gravity = mGravity;", "\tvolatile f32 gravity = mGravity;"),
    ]}, ["TSamboHead::getGravityY"])
    [group] = report["reduce"]["groups"]
    assert final_status(report, group) == "unresolved", summary(report)
    assert "codegen_directive" in group["shapes"], summary(report)
    assert report["decision"]["attempt"] != "pass", summary(report)
    assert function(report, "getGravityY__10TSamboHead")["decision"] != "pass", summary(report)


def test_single_use_temp_on_exact_function_is_steering(tmp_path, cache_dir, approvals) -> None:
    """Case 3: a temp for an existing call result: removable, the attempt is rejected."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [(
        '\tmMActor = getActorKeeper()->getMActor("samboD.bmd");',
        '\tMActor* dead = getActorKeeper()->getMActor("samboD.bmd");\n\tmMActor = dead;',
    )]}, ["THanaSambo::setDeadAnm"])
    [group] = report["reduce"]["groups"]
    assert final_status(report, group) == "removable", summary(report)
    assert report["decision"]["attempt"] == "steering_located", summary(report)
    # MWCC may emit identical code, so the function itself may pass; never unresolved.
    assert function(report, "setDeadAnm__10THanaSambo")["decision"] in ("pass", "steering_located"), summary(report)


def test_int_to_s32_spelling_is_removable(tmp_path, cache_dir, approvals) -> None:
    """Case 4: `int` -> `s32` on a loop counter."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [(
        "\t\tfor (int i = 0; i < unk58; i++)\n\t\t\tunk54[i]->checkGenCoin();",
        "\t\tfor (s32 i = 0; i < unk58; i++)\n\t\t\tunk54[i]->checkGenCoin();",
    )]}, ["TSamboFlowerManager::perform"])
    [group] = report["reduce"]["groups"]
    assert final_status(report, group) == "removable", summary(report)
    assert report["decision"]["attempt"] != "pass", summary(report)


def test_real_literal_fix_is_real_and_passes(tmp_path, cache_dir, approvals) -> None:
    """Case 5: a behaviour change with a real shape only (literal): retained `real`,
    S* equals the candidate, so the function passes (match is MWCC's business)."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [
        ("\tsetBckAnm(7);\n\tunk1B0 = 0;", "\tsetBckAnm(8);\n\tunk1B0 = 0;"),
    ]}, ["THanaSambo::setWaitAnm"])
    [group] = report["reduce"]["groups"]
    assert final_status(report, group) == "real", summary(report)
    assert "literal_change" in group["real_shapes"], summary(report)
    fn = function(report, "setWaitAnm__10THanaSambo")
    assert fn["decision"] == "pass", summary(report)
    assert fn["sstar_vs_candidate"] == "identical", summary(report)


def test_removing_a_call_the_original_makes_is_not_real(tmp_path, cache_dir, approvals) -> None:
    """Case 6: dropping `mMActor->setBck(...)`; the target still calls MActor::setBck,
    so the call-construct check must refuse the `call_removed` shape."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [(
        '\tTSpineEnemy::reset();\n\tmMActor->setBck("flower_wait");\n',
        "\tTSpineEnemy::reset();\n",
    )]}, ["TSamboFlower::reset"])
    [group] = report["reduce"]["groups"]
    assert "call_removed" in group["real_shapes"], summary(report)
    assert final_status(report, group) != "real", summary(report)
    assert report["decision"]["attempt"] != "pass", summary(report)
    assert function(report, "reset__12TSamboFlower")["decision"] != "pass", summary(report)


def test_non_inlined_static_helper_extraction_never_passes(tmp_path, cache_dir, approvals) -> None:
    """Case 7: the leaf loop moved into a static helper. The helper recurses, so MWCC
    keeps it out of line (a new `bl` the original does not have)."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [
        ("void TSamboFlowerManager::perform(u32 param_1, JDrama::TGraphics* param_2)\n{",
         "static void performLeaves(TSamboLeaf** leaves, int n, u32 flags, JDrama::TGraphics* gfx)\n{\n"
         "\tif (n <= 0)\n\t\treturn;\n\tleaves[0]->perform(flags, gfx);\n"
         "\tperformLeaves(leaves + 1, n - 1, flags, gfx);\n}\n\n"
         "void TSamboFlowerManager::perform(u32 param_1, JDrama::TGraphics* param_2)\n{"),
        ("\tfor (int i = 0; i < 0x12; ++i)\n\t\tunk60[i]->perform(param_1, param_2);\n}",
         "\tperformLeaves(unk60, 0x12, param_1, param_2);\n}"),
    ]}, ["TSamboFlowerManager::perform"])
    fn = function(report, "perform__19TSamboFlowerManager")
    assert_never_pass(report, fn)
    statuses = {final_status(report, g) for g in report["reduce"]["groups"]}
    assert statuses & {"unresolved", "removable"}, summary(report)


def test_inlined_static_helper_extraction_never_passes(tmp_path, cache_dir, approvals) -> None:
    """Case 7 variant: the same extraction without recursion; both compilers inline the
    helper. Plan 8.2: helper extraction -> unresolved (`other`), never pass."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [
        ("void TSamboFlowerManager::perform(u32 param_1, JDrama::TGraphics* param_2)\n{",
         "static void performLeaves(TSamboLeaf** leaves, u32 flags, JDrama::TGraphics* gfx)\n{\n"
         "\tfor (int i = 0; i < 0x12; ++i)\n\t\tleaves[i]->perform(flags, gfx);\n}\n\n"
         "void TSamboFlowerManager::perform(u32 param_1, JDrama::TGraphics* param_2)\n{"),
        ("\tfor (int i = 0; i < 0x12; ++i)\n\t\tunk60[i]->perform(param_1, param_2);\n}",
         "\tperformLeaves(unk60, param_1, param_2);\n}"),
    ]}, ["TSamboFlowerManager::perform"])
    assert_never_pass(report, function(report, "perform__19TSamboFlowerManager"))


def test_macro_expanded_rewrite_is_removable(tmp_path, cache_dir, approvals) -> None:
    """Case 8: `ARRAY_COUNT(mTrans)` spelled as its expansion (include/macros.h)."""
    report = check(tmp_path, cache_dir, approvals, {SCENE: [(
        "\tfor (int i = 0; i < ARRAY_COUNT(mTrans); ++i)\n\t\tmTrans[i] = nullptr;",
        "\tfor (int i = 0; i < (int)(sizeof(mTrans) / sizeof(mTrans[0])); ++i)\n\t\tmTrans[i] = nullptr;",
    )]}, ["MSSceneSE::MSSceneSE"])
    [group] = report["reduce"]["groups"]
    assert final_status(report, group) == "removable", summary(report)
    assert report["decision"]["attempt"] == "steering_located", summary(report)


def test_clang_incompatible_mwcc_syntax_is_incomplete(tmp_path, cache_dir, approvals) -> None:
    """Case 9: an MWCC `asm { nop }` statement; the oracle's `-Dasm=` leaves `{ nop }`,
    which clang rejects. MWCC builds it, the analysis must not."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [
        ("\tsetBckAnm(7);\n\tunk1B0 = 0;", "\tsetBckAnm(7);\n\tasm { nop }\n\tunk1B0 = 0;"),
    ]}, ["THanaSambo::setWaitAnm"])
    assert report["reduce"]["analysis"] == "incomplete", summary(report)
    fn = function(report, "setWaitAnm__10THanaSambo")
    assert fn["decision"] == "unresolved", summary(report)
    assert fn["analysis"] == "incomplete", summary(report)
    assert_never_pass(report, fn)


def _temp_alias_manifest(tmp_path: Path) -> dict:
    overlay = make_overlay(tmp_path, {HANA: [(
        '\tmMActor = getActorKeeper()->getMActor("samboD.bmd");',
        '\tMActor* dead = getActorKeeper()->getMActor("samboD.bmd");\n\tmMActor = dead;',
    )]})
    return sc.build_edits(SANDBOX, BASE, overlay_dir=str(overlay))


def _reduce(manifest: dict, cache: Path, approvals: Path) -> dict:
    return sc.run_reduce(manifest, SANDBOX, cache, budget=sc.DEFAULT_BUDGET, max_groups=sc.DEFAULT_MAX_GROUPS,
                         jobs=JOBS, approvals_path=approvals, evidence_repo=None)


def test_host_base_tree_mismatch_is_incomplete(tmp_path, cache_dir, approvals) -> None:
    """Case 10a: the sandbox reports a base tree the host does not have."""
    manifest = _temp_alias_manifest(tmp_path)
    assert manifest["files"] and manifest["base_tree"]
    manifest["base_tree"] = "0" * 40
    red = _reduce(manifest, cache_dir, approvals)
    assert red["analysis"] == "incomplete"
    assert red["oracle"]["context"]["base_tree_ok"] is False
    assert all(g["status"] != "removable" for g in red["groups"]), red["groups"]


def test_generated_include_mismatch_is_incomplete(tmp_path, approvals) -> None:
    """Case 10b: a generated include whose text no longer matches its recorded hash.
    Fresh cache: the generated dir is keyed by the declared hashes only."""
    manifest = copy.deepcopy(_temp_alias_manifest(tmp_path))
    texts = [f for f in manifest["generated"]["files"] if f.get("text") is not None]
    assert texts, "no text generated include to tamper with"
    texts[0]["text"] += "\n/* tampered by test_steering_adversarial */\n"
    red = _reduce(manifest, tmp_path / "fresh-cache", approvals)
    assert red["analysis"] == "incomplete"
    assert red["oracle"]["context"]["base_tree_ok"] is True
    assert red["oracle"]["context"]["generated_ok"] is False
    assert all(g["status"] != "removable" for g in red["groups"]), red["groups"]


def test_codegen_neutral_rewrite_rejects_the_attempt(tmp_path, cache_dir, approvals) -> None:
    """Case 11: `++i` -> `i = i + 1`; no codegen effect, still not banked."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [(
        "\tfor (int i = 0; i < 0x12; ++i)\n\t\tunk60[i]->perform(param_1, param_2);",
        "\tfor (int i = 0; i < 0x12; i = i + 1)\n\t\tunk60[i]->perform(param_1, param_2);",
    )]}, ["TSamboFlowerManager::perform"])
    [group] = report["reduce"]["groups"]
    assert final_status(report, group) == "removable" and not group["cosmetic"], summary(report)
    assert report["decision"]["attempt"] == "steering_located", summary(report)
    assert group["id"] in report["decision"]["removable_noncosmetic"], summary(report)


# --------------------------------------------------------------------------
# Optional plan 8.2 extras
# --------------------------------------------------------------------------


def test_independent_call_reorder_is_unresolved(tmp_path, cache_dir, approvals) -> None:
    """Swapping two independent out-of-line calls (plan 8.2: -> unresolved)."""
    report = check(tmp_path, cache_dir, approvals, {HANA: [(
        "\tgpBindShadowManager->request(request, getActorType() & HIT_CATEGORY_MASK);\n"
        "\tmMActor->setLightData(mGroundPlane, mPosition);\n",
        "\tmMActor->setLightData(mGroundPlane, mPosition);\n"
        "\tgpBindShadowManager->request(request, getActorType() & HIT_CATEGORY_MASK);\n",
    )]}, ["TSamboFlower::drawObject"])
    fn = function(report, "drawObject__12TSamboFlower")
    assert fn["decision"] == "unresolved", summary(report)
    assert report["decision"]["attempt"] == "unresolved", summary(report)


def test_shared_header_edit_reduces_consistently(tmp_path, cache_dir, approvals) -> None:
    """A temp in a header inline included by two units: one S* text for both units."""
    report = check(tmp_path, cache_dir, approvals, {HANA_HPP: [(
        "\tvirtual bool isCollidMove(THitActor*) { return false; }",
        "\tvirtual bool isCollidMove(THitActor*)\n\t{\n\t\tbool collid = false;\n\t\treturn collid;\n\t}",
    )]}, ["THanaSambo::isCollidMove"])
    units = report["edits"]["header_units"][HANA_HPP]
    assert len(units) >= 2, units
    [group] = report["reduce"]["groups"]
    assert sorted(group["units"]) == sorted(units), summary(report)
    status = final_status(report, group)
    assert status in ("removable", "real", "unresolved"), summary(report)
    reverted = set(report["mwcc"]["revert_edits"])
    # S* is one text: the group is reverted for every including unit, or kept for all.
    assert set(group["edit_ids"]) <= reverted if status == "removable" else not set(group["edit_ids"]) & reverted
    assert report["decision"]["attempt"] != "pass", summary(report)
