#!/usr/bin/env python3
"""Search the mirrored SmashWiki corpus.

Title/summary match by default; --content greps page bodies too.

  python3 api/search.py --query "final cutter hitbox"
  python3 api/search.py --query "wavedash" --content --limit 5 --json
"""

import argparse
import json
import re

from _smashwiki import load_index, page_text


def score_row(row, terms):
    title = row["title"].lower()
    hay = title + " " + row.get("summary", "").lower() + " " + \
        " ".join(row.get("sections", [])).lower()
    score = 0
    for t in terms:
        if t in title:
            score += 10
        elif t in hay:
            score += 3
    if all(t in hay for t in terms):
        score += 5
    return score


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--content", action="store_true",
                    help="also grep page bodies (slower)")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    terms = [t.lower() for t in re.findall(r"\w+", args.query)]
    index = load_index()
    scored = [(score_row(r, terms), r) for r in index]

    if args.content:
        for i, (s, row) in enumerate(scored):
            if s > 0:
                continue
            body = page_text(row).lower()
            hits = sum(body.count(t) for t in terms)
            if hits and all(t in body for t in terms):
                scored[i] = (2 + min(hits, 5), row)

    scored = sorted((x for x in scored if x[0] > 0),
                    key=lambda x: -x[0])[:args.limit]

    if args.json:
        print(json.dumps([
            {"title": r["title"], "score": s, "path": r["path"],
             "url": r["url"], "sections": r["sections"],
             "summary": r.get("summary", "")}
            for s, r in scored], ensure_ascii=False, indent=2))
        return
    for s, r in scored:
        print(f"[{s:>3}] {r['title']}")
        print(f"      {r['path']}  sections: {', '.join(r['sections'][:8])}")


if __name__ == "__main__":
    main()
