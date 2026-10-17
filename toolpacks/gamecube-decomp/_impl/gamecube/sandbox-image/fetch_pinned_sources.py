#!/usr/bin/env python3
"""Fetch locked git sources into the sandbox image (pinned-sources stage).

Usage: fetch_pinned_sources.py LOCK DEST [--flat] [--strip-git] [--stamp NAME]

LOCK maps a name to {"repo", "commit", "paths"} (the image uses it for
`refs.lock.json`; /opt/mwcc comes from `tools/fetch_mwcc_ref.sh`). Each entry becomes DEST/<name>, or DEST itself with --flat
(single-entry locks only): a shallow (depth 1), blob-filtered, sparse checkout
of the locked commit limited to the locked paths, the same approach as
`tools/fetch_jsystem_refs.sh` and `tools/fetch_mwcc_ref.sh`. HEAD must equal
the locked commit and every locked path must exist, else the fetch fails.

--strip-git drops the .git directory afterwards (images carry the files only);
--stamp NAME writes NAME as {"repo","commit","paths"} into each checkout so the
commit stays recorded (`compiler_ref.py` reads `.mwcc-ref`). A destination whose
stamp or HEAD already names the locked commit is left alone.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def git(cwd, *args):
    return subprocess.run(['git', '-C', str(cwd), *args], check=True,
                          stdout=subprocess.PIPE, text=True).stdout.strip()


def current_commit(target, stamp):
    if stamp and (target / stamp).is_file():
        try:
            return json.loads((target / stamp).read_text(encoding='utf-8')).get('commit')
        except (OSError, ValueError):
            return None
    if (target / '.git').is_dir():
        try:
            return git(target, 'rev-parse', 'HEAD')
        except subprocess.CalledProcessError:
            return None
    return None


def fetch(name, entry, target, strip_git, stamp):
    repo, commit, paths = entry['repo'], entry['commit'], list(entry['paths'])
    if not paths or len(commit) != 40:
        raise SystemExit(f'{name}: lock entry needs a full commit and at least one path')
    if current_commit(target, stamp) == commit:
        print(f'{name}: already at {commit[:8]} -> {target}')
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=f'.{name}.', dir=target.parent))
    try:
        git(work, 'init', '-q')
        git(work, 'remote', 'add', 'origin', repo)
        git(work, 'config', 'remote.origin.promisor', 'true')
        git(work, 'config', 'remote.origin.partialclonefilter', 'blob:none')
        git(work, 'sparse-checkout', 'init', '--cone')
        git(work, 'sparse-checkout', 'set', *paths)
        git(work, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit)
        git(work, 'checkout', '-q', '--detach', 'FETCH_HEAD')
        got = git(work, 'rev-parse', 'HEAD')
        if got != commit:
            raise SystemExit(f'{name}: fetched {got}, expected {commit}')
        missing = [path for path in paths if not (work / path).exists()]
        if missing:
            raise SystemExit(f'{name}: {commit} has no {", ".join(missing)}')
        if stamp:
            (work / stamp).write_text(json.dumps({'repo': repo, 'commit': commit, 'paths': paths}) + '\n',
                                      encoding='utf-8')
        if strip_git:
            shutil.rmtree(work / '.git')
        # mkdtemp makes the directory 0700; the sandbox user reads the image copy.
        os.chmod(work, 0o755)
        shutil.rmtree(target, ignore_errors=True)
        work.rename(target)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print(f'{name}: {commit[:8]} -> {target} ({" ".join(paths)})')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('lock', type=Path)
    parser.add_argument('dest', type=Path)
    parser.add_argument('--flat', action='store_true', help='place a single-entry lock directly at DEST')
    parser.add_argument('--strip-git', action='store_true')
    parser.add_argument('--stamp', default='')
    args = parser.parse_args(argv)
    lock = json.loads(args.lock.read_text(encoding='utf-8'))
    if not isinstance(lock, dict) or not lock:
        raise SystemExit(f'{args.lock}: expected a non-empty object of locked sources')
    if args.flat and len(lock) != 1:
        raise SystemExit(f'{args.lock}: --flat needs exactly one entry, found {len(lock)}')
    for name, entry in sorted(lock.items()):
        target = args.dest if args.flat else args.dest / name
        fetch(name, entry, target.resolve(), args.strip_git, args.stamp)


if __name__ == '__main__':
    sys.exit(main())
