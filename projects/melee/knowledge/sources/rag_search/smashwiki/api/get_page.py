#!/usr/bin/env python3
"""Fetch one mirrored page (or one section of it) as wikitext.

  python3 api/get_page.py --title "Kirby (SSBM)/Up tilt"
  python3 api/get_page.py --title "Kirby (SSBM)/Up tilt" --sections
  python3 api/get_page.py --title "Kirby (SSBM)/Up tilt" --section Hitboxes
"""

import argparse

from _smashwiki import find_page, load_index, page_text, split_sections


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True)
    ap.add_argument("--section", help="print only this section (fuzzy match)")
    ap.add_argument("--sections", action="store_true",
                    help="list section headings only")
    args = ap.parse_args()

    index = load_index()
    row = find_page(index, args.title)
    if row is None:
        cands = [r["title"] for r in index
                 if args.title.lower() in r["title"].lower()][:10]
        raise SystemExit("Page not found. Candidates:\n  " + "\n  ".join(cands)
                         if cands else f"Page not found: {args.title}")

    text = page_text(row)
    if args.sections:
        print(row["title"], "-", row["url"])
        for heading, body in split_sections(text):
            print(f"  {heading or '(lead)'} ({len(body)} chars)")
        return
    if args.section:
        want = args.section.lower()
        for heading, body in split_sections(text):
            if want in heading.lower():
                print(f"== {heading} ==\n{body.strip()}")
                return
        raise SystemExit(f"No section matching {args.section!r} in {row['title']} "
                         f"(have: {', '.join(row['sections'])})")
    print(text)


if __name__ == "__main__":
    main()
