# Type Layout Lookup

`type_layout_lookup` answers structural questions about C records in a built
GameCube project. It finds identical and near layouts, redundant union views,
fields that cover a byte offset, and pointer-cast-only overlay types.

The operator builds one JSON index from clang's PPC-EABI record-layout dump of
`build/ctx.c`:

```sh
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/runners/build_type_index.py \
  --repo-root <built_melee_repo>
```

The output is `indexes/type_layout_index.json` under the tool storage root. It
contains normalized record leaves, typedefs, aliases, precomputed duplicate
groups, build provenance, and `cast_scan`. A normal operator build scans `src/`
and stores cast sites plus overlay flags. A sandbox fetch-first build downloads
only `build/ctx.c`, passes `--skip-casts`, and records
`cast_scan.available: false`.

Workers can query an existing host index without source or object access:

```sh
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/api/layout_lookup.py \
  --record HSD_GObj --mode near --limit 15 --json
```

If no shared index exists, the server fetch-first path generates `build/ctx.c`
inside the worker sandbox if needed, downloads that single file, and builds a
cast-free index in the worktree tool cache. `--index-root` lets the second host
lookup read that cache directly. Cast analysis stays unavailable until an
operator rebuilds from a checkout with `src/`.

