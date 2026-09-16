#!/usr/bin/env python3
"""Offline, journaled layout migration. Dry-run by default; never opens SQLite.

Manifest: {"moves": [{"from": "old/path", "to": "new/path"}],
           "rewriteJson": ["new/control.json"],
           "rewriteGitPointers": ["new/checkout/.git/worktrees/name/gitdir"]}
Only explicit JSON string path prefixes and Git pointer files are rewritten.
Historical trace/evidence payloads and database rows remain byte-for-byte intact.
The journal's pathMappings is intended for the separate database cutover step.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def within(path, parent):
    return path == parent or parent in path.parents


def owned_path(root, value):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError("Manifest paths must be nonempty relative paths")
    path = root / value
    if ".." in Path(value).parts or not within(path.resolve(), root):
        raise ValueError(f"Path escapes workspace: {value}")
    if path == root:
        raise ValueError("Cannot migrate the workspace root")
    return path


def exists(path):
    return path.exists() or path.is_symlink()


def make_plan(root, manifest):
    moves = []
    seen = set()
    for move in manifest.get("moves", []):
        source, target = owned_path(root, move["from"]), owned_path(root, move["to"])
        if source in seen:
            raise ValueError(f"Duplicate source: {move['from']}")
        seen.add(source)
        if source == target or within(target, source):
            raise ValueError(f"Invalid nested destination: {move['to']}")
        if exists(target):
            raise ValueError(f"Destination already exists: {move['to']}")
        if not exists(source):
            raise ValueError(f"Source missing: {move['from']}")
        if source.is_symlink():
            raise ValueError(f"Move the actual source, not a symlink: {move['from']}")
        moves.append({"from": str(source.relative_to(root)), "to": str(target.relative_to(root))})
    destinations = [root / move["to"] for move in moves]
    if len(set(destinations)) != len(destinations):
        raise ValueError("Duplicate destination")
    for target in destinations:
        if any(within(target, source) for source in seen):
            raise ValueError("Destinations must be outside every source tree")
    # Carve tools/artifacts out of a state tree before moving the remaining tree.
    moves.sort(key=lambda move: len(Path(move["from"]).parts), reverse=True)
    for key in ("rewriteJson", "rewriteGitPointers"):
        for path in manifest.get(key, []):
            owned_path(root, path)
    mappings = [{"from": str(root / move["from"]), "to": str(root / move["to"])} for move in moves]
    for mapping in manifest.get("pathAliases", []):
        if not all(isinstance(mapping.get(key), str) and mapping[key] for key in ("from", "to")):
            raise ValueError("Path aliases require nonempty from/to strings")
        mappings.append({"from": mapping["from"], "to": mapping["to"]})
    mappings.sort(key=lambda mapping: len(mapping["from"]), reverse=True)
    return {"version": 1, "root": str(root), "moves": moves,
            "rewriteJson": manifest.get("rewriteJson", []),
            "rewriteGitPointers": manifest.get("rewriteGitPointers", []), "pathMappings": mappings}


def open_source_files(root, moves):
    """Fail closed when lsof is unavailable; output only affected pid/path pairs."""
    result = subprocess.run(["lsof", "-nP", "-Fpfan"], capture_output=True, text=True)
    if result.returncode not in (0, 1):
        raise RuntimeError("Cannot establish open-file inventory with lsof")
    roots = [root / move["from"] for move in moves]
    found, pid, descriptor = [], None, ""
    for line in result.stdout.splitlines():
        if line.startswith("p"):
            pid = int(line[1:])
        elif line.startswith("f"):
            descriptor = line[1:]
        elif line.startswith("n") and descriptor[:1].isdigit() and pid != os.getpid():
            path = Path(line[1:])
            if path.is_absolute() and any(within(path, source) for source in roots):
                found.append({"pid": pid, "path": str(path)})
    return found


def save_journal(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    fd = os.open(temporary, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(value, output, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def copy_backup(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    # APFS clone preserves large trace databases without another full disk copy.
    if sys.platform == "darwin":
        clone = subprocess.run(["cp", "-cRp", str(source), str(target)], capture_output=True)
        if clone.returncode == 0:
            return
        if exists(target):
            raise RuntimeError(f"Partial backup retained after clone failure: {target}")
    if source.is_dir():
        shutil.copytree(source, target, symlinks=True)
    else:
        shutil.copy2(source, target, follow_symlinks=False)


def rewrite_value(value, mappings):
    if isinstance(value, str):
        for mapping in mappings:
            if value == mapping["from"] or value.startswith(mapping["from"] + "/"):
                return mapping["to"] + value[len(mapping["from"]):]
        return value
    if isinstance(value, list):
        return [rewrite_value(item, mappings) for item in value]
    if isinstance(value, dict):
        return {key: rewrite_value(item, mappings) for key, item in value.items()}
    return value


def apply_plan(plan, backup_dir):
    root = Path(plan["root"])
    if within(backup_dir.resolve(), root):
        raise ValueError("Backup directory must be outside the workspace")
    if exists(backup_dir):
        raise ValueError("Backup directory already exists; use its journal to recover")
    opened = open_source_files(root, plan["moves"])
    if opened:
        raise RuntimeError("Stop processes with open migration files: " + json.dumps(opened))
    backup_dir.mkdir(parents=True, mode=0o700)
    journal_path = backup_dir / "journal.json"
    journal = {**plan, "status": "backing_up", "backupDir": str(backup_dir), "applied": [], "rewrites": []}
    save_journal(journal_path, journal)
    sources = [root / move["from"] for move in plan["moves"]]
    for source in sources:
        if not any(source != other and within(source, other) for other in sources):
            copy_backup(source, backup_dir / "original" / source.relative_to(root))
    return finish_plan(plan, backup_dir, journal)


def finish_plan(plan, backup_dir, journal):
    """Finish a backed-up or explicitly retained rename-only plan."""
    root = Path(plan["root"])
    journal_path = backup_dir / "journal.json"
    opened = open_source_files(root, plan["moves"])
    if opened:
        raise RuntimeError("Files were reopened during backup; no moves started: " + json.dumps(opened))
    journal["status"] = "moving"
    save_journal(journal_path, journal)
    for move in plan["moves"]:
        source, target = root / move["from"], root / move["to"]
        if exists(target):
            raise RuntimeError(f"Destination appeared during migration: {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        journal["pendingMove"] = move
        save_journal(journal_path, journal)
        source.rename(target)
        journal["applied"].append(move)
        journal.pop("pendingMove", None)
        save_journal(journal_path, journal)
    mappings = plan["pathMappings"] + plan["moves"]
    for kind in ("rewriteJson", "rewriteGitPointers"):
        for relative_path in plan[kind]:
            path = root / relative_path
            contents = path.read_text()
            if kind == "rewriteJson":
                updated = json.dumps(rewrite_value(json.loads(contents), mappings), indent=2) + "\n"
            else:
                prefix = "gitdir: " if contents.startswith("gitdir: ") else ""
                updated = prefix + rewrite_value(contents.removeprefix(prefix).strip(), mappings) + "\n"
            if updated == contents:
                continue
            saved = backup_dir / "rewrites" / relative_path
            copy_backup(path, saved)
            journal["rewrites"].append(relative_path)
            save_journal(journal_path, journal)
            # Preserve permissions, especially for local config with credentials.
            with path.open("w") as output:
                output.write(updated)
                output.flush()
                os.fsync(output.fileno())
    journal["status"] = "complete"
    save_journal(journal_path, journal)
    return journal_path


def rollback(journal_path):
    journal = json.loads(journal_path.read_text())
    root, backup_dir = Path(journal["root"]), Path(journal["backupDir"])
    if journal["status"] == "rolled_back":
        return
    reversed_moves = [{"from": move["to"], "to": move["from"]} for move in journal["moves"]]
    if open_source_files(root, reversed_moves):
        raise RuntimeError("Stop processes with open migrated files before rollback")
    if not journal.get("rewritesRestored"):
        for path in reversed(journal["rewrites"]):
            shutil.copy2(backup_dir / "rewrites" / path, root / path)
        for entry in reversed(journal.get("symlinkRewrites", [])):
            path = root / entry["path"]
            temporary = path.with_name(f".{path.name}.layout-rollback-{os.getpid()}")
            temporary.symlink_to(entry["target"])
            os.replace(temporary, path)
        journal["rewritesRestored"] = True
        save_journal(journal_path, journal)
    applied = list(journal["applied"])
    pending = journal.get("pendingMove")
    if pending and exists(root / pending["to"]) and not exists(root / pending["from"]):
        applied.append(pending)
    for move in reversed(applied):
        if move in journal.get("rolledBackMoves", []):
            continue
        source, target = root / move["from"], root / move["to"]
        if journal.get("pendingRollback") == move and exists(source) and not exists(target):
            journal.setdefault("rolledBackMoves", []).append(move)
            journal.pop("pendingRollback", None)
            save_journal(journal_path, journal)
            continue
        if exists(source):
            raise RuntimeError(f"Rollback source already exists, refusing overwrite: {source}")
        source.parent.mkdir(parents=True, exist_ok=True)
        journal["pendingRollback"] = move
        save_journal(journal_path, journal)
        target.rename(source)
        journal.setdefault("rolledBackMoves", []).append(move)
        journal.pop("pendingRollback", None)
        save_journal(journal_path, journal)
    journal["status"] = "rolled_back"
    save_journal(journal_path, journal)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", type=Path)
    args = parser.parse_args()
    if args.rollback:
        rollback(args.rollback.resolve())
        print(json.dumps({"rolledBack": str(args.rollback)}))
        return
    if not args.manifest:
        parser.error("--manifest is required")
    plan = make_plan(args.root.resolve(), json.loads(args.manifest.read_text()))
    if args.apply:
        if not args.backup_dir:
            parser.error("--apply requires --backup-dir outside the workspace")
        print(json.dumps({"journal": str(apply_plan(plan, args.backup_dir.resolve()))}))
    else:
        print(json.dumps({**plan, "openFiles": open_source_files(Path(plan["root"]), plan["moves"])}, indent=2))


if __name__ == "__main__":
    main()
