# Basic guide to reading `mwcc_dump.py` output

`mwcc_dump.py` runs the instrumented MWCC compiler in a unique working
directory and writes a filtered `pcdump.txt` for one function. The dump is not a
source-level decompiler. It is a compiler-forensics view: it shows what MWCC
thought during optimization and how its backend lowered the function into PPC
instructions.

Use it when `checkdiff.py` tells you the generated assembly is close but the
remaining mismatch is caused by register allocation, stack slots, hidden
compiler temporaries, instruction scheduling, or helper-call setup.

## Running it

From the Melee checkout:

```sh
ORCH_GAME_REPO_ROOT=/Users/luke/melee \
  python /path/to/decomp-orchestrator/toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_dump.py it_8026CD50
```

Or invoke the worker-facing API from the orchestrator checkout:

```sh
python3 toolpacks/gamecube-decomp/compiler/mwcc_debug/api/dump_function.py \
  --repo-root /Users/luke/melee \
  --function it_8026CD50 \
  --json
```

The tool resolves the function's translation unit, compiles it with
`mwcc_debug`, and prints the unique dump path, usually under
`/Users/luke/melee/build/mwcc-dump/<function>-*/pcdump.txt`.

The terminal summary looks like:

```text
[mwcc_dump] it_8026CD50: 2566 lines; full function dump available at: /Users/luke/melee/build/mwcc-dump/it_8026CD50-abcd1234/pcdump.txt
[mwcc_dump] passes: BEFORE GLOBAL OPTIMIZATION=1, ...
[mwcc_dump] shape analysis from: FINAL CODE AFTER INSTRUCTION SCHEDULING
```

For an objdiff `f`/`s` (frame/stack) mismatch, the most useful lines are the
frame summary, printed before the shape analysis:

```text
[mwcc_dump]  frame: 0x50 (80 bytes)
[mwcc_dump]  saved regs: stw r0@4, stfd f31@72, stmw r27@52
[mwcc_dump]  local stack slots (1): @924[lfd=2,stw=4] (i2f/fctiwz temp)
```

Compare `frame:` against the target's `stwu r1,-N` directly — if they differ
but the code is otherwise identical, it is a phantom-frame case. A slot tagged
`(i2f/fctiwz temp)` is a hidden int/float conversion scratch (the
`lis 0x4330` / `xoris` dance); an unexpected one usually means a struct field
typed `s32` that should be `f32` (or vice versa).

Useful checks:

- `full function dump available at:` is the file to grep/open.
- `N lines` gives you a rough cost before opening it.
- `pass counts` tells you which compiler stages are present.

If the tool says `'foo' not found (inlined or wrong name); present: ...`, the
filtered dump did not contain the requested function. Check the spelling,
prototype, and translation unit, then fall back to `decomp.py` and
`checkdiff.py` or dump a nearby emitted function. A `wibo: call reached missing
import FormatMessageA from kernel32` line can appear around compiler
startup/error reporting; judge the result by the following `[mwcc_dump]` status,
function name, and dump size.

## The two major regions

Each dump starts with optimizer logging, then moves into backend listings.

The optimizer logging is text like:

```text
IRO_FindLoops:Found loop with header 5
Removing dead assignment 323
Found propagatable assignment at: 8
```

These numbers are MWCC IR node ids, not source line numbers or assembly
offsets. This region is useful when changing C causes a surprising optimization
change, such as a temporary being eliminated or a loop being treated
differently.

The backend listings are the most useful part for decomp work. They start with
pass headers like:

```text
AFTER REGISTER COLORING
FINAL CODE AFTER INSTRUCTION SCHEDULING
it_8026CD50
```

For most match work, start at `FINAL CODE AFTER INSTRUCTION SCHEDULING`, then
work backward only if you need to understand why the final code ended up that
way.

## Reading the terminal summary

Newer `mwcc_dump.py` summaries include a shape analysis before you open
`pcdump.txt`:

