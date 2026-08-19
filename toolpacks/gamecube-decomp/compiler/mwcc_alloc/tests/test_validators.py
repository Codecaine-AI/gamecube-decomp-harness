import importlib.util
import json
from pathlib import Path
import unittest


SUITE_DIR = Path(__file__).resolve().parents[1]
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
ALLOCATOR_MODULE_PATH = SUITE_DIR / "sandbox" / "allocator_snapshot.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


allocator_snapshot = load_module("mwcc_alloc_allocator_snapshot", ALLOCATOR_MODULE_PATH)


def load_fixture(name):
    with (FIXTURES_DIR / name).open(encoding="utf-8") as stream:
        return json.load(stream)


class SnapshotValidatorTests(unittest.TestCase):
    def test_reader_stamps_requested_compiler_identity(self):
        target_hash = (
            "ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c"
        )
        reader = allocator_snapshot.SnapshotReader(
            lambda _address, size: b"\0" * size,
            target_sha256=target_hash,
            compiler_label="GC/1.2.5n",
        )

        pcode = reader.snapshot()
        coloring = reader.coloring_snapshot(reg_class=0, simplify_stack=0)
        for snapshot in (pcode, coloring):
            self.assertEqual(snapshot["target_sha256"], target_hash)
            self.assertEqual(snapshot["compiler"], "GC/1.2.5n")

    def test_valid_allocator_fixture_passes(self):
        allocator_snapshot.validate_snapshot(load_fixture("allocator-valid.json"))

    def test_valid_coloring_fixtures_pass(self):
        allocator_snapshot.validate_coloring_snapshot(
            load_fixture("coloring-before.json")
        )
        allocator_snapshot.validate_coloring_snapshot(
            load_fixture("coloring-after.json")
        )

    def test_both_accepted_hashes_pass_each_validator(self):
        hashes = {
            "0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914",
            "ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c",
        }
        for target_hash in hashes:
            with self.subTest(validator="allocator", target_hash=target_hash):
                snapshot = load_fixture("allocator-valid.json")
                snapshot["target_sha256"] = target_hash
                allocator_snapshot.validate_snapshot(snapshot)
            with self.subTest(validator="coloring", target_hash=target_hash):
                snapshot = load_fixture("coloring-before.json")
                snapshot["target_sha256"] = target_hash
                allocator_snapshot.validate_coloring_snapshot(snapshot)

    def test_foreign_hash_fails_each_validator(self):
        for fixture_name, validator in (
            ("allocator-valid.json", allocator_snapshot.validate_snapshot),
            ("coloring-before.json", allocator_snapshot.validate_coloring_snapshot),
        ):
            with self.subTest(fixture=fixture_name):
                snapshot = load_fixture(fixture_name)
                snapshot["target_sha256"] = "0" * 64
                with self.assertRaises(allocator_snapshot.SnapshotError):
                    validator(snapshot)

    def test_unknown_successor_fails(self):
        snapshot = load_fixture("allocator-valid.json")
        snapshot["blocks"][0]["successors"] = [99]
        with self.assertRaisesRegex(
            allocator_snapshot.SnapshotError, "unknown successor"
        ):
            allocator_snapshot.validate_snapshot(snapshot)

    def test_unknown_neighbor_fails(self):
        snapshot = load_fixture("coloring-before.json")
        snapshot["nodes"][0]["neighbors"] = [99]
        with self.assertRaisesRegex(
            allocator_snapshot.SnapshotError, "unknown neighbor"
        ):
            allocator_snapshot.validate_coloring_snapshot(snapshot)

    def test_unknown_simplify_register_fails(self):
        snapshot = load_fixture("coloring-before.json")
        snapshot["simplify_order"].append(99)
        with self.assertRaisesRegex(
            allocator_snapshot.SnapshotError, "simplify order"
        ):
            allocator_snapshot.validate_coloring_snapshot(snapshot)


if __name__ == "__main__":
    unittest.main()
