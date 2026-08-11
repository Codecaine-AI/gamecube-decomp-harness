#!/usr/bin/env python3
import argparse

from _banned_patterns import print_json, search_records


parser = argparse.ArgumentParser()
parser.add_argument("--query", required=True)
parser.add_argument("--limit", type=int, default=10)
parser.add_argument("--json", action="store_true")
args = parser.parse_args()

print_json(
    {
        "source": "banned_patterns",
        "query": args.query,
        "limit": args.limit,
        "results": search_records(args.query, args.limit),
    },
    args.json,
)
