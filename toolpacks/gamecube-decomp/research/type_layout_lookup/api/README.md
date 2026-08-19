# Type Layout Lookup API

Query or inspect readiness:

```sh
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/api/layout_lookup.py --record <record> --mode near --json
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/api/layout_lookup.py --mode dups --prefix --json
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/api/layout_lookup.py --record <union> --mode unions --at 0x10 --json
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/api/status.py --json
```

Modes are `summary`, `dups`, `near`, `unions`, and `casts`. With `--record` and
no mode, lookup defaults to `near`; without either it defaults to `summary`.
Missing indexes and records return structured status payloads with exit code 0.
The server's fetch-first path uses `--index-root <worktree_cache_root>` after it
builds a cast-free sandbox-derived index.

