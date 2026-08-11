#!/usr/bin/env python3
"""Sync configured Discord channels with discord-cli and archive JSONL.

discord-cli stores messages in SQLite; this wrapper converts those rows into
the same timestamped monthly JSONL layout as the direct API puller.

Usage:
  python3 commands/sync_via_discord_cli.py
  python3 commands/sync_via_discord_cli.py --bootstrap
  python3 commands/sync_via_discord_cli.py --since-yesterday
  python3 commands/sync_via_discord_cli.py --skip-sync --db /path/to/messages.db
"""

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from . import pull_channel
else:
    import pull_channel


SOURCE_DIR = Path(__file__).resolve().parent.parent
CONFIG = SOURCE_DIR / "config" / "channels.json"
DEFAULT_LIMIT = 5000
BOOTSTRAP_LIMIT = 1000000


def _db_path(override=None):
    if override is not None:
        return Path(override).expanduser()
    configured = os.environ.get("DB_PATH")
    if configured:
        return Path(configured).expanduser()
    data_dir = os.environ.get("DATA_DIR")
    if data_dir:
        return Path(data_dir).expanduser() / "messages.db"
    return Path.home() / ".local" / "share" / "discord-cli" / "messages.db"


def _load_channels():
    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    channels = config.get("channels")
    if not isinstance(channels, list):
        raise ValueError(f"{CONFIG} must contain a channels list")
    return channels


def _enabled_channels(configured):
    channels = []
    for channel in configured:
        if channel.get("enabled") is not True:
            continue
        channel_id = str(channel.get("id", ""))
        if "TODO" in channel_id:
            name = channel.get("name", channel_id)
            print(f"warning: skipping {name}: placeholder channel id {channel_id}",
                  file=sys.stderr)
            continue
        channels.append(channel)
    return channels


def _message_from_row(row):
    msg_id, sender_id, sender_name, content, timestamp, raw_json = row
    if raw_json is not None:
        message = json.loads(raw_json)
        if not isinstance(message, dict):
            raise ValueError(f"raw_json for message {msg_id} is not an object")
        message["id"] = str(msg_id)
        return message
    return {
        "id": str(msg_id),
        "author": {
            "username": sender_name or "",
            "id": str(sender_id or ""),
        },
        "timestamp": timestamp,
        "content": content or "",
        "message_reference": None,
        "attachments": [],
        "reactions": [],
    }


def _write_state(channel_id, last_message_id, messages_written):
    state_dir = SOURCE_DIR / "data" / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    state = {
        "last_pull_at": datetime.now(timezone.utc).isoformat(),
        "last_message_id": last_message_id,
        "messages_written_last_pull": messages_written,
        "engine": "discord_cli",
    }
    path = state_dir / f"{channel_id}.json"
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    return state


def convert_db_to_jsonl(db_path, channel_id, out_dir):
    """Convert one channel from a discord-cli SQLite DB; return new rows."""
    db_path = Path(db_path)
    channel_id = str(channel_id)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    query = """
        SELECT msg_id, sender_id, sender_name, content, timestamp, raw_json
        FROM messages
        WHERE channel_id = ?
        ORDER BY CAST(msg_id AS INTEGER) ASC
    """
    uri = db_path.resolve().as_uri() + "?mode=ro"
    written = 0
    last_message_id = None
    known_ids = {}
    with sqlite3.connect(uri, uri=True) as connection:
        cursor = connection.execute(query, (channel_id,))
        while True:
            rows = cursor.fetchmany(1000)
            if not rows:
                break
            messages = [_message_from_row(row) for row in rows]
            written += pull_channel._append_page(
                messages, channel_id, out_dir, known_ids)
            last_message_id = str(rows[-1][0])

    _write_state(channel_id, last_message_id, written)
    return written


def _parser():
    ap = argparse.ArgumentParser(
        description=(
            "Sync enabled channels with discord-cli, then convert its SQLite "
            "messages to monthly JSONL."
        )
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"messages requested per channel sync (default: {DEFAULT_LIMIT})",
    )
    ap.add_argument(
        "--bootstrap",
        action="store_true",
        help=f"full-history backfill using a sync limit of {BOOTSTRAP_LIMIT}",
    )
    ap.add_argument(
        "--skip-sync",
        action="store_true",
        help="skip discord-cli and only convert an existing SQLite database",
    )
    ap.add_argument(
        "--since-yesterday",
        action="store_true",
        help=(
            "cron-parity flag; performs normal incremental sync with no date "
            "filter (conversion dedupes existing messages)"
        ),
    )
    ap.add_argument(
        "--db",
        type=Path,
        help=(
            "discord-cli SQLite path (default: DB_PATH, DATA_DIR/messages.db, "
            "or ~/.local/share/discord-cli/messages.db)"
        ),
    )
    return ap


def main(argv=None):
    args = _parser().parse_args(argv)

    try:
        configured = _load_channels()
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: cannot load channel config: {exc}", file=sys.stderr)
        return 1
    channels = _enabled_channels(configured)
    db_path = _db_path(args.db)

    if not args.skip_sync:
        discord = shutil.which("discord")
        if discord is None:
            print(
                "error: discord-cli is not installed; install it with "
                "'pipx install kabi-discord-cli' and see README.md for setup.",
                file=sys.stderr,
            )
            return 2

        sync_limit = BOOTSTRAP_LIMIT if args.bootstrap else args.limit
        sync_env = os.environ.copy()
        sync_env["DB_PATH"] = str(db_path)
        # discord-cli only loads .env from its cwd; `discord auth --save` writes
        # the token to its data dir instead. Load it into the subprocess env so
        # the token never lives in this repo.
        if "DISCORD_TOKEN" not in sync_env:
            token_env = Path("~/.local/share/discord-cli/.env").expanduser()
            if token_env.is_file():
                for line in token_env.read_text().splitlines():
                    key, sep, value = line.partition("=")
                    if sep and key.strip() == "DISCORD_TOKEN":
                        sync_env["DISCORD_TOKEN"] = value.strip().strip('"')
                        break
        for channel in channels:
            channel_id = str(channel["id"])
            result = subprocess.run(
                # `dc sync` is incremental-forward only; full history needs `dc history`.
                [discord, "dc", "history" if args.bootstrap else "sync", channel_id, "-n", str(sync_limit)],
                check=False,
                env=sync_env,
            )
            if result.returncode != 0:
                print(
                    f"warning: discord-cli sync failed for channel {channel_id} "
                    f"with exit code {result.returncode}; continuing",
                    file=sys.stderr,
                )
                continue

    if not db_path.is_file():
        print(
            f"error: discord-cli database not found at {db_path}; run "
            "'discord auth --save' and sync first, or pass --db PATH.",
            file=sys.stderr,
        )
        return 2

    for channel in channels:
        channel_id = str(channel["id"])
        out_dir = SOURCE_DIR / "data" / "raw" / channel_id
        written = convert_db_to_jsonl(db_path, channel_id, out_dir)
        print(f"converted channel {channel_id}: wrote {written} messages",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
