# Melee Decompilation Knowledge Base

A consolidated guide to decompilation techniques, compiler behavior, and project knowledge extracted from 6+ years of Discord discussions (July 2020 - January 2026).

---

## 1. Introduction

This document captures tribal knowledge from the #smash-bros-melee decompilation Discord channel. The goal is to provide a searchable, organized reference for matching functions to their original assembly.

**Target Compiler:** MWCC (Metrowerks CodeWarrior) version `mwcc_233_163n` (GC/1.3.2)
**Platform:** GameCube/Wii PowerPC
**Compiler Flags:** `-O4,p -nodefaults -proc gekko -fp hardware -Cpp_exceptions off -enum int -fp_contract on -inline auto`

---

## 2. Compiler & Code Generation

### 2.1 MWCC Compiler Flags & Behavior

**Target Version:** Melee 1.02 (NTSC), DOL SHA1: `08e0bf20134dfcb260699671004527b2d6bb1a45`

**Compiler:** MWCC (Metrowerks CodeWarrior) build `2.3.3 build 159`. Melee likely used a pre-1.1 compiler (2.2.x) because the 2.3 changelog notes "Function Epilogues and Prologues are now scheduled" - causing ordering mismatches.

**Working flags:**
```
-Cpp_exceptions off -proc gekko -fp hard -O4,p -nodefaults
```

**Key flag behaviors:**
- `-O4,p` = optimization level 4 with peephole scheduling
- **Flag order matters:** `-proc gekko -O4,p` vs `-O4,p -proc gekko` produces different scheduling. When `-O4,p` comes first, scheduler uses "generic PPC" instead of the specified processor
- `-proc gekko` targets the GameCube's Gekko processor; `-proc 750` and `-proc generic` produce different codegen
- `__PPCGEKKO__` define is NOT set in Melee's build (confirmed via `longjmp` at 0x80322840)
- `-use_lmw_stmw on/off` controls load/store multiple word instructions (off by default)
- `-O4` implies `-opt level=4, peephole, schedule, autoinline, func_align 16`
- `-O4,p` = speed optimization, `-O4,s` = space optimization
- `lmw`/`stmw` are slow instructions, explicitly disabled for most of Melee; only menu files (`mnmain`) appear to have them enabled via pragma

**Critical 2.2 vs 2.3 difference:** Prologue/epilogue are NOT subject to instruction scheduling before 2.3.x. Melee relies on a bug present in 2.2.x that was fixed in 2.3.x. A $1000 bounty was considered for finding mwcceppc 2.2.

**Compiler version hunt results:**
- GC CW 1.1: Version 2.3.3 build 159 (Runtime: Feb 7 2001)
- GC CW 1.0: Version 2.3.3 build 144 (Runtime: Apr 13 2000)
- Neither matched; Mac PPC 2.2 has similar codegen body but different prologue/epilogue
- HAL likely grabbed early "release 4" (~1998) before GameCube toolchains finalized

**Paired singles instructions (`psq_l`, `psq_st`):** Only appear in:
1. Prologue/epilogue code
2. Inline ASM
3. SDK library code

NOT generated in normal function bodies by MWCC, even with `-proc gekko`.

**EPPC 4 Prologue/Epilogue Bug (the blocking issue):**
```asm
# Expected (Melee target):     # Produced by available compilers:
addi    r1, r1, 8              lwz     r0, 12(r1)
lwz     r0, 4(r1)              addi    r1, r1, 8
mtlr    r0                     mtlr    r0
blr                            blr
```
Bug was fixed in compiler release 2.3. Mac MWCC 2.2 exhibits same bug with scheduling enabled.

**MetroTRK as compiler test:** `TRKHandleRequestEvent` can test compiler version, but MetroTRK is precompiled so doesn't indicate what compiled the game. Use `lbvector` instead.

**Stack frame differences:** `lbvector` first function requires Mac 2.2 for correct stack offsets (0x8 instead of 0x10). CW 1.0/2.3 places variables at 16-bit aligned offsets.

**Linker versions:** 1.0 to 1.2.5 work; avoid 1.0 (slow). Melee uses 1.3.2 (last version before ctors/dtors changes). Linker 2.7 produces different padding.

**Lost EPPC4 patch:** A patch existed for an `addu` bug but is considered "lost media" - at least one TRK function requires it.

**Frank (1.2.5e) vs plain 1.2.5:**
- SDK/MSL libraries use plain 1.2.5 (do NOT add to e_files.mk)
- Game code uses 1.2.5e (Frank) for proper epilogue scheduling
- If `addi` appears between `mtlr` and `blr`, function uses older 1.2.5 codegen - Frank won't help
- Frank applies epilogue modifications to **entire files**, not individual functions
- Files processed by Frank go in `e_files.mk`

**Sections for r2/r13:**
- r13 references .sdata or .sbss (non-const globals)
- r2 references .sdata2 or .sbss2 (const data, like rodata)
- Sections ending in `2` are for const data

**Section allocation rules:**
- `.bss` - uninitialized data
- `.data` - non-const initialized objects
- `.rodata` - const (read-only) initialized objects
- Objects ≤8 bytes go into small sections: `.sbss`, `.sdata`, `.sdata2`
- Float/double literals and struct/array initializers go into `.rodata` or `.sdata2` by size
- **Exception:** String literals go into `.data` or `.sdata` (not rodata)
- Removing `const static` moves data from r2 to r13

**Static data section layout (detailed order):**
`.text` → `.data` (big, initialized) → `.rodata` (big, const) → `.bss` (big, uninitialized) → `.sdata` (small, initialized) → `.sdata2` (small, const) → `.sbss` (small, uninitialized)
- "Big" threshold is ~8 bytes
- `static Vec3 x;` (12 bytes, uninitialized) goes to `.bss`, not `.rodata`
- Constants in code like `float x = 1.5;` go to `.sdata2`, Vec3 literals go to `.rodata`

**Structs passed by value:** Structs over 8 bytes passed by value will always be on the stack. Smaller structs may also be on stack depending on member layout.

**Vec by value issue:** Functions taking `Vec` by value cause unpredictable stack copies. Fix: Change to `Vec*` parameter.

**Static function removal:** With `-inline auto`, static functions may get always inlined and removed by linker. Keep functions `static` if they were originally static.

**Variable declarations:** mwcc requires declarations at start of blocks (pre-C99). Use `{ }` within functions to declare mid-function. Declaration location affects register allocation.

**C99 support:** Use `#pragma c9x on` instead of `-lang c99` (added after CW 1.3+). Enables compound literals `(MyStruct){0, 1, 2, 3}` but NOT `offsetof` in 1.2.5.

**FrankLite:** `franklite.py` (Pikmin 2) handles only mtlr shift case, doesn't need 1.2.5e compiler. Use when only one function in file needs epilogue fix.

**1.2.5n Hotfix Compiler (replaces Frank):**
- Ninji's patch (`mwcceppc 1.2.5n`) is the correct fix for the epilogue scheduling bug
- Adds `fSideEffects` to the `addi r1, r1, x` instruction (or `lwz r1, 0(r1)` for dynamic stack)
- Replicates what Metrowerks did in build 167
- **Use 1.2.5n for all hotfix code** - do not use frank anymore
- decomp.me Melee preset uses 1.2.5n in the background

**Enums:** Always 32-bit due to `-enum int` compiler flag.

**int vs s32 behavior:**
- `int` has special properties in mwcc - can generate either 8-bit or 32-bit instructions depending on context
- Sometimes generates `lbz` instead of `lwz` for function arguments
- Our `s32` definition (from Dolphin SDK) is `long`, so they are technically different types
- Melee developers seemed to prefer `int` for most cases
- **Convention (2025):** Use `int` in `src/melee/` and SDK types (`s32`, `f32`) in `src/dolphin/`

**Duplicate floating-point constants indicate file boundaries:**
Compiler merges duplicate constants (0.0f, 1.0f) within a single file but NOT across files. Seeing duplicates in `.sdata2` indicates a file boundary between them.

**Ternary operators inflate stack:**
Ternary operators often inflate stack size unexpectedly. Replacing with if/else or inline function can fix stack mismatches.

**cror instructions in decompiler:**
`M2C_ERROR(/* unknown instruction: cror eq, gt, eq */)` indicates compound comparison. Delete error and replace nearby `==` with `>=`.

**cmplwi vs cmpwi for pointer detection:**
- `cmplwi` (unsigned compare) suggests variable is likely a pointer
- `cmpwi` (signed compare) suggests an integer
- Useful for determining parameter types when declarations are unknown

**Literal symbol names (@170, @173, etc.):**
Compiler-generated names for literals (floats, strings) are per-file, not program-wide. The numbers appear related to parse IDs.

**Tautological comparisons:**
Some functions require invalid/tautological comparisons to match:
```c
return (t0->lut != t0->lut) || (t0->n_entries != t1->n_entries);  // First check is intentional
```

**Explicit NULL checks affect codegen:**
- `if (ptr != NULL)` and `if (ptr)` produce different codegen for inlined functions
- Compiler can discard `if (ptr)` checks when it knows pointer is non-null from local variable
- Using explicit `NULL` can break inlines where check would be optimized away
- Recommendation: Use `if (ptr)` style checks for consistency

**Double branch instructions:**
Double `b` (branch) instructions like `b .L_X / b .L_X` indicate switch statements - "Metrowerks moment" quirky behavior.

**Structure copies use word loads:**
When copying structures, compiler may use `lwz` even for float fields - optimization that copies raw bytes rather than interpreting as floats.

**Float literal merging:** MWCC won't merge `0.5` with `0.5L` (long double vs double) - they get separate addresses in sdata2. Avoid `L` suffix with inlines like `sqrtf` that use float constants.

**Branch hint bits:** Gekko has branch hint bits (+/-) in conditional branches (`bdnz+`, `bne+`, etc.) but **doesn't actually support them** - they have no effect on branch predictor. CW doesn't set these; +/- just indicates branch direction.

**PPC 750/Gekko capabilities:** Can run six instructions simultaneously, has branch prediction and out-of-order execution.

**-proc flag variations:**
- `-proc 750` can fix `mtlr` swaps on unmodified 1.2.5 compiler
- `-proc 604` enables different scheduling behavior that fixes some functions
- Because `-proc` is a pragma, it can be applied per-function to work around scheduling issues

**The 1.2.5 scheduler bug (official description):** "The scheduler may, with certain instruction patterns, decide to move code below the de-allocation of the current stack frame. That is, code is moved below the `addi sp, sp, N`."

**mwcc decompilation project:** Repository at `git.wuffs.org/MWCC`. Decompiling CW Pro7 2.4.5 for Mac PPC. Key files: `InstrSelection.c` (code generator), `CExpr.c`/`CExpr2.c` (largest TUs), `CMachine.c` (machine config).

**BSS variable ordering:** Variables ordered by usage order, not declaration order. Using `static` keyword forces declaration order. Force order with dummy function:
```c
#define FORCE_BSS_ORDER(var) void *_force_bss_order_##var(){return &var;}
```

**Loop strength reduction:** Compiler creates extra temporaries for loop-derived values. If every iteration uses something derived from loop variable, compiler tracks them separately.

**Loop unrolling control:** `#pragma ppc_unroll_instructions_limit 1` disables loop unroller for clearer codegen analysis.

**optimizewithasm pragma:** `#pragma optimizewithasm off` prevents mwcc from optimizing inline assembly (on by default).

