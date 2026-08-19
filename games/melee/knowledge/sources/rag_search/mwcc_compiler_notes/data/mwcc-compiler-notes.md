# How MWCC allocates registers: notes on the GameCube CodeWarrior compiler

Working notes on the internals of the Metrowerks CodeWarrior PowerPC compiler
(`mwcceppc.exe`, version `GC/1.2.5`), collected while trying to explain
stubborn near-matches in GameCube matching-decompilation work. The focus is
the optimization pipeline and especially the register allocator, because
"everything matches except two registers are swapped" is the most common
plateau in this kind of work, and it turns out to be explainable — and
sometimes fixable — once you know how the allocator orders its decisions.

Nothing proprietary is distributed here. Addresses refer to the binary
identified below by hash; struct layouts and algorithms were established by
observing the compiler's behavior and state (see method note at the end).
Related public tooling in the same spirit: RootCubed's
[mwcc-inspector](https://github.com/RootCubed/mwcc-inspector) (MIT) and
cadmic's [mwcc-debugger](https://github.com/cadmic/mwcc-debugger).

## Which binary these notes describe

| Compiler | SHA-256 |
| --- | --- |
| `GC/1.2.5` (stock) | `0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914` |
| `GC/1.2.5n` (Ninji patch, shipped with the Melee decomp) | `ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c` |

The two files are the same size and differ in 53 bytes; the optimizer and
register-coloring regions discussed here are byte-identical between them, so
either binary can be used to reproduce the observations. Do not assume any of
this transfers to other MWCC versions — even nearby ones differ (see the
pass-list warning below).

**Confidence legend used throughout:**

- **confirmed** — established directly from this exact binary, and for the
  allocator claims additionally validated by replaying the reconstructed
  algorithm against state captured from the running compiler and getting
  bit-identical results;
- **inferred** — a strong conclusion from this binary's control flow or
  observable behavior, not yet replay-validated;
- **hypothesis** — suggested by a neighboring version or external reference,
  unverified for 1.2.5.

## Pipeline overview *(confirmed)*

The compiler has **two separate optimizers**: a frontend optimizer over the
expression-tree IR, and a backend optimizer over a low-level virtual-register
IR the compiler calls **PCode**. Understanding which one caused a difference
is the first step of any mismatch diagnosis.

```text
C source
   |
   v
frontend (parse, lower)  ->  frontend IR optimizer ("IRO_*" passes)
   |
   v
CodeGen (instruction selection into PCode, virtual registers)
   |
   v
backend PCode optimizer (per -O level pass sequence)
   |
   v
optional instruction scheduling
   |
   v
forward peephole
   |
   v
register coloring (graph coloring; spill-and-retry per register class)
   |
   v
EABI prologue/epilogue generation, then prologue/epilogue merge
   |
   v
final peephole  ->  optional final scheduling  ->  emission
```

## Frontend IR optimizer passes *(confirmed)*

The frontend optimizer stages, named by the compiler's own internal strings:

- `IRO_LoopUnroller`
- `IRO_FindLoops`
- `IRO_CopyAndConstantPropagation`
- `IRO_ConstantFolding`
- `IRO_EvaluateConditionals`
- `IRO_RangePropagateInFNode`
- `IRO_ExpressionPropagation`

Expression-shape mismatches (a folded constant, a propagated copy, an
unrolled or rotated loop) belong to this layer and are already decided before
the backend ever sees the function.

## Backend optimizer pass sequences per `-O` level *(confirmed)*

The backend optimizer dispatches on the exact optimization-level byte.
Repeated passes below are real repetitions, not documentation sloppiness —
the pass ordering (e.g. constant propagation *after* strength reduction) is
exactly what makes some source spellings converge and others not.
"Value numbering" is the compiler's own wording; it is in the
common-subexpression-elimination family.

**Level 2:**

1. common-subexpression elimination, mode 1
2. copy propagation, mode 1
3. add propagation

**Level 3:**

1. value numbering/CSE, mode 0
2. copy propagation, mode 0
3. add propagation
4. loop code motion
5. loop strength reduction
6. copy propagation, mode 1
7. loop transformations
8. copy propagation, mode 1
9. add propagation
10. copy propagation, mode 1
11. constant propagation
12. load deletion
13. add propagation
14. value numbering/CSE, mode 1
15. copy propagation, mode 1

**Level 4** runs the same first twelve stages as level 3, then:

13. copy propagation, mode 1
14. add propagation
15. array-to-register transformation
16. constant propagation
17. copy propagation, mode 1
18. value numbering/CSE, mode 1
19. copy propagation, mode 1
20. vector-array conversion
21. copy propagation, mode 0
22. copy propagation, mode 1
23. second code-motion round
24. third value-numbering/CSE round
25. copy propagation, mode 1

⚠️ **Version warning:** the O4 vector-array conversion pass exists in 1.2.5
but not in the older GC/1.1 pass table. Never transplant a pass list from a
neighboring compiler version.

## The register allocator

This is a **Chaitin-style graph-coloring allocator with Briggs-style
optimistic coloring**, run independently per register class. If you know the
literature, almost everything falls into place:

- G. Chaitin et al., *Register allocation via coloring* (1981) and
  *Register allocation and spilling via graph coloring* (1982) — the
  build/coalesce/simplify/spill framework and the `cost / degree` spill
  metric.
- P. Briggs, K. Cooper, L. Torczon, *Improvements to graph coloring register
  allocation* (1994) — optimistic coloring: spill candidates are pushed
  anyway and may still receive a color; the actual spill decision happens at
  select time.

The coalescing is **aggressive** (Chaitin-style: any non-interfering
copy-related pair merges), not Briggs/George conservative coalescing.

### Structure and ordering *(confirmed)*

- Three register classes are colored **independently and in this order**:
  vector, GPR, FPR. Each class has its own spill-and-retry loop: if coloring
  a class fails, spill code is inserted and that class is rebuilt and colored
  again.
- Per class, the phases are: liveness analysis → interference-graph
  construction → copy coalescing → simplify → select/color → commit
  (rewrite PCode operands, report callee-saved usage to frame construction).

### Liveness *(confirmed)*

Classic iterative backward dataflow over per-block bitsets:

- A forward walk of each block builds local sets: a use not preceded by a
  definition in the block enters the upward-exposed `use` set; a definition
  not preceded by a use enters `def`.
- Blocks are visited in reverse depth-first order until a fixed point:
  `live_out = ∪ live_in(successors)`, then
  `live_in = use ∪ (live_out ∖ def)`.
- **ABI return registers are seeded** as upward-exposed uses in the return
  block before propagation: r3 (plus r4 for 8-byte integer-like values and
  eligible aggregates), f1 for floating returns, vr2 for vector returns.
  Without this the final computation of a return value looks dead.
- A dead-definition elimination step runs using these live sets: a definition
  of a non-live register of the class being analyzed can be deleted, except
  for barrier instructions and special (SPR/condition-register) definitions.
  Notably this happens **before coalescing**, which is observable in matching
  work: a copy eliminated as dead never becomes a coalescing candidate.

### Interference construction *(confirmed)*

Walking each block backward from `live_out`:

- physical registers 0–31 of the class form a clique;
- each definition interferes with everything currently live;
- **copy instructions exclude their source operand** from the definition's
  edge set — this is what preserves the coalescing opportunity;
- certain instruction forms add operand constraints, including making
  call-argument-like operands interfere with the volatile argument registers
  (r3–r12), which forces long-lived values away from the argument range.

### Copy coalescing *(confirmed)*

Each class has one copy opcode (register move). A copy whose two webs do not
interfere is removed; **the lower-numbered web becomes the surviving root**,
the discarded web's interference edges transfer to it, and a final walk
rewrites every operand of the class to its canonical root. Physical registers
are always eligible; virtual pairs must lie in a class-specific range.

Consequence for matching: coalescing decides which webs *are the same
register* before any color is picked. A register "swap" that survives every
source experiment is often really a coalescing-root difference.

### Spill costs *(confirmed)*

For each instruction operand of the class:
`cost += block_weight × (2 if definition, 1 if use, 3 if both)`,
where `block_weight` is the block's execution weight from loop structure.
(An internal option can force all weights to 1.)

### Simplify *(confirmed)*

1. Repeatedly remove any node whose current degree is below the number of
   available colors, decrementing neighbors' degrees (removed nodes push
   onto the select stack).
