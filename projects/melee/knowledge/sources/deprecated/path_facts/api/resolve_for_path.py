#!/usr/bin/env python3
import argparse

from _path_facts import print_json, resolve_for_path


parser = argparse.ArgumentParser()
parser.add_argument("--path", required=True)
parser.add_argument("--limit", type=int, default=5)
parser.add_argument("--json", action="store_true")
args = parser.parse_args()

print_json(resolve_for_path(args.path, args.limit), args.json)