```text
[mwcc_dump]  frame: 0x40 (64 bytes)
[mwcc_dump]  saved regs: stw r0@4, stw r31@60, stw r30@56, stw r29@52
[mwcc_dump]  address forms: lwz offset=11, lwzx indexed=1, stw offset=5
[mwcc_dump]    byte-offset indexed: addi r3,r1,candidates+4; lwzx r29,(r3,r0)
[mwcc_dump]  stack slots:
[mwcc_dump]    candidates: indexed stack array ...
[mwcc_dump]  branch shapes: bf gt=1, bt eq=1
[mwcc_dump]  register role clues:
[mwcc_dump]    r30: likely saved incoming/current r5 value
```

Use this as a triage map:

- `frame` and `saved regs` quickly tell you whether a stack/frame mismatch is
  real or only a local-slot placement issue.
- `address forms` tells you whether MWCC used indexed loads (`lwzx`), folded
  offsets, post/pre-increment-looking stores (`stwu`), or plain offset stores.
- `byte-offset indexed` hints are useful when target code wants an `addi`
  stack base plus `lwzx`; try array indexing, pointer walks, or byte-pointer
  casts depending on the target.
- `stack slots` identifies which local is being used as an indexed stack array
  and which offset MWCC assigned to it.
- `branch shapes` gives a fast clue about loop-entry and conditional branch
  forms, such as `bf gt` for a `> 0` guard or `bt eq` for an equality skip.
- `register role clues` can explain saved registers, such as a callee-saved
  register holding the incoming item pointer across a helper call.

The summary describes the current C output, not the target. Always compare it
against `checkdiff.py` before deciding what source change to try.

## Basic blocks

Backend output is grouped into basic blocks:

```text
:{000c}::::LOOPWEIGHT=524801
B15: Succ={B16 B18 } Pred={B14 B20 } Labels={L6 }

    li      r0,1
    and     r3,r24,r0
    bt      cr0,eq,B18
```

How to read it:

- `B15` is the compiler's basic-block id.
- `Succ={...}` are successor blocks.
- `Pred={...}` are predecessor blocks.
- `Labels={...}` are internal labels that branches can target.
- `LOOPWEIGHT` is the compiler's estimated block weight. It can affect
  scheduling, but it is usually background context rather than something to
  tune directly.

When comparing against `checkdiff.py`, block ids are less important than the
instruction order inside each block and where branches go.

## Instruction lines

An instruction line usually has this shape:

```text
    lwz     r3,36(r31); fIsPtrOp
    bl      HSD_MemAlloc; fLink
    lfd     f30,@271(r0); fIsConst
```

The left side is PPC-like assembly. The semicolon annotations are compiler
flags or helpful formatting:

- `fLink`: a call instruction.
- `fIsPtrOp`: a load/store or memory operation.
- `fIsConst`: a constant-pool reference.
- `fIsVolatile`: usually emitted around saved/restored registers.
- `fSideEffects`: an instruction the compiler treats as having side effects.

The annotations are not assembly mnemonics, but they are often good search
targets.

## Registers

Before register coloring, MWCC uses virtual registers:

```text
    mr      r66,r4
    mr      r67,r3
```

After register coloring, those become physical PPC registers:

```text
    addi    r24,r4,0
    addi    r25,r3,0
```

If `checkdiff.py` mostly reports `r` mismatches, compare:

1. `AFTER PEEPHOLE FORWARD`
2. `AFTER REGISTER COLORING`
3. `FINAL CODE AFTER INSTRUCTION SCHEDULING`

This helps separate "the source produces different values" from "the allocator
chose different registers." If the virtual-register code is similar but the
colored code differs, source-level lifetime changes are often the lever:
declaration order, temporary scope, helper calls, or whether an expression is
kept in a local.

The summary's `register role clues` are a shortcut for this same analysis. For
example, if it says `r30` is a saved incoming/current `r5` value, inspect the
final code to see whether your item pointer, attribute pointer, or stack pointer
has taken that role. If `checkdiff.py` shows two registers swapped, try changes
that alter live ranges rather than arithmetic: move a declaration, narrow a
temporary's scope, switch between array indexing and a pointer walk, or delay an
assignment. If the virtual-register code already has different operations, fix
the source expression first.

