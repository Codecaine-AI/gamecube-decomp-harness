#!/usr/bin/env python3
from _banned_patterns import json_flag_parser, print_json, status_payload


parser = json_flag_parser()
args = parser.parse_args()
print_json(status_payload(), args.json)
