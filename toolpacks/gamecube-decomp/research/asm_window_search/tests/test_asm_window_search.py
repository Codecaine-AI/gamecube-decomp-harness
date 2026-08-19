#!/usr/bin/env python3
"""Tests for normalized sparse assembly-window indexing and search."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[5]
TOOL_ROOT = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "asm_window_search"
TOOLPACK_ROOT = REPO_ROOT / "toolpacks" / "gamecube-decomp"
sys.path.append(str(TOOLPACK_ROOT / "_impl" / "gamecube"))
sys.path.append(str(TOOL_ROOT / "runners"))
sys.path.append(str(TOOL_ROOT / "api"))

from dsearch.embed import HASHED_DIM, embed_hashed, embed_hashed_sparse, embed_query  # type: ignore
from dsearch.normalize import Function, Insn, function_tokens, window_token_texts, window_texts  # type: ignore
from dsearch.objparse import parse_object  # type: ignore
from build_asm_window_index import (  # type: ignore
    VECTOR_HEADER,
    VECTOR_MAGIC,
    VECTOR_VERSION,
    build_index_from_functions,
    write_sparse_vectors,
)
import window_search  # type: ignore


class NormalizeAndEmbedTest(unittest.TestCase):
    def test_inline_objdump_fixture_normalizes_relocs_and_branches(self) -> None:
        fixture = """\
00000000 <Loop>:
   0: 38 60 00 00 \tli      r3,0
   0: R_PPC_ADDR16_LO target
   4: 80 83 00 00 \tlwz     r4,0(r3)
   8: 41 82 00 00 \tbeq     0 <Loop>
   c: 48 00 00 01 \tbl      10 <Callee>
00000010 <Forward>:
  10: 48 00 00 00 \tb       20 <Done>
  14: 4e 80 00 20 \tblr