An extra `mr` or `addi dst,src,0` near an inlined helper usually means two C
names are live as aliases of the same pointer or object. Inspect the final code
and the previous register-coloring pass before changing logic. Good source
levers are narrowing a child/object local, removing a redundant alias, or
passing the original expression directly into the inlined helper. Verify each
attempt with `checkdiff.py`; a source shape that looks closer can still worsen
allocation.

## Stack slots and hidden temps

Stack references look like:

```text
    stw     r0,@337+4(r1)
    lfd     f0,@337(r1)
    stfd    f0,@339(r1)
```

Names like `@337` are compiler-generated stack slots. They often represent
hidden temps that do not appear in the C source, especially for:

- integer-to-float conversion through `0x4330`/`lfd`
- struct or vector copies
- temporary values introduced by scheduling or expression lowering

When `checkdiff.py` shows frame or stack mismatches, grep the dump for stack
slot names and nearby source-like locals:

```sh
DUMP=/Users/luke/melee/build/mwcc-dump/it_8026CD50-abcd1234/pcdump.txt
rg -n "@337|@338|@339|sp10|sp1C|sp28" "$DUMP"
```

If you see an unexpected `@NNN` temp in the target-like dump, the fix may be to
make the source create a comparable temporary. If you see too many `@NNN`
temps, the source may be forcing spills or unnecessary copies.

For local arrays, the important question is often the base offset and access
form, not only the frame size. A close mismatch might look like:

```text
target:  addi r4,r1,0x14
current: addi r4,r1,0x10
...
target:  addi r3,r1,0x14; lwzx r29,r3,r0
current: addi r3,r1,0x10; lwzx r29,r3,r0
```

In that situation, use the summary's stack-slot and address-form lines to check
which local owns the indexed stack array. Then try source shapes that move the
slot without changing the frame: array length, an unused local before or after
the array, `volatile` padding, or a small wrapper struct. Re-run `checkdiff.py`
after each attempt; some shapes move the slot but introduce a larger frame or a
different store form.

For aggregate locals such as `SpawnItem`, `Vec3`, and small stack structs, the
summary may name slots like `spawn`, `sp28`, or `sp44`. Use those names to map
`checkdiff.py` stack-store mismatches back to the source local. Assignment
order, struct copy versus field assignment, and copying from an aggregate field
versus the original local can all change scheduling and register choice. Test
one shape at a time; expanding a clean struct copy often fixes one stack store
but creates worse allocation elsewhere.

When a mismatch is near an integer-to-float sequence, compare the source types
and casts before chasing register allocation. Code like `(u32) x / 2u` can lower
to unsigned integer work, while a target using `xoris`, `lfd`, and `fmuls 0.5f`
usually wants a float expression such as `0.5f * x`.

If `checkdiff.py` and the dump both show fixed field offsets that disagree with
a shared struct definition, do not immediately change the global type. First
confirm the target offsets in the final code and decomp output. If the shared
type is used differently elsewhere, a small local overlay type and cast scoped
to the current function can be safer than a global struct edit.

Also watch for `stw` versus `stwu` in pointer walks:

```text
target:  stw  r6,0(r4); addi r4,r4,4
current: stwu r6,4(r4)
```

Both represent writing the next candidate and advancing a pointer, but they are
not a match. Switching between `candidates[count] = i`, `*p++ = i`, and
explicit `*p = i; p++` can change this form.

## Branch and loop shapes

Loop-entry mismatches are easier to reason about when you combine `checkdiff.py`
with the dump's branch-shape summary. For example:

```text
target:  cmpw  r6,r5
target:  bge   exit
current: cmpwi r5,0
current: ble   exit
```

If `r6` is known to be zero, these are logically equivalent, but they are not a
match. The current source probably let MWCC canonicalize `i < count` into
`count > 0` before loading `mtctr`. Try source shapes that make the index value
visible in the entry guard, such as different `for`/`while` spellings, an
explicit guard, or a separate loop counter. Be careful: many alternatives stop
MWCC from forming the target counted loop and replace `bdnz` with `bne` or
`blt`.

