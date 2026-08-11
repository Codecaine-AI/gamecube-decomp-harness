---
name: ppc-ref
description: Look up PowerPC instruction set documentation. Use when you need to understand what a specific instruction does, its operands, or behavior.
---

# PowerPC Instruction Set Reference

Search multiple PPC reference manuals for instruction documentation. Use this when:
- You don't know what a specific PPC instruction does
- You need to understand instruction operands or encoding
- You're debugging assembly diff issues and need to verify instruction behavior
- You want to understand condition codes, special registers, or addressing modes
- You need info on paired singles (ps_*) or other Gekko-specific instructions

## Setup Required

**PDF files must be obtained manually** (not included in repo due to copyright/size).

### Option 1: Bootstrap from Pre-signed URLs (Recommended for Remote)

If PDFs are stored in secure cloud storage (S3, R2, etc.), use the bootstrap script:

```bash
# Set pre-signed URLs (NEVER commit these!)
export PPC_REF_750CL_URL="https://your-bucket.../ppc_750cl.pdf?sig=..."
export PPC_REF_CWG_URL="https://your-bucket.../powerpc-cwg.pdf?sig=..."
export PPC_REF_MPC5XX_URL="https://your-bucket.../MPC5xxUG.pdf?sig=..."

# Download and verify
python tools/bootstrap_ppc_ref.py
```

The bootstrap script verifies SHA-1 hashes to ensure correct files.

### Option 2: Manual Installation

Place the following files in `.claude/skills/ppc-ref/`:

| File | Description | Source |
|------|-------------|--------|
| `ppc_750cl.pdf` | IBM PowerPC 750CL User's Manual | IBM technical documentation |
| `powerpc-cwg.pdf` | IBM PowerPC Compiler Writer's Guide | IBM technical documentation |
| `MPC5xxUG.pdf` | CodeWarrior MPC5xx Targeting Manual | NXP/Freescale documentation |

The tool will not function without these reference PDFs.

### Install pymupdf

Required for PDF parsing:
```bash
pip install pymupdf
```

## Commands

### Look up a specific instruction

```bash
python tools/ppc-ref.py instr <mnemonic>
```

Examples:
```bash
python tools/ppc-ref.py instr lwz       # Load Word and Zero
python tools/ppc-ref.py instr rlwinm    # Rotate Left Word Immediate then AND with Mask
python tools/ppc-ref.py instr fcmpo     # Floating Compare Ordered
python tools/ppc-ref.py instr ps_madd   # Paired Single Multiply-Add (Gekko-specific)
python tools/ppc-ref.py instr mflr      # Move From Link Register
```

The tool first checks a TOC-based index, then falls back to full-text search with smart ranking to find instruction definitions.

### Full-text search

```bash
python tools/ppc-ref.py search "<query>"
```

Examples:
```bash
python tools/ppc-ref.py search "condition register"
python tools/ppc-ref.py search "floating point exception"
python tools/ppc-ref.py search "paired single"
python tools/ppc-ref.py search "branch prediction"
```

Use `--limit N` to show more results:
```bash
python tools/ppc-ref.py search "cache" --limit 20
```

### View a specific page

```bash
python tools/ppc-ref.py page <source> <page_num>
```

Examples:
```bash
python tools/ppc-ref.py page 750cl 502      # View page 502 of 750CL manual
python tools/ppc-ref.py page cwg 58         # View page 58 of Compiler Writer's Guide
```

### List available sources

```bash
python tools/ppc-ref.py sources
```

### Rebuild the index

```bash
python tools/ppc-ref.py index
```

## Common Use Cases

### Understanding an unfamiliar instruction

When you see an instruction in the asm diff you don't recognize:

```bash
python tools/ppc-ref.py instr rlwinm
# Shows: Rotate Left Word Immediate then AND with Mask
# rA = ROTL(rS, SH) & MASK(MB, ME)
```

### Paired singles (Gekko-specific)

The GameCube's Gekko CPU has paired single-precision floating point instructions:

```bash
python tools/ppc-ref.py instr ps_add     # Paired Single Add
python tools/ppc-ref.py instr ps_mul     # Paired Single Multiply
python tools/ppc-ref.py instr ps_madd    # Paired Single Multiply-Add
python tools/ppc-ref.py search "paired single"
```

### Floating-point instructions

```bash
python tools/ppc-ref.py instr fmuls      # Floating Multiply Single
python tools/ppc-ref.py instr fcmpo      # Floating Compare Ordered
python tools/ppc-ref.py instr frsp       # Floating Round to Single Precision
python tools/ppc-ref.py instr fctiwz     # Float Convert to Int Word with Round toward Zero
```

### Understanding register allocation issues

```bash
python tools/ppc-ref.py search "condition register field"
python tools/ppc-ref.py instr cmpw
python tools/ppc-ref.py instr cmpwi
```

## Quick Reference: Common Instructions

| Category | Instructions |
|----------|-------------|
| Load | `lwz`, `lbz`, `lhz`, `lha`, `lfs`, `lfd`, `lmw` |
| Store | `stw`, `stb`, `sth`, `stfs`, `stfd`, `stmw` |
| Arithmetic | `add`, `addi`, `sub`, `subf`, `mullw`, `divw` |
| Logical | `and`, `or`, `xor`, `nor`, `andi.`, `ori` |
| Shift/Rotate | `rlwinm`, `rlwimi`, `slw`, `srw`, `sraw`, `srawi` |
| Compare | `cmpw`, `cmpwi`, `cmplw`, `cmplwi` |
| Branch | `b`, `bl`, `blr`, `bctr`, `beq`, `bne`, `blt`, `bgt` |
| Float Arith | `fadd`, `fsub`, `fmul`, `fdiv`, `fmadd`, `fnmsub` |
| Float Compare | `fcmpo`, `fcmpu` |
| Paired Single | `ps_add`, `ps_mul`, `ps_madd`, `ps_merge00` |
| CR Logical | `crand`, `cror`, `crxor`, `crnand` |
| System | `mflr`, `mtlr`, `mfctr`, `mtctr`, `mfcr` |

## Notes

- The 750CL manual (620 pages) is the primary reference for GameCube/Wii decompilation
- Instruction definitions are in pages 347-620 of the 750CL manual
- Results are ranked to prioritize actual instruction definitions over usage examples
- Index is cached in `~/.cache/ppc-ref/` and auto-rebuilds when PDFs change
