#!/usr/bin/env python3
"""Capture a game-scoped MediaWiki category tree, page sources, HTML, and media.

The source definition owns the scope. The helper supplies acquisition for the
existing local-mirror import adapter. API responses and per-item records make
an interrupted capture resumable. Use a new output directory for a new capture.
No knowledge database or librarian is invoked here.
"""

import argparse
import concurrent.futures as futures
import hashlib
import html
import json
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


def filename(title):
    stem = re.sub(r'[^\w.()-]+', '_', title, flags=re.UNICODE)[:90]
    return stem + '-' + hashlib.sha256(title.encode()).hexdigest()[:16]


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def sha_file(path, algorithm='sha256'):
    digest = hashlib.new(algorithm)
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def media_valid(path, row):
    if not path.is_file() or path.stat().st_size != row['bytes']:
        return False
    # MediaWiki API uses a hexadecimal SHA-1 for imageinfo.
    expected = row.get('sha1', '')
    if expected and not re.fullmatch(r'[0-9a-f]{40}', expected):
        expected = format(int(expected, 36), '040x')
    return bool(expected) and sha_file(path, 'sha1') == expected


class LocalLinks(HTMLParser):
    """Make captured page and media links resolve inside the local archive."""
    def __init__(self, upstream, pages, media):
        super().__init__(convert_charrefs=False)
        self.upstream, self.pages, self.media = upstream, pages, media
        self.output = []

    def local(self, value):
        parsed = urllib.parse.urlparse(urllib.parse.urljoin(self.upstream, value))
        segments = [urllib.parse.unquote(s).replace('_', ' ') for s in parsed.path.split('/')]
        for segment in segments:
            if segment in self.media:
                return '../' + self.media[segment]
        if parsed.netloc == urllib.parse.urlparse(self.upstream).netloc:
            title = urllib.parse.parse_qs(parsed.query).get('title', [urllib.parse.unquote(parsed.path.lstrip('/'))])[0]
            title = title.replace('_', ' ')
            if title in self.pages:
                return Path(self.pages[title]).name + ('#' + parsed.fragment if parsed.fragment else '')
        return urllib.parse.urljoin(self.upstream, value) if value.startswith(('/', '?')) else value

    def tag(self, tag, attrs, closed=False):
        result = []
        for key, value in attrs:
            if key == 'srcset':
                continue
            if value is not None and key in ('href', 'src', 'poster'):
                value = self.local(value)
            result.append(' ' + key + ('="' + html.escape(value, quote=True) + '"' if value is not None else ''))
        self.output.append('<' + tag + ''.join(result) + (' />' if closed else '>'))

    def handle_starttag(self, tag, attrs): self.tag(tag, attrs)
    def handle_startendtag(self, tag, attrs): self.tag(tag, attrs, True)
    def handle_endtag(self, tag): self.output.append('</' + tag + '>')
    def handle_data(self, data): self.output.append(data)
    def handle_entityref(self, name): self.output.append('&' + name + ';')
    def handle_charref(self, name): self.output.append('&#' + name + ';')
    def handle_comment(self, data): self.output.append('<!--' + data + '-->')


