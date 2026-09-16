"""Report and reference paths must follow the selected game through subprocesses."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

TOOLS = Path(__file__).resolve().parents[3] / "_impl/gamecube/tools"
sys.path.insert(0, str(TOOLS))
from project_root import report_path, reference_object_root
import checkdiff


class GameBindingTest(unittest.TestCase):
    def test_selected_game_never_falls_back_to_melee(self):
        with mock.patch.dict(os.environ, {"ORCH_GAME_ID": "zelda"}, clear=True):
            with self.assertRaisesRegex(ValueError, "ORCH_GAME_REPORT_PATH"):
                report_path(Path("/repo"))
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(report_path(Path("/repo")), Path("/repo/build/GALE01/report.json"))

    def test_second_game_diff_uses_its_reference_objects(self):
        with (mock.patch.dict(os.environ, {"ORCH_GAME_ID": "zelda", "ORCH_GAME_REPORT_PATH": "build/GZLE01/report.json"}, clear=True),
              mock.patch.object(checkdiff, "ROOT", Path("/repo")),
              mock.patch.object(checkdiff, "objdiff_cli", return_value="objdiff"),
              mock.patch.object(checkdiff.subprocess, "run") as run):
            checkdiff.run_diff("zelda/main", Path("/tmp/candidate.o"), "main")
            command = run.call_args.args[0]
            self.assertEqual(command[command.index("-1") + 1], "/repo/build/GZLE01/obj/zelda/main.o")
            os.environ["ORCH_GAME_REFERENCE_OBJECT_ROOT"] = "orig/GZLE01/objects"
            self.assertEqual(reference_object_root(Path("/repo")), Path("/repo/orig/GZLE01/objects"))

    def test_second_game_status_and_compiler_import_share_report_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            env = {**os.environ, "ORCH_GAME_ID": "zelda", "ORCH_GAME_REPO_ROOT": str(root),
                   "ORCH_GAME_REPORT_PATH": "build/GZLE01/report.json", "PYTHONPATH": str(TOOLS)}
            env.pop("ORCH_GAME_REFERENCE_OBJECT_ROOT", None)
            result = subprocess.run([sys.executable, "-c", "import ninja_compile; print(ninja_compile.REPORT_PATH)"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(result.stdout.strip(), str(root / "build/GZLE01/report.json"))
            (root / "build.ninja").write_text("rule mwcc\n  command = compiler\nbuild build/GZLE01/src/zelda/main.o: mwcc src/zelda/main.c\n  mw_version = GC/1.2.5n\n  cflags = -O4\n")
            result = subprocess.run([sys.executable, "-c", "import ninja_compile; print(ninja_compile.find_build_block('zelda/main').src)"], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(result.stdout.strip(), "src/zelda/main.c")
            status = Path(__file__).resolve().parents[1] / "api/status.py"
            result = subprocess.run([sys.executable, str(status), "--repo-root", str(root), "--json"], env=env, capture_output=True, text=True, check=True)
            payload = json.loads(result.stdout)
            required = [item["absolute_path"] for item in payload["required_paths"]]
            self.assertIn(str(root / "build/GZLE01/report.json"), required)
            self.assertIn(str(root / "build/GZLE01/obj"), required)
            self.assertFalse(any("GALE01" in path for path in required))
