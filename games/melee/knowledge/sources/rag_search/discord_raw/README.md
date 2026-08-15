# Discord Raw Archive (timestamped)

Raw, timestamped Discord messages pulled through the Discord API for later
evidence-backed extraction. Workers never search this archive directly. The
daily extraction pipeline mines learnings with message-level evidence refs,
and the librarian consumes `data/raw/` JSONL directly. No local index is built
here.

This archive is the retained Discord input. The extraction pipeline converts
useful message-level evidence into durable graph records instead of maintaining
a second worker-searchable Discord corpus.

## Channel config

Enable Discord Developer Mode under **User Settings > Advanced > Developer
Mode**. Right-click the server and each channel, choose **Copy ID**, then replace
the placeholders in `config/channels.json`. Set each channel's `enabled` field
to `true` when it is ready to pull.

The top-level `engine` field accepts `discord_cli` or `direct_api` and defaults
to `discord_cli` when omitted.

## Engines

Both engines write the identical `data/raw/<channel_id>/YYYY-MM.jsonl` layout
consumed directly by the librarian and extraction pipeline.

### Primary: discord_cli

Install [`kabi-discord-cli`](https://pypi.org/project/kabi-discord-cli/) as an
isolated command-line tool. It provides the `discord` binary:

```bash
pipx install kabi-discord-cli
# or
uv tool install kabi-discord-cli
```

Authenticate from a local Discord or browser session. This extracts and saves
a user token for discord-cli:

```bash
discord auth --save
```

Discord may restrict or suspend accounts that automate user-token traffic —
use an account you accept that risk on, or use the `direct_api` engine with a
bot token.

Backfill all enabled, configured channels:

```bash
python3 commands/sync_via_discord_cli.py --bootstrap
```

Run the incremental daily sync:

```bash
python3 commands/sync_via_discord_cli.py --since-yesterday
```

Example crontab entry, run from this source directory every day at 01:15 UTC:

```cron
15 1 * * * cd /path/to/gamecube-decomp-harness/projects/melee/knowledge/sources/rag_search/discord_raw && python3 commands/sync_via_discord_cli.py --since-yesterday
```

### Fallback: direct_api

Put `DISCORD_TOKEN` in `local.env`, then export it into the environment before
running these scripts. The scripts only read the environment and never read
`local.env` themselves.

Bot tokens use the default `Authorization: Bot <token>` form. For a user token,
pass `--user-token`; the token is then sent as the raw authorization value.

Backfill all enabled, configured channels:

```bash
python3 commands/pull_all.py
```

The first pull reads full history from the beginning. Later pulls resume from
the newest message already on disk. Writes are idempotent, so overlapping pulls
do not duplicate messages.

Run the direct-API daily pull:

```bash
python3 commands/pull_all.py --since-yesterday
```

Example crontab entry, run from this source directory every day at 01:15 UTC:

```cron
15 1 * * * cd /path/to/gamecube-decomp-harness/projects/melee/knowledge/sources/rag_search/discord_raw && python3 commands/pull_all.py --since-yesterday
```

## Output layout

- `data/raw/<channel_id>/YYYY-MM.jsonl` — one message per line, grouped by the
  message timestamp's UTC month. Records contain message and channel IDs,
  author name and ID, timestamp, content, reply target, attachments, and
  reactions.
- `data/state/<channel_id>.json` — last pull time, newest message ID, and the
  number of messages written by the last pull.

## Status

```bash
python3 commands/status.py
python3 commands/status.py --dry-run-config
```

The dry run validates configuration and reports whether `DISCORD_TOKEN` is
present, which engine is configured, and whether discord-cli is installed,
without making an API call or printing the token.
