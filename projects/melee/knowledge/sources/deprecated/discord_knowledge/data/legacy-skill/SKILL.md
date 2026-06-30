---
name: discord-knowledge
description: Search Discord knowledge base for decompilation patterns, compiler tricks, and historical context. Use when stuck on matching or need background on a technique.
---

# Discord Knowledge Search

Search 6+ years of consolidated Discord knowledge for compiler patterns, matching techniques, type information, and project history.

## Usage

```bash
# Basic keyword search
rg -i "<keyword>" docs/discord-knowledge/

# With surrounding context (recommended)
rg -i -C 5 "<keyword>" docs/discord-knowledge/

# Multiple keywords
rg -i "pattern1|pattern2" docs/discord-knowledge/

# Search only the master document (faster, organized)
rg -i -C 5 "<keyword>" docs/discord-knowledge/DISCORD_KNOWLEDGE.md
```

## When to Use

- **Stuck on a match** - Search for the specific pattern or instruction causing issues
- **Unfamiliar compiler behavior** - Search for the instruction or optimization name
- **Type/struct questions** - Search for struct names or field offsets
- **Historical context** - Search for when a technique was discovered or why something works

## Example Searches

| Problem | Search |
|---------|--------|
| Float comparison mismatch | `rg -i "fcmpo\|fcmpu" docs/discord-knowledge/` |
| Loop not matching | `rg -i "unroll\|loop" docs/discord-knowledge/` |
| GET_FIGHTER issues | `rg -i "GET_FIGHTER" docs/discord-knowledge/` |
| Stack size wrong | `rg -i "stack.*size\|PAD_STACK" docs/discord-knowledge/` |
| Register allocation | `rg -i "regalloc\|register.*order" docs/discord-knowledge/` |
| Inline problems | `rg -i "inline.*auto\|inline.*depth" docs/discord-knowledge/` |
| Switch vs if-else | `rg -i "switch\|jump.*table" docs/discord-knowledge/` |
| Struct copy patterns | `rg -i "struct.*copy\|lwz.*stw" docs/discord-knowledge/` |

## Key Files

| File | Contents |
|------|----------|
| `DISCORD_KNOWLEDGE.md` | Master consolidated document - **start here** |
| `2020-*.md` through `2026-*.md` | Original chronological files with full context |

## Document Structure (Master)

The master document is organized into sections:
1. **Compiler & Code Generation** - MWCC flags, epilogue bugs, section allocation
2. **Matching Techniques** - Patterns, hacks, register tricks
3. **Type Information** - Fighter, Item, GObj structures
4. **Build System & Tooling** - objdiff, ninja, m2c, deprecated tools
5. **Project History** - Milestones from 1% (2020) to 47% (2026)
6. **AI/LLM Usage** - Guidelines for LLM-assisted decompilation

## Quick Reference

Common patterns you'll find:

- **Compiler version**: MWCC 1.2.5n (hotfix for epilogue scheduling)
- **Key macros**: GET_FIGHTER, ABS, PAD_STACK, RETURN_IF
- **Section order**: .text → .data → .rodata → .bss → .sdata → .sdata2 → .sbss
- **Register convention**: r3-r10 args, f1-f8 float args, r3/f1 return
- **Inline depth**: ~3 levels with `-inline auto`
