import json
import tempfile
import unittest
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from commands import pull_channel


FIXTURE = Path(__file__).parent / "fixtures" / "pages.json"


class PullChannelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pages = json.loads(FIXTURE.read_text(encoding="utf-8"))["pages"]

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)
        self.source_dir = self.root / "source"
        self.out_dir = self.root / "raw" / "channel-1"
        source_patch = mock.patch.object(pull_channel, "SOURCE_DIR", self.source_dir)
        source_patch.start()
        self.addCleanup(source_patch.stop)

    def _page_transport(self, calls):
        pages = iter(self.pages)

        def transport(url, headers):
            calls.append((url, headers))
            return 200, {}, next(pages)

        return transport

    @staticmethod
    def _query(url):
        return urllib.parse.parse_qs(urllib.parse.urlparse(url).query)

    @staticmethod
    def _read_jsonl(path):
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

    def test_paginate_writes_ascending_monthly_jsonl(self):
        calls = []
        with mock.patch.object(pull_channel, "http_get_json",
                               side_effect=self._page_transport(calls)):
            pull_channel.run_pull(
                "channel-1",
                after="0",
                limit_per_page=3,
                out_dir=self.out_dir,
                token="test-token",
            )

        self.assertEqual([self._query(url)["after"][0] for url, _ in calls],
                         ["0", "1003"])
        self.assertTrue(all(self._query(url)["limit"] == ["3"] for url, _ in calls))
        self.assertTrue(all("/channels/channel-1/messages" in url for url, _ in calls))
        self.assertTrue(all(headers["Authorization"] == "Bot test-token"
                            for _, headers in calls))

        january = self._read_jsonl(self.out_dir / "2024-01.jsonl")
        february = self._read_jsonl(self.out_dir / "2024-02.jsonl")
        self.assertEqual(
            {path.name for path in self.out_dir.glob("*.jsonl")},
            {"2024-01.jsonl", "2024-02.jsonl"},
        )
        self.assertEqual([record["id"] for record in january], ["1001", "1002"])
        self.assertEqual([record["id"] for record in february],
                         ["1003", "1004", "1005"])
        canonical_fields = {
            "id", "channel_id", "author", "author_id", "timestamp", "content",
            "reply_to", "attachments", "reactions",
        }
        for record in january + february:
            self.assertEqual(set(record), canonical_fields)
        self.assertEqual(january[1], {
            "id": "1002",
            "channel_id": "channel-1",
            "author": "bravo",
            "author_id": "u2",
            "timestamp": "2024-01-31T23:59:59+00:00",
            "content": "reply",
            "reply_to": "999",
            "attachments": [{
                "filename": "notes.txt",
                "url": "https://cdn.discordapp.com/notes.txt",
                "content_type": "text/plain",
                "size": 12,
            }],
            "reactions": [{"emoji": "👍", "count": 2}],
        })
        self.assertEqual(february[1]["attachments"], [{
            "filename": "image.png",
            "url": "https://cdn.discordapp.com/image.png",
            "content_type": None,
            "size": None,
        }])
        self.assertEqual(february[0]["reactions"], [{"emoji": "wave", "count": 3}])
        self.assertIsNone(february[0]["reply_to"])
        state_path = self.source_dir / "data" / "state" / "channel-1.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        self.assertEqual(state["last_message_id"], "1005")
        self.assertEqual(state["messages_written_last_pull"], 5)
        pulled_at = datetime.fromisoformat(state["last_pull_at"])
        self.assertEqual(pulled_at.utcoffset(), timedelta(0))

    def test_resume_uses_max_on_disk_id_as_after(self):
        self.out_dir.mkdir(parents=True)
        (self.out_dir / "2024-01.jsonl").write_text(
            json.dumps({"id": "9"}) + "\n", encoding="utf-8")
        (self.out_dir / "2024-02.jsonl").write_text(
            json.dumps({"id": "100"}) + "\n", encoding="utf-8")
        calls = []

        def transport(url, headers):
            calls.append((url, headers))
            return 200, {}, []

        with mock.patch.object(pull_channel, "http_get_json", side_effect=transport):
            pull_channel.run_pull(
                "channel-1", out_dir=self.out_dir, token="test-token")

        self.assertEqual(self._query(calls[0][0])["after"], ["100"])

    def test_overlapping_rerun_is_idempotent(self):
        for _ in range(2):
            calls = []
            with mock.patch.object(pull_channel, "http_get_json",
                                   side_effect=self._page_transport(calls)):
                pull_channel.run_pull(
                    "channel-1",
                    after="0",
                    limit_per_page=3,
                    out_dir=self.out_dir,
                    token="test-token",
                )
            if _ == 0:
                first_run = {
                    path.name: path.read_bytes()
                    for path in self.out_dir.glob("*.jsonl")
                }

        second_run = {
            path.name: path.read_bytes()
            for path in self.out_dir.glob("*.jsonl")
        }
        self.assertEqual(second_run, first_run)
        ids = [record["id"] for path in sorted(self.out_dir.glob("*.jsonl"))
               for record in self._read_jsonl(path)]
        self.assertEqual(sorted(ids, key=int), ["1001", "1002", "1003", "1004", "1005"])
        state_path = self.source_dir / "data" / "state" / "channel-1.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        self.assertEqual(state["messages_written_last_pull"], 0)

    def test_429_retries_same_request_after_sleep(self):
        calls = []
        responses = iter([
            (429, {"Retry-After": "9"}, {"retry_after": 1.5}),
            (200, {}, []),
        ])

        def transport(url, headers):
            calls.append((url, headers))
            return next(responses)

        with mock.patch.object(pull_channel, "http_get_json", side_effect=transport), \
                mock.patch.object(pull_channel.time, "sleep") as sleep:
            pull_channel.run_pull(
                "channel-1", after="0", out_dir=self.out_dir, token="test-token")

        self.assertEqual(calls[0], calls[1])
        sleep.assert_called_once_with(1.75)

    def test_iso8601_after_converts_to_exact_snowflake(self):
        calls = []

        def transport(url, headers):
            calls.append((url, headers))
            return 200, {}, []

        with mock.patch.object(pull_channel, "http_get_json", side_effect=transport):
            pull_channel.run_pull(
                "channel-1",
                after="2024-01-01T00:00:00Z",
                out_dir=self.out_dir,
                token="test-token",
            )

        self.assertEqual(self._query(calls[0][0])["after"],
                         ["1191168914227200000"])


if __name__ == "__main__":
    unittest.main()
