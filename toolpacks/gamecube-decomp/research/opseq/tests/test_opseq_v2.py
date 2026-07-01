#!/usr/bin/env python3
"""Smoke coverage for opseq v2 sequence, fingerprint, and neighbor artifacts."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[5]
RUNNER = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "opseq" / "runners" / "extract_opcode_sequences.py"
SIMILAR = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "opseq" / "api" / "similar_functions.py"
STATUS = REPO_ROOT / "toolpacks" / "gamecube-decomp" / "research" / "opseq" / "api" / "status.py"


class OpseqV2SmokeTest(unittest.TestCase):
    def test_runner_api_and_status_use_temp_storage(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            fixture_repo = tmp_root / "fixture-repo"
            storage_root = tmp_root / "tool-data" / "opseq"
            self.write_fixture(fixture_repo)
            env = {
                **os.environ,
                "ORCH_TOOL_SHARED_DATA_ROOT": str(storage_root),
                "ORCH_PROJECT_ID": f"opseq-v2-smoke-{os.getpid()}",
            }

            runner_payload = self.run_json(
                [sys.executable, str(RUNNER), "--repo-root", str(fixture_repo), "--neighbors-limit", "2"],
                env,
            )
            self.assertTrue(runner_payload["success"])
            self.assertEqual(runner_payload["artifact_counts"]["opcode_sequences"], 3)
            self.assertEqual(runner_payload["artifact_counts"]["fingerprints"], 3)
            self.assertEqual(runner_payload["artifact_counts"]["neighbors"], 3)

            sequence_rows = self.read_jsonl(storage_root / "indexes" / "opcode_sequences.jsonl")
            self.assertEqual(len(sequence_rows), 3)
            alpha = next(row for row in sequence_rows if row["symbol"] == "FuncAlpha")
            self.assertEqual(alpha["opcode_sequence"], ["lwz", "addi", "stw", "blr"])
            self.assertIn("opcode_sequence_hash", alpha)
            self.assertIn("opcode_histogram_hash", alpha)

            neighbor_rows = self.read_jsonl(storage_root / "indexes" / "opcode_neighbors.jsonl")
            alpha_neighbors = next(row for row in neighbor_rows if row["symbol"] == "FuncAlpha")["neighbors"]
            self.assertEqual(alpha_neighbors[0]["symbol"], "FuncBeta")
            self.assertEqual(alpha_neighbors[0]["score_components"]["sequence_exact"], 1.0)

            lookup_payload = self.run_json(
                [sys.executable, str(SIMILAR), "--query", "FuncAlpha", "--limit", "2", "--json"],
                env,
            )
            self.assertEqual(lookup_payload["exact_lookup"][0]["match_type"], "symbol_exact")
            self.assertEqual(lookup_payload["similar_neighbors"][0]["source"], "precomputed_neighbors")
            self.assertEqual(lookup_payload["similar_neighbors"][0]["symbol"], "FuncBeta")
            self.assertIn("histogram_cosine", lookup_payload["similar_neighbors"][0]["score_components"])

            opcode_payload = self.run_json(
                [sys.executable, str(SIMILAR), "--query", "lwz addi blr", "--limit", "2", "--json"],
                env,
            )
            self.assertEqual(opcode_payload["query_resolution"]["strategy"], "opcode_query")
            self.assertEqual(opcode_payload["similar_neighbors"][0]["source"], "on_demand_opcode_query")

            status_payload = self.run_json(
                [sys.executable, str(STATUS), "--repo-root", str(fixture_repo), "--json"],
                env,
            )
            self.assertEqual(status_payload["index_counts"]["opcode_sequences"], 3)
            self.assertEqual(status_payload["index_counts"]["fingerprints"], 3)
            self.assertEqual(status_payload["index_counts"]["neighbors"], 3)
            self.assertTrue(status_payload["runner"]["success"])
            self.assertTrue(status_payload["runner"]["fresh"])

    def run_json(self, command: list[str], env: dict[str, str]) -> dict[str, object]:
        completed = subprocess.run(command, check=True, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return json.loads(completed.stdout)

    def read_jsonl(self, path: Path) -> list[dict[str, object]]:
        with path.open("r", encoding="utf-8") as handle:
            return [json.loads(line) for line in handle if line.strip()]

    def write_fixture(self, repo_root: Path) -> None:
        asm_dir = repo_root / "build" / "GALE01" / "asm" / "src"
        asm_dir.mkdir(parents=True)
        (asm_dir / "fixture.s").write_text(
            "\n".join(
                [
                    ".fn FuncAlpha, global",
                    "/* 000000 80000000 80640000 */\tlwz r3, 0(r4)",
                    "/* 000004 80000004 38630001 */\taddi r3, r3, 1",
                    "/* 000008 80000008 90640000 */\tstw r3, 0(r4)",
                    "/* 00000C 8000000C 4E800020 */\tblr",
                    ".endfn FuncAlpha",
                    ".fn FuncBeta, global",
                    "/* 000010 80000010 80640000 */\tlwz r3, 0(r4)",
                    "/* 000014 80000014 38630001 */\taddi r3, r3, 1",
                    "/* 000018 80000018 90640000 */\tstw r3, 0(r4)",
                    "/* 00001C 8000001C 4E800020 */\tblr",
                    ".endfn FuncBeta",
                    ".fn FuncGamma, global",
                    "/* 000020 80000020 3C608000 */\tlis r3, 0x8000",
                    "/* 000024 80000024 60630001 */\tori r3, r3, 1",
                    "/* 000028 80000028 4E800020 */\tblr",
                    ".endfn FuncGamma",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        report = {
            "units": [
                {
                    "name": "src/fixture.o",
                    "metadata": {"source_path": "src/fixture.c"},
                    "functions": [
                        {"name": "FuncAlpha", "size": 16, "fuzzy_match_percent": 100, "metadata": {"virtual_address": 2147483648}},
                        {"name": "FuncBeta", "size": 16, "fuzzy_match_percent": 100, "metadata": {"virtual_address": 2147483664}},
                        {"name": "FuncGamma", "size": 12, "fuzzy_match_percent": 0, "metadata": {"virtual_address": 2147483680}},
                    ],
                }
            ]
        }
        report_path = repo_root / "build" / "GALE01" / "report.json"
        report_path.write_text(json.dumps(report), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
