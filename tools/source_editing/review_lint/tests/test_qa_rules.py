"""Unit tests for the shared QA rules module (_qa_rules)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import conftest  # noqa: F401  (inserts api/ into sys.path)
import _qa_rules


# ---------------------------------------------------------------------------
# Address-style name regex.
# ---------------------------------------------------------------------------


def test_address_name_regex_matches_known_symbols():
    for name in ("lbl_804DA60C", "ftColl_804D82E0", "un_803FF074", "grKg_803E1A00"):
        assert _qa_rules.ADDRESS_NAME_RE.search(name), name
        assert _qa_rules.address_from_name(name) is not None


def test_address_name_regex_rejects_non_address_names():
    for name in ("foo_12345678", "lbl_8123", "bar_9ABCDEF0", "lbl_804DA60", "x804DA60C"):
        assert _qa_rules.address_from_name(name) is None, name


def test_address_from_name_value():
    assert _qa_rules.address_from_name("lbl_804DA60C") == 0x804DA60C


# ---------------------------------------------------------------------------
# extern_literal_anchor declaration regex.
# ---------------------------------------------------------------------------


def _externs(text: str):
    hunk = {
        "file": "src/melee/gm/x.c",
        "added": [(i + 1, line) for i, line in enumerate(text.splitlines())],
        "removed": [],
    }
    return _qa_rules.check_extern_literal_anchor(hunk)


def test_extern_decl_both_const_orders_and_arrays():
    findings = _externs(
        "extern const f32 lbl_804DA60C;\n"
        "extern float const ftColl_804D82E0;\n"
        "extern f32 lbl_804DA5C8;\n"
        "extern char un_803FF074[0xA8];\n"
    )
    assert len(findings) == 4
    severities = {f["detail"]["symbol"]: f["severity"] for f in findings}
    assert severities["lbl_804DA60C"] == "warning"
    assert severities["ftColl_804D82E0"] == "warning"
    assert severities["un_803FF074"] == "error"


def test_extern_decl_ignores_initializers_and_other_types():
    findings = _externs(
        "extern const f32 lbl_804DA60C = 1.0f;\n"  # initializer -> not a pure anchor
        "extern ClassicStageEntry lbl_803D9910[65];\n"  # struct type -> ignored
        "const f32 lbl_804DA60C = 1.0f;\n"  # definition, not extern
    )
    assert findings == []


def test_function_extern_visibility_warns_on_function_prototype():
    hunk = {
        "file": "src/sysdolphin/baselib/cobj.c",
        "added": [(808, "    extern int HSD_CObjGetUpVector(HSD_CObj* cobj, Vec3* up);")],
        "removed": [],
    }
    findings = _qa_rules.check_function_extern_visibility(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["symbol"] == "HSD_CObjGetUpVector"
    assert findings[0]["detail"]["return_type"] == "int"


# ---------------------------------------------------------------------------
# packed_string_blob.
# ---------------------------------------------------------------------------


def _blob_findings(text: str):
    hunk = {
        "file": "src/melee/mn/x.c",
        "added": [(i + 1, line) for i, line in enumerate(text.splitlines())],
        "removed": [],
    }
    return _qa_rules.check_packed_string_blob(hunk)


def test_packed_blob_concatenated_literals():
    text = (
        'static char lbl_803EFB60[0xA8] =\n'
        '    "Can\'t get user_data.\\n\\0\\0\\0"\n'
        '    "mncount.c\\0\\0\\0"\n'
        '    "user_data\\0\\0\\0";\n'
    )
    findings = _blob_findings(text)
    assert len(findings) == 1
    assert findings[0]["detail"]["symbol"] == "lbl_803EFB60"
    assert findings[0]["line"] == 1


def test_packed_blob_unsized_array():
    text = (
        'char grRc_803E4F44[] = "dynamicsdata_shipflag\\0\\0\\0"\n'
        '                         "gp->u.scroll.int_jobj\\0\\0\\0";\n'
    )
    findings = _blob_findings(text)
    assert len(findings) == 1
    assert findings[0]["detail"]["symbol"] == "grRc_803E4F44"


def test_packed_blob_single_literal_with_multiple_nuls():
    text = 'char un_803FEFF0[0x2C] = "ToyDspPanel_Top_joint\\0\\0\\0ToyDspBg_Top_joint";\n'
    assert len(_blob_findings(text)) == 1


def test_packed_blob_pointer_offset_macro():
    findings = _blob_findings("#define mnCount_AssertFile (lbl_803EFB60 + 0x18)\n")
    assert len(findings) == 1
    assert findings[0]["detail"]["symbol"] == "lbl_803EFB60"


def test_packed_blob_negatives():
    assert _blob_findings('static char buf[64] = "ready";\n') == []
    assert (
        _blob_findings('static char* const names[] = { "a", "b", "c" };\n') == []
    )
    # Offset macro over a non-address-style base is not the cheat.
    assert _blob_findings("#define NEXT (cursor + 0x18)\n") == []


# ---------------------------------------------------------------------------
# unrolled_assert.
# ---------------------------------------------------------------------------


def _assert_findings(text: str, path: str = "src/melee/gr/x.c"):
    hunk = {
        "file": path,
        "added": [(i + 1, line) for i, line in enumerate(text.splitlines())],
        "removed": [],
    }
    return _qa_rules.check_unrolled_assert(hunk)


def test_unrolled_assert_flags_call_sites():
    findings = _assert_findings('        __assert(grIm_803E46F8, 0xAB9, "mgobj");\n')
    assert len(findings) == 1


def test_unrolled_assert_skips_macro_definitions():
    text = (
        "#define HSD_ASSERT(line, cond)                                       \\\n"
        "    ((cond) ? ((void) 0) : __assert(__FILE__, line, #cond))\n"
    )
    # Line 1 is a #define, line 2... is a continuation body without trailing
    # backslash but the #define line itself is skipped; single-line macro:
    findings = _assert_findings('#define MY_ASSERT(c) __assert(__FILE__, 1, #c)\n')
    assert findings == []
    # Continuation lines (ending in backslash) are skipped.
    findings = _assert_findings(
        "    ((cond) ? ((void) 0) : __assert(__FILE__, line, #cond)) \\\n"
    )
    assert findings == []


def test_unrolled_assert_ignores_strings():
    findings = _assert_findings('OSReport("call __assert(x) yourself\\n");\n')
    assert findings == []


# ---------------------------------------------------------------------------
# Hardened QA rules added after the full-session delta audit.
# ---------------------------------------------------------------------------


def _hardened_hunk(text: str, removed: list[str] | None = None):
    return {
        "file": "src/melee/gr/x.c",
        "added": [(i + 1, line) for i, line in enumerate(text.splitlines())],
        "removed": removed or [],
    }


def test_fake_assert_macro_flags_names_and_laundered_bodies():
    text = (
        "#define VENOM_JOBJ_ASSERTMSG(line, cond, msg) \\\n"
        "    ((cond) ? (void) 0 : __assert(__FILE__, line, msg))\n"
        "#define report_alias(msg) OSReport(msg)\n"
    )
    findings = _qa_rules.check_fake_assert_macro(_hardened_hunk(text))
    assert {f["detail"]["macro"] for f in findings} == {
        "VENOM_JOBJ_ASSERTMSG",
        "report_alias",
    }


def test_assert_idiom_downgrade_requires_removed_hsd_assert():
    hunk = _hardened_hunk(
        '    OSReport(msg);\n    __assert(__FILE__, 77, "obj");\n',
        removed=['    HSD_ASSERTREPORT(77, obj != NULL, "obj");'],
    )
    findings = _qa_rules.check_assert_idiom_downgrade(hunk)
    assert len(findings) == 2
    assert _qa_rules.check_assert_idiom_downgrade(_hardened_hunk('    OSReport(msg);\n')) == []


def test_assert_idiom_downgrade_can_use_file_level_removed_assert_count():
    hunk = _hardened_hunk('    __assert(__FILE__, 77, "obj");\n')
    hunk["file_removed_hsd_asserts"] = 1
    findings = _qa_rules.check_assert_idiom_downgrade(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["removed_hsd_asserts"] == 1


def test_register_keyword_and_inline_asm():
    hunk = _hardened_hunk("    register s32 flag;\n    asm volatile (\"nop\");\n")
    assert len(_qa_rules.check_register_keyword(hunk)) == 1
    assert len(_qa_rules.check_inline_asm(hunk)) == 1


def test_m2c_residue_names_error_and_sp_warning():
    hunk = _hardened_hunk("    s32 temp_r30 = var_r4 + phi_f1;\n    Vec3 sp24;\n")
    findings = _qa_rules.run_rules_on_hunk(
        [rule for rule in _qa_rules.RULES if rule["rule_id"] == "m2c_residue_names"],
        hunk,
    )
    severities = {f["detail"]["name"]: f["severity"] for f in findings}
    assert severities["temp_r30"] == "error"
    assert severities["var_r4"] == "error"
    assert severities["phi_f1"] == "error"
    assert severities["sp24"] == "warning"


def test_m2c_goto_label_errors_block_labels_and_warns_other_gotos():
    hunk = _hardened_hunk("    goto block_30;\nblock_30:\n    goto cleanup;\n")
    findings = _qa_rules.run_rules_on_hunk(
        [rule for rule in _qa_rules.RULES if rule["rule_id"] == "m2c_goto_label"],
        hunk,
    )
    assert [f["severity"] for f in findings] == ["error", "error", "warning"]


def test_m2c_field_and_type_erasing_casts():
    hunk = _hardened_hunk("    M2C_FIELD(obj, s32*, 0x14) = 1;\n    data = (u8*) data;\n")
    assert len(_qa_rules.check_m2c_field_use(hunk)) == 1
    casts = _qa_rules.check_type_erasing_cast(hunk)
    assert len(casts) == 1
    assert casts[0]["detail"]["cast"] == "(u8*)"


def test_define_alias_identifier_expression_and_canonical_macro_warning():
    hunk = _hardened_hunk(
        "#define old_name new_name\n"
        "#define tm ((TmData*) arg0)\n"
        "#define block_idx_table grI1_803E49A8.block_table\n"
        "#define FTCO_800A9CB4_ABS(x) ((x) < 0 ? -(x) : (x))\n"
    )
    findings = _qa_rules.check_define_alias(hunk)
    kinds = {f["detail"]["macro"]: (f["detail"]["kind"], f.get("severity", "error")) for f in findings}
    assert kinds["old_name"] == ("identifier_alias", "error")
    assert kinds["tm"] == ("expression_alias", "error")
    assert kinds["block_idx_table"] == ("expression_alias", "error")
    assert kinds["FTCO_800A9CB4_ABS"] == ("canonical_macro_clone", "warning")


def test_novel_pragma_warns_only_outside_established_set():
    hunk = _hardened_hunk("#pragma dont_inline on\n#pragma inline_depth(4)\n")
    findings = _qa_rules.check_novel_pragma(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["directive"] == "inline_depth"


# ---------------------------------------------------------------------------
# string_literal_to_symbol.
# ---------------------------------------------------------------------------


def test_string_literal_to_symbol_pairing():
    hunk = {
        "file": "src/melee/gr/grkongo.c",
        "added": [(662, '        __assert(grKg_803E1858, 1719, grKg_803E1A00);')],
        "removed": ['        __assert(grKg_803E1858, 1719, "gp->u.taru.keep");'],
    }
    findings = _qa_rules.check_string_literal_to_symbol(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["replacement"] == "grKg_803E1A00"


def test_string_literal_to_symbol_offset_expression():
    hunk = {
        "file": "src/melee/ty/tydisplay.c",
        "added": [(1401, "        OSReport(strbase + 0xC8);")],
        "removed": ['        OSReport("*** BG data aren\'t being loaded!\\n");'],
    }
    findings = _qa_rules.check_string_literal_to_symbol(hunk)
    assert len(findings) == 1


def test_string_literal_to_symbol_requires_string_in_removed():
    hunk = {
        "file": "src/melee/gm/gm_1832.c",
        "added": [(10, "    foo(lbl_804DA60C);")],
        "removed": ["    foo(other_value);"],
    }
    assert _qa_rules.check_string_literal_to_symbol(hunk) == []


def test_numeric_literal_to_symbol_pairing():
    hunk = {
        "file": "src/melee/gr/grbigblue.c",
        "added": [
            (1410, "        f32 inv = grBb_804DB2F0 / Ground_801C0498();"),
            (2111, "    best_above = grBb_804DB310;"),
            (2143, "                if (dist < grBb_804DB2F4) {"),
        ],
        "removed": [
            "        f32 inv = 1.0F / Ground_801C0498();",
            "    best_above = -F32_MAX;",
            "                if (dist < 0.0F) {",
        ],
    }
    findings = _qa_rules.check_numeric_literal_to_symbol(hunk)
    assert [f["detail"]["replacement"] for f in findings] == [
        "grBb_804DB2F0",
        "grBb_804DB310",
        "grBb_804DB2F4",
    ]


def test_numeric_literal_to_symbol_requires_numeric_in_removed():
    hunk = {
        "file": "src/melee/gr/grbigblue.c",
        "added": [(10, "    foo(grBb_804DB2F0);")],
        "removed": ["    foo(existing_symbol);"],
    }
    assert _qa_rules.check_numeric_literal_to_symbol(hunk) == []


def test_copied_jobj_inline_flags_local_header_body_copy():
    hunk = {
        "file": "src/melee/gr/grvenom.c",
        "added": [
            (71, '/* literal */ SDATA char grVe_804D47C0[] = "jobj.h";'),
            (74, "static inline void grVenom_JObjSetScaleX(HSD_JObj* jobj, f32 x)"),
            (75, "{"),
            (76, "    HSD_ASSERTMSG(0x308, jobj, &grVe_804D47C8[0]);"),
            (77, "    jobj->scale.x = x;"),
            (78, "    HSD_JObjSetMtxDirtySub(jobj);"),
            (79, "}"),
        ],
        "removed": [],
    }
    findings = _qa_rules.check_copied_jobj_inline(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["helper"] == "grVenom_JObjSetScaleX"


def test_copied_jobj_inline_allows_wrappers_that_call_hsd_helpers():
    hunk = {
        "file": "src/melee/it/items/itcoin.c",
        "added": [
            (10, "static inline void itCoin_ResetRotation(Item_GObj* gobj)"),
            (11, "{"),
            (12, "    HSD_JObj* jobj = GET_JOBJ(gobj);"),
            (13, "    HSD_JObjSetRotationX(jobj, 0.0F);"),
            (14, "}"),
        ],
        "removed": [],
    }
    assert _qa_rules.check_copied_jobj_inline(hunk) == []


def test_stage_ground_var_owner_flags_borrowed_stage_arm():
    hunk = {
        "file": "src/melee/gr/grbigblue.c",
        "added": [(1763, "            gp->gv.arwing.xC8 = 0;")],
        "removed": [],
    }
    findings = _qa_rules.check_stage_ground_var_owner(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["borrowed_member"] == "arwing"


def test_stage_ground_var_owner_flags_other_stage_families_too():
    hunk = {
        "file": "src/melee/gr/grvenom.c",
        "added": [(1685, "                        sub->gv.arwing.xE0 = sp94;")],
        "removed": [],
    }
    findings = _qa_rules.check_stage_ground_var_owner(hunk)
    assert len(findings) == 1
    assert findings[0]["detail"]["allowed_members"] == ["smashtaunt", "venom", "venom2"]


def test_stage_ground_var_owner_allows_stage_family_members():
    hunk = {
        "file": "src/melee/gr/grbigblue.c",
        "added": [(1763, "            gp->gv.bigblue.platform.xC8_timer = 0;")],
        "removed": [],
    }
    assert _qa_rules.check_stage_ground_var_owner(hunk) == []


def test_stage_ground_var_owner_allows_corneria_arwing_owner():
    hunk = {
        "file": "src/melee/gr/grcorneria.c",
        "added": [(636, "    gp->gv.arwing.xC8 = slot;")],
        "removed": [],
    }
    assert _qa_rules.check_stage_ground_var_owner(hunk) == []


# ---------------------------------------------------------------------------
# Shingles + similarity.
# ---------------------------------------------------------------------------

BLOB_A = (
    'static char lbl_8040A540[0x268] =\n'
    '    "MCC is no initialize\\0\\0\\0\\0"\n'
    '    "No responce\\0"\n'
    '    "PING error\\0\\0"\n'
    '    "Could not initialize HIO\\0\\0\\0\\0";\n'
)
# Same blob with every identifier renamed (and a different hex size).
BLOB_B = (
    'static char renamed_blob[0x300] =\n'
    '    "MCC is no initialize\\0\\0\\0\\0"\n'
    '    "No responce\\0"\n'
    '    "PING error\\0\\0"\n'
    '    "Could not initialize HIO\\0\\0\\0\\0";\n'
)
UNRELATED = (
    "int gm_80188454(int idx)\n"
    "{\n"
    "    if (idx < 0) {\n"
    "        return -1;\n"
    "    }\n"
    "    return lbl_803D9910[idx].stage_kind;\n"
    "}\n"
)


def test_shingles_identifier_rename_is_similar():
    a = _qa_rules.normalized_shingles(BLOB_A)
    b = _qa_rules.normalized_shingles(BLOB_B)
    assert _qa_rules.shingle_similarity(a, b) >= 0.9


def test_shingles_unrelated_code_is_dissimilar():
    a = _qa_rules.normalized_shingles(BLOB_A)
    c = _qa_rules.normalized_shingles(UNRELATED)
    assert _qa_rules.shingle_similarity(a, c) < 0.3


def test_shingle_similarity_edges():
    assert _qa_rules.shingle_similarity(set(), set()) == 1.0
    assert _qa_rules.shingle_similarity({"a"}, set()) == 0.0
    assert _qa_rules.shingle_similarity({"a"}, {"a"}) == 1.0


def test_shingles_cli(tmp_path: Path):
    src = tmp_path / "blob.c"
    src.write_text(BLOB_A, encoding="utf-8")
    result = subprocess.run(
        [
            "python3",
            str(Path(_qa_rules.__file__)),
            "--shingles-from-file",
            str(src),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert set(payload["shingles"]) == _qa_rules.normalized_shingles(BLOB_A)


# ---------------------------------------------------------------------------
# Banned-pattern loader (env override).
# ---------------------------------------------------------------------------


def test_load_banned_pattern_rules_env_override(tmp_path: Path, monkeypatch):
    record = {
        "id": "no-osreport-offset",
        "source_pr": "doldecomp/melee#2658",
        "comment_url": "https://github.com/doldecomp/melee/pull/2658#discussion_r1",
        "file": "src/melee/ty/tydisplay.c",
        "excerpt": "OSReport(strbase + 0xC8);",
        "standard_id": "global_standard:no-string-literal-symbol-regression",
        "detector": {"type": "regex", "pattern": r"OSReport\(\w+ \+ 0x[0-9A-Fa-f]+\)"},
        "created": "2026-06-11",
    }
    skipped = {**record, "id": "exhibit-only", "detector": {"type": "agent_exhibit"}}
    (tmp_path / "banned.jsonl").write_text(
        json.dumps(record) + "\n" + json.dumps(skipped) + "\n", encoding="utf-8"
    )
    monkeypatch.setenv(_qa_rules.BANNED_DIR_ENV, str(tmp_path))
    rules = _qa_rules.load_banned_pattern_rules()
    assert len(rules) == 1
    assert rules[0]["rule_id"] == "banned_pattern:no-osreport-offset"
    assert rules[0]["severity"] == "error"
    assert "discussion_r1" in rules[0]["message"]
    hunk = {
        "file": "src/melee/ty/tydisplay.c",
        "added": [(5, "    OSReport(strbase + 0xC8);")],
        "removed": [],
    }
    findings = _qa_rules.run_rules_on_hunk(rules, hunk)
    assert len(findings) == 1


def test_loaders_tolerate_missing_files(tmp_path: Path, monkeypatch):
    monkeypatch.setenv(_qa_rules.BANNED_DIR_ENV, str(tmp_path / "nope"))
    assert _qa_rules.load_banned_pattern_rules() == []
    assert _qa_rules.load_tombstones() == []
