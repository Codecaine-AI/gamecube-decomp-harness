#!/usr/bin/env python3
"""Repair asset links after a completed, backed-up workspace layout migration."""
import argparse
import importlib.util
import json
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location("layout_migration", Path(__file__).with_name("migrate-workspace-layout.py"))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def next_link_target(path, target, mappings):
    if os.path.isabs(target):
        return migration.rewrite_value(target, mappings)
    inverse = sorted([{"from": item["to"], "to": item["from"]} for item in mappings], key=lambda item: len(item["from"]), reverse=True)
    previous_path = Path(migration.rewrite_value(str(path), inverse))
    previous_target = os.path.normpath(str(previous_path.parent / target))
    updated_target = migration.rewrite_value(previous_target, mappings)
    return os.path.relpath(updated_target, path.parent)


def iter_asset_links(directory):
    pending = [directory]
    while pending:
        parent = pending.pop()
        with os.scandir(parent) as entries:
            for entry in entries:
                if entry.is_symlink():
                    yield Path(entry.path)
                elif entry.name != ".git" and entry.is_dir(follow_symlinks=False):
                    pending.append(entry.path)


def repair(journal_path, apply=False, scopes=None):
    journal = json.loads(journal_path.read_text())
    if journal["status"] != "complete":
        raise ValueError("Filesystem migration must finish before repairing links")
    root = Path(journal["root"])
    mappings = journal["pathMappings"]
    directories = [root / move["to"] for move in journal["moves"] if (root / move["to"]).is_dir()]
    # Knowledge source/config directories can contain links into moved checkouts
    # even though those directories themselves were not moved.
    for move in journal["moves"]:
        parts = Path(move["to"]).parts
        if len(parts) > 2 and parts[0] == "games":
            game_root = root / parts[0] / parts[1]
            if game_root not in directories:
                directories.append(game_root)
    directories = [path for path in directories if not any(path != other and migration.within(path, other) for other in directories)]
    if scopes:
        selected = [migration.owned_path(root, scope) for scope in scopes]
        if any(not any(migration.within(path, allowed) for allowed in directories) for path in selected):
            raise ValueError("Repair scope must remain within migrated game/runtime directories")
        directories = selected
    scanned, proposed, unchanged, unresolved_count, unresolved = 0, 0, 0, 0, []
    already = {entry["path"]: entry for entry in journal.get("symlinkRewrites", [])}
    for directory in directories:
        for path in iter_asset_links(directory):
            scanned += 1
            target = os.readlink(path)
            relative_path = str(path.relative_to(root))
            if relative_path in already and target == already[relative_path]["newTarget"]:
                unchanged += 1
                continue
            updated = next_link_target(path, target, mappings)
            if updated == target:
                unchanged += 1
                continue
            destination = Path(updated) if os.path.isabs(updated) else path.parent / updated
            if not destination.exists():
                unresolved_count += 1
                if len(unresolved) < 100:
                    unresolved.append({"path": relative_path, "target": target, "proposedTarget": updated})
                continue
            proposed += 1
            if apply:
                record = {"path": relative_path, "target": target, "newTarget": updated}
                journal.setdefault("symlinkRewrites", []).append(record)
                migration.save_journal(journal_path, journal)
                temporary = path.with_name(f".{path.name}.layout-repair-{os.getpid()}")
                temporary.symlink_to(updated)
                os.replace(temporary, path)
    return {"scanned": scanned, "repaired" if apply else "proposed": proposed, "unchanged": unchanged, "unresolved": unresolved_count, "unresolvedExamples": unresolved}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--journal", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--scope", action="append", help="Optional relative subtree for immediate checkout repair")
    args = parser.parse_args()
    print(json.dumps(repair(args.journal, args.apply, args.scope), indent=2))