2. When stuck, rank remaining nodes by **`spill_cost / degree`** (protected
   nodes get fixed scores), remove the lowest-ranked node — optimistically
   pushed like any other — and continue simplifying.

The order in which equal-degree, equal-cost nodes leave the graph is
determined by list dynamics over virtual-register numbering — which is why
**source-level object creation order can rotate register assignments without
changing a single instruction** (see the matching notes below).

### Select — the color-ordering model *(confirmed)*

This is the part that explains "why r31 and not r30". Popping the simplify
stack (reverse simplify order):

1. Remove every already-colored neighbor's color from the class's
   currently-available color mask.
2. Pick the **lowest set bit** of what remains.
3. If nothing remains, the allocator **claims one more physical register for
   the class on demand**; if none can be claimed, the node's spill flag is
   set (Briggs optimistic spill), spill code is inserted and the class
   retries.

The available-mask model, validated by replaying it against the compiler's
own captured graphs (exact color reproduction across dozens of real
functions):

- **GPR:** the initial mask is the volatile set `{r0, r3..r12}`.
  Callee-saved registers are claimed on demand **high-to-low: r31, r30, …,
  r14**, and each claimed register is added to the shared mask.
- **FPR:** identical shape — initial mask `{f0..f13}`, claimed high-to-low
  `f31..f14`.

