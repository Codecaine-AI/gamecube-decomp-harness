#!/usr/bin/env python3
import argparse

from _path_facts import print_json, search_facts


parser = argparse.ArgumentParser()
parser.add_argument("--query", required=True)
parser.add_argument("--limit", type=int, default=10)
parser.add_argument("--json", action="store_true")
args = parser.parse_args()

print_json(
    {
        "source": "path_facts",
        "query": args.query,
        "limit": args.limit,
        "results": search_facts(args.query, args.limit),
    },
    args.json,
)

