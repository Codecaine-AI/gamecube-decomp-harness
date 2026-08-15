#!/usr/bin/env python3
"""Pull every enabled Discord channel configured for the raw archive.

Channels resume from their on-disk archives by default. Use
--since-yesterday for an overlapping daily refresh from 00:00 UTC yesterday;
pull_channel.py deduplicates messages already present on disk.

Usage:
  python3 commands/pull_all.py
  python3 commands/pull_all.py --since-yesterday
  python3 commands/pull_all.py --token-env DISCORD_TOKEN --user-token
"""

import argparse
import json
import os
import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parent.parent
CONFIG = SOURCE_DIR / "config" / "channels.json"
DISCORD_EPOCH_MS = 1420070400000


def yesterday_snowflake(now=None):
    """Return the Discord snowflake for 00:00 UTC yesterday."""
    now = now or datetime.now(timezone.utc)
    yesterday = now.astimezone(timezone.utc).date() - timedelta(days=1)
    midnight = datetime.combine(yesterday, time.min, tzinfo=timezone.utc)
    unix_ms = int(midnight.timestamp() * 1000)
    return str((unix_ms - DISCORD_EPOCH_MS) << 22)


def load_channels():
    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)
    channels = config.get("channels")
    if not isinstance(channels, list):
        raise ValueError(f"{CONFIG} must contain a channels list")
    return channels


def main():
    ap = argparse.ArgumentParser(
        description="Pull every enabled channel in config/channels.json."
    )
    ap.add_argument(
        "--since-yesterday",
        action="store_true",
        help="pull from 00:00 UTC yesterday instead of resuming",
    )
    ap.add_argument(
        "--token-env",
        default="DISCORD_TOKEN",
        help="environment variable containing the Discord token (default: DISCORD_TOKEN)",
    )
    ap.add_argument(
        "--user-token",
        action="store_true",
        help="send the token directly instead of using Bot authentication",
    )
    args = ap.parse_args()

    try:
        configured = load_channels()
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: cannot load channel config: {exc}", file=sys.stderr)
        return 1

    channels = []
    for channel in configured:
        if channel.get("enabled") is not True:
            continue
        channel_id = channel.get("id", "")
        if "TODO" in channel_id:
            name = channel.get("name", channel_id)
            print(f"warning: skipping {name}: placeholder channel id {channel_id}",
                  file=sys.stderr)
            continue
        channels.append(channel)

    token = os.environ.get(args.token_env)
    if not token:
        print(f"error: environment variable {args.token_env} is not set", file=sys.stderr)
        return 2

    if not channels:
        return 0

    if __package__:
        from . import pull_channel
    else:
        import pull_channel

    after = yesterday_snowflake() if args.since_yesterday else None
    for channel in channels:
        pull_channel.run_pull(
            channel_id=channel["id"],
            after=after,
            token=token,
            user_token=args.user_token,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
