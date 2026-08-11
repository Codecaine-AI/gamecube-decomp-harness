import io
import json
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from commands import sync_via_discord_cli


SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL DEFAULT 'discord',
    guild_id TEXT, guild_name TEXT,
    channel_id TEXT NOT NULL, channel_name TEXT,
    msg_id TEXT NOT NULL,
    sender_id TEXT, sender_name TEXT,
    content TEXT,
    timestamp TEXT NOT NULL,
    raw_json TEXT,
    UNIQUE(platform, channel_id, msg_id)
);
"""


class SyncWrapperTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.source_dir = self.root / "source"
        self.out_dir = self.root / "raw" / "channel-1"
        self.db_path = self.root / "messages.db"
        source_patch = mock.patch.object(
            sync_via_discord_cli, "SOURCE_DIR", self.source_dir)
        source_patch.start()
        self.addCleanup(source_patch.stop)
        self._create_database()

    @staticmethod
    def _raw_message(message_id, timestamp, author, author_id, content,
                     reply_to=None, attachments=None, reactions=None):
        message = {
            "id": message_id,
            "author": {"username": author, "id": author_id},
            "timestamp": timestamp,
            "content": content,
            "attachments": attachments or [],
            "reactions": reactions or [],
        }
        if reply_to is not None:
            message["message_reference"] = {"message_id": reply_to}
        return message

    def _create_database(self):
        january = self._raw_message(
            "1001",
            "2024-01-31T23:59:58+00:00",
            "alpha",
            "user-1",
            "first",
        )
        february = self._raw_message(
            "1002",
            "2024-02-01T00:00:01+00:00",
            "bravo",
            "user-2",
            "reply with evidence",
            reply_to="999",
            attachments=[{
                "filename": "notes.txt",
                "url": "https://cdn.discordapp.com/notes.txt",
                "content_type": "text/plain",
                "size": 42,
            }],
            reactions=[
                {"emoji": {"name": "👍"}, "count": 3},
                {"emoji": {"name": "wave"}, "count": 1},
            ],
        )
        other_channel = self._raw_message(
            "9000",
            "2024-02-02T00:00:00+00:00",
            "ignored",
            "user-9",
            "must not be archived",
        )
        rows = [
            ("channel-1", "general", "1002", "flat-2", "flat bravo",
             "ignored flat content", "2024-02-01T00:00:01+00:00",
             json.dumps(february)),
            ("channel-1", "general", "1001", "flat-1", "flat alpha",
             "ignored flat content", "2024-01-31T23:59:58+00:00",
             json.dumps(january)),
            ("channel-1", "general", "1003", "user-3", "charlie",
             None, "2024-02-28T12:00:00Z", None),
            ("channel-2", "other", "9000", "user-9", "ignored",
             "must not be archived", "2024-02-02T00:00:00+00:00",
             json.dumps(other_channel)),
        ]
        with sqlite3.connect(self.db_path) as connection:
            connection.executescript(SCHEMA)
            connection.executemany(
                """
                INSERT INTO messages (
                    channel_id, channel_name, msg_id, sender_id, sender_name,
                    content, timestamp, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

    @staticmethod
    def _read_jsonl(path):
        return [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
        ]

    def test_convert_writes_canonical_monthly_jsonl_and_dedupes(self):
        first_written = sync_via_discord_cli.convert_db_to_jsonl(
            self.db_path, "channel-1", self.out_dir)

        self.assertEqual(first_written, 3)
        self.assertEqual(
            {path.name for path in self.out_dir.glob("*.jsonl")},
            {"2024-01.jsonl", "2024-02.jsonl"},
        )
        january = self._read_jsonl(self.out_dir / "2024-01.jsonl")
        february = self._read_jsonl(self.out_dir / "2024-02.jsonl")
        self.assertEqual([record["id"] for record in january], ["1001"])
        self.assertEqual([record["id"] for record in february], ["1002", "1003"])

        canonical_fields = {
            "id", "channel_id", "author", "author_id", "timestamp", "content",
            "reply_to", "attachments", "reactions",
        }
        for record in january + february:
            self.assertEqual(set(record), canonical_fields)
            self.assertEqual(record["channel_id"], "channel-1")

        self.assertEqual(february[0], {
            "id": "1002",
            "channel_id": "channel-1",
            "author": "bravo",
            "author_id": "user-2",
            "timestamp": "2024-02-01T00:00:01+00:00",
            "content": "reply with evidence",
            "reply_to": "999",
            "attachments": [{
                "filename": "notes.txt",
                "url": "https://cdn.discordapp.com/notes.txt",
                "content_type": "text/plain",
                "size": 42,
            }],
            "reactions": [
                {"emoji": "👍", "count": 3},
                {"emoji": "wave", "count": 1},
            ],
        })
        self.assertEqual(february[1], {
            "id": "1003",
            "channel_id": "channel-1",
            "author": "charlie",
            "author_id": "user-3",
            "timestamp": "2024-02-28T12:00:00Z",
            "content": "",
            "reply_to": None,
            "attachments": [],
            "reactions": [],
        })
        all_ids = [record["id"] for record in january + february]
        self.assertNotIn("9000", all_ids)

        first_contents = {
            path.name: path.read_bytes()
            for path in self.out_dir.glob("*.jsonl")
        }
        second_written = sync_via_discord_cli.convert_db_to_jsonl(
            self.db_path, "channel-1", self.out_dir)
        second_contents = {
            path.name: path.read_bytes()
            for path in self.out_dir.glob("*.jsonl")
        }
        self.assertEqual(second_written, 0)
        self.assertEqual(second_contents, first_contents)

        state_path = self.source_dir / "data" / "state" / "channel-1.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        self.assertEqual(set(state), {
            "last_pull_at", "last_message_id", "messages_written_last_pull",
            "engine",
        })
        self.assertEqual(state["last_message_id"], "1003")
        self.assertEqual(state["messages_written_last_pull"], 0)
        self.assertEqual(state["engine"], "discord_cli")
        pulled_at = datetime.fromisoformat(state["last_pull_at"])
        self.assertEqual(pulled_at.utcoffset(), timedelta(0))

    def test_help_does_not_resolve_binary_or_start_subprocess(self):
        stdout = io.StringIO()
        with mock.patch.object(sync_via_discord_cli.shutil, "which") as which, \
                mock.patch.object(sync_via_discord_cli.subprocess, "run") as run, \
                redirect_stdout(stdout), \
                self.assertRaises(SystemExit) as raised:
            sync_via_discord_cli.main(["--help"])

        self.assertEqual(raised.exception.code, 0)
        self.assertIn("--since-yesterday", stdout.getvalue())
        which.assert_not_called()
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
