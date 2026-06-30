# Discord Search Recipes For Decomp Agents

Use these when `docs/discord-knowledge` is absent, stale, or too broad.

CLI:

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "<query>" --include-context --limit 10
```

## Query Recipes

### MWCC regalloc

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "MWCC regalloc register allocation inline" --include-context --limit 10
```

### varargs

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "varargs OSReport OSPanic stack layout" --include-context --limit 10
```

### by-value Vec3

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "by-value Vec3 stack layout inline" --include-context --limit 10
```

### PAD_STACK

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "PAD_STACK missing inline stack allocation" --include-context --limit 10
```

### small-data

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "small-data sdata sdata2 SDA relocation" --include-context --limit 10
```

### Data Layout And BSS

```bash
/Users/mike/code/discord-archive-mcp/.venv/bin/discord-search --namespace gc-wii-decomp search "BSS declaration order static global symbols.txt" --include-context --limit 10
```

## Use The Result

Record useful hits in the attempt ledger:

```bash
melee-agent attempts record <func> --match <pct> --outcome blocked \
  --blocker "Discord hit suggests missing inline/data layout issue"
```
