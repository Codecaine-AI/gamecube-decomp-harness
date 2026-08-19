# Assembly Window Search

`asm_window_search` finds matched donor functions that contain a construct
similar to any 32-instruction region of the query function. It complements
whole-function opcode search when one loop, switch, or instruction idiom is
buried inside a larger function.

The operator builds the index from dtk target objects. Worker queries do not
fetch sandbox files: target objects include every function, matched or
unmatched, so the query function's normalized tokens already live in the host
index.

```sh
python3 toolpacks/gamecube-decomp/research/asm_window_search/runners/build_asm_window_index.py --repo-root <built_melee_checkout>
python3 toolpacks/gamecube-decomp/research/asm_window_search/api/window_search.py --symbol <symbol> --json
```

The storage root comes from `ORCH_TOOL_SHARED_DATA_ROOT`, followed by the
project shared-data fallback. The index contains:

- `indexes/functions.jsonl`: symbol, unit, source path, match percentage,
  instruction count, and normalized tokens for every target function.
- `indexes/windows.meta.jsonl`: row number, function identity, instruction
  offset, and window length.
- `indexes/windows.vec.bin`: `DSWV` magic, little-endian
  `<4sHHI` header (magic, version, dimension, rows), then each row as a `<H`
  nonzero count followed by `<Hf` index/value pairs.
- `indexes/manifest.json`: schema/build provenance, version, window geometry,
  hashed embedding settings, counts, report source, and vendor commit.

Windows use size 32 and stride 16 by default, with one final window aligned to
the function end. The 512-dimensional embedding hashes normalized 1-, 2-, and
3-grams, applies sublinear term frequency, and L2-normalizes each sparse row.
Search reports the best window pair per donor function. The default donor
filter is 98% fuzzy match; `--all` disables it.

If the index is absent, the worker exits successfully with
`status: index_not_built` and the exact operator build command. Retrying the
worker cannot create this host-wide index.
