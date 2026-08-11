#!/usr/bin/env python3
"""Mirror the Melee-scoped slice of SmashWiki (www.ssbwiki.com) via the MediaWiki API.

Discovery walks seed categories (characters + per-character subcategories,
stages, items, techniques) plus a curated extra-page list. Page text is
fetched as raw wikitext in batches of 50 titles and written one file per page
under data/pages/. File (image/GIF) metadata is recorded in
data/manifest/files.jsonl; binaries are NOT downloaded unless
--prefetch-media is given (use api/get_media.py for lazy per-file fetch).

Parallelism is a small thread pool over batched requests with maxlag and
Retry-After handling, which keeps us fast without hammering the wiki.

Usage:
  python3 commands/mirror.py                 # discover + fetch text + manifests
  python3 commands/mirror.py --discover-only
  python3 commands/mirror.py --prefetch-media 'Hitbox|hitbox'   # bulk media by regex
  python3 commands/mirror.py --workers 4
"""

import argparse
import concurrent.futures as cf
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://www.ssbwiki.com/api.php"
UA = "gamecube-decomp-harness-mirror/1.0 (research use; ford@lascari.ai)"
SOURCE_DIR = Path(__file__).resolve().parent.parent
DATA = SOURCE_DIR / "data"
PAGES = DATA / "pages"
MEDIA = DATA / "media"
MANIFEST = DATA / "manifest"

SEED_CATEGORIES = [
    # The whole SSBM category tree (characters, stages, items, techniques,
    # attacks, event matches, Pokémon, music, modes, trophies, media cats...)
    "Category:Super Smash Bros. Melee",
    "Category:Characters (SSBM)",
    "Category:Stages (SSBM)",
    "Category:Items (SSBM)",
    "Category:Techniques (SSBM)",
    "Category:Glitches (SSBM)",
]

# Non-seed subcategories are only descended into if they look Melee-scoped
# (prevents drifting into other games via shared categories), with a short
# allowlist for known-good generic subcats.
SCOPE_CAT_RE = re.compile(r"ssbm|melee|hitbox", re.I)
ALLOW_CATS = {
    "Category:Slide techniques",
    "Category:Fighting Wire Frames",
    "Category:Classic Mode poses",
    "Category:Special Movie title cards",
}

# Pages worth having that the seed categories don't reliably cover.
EXTRA_PAGES = [
    "Super Smash Bros. Melee",
    "Adventure Mode",
    "Classic Mode (SSBM)",
    "All-Star Mode",
    "Event match",
    "Home-Run Contest",
    "Multi-Man Melee",
    "Race to the Finish (SSBM)",
    "Snag the Trophies",
    "Lottery",
    "Special Melee",
    "Tournament mode",
    "Debug menu (SSBM)",
    "Debug menu (SSBM)/Stage data",
    "Debug menu (SSBM)/Codes",
    "Debug menu (SSBM)/DEVELOP mode",
    "Debug menu (SSBM)/Full stage selector",
    "Unused content (SSBM)",
    "List of regional version differences (SSBM)",
    "Character matchup (SSBM)",
    "Tier list",
    "List of SSBM tier lists (PAL)",
    "List of meteor smashes (SSBM)",
    "List of semi-spikes (SSBM)",
    "List of trophies by unlock criteria (SSBM)",
    "List of staff (SSBM)",
    "Randomness",
    "Dark Link",
    "Stale-move negation",
    "Hitbox",
    "Hurtbox",
    "Hitstun",
    "Hitlag",
    "Knockback",
    "Damage",
    "Priority",
    # Series-wide fighter attributes & mechanics (Melee sections have
    # per-character stat tables); redirects resolve title variants.
    "Weight",
    "Falling speed",
    "Fast falling",
    "Air speed",
    "Air acceleration",
    "Walking speed",
    "Dash",
    "Traction",
    "Gravity",
    "Jump",
    "Double jump",
    "Jumpsquat",
    "Freeze frame",
    "Angle",
    "Sakurai angle",
    "Sex kick",
    "Disjoint",
    "Invincibility",
    "Intangibility",
    "Armor",
    "Helpless",
    "Tumble",
    "Reflection",
    "Absorption",
    "Shieldstun",
    "Landing lag",
    "Lag",
    "Interruptibility",
    "Out of shield",
    "Sweet spot",
    "Sour spot",
    "Port priority",
    "Team attack",
    "Handicap",
    "Stock",
    "Sudden Death",
    "Shield",
    "Grab",
    "Throw",
    "Edge",
    "Blast line",
    "Trophy",
    "Crowd cheer",
    "Announcer",
]

