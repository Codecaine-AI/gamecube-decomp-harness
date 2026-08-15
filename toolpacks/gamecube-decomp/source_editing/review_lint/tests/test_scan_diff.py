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


def run_scan_diff_text(repo: Path, tmp_path: Path, diff_text: str):
    """Run the worker-surface CLI gate over a synthetic attempt diff."""

    diff_path = tmp_path / "attempt-1.qa_diff.patch"
    diff_path.write_text(diff_text, encoding="utf-8")
    result = subprocess.run(
        [
            "python3",
            str(SCAN_DIFF),
            "--repo",
            str(repo),
            "--diff-file",
            str(diff_path),
            "--surface",
            "worker",
            "--gate",
            "--json",
        ],
        capture_output=True,
        text=True,
    )
    assert result.stdout, result.stderr
    return result.returncode, json.loads(result.stdout)


# (fixture, expected rule_id, file, inclusive line range of the finding)
GOLDEN_CASES = [
    # #2656 gm_1832.c — extern f32 lbl_804DA5C8 (no definition anywhere):
    # every extern in a .c file is an error under the strict policy.
    ("extern_f32_gm1832.patch", "extern_own_tu_data", "src/melee/gm/gm_1832.c", (1270, 1290)),
    # #2656 gm_1832.c:1919 — extern const f32 lbl_804DA60C plus a brand-new
    # in-file definition (line 2708): the invented data anchor from PR #2656.
    # PsiLupan: "Using an extern to make a function match is just due to data
    # ordering." Now a plain extern_in_c error.
    ("extern_f32_gm1832.patch", "extern_own_tu_data", "src/melee/gm/gm_1832.c", (1915, 1925)),
    # #2656 gm_1832.c:2387 — open-coded assert.
    ("unrolled_assert_gm1832.patch", "unrolled_assert", "src/melee/gm/gm_1832.c", (2384, 2393)),
    # #2657 grkongo.c:1580 — extern const f32 grKg_804DAFA0/A4 in own .sdata2.
    ("extern_floats_grkongo.patch", "extern_own_tu_data", "src/melee/gr/grkongo.c", (98, 106)),
    # #2657 grkongo.c:662 — string literal replaced by char symbol address.
    ("extern_char_grkongo.patch", "string_literal_to_symbol", "src/melee/gr/grkongo.c", (655, 670)),
    # #2658 tydisplay.c — extern char un_803FF074[0xA8] string anchor.
    ("extern_string_tydisplay.patch", "extern_own_tu_data", "src/melee/ty/tydisplay.c", (137, 145)),
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
    externs = [
        f for f in payload["findings"]
        if f["rule_id"] == "extern_own_tu_data"
    ]
    assert len(externs) == 12, json.dumps(payload["findings"], indent=2)
    for finding in externs:
        assert finding["severity"] == "error"
        assert finding["detail"]["verdict"] == "self_tu_owned"
        assert "define the data in-TU" in finding["message"]
        assert "dataless TU" in finding["message"]


def test_gm1832_extern_own_tu_data_detail(melee_checkout):
    """Both gm_1832 extern cheats (the invented lbl_804DA60C anchor and the
    dangling lbl_804DA5C8 self-TU extern) are metadata-proven ownership
    errors with the full split-repair vectors."""

    exit_code, payload = run_scan_diff(melee_checkout, "extern_f32_gm1832.patch")
    assert exit_code == 1
    externs = {
        f["detail"]["symbol"]: f
        for f in payload["findings"]
        if f["rule_id"] == "extern_own_tu_data"
    }
    assert set(externs) == {"lbl_804DA5C8", "lbl_804DA60C"}, json.dumps(
        payload["findings"], indent=2
    )
    for finding in externs.values():
        assert finding["severity"] == "error"
        assert finding["file"] == "src/melee/gm/gm_1832.c"
        assert "symbols.txt proves" in finding["message"]
    # lbl_804DA5C8's address sits inside gm_1832's own splits.txt ranges.
    owned = externs["lbl_804DA5C8"]
    assert owned["detail"]["verdict"] == "self_tu_owned"
    assert owned["standard_id"] == "global_standard:literals-and-data-ownership"
    assert "define the data in-TU" in owned["message"]
    assert owned["detail"]["repair_vectors"] == [
        "expand_or_fix_own_split_and_define_in_tu",
        "place_definition_after_use_if_pooling_requires",
        "check_existing_dataless_tu_owner",
    ]
    # lbl_804DA60C is also inside gm_1832's own .sdata2 split.
    anchor = externs["lbl_804DA60C"]
    assert anchor["detail"]["verdict"] == "self_tu_owned"
    assert anchor["detail"]["symbol_section"] == ".sdata2"


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


NUMERIC_SYMBOL_METADATA_DIFF = """\
diff --git a/src/melee/gm/x.c b/src/melee/gm/x.c
index 1111111..2222222 100644
--- a/src/melee/gm/x.c
+++ b/src/melee/gm/x.c
@@ -10,3 +10,3 @@ void caller(void)
-    small_value = 1;
-    large_value = 2;
-    if (0) {
+    small_value = lbl_804D38F4;
+    large_value = lbl_803F0000;
+    if (gm_80169238(arg)) {
"""


def test_numeric_literal_symbol_metadata_suppresses_mutable_data_and_function_calls(
    tmp_path: Path,
):
    symbols = tmp_path / "config" / "GALE01" / "symbols.txt"
    symbols.parent.mkdir(parents=True)
    symbols.write_text(
        "lbl_804D38F4 = .sdata:0x804D38F4; // type:object size:0x4 scope:global\n"
        "lbl_803F0000 = .data:0x803F0000; // type:object size:0x4 scope:global\n"
        "gm_80169238 = .text:0x80169238; // type:function size:0x2C scope:global\n",
        encoding="utf-8",
    )
    file_diffs = scan_diff.parse_unified_diff(NUMERIC_SYMBOL_METADATA_DIFF)

    findings = scan_diff.collect_findings(file_diffs, tmp_path, "diff")

    assert not [
        finding
        for finding in findings
        if finding["rule_id"] == "numeric_literal_to_symbol"
    ], json.dumps(findings, indent=2)


BARE_PROTOTYPE_CONTEXT_DIFF = """\
diff --git a/src/melee/gm/x.c b/src/melee/gm/x.c
index 1111111..2222222 100644
--- a/src/melee/gm/x.c
+++ b/src/melee/gm/x.c
@@ -1,7 +1,10 @@
 #if 0
+u32 Disabled_801C1DAC(void);
 #endif
+u32 Ground_801C1DAC(void);
+static u32 LocalHelper_801C1DB0(void);
 void caller(void)
 {
+    Ground_801C1DAC(arg);
 }
"""


def test_bare_local_prototype_uses_context_and_ignores_calls():
    file_diffs = scan_diff.parse_unified_diff(BARE_PROTOTYPE_CONTEXT_DIFF)

    findings = scan_diff.collect_findings(file_diffs, Path("."), "diff")

    prototypes = [
        finding for finding in findings if finding["rule_id"] == "bare_local_prototype"
    ]
    assert len(prototypes) == 1, json.dumps(findings, indent=2)
    assert prototypes[0]["detail"]["symbol"] == "Ground_801C1DAC"


SHADOWED_DECLARATION_DIFF = """\
diff --git a/src/melee/gm/gmregclear.c b/src/melee/gm/gmregclear.c
index 1111111..2222222 100644
--- a/src/melee/gm/gmregclear.c
+++ b/src/melee/gm/gmregclear.c
@@ -1,4 +1,12 @@
 #include <platform.h>
+u32 Ground_801C1DAC(void);
+u32 Ground_801C1DC0(void);
+s32 Ground_801C1DD4(void);
+void Ground_801C1DE4(s32*, s32*);
+f32 Ground_801C57F0(int);
+void Ground_801C5A60(void);
+u32 Ground_801C5AD0(s32);
+void NoHeader_80123456(void);
 void caller(void)
 {
 }
diff --git a/src/melee/gm/gm_1BA8.c b/src/melee/gm/gm_1BA8.c
index 3333333..4444444 100644
--- a/src/melee/gm/gm_1BA8.c
+++ b/src/melee/gm/gm_1BA8.c
@@ -1,3 +1,6 @@
 void gm_801BF128(void)
 {
+#ifdef __MWERKS__
+    void gm_801BF634();
+#endif
 }
diff --git a/src/melee/gm/gmtoulib.c b/src/melee/gm/gmtoulib.c
index 5555555..6666666 100644
--- a/src/melee/gm/gmtoulib.c
+++ b/src/melee/gm/gmtoulib.c
@@ -1,1 +1,7 @@
+typedef struct BracketAnimData {
+    Vec3 current;
+    Vec3 target;
+    Vec3 step;
+} BracketAnimData;
+#define BRACKET_ANIM (*(BracketAnimData*) lbl_803D9DAC)
 void fn_8018B090(void) {}
"""


def test_shadowed_declaration_historical_shapes_block_worker_collect_path(
    tmp_path: Path,
):
    """PR #2877 prototypes, MWERKS signatures, and local aliases reach the
    same collect_findings(surface=worker) path used for every attempt."""

    ground = tmp_path / "src" / "melee" / "gr" / "ground.h"
    ground.parent.mkdir(parents=True)
    ground.write_text(
        "u32 Ground_801C1DAC(void);\n"
        "u32 Ground_801C1DC0(void);\n"
        "s32 Ground_801C1DD4(void);\n"
        "void Ground_801C1DE4(s32*, s32*);\n"
        "f32 Ground_801C57F0(int);\n"
        "void Ground_801C5A60(void);\n"
        "u32 Ground_801C5AD0(s32);\n",
        encoding="utf-8",
    )
    gm_header = tmp_path / "src" / "melee" / "gm" / "gm_1BA8.h"
    gm_header.parent.mkdir(parents=True)
    gm_header.write_text("void gm_801BF634(s32, s8);\n", encoding="utf-8")
    gmtou_header = tmp_path / "src" / "melee" / "gm" / "gmtoulib.h"
    gmtou_header.write_text("extern Vec3 lbl_803D9DAC;\n", encoding="utf-8")
    symbols = tmp_path / "config" / "GALE01" / "symbols.txt"
    symbols.parent.mkdir(parents=True)
    symbols.write_text(
        "NoHeader_80123456 = .text:0x80123456; // type:function size:0x20 scope:global\n",
        encoding="utf-8",
    )

    file_diffs = scan_diff.parse_unified_diff(SHADOWED_DECLARATION_DIFF)
    findings = scan_diff.collect_findings(
        file_diffs, tmp_path, "diff", surface="worker"
    )

    shadowed = [
        finding for finding in findings
        if finding["rule_id"] == "shadowed_declaration"
    ]
    assert {finding["detail"]["symbol"] for finding in shadowed} == {
        "Ground_801C1DAC",
        "Ground_801C1DC0",
        "Ground_801C1DD4",
        "Ground_801C1DE4",
        "Ground_801C57F0",
        "Ground_801C5A60",
        "Ground_801C5AD0",
        "NoHeader_80123456",
        "gm_801BF634",
        "BracketAnimData",
    }, json.dumps(findings, indent=2)
    assert {finding["detail"]["kind"] for finding in shadowed} == {
        "function_prototype",
        "mwerks_dual_signature",
        "typedef_alias",
    }
    assert all(finding["severity"] == "error" for finding in shadowed)
    ground_finding = next(
        finding for finding in shadowed
        if finding["detail"]["symbol"] == "Ground_801C1DAC"
    )
    assert ground_finding["detail"]["canonical_source"] == (
        "src/melee/gr/ground.h"
    )
    fallback = next(
        finding for finding in shadowed
        if finding["detail"]["symbol"] == "NoHeader_80123456"
    )
    assert fallback["detail"]["canonical_source"] == "config/GALE01/symbols.txt"
    overlay = next(
        finding for finding in shadowed
        if finding["detail"]["symbol"] == "BracketAnimData"
    )
    assert overlay["detail"]["canonical_symbol"] == "lbl_803D9DAC"
    assert overlay["detail"]["canonical_source"] == "src/melee/gm/gmtoulib.h"
    assert not [
        finding for finding in findings
        if finding["rule_id"] in {"bare_local_prototype", "extern_in_c"}
        and (finding["file"], finding["line"])
        in {
            ("src/melee/gm/gmregclear.c", line) for line in range(2, 10)
        }
        | {("src/melee/gm/gm_1BA8.c", 4)}
    ], json.dumps(findings, indent=2)
    exit_code, payload = run_scan_diff_text(
        tmp_path, tmp_path, SHADOWED_DECLARATION_DIFF
    )
    assert exit_code == 1
    assert payload["status"] == "failed"
    assert any(
        finding["rule_id"] == "shadowed_declaration"
        and finding["severity"] == "error"
        for finding in payload["findings"]
    )


EXTERN_OWN_TU_DATA_DIFF = """\
diff --git a/src/melee/gr/grvenom.c b/src/melee/gr/grvenom.c
index 1111111..2222222 100644
--- a/src/melee/gr/grvenom.c
+++ b/src/melee/gr/grvenom.c
@@ -1,2 +1,4 @@
+extern const u32 grVe_803B82D0[3];
+extern s32 grVe_804D6A40;
 void grVenom_OnLoad(void) {}
diff --git a/src/melee/ty/tydisplay.c b/src/melee/ty/tydisplay.c
index 3333333..4444444 100644
--- a/src/melee/ty/tydisplay.c
+++ b/src/melee/ty/tydisplay.c
@@ -1,2 +1,3 @@
+extern char un_803FF074[0xA8];
 void tyDisplay_OnLoad(void) {}
diff --git a/src/melee/gm/gmtou_2.c b/src/melee/gm/gmtou_2.c
index 5555555..6666666 100644
--- a/src/melee/gm/gmtou_2.c
+++ b/src/melee/gm/gmtou_2.c
@@ -1,2 +1,4 @@
+extern f64 lbl_804DA950;
+extern f32 real_function_804DA960;
 void gmTou_OnLoad(void) {}
"""


def _write_extern_ownership_metadata(repo: Path) -> None:
    config = repo / "config" / "GALE01"
    config.mkdir(parents=True)
    (config / "symbols.txt").write_text(
        "grVe_803B82D0 = .rodata:0x803B82D0; // type:object size:0xC scope:global\n"
        "_tyDisplay_803FF074 = .data:0x803FF074; // type:object size:0xA8 scope:local\n"
        "grVe_804D6A40 = .sbss:0x804D6A40; // type:object size:0x4 scope:global\n"
        "lbl_804DA950 = .sdata2:0x804DA950; // type:object size:0x8 scope:global\n"
        "real_function_804DA960 = .text:0x804DA960; // type:function size:0x20 scope:global\n",
        encoding="utf-8",
    )
    (config / "splits.txt").write_text(
        "Sections:\n"
        "\t.rodata type:rodata align:32\n\n"
        "melee/gr/grvenom.c:\n"
        "\t.rodata start:0x803B82D0 end:0x803B82E8\n"
        "\t.sbss start:0x804D6A30 end:0x804D6A48\n\n"
        "melee/ty/tydisplay.c:\n"
        "\t.data start:0x803FEFF0 end:0x803FFDA0\n\n"
        "melee/gm/gmtou_2.c:\n"
        "\t.sdata2 start:0x804DA878 end:0x804DA950\n",
        encoding="utf-8",
    )


def test_extern_own_tu_data_historical_shapes_block_worker_collect_path(
    tmp_path: Path,
):
    """grvenom, tydisplay, and boundary-misplaced gmtou externs all block
    through collect_findings(surface=worker), with no same-line generic copy."""

    _write_extern_ownership_metadata(tmp_path)
    file_diffs = scan_diff.parse_unified_diff(EXTERN_OWN_TU_DATA_DIFF)
    findings = scan_diff.collect_findings(
        file_diffs, tmp_path, "diff", surface="worker"
    )

    owned = [
        finding for finding in findings
        if finding["rule_id"] == "extern_own_tu_data"
    ]
    assert {finding["detail"]["symbol"] for finding in owned} == {
        "grVe_803B82D0",
        "grVe_804D6A40",
        "un_803FF074",
        "lbl_804DA950",
    }, json.dumps(findings, indent=2)
    assert all(finding["severity"] == "error" for finding in owned)
    assert "real_function_804DA960" not in {
        finding["detail"]["symbol"] for finding in owned
    }
    tydisplay = next(
        finding for finding in owned
        if finding["detail"]["symbol"] == "un_803FF074"
    )
    assert tydisplay["detail"]["metadata_symbol"] == "_tyDisplay_803FF074"
    boundary = next(
        finding for finding in owned
        if finding["detail"]["symbol"] == "lbl_804DA950"
    )
    assert boundary["detail"]["verdict"] == "adjacent_tu_boundary"
    assert boundary["detail"]["split_boundary"] == "after_end"
    assert "place it after its use" in boundary["message"]
    assert "dataless TU" in boundary["message"]
    owned_locations = {(finding["file"], finding["line"]) for finding in owned}
    assert not [
        finding for finding in findings
        if finding["rule_id"] == "extern_in_c"
        and (finding["file"], finding["line"]) in owned_locations
    ], json.dumps(findings, indent=2)
    exit_code, payload = run_scan_diff_text(
        tmp_path, tmp_path, EXTERN_OWN_TU_DATA_DIFF
    )
    assert exit_code == 1
    assert payload["status"] == "failed"
    assert any(
        finding["rule_id"] == "extern_own_tu_data"
        and finding["severity"] == "error"
        for finding in payload["findings"]
    )


DISTANT_HEADER_EXTERN_DIFF = """\
diff --git a/src/melee/gr/other_data.h b/src/melee/gr/other_data.h
index 1111111..2222222 100644
--- a/src/melee/gr/other_data.h
+++ b/src/melee/gr/other_data.h
@@ -1,2 +1,3 @@
+extern const f32 other_804DB000;
 #endif
diff --git a/src/melee/gm/gmtou_2.c b/src/melee/gm/gmtou_2.c
index 3333333..4444444 100644
--- a/src/melee/gm/gmtou_2.c
+++ b/src/melee/gm/gmtou_2.c
@@ -1,2 +1,4 @@
+#include <melee/gr/other_data.h>
+value = other_804DB000;
 void gmTou_OnLoad(void) {}
"""


def test_extern_own_tu_data_allows_distant_data_declared_in_owner_header(
    tmp_path: Path,
):
    """A distant owner's header declaration is outside the .c-only rule."""

    _write_extern_ownership_metadata(tmp_path)
    symbols = tmp_path / "config" / "GALE01" / "symbols.txt"
    symbols.write_text(
        symbols.read_text(encoding="utf-8")
        + "other_804DB000 = .sdata2:0x804DB000; // type:object size:0x4 scope:global\n",
        encoding="utf-8",
    )
    file_diffs = scan_diff.parse_unified_diff(DISTANT_HEADER_EXTERN_DIFF)
    findings = scan_diff.collect_findings(
        file_diffs, tmp_path, "diff", surface="worker"
    )
    assert not [
        finding for finding in findings
        if finding["rule_id"] == "extern_own_tu_data"
    ], json.dumps(findings, indent=2)
    exit_code, payload = run_scan_diff_text(
        tmp_path, tmp_path, DISTANT_HEADER_EXTERN_DIFF
    )
    assert exit_code == 0
    assert payload["status"] == "passed"


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
