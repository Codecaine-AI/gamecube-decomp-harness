#!/usr/bin/env python3
"""Show local Discord archive status or validate its configuration.

The default report combines configured channels with any additional channel
directories already present under data/raw/. Configuration checks are local
only: tokens are read from the process environment and their values are never
printed.

Usage:
  python3 commands/status.py
  python3 commands/status.py --json
  python3 commands/status.py --dry-run-config
  python3 commands/status.py --dry-run-config --token-env DISCORD_USER_TOKEN
"""

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = SOURCE_DIR / "config" / "channels.json"
RAW_DIR = SOURCE_DIR / "data" / "raw"
STATE_DIR = SOURCE_DIR / "data" / "state"


class ConfigError(ValueError):
    """A missing, unreadable, or schema-invalid channels configuration."""


def load_config(path):
    if not path.is_file():
        raise ConfigError(f"missing config file: {path}")

    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ConfigError(f"could not parse {path}: {exc}") from exc

    if not isinstance(config, dict):
        raise ConfigError("config root must be a JSON object")

    required = {"_readme", "guild_id", "channels"}
    missing = sorted(required - config.keys())
    if missing:
        raise ConfigError(f"config missing required key(s): {', '.join(missing)}")
    if not isinstance(config["_readme"], str):
        raise ConfigError("config key '_readme' must be a string")
    if not isinstance(config["guild_id"], str):
        raise ConfigError("config key 'guild_id' must be a string")
    if not isinstance(config["channels"], list):
        raise ConfigError("config key 'channels' must be a list")
    if config.get("engine", "discord_cli") not in ("discord_cli", "direct_api"):
        raise ConfigError(
            "config key 'engine' must be one of: discord_cli, direct_api"
        )

    channel_keys = {"id", "name", "enabled"}
    for index, channel in enumerate(config["channels"]):
        label = f"channels[{index}]"
        if not isinstance(channel, dict):
            raise ConfigError(f"{label} must be an object")
        missing = sorted(channel_keys - channel.keys())
        if missing:
            raise ConfigError(f"{label} missing required key(s): {', '.join(missing)}")
        if not isinstance(channel["id"], str):
            raise ConfigError(f"{label}.id must be a string")
        if not isinstance(channel["name"], str):
            raise ConfigError(f"{label}.name must be a string")
        if not isinstance(channel["enabled"], bool):
            raise ConfigError(f"{label}.enabled must be a boolean")

    return config


def is_placeholder(value):
    return isinstance(value, str) and "TODO" in value.upper()


def placeholder_fields(config):
    fields = []
    if is_placeholder(config["guild_id"]):
        fields.append("guild_id")
    for index, channel in enumerate(config["channels"]):
        for key in ("id", "name"):
            if is_placeholder(channel[key]):
                fields.append(f"channels[{index}].{key}")
    return fields


def dry_run_config(token_env, as_json=False):
    token_status = "present" if token_env in os.environ else "missing"
    discord_cli_installed = shutil.which("discord") is not None
    try:
        config = load_config(CONFIG_PATH)
    except ConfigError as exc:
        if as_json:
            print(json.dumps({
                "config": str(CONFIG_PATH),
                "valid": False,
                "error": str(exc),
                "token_env": {"name": token_env, "status": token_status},
                "discord_cli_installed": discord_cli_installed,
            }, indent=2))
        else:
            print(f"config: invalid ({exc})")
            print(f"token env {token_env}: {token_status}")
            print(f"discord-cli installed: {'yes' if discord_cli_installed else 'no'}")
        return 1

    placeholders = placeholder_fields(config)
    engine = config.get("engine", "discord_cli")
    engine_display = engine if "engine" in config else "discord_cli (default)"
    if as_json:
        print(json.dumps({
            "config": str(CONFIG_PATH),
            "valid": True,
            "engine": engine_display,
            "discord_cli_installed": discord_cli_installed,
            "placeholders": placeholders,
            "token_env": {"name": token_env, "status": token_status},
        }, indent=2))
    else:
        print(f"config: valid ({CONFIG_PATH})")
        print(f"engine: {engine_display}")
        print(f"discord-cli installed: {'yes' if discord_cli_installed else 'no'}")
        if placeholders:
            for field in placeholders:
                print(f"{field}: placeholder (fill in)")
        else:
            print("placeholders: none")
        print(f"token env {token_env}: {token_status}")
    return 0