So: the **first** web that needs a callee-saved register gets r31, the next
gets r30, and so on; once claimed, a register is in the mask and later
short-lived webs grab it as the "lowest available bit". Callee-saved register
identity is therefore a pure function of select order — and the saved-register
span (`stmw rN` / FPR save count) follows from the lowest register claimed.

One known model gap: coalesced roots that resolve to a claimed color are
handled by an alias-resolution step at commit; a naive replay that skips it
mispredicts those functions.

### Pairs and commit *(confirmed)*

8-byte integer values occupy GPR pairs; the allocator tracks first/second
halves and commits a primary and secondary physical register. Commit rewrites
the PCode operands, removes now-redundant copies, and resolves coalesced
color aliases — in that order, so coalescing must already have redirected
live operands to root webs (an ordering constraint that a behavioral test
made explicit before disassembly confirmed it).

## What this means for matching decomp

Register identity is fully determined by four things: the interference graph,
the coalescing roots, the simplify/select order, and the on-demand claim
order. If the instruction stream already matches, only the middle two can
differ — and they are influenced by how the *frontend* created and numbered
virtual registers, which you control through source shape.

Levers that have been observed to work (each confirmed on at least one real
matched function):

- **Initializer-bearing pointer locals.** `Table* tbl = table;` creates a
  source object that changes a web's coalescing root or rank without
  retaining a copy instruction. This is the single most effective lever for
  moving a web into a specific callee-saved register.
- **Declaration order of long-lived locals.** Within a clique of interfering
  long-lived webs, declaration order of their owning objects can directly
  set the callee-saved assignment order (first declared → r30, next → r29,
  …, matching the claim model above).
- **Splitting a reused local.** Two mutually-exclusive uses of one variable
  block coalescing that two separate variables would allow; splitting them
  can merge a web with a later constant web and fix a swap.
- **One-field aggregate wrappers.** Wrapping a local in a one-field struct
  changes virtual-register creation and simplify order (and stack-band
  placement — the aggregate is memory-homed, not scalarized).
- **Type width matters.** Changing an `int` to `u16` (or vice versa) can
  erase or enable a pointer-alias effect upstream and undo an otherwise
  correct fix; equal emitted values are not equal compiler objects.
- **Declaration-with-initializer vs. separate assignment** moves the
  materializing instruction and changes the web's rank; the two are *not*
  equivalent to the allocator even when byte-neutral elsewhere.
- `register` keyword: byte-neutral at `-O4,p` *(confirmed on tested cases)*.

Equally important, three residual classes are **not source-steerable** —
recognizing them saves days of futile sweeps:

1. **Terminal callee-saved permutations over compiler-materialized webs.**
   When the rotating webs are things like global-address materializations
   that no nameable local owns, the ordering is set by simplify-list dynamics
   over equal-cost compiler webs. Instruction-identical source edits cannot
   reach it.
2. **Extra-callee-saved (peak-pressure) class.** The reconstruction keeps
   one more value live at peak pressure than retail, so it saves one more
   GPR/FPR; hundreds of downstream register differences all cascade from one
   frontend lowering difference, not from the allocator.
3. **Many-to-many reallocations** where one candidate register maps to
   several retail registers across regions — a wholesale different select
   history, not a clean rotation.

Stage attribution cheat-sheet for a mismatch:

| Symptom | Stage to suspect |
| --- | --- |
| expression shape, folded/propagated values | frontend IR optimizer |
| missing/extra CSE, hoisted loop values | backend optimizer sequence |
| instruction order only | scheduling or peephole |
| register identity only | coalescing roots or select order |
| stack offsets / frame size | memory-homing and frame regions (aggregates, addressed locals) |
| saved-register span (`stmw` start) | lowest claimed callee-saved register, i.e. select order or peak pressure |

Also useful: MWCC assigns addressed locals to the stack band in **reverse**
order relative to declaration *(inferred)* — a wrapper struct declared before
an addressed local can occupy an existing hole and leave every other offset
untouched.

## Odds and ends

- **The per-pass dump scaffold is dead code** *(confirmed)*. The binary
  contains a complete per-pass IR/asm dump mechanism — every stage label
  string (`BEFORE GLOBAL OPTIMIZATION`, `AFTER CODE MOTION`, `AFTER REGISTER
  COLORING`, …) is referenced by live call sites — but the dump routine they
  call is a single `ret` in the shipped build, and the gate byte's only
  writer initializes it to zero. There is no flag, environment variable, or
  byte patch that makes 1.2.5 print per-pass IR; enabling the gate under a
  debugger is inert. State has to be read out of memory instead (see the
  appendix).