"""
        completed = subprocess.CompletedProcess([], 0, stdout=fixture, stderr="")
        with mock.patch("dsearch.objparse.subprocess.run", return_value=completed):
            functions = list(parse_object("objdump", Path("fixture.o"), "obj/fixture.o"))
        self.assertEqual([function.name for function in functions], ["Loop", "Forward"])
        self.assertEqual(
            function_tokens(functions[0]),
            ["li(r,#)[ADDR16_LO]", "lwz(r,#(r))", "beq(back)", "bl"],
        )
        self.assertEqual(function_tokens(functions[1]), ["b(fwd)", "blr"])

    def test_hashed_dense_sparse_and_query_are_deterministic(self) -> None:
        document = "ppc 3\naddi(r,r,#) b(back) blr"
        dense = embed_hashed([document])[0]
        sparse = embed_hashed_sparse(document)
        self.assertAlmostEqual(math.sqrt(sum(value * value for value in dense)), 1.0, places=12)
        self.assertEqual(embed_query(document), dense)
        self.assertEqual([index for index, _ in sparse], sorted(index for index, _ in sparse))
        self.assertEqual({index for index, _ in sparse}, {index for index, value in enumerate(dense) if value})
        self.assertAlmostEqual(dense[27], -0.4082482904638631, places=15)
        self.assertAlmostEqual(dense[124], 0.4082482904638631, places=15)
        self.assertAlmostEqual(dense[261], 0.4082482904638631, places=15)
        for index, value in sparse:
            self.assertEqual(value, dense[index])

    def test_window_boundaries_and_tail_flush(self) -> None:
        self.assertEqual(window_token_texts([]), [])
        self.assertEqual([start for start, _ in window_token_texts(["x"] * 32)], [0])
        self.assertEqual([start for start, _ in window_token_texts(["x"] * 33)], [0, 1])
        self.assertEqual([start for start, _ in window_token_texts(["x"] * 48)], [0, 16])
        self.assertEqual([start for start, _ in window_token_texts(["x"] * 49)], [0, 16, 17])
        one = Function("One", "one.o", [Insn(0, "blr", "")])
        self.assertEqual(window_texts(one), [(0, "ppc 1\nblr")])
        with self.assertRaises(ValueError):
            window_token_texts(["x"], size=0)
        with self.assertRaises(ValueError):
            window_token_texts(["x"], stride=0)


class SparseBinaryTest(unittest.TestCase):
    def test_sparse_binary_roundtrip(self) -> None:
        vectors = [
            [(2, -0.25), (500, 0.75)],
            [],
            [(1, 1.0)],
        ]
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "vectors.bin"
            write_sparse_vectors(path, vectors)
            dimension, loaded = window_search.load_sparse_vectors(path)
        self.assertEqual(dimension, HASHED_DIM)
        self.assertEqual([list(indices) for indices, _ in loaded], [[2, 500], [], [1]])
        self.assertEqual([list(values) for _, values in loaded], [[-0.25, 0.75], [], [1.0]])

    def test_sparse_binary_rejects_bad_magic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "vectors.bin"
            path.write_bytes(VECTOR_HEADER.pack(b"NOPE", VECTOR_VERSION, HASHED_DIM, 0))
            with self.assertRaisesRegex(ValueError, "wrong magic"):
                window_search.load_sparse_vectors(path)


class EndToEndSearchTest(unittest.TestCase):
    def make_function(self, name: str, unit: str, tokens: list[str]) -> Function:
        return Function(name, unit, [Insn(index * 4, token, "") for index, token in enumerate(tokens)])

    def test_twin_ranks_first_and_match_filter_excludes_low_donor(self) -> None:
        base = [f"op{index % 7}" for index in range(40)]
        functions = [
            self.make_function("Query", "src/query.o", base),
            self.make_function("ATwin", "src/twin.o", base),
            self.make_function("LowDonor", "src/low.o", base),
            self.make_function("NullDonor", "src/null.o", base),
            self.make_function("Other", "src/other.o", ["blr"] * 40),
        ]
        report = {
            "Query": (25.0, "src/query.o"),
            "ATwin": (100.0, "src/twin.o"),
            "LowDonor": (50.0, "src/low.o"),
            "Other": (100.0, "src/other.o"),
        }
        with tempfile.TemporaryDirectory() as temporary:
            storage = Path(temporary) / "asm_window_search"
            build_index_from_functions(functions, storage, report=report, report_source="inline")
            with mock.patch.dict(
                os.environ,
                {
                    "ORCH_TOOL_SHARED_DATA_ROOT": str(storage),
                    "ORCH_GAME_ID": f"asm-window-test-{os.getpid()}",
                },
            ):
                payload = window_search.build_payload("Query")
                all_payload = window_search.build_payload("Query", include_all=True)

        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["query"]["n_windows"], 2)
        self.assertEqual(payload["results"][0]["symbol"], "ATwin")
        self.assertEqual(payload["results"][0]["similarity"], 1.0)
        self.assertNotIn("LowDonor", [row["symbol"] for row in payload["results"]])
        self.assertNotIn("NullDonor", [row["symbol"] for row in payload["results"]])
        self.assertIn("LowDonor", [row["symbol"] for row in all_payload["results"]])
        self.assertIn("NullDonor", [row["symbol"] for row in all_payload["results"]])
        self.assertNotIn("Query", [row["symbol"] for row in all_payload["results"]])

    def test_index_not_built_status_exits_zero(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            env = {
                **os.environ,
                "ORCH_TOOL_SHARED_DATA_ROOT": temporary,
                "ORCH_GAME_ID": f"asm-window-missing-{os.getpid()}",
            }
            completed = subprocess.run(
                [
                    sys.executable,
                    str(TOOL_ROOT / "api" / "window_search.py"),
                    "--symbol",
                    "Missing",
                    "--json",
                ],
                check=False,
                capture_output=True,
                text=True,
                env=env,
            )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual(payload["status"], "index_not_built")
        self.assertIn("--repo-root <built_melee_checkout>", payload["runner"])

    def test_empty_index_is_not_built(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            storage = Path(temporary) / "asm_window_search"
            indexes = storage / "indexes"
            indexes.mkdir(parents=True)
            for name in ("functions.jsonl", "windows.meta.jsonl", "windows.vec.bin", "manifest.json"):
                (indexes / name).touch()
            with mock.patch.dict(
                os.environ,
                {
                    "ORCH_TOOL_SHARED_DATA_ROOT": str(storage),
                    "ORCH_GAME_ID": f"asm-window-empty-{os.getpid()}",
                },
            ):
                payload = window_search.build_payload("Missing")
        self.assertEqual(payload["status"], "index_not_built")


if __name__ == "__main__":
    unittest.main()