# Category names matching these are never descended into.
SKIP_CAT_RE = re.compile(r"players|smashers|professionals", re.I)


def api_get(params, retries=5):
    params = dict(params, format="json", maxlag="5")
    url = API + "?" + urllib.parse.urlencode(params)
    delay = 2.0
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            err = data.get("error", {})
            if err.get("code") == "maxlag":
                time.sleep(delay)
                delay *= 2
                continue
            if err:
                raise RuntimeError(f"API error: {err}")
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                wait = float(e.headers.get("Retry-After") or delay)
                time.sleep(wait)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"API gave up after {retries} retries: {params}")


def cat_members(cat):
    """Return (pages, subcats, files) for one category, following pagination."""
    pages, subcats, files = [], [], []
    cont = {}
    while True:
        data = api_get({
            "action": "query", "list": "categorymembers",
            "cmtitle": cat, "cmlimit": "500",
            "cmprop": "title|ns", **cont,
        })
        for m in data["query"]["categorymembers"]:
            if m["ns"] == 0:
                pages.append(m["title"])
            elif m["ns"] == 14:
                subcats.append(m["title"])
            elif m["ns"] == 6:
                files.append(m["title"])
        cont = data.get("continue")
        if not cont:
            return pages, subcats, files
        cont.pop("continue", None)


def discover(workers):
    """Walk seeds one level deep. Returns (page->cats map, file->cats map)."""
    page_cats, file_cats = {}, {}

    def note(titles, cat, store):
        for t in titles:
            store.setdefault(t, []).append(cat)

    print("discovering categories...", flush=True)
    to_walk = list(SEED_CATEGORIES)
    walked = set()
    while to_walk:
        batch, to_walk = to_walk, []
        with cf.ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(lambda c: (c, cat_members(c)), batch))
        for cat, (pages, subcats, files) in results:
            walked.add(cat)
            note(pages, cat, page_cats)
            note(files, cat, file_cats)
            for sc in subcats:
                if sc in walked or sc in to_walk or SKIP_CAT_RE.search(sc):
                    continue
                if SCOPE_CAT_RE.search(sc) or sc in ALLOW_CATS:
                    to_walk.append(sc)
        print(f"  walked {len(walked)} categories, {len(page_cats)} pages so far", flush=True)

    for t in EXTRA_PAGES:
        page_cats.setdefault(t, []).append("_extra")
    return page_cats, file_cats


def safe_name(title):
    s = title.replace("/", "%2F").replace(":", "%3A").replace(" ", "_")
    return re.sub(r'[<>"\\|?*]', "_", s)


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


