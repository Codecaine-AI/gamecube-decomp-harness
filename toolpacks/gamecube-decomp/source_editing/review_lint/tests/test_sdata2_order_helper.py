"""Unit tests for the explicit .sdata2 order helper API."""

from __future__ import annotations

import struct

import conftest  # noqa: F401  (inserts api/ into sys.path)
import sdata2_order_helper


def entry(offset: int, value: float, name: str = "@1") -> sdata2_order_helper.Sdata2Entry:
    return sdata2_order_helper.Sdata2Entry(
        offset=offset,
        size=4,
        data=struct.pack(">f", value),
        name=name,
    )


def test_render_helper_emits_float_order():
    helper = sdata2_order_helper.render_helper(
        [
            entry(0, 0.0, "@0"),
            entry(4, 1.0, "@1"),
            entry(8, -0.0, "@2"),
        ],
        "sdata2_order",
    )

    assert helper == (
        "static void sdata2_order(void)\n"
        "{\n"
        "    (void) 0.0f;\n"
        "    (void) 1.0f;\n"
        "    (void) -0.0f;\n"
        "}\n"
    )


def test_render_helper_can_use_named_double_macros_when_requested():
    s32_bias = sdata2_order_helper.Sdata2Entry(
        offset=0,
        size=8,
        data=(0x4330000080000000).to_bytes(8, "big"),
        name="@3",
    )

    assert "4503601774854144.0" in sdata2_order_helper.render_helper([s32_bias], "order_sdata2")
    assert "S32_TO_F32" in sdata2_order_helper.render_helper(
        [s32_bias],
        "order_sdata2",
        prefer_named_macros=True,
    )


def test_filter_entries_for_symbols_matches_local_literals_by_offset():
    target_entries = [
        sdata2_order_helper.Sdata2Entry(0, 4, struct.pack(">f", 1.0), "lbl_804D0000"),
        sdata2_order_helper.Sdata2Entry(4, 4, struct.pack(">f", 2.0), "lbl_804D0004"),
    ]
    helper_entries = [
        sdata2_order_helper.Sdata2Entry(0, 4, struct.pack(">f", 1.0), "@1"),
        sdata2_order_helper.Sdata2Entry(4, 4, struct.pack(">f", 2.0), "@2"),
    ]

    filtered, missing = sdata2_order_helper.filter_entries_for_symbols(
        helper_entries,
        target_entries,
        ["lbl_804D0004", "lbl_804D9999"],
    )

    assert [item.name for item in filtered] == ["@2"]
    assert missing == ["lbl_804D9999"]


def test_install_helper_inserts_after_includes_when_no_existing_helper():
    text = '#include "placeholder.h"\n\nvoid fn(void) {}\n'
    updated, replaced = sdata2_order_helper.install_helper(
        text,
        "static void sdata2_order(void)\n{\n    (void) 1.0f;\n}\n",
    )

    assert not replaced
    assert updated.startswith(
        '#include "placeholder.h"\n'
        "\n"
        "static void sdata2_order(void)\n"
        "{\n"
        "    (void) 1.0f;\n"
        "}\n\n"
    )


def test_install_helper_replaces_existing_order_helpers_and_removes_duplicates():
    text = (
        "static void sdata2_order(void)\n"
        "{\n"
        "    (void) 2.0f;\n"
        "}\n\n"
        "static void order_sdata2_1(void)\n"
        "{\n"
        "    (void) 3.0f;\n"
        "}\n\n"
        "void fn(void) {}\n"
    )
    helper = "static void sdata2_order(void)\n{\n    (void) 1.0f;\n}\n"

    updated, replaced = sdata2_order_helper.install_helper(text, helper)

    assert replaced
    assert updated.count("static void sdata2_order(void)") == 1
    assert "order_sdata2_1" not in updated
    assert "(void) 1.0f;" in updated