- **The compiler cannot compile itself** *(confirmed)*. `mwcceppc.exe` is a
  Win32/i386 PE, but it only targets Embedded PowerPC (its processor list has
  no x86), so it was built by some other Win32/x86 toolchain — with evidence
  pointing at an earlier CodeWarrior x86 lineage: a 15-byte relocation-free
  libjpeg helper from a CodeWarrior Pro 5.3 Win32 library occurs exactly once,
  byte-identical, in its `.text` *(the fingerprint is confirmed; the exact
  host toolchain remains a hypothesis)*.
- The compiler's diagnostic strings are a gold mine: internal pass names,
  stage boundaries, and source filenames (`IrOptimizer.c`, `COptimizer.c`,
  `CodeGen.c`, `Coloring.c`, `SpillCode.c`, `StackFrameEABI.c`,
  `Scheduler.c`, …) all survive in the shipped binary and anchor any
  analysis.

## Appendix: useful addresses (GC/1.2.5, hash above)

All addresses are virtual addresses in the stock binary; the ones marked ✱
are byte-identical in `GC/1.2.5n` and usable with either compiler. Calling
convention is cdecl-like with arguments on the stack (`[esp+4]` = first
argument at function entry).

**Code:**

| Address | What | Notes |
| --- | --- | --- |
| `0x0042cd10` | frontend IR optimizer dispatcher ✱ | corroborated independently by mwcc-inspector's breakpoint |
| `0x004351c0` | `CodeGen_Generator` — backend coordinator | runs the whole shared backend tail |
| `0x004c4430` | backend optimizer dispatcher | O2 inline; O3 → `0x004c4910`; O4 → `0x004c4530` |
| `0x004cdef0` | coloring coordinator ✱ | per-class loop; first stack arg = function object; break here for a pre-coloring PCode snapshot |
| `0x004ce2d0` | color selection ✱ | args: register class (0=GPR, 1=FPR, 9=vector), simplify-stack head; break here (and at its return) for before/after graph snapshots |
| `0x004abe90` | EABI prologue/epilogue generation | called just before the "AFTER GENERATING EPILOGUE, PROLOGUE" boundary |
| `0x004c4bd0` | `COptimizer_Dump` | **`ret` stub** — see above, do not chase |

**Data:**

| Address | What |
| --- | --- |
| `0x00587c74` | head of the current function's PCode block list |
| `0x00587e3c` | pointer to the interference-node table (indexed by virtual register) |
| `0x0058846e` | GPR virtual-register count (s16) |
| `0x0058846c` | FPR virtual-register count (s16) |
| `0x0058849a` | vector virtual-register count (s16) |

**Layouts needed to read the state** *(confirmed via two-consumer offset
corroboration; all little-endian)*:

- `PCodeInstruction`: `0x1c`-byte header — next/prev pointers at `+0x00`/
  `+0x04`, opcode (s16) at `+0x14`, flags at `+0x16`, operand count (s16) at
  `+0x1a` — followed inline by 12-byte operands at `+0x1c`.
- `PCodeOperand` (12 bytes): kind byte at `+0x00`, flags byte at `+0x01`
  (`0x01` use, `0x02` def, `0x04` last-use), register number (s16) at
  `+0x02`, pointer/value at `+0x06`.
- `PCodeBlock`: next at `+0x00`, successor list at `+0x10`, instruction list
  head at `+0x14`, tail at `+0x18`, block index (s32) at `+0x1c`, execution
  weight (s32) at `+0x28`, flags (u16) at `+0x2e`.
- Interference node: temp/list link at `+0x00`, owning compiler object at
  `+0x04`, spill cost (s32) at `+0x08`, virtual register (s16) at `+0x0c`,
  degree (s16) at `+0x0e`, physical register (s16) at `+0x10`, flags at
  `+0x12`, neighbor count (s16) at `+0x14`, inline s16 neighbor indices from
  `+0x16`.

A version-pinned snapshot reader and a GDB auto-capture command built on
exactly these addresses and layouts accompany these notes
(`allocator_snapshot.py`, `gdb_allocator_snapshot.py`). Captures were taken
with the compiler running under `qemu-i386 -g` + Wibo inside a hardened,
network-disabled container — the compiler binary itself is treated as an
untrusted input and never executed on the host.

## Method note

These notes come from static analysis of the hash-pinned binary plus
observation of its state at the boundaries above, with every allocator claim
cross-checked by reimplementing the algorithm and replaying it against
captured compiler state until the outputs were bit-identical. Confidence
labels are load-bearing: anything not marked **confirmed** should be
re-verified before you build on it, and none of it should be assumed true for
any other MWCC version.
