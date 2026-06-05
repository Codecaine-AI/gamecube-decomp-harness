# Target Packet

Build the target packet before generating candidates. It prevents repeated rediscovery and makes future runs reproducible.

## Inputs

Prefer these local artifacts:

- `objdiff.json`: unit name, source path, target object, base object, scratch compiler metadata, context path.
- `build/GALE01/report.json`: current fuzzy percent, function size, incomplete functions.
- `config/GALE01/symbols.txt`: address, size, symbol/data ownership.
- `config/GALE01/splits.txt`: translation-unit section ownership.
- `build/tools/objdiff-cli diff --format json`: baseline symbol and section diffs.

## Packet Fields

`artifacts/target_packet.json` should include:

```json
{
  "run_name": "",
  "source_path": "",
  "unit": "",
  "target_path": "",
  "base_path": "",
  "ctx_path": "",
  "symbols": [],
  "baseline": {
    "generated_at": "",
    "report_percent": null,
    "objdiff_percent": null
  },
  "sections_owned": [],
  "risky_neighbors": [],
  "validation_commands": []
}
```

## Baseline Commands

Use the narrowest useful baseline first:

```bash
export WINEDEBUG=-all
ninja build/GALE01/src/path/to/file.o
build/tools/objdiff-cli diff -p . -u <unit> <symbol> \
  --format json-pretty -o decomp-runs/<run>/artifacts/diff_json/baseline.<symbol>.json
```

For files that touch data, literals, headers, splits, statics, or pragmas, add:

```bash
build/tools/objdiff-cli diff -p . -u <unit> \
  --format json-pretty -o decomp-runs/<run>/artifacts/diff_json/baseline.unit.json
```

## Risk Classification

Mark the run as `text_hot_loop` when candidates only alter one function body and can compile to isolated candidate objects.

Mark the run as `tu_sensitive` when candidates touch:

- includes, headers, prototypes, or structs;
- file-scope statics or literals;
- assert/report strings;
- pragmas or inline helpers used by siblings;
- splits or symbols metadata;
- any `.rodata`, `.data`, `.sdata`, `.sdata2`, `.bss`, or `.sbss` ownership.

`tu_sensitive` candidates require neighbor validation before promotion.
