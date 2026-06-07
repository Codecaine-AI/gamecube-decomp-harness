#!/usr/bin/env python3
"""Synchronize the local repo and the searchable past-PR library."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True


SCRIPT_DIR = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch the mainline branch, rebase the current branch, then refresh "
            "the past-PR dump and Pi-reviewed PR knowledge library."
        )
    )
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--main", default="master", help="Mainline branch name for this repo.")
    parser.add_argument("--skip-git", action="store_true", help="Only refresh the PR library.")
    parser.add_argument("--no-rebase", action="store_true", help="Fetch mainline without rebasing.")
    parser.add_argument(
        "--no-autostash",
        action="store_true",
        help="Do not pass --autostash to git rebase.",
    )
    parser.add_argument("--repo", default="doldecomp/melee")
    parser.add_argument("--pr-activity", choices=("created", "updated"), default="created")
    parser.add_argument("--all-prs", action="store_true", help="Refresh the full PR corpus instead of the recent window.")
    parser.add_argument("--since", default=None)
    parser.add_argument("--months", type=int, default=3)
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--fetch-jobs", type=int, default=16)
    parser.add_argument("--sleep", type=float, default=0.3)
    parser.add_argument(
        "--postmortem-mode",
        choices=("off", "scaffold", "pi"),
        default="pi",
    )
    parser.add_argument("--postmortem-jobs", type=int, default=16)
    parser.add_argument(
        "--postmortem-scope",
        choices=("all", "fetched"),
        default="fetched",
        help="Use 'fetched' to agent only PRs fetched/refreshed by this sync.",
    )
    parser.add_argument(
        "--refresh-existing-prs",
        action="store_true",
        help=(
            "Refetch discovered PRs and rerun their postmortems. Pair with "
            "--pr-activity updated when refreshing recently changed PRs."
        ),
    )
    parser.add_argument(
        "--postmortem-limit",
        type=int,
        default=None,
        help="Optional maximum PRs to process through the postmortem builder.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running them.")
    return parser.parse_args()


def run(cmd: list[str], *, capture_text: bool = False, dry_run: bool = False) -> str:
    if dry_run:
        print("$ " + " ".join(cmd), flush=True)
        return ""
    proc = subprocess.run(cmd, check=False, text=True, capture_output=capture_text)
    if proc.returncode != 0:
        stderr = proc.stderr.strip() if proc.stderr else ""
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(cmd)}\n{stderr}")
    return proc.stdout.strip() if capture_text else ""


def require_tools(tools: list[str]) -> None:
    missing = [tool for tool in tools if shutil.which(tool) is None]
    if missing:
        raise SystemExit(f"Missing required tool(s): {', '.join(missing)}")


def current_branch() -> str:
    return run(["git", "branch", "--show-current"], capture_text=True)


def sync_git(args: argparse.Namespace) -> None:
    if args.skip_git:
        return
    require_tools(["git"])
    branch = current_branch()
    if not branch:
        raise SystemExit("Cannot rebase from a detached HEAD; pass --skip-git or check out a branch.")

    run(["git", "fetch", "--prune", args.remote], dry_run=args.dry_run)
    if branch == args.main:
        run(["git", "pull", "--ff-only", args.remote, args.main], dry_run=args.dry_run)
    elif not args.no_rebase:
        cmd = ["git", "rebase"]
        if not args.no_autostash:
            cmd.append("--autostash")
        cmd.append(f"{args.remote}/{args.main}")
        run(cmd, dry_run=args.dry_run)


def refresh_pr_library(args: argparse.Namespace) -> None:
    require_tools(["gh"])
    cmd = [
        sys.executable,
        str(SCRIPT_DIR / "fetch_recent_pr_dump.py"),
        "--repo",
        args.repo,
        "--activity",
        args.pr_activity,
        "--months",
        str(args.months),
        "--limit",
        str(args.limit),
        "--fetch-jobs",
        str(args.fetch_jobs),
        "--sleep",
        str(args.sleep),
        "--postmortem-mode",
        args.postmortem_mode,
        "--postmortem-scope",
        args.postmortem_scope,
        "--postmortem-jobs",
        str(args.postmortem_jobs),
    ]
    if args.since is not None:
        cmd.extend(["--since", args.since])
    if args.all_prs:
        cmd.append("--all-prs")
    if args.refresh_existing_prs:
        cmd.extend(["--refresh-existing", "--postmortem-rerun-existing"])
    if args.postmortem_limit is not None:
        cmd.extend(["--postmortem-limit", str(args.postmortem_limit)])
    if args.dry_run:
        cmd.append("--dry-run")

    run(cmd, dry_run=args.dry_run)


def main() -> int:
    args = parse_args()
    sync_git(args)
    refresh_pr_library(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
