#!/usr/bin/env python3
"""Build a normalized PPC-EABI type-layout index."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
import sys
from typing import Any


TOOL_ROOT = Path(__file__).resolve().parents[1]
HARNESS_ROOT = Path(__file__).resolve().parents[5]
TOOLPACK_ROOT = TOOL_ROOT.parents[1]
sys.path.append(str(TOOLPACK_ROOT / "_impl" / "gamecube" / "dsearch"))

import typeidx  # type: ignore


VENDOR_COMMIT = "586800f"
SCHEMA_VERSION = 1


def default_output_root() -> Path:
    override = os.environ.get("ORCH_TOOL_SHARED_DATA_ROOT")
    if override:
        path = Path(override).expanduser()
        return path if path.is_absolute() else HARNESS_ROOT / path
    return HARNESS_ROOT / "games" / "melee" / "shared" / "tool-data" / "type_layout_lookup"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a type-layout index from clang's PPC-EABI record dump.")
    parser.add_argument("--repo-root", type=Path, help="Built project checkout; supplies build/ctx.c and src/.")
    parser.add_argument("--ctx", type=Path, help="Context file override. Defaults to <repo-root>/build/ctx.c.")
    parser.add_argument("--clang", default="clang")
    parser.add_argument("--src-root", type=Path, help="Source root override. Defaults to <repo-root>/src.")
    parser.add_argument("--skip-casts", action="store_true")
    parser.add_argument("--project", default="melee")
    parser.add_argument("--out", type=Path, default=default_output_root())
    return parser.parse_args(argv)


def error_payload(status: str, message: str, guidance: str, **details: Any) -> dict[str, Any]:
    return {"status": status, "message": message, "guidance": guidance, **details}


def resolve_inputs(args: argparse.Namespace) -> tuple[Path | None, Path | None, dict[str, Any] | None]:
    repo_root = args.repo_root.expanduser().resolve() if args.repo_root else None
    ctx = args.ctx.expanduser().resolve() if args.ctx else (repo_root / "build" / "ctx.c" if repo_root else None)
    if ctx is None:
        return None, None, error_payload(
            "invalid_arguments",
            "Either --repo-root or --ctx is required.",
            "Pass --repo-root <built_checkout> or --ctx <checkout>/build/ctx.c.",
        )
    if not ctx.is_file():
        return ctx, None, error_payload(
            "ctx_not_found",
            f"Context file not found: {ctx}",
            "Generate it from the project checkout with: python3 tools/m2ctx/m2ctx.py -p",
            ctx=str(ctx),
        )
    src_root = args.src_root.expanduser().resolve() if args.src_root else (repo_root / "src" if repo_root else None)
    if not args.skip_casts and (src_root is None or not src_root.is_dir()):
        return ctx, src_root, error_payload(
            "src_root_not_found",
            f"Source root not found: {src_root}",
            "Pass --src-root <checkout>/src, or use --skip-casts when only build/ctx.c is available.",
            src_root=str(src_root) if src_root else None,
        )
    return ctx, src_root, None


def build_index(
    ctx: Path,
    project: str,
    clang: str,
    src_root: Path | None,
    skip_casts: bool,
) -> dict[str, Any]:
    dump_text = typeidx.make_dump(ctx, clang)
    index = typeidx.ingest(project, ctx, dump_text=dump_text)
    index.update({
        "schema_version": SCHEMA_VERSION,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "vendor_commit": VENDOR_COMMIT,
        "dup_groups": typeidx.dup_groups(index),
    })
    if skip_casts:
        index["cast_scan"] = {"available": False, "rows": [], "src_root": None}
    else:
        assert src_root is not None
        index["cast_scan"] = {
            "available": True,
            "rows": typeidx.scan_casts(index, src_root),
            "src_root": str(src_root),
        }
    return index


def write_index_atomic(index: dict[str, Any], output_root: Path) -> Path:
    indexes = output_root.expanduser().resolve() / "indexes"
    indexes.mkdir(parents=True, exist_ok=True)
    destination = indexes / "type_layout_index.json"
    file_descriptor, temporary_name = tempfile.mkstemp(prefix=".type_layout_index.", suffix=".tmp", dir=indexes)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            json.dump(index, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary_path.replace(destination)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise
    return destination


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    ctx, src_root, error = resolve_inputs(args)
    if error is not None:
        print(json.dumps(error, indent=2, sort_keys=True))
        return 2
    assert ctx is not None
    print(f"Generating PPC-EABI record layouts from {ctx}", file=sys.stderr)
    try:
        index = build_index(ctx, args.project, args.clang, src_root, args.skip_casts)
    except FileNotFoundError:
        print(json.dumps(error_payload(
            "clang_not_found",
            f"Clang executable not found: {args.clang}",
            "Install clang or pass --clang /absolute/path/to/clang.",
            clang=args.clang,
        ), indent=2, sort_keys=True))
        return 2
    except RuntimeError as exc:
        print(json.dumps(error_payload(
            "clang_layout_failed",
            str(exc),
            "Check that build/ctx.c is self-contained, then retry with a clang that supports the powerpc-unknown-eabi target.",
            clang=args.clang,
            ctx=str(ctx),
        ), indent=2, sort_keys=True))
        return 2
    destination = write_index_atomic(index, args.out)
    payload = {
        "status": "ok",
        "index_path": str(destination),
        "record_count": len(index["records"]),
        "duplicate_group_count": len(index["dup_groups"]),
        "cast_scan_available": index["cast_scan"]["available"],
        "cast_record_count": len(index["cast_scan"]["rows"]),
        "project": args.project,
        "ctx": str(ctx),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

