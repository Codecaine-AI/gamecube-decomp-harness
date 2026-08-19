import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SUITE_DIR = Path(__file__).resolve().parents[1]
SANDBOX_DIR = SUITE_DIR / "sandbox"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
COMPARE_PATH = SANDBOX_DIR / "compare_coloring_snapshots.py"
API_COMPARE_PATH = SUITE_DIR / "api" / "compare.py"


def load_compare_module():
    sys.path.insert(0, str(SANDBOX_DIR))
    try:
        spec = importlib.util.spec_from_file_location("mwcc_alloc_compare", COMPARE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


compare = load_compare_module()


def load_fixture(name):
    with (FIXTURES_DIR / name).open(encoding="utf-8") as stream:
        return json.load(stream)


class CompareSnapshotTests(unittest.TestCase):
    def test_expected_per_register_changes(self):
        changes = compare.compare_snapshots(
            load_fixture("coloring-before.json"),
            load_fixture("coloring-after.json"),
        )
        by_register = {change["virtual_register"]: change for change in changes}

        self.assertEqual(set(by_register), {1, 2, 3, 4, 5})
        self.assertEqual(by_register[1]["fields"]["physical_register"], (-1, 4))
        self.assertEqual(by_register[2]["fields"]["neighbors"], ([1, 3], [1]))
        self.assertEqual(by_register[2]["simplify_order"], (1, 0))
        self.assertEqual(by_register[4]["status"], "removed")
        self.assertEqual(by_register[5]["status"], "added")

    def test_json_cli_emits_one_parseable_object(self):
        before_path = FIXTURES_DIR / "coloring-before.json"
        after_path = FIXTURES_DIR / "coloring-after.json"
        result = subprocess.run(
            [
                sys.executable,
                str(COMPARE_PATH),
                str(before_path),
                str(after_path),
                "--json",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["format"], "mwcc-coloring-compare-v1")
        self.assertEqual(payload["before"], str(before_path.resolve()))
        self.assertEqual(payload["after"], str(after_path.resolve()))
        self.assertEqual(payload["register_class"], 0)
        self.assertEqual(payload["change_count"], len(payload["changes"]))
        self.assertEqual(payload["change_count"], 5)

    def test_json_cli_returns_zero_changes_for_identical_snapshots(self):
        fixture_path = FIXTURES_DIR / "coloring-before.json"
        result = subprocess.run(
            [
                sys.executable,
                str(COMPARE_PATH),
                str(fixture_path),
                str(fixture_path),
                "--json",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["changes"], [])
        self.assertEqual(payload["change_count"], 0)

    def test_api_rejects_non_object_snapshot_with_structured_status(self):
        after_path = FIXTURES_DIR / "coloring-after.json"
        with tempfile.TemporaryDirectory() as temp_dir:
            before_path = Path(temp_dir) / "array.json"
            before_path.write_text("[]\n", encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(API_COMPARE_PATH),
                    "--before",
                    str(before_path),
                    "--after",
                    str(after_path),
                    "--json",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "snapshot_invalid")


if __name__ == "__main__":
    unittest.main()
