#!/usr/bin/env python3
"""One-time offline path migration after the continuing-harness schema cutover.

Raw event and Agent Kernel trace payloads are never rewritten. Every changed
application row is archived before update, together with the exact path map.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

# Mutable file references and durable workflow control. Event/trace tables are excluded.
COLUMNS = {
    'director_cycles': ['summary_path', 'decision_path'],
    'pi_sessions': ['session_file', 'output_path'],
    'leases': ['worktree_path'],
    'worker_reports': ['summary_path', 'facts_path', 'blocker_path', 'patch_path'],
    'attempts': ['artifact_path'],
    'run_checkpoints': ['artifact_dir', 'summary_path', 'pr_candidates_path', 'carry_forward_path'],
    'save_points': ['report_path', 'report_changes_path', 'board_snapshot_path', 'artifact_dir', 'payload_json'],
    'dashboard_artifacts': ['source_path', 'payload_json'],
    'checkpoint_items': ['patch_path', 'summary_path', 'evidence_json'],
    'target_claims': ['worktree_path'],
    'worker_state': ['artifact_dir', 'worktree_path', 'summary_json'],
    'worker_checkpoints': ['artifact_path', 'patch_path', 'diff_path', 'metadata_json'],
    'worker_output_integrations': ['patch_path', 'diff_path', 'item_path', 'summary_path', 'check_stdout_path', 'check_stderr_path', 'apply_stdout_path', 'apply_stderr_path', 'metadata_json'],
    'runs': ['game_repo_root', 'game_state_dir', 'game_graph_db', 'game_descriptor_path', 'game_local_override_path', 'configuration_snapshot_json'],
    'sync_state': ['staging_json', 'validation_evidence_json'],
    'jobs': ['payload_json'],
    'integration_outcomes': ['patch_path', 'diff_path', 'item_path', 'summary_path', 'check_stdout_path', 'check_stderr_path', 'apply_stdout_path', 'apply_stderr_path', 'metadata_json'],
    'continuing_harness': ['state_json'],
}

def rewrite(value, mappings):
    if isinstance(value, str):
        for old, new in mappings:
            if value == old or value.startswith(old + '/'):
                return new + value[len(old):]
        return value
    if isinstance(value, list):
        return [rewrite(item, mappings) for item in value]
    if isinstance(value, dict):
        return {key: rewrite(item, mappings) for key, item in value.items()}
    return value

def rewrite_column(value, mappings):
    if not isinstance(value, str):
        return value
    try:
        decoded = json.loads(value)
    except (ValueError, TypeError):
        return rewrite(value, mappings)
    updated = rewrite(decoded, mappings)
    return value if updated == decoded else json.dumps(updated, separators=(',', ':'))

def migrate(database, journal, apply=False):
    if journal.get('status') != 'complete':
        raise ValueError('Filesystem migration must be complete before database paths change')
    mappings = sorted(((x['from'], x['to']) for x in journal['pathMappings']), key=lambda x: -len(x[0]))
    identity = hashlib.sha256(json.dumps(mappings, separators=(',', ':')).encode()).hexdigest()
    db = sqlite3.connect(str(database) if apply else 'file:' + str(database) + '?mode=ro', uri=not apply)
    db.row_factory = sqlite3.Row
    try:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'cycles' in tables or 'continuing_harness' not in tables:
            raise ValueError('Apply the continuing-harness schema cutover first')
        if 'historical_path_migrations' in tables:
            prior = db.execute('SELECT mapping_id FROM historical_path_migrations').fetchall()
            if prior:
                if len(prior) != 1 or prior[0][0] != identity:
                    raise ValueError('A different path migration was already applied')
                return {'alreadyApplied': True, 'mappingId': identity}
        changes = []
        for table, allowed in COLUMNS.items():
            if table not in tables:
                continue
            columns = {r['name'] for r in db.execute('PRAGMA table_info("' + table + '")')}
            selected = [name for name in allowed if name in columns]
            for row in db.execute('SELECT rowid AS __rowid__, * FROM "' + table + '"'):
                original = dict(row)
                updates = {name: rewrite_column(row[name], mappings) for name in selected}
                updates = {name: value for name, value in updates.items() if value != row[name]}
                if updates:
                    changes.append((table, original, updates))
        counts = {}
        for table, _, _ in changes:
            counts[table] = counts.get(table, 0) + 1
        if apply:
            with db:
                db.execute('CREATE TABLE historical_path_migrations (mapping_id TEXT PRIMARY KEY, mappings_json TEXT NOT NULL)')
                db.execute('CREATE TABLE historical_path_rows (table_name TEXT NOT NULL, original_rowid INTEGER NOT NULL, original_json TEXT NOT NULL, updated_columns_json TEXT NOT NULL, PRIMARY KEY(table_name, original_rowid))')
                db.execute('INSERT INTO historical_path_migrations VALUES (?, ?)', (identity, json.dumps(mappings)))
                for table, original, updates in changes:
                    rowid = original.pop('__rowid__')
                    db.execute('INSERT INTO historical_path_rows VALUES (?, ?, ?, ?)', (table, rowid, json.dumps(original, separators=(',', ':')), json.dumps(updates, separators=(',', ':'))))
                    assignments = ','.join('"' + name + '"=?' for name in updates)
                    db.execute('UPDATE "' + table + '" SET ' + assignments + ' WHERE rowid=?', [*updates.values(), rowid])
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Integrity check failed')
            if db.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Foreign-key check failed')
        return {'mode': 'apply' if apply else 'preview', 'mappingId': identity, 'changedRows': len(changes), 'tables': counts}
    finally:
        db.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--journal', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(migrate(args.database.resolve(), json.loads(args.journal.read_text()), args.apply), indent=2))
