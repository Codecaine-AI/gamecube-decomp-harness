#!/usr/bin/env python3
"""Lazily fetch media (images/GIFs) from the manifest into data/media/.

  python3 api/get_media.py --list --match "Kirby.*Hitbox"
  python3 api/get_media.py --file "File:Kirby Back Aerial Hitbox Melee.gif"
  python3 api/get_media.py --match "KirbyUTilt" --fetch

Prints local paths of fetched files (Read them directly to view).
"""

import argparse
import re
import time
import urllib.request

from _smashwiki import DATA, MEDIA, UA, load_jsonl


def safe_name(title):
    s = title.replace("/", "%2F").replace(":", "%3A").replace(" ", "_")
    return re.sub(r'[<>"\\|?*]', "_", s)


def fetch(row):
    MEDIA.mkdir(parents=True, exist_ok=True)
    out = MEDIA / safe_name(row["title"].split(":", 1)[1])
    if out.exists() and out.stat().st_size == row["bytes"]:
        return out
    req = urllib.request.Request(row["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        out.write_bytes(resp.read())
    time.sleep(0.2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="exact File: title to fetch")
    ap.add_argument("--match", help="regex over File: titles")
    ap.add_argument("--list", action="store_true", help="list matches, no download")
    ap.add_argument("--fetch", action="store_true", help="download all matches")
    ap.add_argument("--limit", type=int, default=25)
    args = ap.parse_args()

    manifest = load_jsonl(DATA / "manifest" / "files.jsonl")
    if not manifest:
        raise SystemExit("files.jsonl missing — run commands/mirror.py first")

    if args.file:
        rows = [r for r in manifest if r["title"].lower() == args.file.lower()]
        if not rows:
            raise SystemExit(f"Not in manifest: {args.file}")
        print(fetch(rows[0]))
        return

    if not args.match:
        raise SystemExit("need --file or --match")
    rx = re.compile(args.match, re.I)
    rows = [r for r in manifest if rx.search(r["title"])][:args.limit]
    if args.list or not args.fetch:
        for r in rows:
            print(f"{r['bytes']:>9}  {r['mime']:<12} {r['title']}")
        if not args.fetch:
            print(f"({len(rows)} matches; add --fetch to download)")
        return
    for r in rows:
        print(fetch(r))


if __name__ == "__main__":
    main()
