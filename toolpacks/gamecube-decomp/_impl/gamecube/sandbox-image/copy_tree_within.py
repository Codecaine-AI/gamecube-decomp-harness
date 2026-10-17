#!/usr/bin/env python3
"""Copy a harness tree into the bundle, dereferencing symlinks only inside ROOT.

Usage: copy_tree_within.py ROOT SRC DEST [--exclude NAME_GLOB]...

Walks SRC following every symlink (files and directories, nested to any
depth) and builds the full inventory first: each entry's real path must lie
inside the real ROOT, and a directory that is its own ancestor (a link loop)
is an error. Only when the whole inventory is valid are its files copied to
DEST as regular files at their logical paths. Entries whose name matches an
--exclude glob are skipped at any depth (directories with their contents).
SRC may be a single file. A missing SRC copies nothing.
"""
import argparse
import fnmatch
import os
import shutil
import sys
from pathlib import Path


def inside(root, path):
    return path == root or path.startswith(root + os.sep)


def inventory(root, src, excludes):
    files = []

    def visit(logical, path, ancestors):
        real = os.path.realpath(path)
        if not inside(root, real):
            raise SystemExit(f'symlink leaves the harness root: {path} -> {real}')
        if os.path.isdir(real):
            if real in ancestors:
                raise SystemExit(f'symlink loop: {path} -> {real}')
            for name in sorted(os.listdir(real)):
                if any(fnmatch.fnmatchcase(name, pattern) for pattern in excludes):
                    continue
                visit(f'{logical}/{name}' if logical else name, os.path.join(path, name), ancestors | {real})
        elif os.path.isfile(real):
            files.append((logical, real))
        elif os.path.lexists(path):
            raise SystemExit(f'not a regular file or directory (dangling link?): {path}')

    visit('', src, frozenset())
    return files


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('root')
    parser.add_argument('src')
    parser.add_argument('dest', type=Path)
    parser.add_argument('--exclude', action='append', default=[])
    args = parser.parse_args(argv)
    root = os.path.realpath(args.root)
    if not os.path.lexists(args.src):
        return 0
    files = inventory(root, args.src, args.exclude)
    for logical, real in files:
        target = args.dest / logical if logical else args.dest
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(real, target)
    return 0


if __name__ == '__main__':
    sys.exit(main())