class Mirror:
    def __init__(self, config, root, workers=3):
        self.config, self.root, self.workers = config, root, workers
        self.scope = config['configuration']['scope']
        self.api_url = self.scope['api']
        self.upstream = config['identity']['upstream']
        self.ua = 'GameKeep-MediaWiki-Mirror/1.0 (local research archive; 3 concurrent requests)'
        root.mkdir(parents=True, exist_ok=True)
        config_path = root / 'source-definition.json'
        if config_path.exists() and json.loads(config_path.read_text()) != config:
            raise ValueError('Capture configuration changed. Choose a new --output directory.')
        save_json(config_path, config)

    def request(self, url):
        for attempt in range(6):
            try:
                return urllib.request.urlopen(urllib.request.Request(url, headers={
                    'User-Agent': self.ua, 'Cache-Control': 'no-transform', 'Accept-Encoding': 'identity'}), timeout=60)
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 5:
                    raise
                wait = error.headers.get('Retry-After', '')
                time.sleep(float(wait) if wait.isdigit() else min(2 ** (attempt + 1), 30))
            except (urllib.error.URLError, TimeoutError):
                if attempt == 5:
                    raise
                time.sleep(min(2 ** (attempt + 1), 30))

    def api(self, **params):
        params.update(format='json', maxlag=5)
        key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
        cache = self.root / 'api' / (key + '.json')
        if cache.exists():
            return json.loads(cache.read_text())
        for attempt in range(6):
            with self.request(self.api_url + '?' + urllib.parse.urlencode(params)) as response:
                result = json.load(response)
            if result.get('error', {}).get('code') == 'maxlag':
                time.sleep(min(2 ** (attempt + 1), 30))
                continue
            if 'error' in result:
                raise RuntimeError(result['error'])
            save_json(cache, result)
            time.sleep(.1)
            return result
        raise RuntimeError('MediaWiki maxlag retry budget exhausted')

    def paginated(self, **params):
        while True:
            result = self.api(**params)
            yield result
            if 'continue' not in result:
                return
            params.update(result['continue'])

    def category(self, title):
        members = []
        for result in self.paginated(action='query', list='categorymembers', cmtitle=title, cmlimit=500):
            members.extend(result['query']['categorymembers'])
        return title, members

    def discover(self):
        pending = set(self.scope['seed_categories'])
        categories, pages, media = set(), set(self.scope['seed_pages']), set()
        edges = []
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            while pending:
                batch = sorted(pending - categories)
                if not batch:
                    break
                pending.clear()
                for category, members in pool.map(self.category, batch):
                    categories.add(category)
                    pages.add(category)
                    for member in members:
                        title, ns = member['title'], member['ns']
                        edges.append({'category': category, **member})
                        if ns == 14 and title not in categories:
                            pending.add(title)
                        elif ns == 6:
                            media.add(title)
                        else:
                            pages.add(title)
                print(f'Discovery: {len(categories)} categories, {len(pages)} pages, {len(media)} media', flush=True)
        plan = {'categories': sorted(categories), 'pages': sorted(pages), 'media': sorted(media), 'edges': edges}
        save_json(self.root / 'manifest/discovery.json', plan)
        return plan

    def source_batch(self, titles, folder):
        result = self.api(action='query', prop='revisions|info', titles='|'.join(titles), redirects=1,
                          rvslots='main', rvprop='content|ids|timestamp', inprop='url')
        rows, missing = [], []
        for page in result['query']['pages'].values():
            if 'missing' in page or not page.get('revisions'):
                missing.append(page['title'])
                continue
            revision = page['revisions'][0]
            text = revision['slots']['main']['*']
            rel = folder + '/' + filename(page['title']) + '.wiki'
            output = self.root / rel
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(text)
            rows.append({'title': page['title'], 'pageid': page['pageid'], 'ns': page['ns'], 'path': rel,
                         'url': page.get('fullurl'), 'revid': revision['revid'], 'timestamp': revision['timestamp'],
                         'sections': re.findall(r'^==+\s*([^=]+?)\s*==+\s*$', text, re.M),
                         'bytes': output.stat().st_size, 'sha256': sha_file(output)})
        return rows, missing, result['query'].get('redirects', [])

    def sources(self, titles, folder):
        rows, missing, redirects = {}, [], []
        batches = [sorted(titles)[i:i+30] for i in range(0, len(titles), 30)]
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            for new, absent, aliases in pool.map(lambda batch: self.source_batch(batch, folder), batches):
                rows.update({row['title']: row for row in new})
                missing.extend(absent)
                redirects.extend(aliases)
        return list(rows.values()), missing, redirects

    def render(self, row):
        parsed = self.api(action='parse', oldid=row['revid'], prop='text|images|templates|externallinks|sections')['parse']
        rel = 'html/' + filename(row['title']) + '.html'
        out = self.root / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        body = parsed['text']['*']
        out.write_text('<!doctype html><meta charset="utf-8"><title>' + html.escape(row['title']) +
                       '</title><base href="' + html.escape(self.upstream) + '/">' + body)
        return {**row, 'html_path': rel, 'html_sha256': sha_file(out),
                'images': ['File:' + x for x in parsed.get('images', [])],
                'templates': [x['*'] for x in parsed.get('templates', [])],
                'external_links': parsed.get('externallinks', [])}

    def file_batch(self, titles):
        rows, missing = [], []
        for result in self.paginated(action='query', prop='imageinfo', titles='|'.join(titles),
                                     iiprop='url|size|mime|sha1|timestamp|extmetadata', iilimit=1):
            for page in result['query']['pages'].values():
                info = (page.get('imageinfo') or [{}])[0]
                if not info.get('url'):
                    missing.append(page['title'])
                    continue
                ext = Path(urllib.parse.urlparse(info['url']).path).suffix
                rows.append({'title': page['title'], 'url': info['url'], 'description_url': info.get('descriptionurl'),
                             'bytes': info['size'], 'mime': info['mime'], 'sha1': info['sha1'],
                             'timestamp': info['timestamp'], 'metadata': info.get('extmetadata', {}),
                             'path': 'media/' + filename(page['title']) + ext})
        return rows, missing

    def download(self, row):
        output = self.root / row['path']
        if media_valid(output, row):
            return row
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + '.part')
        for attempt in range(3):
            try:
                # A CDN's cached display image can differ from MediaWiki's original.
                # Request the downloadable original and still require its API hash.
                url = row['url'] + ('&' if '?' in row['url'] else '?') + 'download=1'
                if attempt:
                    # Optimized CDN responses can remain cached even with no-transform.
                    # Retry a fresh cache key, while requiring the same original hash.
                    url += '&gamekeep_original=' + urllib.parse.quote(row['sha1']) + '-' + str(attempt)
                with self.request(url) as source, temporary.open('wb') as target:
                    shutil.copyfileobj(source, target)
                if not media_valid(temporary, row):
                    raise RuntimeError('Size or SHA-1 mismatch: ' + row['title'])
                temporary.replace(output)
                return row
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)

    def run(self, inventory_only=False):
        save_json(self.root / 'capture-manifest.json', {'identity': self.config['identity'], 'complete': False})
        plan = self.discover()
        rows, missing, redirects = self.sources(plan['pages'], 'pages')
        rendered, failures = [], []
        print(f'Capturing rendered HTML and dependencies for {len(rows)} pages', flush=True)
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            jobs = {pool.submit(self.render, row): row for row in rows}
            for job in futures.as_completed(jobs):
                try:
                    rendered.append(job.result())
                except Exception as error:
                    failures.append({'stage': 'render', 'title': jobs[job]['title'], 'error': str(error)})
                if (len(rendered) + len(failures)) % 50 == 0:
                    print(f'HTML: {len(rendered)}/{len(rows)}, failures {len(failures)}', flush=True)
        files = sorted(set(plan['media']) | {f for row in rendered for f in row['images']})
        templates = {t for row in rendered for t in row['templates']}
        deps, absent, aliases = self.sources(templates | set(files), 'dependencies')
        missing.extend(absent)
        redirects.extend(aliases)
        save_json(self.root / 'manifest/dependencies.json', deps)
        save_json(self.root / 'manifest/redirects.json', redirects)
        save_json(self.root / 'manifest/pages.json', rendered)
        self.jsonlines('index.jsonl', sorted(rows, key=lambda row: row['title']))
        media = {}
        batches = [files[i:i+30] for i in range(0, len(files), 30)]
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            for batch_rows, absent in pool.map(self.file_batch, batches):
                media.update({row['title']: row for row in batch_rows})
                missing.extend(absent)
        media = sorted(media.values(), key=lambda row: row['title'])
        self.jsonlines('manifest/files.jsonl', media)
        total = sum(row['bytes'] for row in media)
        print(f'Media inventory: {len(media)} files, {total / 1e9:.3f} GB; {len(deps)} dependency sources', flush=True)
        if inventory_only:
            save_json(self.root / 'manifest/missing.json', sorted(set(missing)))
            save_json(self.root / 'manifest/failures.json', failures)
            return
        if shutil.disk_usage(self.root).free < total + 1024**3:
            raise RuntimeError('Insufficient free disk space for media and a 1 GiB reserve')
        downloaded = []
        with futures.ThreadPoolExecutor(max_workers=self.workers) as pool:
            jobs = {pool.submit(self.download, row): row for row in media}
            for job in futures.as_completed(jobs):
                try:
                    downloaded.append(job.result())
                except Exception as error:
                    failures.append({'stage': 'media', 'title': jobs[job]['title'], 'error': str(error)})
                if len(downloaded) % 100 == 0:
                    print(f'Media: {len(downloaded)}/{len(media)}, failures {len(failures)}', flush=True)
        for row in rows + deps:
            if sha_file(self.root / row['path']) != row['sha256']:
                failures.append({'stage': 'verify', 'title': row['title'], 'error': 'Source SHA-256 mismatch'})
        for row in rendered:
            if sha_file(self.root / row['html_path']) != row['html_sha256']:
                failures.append({'stage': 'verify', 'title': row['title'], 'error': 'HTML SHA-256 mismatch'})
        save_json(self.root / 'manifest/missing.json', sorted(set(missing)))
        save_json(self.root / 'manifest/failures.json', failures)
        summary = {'identity': self.config['identity'], 'complete': not missing and not failures and len(rendered) == len(rows),
                   'item_count': len(rows), 'pages': len(rows), 'rendered_pages': len(rendered), 'dependencies': len(deps),
                   'media_expected': len(media), 'media_downloaded': len(downloaded), 'media_bytes': total,
                   'missing': len(set(missing)), 'failures': len(failures), 'captured_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                   'scope': 'Current revisions in the seed category tree, complete pages, parsed HTML, transcluded source dependencies, and all discovered media. External websites and historical revisions are not mirrored.'}
        save_json(self.root / 'capture-manifest.json', summary)
        print(json.dumps(summary), flush=True)
        if not summary['complete']:
            raise RuntimeError('Capture incomplete. Inspect manifest/missing.json and manifest/failures.json')

    def jsonlines(self, name, rows):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))

    def offline_html(self):
        rows = json.loads((self.root / 'manifest/pages.json').read_text())
        media = [json.loads(line) for line in (self.root / 'manifest/files.jsonl').read_text().splitlines()]
        pages = {r['title']: r['html_path'] for r in rows}
        for alias in json.loads((self.root / 'manifest/redirects.json').read_text()):
            if alias['to'] in pages:
                pages[alias['from']] = pages[alias['to']]
        files = {r['title'].split(':', 1)[1].replace('_', ' '): r['path'] for r in media if (self.root / r['path']).exists()}
        for row in rows:
            parsed = self.api(action='parse', oldid=row['revid'], prop='text|images|templates|externallinks|sections')['parse']
            parser = LocalLinks(self.upstream, pages, files)
            parser.feed(parsed['text']['*'])
            out = self.root / row['html_path']
            out.write_text('<!doctype html><meta charset="utf-8"><title>' + html.escape(row['title']) +
                           '</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:30px auto;padding:0 20px}'
                           'img,video{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:5px}'
                           '.mw-collapsible-content{display:block!important}</style><p><a href="' + html.escape(row['url']) +
                           '">Original page</a> · Revision ' + str(row['revid']) + '</p>' + ''.join(parser.output))
            row['html_sha256'] = sha_file(out)
        save_json(self.root / 'manifest/pages.json', rows)
        links = ''.join('<li><a href="' + html.escape(r['html_path']) + '">' + html.escape(r['title']) + '</a></li>' for r in sorted(rows, key=lambda r:r['title']))
        (self.root / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Wiki archive</title><h1>Wiki archive</h1><ul>' + links + '</ul>')
        print(f'Offline HTML: {len(rows)} pages, linked to {len(files)} local media files', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--workers', type=int, default=3, choices=range(1, 5))
    parser.add_argument('--inventory-only', action='store_true')
    parser.add_argument('--offline-html-only', action='store_true')
    args = parser.parse_args()
    source = args.source.resolve()
    config = json.loads(source.read_text())
    game_root = source.parent.parent.parent
    output = args.output or game_root / config['configuration']['scope']['capture_root']
    mirror = Mirror(config, output.resolve(), args.workers)
    if args.offline_html_only:
        mirror.offline_html()
    else:
        mirror.run(args.inventory_only)
        if not args.inventory_only:
            mirror.offline_html()


if __name__ == '__main__':
    main()
