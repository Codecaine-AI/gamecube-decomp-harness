#!/usr/bin/env python3
"""Pull one Discord channel into timestamped monthly JSONL archives.

The command resumes from the highest message ID already present unless an
explicit ISO8601 timestamp or message ID is supplied with --after.

Usage:
  python3 commands/pull_channel.py --channel-id 123456789012345678
  python3 commands/pull_channel.py --channel-id 123456789012345678 --after 2024-01-01T00:00:00Z
  python3 commands/pull_channel.py --channel-id 123456789012345678 --user-token
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://discord.com/api/v10"
DISCORD_EPOCH_MS = 1420070400000
SOURCE_DIR = Path(__file__).resolve().parent.parent


def _decode_json(raw):
    if not raw:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def http_get_json(url, headers):
    """Return (status, response headers, decoded JSON body) for one GET."""
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = _decode_json(resp.read())
            return resp.status, dict(resp.headers.items()), body
    except urllib.error.HTTPError as exc:
        body = _decode_json(exc.read())
        response_headers = dict(exc.headers.items()) if exc.headers else {}
        return exc.code, response_headers, body


def _parse_iso8601(value):
    normalized = value[:-1] + "+00:00" if value.endswith(("Z", "z")) else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso8601_to_snowflake(value):
    parsed = _parse_iso8601(value)
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    delta = parsed - epoch
    unix_ms = (delta.days * 86400000
               + delta.seconds * 1000
               + delta.microseconds // 1000)
    return str((unix_ms - DISCORD_EPOCH_MS) << 22)


def _resolve_after(after):
    value = str(after).strip()
    return value if value.isdigit() else iso8601_to_snowflake(value)


def _max_id_on_disk(out_dir):
    maximum = None
    for path in sorted(out_dir.glob("*.jsonl")):
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                message_id = int(json.loads(line)["id"])
                maximum = message_id if maximum is None else max(maximum, message_id)
    return str(maximum) if maximum is not None else "0"


def _header(headers, name):
    wanted = name.lower()
    for key, value in headers.items():
        if key.lower() == wanted:
            return value
    return None


def _month_for_timestamp(timestamp):
    return _parse_iso8601(timestamp).strftime("%Y-%m")


def _canonical_record(message, channel_id):
    attachments = [
        {
            "filename": attachment["filename"],
            "url": attachment["url"],
            "content_type": attachment.get("content_type"),
            "size": attachment.get("size"),
        }
        for attachment in message.get("attachments", [])
    ]
    reactions = [
        {
            "emoji": reaction["emoji"]["name"],
            "count": reaction["count"],
        }
        for reaction in message.get("reactions", [])
    ]
    reference = message.get("message_reference") or {}
    return {
        "id": str(message["id"]),
        "channel_id": str(channel_id),
        "author": message["author"]["username"],
        "author_id": str(message["author"]["id"]),
        "timestamp": message["timestamp"],
        "content": message.get("content", ""),
        "reply_to": (str(reference["message_id"])
                     if reference.get("message_id") is not None else None),
        "attachments": attachments,
        "reactions": reactions,
    }


def _existing_ids(path):
    ids = set()
    if not path.exists():
        return ids
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                ids.add(str(json.loads(line)["id"]))
    return ids


def _append_page(page, channel_id, out_dir, known_ids):
    by_month = {}
    for message in sorted(page, key=lambda item: int(item["id"])):
        record = _canonical_record(message, channel_id)
        month = _month_for_timestamp(record["timestamp"])
        by_month.setdefault(month, []).append(record)

    written = 0
    for month in sorted(by_month):
        path = out_dir / f"{month}.jsonl"
        ids = known_ids.setdefault(path, _existing_ids(path))
        batch_ids = set(ids)
        new_records = []
        for record in by_month[month]:
            if record["id"] in batch_ids:
                continue
            new_records.append(record)
            batch_ids.add(record["id"])
        if not new_records:
            continue
        with open(path, "a", encoding="utf-8") as f:
            for record in new_records:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                ids.add(record["id"])
                written += 1
    return written


def _retry_delay(headers, body):
    if isinstance(body, dict) and body.get("retry_after") is not None:
        return float(body["retry_after"])
    retry_after = _header(headers, "Retry-After")
    if retry_after is None:
        raise RuntimeError("Discord returned 429 without a retry delay")
    return float(retry_after)


def _write_state(channel_id, last_message_id, messages_written):
    state_dir = SOURCE_DIR / "data" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    state = {
        "last_pull_at": datetime.now(timezone.utc).isoformat(),
        "last_message_id": last_message_id,
        "messages_written_last_pull": messages_written,
    }
    path = state_dir / f"{channel_id}.json"
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return state


def run_pull(channel_id, after=None, limit_per_page=100, out_dir=None,
             token=None, user_token=False):
    """Pull a channel and return the state record written at completion."""
    if not token:
        raise ValueError("token is required")

    channel_id = str(channel_id)
    out_dir = (Path(out_dir) if out_dir is not None
               else SOURCE_DIR / "data" / "raw" / channel_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    cursor = _max_id_on_disk(out_dir) if after is None else _resolve_after(after)
    last_message_id = None if cursor == "0" else cursor
    messages_written = 0
    known_ids = {}
    authorization = token if user_token else f"Bot {token}"
    request_headers = {"Authorization": authorization}

    while True:
        params = urllib.parse.urlencode({
            "limit": limit_per_page,
            "after": cursor,
        })
        channel_path = urllib.parse.quote(channel_id, safe="")
        url = f"{API}/channels/{channel_path}/messages?{params}"
        print(f"pulling channel {channel_id} after {cursor}...", file=sys.stderr)

        status, response_headers, body = http_get_json(url, request_headers)
        if status == 429:
            delay = _retry_delay(response_headers, body) + 0.25
            print(f"rate limited; retrying in {delay:.2f}s", file=sys.stderr)
            time.sleep(delay)
            continue
        if status < 200 or status >= 300:
            raise RuntimeError(f"Discord API returned HTTP {status}")
        if not isinstance(body, list):
            raise RuntimeError("Discord API returned a non-list message page")
        if not body:
            break

        page = sorted(body, key=lambda item: int(item["id"]))
        next_cursor = str(max(int(message["id"]) for message in page))
        messages_written += _append_page(page, channel_id, out_dir, known_ids)
        last_message_id = next_cursor
        print(f"  received {len(page)} messages; wrote {messages_written} total",
              file=sys.stderr)

        if len(page) < limit_per_page:
            break
        if int(next_cursor) <= int(cursor):
            raise RuntimeError("Discord pagination cursor did not advance")
        cursor = next_cursor

        if _header(response_headers, "X-RateLimit-Remaining") == "0":
            reset_after = _header(response_headers, "X-RateLimit-Reset-After")
            if reset_after is not None:
                time.sleep(float(reset_after))

    state = _write_state(channel_id, last_message_id, messages_written)
    print(f"finished channel {channel_id}: wrote {messages_written} messages",
          file=sys.stderr)
    return state


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel-id", required=True)
    ap.add_argument("--after", help="ISO8601 timestamp or message ID")
    ap.add_argument("--limit-per-page", type=int, default=100)
    ap.add_argument("--token-env", default="DISCORD_TOKEN",
                    help="name of the environment variable containing the token")
    ap.add_argument("--user-token", action="store_true")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args(argv)

    token = os.environ.get(args.token_env)
    if not token:
        ap.error(f"environment variable {args.token_env} is not set")

    run_pull(
        channel_id=args.channel_id,
        after=args.after,
        limit_per_page=args.limit_per_page,
        out_dir=args.out,
        token=token,
        user_token=args.user_token,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
