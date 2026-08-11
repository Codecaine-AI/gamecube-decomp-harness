#!/usr/bin/env python3
from _path_facts import json_flag_parser, print_json, proposal_records


parser = json_flag_parser()
args = parser.parse_args()
records = proposal_records()
print_json(
    {
        "source": "path_facts",
        "target_source_id": "path_facts",
        "supported_update_kinds": ["path_fact"],
        "mutation_policy": "proposal_only_until_validated",
        "proposal_count": len(records),
        "proposals": records,
    },
    args.json,
)

