"""Golden/negative fixture tests for the diff-aware QA ship gate.

Golden fixtures are real diffs extracted from the rejected PR branches
(doldecomp/melee #2655-#2659); each must hard-fail with the expected rule at
the maintainer-flagged location. Negative fixtures must produce zero
error-severity findings.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from conftest import FIXTURES_DIR, SCAN_DIFF


def run_scan_diff(
    repo: Path,
    fixture: str,
    extra_env: dict[str, str] | None = None,
    surface: str | None = None,
):
    env = {k: v for k, v in os.environ.items() if k != "REVIEW_LINT_BANNED_DIR"}
    env.update(extra_env or {})
    command = [
        "python3",
        str(SCAN_DIFF),
        "--repo",
        str(repo),
        "--diff-file",
        str(FIXTURES_DIR / fixture),
        "--gate",
        "--json",
    ]
    if surface:
        command.extend(["--surface", surface])
    result = subprocess.run(command, capture_output=True, text=True, env=env)
    assert result.stdout, f"no stdout from scan_diff (stderr: {result.stderr})"
    return result.returncode, json.loads(result.stdout)


# (fixture, expected rule_id, file, inclusive line range of the finding)
GOLDEN_CASES = [
    # #2656 gm_1832.c — extern f32 lbl_804DA5C8 (no definition anywhere):
    # every extern in a .c file is an error under the strict policy.
    ("extern_f32_gm1832.patch", "extern_in_c", "src/melee/gm/gm_1832.c", (1270, 1290)),
    # #2656 gm_1832.c:1919 — extern const f32 lbl_804DA60C plus a brand-new
    # in-file definition (line 2708): the invented data anchor from PR #2656.
    # PsiLupan: "Using an extern to make a function match is just due to data
    # ordering." Now a plain extern_in_c error.
    ("extern_f32_gm1832.patch", "extern_in_c", "src/melee/gm/gm_1832.c", (1915, 1925)),
    # #2656 gm_1832.c:2387 — open-coded assert.
    ("unrolled_assert_gm1832.patch", "unrolled_assert", "src/melee/gm/gm_1832.c", (2384, 2393)),
    # #2657 grkongo.c:1580 — extern const f32 grKg_804DAFA0/A4 in own .sdata2.
    ("extern_floats_grkongo.patch", "extern_in_c", "src/melee/gr/grkongo.c", (98, 106)),
    # #2657 grkongo.c:662 — string literal replaced by char symbol address.
    ("extern_char_grkongo.patch", "string_literal_to_symbol", "src/melee/gr/grkongo.c", (655, 670)),
    # #2658 tydisplay.c — extern char un_803FF074[0xA8] string anchor.
    ("extern_string_tydisplay.patch", "extern_in_c", "src/melee/ty/tydisplay.c", (137, 145)),
    # #2658 tydisplay.c:1000 — OSReport literal replaced by symbol.
    ("extern_string_tydisplay.patch", "string_literal_to_symbol", "src/melee/ty/tydisplay.c", (1000, 1010)),
    # #2658 mncount.c:782 — packed string blob + offset macros.
    ("string_blob_mncount.patch", "packed_string_blob", "src/melee/mn/mncount.c", (779, 800)),
    # #2659 particle.c:1019 — packed string blob (the tombstone case).
    ("string_blob_particle.patch", "packed_string_blob", "src/sysdolphin/baselib/particle.c", (1016, 1025)),
    # #2657 gricemt.c:1482 — HSD_ASSERT unrolled into raw __assert.
    ("unrolled_assert_gricemt.patch", "unrolled_assert", "src/melee/gr/gricemt.c", (1479, 1492)),
    # #2688 grbigblue.c:1410 — numeric literal replaced by a TU data symbol.
    ("pr2688_stage_review_rules.patch", "numeric_literal_to_symbol", "src/melee/gr/grbigblue.c", (1407, 1412)),
    # #2688 grbigblue.c:1763 — Big Blue borrowed the Arwing union arm.
    ("pr2688_stage_review_rules.patch", "stage_ground_var_owner", "src/melee/gr/grbigblue.c", (1760, 1766)),
    # #2688 grrcruise.c:310 — hand-packed string blob for inline strings.
    ("pr2688_stage_review_rules.patch", "packed_string_blob", "src/melee/gr/grrcruise.c", (307, 315)),
    # #2688 grvenom.c:87 — copied jobj.h inline helper body.
    ("pr2688_stage_review_rules.patch", "copied_jobj_inline", "src/melee/gr/grvenom.c", (69, 80)),
]


@pytest.mark.parametrize("fixture,rule_id,file,line_range", GOLDEN_CASES)
def test_golden_fixture_hard_fails(melee_checkout, fixture, rule_id, file, line_range):
    exit_code, payload = run_scan_diff(melee_checkout, fixture)
    assert exit_code == 1, f"expected gate failure, got {exit_code}: {payload['counts']}"
    assert payload["status"] == "failed"
    matches = [
        f
        for f in payload["findings"]
        if f["rule_id"] == rule_id
        and f["file"] == file
        and line_range[0] <= f["line"] <= line_range[1]
    ]
    assert matches, (
        f"no {rule_id} finding in {file}:{line_range}; findings: "
        + json.dumps(payload["findings"], indent=2)
    )
    assert all(f["severity"] == "error" for f in matches)
    assert all(f["message"] for f in matches)


def test_contract_shape(melee_checkout):
    exit_code, payload = run_scan_diff(melee_checkout, "string_blob_particle.patch")
    assert exit_code == 1
    assert payload["tool"] == "review_lint"
    assert payload["operation"] == "review_lint:scan_diff"
    assert payload["status"] in {"passed", "warned", "failed"}
    assert payload["base"] is None  # diff-file mode
    assert isinstance(payload["repo"], str)
    assert set(payload["counts"]) == {"errors", "warnings"}
    for finding in payload["findings"]:
        for key in ("rule_id", "severity", "file", "line", "excerpt", "message"):
            assert key in finding
        assert "standard_id" in finding


def test_same_tu_function_extern_in_c_hard_fails_ref_scan(tmp_path: Path):
    repo = tmp_path / "repo"
    src_dir = repo / "src" / "sysdolphin" / "baselib"
    src_dir.mkdir(parents=True)
    cobj = src_dir / "cobj.c"
    cobj.write_text(
        "\n".join(
            [
                "typedef struct HSD_CObj HSD_CObj;",
                "typedef struct Vec3 Vec3;",
                "int HSD_CObjGetViewingMtxPtr(HSD_CObj* cobj)",
                "{",
                "    Vec3* up = 0;",
                "    return HSD_CObjGetUpVector(cobj, up);",
                "}",
                "",
                "int HSD_CObjGetUpVector(HSD_CObj* cobj, Vec3* up)",
                "{",
                "    return 0;",
                "}",
                "",
            ]
        )
    )
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True, text=True)
    subprocess.run(["git", "add", "src/sysdolphin/baselib/cobj.c"], cwd=repo, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=review-lint@example.invalid",
            "-c",
            "user.name=review-lint",
            "commit",
            "-m",
            "base",
        ],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
    cobj.write_text(
        "\n".join(
            [
                "typedef struct HSD_CObj HSD_CObj;",
                "typedef struct Vec3 Vec3;",
                "int HSD_CObjGetViewingMtxPtr(HSD_CObj* cobj)",
                "{",
                "    extern int HSD_CObjGetUpVector(HSD_CObj* cobj, Vec3* up);",
                "    Vec3* up = 0;",
                "    return HSD_CObjGetUpVector(cobj, up);",
                "}",
                "",
                "int HSD_CObjGetUpVector(HSD_CObj* cobj, Vec3* up)",
                "{",
                "    return 0;",
                "}",
                "",
            ]
        )
    )

    result = subprocess.run(
        [
            "python3",
            str(SCAN_DIFF),
            "--repo",
            str(repo),
            "--base",
            "HEAD",
            "--include-worktree",
            "--gate",
            "--json",
        ],
        capture_output=True,
        text=True,
    )
    assert result.stdout, result.stderr
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    matches = [
        f
        for f in payload["findings"]
        if f["rule_id"] == "extern_in_c"
        and f["file"] == "src/sysdolphin/baselib/cobj.c"
    ]
    assert matches, json.dumps(payload["findings"], indent=2)
    assert matches[0]["severity"] == "error"
    assert matches[0]["detail"]["symbol"] == "HSD_CObjGetUpVector"
    assert matches[0]["detail"]["kind"] == "function"
    assert matches[0]["detail"]["verdict"] == "same_tu_forward_decl"
    assert "MWCC inline decisions" in matches[0]["message"]
    assert "Externs in .c files are not allowed" in matches[0]["message"]


def test_ftcoll_forward_decl_externs_now_hard_fail(melee_checkout):
    """#2655 ftcoll.c: extern forward decls of data the TU itself owns were
    the previously accepted style; under the strict policy every extern in a
    .c file is an error, with the TU-ownership repair message."""

    exit_code, payload = run_scan_diff(melee_checkout, "sdata2_decl_ftcoll.patch")
    assert exit_code == 1
    externs = [f for f in payload["findings"] if f["rule_id"] == "extern_in_c"]
    assert len(externs) == 12, json.dumps(payload["findings"], indent=2)
    for finding in externs:
        assert finding["severity"] == "error"
        assert "Externs in .c files are not allowed" in finding["message"]
        assert finding["detail"]["verdict"] in {"self_tu_owned", "same_tu_forward_decl"}
    owned = [f for f in externs if f["detail"]["verdict"] == "self_tu_owned"]
    assert owned, "ftcoll owns its .sdata2 floats; expected self_tu_owned verdicts"
    assert "define it here in binary order" in owned[0]["message"]
    # Float-typed externs in the .sdata2 band carry the isolated repair tool.
    assert owned[0]["detail"]["data_ordering_repair"]["tool"] == "review_lint_sdata2_order_helper"


def test_gm1832_extern_in_c_detail(melee_checkout):
    """Both gm_1832 extern cheats (the invented lbl_804DA60C anchor and the
    dangling lbl_804DA5C8 self-TU extern) are extern_in_c errors with the
    ownership-informed repair message."""

    exit_code, payload = run_scan_diff(melee_checkout, "extern_f32_gm1832.patch")
    assert exit_code == 1
    externs = {
        f["detail"]["symbol"]: f
        for f in payload["findings"]
        if f["rule_id"] == "extern_in_c"
    }
    assert set(externs) == {"lbl_804DA5C8", "lbl_804DA60C"}, json.dumps(
        payload["findings"], indent=2
    )
    for finding in externs.values():
        assert finding["severity"] == "error"
        assert finding["file"] == "src/melee/gm/gm_1832.c"
        assert "Externs in .c files are not allowed" in finding["message"]
    # lbl_804DA5C8's address sits inside gm_1832's own splits.txt ranges.
    owned = externs["lbl_804DA5C8"]
    assert owned["detail"]["verdict"] == "self_tu_owned"
    assert owned["standard_id"] == "global_standard:literals-and-data-ownership"
    assert "define it here in binary order" in owned["message"]
    assert owned["detail"]["repair_hint"]
    assert owned["detail"]["data_ordering_repair"]["tool"] == "review_lint_sdata2_order_helper"
    # lbl_804DA60C (extern + brand-new definition in this diff) keeps the
    # forward-declaration repair path unless the address is TU-owned.
    anchor = externs["lbl_804DA60C"]
    assert anchor["detail"]["verdict"] in {"self_tu_owned", "same_tu_forward_decl"}
    if anchor["detail"]["verdict"] == "same_tu_forward_decl":
        assert anchor["detail"]["symbol_existed_in_base"] is False
        assert "reorder/restructure" in anchor["message"]


def test_cross_tu_extern_is_error_with_header_repair(melee_checkout):
    exit_code, payload = run_scan_diff(melee_checkout, "cross_tu_extern_ok.patch")
    assert exit_code == 1
    externs = [f for f in payload["findings"] if f["rule_id"] == "extern_in_c"]
    assert len(externs) == 1, json.dumps(payload["findings"], indent=2)
    finding = externs[0]
    assert finding["severity"] == "error"
    assert finding["detail"]["verdict"] == "cross_tu"
    assert "Externs in .c files are not allowed" in finding["message"]
    assert "declare it in the owning header and include it" in finding["message"]


def test_negative_real_string_table(melee_checkout):
    exit_code, payload = run_scan_diff(melee_checkout, "real_string_table.patch")
    assert exit_code == 0
    assert payload["findings"] == []


def test_negative_assert_macro_header(melee_checkout):
    exit_code, payload = run_scan_diff(melee_checkout, "assert_macro_header.patch")
    assert exit_code == 0
    assert payload["findings"] == []


def test_hardened_rules_smoke_flags_real_gate_path(melee_checkout):
    """Every hardened rule added by the 2026-06-12 audit fires through
    scan_diff.py, not just the isolated rule helpers."""

    exit_code, payload = run_scan_diff(melee_checkout, "hardened_rules_smoke.patch")
    assert exit_code == 1
    assert payload["status"] == "failed"
    by_rule: dict[str, set[str]] = {}
    for finding in payload["findings"]:
        by_rule.setdefault(finding["rule_id"], set()).add(finding["severity"])
    expected_errors = {
        "fake_assert_macro",
        "assert_idiom_downgrade",
        "register_keyword",
        "inline_asm",
        "m2c_residue_names",
        "m2c_goto_label",
        "m2c_field_use",
        "address_named_static_data",
        "define_alias",
        # Strictness flips: everything below used to be warning-only.
        "novel_pragma",
        "codegen_pragma",
        "pointer_offset_arithmetic",
        "volatile_local_tactic",
    }
    for rule_id in expected_errors:
        assert "error" in by_rule.get(rule_id, set()), json.dumps(payload["findings"], indent=2)
    # Non-block gotos and canonical macro clones are hard errors now too.
    assert by_rule.get("m2c_goto_label") == {"error"}
    assert by_rule.get("define_alias") == {"error"}
    # The ONLY advisory warnings left: type_erasing_cast and the spNN
    # stack-slot subcase of m2c_residue_names, both flagged for LLM review.
    warnings = [f for f in payload["findings"] if f["severity"] == "warning"]
    assert warnings, json.dumps(payload["findings"], indent=2)
    assert {f["rule_id"] for f in warnings} == {"type_erasing_cast", "m2c_residue_names"}
    for finding in warnings:
        assert finding["detail"]["llm_review"] is True, json.dumps(finding, indent=2)
    sp_warnings = [f for f in warnings if f["rule_id"] == "m2c_residue_names"]
    assert {f["detail"]["name"] for f in sp_warnings} == {"sp24"}


def test_surface_flag_keeps_base_severities_and_llm_review(melee_checkout):
    """--surface worker/pr_gate resolves per-surface severities; with no
    per-surface overrides declared, results match the base run."""

    base_code, base_payload = run_scan_diff(melee_checkout, "hardened_rules_smoke.patch")
    for surface in ("worker", "pr_gate"):
        exit_code, payload = run_scan_diff(
            melee_checkout, "hardened_rules_smoke.patch", surface=surface
        )
        assert exit_code == base_code == 1
        assert [
            (f["rule_id"], f["file"], f["line"], f["severity"])
            for f in payload["findings"]
        ] == [
            (f["rule_id"], f["file"], f["line"], f["severity"])
            for f in base_payload["findings"]
        ]
        warnings = [f for f in payload["findings"] if f["severity"] == "warning"]
        assert {f["rule_id"] for f in warnings} == {"type_erasing_cast", "m2c_residue_names"}
        assert all(f["detail"]["llm_review"] is True for f in warnings)


# ---------------------------------------------------------------------------
# Base-presence inference helper (symbol_in_diff_base / symbol_existed_in_base).
# ---------------------------------------------------------------------------

import scan_diff  # noqa: E402  (conftest puts api/ on sys.path)

INFERENCE_DIFF = """\
diff --git a/src/melee/gm/x.c b/src/melee/gm/x.c
index 1111111..2222222 100644
--- a/src/melee/gm/x.c
+++ b/src/melee/gm/x.c
@@ -10,3 +10,4 @@ void caller(void)
 static int keep_ctx;
