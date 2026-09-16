import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("migration", Path(__file__).with_name("migrate-workspace-layout.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)
repair_spec = importlib.util.spec_from_file_location("repair_links", Path(__file__).with_name("repair-layout-symlinks.py"))
repair_links = importlib.util.module_from_spec(repair_spec)
repair_spec.loader.exec_module(repair_links)


class LayoutMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / "workspace"
        self.root.mkdir()

    def put(self, path, contents="original"):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(contents)
        return target

    def test_nested_moves_preserve_backups_rewrite_only_explicit_control_files_and_rollback(self):
        self.put("game/state/tools/compiler", "binary")
        self.put("game/state/trace.json", '{"historic":"game/state/tools/compiler"}')
        self.put("game/state/control.json", json.dumps({"tool": str(self.root / "game/state/tools/compiler"), "unrelated": "a sentence about game/state"}))
        plan = migration.make_plan(self.root, {"moves": [
            {"from": "game/state", "to": "game/runtime/state"},
            {"from": "game/state/tools", "to": "game/runtime/tools"},
        ], "rewriteJson": ["game/runtime/state/control.json"]})
        with patch.object(migration, "open_source_files", return_value=[]):
            journal = migration.apply_plan(plan, self.base / "backup")
            self.assertEqual((self.root / "game/runtime/tools/compiler").read_text(), "binary")
            self.assertEqual((self.base / "backup/original/game/state/tools/compiler").read_text(), "binary")
            control = json.loads((self.root / "game/runtime/state/control.json").read_text())
            self.assertEqual(control["tool"], str(self.root / "game/runtime/tools/compiler"))
            self.assertEqual(control["unrelated"], "a sentence about game/state")
            self.assertEqual((self.root / "game/runtime/state/trace.json").read_text(), '{"historic":"game/state/tools/compiler"}')
            migration.rollback(journal)
            migration.rollback(journal)
        self.assertEqual((self.root / "game/state/tools/compiler").read_text(), "binary")
        self.assertEqual(json.loads((self.root / "game/state/control.json").read_text())["tool"], str(self.root / "game/state/tools/compiler"))

    def test_open_files_block_before_backup_or_move(self):
        self.put("old/database.sqlite")
        plan = migration.make_plan(self.root, {"moves": [{"from": "old", "to": "new"}]})
        with patch.object(migration, "open_source_files", return_value=[{"pid": 123, "path": "database.sqlite"}]):
            with self.assertRaisesRegex(RuntimeError, "Stop processes"):
                migration.apply_plan(plan, self.base / "backup")
        self.assertTrue((self.root / "old/database.sqlite").exists())
        self.assertFalse((self.base / "backup").exists())

    def test_rejects_collisions_and_escaping_paths(self):
        self.put("old/file")
        self.put("new/file")
        for move in [{"from": "old", "to": "new"}, {"from": "old", "to": "../escape"}, {"from": "old", "to": "old/nested"}]:
            with self.assertRaises(ValueError):
                migration.make_plan(self.root, {"moves": [move]})

    def test_backup_failure_never_moves_live_source(self):
        self.put("old/file")
        plan = migration.make_plan(self.root, {"moves": [{"from": "old", "to": "new"}]})
        with patch.object(migration, "open_source_files", return_value=[]), patch.object(migration, "copy_backup", side_effect=RuntimeError("disk full")):
            with self.assertRaisesRegex(RuntimeError, "disk full"):
                migration.apply_plan(plan, self.base / "backup")
        self.assertTrue((self.root / "old/file").exists())
        self.assertFalse((self.root / "new").exists())

    def test_repairs_explicit_git_pointer_using_historical_alias(self):
        self.put("old/worktree/.git", "gitdir: /previous/checkout/.git/worktrees/task\n")
        plan = migration.make_plan(self.root, {"moves": [{"from": "old", "to": "new"}],
            "pathAliases": [{"from": "/previous/checkout", "to": str(self.root / "workspace/checkout")}],
            "rewriteGitPointers": ["new/worktree/.git"]})
        with patch.object(migration, "open_source_files", return_value=[]):
            journal = migration.apply_plan(plan, self.base / "backup")
            self.assertEqual((self.root / "new/worktree/.git").read_text(), f"gitdir: {self.root}/workspace/checkout/.git/worktrees/task\n")
            migration.rollback(journal)
        self.assertEqual((self.root / "old/worktree/.git").read_text(), "gitdir: /previous/checkout/.git/worktrees/task\n")

    def test_recovers_a_crash_between_rename_and_journal_acknowledgement(self):
        self.put("old/file")
        plan = migration.make_plan(self.root, {"moves": [{"from": "old", "to": "new"}]})
        backup = self.base / "backup"
        backup.mkdir()
        journal = backup / "journal.json"
        migration.save_journal(journal, {**plan, "status": "moving", "backupDir": str(backup),
            "applied": [], "pendingMove": plan["moves"][0], "rewrites": []})
        (self.root / "old").rename(self.root / "new")
        with patch.object(migration, "open_source_files", return_value=[]):
            migration.rollback(journal)
        self.assertEqual((self.root / "old/file").read_text(), "original")
        self.assertEqual(json.loads(journal.read_text())["status"], "rolled_back")

    def test_path_mapping_prefers_tool_carveout_over_parent_state(self):
        self.put("old/tools/bin")
        plan = migration.make_plan(self.root, {"moves": [
            {"from": "old", "to": "runtime/state"}, {"from": "old/tools", "to": "runtime/tools"}]})
        self.assertEqual(migration.rewrite_value(str(self.root / "old/tools/bin"), plan["pathMappings"]), str(self.root / "runtime/tools/bin"))

    def test_asset_links_repair_absolute_and_relative_targets_and_restore_on_rollback(self):
        asset = self.put("old/assets/data", "asset")
        worker = self.root / "old/workers/task"
        worker.mkdir(parents=True)
        (worker / "absolute").symlink_to(asset)
        (worker / "relative").symlink_to("../../assets/data")
        plan = migration.make_plan(self.root, {"moves": [
            {"from": "old/workers/task", "to": "workspace/checkout"},
            {"from": "old", "to": "workspace/repository"},
        ]})
        with patch.object(migration, "open_source_files", return_value=[]):
            journal = migration.apply_plan(plan, self.base / "backup")
            preview = repair_links.repair(journal)
            self.assertEqual(preview["proposed"], 2)
            result = repair_links.repair(journal, True)
            self.assertEqual(result["repaired"], 2)
            self.assertEqual((self.root / "workspace/checkout/absolute").read_text(), "asset")
            self.assertEqual((self.root / "workspace/checkout/relative").read_text(), "asset")
            self.assertEqual(repair_links.repair(journal, True)["repaired"], 0)
            migration.rollback(journal)
        self.assertEqual((worker / "absolute").readlink(), asset)
        self.assertEqual(str((worker / "relative").readlink()), "../../assets/data")

    def test_repairs_game_knowledge_links_outside_the_moved_tree(self):
        asset = self.put("games/demo/checkout/orig/data", "asset")
        link = self.root / "games/demo/knowledge/source-asset"
        link.parent.mkdir(parents=True)
        link.symlink_to(asset)
        plan = migration.make_plan(self.root, {"moves": [
            {"from": "games/demo/checkout", "to": "games/demo/workspace/repository"}]})
        with patch.object(migration, "open_source_files", return_value=[]):
            journal = migration.apply_plan(plan, self.base / "backup")
            self.assertEqual(repair_links.repair(journal, True)["repaired"], 1)
            self.assertEqual(link.read_text(), "asset")
            migration.rollback(journal)
        self.assertEqual(link.readlink(), asset)


if __name__ == "__main__":
    unittest.main()
