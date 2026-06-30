# External Mirrors API

CLI-style worker access:

- `python3 projects/melee/knowledge/sources/deprecated/external_mirrors/api/status.py --json`
- `python3 projects/melee/knowledge/sources/deprecated/external_mirrors/api/search.py --query <query> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/deprecated/external_mirrors/api/lookup_external_symbol.py --symbol <name> --limit <n> --json`

Results include mirror/index source paths, evidence references, payload rows,
and low-trust metadata. Treat all external mirrors as hints until local code,
headers, symbols, assembly, and objdiff evidence confirm them.
