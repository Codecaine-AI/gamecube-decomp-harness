#!/usr/bin/env python3
"""Fetch missing GitHub PRs into the orchestrator-owned past PR store using gh."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

import build_pr_dump_analysis
import pr_data_layout as layout


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SOURCE_ROOT.parent.parent / "_shared"))
from source_index import source_data_root  # type: ignore

PAST_PRS_DATA_ROOT = source_data_root(SOURCE_ROOT)
DEFAULT_DUMP_BASE = PAST_PRS_DATA_ROOT
DEFAULT_DUMP_ROOT_NAME = ""

COMMENT_ENDPOINTS = {
    "issue_comments": "repos/{repo}/issues/{number}/comments",
    "review_comments": "repos/{repo}/pulls/{number}/comments",
    "reviews": "repos/{repo}/pulls/{number}/reviews",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch only missing PR metadata, all PR comment streams, and diffs "
            "into the decomp-orchestrator past PR vertical-slice layout."
        )
    )
    parser.add_argument("--repo", default="doldecomp/melee")
    parser.add_argument(
        "--pr",
        dest="prs",
        type=int,
        action="append",
        default=[],
        help="Explicit PR number to fetch. Repeat to fetch a merged/intake set without a time-window discovery query.",
    )
    parser.add_argument(
        "--activity",
        choices=("created", "updated"),
        default="created",
        help="Date field used to define the missing-PR discovery window and sort order.",
    )
    parser.add_argument(
        "--since",
        default=None,
        help=(
            "Inclusive YYYY-MM-DD lower bound. Defaults to the last successful "
            "PR sync date when available, otherwise the first day of the month "
            "three months ago."
        ),
    )
    parser.add_argument(
        "--months",
        type=int,
        default=3,
        help="Calendar months back for the default --since calculation.",
    )
    parser.add_argument(
        "--all-prs",
        action="store_true",
        help="Discover the whole PR corpus and fetch only local gaps, using an open-ended lower bound and no discovery limit unless --limit is explicitly changed.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=1000,
        help="Maximum PRs to discover in the window. Use 0 for no limit.",
    )
    parser.add_argument(
        "--dump-base",
        type=Path,
        default=DEFAULT_DUMP_BASE,
        help="Base directory for the stable dump root. Defaults to projects/melee/knowledge/sources/code_context/past_prs/data.",
    )
    parser.add_argument(
        "--dump-root",
        type=Path,
        default=None,
        help="Exact data directory to update. Defaults to projects/melee/knowledge/sources/code_context/past_prs/data.",
    )
    parser.add_argument(
        "--dump-root-name",
        default=DEFAULT_DUMP_ROOT_NAME,
        help="Optional stable child directory under --dump-base when --dump-root is not set.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List discovered and missing PRs without writing or fetching.",
    )
    parser.add_argument(
        "--fetch-jobs",
        type=int,
        default=16,
        help="Number of concurrent PR fetch workers.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.3,
        help="Seconds to pause between PR fetches.",
    )
    parser.add_argument(
        "--no-organize",
        action="store_true",
        help="Skip extracted per-PR files and manifest updates after fetching raw PR slices.",
    )
    parser.add_argument(
        "--postmortem-mode",
        choices=("off", "scaffold", "pi"),
        default="scaffold",
        help=(
            "After formatting, build searchable PR JSON records. "
            "'scaffold' writes deterministic draft records; "
            "'pi' also calls the kernel-backed pr-indexer agent for each selected PR."
        ),
    )
    parser.add_argument(
        "--postmortem-limit",
        type=int,
        default=None,
        help="Optional maximum PRs to postmortem during this sync.",
    )
    parser.add_argument(
        "--postmortem-scope",
        choices=("all", "fetched"),
        default="all",
        help=(
            "Which PRs to pass to the postmortem builder. "
            "'all' preserves the historical behavior; 'fetched' limits the "
            "builder to PRs fetched in this run."
        ),
    )
    parser.add_argument(
        "--postmortem-rerun-existing",
        action="store_true",
        help="Regenerate postmortems for PRs fetched in this run even when postmortem.json already exists.",
    )
    parser.add_argument(
        "--postmortem-jobs",
        type=int,
        default=16,
        help="Number of concurrent postmortem workers.",
    )
    parser.add_argument(
        "--postmortem-provider",
        default="codex-lb",
        help="Provider used by the kernel-backed pr-indexer when --postmortem-mode pi is selected.",
    )
    parser.add_argument(
        "--postmortem-model",
        default="gpt-5.5",
        help="Model used by the kernel-backed pr-indexer when --postmortem-mode pi is selected.",
    )
    parser.add_argument(
        "--postmortem-thinking",
        default="medium",
        help="Thinking level used by the kernel-backed pr-indexer when --postmortem-mode pi is selected.",
    )
    parser.add_argument(
        "--orchestrator-state-dir",
        type=Path,
        default=None,
        help="State directory forwarded to kernel-backed postmortem agent runs.",
    )
    parser.add_argument(
        "--orchestrator-run-id",
        default="",
        help="Run/session id forwarded to kernel-backed postmortem agent runs.",
    )
    parser.add_argument(
        "--orchestrator-project-id",
        default="",
        help="Project id forwarded to kernel-backed postmortem agent runs.",
    )
    parser.add_argument(
        "--orchestrator-kernel-database-url",
        default="",
        help="Agent Kernel database URL forwarded to kernel-backed postmortem agent runs.",
    )
    return parser.parse_args()


def run(
    cmd: list[str],
    *,
    capture_json: bool = False,
    capture_text: bool = True,
    check: bool = True,
) -> Any:
    proc = subprocess.run(
        cmd,
        check=False,
        text=True,
        capture_output=capture_text or capture_json,
    )
    if check and proc.returncode != 0:
        stderr = proc.stderr.strip() if proc.stderr else ""
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(cmd)}\n{stderr}")
    if capture_json:
        return json.loads(proc.stdout or "null")
    if capture_text:
        return proc.stdout
    return proc


def decode_subprocess_bytes(data: bytes | None) -> str:
    if not data:
        return ""
    return data.decode("utf-8", errors="replace")


def gh_json(args: list[str]) -> Any:
    return run(["gh", *args], capture_json=True)


def gh_paginated_array(endpoint: str) -> list[dict[str, Any]]:
    data = gh_json(["api", "--paginate", "--slurp", endpoint])
    if isinstance(data, list) and all(isinstance(page, list) for page in data):
        return [item for page in data for item in page]
    if isinstance(data, list):
        return data
    raise SystemExit(f"Expected a JSON array from gh api {endpoint}")


def first_day_months_ago(today: dt.date, months: int) -> dt.date:
    month_index = today.year * 12 + (today.month - 1) - months
    year = month_index // 12
    month = month_index % 12 + 1
    return dt.date(year, month, 1)


def parse_since(value: str | None, months: int) -> dt.date:
    if value:
        return dt.date.fromisoformat(value)
    return first_day_months_ago(dt.date.today(), months)


def parse_iso_date_prefix(value: Any) -> dt.date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def last_completed_sync_date(dump_root: Path) -> dt.date | None:
    metadata = read_json(dump_root / "fetch_metadata.json", {})
    if isinstance(metadata, dict):
        parsed = parse_iso_date_prefix(metadata.get("fetched_at"))
        if parsed:
            return parsed

    completed_path = dump_root / "fetch-completed.txt"
    if completed_path.exists():
        for line in completed_path.read_text(encoding="utf-8", errors="replace").splitlines():
            prefix = "PR dump formatted at "
            if line.startswith(prefix):
                parsed = parse_iso_date_prefix(line.removeprefix(prefix))
                if parsed:
                    return parsed

    return latest_index_created_date(dump_root)


def normalized_state(pr: dict[str, Any]) -> str:
    if pr.get("merged_at"):
        return "MERGED"
    state = str(pr.get("state") or "").upper()
    return state or "UNKNOWN"


def normalize_index_pr(pr: dict[str, Any]) -> dict[str, Any]:
    user = pr.get("user") if isinstance(pr.get("user"), dict) else {}
    login = user.get("login")
    return {
        "author": {
            "id": str(user.get("id")) if user.get("id") is not None else None,
            "is_bot": user.get("type") == "Bot" or (login or "").endswith("[bot]"),
            "login": login,
            "name": user.get("name"),
        },
        "closedAt": pr.get("closed_at"),
        "createdAt": pr.get("created_at"),
        "mergedAt": pr.get("merged_at"),
        "number": pr.get("number"),
        "state": normalized_state(pr),
        "title": pr.get("title"),
        "updatedAt": pr.get("updated_at"),
        "url": pr.get("html_url"),
    }


def discover_prs(repo: str, since: dt.date, activity: str, limit: int) -> list[dict[str, Any]]:
    discovered: list[dict[str, Any]] = []
    page = 1
    per_page = 100
    date_field = f"{activity}_at"

    while limit <= 0 or len(discovered) < limit:
        endpoint = (
            f"repos/{repo}/pulls"
            f"?state=all&sort={activity}&direction=desc&per_page={per_page}&page={page}"
        )
        prs = gh_json(["api", endpoint])
        if not isinstance(prs, list) or not prs:
            break

        saw_older = False
        for pr in prs:
            stamp = pr.get(date_field)
            if not isinstance(stamp, str):
                continue
            if dt.date.fromisoformat(stamp[:10]) < since:
                saw_older = True
                continue
            discovered.append(normalize_index_pr(pr))
            if limit > 0 and len(discovered) >= limit:
                break

        if saw_older or len(prs) < per_page:
            break
        page += 1

    return discovered


def fetch_index_pr(repo: str, number: int) -> dict[str, Any]:
    pr = gh_json(["api", f"repos/{repo}/pulls/{number}"])
    if not isinstance(pr, dict):
        raise SystemExit(f"Expected a PR object for #{number}")
    return normalize_index_pr(pr)


def read_existing_pr_index(dump_root: Path) -> list[dict[str, Any]]:
    data = read_json(dump_root / "prs.json", [])
    return data if isinstance(data, list) else []


def latest_index_created_date(dump_root: Path) -> dt.date | None:
    latest: dt.date | None = None
    for pr in read_existing_pr_index(dump_root):
        parsed = parse_iso_date_prefix(pr.get("createdAt") or pr.get("created_at"))
        if parsed and (latest is None or parsed > latest):
            latest = parsed
    return latest


def merged_pr_index(dump_root: Path, selected_prs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_number: dict[int, dict[str, Any]] = {}
    for pr in read_existing_pr_index(dump_root):
        try:
            by_number[int(pr["number"])] = pr
        except (KeyError, TypeError, ValueError):
            continue
    for pr in selected_prs:
        by_number[int(pr["number"])] = pr
    return sorted(
        by_number.values(),
        key=lambda pr: str(pr.get("mergedAt") or pr.get("updatedAt") or pr.get("createdAt") or ""),
        reverse=True,
    )


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def stable_dump_root(args: argparse.Namespace) -> Path:
    if args.dump_root:
        return args.dump_root
    if args.dump_root_name:
        return args.dump_base / args.dump_root_name
    return args.dump_base


def fetch_metadata(
    *,
    repo: str,
    activity: str,
    since: dt.date,
    since_source: str,
    months: int,
    limit: int,
    query: str,
    dump_root: Path,
    fetched_at: str,
    discovered_count: int,
    fetched_count: int,
    postmortem_mode: str,
    postmortem_scope: str,
    fetch_jobs: int,
    postmortem_jobs: int,
) -> dict[str, Any]:
    return {
        "schema_version": "melee_pr_dump_fetch_metadata_v1",
        "repo": repo,
        "activity": activity,
        "since": since.isoformat(),
        "since_source": since_source,
        "months": months,
        "limit": limit,
        "query": query,
        "dump_root": str(dump_root),
        "fetched_at": fetched_at,
        "discovered_pr_count": discovered_count,
        "fetched_pr_count": fetched_count,
        "fetched_or_refreshed_pr_count": fetched_count,
        "postmortem_mode": postmortem_mode,
        "postmortem_scope": postmortem_scope,
        "fetch_jobs": fetch_jobs,
        "postmortem_jobs": postmortem_jobs,
        "layout_note": (
            "The sync window is recorded here instead of being encoded in "
            "a dump folder name. PR slices live under prs/pr-NNNN with raw/, "
            "extracted/, and postmortem/ subfolders."
        ),
    }


def update_top_level_metadata(dump_root: Path, metadata: dict[str, Any]) -> None:
    write_json(dump_root / "fetch_metadata.json", metadata)

    manifest_path = dump_root / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        with manifest_path.open("r", encoding="utf-8") as f:
            manifest = json.load(f)
    manifest["fetch_metadata"] = {
        "path": "fetch_metadata.json",
        "activity": metadata["activity"],
        "since": metadata["since"],
        "fetched_at": metadata["fetched_at"],
        "stable_dump_root": True,
    }
    write_json(manifest_path, manifest)

    summary_path = dump_root / "summary.json"
    if summary_path.exists():
        with summary_path.open("r", encoding="utf-8") as f:
            summary = json.load(f)
    else:
        summary = {}
    summary.setdefault("files", {})
    summary["files"]["fetch_metadata"] = "fetch_metadata.json"
    summary["query"] = metadata["query"]
    summary["repo"] = metadata["repo"]
    write_json(summary_path, summary)


def pr_dir(dump_root: Path, number: int) -> Path:
    return layout.pr_slice_dir(dump_root, number)


def raw_path(dump_root: Path, number: int, kind: str) -> Path:
    return layout.raw_json_path(dump_root, number, kind)


def has_json_source(dump_root: Path, number: int, kind: str) -> bool:
    return layout.existing_path(layout.candidate_raw_json_paths(dump_root, number, kind)) is not None


def has_diff_source(dump_root: Path, number: int) -> bool:
    return layout.existing_path(layout.candidate_diff_paths(dump_root, number)) is not None


def has_complete_pr(dump_root: Path, number: int) -> bool:
    return all(has_json_source(dump_root, number, kind) for kind in layout.RAW_FILE_MAP) and has_diff_source(
        dump_root, number
    )


def fetch_pr(repo: str, dump_root: Path, number: int) -> None:
    print(f"fetching #{number}", flush=True)
    write_json(raw_path(dump_root, number, "pr"), gh_json(["api", f"repos/{repo}/pulls/{number}"]))

    for kind, endpoint_template in COMMENT_ENDPOINTS.items():
        endpoint = endpoint_template.format(repo=repo, number=number)
        write_json(raw_path(dump_root, number, kind), gh_paginated_array(endpoint))

    diff_dir = layout.pr_raw_dir(dump_root, number)
    diff_dir.mkdir(parents=True, exist_ok=True)
    diff_path = layout.diff_path(dump_root, number)
    err_path = layout.diff_error_path(dump_root, number)
    proc = subprocess.run(
        ["gh", "pr", "diff", str(number), "--repo", repo],
        check=False,
        text=False,
        capture_output=True,
    )
    diff_path.write_text(decode_subprocess_bytes(proc.stdout), encoding="utf-8")
    if proc.returncode == 0:
        if err_path.exists():
            err_path.unlink()
    else:
        stderr = decode_subprocess_bytes(proc.stderr)
        err_path.write_text(stderr or f"gh pr diff exited {proc.returncode}\n", encoding="utf-8")


def ensure_tools() -> None:
    missing = [tool for tool in ("gh",) if shutil.which(tool) is None]
    if missing:
        raise SystemExit(f"Missing required tool(s): {', '.join(missing)}")
    run(["gh", "auth", "status"], capture_text=True)


def organize_dump(dump_root: Path) -> None:
    organizer = Path(__file__).with_name("organize_pr_dump.py")
    run([sys.executable, str(organizer), str(dump_root)], capture_text=False)


def build_postmortems(
    args: argparse.Namespace,
    dump_root: Path,
    selected_numbers: list[int] | None = None,
) -> None:
    if args.postmortem_mode == "off":
        return
    if args.postmortem_scope == "fetched":
        selected_numbers = selected_numbers or []
        if not selected_numbers:
            print("postmortems: no fetched PRs selected", flush=True)
            return

    script = Path(__file__).with_name("build_pr_postmortems.py")
    cmd = [
        sys.executable,
        str(script),
        "--dump-root",
        str(dump_root),
    ]
    if args.postmortem_mode == "pi":
        cmd.append("--run-agent")
        cmd.extend(
            [
                "--provider",
                args.postmortem_provider,
                "--model",
                args.postmortem_model,
                "--thinking",
                args.postmortem_thinking,
            ]
        )
    if args.orchestrator_state_dir:
        cmd.extend(["--orchestrator-state-dir", str(args.orchestrator_state_dir)])
    if args.orchestrator_run_id:
        cmd.extend(["--orchestrator-run-id", args.orchestrator_run_id])
    if args.orchestrator_project_id:
        cmd.extend(["--orchestrator-project-id", args.orchestrator_project_id])
    if args.orchestrator_kernel_database_url:
        cmd.extend(["--orchestrator-kernel-database-url", args.orchestrator_kernel_database_url])
    if args.postmortem_limit is not None:
        cmd.extend(["--limit", str(args.postmortem_limit)])
    if args.postmortem_rerun_existing:
        cmd.append("--rerun-existing")
    if args.postmortem_jobs != 1:
        cmd.extend(["--jobs", str(args.postmortem_jobs)])
    if selected_numbers:
        for number in selected_numbers:
            cmd.extend(["--pr", str(number)])

    run(cmd, capture_text=False)


def main() -> int:
    args = parse_args()

    explicit_numbers = sorted(set(args.prs))
    dump_root = stable_dump_root(args)
    dump_root = dump_root.resolve()
    if args.all_prs and args.since is None:
        args.since = "2000-01-01"
    if args.all_prs and args.limit == 1000:
        args.limit = 0
    if args.since is None and not args.all_prs and not explicit_numbers:
        since = last_completed_sync_date(dump_root)
        since_source = "last_sync" if since else "default_window"
        since = since or parse_since(None, args.months)
    else:
        since = parse_since(args.since, args.months)
        since_source = "explicit" if args.since else ("all_prs" if args.all_prs else "explicit_pr")
    query = (
        "explicit:" + ",".join(f"#{number}" for number in explicit_numbers)
        if explicit_numbers
        else f"{args.activity}:>={since.isoformat()}"
    )

    if explicit_numbers:
        missing = [number for number in explicit_numbers if not has_complete_pr(dump_root, number)]
        selected_prs: list[dict[str, Any]] = []
        discovered_count = len(explicit_numbers)
    else:
        ensure_tools()
        prs = discover_prs(args.repo, since, args.activity, args.limit)
        by_number = {int(pr["number"]): pr for pr in prs}
        numbers = list(by_number)
        missing = [number for number in numbers if not has_complete_pr(dump_root, number)]
        selected_prs = [by_number[number] for number in missing]
        discovered_count = len(prs)

    print(
        f"repo={args.repo} query={query} since_source={since_source} dump={dump_root}\n"
        f"discovered={discovered_count} missing={len(missing)}",
        flush=True,
    )

    if args.dry_run:
        if missing:
            print(
                "would fetch: " + ", ".join(f"#{number}" for number in missing[:50]),
                flush=True,
            )
            if len(missing) > 50:
                print(f"...and {len(missing) - 50} more", flush=True)
        else:
            print("nothing to fetch", flush=True)
        if args.postmortem_mode != "off" and args.postmortem_scope == "fetched":
            print(f"would postmortem fetched PRs: {len(missing)}", flush=True)
        return 0

    dump_root.mkdir(parents=True, exist_ok=True)
    if explicit_numbers:
        if missing:
            ensure_tools()
        selected_prs = [fetch_index_pr(args.repo, number) for number in missing]

    if not missing:
        metadata_generated_at = build_pr_dump_analysis.now_utc()
        update_top_level_metadata(
            dump_root,
            fetch_metadata(
                repo=args.repo,
                activity=args.activity,
                since=since,
                since_source=since_source,
                months=args.months,
                limit=args.limit,
                query=query,
                dump_root=dump_root,
                fetched_at=metadata_generated_at,
                discovered_count=discovered_count,
                fetched_count=0,
                postmortem_mode=args.postmortem_mode,
                postmortem_scope=args.postmortem_scope,
                fetch_jobs=args.fetch_jobs,
                postmortem_jobs=args.postmortem_jobs,
            ),
        )
        print("nothing to fetch", flush=True)
        build_postmortems(
            args,
            dump_root,
            selected_numbers=[] if args.postmortem_scope == "fetched" else None,
        )
        return 0

    fetch_jobs = max(1, args.fetch_jobs)
    if fetch_jobs == 1:
        for index, number in enumerate(missing, start=1):
            fetch_pr(args.repo, dump_root, number)
            if index < len(missing) and args.sleep > 0:
                time.sleep(args.sleep)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=fetch_jobs) as executor:
            futures = {executor.submit(fetch_pr, args.repo, dump_root, number): number for number in missing}
            for future in concurrent.futures.as_completed(futures):
                number = futures[future]
                try:
                    future.result()
                except Exception as exc:
                    print(f"fetch failed: PR #{number}: {exc}", flush=True)
                    raise

    write_json(dump_root / "prs.json", merged_pr_index(dump_root, selected_prs))

    generated_at = build_pr_dump_analysis.now_utc()
    stats = build_pr_dump_analysis.build_dump(
        dump_root,
        repo=args.repo,
        query=query,
        source="gh",
        generated_at=generated_at,
    )
    print(
        "formatted "
        f"{stats['pr_count']} PRs "
        f"({stats['text_records']} text records, {stats['diff_lines']} diff lines)",
        flush=True,
    )

    if not args.no_organize:
        organize_dump(dump_root)

    update_top_level_metadata(
        dump_root,
        fetch_metadata(
            repo=args.repo,
            activity=args.activity,
            since=since,
            since_source=since_source,
            months=args.months,
            limit=args.limit,
            query=query,
            dump_root=dump_root,
            fetched_at=generated_at,
            discovered_count=discovered_count,
            fetched_count=len(missing),
            postmortem_mode=args.postmortem_mode,
            postmortem_scope=args.postmortem_scope,
            fetch_jobs=args.fetch_jobs,
            postmortem_jobs=args.postmortem_jobs,
        ),
    )
    build_postmortems(
        args,
        dump_root,
        selected_numbers=missing if args.postmortem_scope == "fetched" else None,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
