#!/usr/bin/env python3
"""Self-contained tests for the Ghidra xref export runner."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


GHIDRA_ROOT = Path(__file__).resolve().parents[1]
RUNNER = GHIDRA_ROOT / "runners" / "export_xrefs.py"

SYNTHETIC_ROWS = [
    {
        "id": "xref:0x80003100:0x80004000",
        "kind": "ghidra_xref",
        "from_address": "0x80003100",
        "to_address": "0x80004000",
        "ref_type": "UNCONDITIONAL_CALL",
        "is_call": True,
        "is_data": False,
        "from_symbol": "caller_one",
        "to_symbol": "callee_one",
        "text": "caller_one UNCONDITIONAL_CALL callee_one 0x80003100 0x80004000",
    },
    {
        "id": "xref:0x80003120:0x80400000",
        "kind": "ghidra_xref",
        "from_address": "0x80003120",
        "to_address": "0x80400000",
        "ref_type": "DATA",
        "is_call": False,
        "is_data": True,
        "from_symbol": "caller_two",
        "to_symbol": "global_value",
        "text": "caller_two DATA global_value 0x80003120 0x80400000",
    },
    {
        "id": "xref:0x80003140:0x80005000",
        "kind": "ghidra_xref",
        "from_address": "0x80003140",
        "to_address": "0x80005000",
        "ref_type": "CONDITIONAL_JUMP",
        "is_call": False,
        "is_data": False,
        "from_symbol": None,
        "to_symbol": "branch_target",
        "text": "None CONDITIONAL_JUMP branch_target 0x80003140 0x80005000",
    },
]


class ExportXrefsRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.root = Path(self.tempdir.name)
        self.repo_root = self.root / "fake-melee"
        elf_path = self.repo_root / "build" / "GALE01" / "main.elf"
        elf_path.parent.mkdir(parents=True)
        elf_path.write_bytes(b"synthetic ELF input")

        self.storage_root = self.root / "tool-data" / "ghidra"
        self.java_home = self.root / "java-home"
        self.java_home.mkdir()
        self.env = os.environ.copy()
        self.env["ORCH_TOOL_SHARED_DATA_ROOT"] = str(self.storage_root)
        self.env["JAVA_HOME"] = str(self.java_home)

    def run_runner(self, analyze_headless: Path, *extra_args: str) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(RUNNER),
            "--repo-root",
            str(self.repo_root),
            "--analyze-headless",
            str(analyze_headless),
        ]
        command.extend(extra_args)
        return subprocess.run(
            command,
            cwd=str(GHIDRA_ROOT),
            env=self.env,
            text=True,
            capture_output=True,
            check=False,
            timeout=30,
        )

    def test_nonexistent_analyze_headless_is_a_clean_skip(self) -> None:
        runner_status = self.storage_root / "cache" / "runner_status.json"
        runner_status.parent.mkdir(parents=True)
        sentinel = b'{"owned_by":"run_headless_probe.py"}\n'
        runner_status.write_bytes(sentinel)

        result = self.run_runner(self.root / "missing" / "analyzeHeadless")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        status_path = self.storage_root / "cache" / "export_xrefs_status.json"
        manifest = json.loads(status_path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["tool"], "ghidra")
        self.assertEqual(manifest["runner"], "export_xrefs.py")
        self.assertFalse(manifest["success"])
        self.assertTrue(manifest["skipped"])
        self.assertIn("analyzeHeadless", manifest["skip_reason"])
        self.assertEqual(manifest["record_count"], 0)
        self.assertEqual(runner_status.read_bytes(), sentinel)

    def test_stub_export_preserves_xref_rows_and_applies_limit(self) -> None:
        stub_path = self.root / "analyzeHeadless"
        stub_source = """#!/usr/bin/env python3
import json
import sys
from pathlib import Path

rows = %s
post_script_index = sys.argv.index("-postScript")
script_name = sys.argv[post_script_index + 1]
output_path = Path(sys.argv[post_script_index + 2])
output_path.parent.mkdir(parents=True, exist_ok=True)
with output_path.open("w", encoding="utf-8") as handle:
    for row in rows:
        handle.write(json.dumps(row, sort_keys=True) + "\\n")
Path(str(output_path) + ".script").write_text(script_name, encoding="utf-8")
print("EXPORT_XREFS_SUMMARY count=%%d output=%%s" %% (len(rows), output_path))
""" % repr(SYNTHETIC_ROWS)
        stub_path.write_text(stub_source, encoding="utf-8")
        stub_path.chmod(0o755)

        result = self.run_runner(stub_path, "--analysis-timeout", "17", "--limit", "2")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        index_path = self.storage_root / "indexes" / "xrefs.jsonl"
        rows = [json.loads(line) for line in index_path.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(rows, SYNTHETIC_ROWS[:2])
        self.assertEqual(Path(str(index_path) + ".script").read_text(encoding="utf-8"), "ExportXrefs.java")
        self.assertEqual(
            set(rows[0]),
            {
                "id",
                "kind",
                "from_address",
                "to_address",
                "ref_type",
                "is_call",
                "is_data",
                "from_symbol",
                "to_symbol",
                "text",
            },
        )
        self.assertIsInstance(rows[0]["is_call"], bool)
        self.assertIsInstance(rows[0]["is_data"], bool)

        manifest = json.loads(
            (self.storage_root / "cache" / "export_xrefs_status.json").read_text(encoding="utf-8")
        )
        self.assertTrue(manifest["success"])
        self.assertFalse(manifest["skipped"])
        self.assertEqual(manifest["exit_code"], 0)
        self.assertEqual(manifest["record_count"], 2)
        self.assertIn("--script-flavor", manifest["command"])
        self.assertIn("ExportXrefs.java", manifest["dependencies"][-1])
        self.assertIn(str(index_path), manifest["generated_indexes"])
        log_text = (self.storage_root / "cache" / "ghidra_export_xrefs.log").read_text(encoding="utf-8")
        self.assertIn("EXPORT_XREFS_SUMMARY count=3", log_text)

        fallback_result = self.run_runner(stub_path, "--script-flavor", "python")
        self.assertEqual(fallback_result.returncode, 0, fallback_result.stdout + fallback_result.stderr)
        self.assertEqual(Path(str(index_path) + ".script").read_text(encoding="utf-8"), "ExportXrefs.py")
        fallback_manifest = json.loads(
            (self.storage_root / "cache" / "export_xrefs_status.json").read_text(encoding="utf-8")
        )
        self.assertIn("ExportXrefs.py", fallback_manifest["dependencies"][-1])


if __name__ == "__main__":
    unittest.main()
