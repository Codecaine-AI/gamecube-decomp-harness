# Type Layout Lookup Runner

Build the index from a built checkout:

```sh
python3 toolpacks/gamecube-decomp/research/type_layout_lookup/runners/build_type_index.py \
  --repo-root <built_melee_repo>
```

Requirements:

- `<built_melee_repo>/build/ctx.c`; generate it with
  `python3 tools/m2ctx/m2ctx.py -p` if missing.
- Clang with `powerpc-unknown-eabi` target support.
- `<built_melee_repo>/src` unless `--skip-casts` is used.

The default output is
`games/melee/shared/tool-data/type_layout_lookup/indexes/type_layout_index.json`,
or `ORCH_TOOL_SHARED_DATA_ROOT` when set. `--out` overrides both. Writes use a
temporary file followed by an atomic rename. The sandbox fetch-first flow uses
`--ctx <mirror>/build/ctx.c --skip-casts --project <game_id> --out <cache>`.

