#!/usr/bin/env python3
"""Map a decomp source path to its relevant SmashWiki pages.

Uses data/crosswalk.jsonl: each row has scope_globs plus exact page titles
and/or title prefixes (prefixes expand to every mirrored subpage, e.g.
"Kirby (SSBM)/" -> all of Kirby's move/hitbox subpages).

  python3 api/resolve_for_path.py --path src/melee/ft/chara/ftKirby/ftkirbyspecialhi.c
  python3 api/resolve_for_path.py --path src/melee/gr/grizumi.c --json
"""

import argparse
import fnmatch
import json

from _smashwiki import DATA, load_index, load_jsonl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", required=True)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    crosswalk = load_jsonl(DATA / "crosswalk.jsonl")
    if not crosswalk:
        raise SystemExit("crosswalk.jsonl missing")
    index = load_index()
    by_title = {r["title"]: r for r in index}

    path = args.path.lstrip("./")
    out = []
    for row in crosswalk:
        if not any(fnmatch.fnmatch(path, g) for g in row["scope_globs"]):
            continue
        titles = [t for t in row.get("titles", []) if t in by_title]
        for prefix in row.get("prefixes", []):
            titles += [r["title"] for r in index
                       if r["title"].startswith(prefix) and r["title"] not in titles]
        out.append({
            "note": row.get("note", ""),
            "pages": [{"title": t, "path": by_title[t]["path"],
                       "url": by_title[t]["url"]} for t in titles],
        })

    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return
    if not out:
        print(f"no crosswalk entries for {path}")
        return
    for row in out:
        if row["note"]:
            print(f"# {row['note']}")
        for p in row["pages"]:
            print(f"  {p['title']:<48} {p['path']}")


if __name__ == "__main__":
    main()
