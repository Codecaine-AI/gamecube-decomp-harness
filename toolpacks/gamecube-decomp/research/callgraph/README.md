# Callgraph Tool

Callgraph extracts binary-ground-truth relationships from
`build/GALE01/asm/**/*.s` and joins each caller to unit, source-path, address,
and fuzzy-match metadata from `build/GALE01/report.json`.

It writes two deterministic JSONL indexes under the configured tool storage
root:

- `indexes/calls.jsonl`: one `call_edge` row per caller/callee pair, including
  the call count and first assembly evidence line.
- `indexes/data_refs.jsonl`: one `data_ref_edge` row per caller/referenced-symbol
  pair, classified as `function_pointer` or `data`.

Generate or refresh both indexes:

```sh
python3 toolpacks/gamecube-decomp/research/callgraph/runners/extract_call_graph.py --repo-root projects/melee/checkout
```

Check readiness and manifest counts:

```sh
python3 toolpacks/gamecube-decomp/research/callgraph/api/status.py --repo-root projects/melee/checkout --json
```

Query callers, callees, outgoing data references, or reverse data references:

```sh
python3 toolpacks/gamecube-decomp/research/callgraph/api/callers_of.py --symbol Fighter_ChangeMotionState --direction callers
python3 toolpacks/gamecube-decomp/research/callgraph/api/callers_of.py --symbol fn_80105AB0 --direction refed_by --unit main/melee/ft/fighter
```
