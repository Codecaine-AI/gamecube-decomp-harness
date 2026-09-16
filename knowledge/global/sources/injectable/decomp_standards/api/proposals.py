#!/usr/bin/env python3
from _standards import json_flag_parser, print_json, proposal_records


parser = json_flag_parser()
args = parser.parse_args()
records = proposal_records()
print_json(
    {
        "source": "decomp_standards",
        "target_source_id": "decomp_standards",
        "supported_update_kinds": ["global_standard"],
        "mutation_policy": "proposal_only_until_validated",
        "proposal_count": len(records),
        "proposals": records,
    },
    args.json,
)

