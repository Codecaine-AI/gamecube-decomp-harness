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



RUNNER = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "type_layout_lookup" / "runners" / "build_type_index.py"


def fake_clang(root: Path, *, stdout: str, stderr: str = "", exit_code: int = 0) -> Path:
    """A clang stand-in that records its argv and prints a fixed record dump."""
    (root / "dump.txt").write_text(stdout, encoding="utf-8")
    (root / "stderr.txt").write_text(stderr, encoding="utf-8")
    script = root / "fake-clang"
    script.write_text(
        "#!/bin/sh\n"
        f'printf "%s\\n" "$@" > "{root}/argv.txt"\n'
        f'cat "{root}/dump.txt"; cat "{root}/stderr.txt" >&2; exit {exit_code}\n',
        encoding="utf-8",
    )
    script.chmod(0o755)
    return script


class DumpLanguageTest(unittest.TestCase):
    def build(self, root: Path, clang: Path, *extra: str) -> tuple[int, dict[str, object], dict[str, object] | None]:
        ctx = root / "ctx.c"
        ctx.write_text(CTX_TEXT, encoding="utf-8")
        completed = subprocess.run(
            [sys.executable, str(RUNNER), "--ctx", str(ctx), "--clang", str(clang), "--skip-casts", "--out", str(root / "out"), *extra],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
        )
        index_path = root / "out" / "indexes" / "type_layout_index.json"
        index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else None
        return completed.returncode, json.loads(completed.stdout), index

    def test_c_keeps_the_vendored_command_and_index_shape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            ctx = root / "ctx.c"
            self.assertEqual(
                typeidx.dump_command(ctx, "clang"),
                ["clang", "-target", "powerpc-unknown-eabi", "-std=gnu99", "-fsyntax-only",
                 "-Wno-everything", "-Xclang", "-fdump-record-layouts-complete", str(ctx)],
            )
            code, payload, index = self.build(root, fake_clang(root, stdout=LAYOUT_DUMP))
            self.assertEqual(code, 0)
            self.assertNotIn("dump", payload)
            assert index is not None
            self.assertNotIn("dump", index)
            self.assertEqual(index["records"], json.loads(json.dumps(fixture_index(root)["records"])))

    def test_cxx_uses_cxx_mode_and_the_mwcc_prelude_only_in_the_dump_compile(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            code, payload, _ = self.build(root, fake_clang(root, stdout=LAYOUT_DUMP), "--lang", "c++")
            self.assertEqual(code, 0)
            argv = (root / "argv.txt").read_text(encoding="utf-8").splitlines()
            self.assertEqual(argv[argv.index("-x") + 1], "c++")
            self.assertIn("-std=gnu++11", argv)
            prelude = Path(argv[argv.index("-include") + 1])
            self.assertEqual(prelude, typeidx.MWCC_CXX_PRELUDE)
            self.assertIn("__cntlzw", prelude.read_text(encoding="utf-8"))
            self.assertEqual(argv[-1], str((root / "ctx.c").resolve()))
            self.assertEqual(payload["dump"], {"lang": "c++", "exit_code": 0, "error_count": 0})
            index = json.loads((root / "out" / "indexes" / "type_layout_index.json").read_text(encoding="utf-8"))
            self.assertIn("Itanium", index["dump"]["abi_note"])

    def test_partial_layouts_are_kept_with_their_errors_recorded_deterministically(self) -> None:
        errors = "".join(f"/x/ctx.c:{line}:3: error: use of undeclared identifier 'OSHalt'\n" for line in range(10, 17))
        indexes = []
        for _ in range(2):
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                code, payload, index = self.build(root, fake_clang(root, stdout=LAYOUT_DUMP, stderr=errors, exit_code=1), "--lang", "c++")
                self.assertEqual(code, 0)
                self.assertEqual(payload["record_count"], 5)
                assert index is not None
                self.assertEqual(index["dump"]["error_count"], 7)
                self.assertEqual(index["dump"]["exit_code"], 1)
                self.assertEqual(len(index["dump"]["errors"]), 5)
                self.assertEqual(index["dump"]["errors"][0], "/x/ctx.c:10:3: error: use of undeclared identifier 'OSHalt'")
                indexes.append({key: index[key] for key in ("records", "dump", "dup_groups")})
        self.assertEqual(indexes[0], indexes[1])

    def test_cxx_class_records_resolve_by_bare_name_and_as_nested_fields(self) -> None:
        dump = """
*** Dumping AST Record Layout
         0 | class JGeometry::TVec3<f32>
         0 |   float x
         4 |   float y
         8 |   float z
           | [sizeof=12, dsize=12, align=4,
           |  nvsize=12, nvalign=4]
*** Dumping AST Record Layout
         0 | class Holder
         0 |   class JGeometry::TVec3<f32> pos
        12 |   int count
           | [sizeof=16, dsize=16, align=4,
           |  nvsize=16, nvalign=4]
"""
        with tempfile.TemporaryDirectory() as temporary:
            ctx = Path(temporary) / "ctx.c"
            ctx.write_text("", encoding="utf-8")
            index = typeidx.ingest("sms", ctx, dump_text=dump)
            self.assertEqual(typeidx.find_record(index, "JGeometry::TVec3<f32>"), "class JGeometry::TVec3<f32>")
            self.assertEqual(index["records"]["class JGeometry::TVec3<f32>"]["size"], 12)
            leaves = index["records"]["class Holder"]["leaves"]
            self.assertEqual([leaf[1] for leaf in leaves], ["f32", "f32", "f32", "i32"])

    def test_no_layouts_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            code, payload, index = self.build(root, fake_clang(root, stdout="", stderr="ctx.c:1:1: error: boom\n", exit_code=1), "--lang", "c++")
            self.assertEqual(code, 2)
            self.assertEqual(payload["status"], "clang_layout_failed")
            self.assertIn("no layouts", str(payload["message"]))
            self.assertIsNone(index)



# A C++ dump modelled on SMS: TVec3 (plain), JKRHeap-like (one polymorphic
# primary base, no tail reuse), TNameRef/TViewObj (tail padding reuse),
# TPlacement (contains TViewObj as its base), a holder of TPlacement by value,
# two plain bases (JSUTree-like), and a polymorphic secondary base.
CXX_DUMP = """
*** Dumping AST Record Layout
         0 | class TVec3
         0 |   float x
         4 |   float y
         8 |   float z
           | [sizeof=12, dsize=12, align=4,
           |  nvsize=12, nvalign=4]
*** Dumping AST Record Layout
         0 | class Disposer
         0 |   (Disposer vtable pointer)
         4 |   void * mHeap
           | [sizeof=8, dsize=8, align=4,
           |  nvsize=8, nvalign=4]
*** Dumping AST Record Layout
         0 | class Heap
         0 |   class Disposer (primary base)
         0 |     (Disposer vtable pointer)
         4 |     void * mHeap
         8 |   int mSize
           | [sizeof=12, dsize=12, align=4,
           |  nvsize=12, nvalign=4]
*** Dumping AST Record Layout
         0 | class NameRef
         0 |   (NameRef vtable pointer)
         4 |   const char * mName
         8 |   unsigned short mKeyCode
           | [sizeof=12, dsize=10, align=4,
           |  nvsize=10, nvalign=4]
*** Dumping AST Record Layout
         0 | class ViewObj
         0 |   class NameRef (primary base)
         0 |     (NameRef vtable pointer)
         4 |     const char * mName
         8 |     unsigned short mKeyCode
        10 |   unsigned short unkC
           | [sizeof=12, dsize=12, align=4,
           |  nvsize=12, nvalign=4]
*** Dumping AST Record Layout
         0 | class Placement
         0 |   class ViewObj (primary base)
         0 |     class NameRef (primary base)
         0 |       (NameRef vtable pointer)
         4 |       const char * mName
         8 |       unsigned short mKeyCode
        10 |     unsigned short unkC
        12 |   class TVec3 mPosition
        12 |     float x
        16 |     float y
        20 |     float z
           | [sizeof=24, dsize=24, align=4,
           |  nvsize=24, nvalign=4]
*** Dumping AST Record Layout
         0 | struct Holder
         0 |   int count
         4 |   class Placement placement
         4 |     class ViewObj (primary base)
         4 |       class NameRef (primary base)
         4 |         (NameRef vtable pointer)
         8 |         const char * mName
        12 |         unsigned short mKeyCode
        14 |       unsigned short unkC
        16 |     class TVec3 mPosition
        16 |       float x
        20 |       float y
        24 |       float z
           | [sizeof=28, dsize=28, align=4,
           |  nvsize=28, nvalign=4]
*** Dumping AST Record Layout
         0 | class List
         0 |   void * head
           | [sizeof=4, dsize=4, align=4,
           |  nvsize=4, nvalign=4]
*** Dumping AST Record Layout
         0 | class Link
         0 |   void * next
           | [sizeof=4, dsize=4, align=4,
           |  nvsize=4, nvalign=4]
*** Dumping AST Record Layout
         0 | class Tree
         0 |   class List (base)
         0 |     void * head
         4 |   class Link (base)
         4 |     void * next
           | [sizeof=8, dsize=8, align=4,
           |  nvsize=8, nvalign=4]
*** Dumping AST Record Layout
         0 | class Actor
         0 |   class Placement (primary base)
         0 |     class ViewObj (primary base)
         0 |       class NameRef (primary base)
         0 |         (NameRef vtable pointer)
         4 |         const char * mName
         8 |         unsigned short mKeyCode
        10 |       unsigned short unkC
        12 |     class TVec3 mPosition
        12 |       float x
        16 |       float y
        20 |       float z
        24 |   class Disposer (base)
        24 |     (Disposer vtable pointer)
        28 |     void * mHeap
           | [sizeof=32, dsize=32, align=4,
           |  nvsize=32, nvalign=4]
"""


def run_lookup_api(index_root: Path, *arguments: str) -> dict[str, object]:
    completed = subprocess.run(
        [sys.executable, str(API), "--index-root", str(index_root), *arguments, "--json"],
        check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    return json.loads(completed.stdout)


class AbiUncertaintyTest(unittest.TestCase):
    def index(self) -> dict[str, object]:
        with tempfile.TemporaryDirectory() as temporary:
            ctx = Path(temporary) / "ctx.c"
            ctx.write_text("", encoding="utf-8")
            index = typeidx.ingest("sms", ctx, dump_text=CXX_DUMP)
        typeidx.mark_abi_uncertainty(index)
        return index

    def test_marks_divergent_records_and_their_containers(self) -> None:
        records = self.index()["records"]
        flagged = {name: (record["abi_divergence_offset"], record["abi_reason"]) for name, record in records.items() if record.get("abi_uncertain")}
        self.assertEqual(flagged, {
            "class ViewObj": (10, "tail padding of base class NameRef reused"),
            "class Placement": (10, "contains class ViewObj, whose layout is uncertain"),
            "struct Holder": (14, "contains class Placement, whose layout is uncertain"),
            "class Actor": (10, "contains class Placement, whose layout is uncertain"),
        })
        # Plain structs, one polymorphic primary base without reuse, and plain multiple bases stay reliable.
        for name in ("class TVec3", "class Disposer", "class Heap", "class NameRef", "class Tree"):
            self.assertNotIn("abi_uncertain", records[name])

    def test_polymorphic_secondary_base_alone_is_flagged(self) -> None:
        dump = """
*** Dumping AST Record Layout
         0 | class Disposer
         0 |   (Disposer vtable pointer)
         4 |   void * mHeap
           | [sizeof=8, dsize=8, align=4,
           |  nvsize=8, nvalign=4]
*** Dumping AST Record Layout
         0 | class Stage
         0 |   (Stage vtable pointer)
           | [sizeof=4, dsize=4, align=4,
           |  nvsize=4, nvalign=4]
*** Dumping AST Record Layout
         0 | class Actor
         0 |   class Disposer (primary base)
         0 |     (Disposer vtable pointer)
         4 |     void * mHeap
         8 |   class Stage (base)
         8 |     (Stage vtable pointer)
        12 |   float scale
           | [sizeof=16, dsize=16, align=4,
           |  nvsize=16, nvalign=4]
"""
        with tempfile.TemporaryDirectory() as temporary:
            ctx = Path(temporary) / "ctx.c"
            ctx.write_text("", encoding="utf-8")
            index = typeidx.ingest("sms", ctx, dump_text=dump)
        typeidx.mark_abi_uncertainty(index)
        actor = index["records"]["class Actor"]
        self.assertEqual((actor["abi_divergence_offset"], actor["abi_reason"]), (8, "polymorphic secondary base class Stage (vtable pointer placement)"))
        self.assertNotIn("abi_uncertain", index["records"]["class Disposer"])

    def test_lookup_surfaces_reliability_on_every_hit(self) -> None:
        index = self.index()
        index["dump"] = {"lang": "c++", "exit_code": 0, "error_count": 0, "errors": []}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "indexes").mkdir()
            (root / "indexes" / "type_layout_index.json").write_text(json.dumps(index), encoding="utf-8")
            payload = run_lookup_api(root, "--record", "Placement", "--mode", "near")
            self.assertIs(payload["offsets_reliable"], False)
            self.assertEqual(payload["divergence_offset"], 10)
            self.assertIn("header's offset comments or the disassembly", payload["guidance"])
            self.assertIs(payload["record"]["offsets_reliable"], False)
            for hit in payload["near"]:
                self.assertIn("offsets_reliable", hit)
            reliable = run_lookup_api(root, "--record", "TVec3", "--mode", "near")
            self.assertIs(reliable["offsets_reliable"], True)
            self.assertNotIn("guidance", reliable)

    def test_c_indexes_carry_no_reliability_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "indexes").mkdir()
            (root / "indexes" / "type_layout_index.json").write_text(json.dumps(fixture_index(root)), encoding="utf-8")
            payload = run_lookup_api(root, "--record", "Alpha", "--mode", "near")
            self.assertNotIn("offsets_reliable", payload)
            self.assertNotIn("offsets_reliable", payload["record"])


if __name__ == "__main__":
    unittest.main()