def timestamp_key(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (AttributeError, OSError, OverflowError, ValueError):
        return None


def scan_messages(channel_id, channel_dir):
    count = 0
    earliest = None
    latest = None
    if channel_dir is None:
        return count, None, None

    try:
        files = sorted(channel_dir.glob("*.jsonl"))
    except OSError as exc:
        print(f"warning: cannot scan {channel_dir}: {exc}", file=sys.stderr)
        return count, None, None

    for path in files:
        try:
            with path.open(encoding="utf-8") as stream:
                for line_number, line in enumerate(stream, 1):
                    if not line.strip():
                        continue
                    count += 1
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError as exc:
                        print(
                            f"warning: invalid JSON in {path}:{line_number}: {exc}",
                            file=sys.stderr,
                        )
                        continue
                    timestamp = record.get("timestamp") if isinstance(record, dict) else None
                    key = timestamp_key(timestamp)
                    if key is None:
                        continue
                    candidate = (key, timestamp)
                    if earliest is None or candidate < earliest:
                        earliest = candidate
                    if latest is None or candidate > latest:
                        latest = candidate
        except (OSError, UnicodeError) as exc:
            print(f"warning: cannot read {path}: {exc}", file=sys.stderr)

    return count, earliest[1] if earliest else None, latest[1] if latest else None


def read_last_pull(state_path):
    if state_path is None:
        return None
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        print(f"warning: cannot read state {state_path}: {exc}", file=sys.stderr)
        return None
    value = state.get("last_pull_at") if isinstance(state, dict) else None
    return value if isinstance(value, str) else None


def direct_children(path, suffix=None):
    if not path.is_dir():
        return {}
    try:
        children = path.iterdir()
        if suffix is None:
            return {child.name: child for child in children if child.is_dir()}
        return {
            child.name[:-len(suffix)]: child
            for child in children
            if child.is_file() and child.name.endswith(suffix)
        }
    except OSError as exc:
        print(f"warning: cannot scan {path}: {exc}", file=sys.stderr)
        return {}


def build_status(config):
    raw_dirs = direct_children(RAW_DIR)
    state_files = direct_children(STATE_DIR, ".json")
    configured_ids = {channel["id"] for channel in config["channels"]}
    channels = [
        {
            "id": channel["id"],
            "name": channel["name"],
            "enabled": channel["enabled"],
            "configured": True,
        }
        for channel in config["channels"]
    ]
    channels.extend(
        {
            "id": channel_id,
            "name": None,
            "enabled": None,
            "configured": False,
        }
        for channel_id in sorted(raw_dirs)
        if channel_id not in configured_ids
    )

    rows = []
    for channel in channels:
        channel_id = channel["id"]
        count, minimum, maximum = scan_messages(channel_id, raw_dirs.get(channel_id))
        rows.append({
            **channel,
            "message_count": count,
            "min_timestamp": minimum,
            "max_timestamp": maximum,
            "last_pull_at": read_last_pull(state_files.get(channel_id)) or "never",
        })
    return rows


def print_table(rows):
    headings = (
        "CHANNEL_ID", "NAME", "ENABLED", "MESSAGES",
        "MIN_TIMESTAMP", "MAX_TIMESTAMP", "LAST_PULL",
    )
    values = []
    for row in rows:
        enabled = "yes" if row["enabled"] is True else "no" if row["enabled"] is False else "-"
        values.append((
            row["id"],
            row["name"] or "(unconfigured)",
            enabled,
            str(row["message_count"]),
            row["min_timestamp"] or "-",
            row["max_timestamp"] or "-",
            row["last_pull_at"] or "never",
        ))

    widths = [len(heading) for heading in headings]
    for row in values:
        widths = [max(width, len(value)) for width, value in zip(widths, row)]

    print("  ".join(heading.ljust(width) for heading, width in zip(headings, widths)))
    print("  ".join("-" * width for width in widths))
    for row in values:
        print("  ".join(value.ljust(width) for value, width in zip(row, widths)))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Show local Discord archive status.")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    ap.add_argument(
        "--dry-run-config",
        action="store_true",
        help="validate channels.json and token environment presence only",
    )
    ap.add_argument(
        "--token-env",
        default="DISCORD_TOKEN",
        metavar="NAME",
        help="token environment variable name (default: DISCORD_TOKEN)",
    )
    args = ap.parse_args(argv)

    if args.dry_run_config:
        return dry_run_config(args.token_env, args.json)

    try:
        config = load_config(CONFIG_PATH)
    except ConfigError as exc:
        print(f"status: {exc}", file=sys.stderr)
        return 1

    rows = build_status(config)
    if args.json:
        print(json.dumps({"channels": rows}, indent=2))
    else:
        print_table(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