-const f32 lbl_80400000 = 0.5f;
+extern const f32 lbl_80400000;
+extern const f32 lbl_80400004;
 use(lbl_80400008);
"""


def test_symbol_in_diff_base_inference():
    file_diffs = scan_diff.parse_unified_diff(INFERENCE_DIFF)
    rel = "src/melee/gm/x.c"
    # Appears in a removed line -> existed in base (moved definition).
    assert scan_diff.symbol_in_diff_base(file_diffs, rel, "lbl_80400000")
    # Appears only in added lines -> new in this diff.
    assert not scan_diff.symbol_in_diff_base(file_diffs, rel, "lbl_80400004")
    # Appears in a context line -> existed in base.
    assert scan_diff.symbol_in_diff_base(file_diffs, rel, "lbl_80400008")
    assert scan_diff.symbol_in_diff_base(file_diffs, rel, "keep_ctx")
    # Word-boundary match: substrings of longer identifiers do not count.
    assert not scan_diff.symbol_in_diff_base(file_diffs, rel, "lbl_8040000")
    # Unknown file -> not present.
    assert not scan_diff.symbol_in_diff_base(file_diffs, "src/other.c", "lbl_80400000")


def test_symbol_existed_in_base_diff_mode_uses_inference(melee_checkout):
    file_diffs = scan_diff.parse_unified_diff(INFERENCE_DIFF)
    rel = "src/melee/gm/x.c"
    cache: dict[str, str | None] = {}
    assert scan_diff.symbol_existed_in_base(
        melee_checkout, rel, "lbl_80400000", "diff", file_diffs, None, cache
    )
    assert not scan_diff.symbol_existed_in_base(
        melee_checkout, rel, "lbl_80400004", "diff", file_diffs, None, cache
    )
    assert cache == {}  # diff mode never consults git


def test_symbol_existed_in_base_ref_mode_prefers_git_show(melee_checkout):
    # Real file at the known base sha: lbl_804DA60C is absent from the base
    # gm_1832.c, while gm_80188454 exists there.
    base = "0b15e713"
    rel = "src/melee/gm/gm_1832.c"
    cache: dict[str, str | None] = {}
    assert scan_diff.symbol_existed_in_base(
        melee_checkout, rel, "gm_80188454", "head", [], base, cache
    )
    assert not scan_diff.symbol_existed_in_base(
        melee_checkout, rel, "lbl_804DA60C", "head", [], base, cache
    )
    assert rel in cache and cache[rel]  # git show result cached
    # Missing base blob falls back to diff inference (empty diff -> False).
    assert not scan_diff.symbol_existed_in_base(
        melee_checkout, "src/does/not/exist.c", "anything", "head", [], base, cache
    )


MOVED_LINE_DIFF = """\
diff --git a/src/melee/gr/x.c b/src/melee/gr/x.c
index 1111111..2222222 100644
--- a/src/melee/gr/x.c
+++ b/src/melee/gr/x.c
@@ -10,6 +10,7 @@ void old_place(void)
 {
     __assert(__FILE__, 1, "obj");
 }
