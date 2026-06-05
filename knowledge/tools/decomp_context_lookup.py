#!/usr/bin/env python3
"""Build a first-pass evidence packet for a Melee decomp target."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]

COMMON_STOP_TERMS = {
    "src",
    "melee",
    "common",
    "chara",
    "items",
    "motion",
    "anim",
    "state",
    "group",
    "proc",
    "init",
    "types",
    "forward",
    "static",
}


def split_identifier(text: str) -> list[str]:
    text = re.sub(r"\.[A-Za-z0-9_]+$", "", text)
    pieces = re.split(r"[^A-Za-z0-9]+", text)
    tokens: list[str] = []
    for piece in pieces:
        if not piece:
            continue
        tokens.append(piece)
        tokens.extend(
            match.group(0)
            for match in re.finditer(
                r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|[0-9]+", piece
            )
        )
    return tokens


def derive_terms(target: str | None, symbol: str | None, terms: list[str]) -> list[str]:
    ordered: list[str] = []

    def add(term: str) -> None:
        term = term.strip()
        if not term:
            return
        lower = term.lower()
        if lower in COMMON_STOP_TERMS:
            return
        if len(lower) < 4 and not lower.startswith("0x"):
            return
        if term not in ordered:
            ordered.append(term)

    if target:
        target_path = Path(target)
        add(target)
        add(target_path.as_posix())
        add(target_path.name)
        add(target_path.stem)
        for part in target_path.parts:
            add(part)
        for token in split_identifier(target_path.stem):
            add(token)

    if symbol:
        add(symbol)
        for token in split_identifier(symbol):
            add(token)

    for term in terms:
        add(term)
        for token in split_identifier(term):
            add(token)

    return ordered


def existing(paths: list[str]) -> list[str]:
    return [path for path in paths if (REPO_ROOT / path).exists()]


def truncate(line: str, max_len: int = 360) -> str:
    line = line.replace("\t", "    ")
    if len(line) <= max_len:
        return line
    return line[: max_len - 1] + "…"


def rg_search(patterns: list[str], paths: list[str], max_results: int) -> list[str]:
    paths = existing(paths)
    if not patterns or not paths or shutil.which("rg") is None:
        return []

    seen: set[str] = set()
    deduped: list[str] = []
    for pattern in patterns:
        for path in paths:
            cmd = [
                "rg",
                "-n",
                "--with-filename",
                "--ignore-case",
                "--fixed-strings",
                "-m",
                str(max_results),
                "-e",
                pattern,
                path,
            ]
            proc = subprocess.run(
                cmd,
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            if proc.returncode not in (0, 1):
                continue
            for raw_line in proc.stdout.splitlines():
                if not raw_line.strip():
                    continue
                line = truncate(raw_line)
                if line in seen:
                    continue
                seen.add(line)
                deduped.append(line)
                if len(deduped) >= max_results:
                    return deduped
    return deduped


def add_terms(base: list[str], additions: list[str]) -> list[str]:
    ordered = list(base)
    seen = set(ordered)
    for term in additions:
        if term and term not in seen:
            ordered.append(term)
            seen.add(term)
    return ordered


def terms_from_metadata(lines: list[str]) -> list[str]:
    terms: list[str] = []
    for line in lines:
        terms.extend(match.group(0).lower() for match in re.finditer(r"0x[0-9a-fA-F]+", line))
    return terms


def compact_report_lookup(
    target: str | None, symbol: str | None, terms: list[str], max_results: int
) -> list[str]:
    report_path = REPO_ROOT / "build/GALE01/report.json"
    if not report_path.exists():
        return []

    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    target_stem = Path(target).stem.lower() if target else ""
    unit_hint = ""
    if target:
        target_no_src = Path(target).with_suffix("").as_posix()
        unit_hint = target_no_src.removeprefix("src/")

    if target_stem:
        target_stem = target_stem.lower()

    exact_hits: list[str] = []
    unit_hits: list[str] = []
    for unit in report.get("units", []):
        unit_name = str(unit.get("name", ""))
        unit_lower = unit_name.lower()
        unit_matches = bool(unit_hint and unit_hint.lower() in unit_lower)
        unit_matches = unit_matches or bool(target_stem and target_stem in unit_lower)

        for func in unit.get("functions", []):
            func_name = str(func.get("name", ""))
            exact_symbol = bool(symbol and func_name == symbol)
            if not exact_symbol and not unit_matches:
                continue
            fuzzy = func.get("fuzzy_match_percent", "")
            size = func.get("size", "")
            metadata = func.get("metadata", {})
            va = metadata.get("virtual_address", "")
            if isinstance(va, str) and va.isdecimal():
                va = f"0x{int(va):08X}"
            detail = (
                f"build/GALE01/report.json: unit={unit_name} "
                f"function={func_name} size={size} fuzzy={fuzzy} va={va}"
            )
            if exact_symbol:
                exact_hits.append(detail)
            else:
                unit_hits.append(detail)

    return (exact_hits + unit_hits)[:max_results]


def print_section(title: str, lines: list[str]) -> None:
    print(f"\n## {title}")
    if not lines:
        print("- No hits in the indexed local files.")
        return
    for line in lines:
        print(f"- {line}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Search local code, PR dump, and resource CSVs for a decomp target."
    )
    parser.add_argument("--target", help="Target source/asm path, object, or TU name")
    parser.add_argument("--symbol", help="Target function/data symbol")
    parser.add_argument(
        "--term",
        action="append",
        default=[],
        help="Extra search term; may be passed multiple times",
    )
    parser.add_argument("--max-results", type=int, default=12)
    args = parser.parse_args()

    terms = derive_terms(args.target, args.symbol, args.term)
    if not terms:
        raise SystemExit("Provide --target, --symbol, or at least one --term.")

    print("# Decomp Context Lookup")
    if args.target:
        print(f"\nTarget: `{args.target}`")
    if args.symbol:
        print(f"Symbol: `{args.symbol}`")
    print("\nSearch terms:")
    print(", ".join(f"`{term}`" for term in terms[:24]))

    target_patterns = [p for p in [args.target, args.symbol, *args.term] if p]
    if not target_patterns:
        target_patterns = terms[:6]

    metadata_lines = compact_report_lookup(
        args.target, args.symbol, terms, max(3, args.max_results // 2)
    )
    metadata_lines.extend(
        rg_search(
            target_patterns,
            [
                "config/GALE01/symbols.txt",
                "config/GALE01/splits.txt",
                "objdiff.json",
                "docs/symbols.md",
                "docs/splits.md",
            ],
            args.max_results,
        )
    )
    resource_terms = add_terms(terms, terms_from_metadata(metadata_lines))
    print_section(
        "Target Metadata",
        metadata_lines[: args.max_results],
    )

    print_section(
        "Local Code And Naming",
        rg_search(
            terms[:12],
            [
                "src",
                "docs/glossary.md",
                "docs",
                "config/GALE01/symbols.txt",
            ],
            args.max_results,
        ),
    )

    print_section(
        "Historical PR Evidence",
        rg_search(
            terms[:12],
            [
                "decomp-orchestrator/knowledge/past_prs/current/analysis/changed_files.jsonl",
                "decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md",
                "decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md",
                "decomp-orchestrator/knowledge/past_prs/current/analysis/diff_lines.jsonl",
                "decomp-orchestrator/knowledge/past_prs/prs/index.csv",
                "decomp-orchestrator/knowledge/past_prs/prs/index.jsonl",
                "decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md",
            ],
            args.max_results,
        ),
    )

    print_section(
        "Resource Index And Data Sheet",
        rg_search(
            resource_terms[:16],
            [
                "decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/cells.csv",
                "decomp-orchestrator/knowledge/decomp_resources/data_sheets/ssbm_data_sheet_1_02/csv/sheet_index.csv",
                "decomp-orchestrator/knowledge/decomp_resources/index.md",
                "decomp-orchestrator/knowledge/decomp_resources/manifests/resource_index.csv",
                "decomp-orchestrator/knowledge/decomp_resources/manifests/acquisition_queue.csv",
                "decomp-orchestrator/knowledge/decomp_resources/documents/powerpc/indexes/powerpc_pdf_pages.csv",
                "decomp-orchestrator/knowledge/decomp_resources/external/training_mode/indexes/gtme01_map_symbols.csv",
                "decomp-orchestrator/knowledge/decomp_resources/external/m_ex/indexes/header_symbols.csv",
                "decomp-orchestrator/knowledge/decomp_resources/external/tockdom/compiler.txt",
                "decomp-orchestrator/knowledge/decomp_resources/guides/resource_notes.md",
            ],
            args.max_results,
        ),
    )

    print("\n## Next Questions")
    print("- Which hits name the same concept, field, callback, or address?")
    print("- Which prior PRs changed the same file, subsystem, or mismatch pattern?")
    print("- Which resource rows support a real name or type, and which are only hints?")
    print("- What verifier command will prove the next source-shape change helped?")


if __name__ == "__main__":
    main()
