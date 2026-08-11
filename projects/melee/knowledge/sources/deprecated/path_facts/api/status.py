#!/usr/bin/env python3
from _path_facts import json_flag_parser, print_json, status_payload


parser = json_flag_parser()
args = parser.parse_args()
print_json(status_payload(), args.json)

