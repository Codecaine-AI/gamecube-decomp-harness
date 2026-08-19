#!/usr/bin/env python3
"""Stdlib coverage for the vendored type index and worker API."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[5]
DSEARCH_ROOT = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "_impl" / "gamecube" / "dsearch"
API = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "type_layout_lookup" / "api" / "layout_lookup.py"
sys.path.insert(0, str(DSEARCH_ROOT))

import typeidx  # type: ignore


LAYOUT_DUMP = """
*** Dumping AST Record Layout
         0 | struct Alpha
         0 |   int first
         4 |   unsigned int second
         8 |   float third
           | [sizeof=12, align=4]
*** Dumping AST Record Layout
         0 | struct Beta
         0 |   signed int x
         4 |   int y
         8 |   float z
           | [sizeof=12, align=4]
*** Dumping AST Record Layout
         0 | struct Gamma
         0 |   int first
         4 |   unsigned int second
         8 |   double wide
           | [sizeof=16, align=8]
*** Dumping AST Record Layout
         0 | union Overlay
         0 |   unsigned int word
         0 |   signed int scalar
           | [sizeof=4, align=4]
*** Dumping AST Record Layout
         0 | struct View
         0 |   unsigned char value
         1 |   unsigned char[7] _pad
           | [sizeof=8, align=1]
"""

CTX_TEXT = """
typedef struct Alpha Alpha;
typedef struct Beta Beta;
typedef union Overlay Overlay;
typedef struct View View;
"""


def fixture_index(root: Path) -> dict[str, object]:
    ctx = root / "ctx.c"
    ctx.write_text(CTX_TEXT, encoding="utf-8")
    index = typeidx.ingest("fixture", ctx, dump_text=LAYOUT_DUMP)
    index.update({
        "schema_version": 1,
        "built_at": "2026-08-19T00:00:00+00:00",
        "vendor_commit": "586800f",
        "dup_groups": typeidx.dup_groups(index),
        "cast_scan": {"available": False, "rows": [], "src_root": None},
    })
    return index


class TypeIndexTest(unittest.TestCase):
    def test_parse_dump_and_duplicate_detection(self) -> None:
        records = typeidx.parse_dump(LAYOUT_DUMP)
        self.assertEqual(set(records), {"struct Alpha", "struct Beta", "struct Gamma", "union Overlay", "struct View"})
        self.assertEqual(records["struct Alpha"].size, 12)
        self.assertEqual(records["struct Alpha"].align, 4)
        self.assertEqual([field.name for field in records["struct Alpha"].fields], ["first", "second", "third"])

        with tempfile.TemporaryDirectory() as temporary:
            index = fixture_index(Path(temporary))
        self.assertIn(["struct Alpha", "struct Beta"], typeidx.dup_groups(index))

    def test_union_views_and_members_at(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            index = fixture_index(Path(temporary))
        self.assertEqual(typeidx.union_views(index, "Overlay"), [["scalar", "word"]])
        members = typeidx.members_at(index, "Overlay", 2)
        self.assertEqual({path.split()[0] for path, _ in members}, {"scalar", "word"})
        self.assertEqual({start for _, start in members}, {0})

    def test_cast_scan_flags_padding_overlay(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            index = fixture_index(root)
            src = root / "src"
            src.mkdir()
            (src / "cast.c").write_text("void f(void *ptr) { (void)((View *)ptr); }\n", encoding="utf-8")
            rows = typeidx.scan_casts(index, src)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["record"], "struct View")
        self.assertTrue(rows[0]["flags"]["cast_only"])
        self.assertTrue(rows[0]["flags"]["mostly_padding"])
        self.assertTrue(rows[0]["flags"]["overlay_view"])


class LayoutLookupApiTest(unittest.TestCase):
    def run_api(self, index_root: Path, *arguments: str) -> dict[str, object]:
        completed = subprocess.run(
            [sys.executable, str(API), "--index-root", str(index_root), *arguments, "--json"],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return json.loads(completed.stdout)

    def test_index_not_built(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = self.run_api(root, "--record", "Alpha")
            empty_index = root / "indexes" / "type_layout_index.json"
            empty_index.parent.mkdir()
            empty_index.write_text('{"records": {}}', encoding="utf-8")
            empty_payload = self.run_api(root, "--record", "Alpha")
        self.assertEqual(payload["status"], "index_not_built")
        self.assertEqual(empty_payload["status"], "index_not_built")
        self.assertIn("build_type_index.py", payload["runner"])

    def test_record_lookup_and_unknown_record(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            index = fixture_index(root)
            index_path = root / "indexes" / "type_layout_index.json"
            index_path.parent.mkdir()
            index_path.write_text(json.dumps(index), encoding="utf-8")

            payload = self.run_api(root, "--record", "Alpha", "--mode", "near")
            self.assertEqual(payload["status"], "ok")
            self.assertEqual(payload["record"]["name"], "struct Alpha")
            self.assertEqual(payload["near"][0]["name"], "struct Beta")
            self.assertEqual(payload["duplicate_group"], ["struct Alpha", "struct Beta"])

            unknown = self.run_api(root, "--record", "Alphx")
            self.assertEqual(unknown["status"], "record_not_indexed")
            self.assertIn("struct Alpha", unknown["suggestions"])

            unavailable = self.run_api(root, "--record", "Alpha", "--mode", "casts")
            self.assertEqual(unavailable["status"], "cast_scan_unavailable")


if __name__ == "__main__":
    unittest.main()
