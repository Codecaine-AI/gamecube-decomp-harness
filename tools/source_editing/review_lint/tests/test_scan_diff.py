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


def run_scan_diff(repo: Path, fixture: str, extra_env: dict[str, str] | None = None):
    env = {k: v for k, v in os.environ.items() if k != "REVIEW_LINT_BANNED_DIR"}
    env.update(extra_env or {})
    result = subprocess.run(
        [
            "python3",
            str(SCAN_DIFF),
            "--repo",
            str(repo),
            "--diff-file",
            str(FIXTURES_DIR / fixture),
            "--gate",
            "--json",
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    assert result.stdout, f"no stdout from scan_diff (stderr: {result.stderr})"
    return result.returncode, json.loads(result.stdout)


# (fixture, expected rule_id, file, inclusive line range of the finding)
GOLDEN_CASES = [
    # #2656 gm_1832.c — extern f32 lbl_804DA5C8 (no definition anywhere) is
    # the self-TU extern cheat.
    ("extern_f32_gm1832.patch", "self_tu_extern", "src/melee/gm/gm_1832.c", (1270, 1290)),
    # #2656 gm_1832.c:1919 — extern const f32 lbl_804DA60C plus a brand-new
    # in-file definition (line 2708): the symbol does not exist in base, so
    # this invents a data anchor to force data ordering. PsiLupan: "Using an
    # extern to make a function match is just due to data ordering."
    ("extern_f32_gm1832.patch", "new_data_anchor", "src/melee/gm/gm_1832.c", (1915, 1925)),
    # #2656 gm_1832.c:2387 — open-coded assert.
    ("unrolled_assert_gm1832.patch", "unrolled_assert", "src/melee/gm/gm_1832.c", (2384, 2393)),
    # #2657 grkongo.c:1580 — extern const f32 grKg_804DAFA0/A4 in own .sdata2.
    ("extern_floats_grkongo.patch", "self_tu_extern", "src/melee/gr/grkongo.c", (98, 106)),
    # #2657 grkongo.c:662 — string literal replaced by char symbol address.
    ("extern_char_grkongo.patch", "string_literal_to_symbol", "src/melee/gr/grkongo.c", (655, 670)),
    # #2658 tydisplay.c — extern char un_803FF074[0xA8] string anchor.
    ("extern_string_tydisplay.patch", "extern_literal_anchor", "src/melee/ty/tydisplay.c", (137, 145)),
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


def test_same_tu_function_extern_hard_fails_ref_scan(tmp_path: Path):
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
        if f["rule_id"] == "same_tu_function_extern"
        and f["file"] == "src/sysdolphin/baselib/cobj.c"
    ]
    assert matches, json.dumps(payload["findings"], indent=2)
    assert matches[0]["severity"] == "error"
    assert matches[0]["detail"]["symbol"] == "HSD_CObjGetUpVector"
    assert matches[0]["detail"]["scope"] == "block"


def test_negative_ftcoll_style_note_is_clean(melee_checkout):
    """#2655 ftcoll.c: extern forward decls whose definitions PRE-EXISTED in
    the base file (moved later within the TU) are the accepted style; the
    gate must produce zero error findings."""

    exit_code, payload = run_scan_diff(melee_checkout, "sdata2_decl_ftcoll.patch")
    assert payload["counts"]["errors"] == 0, json.dumps(payload["findings"], indent=2)
    assert exit_code in (0, 2)
    assert not any(
        f["rule_id"] in {"extern_literal_anchor", "new_data_anchor", "self_tu_extern"}
        for f in payload["findings"]
    ), "ftcoll externs should be fully downgraded (forward_decl_ok)"


def test_gm1832_new_data_anchor_detail(melee_checkout):
    """The invented lbl_804DA60C anchor carries the new_data_anchor verdict
    and the maintainer's data-ordering wording."""

    exit_code, payload = run_scan_diff(melee_checkout, "extern_f32_gm1832.patch")
    assert exit_code == 1
    anchors = [f for f in payload["findings"] if f["rule_id"] == "new_data_anchor"]
    assert len(anchors) == 1, json.dumps(payload["findings"], indent=2)
    finding = anchors[0]
    assert finding["severity"] == "error"
    assert finding["file"] == "src/melee/gm/gm_1832.c"
    assert finding["detail"]["symbol"] == "lbl_804DA60C"
    assert finding["detail"]["verdict"] == "new_data_anchor"
    assert finding["standard_id"] == "global_standard:literals-and-data-ownership"
    assert "data order" in finding["message"]
    # The pre-existing lbl_804DA5C8 self-TU extern must still be flagged.
    assert any(f["rule_id"] == "self_tu_extern" for f in payload["findings"])


def test_negative_cross_tu_extern_stays_warning(melee_checkout):
    exit_code, payload = run_scan_diff(melee_checkout, "cross_tu_extern_ok.patch")
    assert payload["counts"]["errors"] == 0, json.dumps(payload["findings"], indent=2)
    assert exit_code == 2
    warnings = [f for f in payload["findings"] if f["severity"] == "warning"]
    assert warnings and warnings[0]["rule_id"] == "extern_literal_anchor"
    assert warnings[0]["detail"]["verdict"] == "cross_tu_ok"


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
        "define_alias",
    }
    for rule_id in expected_errors:
        assert "error" in by_rule.get(rule_id, set()), json.dumps(payload["findings"], indent=2)
    assert "warning" in by_rule.get("novel_pragma", set())
    assert "warning" in by_rule.get("type_erasing_cast", set())
    assert "warning" in by_rule.get("m2c_residue_names", set())  # sp24
    assert "warning" in by_rule.get("m2c_goto_label", set())  # non-block goto
    assert "warning" in by_rule.get("define_alias", set())  # local ABS clone


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