When testing loops, inspect both `AFTER LOOP TRANSFORMATIONS` and
`FINAL CODE AFTER INSTRUCTION SCHEDULING`. If the counted loop (`mtctr` /
`bdnz`) disappears immediately after loop transformations, the source shape is
probably too different even if the final branch looks tempting.

The `branches-to-exit` count is useful for callbacks and switch-heavy code. If
`checkdiff.py` shows an extra `li r3,0; b epilogue`, `beqlr`, or similar early
return, inspect the final scheduled block that owns the exit branch. Source
levers include `default: break` versus `default: return`, removing a temporary
boolean return path, or letting handled cases join common tail code. Sometimes
the target keeps a compare but not the source-level branch you expected, so use
the real branch shape rather than the apparent C structure as the guide.

## Constants and symbols

The formatter expands many relocations:

```text
    lis     r3,HA(it_804A0E30)
    addi    r31,r3,LO(it_804A0E30)
    lfs     f31,@283(r0); fIsConst
```

Common patterns:

- `HA(symbol)` / `LO(symbol)` are high/low relocation parts.
- `@NNN` with `fIsConst` is usually a constant-pool entry.
- `symbol+0x24` in `checkdiff.py` corresponds to fixed-offset global access.

This is useful for spotting whether a local pointer is kept in a register or
whether the compiler reloads a global field by offset every time.

## Helper calls

Some operations lower to runtime helpers, for example 64-bit shifts:

```text
    bl      __shr2u; fLink
```

For helper-call mismatches, inspect the few instructions before and after the
call. The setup registers matter more than the helper name:

```text
    addi    r3,r23,0
    addi    r4,r28,0
    li      r5,1
    bl      __shr2u
    addi    r23,r4,0
    addi    r24,r3,0
```

In C, fake helper prototypes can affect how MWCC places arguments in registers.
That can be useful, but `checkdiff.py` is still the source of truth. A fake
prototype that improves one function can hurt another, so keep it local when
possible.

## A practical workflow

1. Run `checkdiff.py <function>` first. Note whether the mismatch is mostly
   registers, stack/frame, instructions, constants, or branches.
2. Run `mwcc_dump.py <function>`.
3. Set `DUMP` to the path printed by `full function dump available at:`.
4. Jump to `FINAL CODE AFTER INSTRUCTION SCHEDULING`.
5. Search for the mismatched area from `checkdiff.py`: a helper call, a global
   symbol, a stack temp, or a branch target.
6. If final code is confusing, inspect the same block in `AFTER REGISTER
   COLORING` or `AFTER PEEPHOLE FORWARD`.
7. Make a small source change and rerun both tools.
8. Keep the change only if real `checkdiff.py` improves.

Good search commands:

```sh
rg -n "FINAL CODE|AFTER REGISTER COLORING|__shr2u|HSD_MemAlloc" "$DUMP"
rg -n "@[0-9]+|fIsConst|fLink|fIsPtrOp" "$DUMP"
rg -n "B15|B16|B18|LOOPWEIGHT" "$DUMP"
rg -n "FINAL CODE|AFTER LOOP|AFTER INSTRUCTION|cmpw|cmpi|stwu|lwzx" "$DUMP"
```

For a focused investigation, first use `rg` to find the pass headers and
interesting instructions, then open the narrow ranges around them:

```sh
rg -n "FINAL CODE|AFTER LOOP|stwu|lwzx|candidates" "$DUMP"
sed -n '820,890p' "$DUMP"
```

This is faster than reading the whole dump and makes it easier to compare the
same block across passes.

## How to think about it

`pcdump.txt` is most valuable when it explains why MWCC emitted code, not just
what code it emitted. Use it to answer focused questions:

- Did MWCC create a hidden stack temp?
- Did a value survive across a call?
- Did a local force an extra saved register?
- Did a helper call get different argument setup?
- Did register coloring change after a source tweak?
- Did an expression vanish during propagation?
