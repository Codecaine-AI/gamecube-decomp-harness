"""Shared helpers for the smashwiki source APIs."""

import json
import re
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parent.parent
DATA = SOURCE_DIR / "data"
PAGES = DATA / "pages"
MEDIA = DATA / "media"
UA = "gamecube-decomp-harness-mirror/1.0 (research use; ford@lascari.ai)"


def load_jsonl(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_index():
    rows = load_jsonl(DATA / "index.jsonl")
    if not rows:
        raise SystemExit(
            "index.jsonl missing or empty — run commands/mirror.py first")
    return rows


def find_page(index, title):
    """Exact, then case-insensitive, then substring title match."""
    for row in index:
        if row["title"] == title:
            return row
    low = title.lower()
    for row in index:
        if row["title"].lower() == low:
            return row
    hits = [r for r in index if low in r["title"].lower()]
    return hits[0] if len(hits) == 1 else None


def page_text(row):
    return (SOURCE_DIR / row["path"]).read_text(encoding="utf-8")


def split_sections(text):
    """Return [(heading_or_'', body), ...] preserving order."""
    parts = re.split(r"^(==+\s*[^=]+?\s*==+)\s*$", text, flags=re.M)
    out = [("", parts[0])]
    for i in range(1, len(parts), 2):
        heading = parts[i].strip("= ").strip()
        out.append((heading, parts[i + 1] if i + 1 < len(parts) else ""))
    return out
