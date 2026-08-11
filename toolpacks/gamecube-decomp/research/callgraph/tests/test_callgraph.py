#!/usr/bin/env python3
"""Synthetic coverage for callgraph assembly parsing and report joins."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[5]
RUNNER = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "callgraph" / "runners" / "extract_call_graph.py"


def load_runner():
    spec = importlib.util.spec_from_file_location("extract_call_graph", RUNNER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import {RUNNER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CallgraphTest(unittest.TestCase):
    def test_extracts_calls_data_refs_and_report_metadata(self) -> None:
        runner = load_runner()
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            fixture_repo = tmp_root / "fixture-repo"
            storage_root = tmp_root / "tool-data" / "callgraph"
            self.write_fixture(fixture_repo)

            metadata = runner.report_metadata(fixture_repo)
            functions = list(runner.iter_asm_functions(fixture_repo, metadata))
            self.assertEqual([row["symbol"] for row in functions], ["Caller", "Callee"])
            self.assertEqual(functions[0]["asm_line"], 1)
            self.assertEqual(functions[1]["asm_line"], 12)

            runner.TOOL_STORAGE_ROOT = storage_root
            manifest, exit_code = runner.run(runner.parse_args(["--repo-root", str(fixture_repo), "--limit", "0"]))
            self.assertEqual(exit_code, 0)
            self.assertTrue(manifest["success"])
            self.assertEqual(
                manifest["counts"],
                {
                    "functions_scanned": 2,
                    "call_sites": 2,
                    "call_edges": 1,
                    "data_ref_sites": 4,
                    "data_ref_edges": 3,
                },
            )

            calls = self.read_jsonl(storage_root / "indexes" / "calls.jsonl")
            self.assertEqual(len(calls), 1)
            call = calls[0]
            self.assertEqual(call["symbol"], "Caller")
            self.assertEqual(call["callee_symbol"], "Callee")
            self.assertEqual(call["count"], 2)
            self.assertTrue(call["evidence_ref"].endswith("caller.s#line=2"))
            self.assertTrue(call["payload"]["callee_is_known_function"])
            self.assertEqual(call["unit"], "main/melee/test/caller")
            self.assertEqual(call["source_path"], "src/melee/test/caller.c")
            self.assertEqual(call["address"], "0x80100000")
            self.assertEqual(call["fuzzy_match_percent"], 87.5)

            data_refs = self.read_jsonl(storage_root / "indexes" / "data_refs.jsonl")
            by_symbol = {row["ref_symbol"]: row for row in data_refs}
            self.assertEqual(by_symbol["Callee"]["count"], 2)
            self.assertEqual(by_symbol["Callee"]["ref_kind"], "function_pointer")
            self.assertEqual(by_symbol["GlobalData"]["count"], 1)
            self.assertEqual(by_symbol["GlobalData"]["ref_kind"], "data")
            self.assertEqual(by_symbol["SmallData"]["count"], 1)
            self.assertEqual(by_symbol["SmallData"]["ref_kind"], "data")
            self.assertTrue(by_symbol["SmallData"]["evidence_ref"].endswith("caller.s#line=6"))
            self.assertEqual(by_symbol["Callee"]["unit"], "main/melee/test/caller")
            self.assertEqual(by_symbol["Callee"]["source_path"], "src/melee/test/caller.c")

    def read_jsonl(self, path: Path) -> list[dict[str, object]]:
        with path.open("r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    def write_fixture(self, repo_root: Path) -> None:
        asm_dir = repo_root / "build" / "GALE01" / "asm" / "melee" / "test"
        asm_dir.mkdir(parents=True)
        (asm_dir / "caller.s").write_text(
            "\n".join(
                [
                    ".fn Caller, global",
                    "/* 80100000 00000000  48 00 00 01 */\tbl Callee",
                    "/* 80100004 00000004  48 00 00 01 */\tbl Callee",
                    "/* 80100008 00000008  48 00 00 01 */\tbl 0x80101000",
                    "/* 8010000C 0000000C  48 00 00 01 */\tbl .L_local",
                    "/* 80100010 00000010  C0 20 00 00 */\tlfs f1, SmallData@sda21(r0)",
                    "/* 80100014 00000014  3C 60 00 00 */\tlis r3, Callee@ha",
                    "/* 80100018 00000018  38 63 00 00 */\taddi r3, r3, Callee@l",
                    "/* 8010001C 0000001C  3C 80 00 00 */\tlis r4, GlobalData@h",
                    "/* 80100020 00000020  40 82 00 04 */\tbne Callee@ha",
                    ".endfn Caller",
                    ".fn Callee, global",
                    "/* 80100024 00000024  4E 80 00 20 */\tblr",
                    ".endfn Callee",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        report = {
            "units": [
                {
                    "name": "main/melee/test/caller",
                    "metadata": {"source_path": "src/melee/test/caller.c"},
                    "functions": [
                        {
                            "name": "Caller",
                            "size": 36,
                            "fuzzy_match_percent": 87.5,
                            "metadata": {"virtual_address": 0x80100000},
                        },
                        {
                            "name": "Callee",
                            "size": 4,
                            "fuzzy_match_percent": 100,
                            "metadata": {"virtual_address": 0x80100024},
                        },
                    ],
                }
            ]
        }
        report_path = repo_root / "build" / "GALE01" / "report.json"
        report_path.write_text(json.dumps(report), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
