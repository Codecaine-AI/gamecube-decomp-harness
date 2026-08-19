# Assembly Window Search API

```sh
python3 toolpacks/gamecube-decomp/research/asm_window_search/api/status.py --json
python3 toolpacks/gamecube-decomp/research/asm_window_search/api/window_search.py --symbol <symbol> --unit <unit-or-source-suffix> --min-match 98 --limit 10 --json
```

`window_search.py` reads query tokens and donor vectors from host storage. It
never needs `--repo-root` or sandbox access. Results are ranked by the best
cosine match between any query and donor window, then by symbol and unit.
`--exclude-self-unit` removes donors from the query translation unit, while
the query function itself is always removed.
