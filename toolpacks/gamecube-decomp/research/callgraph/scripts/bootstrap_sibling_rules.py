#!/usr/bin/env python3
"""Generate character sibling metadata from the maintained fighter guide."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


GENERATED_BY = (
    "toolpacks/gamecube-decomp/research/callgraph/scripts/"
    "bootstrap_sibling_rules.py"
)
EXPECTED_FAMILY_COUNT = 34
CLONE_FOLDER_NAMES = {
    "Dr. Mario": "ftDrMario",
    "Mario": "ftMario",
    "Falco": "ftFalco",
    "Fox": "ftFox",
    "Ganon": "ftGanon",
    "Captain Falcon": "ftCaptain",
    "Pichu": "ftPichu",
    "Pikachu": "ftPikachu",
    "Y.Link": "ftCLink",
    "Link": "ftLink",
    "Roy": "ftEmblem",
    "Marth": "ftMars",
}
EXPECTED_CLONE_PAIRS = [
    ["ftDrMario", "ftMario"],
    ["ftFalco", "ftFox"],
    ["ftGanon", "ftCaptain"],
    ["ftPichu", "ftPikachu"],
    ["ftCLink", "ftLink"],
    ["ftEmblem", "ftMars"],
]
COMBINED_CHARACTERS = {
    "ftPopo": "Ice Climbers",
    "ftNana": "Nana",
    "ftZakoBoy": "Male Wireframes",
    "ftZakoGirl": "Female Wireframes",
}


def default_repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def markdown_link_labels(value: str) -> list[str]:
    return re.findall(r"\[([^]]+)\]\([^)]+\)", value)


def parse_families(guide_text: str) -> list[dict[str, Any]]:
    heading = "## Character folder → who it is"
    if heading not in guide_text:
        raise ValueError(f"missing guide section: {heading}")

    section = guide_text.split(heading, 1)[1].split("\n## ", 1)[0]
    families: list[dict[str, Any]] = []
    for line in section.splitlines():
        if not re.match(r"^\|\s*ft", line):
            continue

        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 3:
            raise ValueError(f"unexpected fighter table row: {line}")
        folder_cell, prefix_cell, character_cell = cells
        folders = [part.strip() for part in folder_cell.split("/")]
        prefixes = re.findall(r"`([^`]+)`", prefix_cell)
        if len(folders) != len(prefixes):
            raise ValueError(f"folder/prefix mismatch: {line}")

        labels = markdown_link_labels(character_cell)
        if not labels:
            raise ValueError(f"missing character link: {line}")
        for family, prefix in zip(folders, prefixes):
            character = COMBINED_CHARACTERS.get(family, labels[0])
            families.append(
                {
                    "family": family,
                    "prefix": prefix,
                    "character": character,
                    "dir_glob": f"src/melee/ft/chara/{family}/*",
                    "wiki_titles": [],
                }
            )

    # ftCommon is documented immediately above the table rather than repeated
    # in it. It is a real sibling family and brings the expanded folder list to
    # the guide's expected 34 families.
    common_match = re.search(
        r"`chara/(ftCommon)/`\s*\(`(ftCo)_\*?`?", guide_text
    )
    if not common_match:
        # The current guide spells the prefix as `ftCo_*` inside the same bullet.
        common_match = re.search(
            r"`chara/(ftCommon)/`.*?\(`(ftCo)_\*?", guide_text, re.DOTALL
        )
    if not common_match:
        raise ValueError("missing documented ftCommon/ftCo family")
    families.append(
        {
            "family": common_match.group(1),
            "prefix": common_match.group(2),
            "character": "Common",
            "dir_glob": "src/melee/ft/chara/ftCommon/*",
            "wiki_titles": [],
        }
    )

    families.sort(key=lambda row: row["family"])
    if len(families) != EXPECTED_FAMILY_COUNT:
        raise ValueError(
            f"expected {EXPECTED_FAMILY_COUNT} families, found {len(families)}"
        )
    return families


def parse_clone_pairs(guide_text: str) -> list[list[str]]:
    match = re.search(r"Clone pairs:\s*(.+?)(?:\n\s*\n|\Z)", guide_text, re.DOTALL)
    if not match:
        raise ValueError("missing Clone pairs sentence")

    pairs: list[list[str]] = []
    pair_list = match.group(1).replace("\n", " ").strip().removesuffix(".")
    for pair_text in pair_list.split(","):
        names = [name.strip() for name in pair_text.split("↔")]
        if len(names) != 2:
            raise ValueError(f"unexpected clone pair: {pair_text.strip()}")
        try:
            pairs.append([CLONE_FOLDER_NAMES[name] for name in names])
        except KeyError as exc:
            raise ValueError(f"unknown clone name: {exc.args[0]}") from exc

    if pairs != EXPECTED_CLONE_PAIRS:
        raise ValueError(f"unexpected clone pairs: {pairs}")
    return pairs


def load_crosswalk_titles(crosswalk_path: Path) -> dict[str, list[str]]:
    titles_by_glob: dict[str, list[str]] = {}
    with crosswalk_path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"invalid JSON at {crosswalk_path}:{line_number}"
                ) from exc
            titles = row.get("titles", [])
            for scope_glob in row.get("scope_globs", []):
                existing = titles_by_glob.setdefault(scope_glob, [])
                for title in titles:
                    if title not in existing:
                        existing.append(title)
    return titles_by_glob


def build_sibling_rules(repo_root: Path) -> dict[str, Any]:
    guide_path = repo_root / "projects/melee/knowledge/tree_guide/ft/README.md"
    crosswalk_path = (
        repo_root
        / "projects/melee/knowledge/sources/rag_search/smashwiki/data/crosswalk.jsonl"
    )
    guide_text = guide_path.read_text(encoding="utf-8")
    families = parse_families(guide_text)
    crosswalk_titles = load_crosswalk_titles(crosswalk_path)
    for family in families:
        family["wiki_titles"] = crosswalk_titles.get(family["dir_glob"], [])

    return {
        "schema_version": "sibling_rules_v1",
        "generated_by": GENERATED_BY,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "families": families,
        "clone_pairs": parse_clone_pairs(guide_text),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=default_repo_root())
    args = parser.parse_args()

    repo_root = args.repo_root.expanduser().resolve()
    output_path = repo_root / "projects/melee/knowledge/config/sibling_rules.json"
    payload = build_sibling_rules(repo_root)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": str(output_path),
                "family_count": len(payload["families"]),
                "clone_pair_count": len(payload["clone_pairs"]),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
