import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('state_paths', Path(__file__).with_name('migrate-state-paths.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class StatePathsTest(unittest.TestCase):
    def test_archives_paths_preserves_events_and_replays_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            filename = Path(tmp) / 'state.sqlite'
            db = sqlite3.connect(filename)
            db.executescript('CREATE TABLE continuing_harness(game_id TEXT,state_json TEXT); CREATE TABLE runs(id TEXT,game_repo_root TEXT); CREATE TABLE game_events(payload_json TEXT);')
            payload = json.dumps({'path': '/old/work/active/file'})
            db.execute('INSERT INTO continuing_harness VALUES (?,?)', ('melee', payload))
            db.execute('INSERT INTO runs VALUES (?,?)', ('run', '/old/work/active'))
            db.execute('INSERT INTO game_events VALUES (?)', (payload,))
            db.commit()
            journal = {'status': 'complete', 'pathMappings': [{'from': '/old/work', 'to': '/new/staging'}, {'from': '/old/work/active', 'to': '/new/checkout'}]}
            self.assertEqual(module.migrate(filename, journal)['changedRows'], 2)
            self.assertEqual(db.execute('SELECT game_repo_root FROM runs').fetchone()[0], '/old/work/active')
            self.assertEqual(module.migrate(filename, journal, True)['changedRows'], 2)
            self.assertEqual(db.execute('SELECT game_repo_root FROM runs').fetchone()[0], '/new/checkout')
            self.assertEqual(db.execute('SELECT payload_json FROM game_events').fetchone()[0], payload)
            archived = json.loads(db.execute("SELECT original_json FROM historical_path_rows WHERE table_name='runs'").fetchone()[0])
            self.assertEqual(archived['game_repo_root'], '/old/work/active')
            self.assertTrue(module.migrate(filename, journal, True)['alreadyApplied'])
            db.close()

    def test_complete_filesystem_required_and_only_prefixes_change(self):
        with self.assertRaisesRegex(ValueError, 'Filesystem migration'):
            module.migrate('/unused', {'status': 'backing_up'})
        mappings = [('/old', '/new')]
        self.assertEqual(module.rewrite('/older/a', mappings), '/older/a')
        self.assertEqual(module.rewrite('narrative /old/a', mappings), 'narrative /old/a')
        self.assertEqual(module.rewrite({'paths': ['/old/a', 42]}, mappings), {'paths': ['/new/a', 42]})

if __name__ == '__main__':
    unittest.main()