**MWCC const value reuse:** Compiler tries to reuse values where possible (e.g., reading same struct field twice, it'll only fetch once). This logic is heavily influenced by `const` qualifier.

**Frank.py limitations:** Handles li/lwz reordering but NOT li/lmw reordering. Can cause false negatives.

### 2.2 The Epilogue Bug & Frank.py Workaround

The main compiler version issue manifests as incorrect epilogue ordering:
```
Expected:          Generated:
addi r1,r1,N       mtlr r0
mtlr r0            addi r1,r1,N
blr                blr
```

**Primary fix:** A Python postprocessor patches `.o` files to swap the epilogue ordering after compilation.

**Partial pragma workaround:**
```c
#pragma push
#pragma altivec_codegen on
#pragma altivec_model on
void problem_function(...) {
    // Fixes epilogue for SOME functions
}
#pragma pop
```
This breaks other functions - not a universal solution.

### 2.3 Register Allocation Sensitivity

Register allocation is extremely sensitive to seemingly minor code changes:

**Variable declaration order matters:** The order variables are declared at the top of a function affects which registers they're assigned. Swapping `Fighter* fp;` with `FighterSpecificAttributes* attrs;` swaps their registers throughout the function.

**Chain assignment affects distant codegen:** `top_y = right_x = bottom_y = left_x = 0.0f;` can affect register allocation hundreds of lines away - the permuter's randomization pass was added to find these effects.

**Volatile for forcing register usage:**
```c
// Forces specific register ordering in loads
float f0 = ((volatile float *)b)[0];
float f1 = ((volatile float *)a)[0];
```

**Extern vs literal affects fcmpu operand order:**
```c
// Using extern reverses fcmpu operands compared to literal 0.0f
extern float lbl_804D7AA8;
if (lbl_804D7AA8 == f4)  // Different order than: if (0.0f == f4)
```

**Local arrays for stack offset control:**
```c
float foo[2];
foo[1] = sqrtf(...);  // May produce different stack layout than single variable
```

**Bitfield operation ordering:**
```c
// These produce different register allocations:
flags &= (AOBJ_LOOP | AOBJ_NO_UPDATE);
aobj->flags = aobj->flags & ~(flags);

// vs
aobj->flags &= ~(flags & (AOBJ_LOOP | AOBJ_NO_UPDATE));
```

**Volatile stack reservation:** Using `volatile s32` can force stack reservation; may indicate the struct field is itself volatile in original code.

**Const stack consolidation:** Using `const` on local variables helps compiler consolidate stack locations:
```c
const float c = 0.0f;  // Single stack location
vec.x = c; vec.y = c; vec.z = c;  // Reuses c
```

### 2.4 Instruction Scheduling

- Peephole optimization is affected by flag order and `asm` keyword presence
- **Critical:** Using `asm` functions disables peephole optimization on ALL subsequent functions in the file
- This causes `bnelr` to become `bne + b` (separate instructions)
- Fix: Add `#pragma peephole on` after asm functions to restore optimization
- Bug fixed in compiler versions 1.3.2-2.7, but affects MWCC 1.0-1.2.5:
```c
// peephole is on for this
void blahblah() { }

asm blahasmblah() { nop }

// oops! peephole is off now for rest of file
void blahblah2() { }
```
- Function prototype presence changes prologue scheduling
- mwcc processes inline assembly **before** preprocessor expansion (allows `#define _SDA_BASE_(dummy) 0` hacks)
- mwcc erroneously optimizes out `*= 1.0f` operations (violates IEEE standards)

### 2.5 Loop Unrolling Rules

MWCC unrolls loops in certain cases. To prevent unrolling, use manually casted pointer struct copy:
```c
#define SET_ATTRIBUTES(type)                     \
{                                                \
    type *dest = (type *)player->special_attributes2; \
    type *src = (type *)player->ftDataInfo->charAttributes; \
    *dest = *src;  /* struct copy instead of loop */ \
}
```

`#pragma scheduling off` affects BOTH scheduling AND register allocation - cannot isolate scheduling changes only.

**Loop unrolling heuristics (under -O4,p):**
- Non-inlined function call: will NOT unroll
- Loop counter not int/long: will NOT unroll
- Max iterations that unroll: 9 (mwcc 1.2.5), 12 (2.6), 16 (C++)
- Inlined function calls do NOT prevent unrolling

### 2.6 Float Handling & Intrinsics

**Float literal precision issues:**
- Compiler may choose slightly different hex representations for float literals
- Example: `1.0472f` generates `0x3F860AA6` instead of expected `0x3F860A92`
- Solution: Use mathematical expressions like `M_PI/3` to get exact values, or find exact decimal precision
- If two floats with similar values appear, check if another function uses that constant
- Float comparison: sometimes omitting the `f` suffix matches better (`0.0` vs `0.0f`)

**Float flags:**
- `-fp hard` enables hardware floating point
- `-fp_contract on` enables fused multiply-add (fmadds), but requires `#pragma fp_contract on` to actually work

**MWCC built-in intrinsics (no declaration needed):**
- `__frsqrte(double)` - Reciprocal square root estimate
- `__fnmsub(double, double, double)` - Fused negative multiply-subtract
- `__cntlzw(int)` - Count leading zeros
- `__memset` - Built-in memset

The SDK's `math_ppc.h` contains inline implementations using these intrinsics.

**sqrtf volatile pattern:** The official SDK `sqrtf` inline uses a `volatile` variable, causing pointless stack store/reload (`stfs` then `lfs` to same address). This was likely a compiler bug workaround. Use the correct sqrtf macro from math.h.

**sqrtf inline recognition:**
The sqrtf inline produces a distinctive pattern with `__frsqrte` and three Newton-Raphson iterations:
```c
if (var_f4 > 0.0f) {
    sqrt = __frsqrte(var_f4);
    temp_f1_3 = 0.5 * sqrt * -((var_f4 * (sqrt * sqrt)) - 3.0);
    // ... two more iterations
    var_f4 = sp10;
}
```
Replace with `sqrtf()` call - search the repo for existing usage.

**mfcr instruction pattern:** `mfcr` (move from condition register) stores boolean comparison results. Pattern: `mfcr r0` followed by `rlwinm` shifts to extract condition bits. Different shift amounts (0x1F, 0x1E, 0x1D) correspond to different comparison operators.

**Int-to-float conversion:** Each translation unit gets its own copy of magic constants:
- Signed: `0x4330000080000000`
- Unsigned: `0x4330000000000000`
- These duplications help identify file boundaries (283+ boundaries found this way)

**Division by constants using MULT_HI:**
- Division/modulo by constants like 60 get optimized to `mulhw` (multiply high word)
- Example: `MULT_HI(x, 0x88888889) >> 5` is equivalent to `x / 60`
- M2C decompiles `mulhw` to `MULT_HI(...)` macro calls

### 2.7 Inline Function Behavior

- `inline` keyword is a suggestion, not mandatory
- `-inline auto` enables automatic inlining at compiler discretion
- `-inline auto` tends to inline 3 levels deep by default (usually stops at depth 3-4)
- Function length affects inlining decision - larger functions stop inlining sooner
- Can be controlled with `-inline auto,level=N` where N is 1-8

**Inline function linkage behavior (critical discovery):**
- **`static inline`** = LOCAL linkage - functions duplicated into each TU
- **`inline`** (without static) = WEAK linkage - ODR (One Definition Rule) deduplicated at link time
- Explains functions like `lbColl_JObjSetupMatrix` appearing in melee code - actually `HSD_JObjSetupMatrix` as `inline` that got deduplicated

**Autoinlined functions:**
- Ordinary global functions (`void foo() { ... }`) used only locally have GLOBAL linkage
- If autoinlined, they will be stripped by the linker
- Otherwise they persist in the DOL
- If inline depth exceeded, compiler emits standalone function even for code marked `inline`
- Workaround for depth limits: create a "hack" version that manually inlines the final call
- `-inline deferred` allows inlining functions before their definition
- `-inline smart` does 4 passes, limiting later passes to small functions
- Inline functions are duplicated in every file that uses them (no LTO)
- Use `#pragma always_inline on` when decomp.me generates `bl` instead of inlining

**Static vs inline float ordering (critical):**
- Using `static` functions affects float constant ordering in `.sdata2`, whereas `inline` does not
- To force float order when partially decompiling, declare a static function at top of file that uses the float first:
```c
static float get_zero() { return 0.0f; }  // Forces float order
```
- Linker strips unused static functions but float constants remain in order
- `addi rX, rY, 0` and `mr rX, rY` produce different bytes even though functionally equivalent
- Functions with tail calls end with `b` instead of `blr`
- `long` vs `s32` can produce different codegen in edge cases
- `int` vs `s32` (which is `long`) dramatically different - implicit casts can affect stack allocation
- `volatile` variable makes function impossible to inline (usually)
- Melee likely uses `-inline auto`, NOT `-inline deferred`
- For loops can be reversed to decrementing (enables `bdnz`)
- **bdnz pattern:** When you see `bdnz` (branch decrement not zero), loop condition is typically `i = N; i != 0; i--`, not `i < N`
- Cast presence alone can change codegen, even if logically unnecessary
- `crclr 6` = no float args, `crset 6` = has float args (variadic functions)
- Doubles (f64) must be aligned to 8-byte boundaries
- **Callback inlining:** Callbacks can get inlined even when passed as function pointers - if not in DOL, it was inlined into caller
- **Preventing unwanted inlining:** Use `#pragma dont_inline on` (not `1`), also `#pragma inline_depth(n|smart)`. Adding `(void)0;` at function start can sometimes prevent inlining (retail asserts leave this)

---

## 3. Matching Techniques & Patterns

### 3.1 Common Code Patterns

**The Ten Rules of Matching:**
1. When in doubt, scrub C
2. Never assume it won't get optimized out
3. When the answer is elusive, never rule out a typo
4. Always be prepared to cram a square peg into a circle hole
5. If you still can't get it to match, it's a combination you think you tried but haven't
6. Volatile is a dangerous magic sauce that may explode
7. If you're afraid you need to use math, be
8. If you think you understand the compiler, the compiler will tell you you don't
9. *(optimized out)*
10. Rule 9 was optimized out

**Control flow produces different codegen:**
```c
// Version A - may produce mr. optimization
if (aobj != NULL && aobj->fobj) { ... }

// Version B - may NOT produce mr. optimization
if (aobj) {
    if (aobj->fobj) { ... }
}
```

The `mr.` instruction (move register and set condition) is an optimization for NULL checks requiring specific C patterns.

**Jump tables:**
- Switch statements with 5+ consecutive cases become jump tables
- Jump tables placed in `.data` section (not `.rodata`)
- Pattern: Uses `bctr` instruction (vs `bctrl` for function pointers)
- Small switches become nested if-else chains with binary search
- Optimized switch blocks can be tricky - branches past function end indicate unusual structure
- Sometimes a switch appears as nested if/else with specific comparison order (check `>= 3` first, then `== 0`, etc.)
- `jtbl_t` in codebase is a "fakematch" placeholder for switch statements - compiler creates tables for switches with many cases near zero

**saved_in_reg_rx errors:**
When you see `saved_in_reg_rx` errors in decompiled output, it almost always means missing parameter or return value. Missing r3 typically means a function is `void` when it should return an `int` or pointer.

**Comma operator in loops:** Use to increment multiple variables:
```c
for (i = 0; i < count; i++, dynamicBones++) { }
```
Comma operator evaluates left to right, returns rightmost value.

**Identifying inlined code:**
- Look for "variable hoisting" - vars initialized at scope start but used much later
- Repeated code patterns across scopes often indicate inlined static functions
- "One is an anomaly, two is a coincidence, three is a pattern"
- Move repeated patterns to their own static functions and let the compiler inline them

**Cast to prevent OR-chain optimization:**
A cast in an `||` chain prevents compiler from optimizing consecutive comparisons into a switch:
```c
// Gets optimized into switch-like structure:
if (msid == 0xB7 || msid == 0xB8 || msid == 0xB9)
// Cast prevents optimization:
if (msid == 0xB7 || msid == 0xB8 || (s32)msid == 0xB9)
```

**GUARD macro for IASA early returns:**
Common pattern for interrupt functions with many early-return checks:
```c
#define GUARD(cond) if ((cond)) { return; }

void ftCo_AttackLw3_IASA(HSD_GObj* gobj) {
    ftCo_Fighter* fp = GET_FIGHTER(gobj);
    if (fp->allow_interrupt) {
        GUARD(ftCo_AttackS4_CheckInput(gobj))
        GUARD(ftCo_AttackHi4_CheckInput(gobj))
        // ... more guards
    }
}
```

**Section placement:**
```c
__declspec(section ".init") void * memset(void * dst, int val, unsigned long n);
```
mwcc orders explicit section functions first, then non-explicit.

### 3.2 Register Allocation Hacks

See Section 2.3 for register allocation sensitivity patterns. Key techniques:
- Volatile casts to force load ordering
- Extern vs literal constants to affect comparison operand order
- Local arrays vs single variables for stack layout control
- Early returns to change codegen structure
- Inline accessor functions produce more unique register usage (forces r28-r31 vs r0, r31)
- Array out-of-bounds hack: some functions need UB array access to match stack layout
```c
float foo[1];  // Allocates 1 float
foo[1] = sqrtf(...);  // Accesses out of bounds - matches original
```
- Use `#ifdef AVOID_UB` for these cases

**Stack alignment and inlines:**
- Stack allocated in 8-byte increments
- Adding filler variables (2 at a time) can help match stack size
- Using inlines reserves additional stack space that may/may not be optimized away
- First match all code except stack, then fix stack
- Order of inline usage matters for stack size

**Unused variable trick:** Declaring unused variables affects register allocation and stack: `s32 unused[2];` forces specific stack layout.

**Unused stack variables for alignment:**
```c
void ft_8009B390(ftCo_GObj* gobj, float force_mul) {
#ifdef MUST_MATCH
    u8 _[16] = { 0 };
#endif
    // ... function body
}
```

**Fake stack variables:**
When stack size doesn't match but code is otherwise correct:
- Missing 8 bytes often indicates a stripped inline function (exact stack reservation for function call with this compiler)
- Missing 4 bytes might just be an unused variable
- Lines may be completely stripped by compiler but still affect stack
- If you see `r1+0x14` in target but `r1+0x1C` in code (0x8 diff), look for missing inlines

**Struct copy vs field assignment:**
```c
// Struct copy - uses integer registers (generic copy)
pos = other_pos;

// Field assignment - uses floating point registers
pos.x = other_pos.x;
pos.y = other_pos.y;
pos.z = other_pos.z;
```
M2C often shows struct copies as separate s32/u32 assignments - recognize this pattern.

**Float literals vs extern floats:**
Many functions appear non-matching due to extern float declarations. Using actual float literals instead of externs often fixes matches.

**Decimal vs hex in data:**
```c
// Wrong - compiler may generate different instruction
StageData data = { 26, ... };
// Correct - use hex for stage IDs
StageData data = { 0x26, ... };
```

**Regalloc forcing trick:** Use no-op expression to maintain regalloc without changing semantics:
```c
t & w;  // Result not saved, optimized out but leaves regalloc intact
```

**Inline wrapper for register issues:**
When facing register allocation issues, wrapping operations in an inline function can fix them:
```c
static inline double sqrtf_wrapper(f32 val) {
    return (double)sqrtf_accurate(val);
}
```
Changing return types from `float` to `double` can also fix stack alignment issues.

**true vs 1 for bitfields:**
Using `true` instead of `1` for bitfield assignments can affect matching:
```c
spawnitem.x44_flag.bits.b0 = true;  // Different codegen than...
spawnitem.x44_flag.bits.b0 = 1;
```

**Permuter for line reordering:** Brute-force tool tries all orderings of lines. 10! (3.6M) permutations took ~8 hours on 32 cores. Useful for struct initialization functions.

**Chain assignments:** `a = b = c = d = 1;` produces different codegen than separate assignments.

**Backward store chains:** Assembly showing backward stores (z then y then x) indicates chain assignment:
```c
// Assembly: stw z, stw y, stw x (backwards)
fighter->x74_anim_vel.x = fighter->x74_anim_vel.y = fighter->x74_anim_vel.z = 0;
```

**Void cast trick:** Casting return values to void can change stack allocation:
```c
inline HSD_JObj *getHSDJObj(HSD_GObj* hsd_gobj) {
    HSD_JObj *hsd_jobj = hsd_gobj->hsd_obj;
    return (void *)hsd_jobj;  // void cast affects codegen
}
```

**cntlzw pattern:** `bool is_zero = (some_value == 0);` generates `cntlzw` instruction.

**beqlr/bnelr:** Conditional early returns. Equivalent to `if (condition) return;`

**Use `__fabs` intrinsic:** `fabs()` generates `bl fabs` call; intrinsic generates inline code.

**Float absolute value bit hack:** Melee (but not later games like KAR) uses bit manipulation macro:
```c
#define ABS(x) *(u32*)&x = *(u32*)&x & ~0x80000000;
```
Generates `clrlwi` to clear sign bit. Later HSD versions use standard `fabs`/`fabsf`.

**Clamp macro:**
```c
#define Clamp(val,min,max) (val = ((val < min) ? min : (val > max) ? max : val))
```
Separate from HSD_ClampFloat function. `private.h` likely contains utility macros including ABS.

**Double-initialization pattern:** Some functions require `Fighter* fp = fp = GET_FIGHTER(gobj);` - may indicate an inline that does the assignment, generating specific register moves.

**Self-assignment for regalloc:** `fighter_data3 = fighter_data3;` sometimes required. Also useful for `rlwimi` vs `ori` differences in bitfield operations.

**Subfic hack pattern:** When you see `subfic` in asm for subtraction, the actual C is often simpler: `i = var = 0;`

**Triple equals trick:** `var == 0;` (statement with no side effect) can fix register swaps.

**(s64) cast / 64-bit AND trick:** Adding `(s64)` cast or `& 0xFFFFFFFFFFFFFFFF` can fix certain regswaps. Traditional "IDO trick" but works with Metrowerks in some cases.

**Explicit (s32) casts on division:** Removing explicit `(s32)` cast from division can change generated code even when variable is already s32: `(s32) temp_r6 / 60` differs from `temp_r6 / 60`.

**Local variables for struct literals:** Struct literals in rodata are deduplicated across functions but not within the same function. To match code that reuses the same literal values, assign to local variables first.

**getFighter inline:**
```c
inline Fighter* getFighter(HSD_GObj* fighterObj) {
    return fighterObj->user_data;
}
```

**getFighter inline cast pattern:** Many fighter functions require a cast after `getFighter()` to match:
- `Fighter* fp = (void*)getFighter(fighter_gobj);`
- `Fighter* fp = (Fighter*)getFighter(fighter_gobj);`
- Some work with neither cast
The cast "fixes" codegen because `user_data` in GObj is `void*`.

**Special attributes (sa) access pattern:**
```c
// In fighter.h: char sa[0x100];
// In character code:
ftPeachAttributes* attrs = (ftPeachAttributes*)fp->sa;
```
Using temp variables for cast can invoke savegpr. Macro approach `MY_ATTRS(fp)` does inline cast per-access.

**HSD_GObjGetUserData pattern (critical discovery, Jan 2023):**
```c
// HAL's actual pattern verified by Smash 64 decomp:
Fighter* fp = (Fighter*)HSD_GObjGetUserData(fighter_gobj);
HSD_JObj* jobj = (HSD_JObj*)HSD_GObjGetHSDObj(fighter_gobj);
```
NOT using `getFighter()` macro directly. The explicit cast + inline getter is what HAL used. This pattern fixes stack allocation issues and eliminates many fake matches. The `getFighter()` macro pattern was WRONG.

**Important casting rule (2025):**
- Cast on the **return** of `HSD_GObjGetUserData()`, NOT the input
- `(Fighter*)HSD_GObjGetUserData(gobj)` - correct
- `(Fighter*)HSD_GObjGetUserData((HSD_GObj*)gobj)` - incorrect, causes stack issues
- GET_FIGHTER macro shouldn't have a cast on the input, only on the return

**Const parameter for inlines:** Adding `const` to inline params helps matching:
```c
static inline void* HSD_GObjGetUserData(HSD_GObj* const gobj) { return gobj->user_data; }
```

**Condition splitting:** Splitting compound conditions can fix matches:
```c
// Instead of: if ((a != 0) && func1() && func2())
// Try: if (a) { if (func1() && func2()) { ... } }
```

**Temporary variable elimination:** After getting m2c output to compile, eliminate as many temps as possible. 90% of the time, cleaned-up output matches better.

**HSD_JObjSetMtxDirty - define vs inline:** Evidence suggests it should be a **define**, not inline in Melee's version:
```c
#define HSD_JObjSetMtxDirty(jobj)                       \
{                                                       \
    if (jobj != NULL && !HSD_JObjMtxIsDirty(jobj)) {    \
        HSD_JObjSetMtxDirtySub(jobj);                   \
    }                                                   \
}
```
Using a define fixes the fighter.c inline problem. May be leftover from earlier sysdolphin version where macros were defines instead of inlines.

**Float constant sharing between ASM and C:** For functions mixing ASM and C that need shared float constants:
1. Inline the float in C
2. Put `.set lbl_DEADBABE` in .s file pointing to offset of inlined float
3. Use `extern f32 lbl_DEADBABE;`

**Instruction patterns:**
- `clrlwi r30,r3,0x10` = u16 return cast: `u16 val = (u16)func();`
- Any instruction with `.` suffix (e.g., `rlwinm.`) compares result with 0 and sets CR
- `fctiwz` = float-to-int conversion with truncation toward zero
- `__memcpy` calls often indicate struct assignment (original used direct assignment)

**Inline ASM negative float workaround:**
```c
#define SDA2_BASE_LD 0x804DF9E0
#define asm_lbl_804D7FAC (0x804D7FAC - SDA2_BASE_LD)
// Then: lfs f5, asm_lbl_804D7FAC(r2)
```

**Stack frame bloat:** Temp variables for float conversion can cause unexpected stack expansion (16 → 40 bytes).

**Static float placement:** Declaring static float inside vs outside function affects codegen:
```c
// Inside function - different codegen
s32 myFunc() { static f32 foo; }
// vs outside - different behavior
static f32 foo;
s32 myFunc() { }
```

**force_active pragma:** Missing `force_active` on a function can cause shifts in the object file.

### 3.3 Struct Copy vs Field Access

**Data splitting is critical:**
- Using extern for everything is "cringe and nonmatching"
- vtables cannot be extern'd - must be split first
- Split data BEFORE decompiling, not after
- Quality order: (1) Extern everything (bad), (2) Split as needed (better), (3) Split in advance (best)

**Link order matters:**
```makefile
# In obj_files.mk:
data_0.s      # Data before thing.c
thing.c       # Your decompiled code
data_1.s      # Data after thing.c
```

**Section offset trick:** Compiler loads file-scope variables using offset from section start. If code loads `var1` then adds 0x80 to get `var3`, both belong in same file.

### 3.4 Float Comparison Tricks

**fcmpo vs fcmpu pattern:**
- When target uses `fcmpo` + `cror` but you're getting `fcmpu`, the issue is usually a combined operation involving equality
- `cror` is typically used for combined float comparisons
- Switching from `==` to `<=` can fix this pattern

- Extern vs literal `0.0f` reverses `fcmpu` operand order
- `#pragma fp_contract on` needed for fused multiply-add
- Reciprocal square root estimate via `__frsqrte` intrinsic
- Float params use f1, f2, etc. - NOT f0 (f0 not used for param passing)
- `bdnz` instruction indicates a counted loop

**Float bit manipulation pattern:**
```c
// stfs f1, 8(r1) - store float
// lwz r0, 8(r1)  - load as int (bit manipulation)
// lfs f6, 8(r1)  - load as float again
// Uses __HI/__LO macros:
#define __HI(x) *(1+(int*)&x)
#define __LO(x) *(int*)&x
__HI(x) = hx;  // Expands to: *(1+(int*)&x) = hx;
```

### 3.5 Advanced Techniques

**Function argument ordering with floats:**
- Floats use FPRs, integers use GPRs - they can be freely reordered in declarations
- Changing float position in signature doesn't break functional equivalence
- BUT it can affect evaluation/load order of arguments:
```c
// These are called identically:
void func(int x, float y, int z);
void func(int x, int z, float y);
// Both result in: r3=x, r4=z, f1=y
// BUT evaluation order differs - check for mismatched loads before calls
```

**Function prototype side effects:**
```c
// Without prototype - one codegen
void func() { external_call(); }

// With prototype - different prologue ordering
void external_call(void);
void func() { external_call(); }
```

**Nonmatching strategy:** Since `asm` functions affect other functions, use postprocessing:
1. Write C that produces correct-size functions (using volatile writes if needed)
2. Inject correct assembly into the `.o` file after compilation
3. Use `#ifdef NONMATCHING` to keep the readable C version available

**Variadic function detection:** Uses `cr1` to decide whether to save float params:
```asm
creqv   6, 6, 6  # Set cr1 bit 6 - indicates variadic
```

**Variadic (va_args) parameter counting:**
mwcc uses `lis r0, 0xN00` to indicate the number of initial parameters in variadic functions, where N is incremented by 0x100 per parameter. `va_start` behavior: mwcc seems to ignore the second parameter and always generates code properly.

**Ternaries vs if/else:**
- Ternaries create a temporary variable for the result (always in saved registers or stack at O0)
- With optimization, temporaries are often discarded
- In mwcc 1.0-1.2.5, stack space left behind by temporaries is not always cleaned up

**Float/int parameter ordering:**
Floating point values go in FPRs, integers/pointers in GPRs. Ordering of FP arguments relative to non-FP arguments doesn't matter for matching, as long as each type's arguments maintain correct relative ordering.

**Assert macro pattern:**
```c
// HAL's format: condition is opposite of reason string
if (x != -1)
   __assert("filename.c", 0x28 /* line */, "x == -1");

// Macro expands from (note: ", 0" at end is REQUIRED):
#define ASSERTMSGLINE(line, cond, msg) ((cond) || (OSPanic(__FILE__, line, msg), 0))
```
Assert strings may contain typos ("dont't") that must be preserved for matching. The `, 0` at end allows asserts in `if()` conditions and affects stack allocation.

**Implicit function declarations cause extra instructions:**
- If you call a function without a declaration, compiler assumes it returns `int`
- This causes extra instructions to convert the assumed int back to actual return type
- Pattern: `xoris on r3 after a function call` is a telltale sign of implicit declarations
- Common culprits: `sqrtf`, `atan2f`, `lbVector_AngleXY`
- Always ensure proper includes for math functions

**addi vs mr peephole optimization:**
- The `mr r3,r4` vs `addi r3,r4,0` replacement is a peephole optimization
- Can be broken by inserting dead code that doesn't get pruned until after the mr/addi pass
- Common workaround: `!gobj;` as a statement (from mwcc-debugger research)
- Passing result of `GObj_Create` or `LoadJoint` directly into function instead of creating temp can switch between `addi`/`mr`

**Loop unrolling recognition:**
- Metrowerks aggressively unrolls loops
- Simple `for (i = 0; i < 215; i++) array[i] = 0;` can become 13 iterations with 16 stores each (16 * 13 = 208), plus cleanup loop
- Look for repeated store patterns and calculate: stores_per_iter * iterations
- Remainder value (like `0xD7 = 215`) often appears in cleanup loop
- Loop unrolling conditions: `i` is an int, fixed iteration count, no function calls in body, u8 cast on index can trigger unrolling

**Signed vs unsigned loop comparisons:**
- If you need `cmpw` (signed) instead of `cmplw` (unsigned) in initial check but changing loop vars to `int` breaks unrolling:
```c
while (count-- > 0) {}  // Use this pattern
```

**Vec3 chained assignment ordering:**
- When you see z, y, x stores in reverse order, it's usually chained assignment:
```c
fp->self_vel.x = fp->self_vel.y = fp->self_vel.z = 0.0f;  // Produces z, y, x order
```

**ABS macro vs fabs_inline:**
- `fabs_inline` is likely NOT real - prefer using `ABS` macro instead
- Replacing `fabs_inline` with `ABS` treewide improves matches

**MTXDegToRad constant:**
- The constant `0.017453292f` comes from `#define MTXDegToRad(a) ((a)*0.017453292f)`
- Pre-computed (PI/180) even at O0

**enum min consideration:**
- Project may have been built with `-enum min` instead of `-enum int`
- Shrinks enums from 4 bytes to 1 byte when possible
- Many slot_type or ckind values are passed as u8/s8
- ~2883 functions break when switching to `-enum min`

**RETURN_IF macro pattern:**
For IASA callbacks with errant `cmpwi`:
```c
#define RETURN_IF(expr) if (expr) { (void)gobj; return; }
```
The `(void)gobj;` produces an errant `cmpwi` instruction that otherwise seems to do nothing.

**COMPILER_NONMATCHING strategy:** When stack ordering differences are caused by compiler (not decompiler), functions can be treated as "tentatively matching". Allows progress toward shiftable build while waiting for matching compiler.

**Inline ASM jump table labels:** Use offset from function start label instead of direct labels for shiftability:
```asm
.4byte lbl_80001234+20  /* shiftable */
/* NOT: .4byte 0x803652E4 */
```

**SDA2 label adjustments:** When converting functions to inline assembly, r2-relative labels may need adjustment as next function in sequence can shift references.

---

## 4. Type Information & Structs

### 4.1 Fighter Struct

**Size:** 0x23EC bytes

**Key offsets:**
- 0x10C: ftData
- 0x2D4: Second pointer to special attributes (may involve union)
- First argument (r3) in ft functions is always `GObj*`
- Access pattern: `gobj->data` (offset 0x2C) gets fighter data

**Fighter files structure:** Each `ft[Character]` is actually 4+ files (one per special move): `ftNessSpecialN`, `ftNessSpecialS`, etc. Only special moves are separate - common moves are shared. ftKirby needs subdirectory for hats.

Don't name padding fields "padding" - use offset names like `unk2D8`.

**Union at 0x222C-0x22F8:** Varies by character - don't use generic `fighter_var` from Akaneia. Set up unions per-character (e.g., `laser_holstered` for Fox). Don't copy-paste community structs.

**Struct documentation:**
```c
struct UnkStructTemporary {
    /*0x00*/ char filler0[0x10];
    /*0x10*/ int unk10;
};
// Or: u8 filler[0x10 - 0x00];  // Less mental math
```

**More Fighter offsets:**
- x2C_facing_direction: facing direction
- xE0_ground_or_air: ground/air state (HAL's original name based on symbols)
- x68C-x6B0: possibly AnimPose/SRT/Transform structure
- x914: First hitbox struct
- 0x138: Hitbox struct size
- x6F0: CollData pointer
- x1A5C: GObj pointer for linked hitlag partner
- x2070_int: may be volatile in original code
- x2200-x2240: Union/array varies per character (Sheik=0xC structs, Bowser=floats)
- x619: costume_id
- FighterBone x0/x4: HSD_JObj pointers (not u8*)

**getFighter() paradox:** Some functions in fighter.c require `getFighter()` inline, others break with it. The lower half of fighter.c may have been written by a different programmer (two programmers credited with "Player programming" in Melee credits).

**Sysdolphin naming:** `fp` = fighter pointer; convention is type first letter + `p` for pointer (jp=JObj, mp=Map, gp=Ground)

**Ground/Stage/Map terminology:**
- **Ground (gp)**: The user_data struct for stage entities, analogous to Fighter (fp) and Item (ip)
- **Stage**: A composition of multiple Grounds
- **Map**: A specific type/subclass of Ground
- Ground struct is a god struct with unions: `gp->u.map.*`, `gp->u.scroll.*`, `gp->u.car.*`, etc.
- Size: approximately 0x204 bytes

**Item_Struct official name:** HAL called it `Item_Struct` based on assert strings: `"===== Not Found Item_Struct!! =====\n"`

**HAL naming conventions from Smash 64:**
- `mstat` = motion status (action_state_index)
- `ga` = ground_or_air (changed to full name in Melee)
- `lr` = facing direction (-1 left, 1 right) - used for multiplying velocity
- States called "motions" internally: `"don't have smash42 motion!!!"`
- `_Struct` suffix naming: `Ground_Struct`, `Fighter_Struct`

**Proc callback naming:**
- proc update = animation callback (recommended: `anim_cb`)
- proc map = collision callback (recommended: `phys_cb`)
- proc hit = item deals damage
- proc shield = item gets blocked
- proc reflector = reflection callback
- proc damage = item gets hit
- HSD uses `pre_cb`, `post_cb`, `drawdone.cb` patterns
- Recommend using `_cb` suffix: `render_cb`, `anim_cb`, `phys_cb`

**Motion vs Action vs Subaction terminology:**
- HAL calls them "motions" internally, "status" in Brawl onward
- Community historically used "Action State" (ASID)
- "Subaction" refers to animation-related data in dat files
- ~341 common states at `fp+2340`

**Attack ID conventions:**
- 0 = not attack
- 1 = not attack but used for staling (needs 1 for "no stale" in attack ID, 0 in state flags)
- IDs >= 2 = specific attack types

**Attack group flags (x2070):**
Located around offset 0x2070 in fighter struct, using halfword union convention. Link's boomerang gets flagged as smash attack if thrown with smash-B input.

**SurfaceData struct:**
```c
typedef struct SurfaceData {
    s32 index;     // 83C
    u32 unk;       // 840
    Vec3f normal;  // 844
} SurfaceData;
```
At `fp+0x14C`, accessible as `&fp->x14C_ground.normal` at offset 0x844.

**Module abbreviations:** `gm`=game, `mp`=map (collision-related), `mpcoll`=map collision

**Special attributes union (0x222C-0x2340):** Named `sa`, accessed as `ft->sa.mario.x222C`. Clone fighters reuse base character's struct (DrMario=Mario, Falco=Fox, etc.).

**State variables refined naming (March 2023):**
- `x2D4` - Read-only file pointer to character-specific attributes (move attrs, special attrs)
- `x222C` - **FighterVars** - mutable character-specific persistent variables (can contain GObj pointers)
- `x2340` - **MotionVars** - action state-specific variables (wiped on state change)

Items use single state vars struct shared across all action states (ItemVars). Pokemon are items.

**x2070 union:** Confirmed union allowing both packed field access and single s32 read:
```c
union Struct2070 {
    struct { s8 x2070; u8 x2071_b0_3: 4; /* bitfields */ u8 x2073; };
    s32 x2070_int;
};
```

**Fighter allocation sizes (from HSD_ObjAllocInit):**
- Fighter struct: 0x23EC bytes
- CharacterSpecialStats: 0x424 bytes
- ftCommonData/Bones: 0x8C0 bytes
- DObjList: 0x1F0 bytes

**Input flags:**
- `fighter->input.x668`: button press flags (instant presses)
- `fighter->input.x65C`: held button flags
- Each bit represents a button (e.g., 0x200)

**Callback naming convention:** Special moves use `SpecialN`, `SpecialS`, `SpecialHi`, `SpecialLw`. Air versions: `SpecialAirN`, `SpecialAirHi` (not `SpecialNAir`). Callback functions get `_Action` suffix: `ftNess_SpecialHi_Action`.

**Controller nml_ fields:** "normalized" - values scaled to 0.0-1.0 range. Raw pad values are s8, divided by scale factors (stick: 80, analogLR: 140).

**Japanese internal names:** Koopa=Bowser, Purin=Jigglypuff, Mars=Marth, Emblem=Roy, CLink=Young Link, GKoopa=Giga Bowser. ZakoBoy/ZakoGirl=Wireframes ("zako"=small fish/expendable).

**Japanese names in code:**
- `ottotto` = teeter
- `furafura` = dazed
Recommendation: Use English names in code with Japanese noted in comments.

**Animation name conventions (from dat file node names):**
- `Hi`/`Lw` = High/Low (for aerials)
- `F`/`B`/`U`/`D` = Forward/Back/Up/Down (for throws, U/D for prone facing)
- `3` = tilt, `4` = smash (Attack prefixes)
- Names from animation filenames like `PlyCaptain5K_Share_ACTION_Swing42_figatree`

**Fighter file naming conventions:**
- `PlDk.dat` - Player Donkey Kong (fighter data)
- `PlDkNr.dat` - Normal colors/models
- `PlDkAJ.dat` - Animation Joint data ("AJ" = AnimJoint)

**Clone fighter code structure:** Clones (Falco, Ganon, Young Link, Pichu, Dr. Mario, Roy) share most code with parent. `ftFalco.s` mostly contains data with function pointers to Fox functions. Parent checks which clone is calling and runs appropriate animation. Ganon's warlock punch and Falcon's falcon punch are the same function.

**PUSH_ATTRS macro:** Common pattern in all fighter OnLoad functions for copying special attributes from dat file to fighter struct.

### 4.2 HSD_GObj & Related Types

**HSD Object Init Pointers:**
- `hsdMObj` - 80405E28 → MObjInfoInit
- `hsdLObj` - 804060C0 → LObjInfoInit (80367688)
- `hsdCObj` - 80406220 → CObjInfoInit
- `hsdPObj` - 80406398 → PObjInfoInit (8036eb88)
- `hsdJObj` - 80406708 → JObjInfoInit (803737F4)
- `hsdObj` - 804072A8 → ObjInfoInit
- `hsdClass` - 80407590 → _hsdInfoInit (803822C0)

To find these: search xrefs to `hsdInitClassInfo` (80381c18) - r3 contains the static pointer.

**GObj classifier values:**
- GOBJ_CLASS_STAGE=0x2, GOBJ_CLASS_PLAYER=0x4, GOBJ_CLASS_ITEM=0x6
- GOBJ_CLASS_GFX=0x8, GOBJ_CLASS_TEXT=0x9, GOBJ_CLASS_HSD_FOG=0xA, GOBJ_CLASS_HSD_LOBJ=0xB

**HAL "C with classes" pattern:** Class-based objects have Info struct with callbacks: Alloc, Init, Release, Destroy, Amnesia. Also has Object type = Class + reference counting.

**GObj cross-game lineage:** Same basic structure in Smash 64, Kirby 64, Pokemon Stadium 64, Kirby Air Ride - part of HAL's engine. Melee has `gx_link` field; N64 equivalent uses `dl_link` (display list link).

**HSD_GObj size:** Confirmed to be `0x38` bytes. Init info at `803914A0`.

**ftCollisionBox vs ftECB:**
```c
struct ftCollisionBox {
    float top;
    float bottom;
    Vec2 left;
    Vec2 right;
};
```
`ftCollisionBox` has floats for top/bottom, while `ftECB` has `Vec2` for all four points. Some functions incorrectly use `ftECB` when they should use `ftCollisionBox`.

**Sysdolphin history:** Melee was likely the first game to use sysdolphin library - represents HAL's entire GC engine framework. Melee uses exact same hard RNG algorithm as N64 HAL games (Kirby 64, etc.).

**GObj/Proc naming:** Actor/entity callbacks are "Procs" (GObjProc). Class defines: `4` for players, `2` for stages. When used as simple callees, use generic name `gobj`.

**HSD JObj inlines:**
- Most HSD inlines have asserts at their start
- `HSD_JObjSetMtxDirty` is the exception - no assert
- `HSD_JObjMtxIsDirty` definitely exists as inline (high usage)
- JObj's mtx callback struct changed between sysdolphin versions
- Fighter_UpdateModelScale requires multiple nested inlines: getFighter, getHSDJObj, Fighter_InitScale, HSD_JObjSetScale

**HSD_SList structure:**
```c
typedef struct _HSD_SList {
    struct _HSD_SList* next;
    void* data;
} HSD_SList;
```
Used extensively in bytecode interpreter. Data cast to different types (s32, f32, pointer) depending on context.

**Mtx type:**
`Mtx` is a 3x4 matrix (not 3x3), called a TRS (Translation-Rotation-Scale) matrix. It's a float array: `float Mtx[3][4]`.

**dat_attrs getter pattern:**
There appears to be a getter inline for `fp->dat_attrs` similar to GET_FIGHTER. Using `getFtSpecialAttrsD(fp)` with a cast fixes stack issues in some functions:
```c
ftKb_DatAttrs* dat_attr = (ftKb_DatAttrs*)getFtSpecialAttrsD(fp);
```
This may explain extra stack padding in many fighter functions.

**GET_JOBJ may be fake:**
Evidence suggests `GET_JOBJ` macro may not be real. Direct access `gobj->hsd_obj` sometimes works better than the macro. Functions with `HSD_JObjGetNext(HSD_JObjGetChild(...))` chains may not use the macro.

**CollData ECB differences:** ECB (Environmental Collision Box) in item.h uses 4x f32, but in fighter.h uses 4x Vec2. Fighter ECBs are animated which may explain the difference.

**CollData wall naming convention:**
`CollData` struct ends with four `SurfaceData` fields: `floor`, `right_wall`, `left_wall`, `ceiling`. For wall fields, the side refers to the side of the fighter contacted (left_wall = wall contacted on fighter's left). Function names and flag enums use the opposite convention (referring to wall facing direction).

**GObjProc structure:**
```c
struct HSD_GObjProc {
    u8 s_link;      // priority
    u8 flags_1;
    u8 flags_2;
    u8 flags_3;
    HSD_GObj* owner;   // x10
    void (*on_invoke)(HSD_GObj*);  // x14
};
```
Chained flag assignments: `gproc->flags_1 = gproc->flags_2 = 0;`

**Articles:** Items spawned by users (fighter items, stage items). Article data accessed through `item.h`. Chain item article pointer in Sheik: `item_gobj->user_data->xC4_articleData->x4_specialAttributes->x48`.

**Item_GObj structure:**
```c
struct Item_GObj {
    /*  +0 */ u16 classifier;
    /*  +2 */ u8 p_link;
    /*  +3 */ u8 gx_link;
    /*  +4 */ u8 p_priority;
    /*  +5 */ u8 render_priority;
    /*  +6 */ u8 obj_kind;
    /*  +7 */ u8 user_data_kind;
    /*  +8 */ Item_GObj* next;
    /*  +C */ Item_GObj* prev;
    /* +10 */ Item_GObj* next_gx;
    /* +14 */ Item_GObj* prev_gx;
    /* +18 */ HSD_GObjProc* proc;
    /* +1C */ void (*render_cb)(Item_GObj* gobj, s32 code);
    /* +20 */ u64 gxlink_prios;
    /* +28 */ HSD_JObj* hsd_obj;
    /* +2C */ Item* user_data;
    /* +30 */ void (*user_data_remove_func)(Item* data);
    /* +34 */ void* x34_unk;
};
```

**ftHitVictim array:** Has 12 elements (used in collision detection loops). Accessed at `hit->x74_victim[i]`.

**Component/Track system:** HAL games use arrays for individual values; each actor reserves a "track" (index). Track number stored in `some_GObj->id`.

**C vs C++:** All Melee game code is C. C++ exception handler (`__init_cpp_exceptions`) is from linked library stuff - developers likely forgot to turn off C++ exceptions.

**Collision:** Melee uses BSP (Binary Space Partitioning) - collision debugger shows scene partitioning similar to Kirby.

**Physics/rendering architecture:**
- Physics updates decoupled from rendering rate
- Lightning Melee = faster physics; Slow Mo = slower
- Input polling runs in separate thread at 60Hz (not 59.95) - causes occasional "dead input frames"
- `ftcommon` contains physics and shared functions; common action states (walk, jump, shield) are shared
- Character files contain: Specials, OnLoad, OnDeath; state machine data is in `.dat` files
- Japanese names: `ftpurin` = Jigglypuff

**PAL vs NTSC timing:**
- Game/physics engine runs at same rate between PAL and NTSC
- PAL skips rendering every 6th frame
- PAL60 mode works like NTSC

**Generic Action-State Table Entry (0x20 bytes):**
```c
struct anim_ft {
    u32 id;                  // Action state ID
    u32 unk_flags0;          // Flags
    u32 unk_flags1;          // Flags
    u32 animationInterrupt;  // Function pointer
    u32 inputInterrupt;      // Function pointer
    u32 actionPhysics;       // Function pointer
    u32 collisionInterrupt;  // Function pointer
    u32 cameraBehaviour;     // Function pointer
};
```

### 4.3 Item/Ground Structures & Key Functions

**Item code patterns:**
- Similar to fighter code but uses `Item` instead of `Fighter`
- `GET_ITEM` macro handles stack weirdness (similar to GET_FIGHTER)
- First function in each item's text section is typically an initialization function
- Includes not just throwables but character animations, models, NPC enemies
- Callbacks follow predictable patterns - good for farming percent

**Item flags at xDC8:**
```c
void it_80293D94(Item_GObj* arg0) {
    Item* item = GET_ITEM((HSD_GObj*)arg0);
    if (!item->xDC8_word.flags.xB && item->xDC8_word.flags.xA) {
        it_8026BC14(arg0);
    }
}
```
Word-sized flags field containing u8-sized flag structs.

**It_Kind_Unk1:** Initialization function only called from Kirby SpecialN functions - related to suck/spit or copy star (losing copy ability).

**Item struct conventions:**
- Runtime variables: `item->xDD4_itemVar`
- Serialized attributes: `item->xC4_article_data->x4_specialAttributes`
- Character item structs go in `itCharItems.h`
- Common item structs go in `itCommonItems.h`

**UNK_T fields:**
`UNK_T` in structs means the type is unknown - treated as `void*`. Arrays with hexadecimal names (like `x1234[0x100]`) indicate unknown data. Don't name fields based on external documentation until confirmed by decompiling.

**HSD_ByteCodeEval:** ~1,600 lines of ASM, one of the largest functions. Contains two major switch statements, 91 assert calls. Evaluates RObj bytecode scripting system (not fighter animation bytecode). Opcodes 0x00-0xFF.

**ECB_Interpolate (mpcoll.c):** Responsible for rare tournament crash at line 1193. Crashes when any ECB float becomes NaN. Checks 8 float values with `fpclassify(x) == FP_NAN`, calls `OSReport("error\n")` then asserts "0".

**Fighter_OnItemPickup callbacks:** Most fighters share nearly identical functions. Some fighters (Kirby, Link, CLink, Purin, Mewtwo) differ. Related: OnItemInvisible, OnItemVisible, OnItemRelease.

**Sheik/Ness cross-reference:** ftSheik uses an ECB calculation function defined in ftNess_AttackHi4.c - unusual case of one fighter using another fighter's C file function.

**Stripped function strings:** When linker strips a function but it contained assert strings, strings remain in binary. Workaround: declare const strings between functions to maintain ordering.

**OSRestoreInterrupts SDK bug:** In Melee's SDK version, returns value in r4 instead of r3. Fixed in SDK 1.2+. Nothing uses the return value, so it doesn't cause issues.

**DVDFileInfo size bug (actual bug in original game):**
`DVDFileInfo` in the decomp is larger than what Melee used. `DVDFastOpen` writes to offset `0x38` (callback) which can corrupt memory with old struct size. Workaround:
```c
typedef struct OldDVDFileInfo {
    DVDCommandBlock cb;
    u32 startAddr;
    u32 length;
} OldDVDFileInfo;
```

**HSD_ByteCodeEval debug info (from K7):**
Completely unused function with full debug symbols:
```
HSD_ByteCodeEval(u8* bytecode, f32* args, s32 nb_args)
Local variables: stack, i, last_command, operand_count, operand, list, f, f0, f1, d0, d1
```
Function at `802e4988-802e6080`. Referenced by RObj but never actually called by the game.

**HSD_TevExpFreeList typo:** Original code has duplicate check instead of checking both fields:
```c
// Bugged original:
if (ptr->tev.c_ref == 0 && ptr->tev.c_ref == 0) {  // Should be a_ref
```

**Particle code null check inversion bug (discovered January 2024):**
```c
gp = pp->gen;
if (gp == NULL) {  // BUG: Should be != NULL
    *x = gp->x;    // Reads from address 0x24 when gp is NULL!
    *y = gp->y;
    *z = gp->z;
    return;
}
```
When `gp` is NULL, it loads from RAM addresses 0x24, 0x28, and 0x2C. This was fixed in K7.

**Naming convention:** Use `fighter_gobj` (snake_case) not `fighterObj` (camelCase), based on leftover asserts showing `item_gobj` pattern.

### 4.3.1 Damage & Attack Systems

**Damage Log Structure (at `80459278`):**
Stores up to 10 simultaneous hits per frame:
- Hurtbox that got hit
- Attacker's hitbox pointer
- Attacker's GObj
- Log index resets every frame
- All players share the same log
Melee also has "tiplog" for phantom hits.

**Enable Jab Followup Event:**
The 26-bit value after opcode:
- 0 = normal
- 1 = bunny hood only (can start followup only if bunny hood equipped)
This is why Ganondorf could do his second jab with bunny hood in v1.00.

**Subaction Event: Graphic Effect (0x0A):**
```c
struct GraphicEffect_Header {
    u32 opcode : 6;
    u32 boneId : 8;
    u32 useCommonBoneIDs : 1;
    u32 destroyOnStateChange : 1;
    u32 useUnkBone : 1;  // Forces spawn on head instead of given bone ID
    u32 padding : 15;
};
// Range values are UNSIGNED - if signed, it stops matching
```

**Subaction event opcode extraction:**
```c
// Correct approach - loading a 6-bit opcode:
struct SubactionEvent {
    u32 opcode : 6;
    // ... other fields
};
```
Wrong approach: `eventCode /= 4; eventCode %= 64;`

### 4.3.2 RNG Algorithm

Melee's RNG uses Linear Congruential Generator (same as CodeWarrior stdlib):
- Multiplier: 214013
- Increment: 2531011
- Game code uses `sysdolphin/random.c`, NOT `MSL/rand.c`
- `OSPanic` is a weak symbol that can be overridden

### 4.4 Union Patterns & Bitfields

**Bitfield type affects codegen:** The type of bitfield (`u8 x0: 1` vs `u32 x0: 1`) matters for generated instructions. `lwz`/`lhz`/`lbz` selection depends on bitfield type and span.

**Bitfield access patterns:**
When decompiler produces `(u8)(flag & ~0x10)`, it often indicates a bitfield struct. The `b*` fields (b0, b1, etc.) allow setting individual bits:
```c
// Instead of: item->xDCC_flag.b0 = (u8)(item->xDCC_flag.b0 & ~0x10);
// Write: item->xDCC_flag.b3 = 0;
```
Search context for the offset (e.g., `x2219`) to find the correct bitfield access like `fp->x2219_b1`.

**ActionStateChange flags:** 32-bit flag values like `0x0C4C5080` are typically ORed constants:
```c
#define FLAG_A (1 << 7)
#define FLAG_B (1 << 14)
func(FLAG_A | FLAG_B | FLAG_C | ...)
```

**Collision flags (CollData):**
```c
#define Collide_LeftWallPush 0x1     #define Collide_RightWallPush 0x40
#define Collide_LeftWallHug 0x20     #define Collide_RightWallHug 0x800
#define Collide_CeilingPush 0x2000   #define Collide_CeilingHug 0x4000
#define Collide_FloorPush 0x8000     #define Collide_FloorHug 0x10000
#define Collide_LeftEdge 0x100000    #define Collide_RightEdge 0x200000
#define Collide_LeftLedgeGrab 0x1000000   #define Collide_RightLedgeGrab 0x2000000
#define CollisionFlagAir_StayAirborne 0x1
#define CollisionFlagAir_PlatformPassCallback 0x2
#define CollisionFlagAir_CanGrabLedge 0x4
```

**CollData union at x104 (size 0x2C):** x104 acts as tag for whether it contains floats or JObj pointers. When x104 == 2: Contains floats (ECB dimensions + rotation). Otherwise: Contains JObj pointers.

### 4.5 HSD Naming Conventions

The sysdolphin library uses single-letter prefixes for object types:

| Prefix | Type | Description |
|--------|------|-------------|
| A | AObj | Animation Object |
| C | CObj | Camera Object |
| D | DObj | Data Object (display list) |
| F | FObj | Frame Object |
| G | GObj | Game Object (universal container) |
| J | JObj | Joint Object |
| L | LObj | Light Object |
| M | MObj | Material Object |
| P | PObj | Polygon Object |
| R | RObj | Reference Object (attachments/bytecode) |
| T | TObj | Texture Object |
| W | WObj | World Object |

**File/module naming conventions:**
| Prefix | Meaning |
|--------|---------|
| cm | Camera |
| db | Debug |
| ef | Visual effects |
| ft | Fighters |
| gm | Game (main game loop) |
| gr | Ground (stages and levels) |
| if | Interface/UI (HUD overlays - iftime, ifstock, ifmagnify) |
| it | Items |
| lb | Library, utility functions |
| mn | Menus |
| mp | Map (stage collision) |
| pl | Players (as in users) |
| sc | Scene |
| ty | Toy (trophies) |
| un | Unknown (not original folder) |
| vi | Visual (cutscenes) |

**Stage name mappings:**
gr = Ground (stages): grTMars=Marth Target Test, grLast=Final Destination, grGarden=Fountain of Dreams, grOldPupupu=Dream Land

---

## 5. Build System & Tooling

### 5.1 Compiler Toolchain

**Disassembly:** `mwldeppc.exe -dis file.o`

**Linker directives:**
- `FORCEFILES` - Prevents linker from discarding "unused" sections
- `FORCEACTIVE` - Forces specific symbols to be kept
- Partial filename matching can cause conflicts (`debug.o` vs `dsp_debug.o`)
- Link times are O(n²) on symbol count; splitting files dramatically improves speed

**Small Data Area (SDA):**
- Variables ≤8 bytes go in `.sdata` (r13-relative) or `.sbss`
- Read-only small data goes in `.sdata2` (r2-relative)
- `_SDA_BASE_ = 0x804DB6A0`
- `_SDA2_BASE_ = 0x804DF9E0`

**String literals:**
- Strings <8 bytes go in `.sdata`
- Larger strings go in `.data` (not `.rodata`)

**SDA Base Calculation:**
- `_SDA_BASE_` = sdata section base + 0x8000
- `_SDA2_BASE_` = sdata2 section base + 0x8000
- Offset exists because EABI requires SDA offsets within signed 16-bit; allows accessing twice as much SDA memory with negative offsets

**Assembly limitations:**
- mwasmeppc doesn't recognize `.global` for externals - must use `.extern`
- GNU assembler cannot generate `R_PPC_EMB_SDA21` relocations for SDA-relative access
- Only inline assembly in C files (processed by mwcc) properly generates SDA21 relocations
- Use `.4byte` instead of `.word` - `.word` may be silently ignored

### 5.2 Build Tools (objdiff, decomp.me, m2c)

**Dolphin emulator:** Can load extracted filesystem directly (no ISO rebuild needed). Right-click game → Properties → Filesystem → Extract to get DOL.

**Debug symbol sources:**
- Interactive Multi-Game Demo Disk 2004 - Full TRK debug symbols
- Killer7 - Unoptimized sysdolphin with DWARF v1 debug info
- HAL Resource Tool - Struct definitions for many HSD types
- Zoids games, Bloody Roar: Primal Fury - Additional HSD symbols
- Mario Kart Arcade GP - Uses HSD, useful for cross-referencing
- Doldisasm generates .s files (for GNU assembler, not mwasmeppc directly)
- Run CCCHECK with GCC to parse C syntax before mwcc (catches errors mwcc doesn't report clearly)

**m-ex types reference:** Types in m-ex (`github.com/akaneia/m-ex`) may be more thoroughly named, but validate before use. Keep hex offset names with m-ex names as comments when uncertain.

**Subaction scripts as bytecode:** Melee's subaction script resembles bytecode: 6-bit opcode, remaining bits are operands, has GOTOs, maintains state machine.

**Wine compatibility:** Wine 5.14+ broke CodeWarrior linker; Wine 5.13 is last known working version.

**wibo (Wine alternative):**
- Lightweight Windows binary loader for Linux, much faster than Wine (2x speedup)
- No DLL loading overhead; fixed intermittent linker failures
- MWLD 1.1 has bug reading garbage from stack under wibo; patch:
```bash
printf '\x51' | dd of=tools/mwcc_compiler/1.1/mwldeppc.exe bs=1 seek=130933 count=1 conv=notrunc
```
- Use 1.1 locally with patch, 1.2.5 on CI for reliability

**Ghidra setup:** Gekko/Broadway language extension available at `github.com/aldelaro5/ghidra-gekko-broadway-lang`

**Official documentation links:**
- Context for decomp.me: `doldecomp.github.io/melee/ctx.html`
- Progress page: `doldecomp.github.io/melee/progress/`
- Asm dump: `doldecomp.github.io/melee/dump/`
- TU assignments: `github.com/doldecomp/melee/wiki/Translation-Units`
- All Melee scratches: `decomp.me/preset/63`
- Training scratch with exercises: `decomp.me/scratch/I6vWF`

**rlwinm decoder:** `celestialamber.github.io/rlwinm-clrlwi-decoder/` for understanding rotate/mask instructions

**File splitting techniques:**
1. Panic strings: Filenames in panic messages indicate TU boundaries
2. Float-to-int constants: `0x43300000` appears once per compilation unit
3. Call trees: Functions only called by nearby functions likely same file
4. 8-byte alignment: Data sections align to 8 bytes at file boundaries
5. Pointer tables: Item pointer tables help identify `it_*` boundaries

**lb functions:** `lb` prefix functions (like `lbvector`) are NOT part of sysdolphin - separate .a libraries with different compilation settings.

**decomp.me usage:**
- Copy ASM from melee repo, not Ghidra (Ghidra output won't assemble)
- When extern data shows as `(0)` instead of `(r2)`, that's expected
- Add to context: `inline double fabs(double x) { return __fabs(x); }`

**Cross-referencing:** Pikmin 1/2 share MSL/SDK code with Melee and have symbol maps. fdlibm (Sun Microsystems) at netlib.org/fdlibm/ matches many math functions.

**decomp.me updates (June 2022):**
- Small data relocations no longer penalize scores - 100% match shows score 0
- Click a register to highlight all usages of that register
- Symbol consistency checking added - flags when @N refers to different labels
- Matching external data shows blue inline markers but white line text

**asm-differ tips:**
- Run with `--debug` flag for detailed scoring information
- Scoring issues can sometimes be asm-differ bugs, not code issues
- Some "white" (matching) lines may actually have differences - inspect carefully
- Score of 0 = complete match; higher score = more bytes not matching
- Regswaps penalize less than reorders

**Permuter tips:**
- Doesn't work with `?` placeholder types from decompiler - replace with actual types
- Variable function calls can cause issues - comment out errors
- Use `PERM_RANDOMIZE()` macro for targeted permutation

**dadosod usage:** Dumps DOL to structured ASM with symbol names. Use release mode (`cargo b -r`) for performance. Works natively on Linux, wibo on Windows. Needs map.csv from `python tools/parse_map.py`.

**objdiff reference:** `github.com/encounter/objdiff` - useful for diffing object files.

**Map file from GitHub Actions:**
Get `GALE01.map` from GitHub Actions artifacts:
1. Go to `github.com/doldecomp/melee/actions/workflows/build-melee.yml`
2. Find latest successful run on master
3. Download `GALE01.map` under Artifacts

**asm-differ setup for new files:**
After setting up a new function file:
1. Run `make` once with `WIP=1`
2. Then asm-differ with `-m` option will auto-rebuild

**Ninja build system:** 2-3x faster than Make for full rebuilds. No-change rebuilds: `0.010s` (ninja) vs `0.113s` (make). On Windows: ~7s vs ~31s. Uses `deps = gcc` to cache dependency files internally.

**DTK (Decomp Toolkit) transition (January 2024):**
Project transitioned from make+asm to ninja+dtk:
- No more need for asm files in repo (generate on-demand)
- objdiff replaces asm-differ for most use cases
- Partial linking no longer needed - objdiff handles partial matches
- Files can be "unlinked" in configure.py and worked on incrementally
- Use `ninja all_source` to build all source files including unlinked

**DTK split configuration:**
- Splits should include alignment padding
- Set split end to where next symbol starts
- Use `data:string` to tell DTK a symbol is a string
- When a symbol shows `scope:local` but has `_{address}` suffix, it was "globalized" (referenced from another TU due to wrong split)

**Build commands:**
```sh
python configure.py && ninja         # Basic build
ninja all_source                     # Build all source files including unlinked
ninja diff                           # Find which files broke when debugging
(ninja && ninja all_source) || ninja diff  # Build with diff on failure
python configure.py --map && ninja   # Generate MAP file (slower, imports into Dolphin)
```

**objdiff-cli:**
```sh
cargo install --git https://github.com/encounter/objdiff.git objdiff-cli
objdiff-cli report                   # Generates detailed per-function progress
```
objdiff is less forgiving than asm-differ - considers relocations by default even with Levenshtein distance enabled.

**Useful tools (2025):**
- `tools/scaffold.py <path>` - Generate function name comments for partially matched files
- `tools/easy_funcs.py -a -S 24 -M 99.999` - Find small, nearly-matched functions for quick wins
- `tools/decomp.py` - Run m2c locally with auto-generated context
- `tools/link.py src/melee/path/to/file.c` - Make build system use C file
- `tools/replace-symbols` - Proper symbol renaming (updates symbols.txt, asm, references)
- `ninja baseline` + `ninja changes` - Compare branches in objdiff
- `ninja apply` - Update symbols.txt from built ELF (linked files only)
- `ninja changes_all` - Shows both regressions AND improvements
- `ninja all_source` - Build all source files including unlinked

**m2c enhancements (2025):**
- `--union-field Fighter_FighterVars:kb` - Force specific union field selection
- `--union-field Fighter_MotionVars:kb` - Avoids manual union field reordering
- `--void-var-type temp_r5:ftKb_DatAttrs` - Specify types for void* variables

**Debug mode with line numbers:**
```bash
python configure.py --debug --build-dir debug  # Separate build dir
python configure.py --require-protos            # Non-debug mode
```
Debug mode gives line numbers in objdiff (useful during development). Use `#pragma sym on` at file top for per-file debug.

**Deprecated tools (2025):**
- `asm-differ` - Completely deprecated, use objdiff
- `report_score` - Replaced by decomp-dev-bot
- `calcprogress` - Deprecated
- `Makefile` - Deprecated, use ninja/dtk

**Map size optimization:** Using `.L` prefix for jump labels (instead of `lbl_`) prevents them from being placed in map. Halves map size.

**Windows stdout performance:** stdout is slower when terminal window is visible. Minimizing terminal makes long-running processes faster.

**Community symbol database warning:** Do NOT use names from Dolphin memory map / community database in the codebase. Contains 20 years of modder guesses - some names are completely wrong. Can use for debugging, but not for official naming.

**Register conventions (mwcc):**
- r0: Scratch register
- r1: Stack pointer
- r2: Pointer to .sdata2 (constants) - set at startup, never changes
- r3: Return value, first argument
- r3-r10: Function arguments
- r3-r12: Can also be used as locals
- r0, r14-r31: Local variables
- r11: Stack frame pointer (certain optimizations)
- r12: Reserved for calling variable functions
- r13: Pointer to .sdata/.sbss - set at startup, never changes
- r31-: Locals (descending from r31)

**Context generation for decomp.me:**
```bash
gcc -E -P include/melee/ft/fighter.h > ctx.c
```
Convert `@address` syntax: `OSContext* OS_CURRENT_CONTEXT @ 0x800000D4;` → `OSContext* OS_CURRENT_CONTEXT = (OSContext*)0x800000D4;`

**Context generation optimization:**
- Edit the `files` list in m2ctx `write_header` to only use needed headers
- Omitting unused function declarations speeds up pycparser
- Auto-generated context available at: `doldecomp.github.io/melee/ctx.html`

**__FILE__ macro behavior:**
- `__FILE__` and a hardcoded string like `"foo.c"` are NOT merged - treated as different
- `__FILE__` can affect ordering of string literals
- For scratches, check what `__FILE__` evaluates to in context (e.g., `ctx.c`)

**Assertion filename format:**
- Wrong: `__assert("src/sysdolphin/baselib/jobj.h", ...)`
- Right: `__assert("jobj.h", ...)`
Must use basename only, not full path.

**Sorting ASM files for productivity:**
Sort item asm files by line count (or byte count) and start with smallest. Learn patterns on simpler functions first; by the time you reach larger files, patterns are familiar.

### 5.3 Known CI/Build Issues

**Linker quirks:**
- `extab` section name is treated specially; may need different naming
- Partial filename matching can cause wrong file insertion
- Empty/stub functions may be ignored even with `FORCEACTIVE`
- Files with similar names (e.g., `id.o` and `grkraid.o`) may conflict
- extab/extabindex sections need proper GROUP placement in LCF; may need renaming to `extab_` and `extabindex_`
- Melee has C++ exception tables despite `-Cpp_exceptions off` (suggests pre-release build or library linkage)
- mwasmeppc-assembled objects have default 0x10 alignment; C-compiled objects do not
- File paths are case-sensitive on Linux; Makefiles must preserve case
- `CWParserSetOutputFileDirectory [3]` error: fix by moving `-o $@` to end of link command
- Use MSYS2 (not Windows CMD) for building; fresh devkitpro install required
- **devkitPPC r40-3 bug:** Produces incorrect output; downgrade to r39-2 (`wii.leseratte10.de/devkitPro/`)
- Always run `make clean` after changing devkitPPC versions
- Map generation: `make -j4 GENERATE_MAP=1` (slow, optional)
- Verbose build: `make VERBOSE=1`

**Dead code stripping:** Linker strips unused functions - won't error on undefined symbols in stripped code. Use `#pragma force_active on` during development.

**#pragma force_active limitations:** Does NOT work reliably for data symbols. Use FORCEACTIVE section in LCF file instead:
```c
FORCEACTIVE { lbl_804C28D0 }
```

**sdata vs sbss:**
- Initialized data goes to sdata: `char lbl[1] = "";`
- Uninitialized/zero-initialized goes to sbss: `char lbl[1]`
- Must specify array size `[1]` - otherwise uses .data relocs

**Parallel build issues:** `make -j` can cause failures - some dependencies not properly specified.

**mwld patch required:** `CWParserSetOutputFileDirectory` bug reads 64 bytes of uninitialized memory and errors if it contains `/\:*?"<>|`. Fix: Run `tools/mwld_patch.py`. Triggered more often with wibo than wine due to stack frame layout.

**Include syntax:**
- Don't use `#include "file.h"` (relative imports) - MWCC 1.2.5 doesn't have `-gccinc`
- Don't use `#pragma once` - buggy on mwcc before version 3.0; use include guards instead

**Reserved identifiers:** Leading underscores are reserved. Use `typedef struct Type Type` instead of `typedef struct _Type Type`.

**Circular dependencies with typedefs:**
To avoid circular includes:
1. Create a `forward.h` with typedefs only
2. Put struct definitions in main header
3. Include the struct header in .c files directly, not in other headers
4. Or use `struct Fighter` everywhere instead of typedef

**GET_FIGHTER macro issues:**
`GET_FIGHTER` stops working in some contexts:
- When extra float args are added (e.g., for landing lag)
- When used in callbacks passed to certain functions like `ft_80082C74`
- Workaround: Use direct `gobj->user_data` assignment with unused stack padding

**sdata mismatches from assertion filenames:**
When context assertions have wrong filenames, it can cause sdata ordering issues that look like `-sdata 32` problems but are actually just wrong strings.

**math.h header conflicts:**
Including math.h can cause sdata2 mismatches in some TUs. Use `intrinsics.h` for `__frsqrte` instead.

**Context generator limitations:**
Does not preserve `AT_ADDRESS` macro for hardware registers. WGPIPE and similar hardware register definitions don't match properly - manual setup required.

**Local label format:**
`.L_` labels in asm don't work with mwcc - replace with `lbl_` prefix for m2c compatibility. The dump branch uses `lbl_` format.

**Handling `.L_` labels:**
- `.L_` labels are local labels for branches, not separate functions
- If a label starts with `mflr`, it's a function - rename it to `fn_XXXXXXXX`
- Small functions without `mflr` also end with `blr`

**Build output tips:**
- Redirect errors to file: `make GENERATE_MAP=1 2> error.txt` or `&>` for all output
- Use `MAX_ERRORS=1` to limit error output
- Check link map (GALE01.map) to find which function uses a specific float
- Float labels like `@79` can be searched in linkmap to find source function

**r40 DevkitPPC compatibility:** Requires `.balign 8` at start of data/sdata/sbss/sdata2 sections at file boundaries. Remove `.4byte NULL` padding that was faking alignment.

**GCC linker limitation:** Cannot link MWCC .o files due to EABI differences - stuck with MWLD even after full decompilation.

**Shiftability explained:**
The decomp is shiftable because symbols are referenced by name, not hardcoded addresses:
```asm
; Non-shiftable (hardcoded): lis r4, -0x7fc0
; Shiftable (symbolic): lis r4, symbol@ha / addi r0, r4, symbol@l
```
The linker resolves `@ha`/`@l` at link time. Can't just search-replace numbers because some are actual data (colors, bitmasks like `0x80400001`).

**SDK version differences:**
Melee uses SDK from around December 2001, not May 2001. September 2001 SDK had significant changes. Some functions have extra null checks that May 2001 lacks.

**GameCube float non-compliance:** GameCube FPU is ~99% IEEE 754 compliant, not 100%. Some edge cases differ (e.g., early CW versions had `Sqrt(0)` return infinity). Be careful when porting code to standard IEEE platforms.

**lwzu/lis pattern fix:** Common disassembly error:
```asm
# INCORRECT:
lis r4, lbl_803C0004@ha
lwzu r3, -0x7c60(r4)      # Actually loads 803B83A0
lwz r0, lbl_803C0004@l(r4)

# CORRECT:
lis r4, lbl_803B83A0@ha
lwzu r3, lbl_803B83A0@l(r4)
lwz r0, 0x4(r4)           # Just offset, no label
```

**OSReport/Dolphin:** Dolphin patches OSReport/OSPanic functions. Shifting SDK functions before OSReport causes freeze.

### 5.4 Workarounds & Patches

**Epilogue postprocessor:** Python script patches `.o` files to swap epilogue instruction ordering after compilation.

**Peephole restoration:** Add `#pragma peephole on` after any `asm` functions to restore optimization for subsequent functions.

**Frank edge cases:**
- Using `-g` (debug info) effectively disables Frank's modifications
- Some optimized switch statements break Frank - branches past function end
- Known to have edge cases that produce incorrect output

**PSVECCrossProduct:** Function at `0x80342E58` uses paired single instructions and is handwritten assembly from the SDK - cannot be matched with C.

**elf2dol BSS fix:** Original elf2dol incorrectly calculated BSS size. BSS size = sizeof(bss) + sizeof(sdata) + sizeof(sbss). Pass PHDR indices to elf2dol.

**SDK template adoption:** Project migrated to official Dolphin SDK LCF template with MEMORY/SECTIONS/GROUP for proper ordering.

**Inline ASM limitations:**
- Remove `@sda21` from inline ASM - use extern for those labels
- `@ha` and `@l` are fine
- Remove `(r2)` from inline ASM
- Better approach: avoid inline ASM entirely

**Inline ASM entry directive:** The `entry` directive lets you export labels inside a function as globals. Syntax: `entry YourNameHere` on its own line inside asm block. Must also forward declare it as a function in C.

**Inline ASM in C files:**
- Syntax: `asm void FunctionName(void) { }` - `asm` keyword after return type
- For non-void: `asm HSD_GObj* funcname(...)` - return type before `asm`
- Callers typecheck against signature even though body is asm
- Jump tables: use `entry` keyword instead of colons (see CWMCUCFCMPREF.pdf p.384)
- Inline asm functions don't get reordered like C functions

**Extern static variable access:** C allows accessing another function's static variable by externing from within a different function. May be needed for some matches.

---

## 6. Project History & Milestones

### July 2020 - Project Inception
- Project begins targeting Melee 1.02 (NTSC)
- Compiler identified as MWCC 2.3.3 build 159 (but likely using pre-1.1 behavior)
- MetroTRK version analysis reveals HAL updated TRK but not the compiler
- Epilogue ordering bug discovered; postprocessor workaround developed
- ~283 file boundaries identified via int-to-float conversion constant duplications
- SDA bases discovered: `_SDA_BASE_ = 0x804DB6A0`, `_SDA2_BASE_ = 0x804DF9E0`
- Sysdolphin file boundaries mapped using Killer7 debug symbols

### August 2020 - Build Infrastructure
- Build migrated to official Dolphin SDK LCF template
- Compiler version hunt begins: team searching for MWCC 2.2.x (not 2.3.x)
- elf2dol BSS size calculation fixed
- SDA base calculations documented: `_SDA_BASE_` = sdata + 0x8000
- Kirby's code estimated at ~34k lines of assembly (~5% of codebase)
- Wine 5.14+ found incompatible with CodeWarrior linker

### Sept-Dec 2020 - Early Progress
- Project at ~1.1% C according to GitHub metrics
- $1000 bounty considered for finding MWCC 2.2.x compiler
- DOL rebuild produces 100% identical binary
- Reference projects: FRAY (prior matching work), melee-re (RE docs), GNT4
- Symbol naming convention established: `filename_address` or `filename_functionality`

### Jan-Apr 2021 - Compiler Hunt Intensifies
- Mac PPC 2.2 discovered with strong codegen body similarity
- Bob Campbell (Metrowerks) contacted; official NXP support ticket opened
- Paired singles instruction analysis: only in prologue/epilogue/inline asm/SDK
- GObj cross-game lineage confirmed with N64 HAL titles
- Melee development estimated at ~13 months from November 2001

### Jun-Oct 2021 - EPPC 4 Bug Analysis
- EPPC 4 prologue/epilogue bug fully documented with expected vs produced assembly
- Mac MWCC 2.2 tested to verify bug inheritance
- COMPILER_NONMATCHING strategy proposed for tentatively matching functions
- File splitting nearly complete; shiftable build targeted
- eigenform's ASSERT.md documents file boundaries: `github.com/eigenform/melee-re/blob/master/docs/ASSERT.md`
- HAL used SoftImage for modeling (not Maya)

### November 2021 - Full Shiftability Achieved
- **November 19, 2021:** Melee achieves full shiftability (one day after game's anniversary)
- ~16k pointers needed cleanup initially; worked down to ~500 debug menu strings
- lwzu/lis pattern fixes critical for correct label resolution
- postprocess.py script fixes some scheduling issues
- Progress at month end: 0.31% code, 290 trophies/51 events tracking begun
- epochflame identified compiler stack frame gen function at 0x433ff2

### December 2021 - Foundation Building
- Progress: 0.76% code (29,588 bytes), 0.15% data
- Frank (1.2.5e) vs plain 1.2.5 compiler split established for SDK vs game code
- decomp.me workflow established; Pikmin cross-referencing begins
- fdlibm (Sun Microsystems) identified as MSL math source
- Fighter struct (0x23EC bytes) documented; ft files structure clarified
- Data splitting rules and link order documented
- Some Melee behaviors may be caused by undefined behavior in original code (V-canceling)

### January 2022 - Workflow Refinement
- devkitPPC r40-3 bug discovered; community downgrades to r39-2
- Frank tool documented: applies to entire files, not individual functions
- Fighter struct union (0x222C-0x22F8) varies by character - don't use Akaneia structs
- Physics/rendering architecture documented (decoupled updates)
- Workflow best practices: rename then decomp, verify at every step
- rlwinm decoder tool shared for rotate/mask instructions

### February 2022 - 2% Milestone
- Progress: reached 2% code decompiled
- r40 DevkitPPC compatibility achieved (.balign 8 fix)
- Loop unrolling rules documented (max 9 iterations in 1.2.5)
- FrankLite alternative for single-function epilogue fixes
- rumble.c fully decompiled; many clone fighters completed
- HAL "C with classes" pattern documented

### March 2022 - Accelerating Progress
- Progress: 2.1% → 3.38% code, 2.65% data (Marth character completed)
- Permuter tool introduced for brute-force line reordering
- Naming conventions documented (`fp` = fighter pointer pattern)
- DK code found physically split by other characters in binary
- decomp.me API documented; Akaneia context warning established

### April 2022 - 5% Milestone, fighter.c Complete
- Progress: 5.07% code, 2.94% data
- fighter.c completed - major milestone
- Fighter special attributes union (0x222C-0x2340) documented
- frank.py patches for epilogue edge cases
- Japanese internal names documented (Koopa, Purin, Mars, etc.)

### May 2022 - 6.9% Code, Fighter OnLoad Complete
- Progress: 6.90% code
- All 33 fighter OnLoad/OnDeath functions matched using PUSH_ATTRS macro
- Fighter code estimated at ~26% of DOL
- Self-assignment trick (`x = x;`) and triple equals trick documented
- Effect system (ef_) documented with IDs 0-591 particles, 1100+ models

### June 2022 - 7%+ Code, ftMario Complete
- Progress: 7.45% code (289,364 bytes), 21 trophies
- ftMario character completed
- getFighter() paradox discovered - evidence of two programmers on fighter.c
- Float literal precision issues documented (use M_PI/3 for exact values)
- Peephole bug after asm functions confirmed and workaround established
- Inline auto depth documented (3 levels default, `-inline auto,level=N`)
- Major fighter.c cleanup pass begun; item.c files progressing

### July 2022 - 9.5% Code, mtx.c Complete
- Progress: 7.5% → 9.5% code, 27 trophies
- mtx.c fully decompiled (previously one of hardest files due to matrix inverse function)
- wibo (Wine alternative) adopted - 2x speedup, MWLD 1.1 patch for stability
- Static vs inline float ordering documented (critical for partial decompilation)
- Float absolute value bit hack macro discovered (clrlwi pattern)
- Major fighter work: G&W, Luigi, Fox, Donkey Kong, Zelda
- CW_Update.zip search continues (Eternal Darkness developers couldn't share)

### August 2022 - 12% Code
- Progress: ~12% code, ~3.4% data, 35 trophies
- Collision flags (CollData) fully documented
- Division by constants using MULT_HI pattern documented
- Section allocation rules clarified (string literals exception)
- (s64) cast trick discovered for regswap fixes
- Python venv setup documented; calcprogress script updated for newer map format

### September 2022 - Progress Recalculation
- Progress recalculated properly excluding inline asm (dropped from ~14% to ~12%)
- HSD_JObjSetMtxDirty discovered to be define, not inline (fixes fighter.c problems)
- Float constant sharing technique documented for ASM/C mixed files
- OSRestoreInterrupts SDK bug documented
- Compiler decompilation project discussion began (goal: understand 1.2.5e patch)
- dadosod tool adopted for DOL-to-ASM dumping

### October 2022 - 12.28% Code
- Progress: 12.28% code, 5.11% data, 35 trophies
- Inline ASM in C files syntax documented (`asm void` pattern)
- Clone fighter code structure documented (function pointers to parent)
- CPU AI code noted as "serious spaghetti" (60,000+ line function)
- Multiple pass philosophy established: write matching code first, document later
- Long-term vision articulated: native Melee client, rollback netcode, low-end device support

### November 2022 - mwcc Decompilation Begins
- Progress: 12.28% code, 5.11% data, 35 trophies (steady)
- mwcc decompilation project started (git.wuffs.org/MWCC)
- Scheduler bug official description documented from Metrowerks notes
- `-proc 750`/`-proc 604` flag variations discovered for scheduling fixes
- getFighter inline cast pattern documented
- Special attributes (sa) access pattern debate resolved (buffer with cast)
- Ninja build system adopted (2-3x faster than Make)
- HAL naming conventions documented (snake_case members, camelCase functions)

### December 2022 - 40 Trophies, GET_FIGHTER Pattern
- Progress: ~12.7% code, ~5.2% data, 40 trophies
- GET_FIGHTER macro pattern discovered (user_data access with required cast)
- BSS variable ordering documented (usage order, not declaration)
- int vs s32 codegen differences clarified (implicit cast overhead)
- Fighter struct x2070 union confirmed
- Fighter allocation sizes documented (0x23EC bytes for Fighter)
- Infinite Super Scope glitch explained at code level
- Dolphin SDK dates documented (Melee Sep 2001, Zoids VS Dec 2001)

### January 2023 - 14% Code, User Data Pattern Confirmed
- Progress: 14.38% code, 11.96% data, 41 trophies
- **Major discovery:** `(Fighter*)HSD_GObjGetUserData(gobj)` confirmed as HAL's actual pattern
- Smash 64 decomp validates the cast+inline access approach
- getFighter() macro usage declared WRONG - conversion needed
- Ground/Stage/Map terminology clarified (gp = ground pointer)
- objdiff recommended over asm-differ for iterative development
- `-requireprotos` flag adoption
- Brawl confirmed as C++ rewrite by Sora Ltd (not useful for Melee)

### February 2023 - Quieter Month
- Int-to-float conversion magic numbers documented (compiler-generated doubles)
- m-ex types reference noted (validate before using community-named types)
- Windows build without MSYS2/DevKitPro documented (MinGW + powerpc-eabi-as.exe)
- Subaction scripts confirmed as bytecode (6-bit opcode, state machine, GOTOs)

### March 2023 - FighterVars/MotionVars Naming
- State variables renamed: x222C=FighterVars (persistent), x2340=MotionVars (per-action)
- Item code uses single ItemVars struct shared across all states (Pokemon are items)
- Proc callback naming established from Smash 64 symbols
- Module abbreviations: gm=game, mp=map, mpcoll=map collision

### April-May 2023 - 16.43% Code, 48 Trophies
- Progress: April ~14.5%, May end 16.43% code, 12.22% data, 48 trophies
- GUARD macro documented for IASA early return patterns
- Subaction event structures documented (Graphic Effect 0x0A, jab followup)
- Animation naming conventions from dat files (Hi/Lw, 3=tilt, 4=smash)
- Japanese code names: ottotto=teeter, furafura=dazed
- Motion vs Action vs Subaction terminology clarified
- Attack ID conventions and damage log structure documented
- Smash 64 decomp approaching 30% completion
- `#pragma once` confirmed buggy before mwcc 3.0; use include guards
- Callback inlining discovered (even when passed as function pointers)

### June 2023 - 17.08% Code, 50 Trophies
- Progress: 17.08% code (663,077 / 3,882,272 bytes), 13.65% data, 50 trophies
- **Major discovery:** `static inline` = LOCAL linkage, `inline` = WEAK linkage (ODR deduplicated)
- Explains functions appearing in melee code when they "should" be in HSD
- Inline auto depth limits documented (usually 3-4, function length affects decision)
- Item code patterns documented (similar to fighter code, GET_ITEM macro)
- Item_GObj structure and flags at xDC8 documented
- `if` module = "info" (HUD overlays) confirmed from Brawl
- Context generation optimization tips documented
- `__FILE__` macro behavior and assertion filename format clarified
- Super Yoyo glitch confirmed NOT in original code (20XX mod uses constant refresh)
- Estimated completion: late 2028 at current rate (~8.66 years at 1 KiB/day)

### July-December 2023 - 18.3% Code, Sysdolphin Libraries Complete
- Progress: July ~17.2% → December ~18.3%, 52-53 trophies
- **Ninji's 1.2.5n patch** replaces frank for epilogue scheduling fix
- **FObj fully matched** - major sysdolphin milestone
- **AObj fully matched** - animation objects complete
- **PObj fully matched** - ~0.34% jump, polygon objects complete
- **LObj fully matched** - light objects complete
- **video.c matched** - ~0.12% jump
- **grIzumi.c (Fountain of Dreams)** matched
- Register allocation reference documented (r0-r31 conventions)
- DVDFileInfo size bug discovered (actual bug in original game)
- ftCollisionBox vs ftECB distinction clarified
- HSD_GObj confirmed as 0x38 bytes
- Callback naming convention established (_cb suffix)
- Frogress integration for progress badges and graphs
- dtk (decomp-toolkit) being adopted for builds
- Training scratch created for new contributors

### January 2024 - DTK Transition
- **Project transitioned from make+asm to ninja+dtk**
- objdiff replaces asm-differ for most use cases
- Partial linking no longer needed - objdiff handles partial matches
- Variadic function parameter counting documented (lis r0, 0xN00)
- Ternaries vs if/else codegen differences documented
- Float/int parameter ordering rules clarified (FPRs vs GPRs)
- File/module naming conventions fully documented (cm, db, ef, ft, gm, gr, if, it, lb, mn, mp, pl, sc, ty, un, vi)
- Particle code null check bug discovered (loads from 0x24 when NULL)
- Jump table `jtbl_t` type documented as switch statement placeholder
- sqrtf Newton-Raphson implementation documented

### February 2024 - 21.7% Code
- Progress: 21.72% matched_size, 35.9% matched_functions (7,231 of 20,126)
- int vs s32 behavior differences documented (int generates different instructions)
- cmplwi vs cmpwi for pointer detection
- Literal symbol names (@170) are per-file, not program-wide
- Tautological comparisons needed for some matches
- `#pragma dont_inline on` documented for preventing inlining
- Clamp macro discovered
- CObjDesc confirmed as union (from K7 symbols)
- ftData x4C corrected to SFX data (was incorrectly assumed to be CollData)
- PAL vs NTSC timing documented (PAL skips 6th frame render)
- objdiff-cli installation and usage documented
- Dolphin SDK (dolsdk2001) decompilation started
- Frogress integration at progress.decomp.club

### March-July 2024 - ~24% Code, Tooling Improvements
- Progress: ~18% full file matching, ~24% fuzzy matching
- Assert macro format documented (`, 0` at end required)
- RETURN_IF macro pattern with errant cmpwi documented
- Stack 0x8 difference = missing inline call
- Struct copy vs field assignment (int vs float registers)
- Switch statement detection from nested if-else
- Data symbol base address offsetting discovered
- SDK version clarified (December 2001, not May 2001)
- Shiftability explanation documented (symbolic vs hardcoded addresses)
- NonMatching files don't affect DOL output
- Multiple data references coalesce behavior
- Trello deprecated, transitioning to GitHub Projects
- Memory card encryption/decryption functions matched

### August-December 2024 - 25% Code, 73 Trophies
- Progress: Broke 25% matched code (September 2024), 73 trophies
- 25.17% perfectly matched by November
- Explicit NULL check vs `if (ptr)` codegen differences documented
- Double branch instructions indicate switch statements
- Structure copies use word loads (lwz) even for float fields
- Bitfield access patterns (b0, b1, b3) documented
- sqrtf inline recognition pattern documented
- `.L_` labels handling (local labels vs functions)
- Item struct conventions: xDD4_itemVar, xC4_article_data
- UNK_T field convention for unknown types
- Custom Melee-centric decompiler development started
- ChatGPT experiments documented (94% match with 59k token prompt)
- Total codebase estimated at 800,000+ lines of code

### January-April 2025 - ~27% Code
- Casting rules clarified: cast on return of HSD_GObjGetUserData, NOT the input
- cror instructions from m2c indicate compound comparisons (replace `==` with `>=`)
- Jump check thresholds documented from PlCo.dat (tap jump Y-stick: 0.6625)
- RGB5A3 pixel format for screenshots documented
- vi/ directory contains Adventure Mode cutscenes (in-game, not pre-rendered)
- AI/LLM for decomp discussion: ChatGPT recognizes existing decomp code but lacks context
- Gemini's 2M token context could fit entire context file

### May 2025 - ~28% Code
- s32 vs int convention established: use int in src/melee/, SDK types in src/dolphin/
- Deprecated tools: asm-differ (use objdiff), report_score, calcprogress, Makefile (use ninja)
- Tools added: scaffold.py, easy_funcs.py, link.py, replace-symbols

### June 2025 - ~29% Code, 67 Trophies
- fcmpo vs fcmpu float comparison patterns documented
- GET_FIGHTER cast causing mismatches on decomp.me (M2CTX issue)
- Implicit function declarations cause `xoris on r3` pattern
- Loop unrolling recognition (stores_per_iter * iterations)
- addi vs mr peephole optimization
- C++ exceptions flag: some HSD units compiled with exceptions enabled (look for extab/extabindex)
- Mtx type documented as 3x4 TRS matrix
- extern/dolphin merged (PR #1559)
- AX, AXFX matched

### July 2025 - 36% Code, 72 Trophies
- **Major milestone: 10% increase in 2 months**
- dat_attrs getter pattern discovered (fixes stack issues)
- GET_JOBJ may be fake - direct access often works better
- ABS macro preferred over fabs_inline
- Vec3 chained assignment produces z, y, x store order
- Inline depth limit ~3 levels documented
- enter-the-fray branch for bootable demo builds
- Branch watch tool workflow documented for dynamic analysis

### August 2025 - 40% Code
- Progress: 38% (Aug 8) → 40% (Aug 27)
- cmplwi vs cmpwi: cmplwi indicates if-statement optimization, not switch
- MTXDegToRad macro documented (0.017453292f = PI/180)
- enum min consideration: project may use `-enum min` not `-enum int`
- Decomp Dashboard tool introduced for newcomers
- Korean Brawl symbols used to match Zebes stage functions
- HSD_JObjSetMtxDirty confirmed as function (not macro)

### September 2025 - 50% Fuzzy Match
- Fuzzy match percentage passed 50%
- m2c union field selection flags added: `--union-field Fighter_FighterVars:kb`
- m2c void pointer type specification: `--void-var-type temp_r5:ftKb_DatAttrs`
- Static inline wrapper pattern documented
- 989 functions (84 KB) found to be duplicates of matched functions
- Unused bytecode interpreter (HSD_ByteCodeEval) documented

### October-December 2025 - 47% Strict Match
- Close to halfway point on strict matching
- Popo ceiling stick bug documented (wrong bitmask comparison)
- Nana garbage DI bug documented (uninitialized stick values)
- Ness PK Fire pillar bug documented (assignment instead of comparison)
- CollData wall naming convention clarified
- Killer7 debug symbols used for sysdolphin analysis

### January 2026
- Progress: 47.39% matched, 28.49% linked (640/962 files)
- Claude Code agentic workflow documented for batch matching
- Collision code ported to Melee engine reimplementation for verification
- File renames from un/: un_2FC91→ifnametag, un_2FC92→ifhazard

---

## 7. AI/LLM Usage for Decompilation

### Capabilities and Limitations
- ChatGPT/Claude trained on existing decomp code - recognizes struct names and patterns
- Can achieve ~90-94% matches but often uses hardcoded offsets instead of proper types
- Missing context is the major limitation
- Match percentage is verifiable; interpretation/naming is not
- LLMs can hallucinate function names and comments

### Good Use Cases
- "This function does X, what's a better name for it?"
- Finding all sites where a placeholder struct member is used and suggesting names
- Processing Japanese function names to match English naming conventions
- Explaining PowerPC instructions (can ask about MIPS - similar enough)
- Annotating asm lines as a learning aid

### Agentic Workflows (2026)
```bash
claude --dangerously-skip-permissions "run /decomp, don't stop until you match 10 new functions"
```
- Always verify names have justification with file references
- Don't let incorrect assumptions from training data sneak in
- LLM-generated names/comments can be hallucinated - verify against asserts and patterns

### Limitations
- No good AI decompiler exists yet - would need training on compiler IR
- Gemini's 2M token context could fit entire context file but still lacks compiler-specific knowledge
- ChatGPT not trained on mwcc/GameCube compiler specifics
- Generic approaches don't work well - needs domain-specific training

---

## Appendix: Source Document Index

| File | Date Range | Status |
|------|------------|--------|
| 2020-07.md | July 2020 | ✓ Processed |
| 2020-08.md | August 2020 | ✓ Processed |
| 2020-09-to-12.md | Sept-Dec 2020 | ✓ Processed |
| 2021-01-to-04.md | Jan-Apr 2021 | ✓ Processed |
| 2021-06-to-10.md | Jun-Oct 2021 | ✓ Processed |
| 2021-11.md | November 2021 | ✓ Processed |
| 2021-12.md | December 2021 | ✓ Processed |
| 2022-01.md | January 2022 | ✓ Processed |
| 2022-02.md | February 2022 | ✓ Processed |
| 2022-03.md | March 2022 | ✓ Processed |
| 2022-04.md | April 2022 | ✓ Processed |
| 2022-05.md | May 2022 | ✓ Processed |
| 2022-06.md | June 2022 | ✓ Processed |
| 2022-07.md | July 2022 | ✓ Processed |
| 2022-08.md | August 2022 | ✓ Processed |
| 2022-09.md | September 2022 | ✓ Processed |
| 2022-10.md | October 2022 | ✓ Processed |
| 2022-11.md | November 2022 | ✓ Processed |
| 2022-12.md | December 2022 | ✓ Processed |
| 2023-01.md | January 2023 | ✓ Processed |
| 2023-02.md | February 2023 | ✓ Processed |
| 2023-03.md | March 2023 | ✓ Processed |
| 2023-04-to-05.md | Apr-May 2023 | ✓ Processed |
| 2023-06.md | June 2023 | ✓ Processed |
| 2023-07-to-12.md | Jul-Dec 2023 | ✓ Processed |
| 2024-01.md | January 2024 | ✓ Processed |
| 2024-02.md | February 2024 | ✓ Processed |
| 2024-03-to-07.md | Mar-Jul 2024 | ✓ Processed |
| 2024-08-to-12.md | Aug-Dec 2024 | ✓ Processed |
| 2025-01-to-04.md | Jan-Apr 2025 | ✓ Processed |
| 2025-05.md | May 2025 | ✓ Processed |
| 2025-06.md | June 2025 | ✓ Processed |
| 2025-07.md | July 2025 | ✓ Processed |
| 2025-08.md | August 2025 | ✓ Processed |
| 2025-09-to-2026-01.md | Sept 2025-Jan 2026 | ✓ Processed |