@@ -30,5 +31,6 @@ void new_place(void)
 {
+    __assert(__FILE__, 1, "obj");
 }
"""


def test_moved_line_suppression_downgrades_existing_exact_lines(melee_checkout):
    file_diffs = scan_diff.parse_unified_diff(MOVED_LINE_DIFF)
    findings = scan_diff.collect_findings(file_diffs, melee_checkout, "diff")
    moved = [f for f in findings if f["rule_id"] == "unrolled_assert"]
    assert moved, json.dumps(findings, indent=2)
    assert all(f["severity"] == "warning" for f in moved)
    assert moved[0]["detail"]["moved_vs_invented"] == "added_line_existed_verbatim_in_base"


MOVED_EXTERN_DIFF = """\
diff --git a/src/melee/gr/x.c b/src/melee/gr/x.c
index 1111111..2222222 100644
--- a/src/melee/gr/x.c
+++ b/src/melee/gr/x.c
@@ -10,6 +10,7 @@ void old_place(void)
 {
-extern u8 legacy_803FF074[];
 }
@@ -30,5 +31,6 @@ void new_place(void)
 {
+extern u8 legacy_803FF074[];
 }
"""


def test_extern_in_c_moved_line_downgrades_to_warning(melee_checkout):
    """~655 legacy externs still exist upstream: an extern line moved
    verbatim within a file must not hard-fail the gate."""

    assert "extern_in_c" in scan_diff.MOVED_LINE_DOWNGRADE_RULES
    file_diffs = scan_diff.parse_unified_diff(MOVED_EXTERN_DIFF)
    findings = scan_diff.collect_findings(file_diffs, melee_checkout, "diff")
    moved = [f for f in findings if f["rule_id"] == "extern_in_c"]
    assert moved, json.dumps(findings, indent=2)
    assert all(f["severity"] == "warning" for f in moved)
    assert moved[0]["detail"]["moved_vs_invented"] == "added_line_existed_verbatim_in_base"


def _git_repo_with_change(tmp_path: Path, rel_path: str, base_text: str, new_text: str) -> Path:
    repo = tmp_path / "repo"
    target = repo / rel_path
    target.parent.mkdir(parents=True)
    target.write_text(base_text)
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True, text=True)
    subprocess.run(["git", "add", rel_path], cwd=repo, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.email=review-lint@example.invalid",
            "-c",
            "user.name=review-lint",
            "commit",
            "-m",
            "base",
        ],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    )
    target.write_text(new_text)
    return repo


def test_extern_in_c_forward_decl_of_same_tu_data(tmp_path: Path):
    """An added extern for data the TU defines later carries the
    forward-declaration repair message (reorder/restructure instead)."""

    base = "int helper_count = 0;\n\nvoid use(void)\n{\n}\n"
    new = (
        "extern int helper_count;\n\nvoid use(void)\n{\n}\n\n"
        "int helper_count = 0;\n"
    )
    repo = _git_repo_with_change(tmp_path, "src/melee/gm/x.c", base, new)
    result = subprocess.run(
        [
            "python3",
            str(SCAN_DIFF),
            "--repo",
            str(repo),
            "--base",
            "HEAD",
            "--include-worktree",
            "--gate",
            "--json",
        ],
        capture_output=True,
        text=True,
    )
    assert result.stdout, result.stderr
    payload = json.loads(result.stdout)
    assert result.returncode == 1
    externs = [f for f in payload["findings"] if f["rule_id"] == "extern_in_c"]
    assert len(externs) == 1, json.dumps(payload["findings"], indent=2)
    finding = externs[0]
    assert finding["severity"] == "error"
    assert finding["detail"]["verdict"] == "same_tu_forward_decl"
    assert finding["detail"]["symbol_existed_in_base"] is True
    assert "Externs in .c files are not allowed" in finding["message"]
    assert "reorder/restructure" in finding["message"]