STRIP_RE = re.compile(r"\{\{[^{}]*\}\}|\[\[(?:File|Image):[^\]]*\]\]|<[^>]+>|'''?")
LINK_RE = re.compile(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")


def summarize(wikitext):
    text = wikitext
    for _ in range(3):
        text = STRIP_RE.sub("", text)
    text = LINK_RE.sub(r"\1", text)
    for line in text.splitlines():
        line = line.strip()
        if len(line) > 60 and not line.startswith(("|", "{", "!", "==", "*", "#")):
            return (line[:300] + "…") if len(line) > 300 else line
    return ""


def fetch_pages(titles_cats, workers):
    PAGES.mkdir(parents=True, exist_ok=True)
    MANIFEST.mkdir(parents=True, exist_ok=True)
    titles = sorted(titles_cats)
    index, missing = [], []

    def fetch_batch(batch):
        return api_get({
            "action": "query", "prop": "revisions|info",
            "rvslots": "main", "rvprop": "content|ids",
            "inprop": "url", "redirects": "1",
            "titles": "|".join(batch),
        })

    print(f"fetching {len(titles)} pages in batches of 50...", flush=True)
    batches = list(chunked(titles, 50))
    done = 0
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        for data in pool.map(fetch_batch, batches):
            q = data["query"]
            redirected = {r["from"]: r["to"] for r in q.get("redirects", [])}
            for page in q.get("pages", {}).values():
                title = page.get("title", "")
                if "missing" in page or "revisions" not in page:
                    missing.append(title)
                    continue
                rev = page["revisions"][0]
                text = rev["slots"]["main"]["*"]
                fname = safe_name(title) + ".wiki"
                cats = sorted({c for t in [title] + [f for f, to in redirected.items() if to == title]
                               for c in titles_cats.get(t, [])})
                head = (f"<!-- title: {title}\n     url: {page.get('fullurl', '')}\n"
                        f"     revid: {rev.get('revid')}\n     mirrored: {time.strftime('%Y-%m-%d')}\n"
                        f"     license: CC BY-SA (SmashWiki) — attribution required -->\n")
                (PAGES / fname).write_text(head + text, encoding="utf-8")
                index.append({
                    "title": title,
                    "path": f"data/pages/{fname}",
                    "url": page.get("fullurl", ""),
                    "revid": rev.get("revid"),
                    "cats": cats,
                    "sections": re.findall(r"^==+\s*([^=]+?)\s*==+\s*$", text, re.M),
                    "summary": summarize(text),
                    "bytes": len(text),
                })
            done += 1
            if done % 8 == 0 or done == len(batches):
                print(f"  {done}/{len(batches)} batches", flush=True)

    index.sort(key=lambda r: r["title"])
    with open(DATA / "index.jsonl", "w", encoding="utf-8") as f:
        for row in index:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    (MANIFEST / "missing.json").write_text(json.dumps(sorted(missing), indent=2))
    print(f"wrote {len(index)} pages, {len(missing)} missing/skipped", flush=True)
    return index


def fetch_file_manifest(file_cats, workers):
    """Resolve download URL + size/mime for every File: title (no binaries)."""
    MANIFEST.mkdir(parents=True, exist_ok=True)
    files = sorted(file_cats)
    rows = []

    def fetch_batch(batch):
        return api_get({
            "action": "query", "prop": "imageinfo",
            "iiprop": "url|size|mime", "titles": "|".join(batch),
        })

    print(f"resolving {len(files)} media files...", flush=True)
    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        for data in pool.map(fetch_batch, list(chunked(files, 50))):
            for page in data["query"].get("pages", {}).values():
                title = page.get("title", "")
                info = (page.get("imageinfo") or [{}])[0]
                if not info.get("url"):
                    continue
                rows.append({
                    "title": title,
                    "url": info["url"],
                    "bytes": info.get("size", 0),
                    "mime": info.get("mime", ""),
                    "cats": sorted(file_cats.get(title, [])),
                })
    rows.sort(key=lambda r: r["title"])
    with open(MANIFEST / "files.jsonl", "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    total = sum(r["bytes"] for r in rows)
    print(f"manifest: {len(rows)} files, {total / 1e6:.0f} MB if fully downloaded", flush=True)
    return rows


def prefetch_media(rows, pattern, workers):
    MEDIA.mkdir(parents=True, exist_ok=True)
    rx = re.compile(pattern, re.I)
    picked = [r for r in rows if rx.search(r["title"])]
    total = sum(r["bytes"] for r in picked)
    print(f"prefetching {len(picked)} files matching /{pattern}/ ({total / 1e6:.0f} MB)...", flush=True)

    def grab(row):
        out = MEDIA / safe_name(row["title"].split(":", 1)[1])
        if out.exists() and out.stat().st_size == row["bytes"]:
            return 0
        req = urllib.request.Request(row["url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as resp:
            out.write_bytes(resp.read())
        time.sleep(0.2)
        return 1

    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        fetched = sum(pool.map(grab, picked))
    print(f"downloaded {fetched} new files to {MEDIA}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--discover-only", action="store_true")
    ap.add_argument("--prefetch-media", metavar="REGEX",
                    help="also download media whose File: title matches REGEX")
    args = ap.parse_args()

    page_cats, file_cats = discover(args.workers)
    print(f"discovered {len(page_cats)} pages, {len(file_cats)} media files")
    if args.discover_only:
        for t in sorted(page_cats):
            print(" ", t)
        return

    fetch_pages(page_cats, args.workers)
    rows = fetch_file_manifest(file_cats, args.workers)
    if args.prefetch_media:
        prefetch_media(rows, args.prefetch_media, args.workers)


if __name__ == "__main__":
    sys.exit(main())
