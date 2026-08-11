# PR Cross-Module Gating Findings

**Date:** 2026-07-16 (revised after follow-up pipeline research)  
**Status:** Diagnostic findings; no implementation changes included  
**Context:** Reviewer feedback on the open Melee matching PRs, especially
[#2877](https://github.com/doldecomp/melee/pull/2877) and
[#2880](https://github.com/doldecomp/melee/pull/2880)

## Executive summary

The shadow-declaration and macro-shim failure mode comes from three independent
mechanisms, all of which must be addressed:

1. Ordinary matching workers receive an immutable one-file write set. A worker
   can edit another file in its isolated worktree, but only the target-file diff
   is captured in its checkpoint, so the cross-module edit silently disappears.
2. Deterministic lint catches some shim shapes but misses function-like macros
   and bare local prototypes. This creates a selection effect: caught shims are
   repaired away, while missed shims bank as gate-clean improvements and ride
   toward PRs.
3. The PR split pipeline strips or decouples cross-module edits at four layers.
   Its slice-isolation gate then actively selects for a self-contained target
   `.c` patch rather than an honest dependency on a supporting header or owner
   implementation in another slice.

The decomp standards already describe the correct behavior: update the owning
header, keep one canonical declaration, and validate affected consumers. The
reviewer is asking us to replace strict file-based scope with motivation-based
scope: a supporting cross-file edit is acceptable when it is directly required
by the target match and regression validation proves that it does not break
anything.

The anti-shadowing standards are therefore correct and should remain strict.
The durable fix must remove the one-file pressure, close the deterministic-lint
selection gap, and let PR slices carry the cross-module support files on which
their matches honestly depend.

## Reviewer feedback in plain language

The reviewer said it is acceptable to modify any file when the primary reason
is to match the target translation unit (TU), provided the change does not
break another match or consumer. In particular, the worker should be allowed
to adjust a function signature shared across modules if that lets the callee
and caller use one truthful declaration and both remain matched.

The requested boundary is:

> Keep work motivated by the target TU, rather than mechanically confined to
> the target TU's file.

That is different from allowing arbitrary cleanup. A worker matching
`gmregclear.c` should not opportunistically refactor Ground. It should be
allowed to change a Ground prototype when evidence from `gmregclear.c` shows
that the prototype is wrong, and it should validate Ground and every affected
consumer before retaining the change.

## C terminology and why signatures matter

A C translation unit is one `.c` file after its included headers and macros
have been expanded. Each TU is compiled separately. When one TU calls a
function defined in another TU, the compiler generally trusts the declaration
in a header; it does not inspect the other `.c` file's implementation while
compiling the caller.

For example:

```c
/* ground.h: canonical declaration */
int Ground_GetValue(int stage);

/* ground.c: implementation */
int Ground_GetValue(int stage)
{
    /* ... */
}

/* gmregclear.c: consumer */
#include <melee/gr/ground.h>

int value = Ground_GetValue(3);
```

The declaration affects code generation. Signedness, pointer types, return
types, parameter widths, and old-style versus fully typed parameter lists can
change register allocation, conversions, comparisons, and generated
instructions. In a decompilation project, a declaration that looks close
enough for normal application code may still prevent byte-identical output.

There should normally be one canonical interface:

```text
target caller.c
    calls through
        owning header.h declaration
            describing
                owner implementation.c
```

The rejected workarounds created a second, local view of that interface inside
the target `.c` file. They did not copy the function implementation; they made
one TU compile as though the function had a different name or type.

## Current enforcement path

### 1. Ordinary workers receive a one-file write set

The worker system prompt contains both of these contracted rules:

```text
Work only on the current claimed target.
Edit only the path named by <target_file path="...">.
```

See
[`apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts`](apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts).

The runner constructs the claim with exactly one path:

```ts
const writeSet = [sourcePath];
```

See
[`apps/server/src/core/session-runtime/run-state/worker-state.ts`](apps/server/src/core/session-runtime/run-state/worker-state.ts).

There is currently no normal worker mechanism for requesting and receiving a
wider write set after discovering a necessary header, type, metadata, or
cross-module dependency.

### 2. The documented design expects widening, but the runtime does not do it

The write-safety design says that a required additional file should become
explicit evidence for the runner and integration path. Its risk table also
says header/data-owner work should begin with explicit write sets and widen to
dependent files or target groups when evidence shows invalidation risk.

See [`docs/10-system-design/35-write-safety.md`](docs/10-system-design/35-write-safety.md).

That is a good safety model, but the current claim implementation always uses
`[sourcePath]`. The missing piece is the transition from a single-file claim to
an evidence-backed expanded claim.

A search of `apps/server/src` confirms the write set is fixed for the claim's
entire life. The claim is created with `writeSet: [sourcePath]`
(`run-state/worker-state.ts` lines 120 and 266), persisted as
`write_set_json`, and never updated afterward: there is no
`UPDATE ... SET write_set_json` anywhere, and claim recycling preserves the
original stored set. The only place a wider set appears is the dashboard read
model, which unions the worker's self-reported paths for display purposes
only (`apps/server/src/application/dashboard/read-model.ts` lines 578-630);
that union never feeds back into the enforced claim.

### 3. QA repair is also confined to one source file

The QA-repair prompt says:

```text
Fix only the source file and findings named in the queue item.
Do not edit headers; if a repair requires a header change, leave the finding
with evidence and report the blocker.
```

It repeats that header edits are outside the repair lane and will be rolled
back. See
[`apps/server/src/core/agent-catalog/agents/pr/qa-repair/prompt.ts`](apps/server/src/core/agent-catalog/agents/pr/qa-repair/prompt.ts).

This is enforced in code. If the repair agent modifies a header, the job emits
an error stating that the agent changed headers outside its single-file scope,
restores the target state, and forces the item back to `needs_rework`. See
[`apps/server/src/core/session-runtime/phases/pr/jobs/qa-repair.ts`](apps/server/src/core/session-runtime/phases/pr/jobs/qa-repair.ts).

As a result, the repair agent can recognize that a header change is the proper
fix but cannot make or validate that fix.

## Out-of-scope edits are silently dropped, not rejected

The one-file write set does not physically prevent a worker from editing other
files. The worker runs in an isolated worktree and can change a header or any
other path there. Enforcement happens later, during patch capture, rather than
as a rejected write.

The checkpoint patch is a write-set-scoped diff. `captureWriteSetDiff` runs
`git diff -- <writeSet>`; because the claim write set is `[sourcePath]`, the
effective command is `git diff -- <sourcePath>`. The capture call is at line
1688 and the implementation is at lines 635-640 of
[`apps/server/src/core/session-runtime/phases/running/workers/worker-cycle.ts`](apps/server/src/core/session-runtime/phases/running/workers/worker-cycle.ts).
That same scoped file becomes both the checkpoint's `patchPath` and `diffPath`
at lines 1890-1891. A header or other out-of-set edit is therefore absent from
the banked patch. It is not reverted or rejected, and it produces no penalty or
retry message.

This ordering introduces a validation hazard. `validateWorkerChange`, called
at line 1849 of `worker-cycle.ts`, builds and scores inside the worker's own
worktree, where the header edit is still present. A worker can obtain a match
that genuinely depends on a header fix, pass validation on that combined
worktree, and then bank a target-only patch that omits the fix. This is a
possible contributor to otherwise unexplained fuzzy regressions during
integration. The integration path should be checked explicitly to determine
whether every banked patch is re-scored on its own before acceptance.

A nearby signal is computed but unused. `writeSetDiffChanged` is calculated at
line 1689 and passed to `workerAttemptRepairReasons`; the function accepts it at
lines 255-259 but never reads it in the body at lines 260-268. No repair reason
is generated from path-scope behavior. The TypeScript review lint at line 1690
also receives only the write-set diff, so it cannot see an edited header.

Worker-level Python QA has the same visibility limit. The call to
`captureWorkerChangeBaseline` at lines 1497-1502 supplies no `extraPaths`, even
though the hook at lines 377-399 of
[`apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts`](apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts)
can snapshot additional paths for the QA diff.

The worker consequently receives no feedback teaching it that a proper header
edit will vanish while an in-file shim will persist. There is no training
signal at all for this distinction. The standing QA repair instruction makes
the contradiction sharper: line 629 of `change-validation.ts` recommends
"owning-header declarations" as a compliant match-preserving idiom even though
the checkpoint path silently discards those declarations when they are outside
the one-file write set.

## Relevant standards and lint rules

### `global_standard:truthful-headers-and-includes`

This is the standard most directly related to the reviewer's requested
behavior. It requires the following:

- Update an owning header when a function body proves the signature.
- Put declarations in the real owning header.
- Reject fake source-local declarations.
- Reject macro-renaming around an include to evade a prototype conflict.
- Run prototype and consumer validation when the interface changes.

See
[`projects/melee/knowledge/sources/injectable/decomp_standards/standards/names_defines_headers_and_prototypes/standards.jsonl`](projects/melee/knowledge/sources/injectable/decomp_standards/standards/names_defines_headers_and_prototypes/standards.jsonl).

This standard is not causing the bad source shape. It describes the correct
cross-module repair. The one-file write set makes compliance impossible during
an ordinary worker or QA-repair turn.

The standard currently has only partial deterministic coverage through
`extern_in_c` plus preship review. That does not catch every local prototype
shim.

### `global_standard:no-define-alias-global-renames`

This standard requires one canonical symbol name and rejects a `#define` used
to hide an alternate global or extern name. Its deterministic lint rule is
`define_alias`.

The rule detects simple identifier aliases such as:

```c
#define gm_801732D8 gm_801732D8_wide
```

See
[`projects/melee/knowledge/sources/injectable/decomp_standards/standards/names_defines_headers_and_prototypes/rules.py`](projects/melee/knowledge/sources/injectable/decomp_standards/standards/names_defines_headers_and_prototypes/rules.py).

This lint rule is appropriate: the alias is misleading and should not ship.
However, it catches the symptom after the worker has been denied the preferred
owning-header repair.

### `extern_in_c`

`extern_in_c` supplies partial lint coverage for source-local declarations and
literal/data ownership problems. It can catch added `extern` declarations in a
`.c` file, but it does not provide complete prototype-shadow coverage.

For example, this is still a source-local prototype even though it lacks an
explicit `extern` keyword:

```c
u32 Ground_801C1DAC(void);
```

A rule looking specifically for `extern` cannot be expected to reject every
form of that declaration. The broader `truthful-headers-and-includes` standard
therefore still relies on preship or human judgment.

### Deterministic coverage gap for function-like macros

The `define_alias` implementation explicitly skips macros with parameters:

```python
if macro["params"]:
    continue
```

Consequently, a function-like macro that rewrites a declaration during header
inclusion is not caught by this particular deterministic rule:

```c
#define fn_80174468(a, b, c, d, e, f) \
    fn_80174468(s32 slot, HSD_Text* text1, /* ... */)
#include "gmresult.h"
#undef fn_80174468
```

Preship or human review must currently recognize this as a prototype shim.

## Match incentives and the lint selection effect

Two corrections to an earlier framing of this problem, both verified against
the runtime.

First, the scoring system does not demand exact matches. A validated,
gate-clean, non-exact improvement is banked immediately with the
`improvement_banked` stop reason (`worker-cycle.ts` line 556; `acceptedExact`
at line 512 is only one of several accepting stop reasons), and the worker
prompt says the same (`prompt.ts` line 165). Workers are not structurally
forced to reach 100% before their work counts.

Second, the exact outcome the reviewer suggested — take the match penalty and
document the needed signature change — already exists and is explicitly
rewarded. The QA lint repair instruction
(`change-validation.ts` lines 628-629) tells the worker that "QA gates win
over match %" and that when a match truly requires a banned pattern, removing
the pattern and returning the best gate-clean version means "a lower match %
is the successful outcome." The gate-repair continuation message
(`worker-cycle.ts` line 1996) provides the escape hatch verbatim: state
"exact requires banned pattern X" in the note's blockers so the runner can
close the target.

The catch is that this steering only fires after a deterministic lint
finding. The shim shapes that reached the open PRs are precisely the ones the
lint layer cannot see:

- `define_alias` skips every function-like macro
  (`rules.py` line 151, `if macro["params"]: continue`; the only exception is
  macro names ending in the canonical suffixes `_ABS|_MIN|_MAX|_CLAMP` at
  line 135). The TypeScript worker-side mirror
  ([`apps/server/src/core/agent-catalog/agents/running/worker/review-lint.ts`](apps/server/src/core/agent-catalog/agents/running/worker/review-lint.ts)
  line 16) contains an explicit `(?!\s*\()` negative lookahead that excludes
  function-like macros as well.
- `extern_in_c` matches only lines beginning with the literal `extern`
  keyword
  (`EXTERN_LINE_RE` in
  [`projects/melee/knowledge/sources/injectable/decomp_standards/standards/literals_data_and_externs/rules.py`](projects/melee/knowledge/sources/injectable/decomp_standards/standards/literals_data_and_externs/rules.py)
  lines 47 and 106), so a bare local prototype like
  `u32 Ground_801C1DAC(void);` passes clean. It also skips `#define` lines
  outright (line 100), so `#define X X_proto` / `#include` / `#undef X` shims
  are invisible to it.

The standards data records this gap as a known design state, not an
oversight: `truthful-headers-and-includes` carries
`qa_enforcement: "partial_lint_plus_pre_ship_review"` with `extern_in_c` as
its only lint rule, and the stored negative examples for include-shim macros
and non-`extern` local prototypes all carry `qa_rule_id: null` with severity
`pre_ship_review` — meaning they are LLM-review-only, with no deterministic
backstop.

Where the lint runs matters just as much as what it covers. The full Python
QA scan runs during every worker attempt and blocks acceptance
(`worker-cycle.ts` line 1849; `change-validation.ts` lines 618-620 and
691-701), so a caught shim gets immediate rejection plus the honest-outcome
steering quoted above. The epoch-level QA scan, by contrast, is
observability-only (`epochs/cycle.ts` lines 40-44 and 546-548). An uncaught
shim therefore banks as a clean improvement, survives the epoch untouched,
and reaches the PR pipeline where the only remaining check is the
non-deterministic preship reviewer.

The net effect is a selection process. Workers try a variety of shapes under
match pressure; the lint-visible shapes (`#define` object aliases, `.c`
externs) are rejected per-attempt and steered toward honest lower scores,
while the lint-invisible shapes (function-like macro shims, bare local
prototypes) are effectively rewarded. This is an independent cause from the
write-set restriction: even with write-set widening in place, an uncaught
local shim remains cheaper for a worker than a cross-module edit plus
consumer validation. Closing the lint gap is what makes the existing "lower
score is the successful outcome" path actually engage.

## Concrete examples from the open PRs

### Example 1: simple function-name shadowing

PR #2877 added:

```c
#define gm_801732D8 gm_801732D8_wide
```

This made the target TU see an alternate name/declaration without changing the
canonical interface. The reviewer responded:

> Fix the type declaration or suffer the match penalty; do not shadow existing
> symbols.

Review thread:
[#2877 discussion 3598558502](https://github.com/doldecomp/melee/pull/2877#discussion_r3598558502).

This is the clearest example of one-file scope pushing the worker toward a
local alias instead of a real declaration change.

### Example 2: rewriting a header declaration through the preprocessor

PR #2877 defined a function-like macro before including `gmresult.h`, then
undefined it immediately afterward. That temporarily changed how the header
text was interpreted only for `gmresult.c`.

The reviewer rejected the construct and later summarized the surrounding code
as preprocessor declaration black magic:

- [Initial rejection](https://github.com/doldecomp/melee/pull/2877#discussion_r3598666674)
- [Broader macro/declaration rejection](https://github.com/doldecomp/melee/pull/2877#discussion_r3598672367)

The implementation was not duplicated. Instead, one TU was given a private,
inconsistent declaration surface.

### Example 3: local Ground prototypes inside the GM target

PR #2877 added several Ground declarations directly to `gmregclear.c`, such
as:

```c
u32 Ground_801C1DAC(void);
u32 Ground_801C1DC0(void);
s32 Ground_801C1DD4(void);
void Ground_801C1DE4(s32*, s32*);
f32 Ground_801C57F0(int);
```

The reviewer said to modify the offending signatures while preserving their
matches, or accept the target's match penalty and leave a TODO:

[#2877 discussion 3598628908](https://github.com/doldecomp/melee/pull/2877#discussion_r3598628908).

In a follow-up, the reviewer specifically questioned whether the canonical
signature could be changed from `s32` to `int`:

[#2877 discussion 3599081899](https://github.com/doldecomp/melee/pull/2877#discussion_r3599081899).

The preferred experiment is to update the owning Ground header/definition,
compile the affected callers and callee, and retain the change if all required
matches remain intact.

### Example 4: stripped local declarations under `__MWERKS__`

PR #2877 placed alternate declarations inside a function and guarded them for
the matching compiler:

```c
#ifdef __MWERKS__
    void gm_801BF634();
    void gm_801BF6A8();
    void gm_801BF6C8();
    void gm_801BF6E8();
#endif
```

The reviewer said to rework the original signatures or document the necessary
signature change, rather than shadowing them:

[#2877 discussion 3598582560](https://github.com/doldecomp/melee/pull/2877#discussion_r3598582560).

Again, the one-file solution created a second view of shared functions instead
of correcting the owning declarations.

### Example 5: macro-based data reinterpretation in PR #2880

PR #2880 used multiple `BLOCK(...)` macro forms to reinterpret and access the
same storage. The reviewer asked for the macros to be removed and the accesses
expanded:

- [First BLOCK macro](https://github.com/doldecomp/melee/pull/2880#discussion_r3598788018)
- [Additional BLOCK macro](https://github.com/doldecomp/melee/pull/2880#discussion_r3598793393)
- [Repeated redefinition layer](https://github.com/doldecomp/melee/pull/2880#discussion_r3598794121)

This example is not solely a function-signature problem, but it reflects the
same broader failure mode: local macro layers can hide an unresolved canonical
type or data-layout model. When the real issue is an owning type or shared data
model, the pipeline should permit an evidence-backed owner edit rather than
encouraging per-function reinterpretations.

## The PR split pipeline independently strips or decouples cross-module edits

Even if the worker write set were widened tomorrow, a `ground.h` plus
`ground.c` fix made while matching `gmregclear.c` would not survive into the
split per-slice PR. The PR assembly path enforces file gating at four layers:

1. **Subsystem grouping routes the header to a different PR.** `groupForPath`
   ([`apps/server/src/core/session-runtime/phases/pr/jobs/pr-split-plan.ts`](apps/server/src/core/session-runtime/phases/pr/jobs/pr-split-plan.ts)
   lines 228-273) buckets every changed file by its `melee/<subsystem>`
   directory: `gmregclear.c` lands in the `gm` slice while `ground.h` and
   `ground.c` land in the `gr` slice. `classifyIndependence` (lines 415-473)
   treats any out-of-subsystem header as `hasCrossCuttingHeader` and demotes
   the slice to `stacked`, and support/header files only ride the match lane
   within their own group (lines 489-576). The match and its supporting fix
   are structurally decoupled into separate PRs.
2. **The per-PR manifest gate hard-errors on stragglers.**
   `readyLocalPrSource`
   ([`apps/server/src/core/session-runtime/phases/pr/pr-worktrees.ts`](apps/server/src/core/session-runtime/phases/pr/pr-worktrees.ts)
   lines 538-545) diffs the whole branch against its base and throws if any
   changed file is outside the manifest ("changes file(s) outside the PR
   manifest").
3. **Pathspec and `--include` filtering silently strips stray hunks.** The
   emitted patch is `git diff -- <manifest files>` (`pr-worktrees.ts` line
   550), and every patch application uses `git apply --include=<file>` per
   manifest entry (lines 603-604, 624, 630, and 405-408). A cross-module hunk
   in a shared patch is dropped without an error.
4. **The isolation gate actively selects for self-contained shims.**
   `openPrForSlice`
   ([`apps/server/src/core/session-runtime/phases/pr/runtime.ts`](apps/server/src/core/session-runtime/phases/pr/runtime.ts)
   lines 995-1001) plus `verifyPrSliceInBaseline` (`pr-worktrees.ts` lines
   403-448) apply the manifest-only patch to a pristine master worktree and
   require zero regressions. A match that honestly depends on a header fix
   living in another slice fails isolation by design. The only match shape
   that can pass this gate is one with the dependency baked into the target
   `.c` as a local shim.

No widening path exists anywhere in the PR pipeline: a search for
out-of-manifest or widening mechanisms in
`apps/server/src/core/session-runtime/phases/pr/` finds none. The
"evidence-gated out-of-manifest compile deps" noted for the lb slice in
`MELEE_PR_SERIES.md` was a manual operator intervention, not a pipeline
capability. The manifest is immutable once planned.

The project's own records corroborate that this layer caused real damage.
`MELEE_PR_SERIES.md` documents that on PR #2877 the `gr` slice reverted the
Ground header fix, forcing the `gm` slice to keep a local-extern call; that
the reviewer explicitly identified slice-manifest gating as the cause of the
shadow-macro hacks; and that a 292-line session edit to
`config/GALE01/symbols.txt` was orphaned by slicing because no slice owned it.

QA repair reinforces the problem and can reshape shims into less detectable
forms. When the repair agent touches a header, the job reverts the header and
also restores the target `.c` to its pre-repair state
([`apps/server/src/core/session-runtime/phases/pr/jobs/qa-repair.ts`](apps/server/src/core/session-runtime/phases/pr/jobs/qa-repair.ts)
lines 276-310 and 711-746) — which means the original shim is actively
preserved whenever the correct fix was a header change. And because the
rollback triggers only on header modifications, a repair that swaps a
lint-caught `#define` alias for an uncaught bare local prototype stays
entirely inside the `.c`, is not rolled back, and ships. The repair lane can
therefore launder a detectable shim into an undetectable one.

## Failure sequence

The corrected end-to-end behavior, incorporating all three mechanisms:

```text
Worker discovers that a shared signature/type/owner is probably wrong
    -> worker CAN edit owner.h in its worktree, and validation passes there
    -> patch capture diffs only target.c; the header edit silently vanishes
    -> no repair reason, lint finding, or message tells the worker why
    -> the only edits that persist are those inside target.c
    -> worker converges on a local alias, declaration, cast, or macro shim
    -> if lint can see the shim (define alias, .c extern):
           per-attempt rejection steers to an honest lower score or blocker
    -> if lint cannot see it (function-like macro, bare local prototype):
           the shim banks as a clean improvement and survives the epoch
    -> PR slicing routes any surviving cross-module edit to another slice,
       hard-errors on out-of-manifest files, or strips stray hunks
    -> the isolation gate requires each slice to build alone on master,
       so only self-contained (shim-bearing) matches can open
    -> preship or human review is the last line of defense
    -> QA repair is forbidden from editing headers; a header-dependent fix
       reverts both the header and the .c, preserving the original shim
```

The gate-exact repair runbook already records this root cause explicitly:

> one-file write sets made workers hide signature mismatches behind `#define`
> aliases; retype the prototype and A/B the consumers.

See [`docs/runbooks/gate-exact-tail-repair.md`](docs/runbooks/gate-exact-tail-repair.md).

## Knowledge contagion check

The curated knowledge base was checked for positive teaching of shim
techniques and is largely clean. The injected standards explicitly forbid all
of these shims, and no curated pattern, checkpoint summary, or knowledge
builder (`curator.ts`, `board.ts`, `decomp-context.ts`, `standards.ts`,
`graph/builders/source-slices.ts`) recommends them.

Two weak signals are worth noting, though neither explains the volume of
shims observed:

1. The negative examples inject literal shim source into repair and preship
   prompts as `bad_pattern` fields (the include-shim macro and non-`extern`
   local prototype entries in `examples.jsonl`) — a mild "here is how"
   exposure alongside the prohibition.
2. One entry in `banned_patterns/data/banned.jsonl` records a maintainer
   dispositioning a same-TU `extern` forward declaration as
   `accepted_style_note` ("I don't like declaration order being done like
   this, but removing it is a regression") rather than rejected — a mixed
   signal about whether shim-adjacent constructs are ever tolerated.

The remaining pressure toward shims comes from the model's own decompilation
priors (the same instinct behind the K&R declaration trick the upstream CI
now bans) combined with the three pipeline mechanisms above.

## What should remain strict

The reviewer feedback does not require weakening source-quality standards.
These should remain rejected:

- Local aliases that give one symbol multiple apparent names.
- Header declarations rewritten through temporary macros.
- Duplicate or incompatible prototypes in individual `.c` files.
- Cast/type aliases used only to conceal a wrong canonical type.
- Unrelated refactors or renames added because a worker has wider access.
- Cross-file changes without consumer/regression validation.

The required change is to make the compliant repair reachable, not to allow
the workaround.

## Recommended policy direction

Replace the invariant "the worker may edit only the target file" with:

> The target TU defines the primary motivation and review scope. The worker may
> modify a supporting header, type owner, declaration owner, data owner, symbol
> metadata, split metadata, or directly affected implementation when evidence
> shows that the target match requires it. Supporting edits must be minimal and
> must pass validation for the target and every affected consumer. Unrelated
> cleanup remains out of scope.

This should be implemented as explicit write-set widening rather than an
unbounded initial write set.

A safe flow would be:

1. Begin with the target source path only.
2. Let the worker identify a required supporting path and provide evidence:
   the mismatched declaration/type, target objdiff result, and expected owner.
3. Expand the recorded claim write set to the specific owner and known affected
   paths, or route the item to a cross-module repair lane.
4. Make the canonical change instead of a local shim.
5. Build and score the target object.
6. A/B or regression-check the owner and all consumers affected by the shared
   header/type/config change.
7. Retain the change only if the target improves and no protected result
   regresses.
8. Record the wider patch and validation evidence as part of the checkpoint and
   PR review context.

## Implementation priority

The write-set widening protocol below is the right long-term design, but it
is also the most expensive piece, and it does not need to land first. The
recommended order:

1. **Close the lint gaps first** (cheap, deterministic, stops the bleeding
   now). Extend `define_alias` to function-like macros — for example, flag a
   function-like macro whose expansion references the macro's own name or
   another global symbol — and add a rule flagging non-`static`,
   non-`extern` function prototypes at file or block scope in `.c` files.
   Once these fire per-attempt, the existing "a lower match % is the
   successful outcome" steering does the rest with no new machinery.
2. **Stop the silent drop.** Post-attempt, compare the full worktree diff
   against the write-set diff; surface a mismatch as a repair reason and
   record the extra paths as structured "requested paths" evidence. The
   plumbing already exists unused (`writeSetDiffChanged`, the `extraPaths`
   hook). Beyond giving workers a real training signal, this produces data
   on how often widening would actually be needed.
3. **Then implement claim widening** with consumer A/B validation, as
   described above.
4. **In parallel, fix the PR side.** Match slices must be able to carry
   cross-subsystem support files, per the reviewer's
   "primary motivation plus nothing breaks" ruling, with the isolation gate
   run against the slice including its support files. The isolation gate
   itself is the right safety net and must be kept; the manifest scoping is
   what is wrong.

## Required system changes

The likely implementation work is broader than changing one instruction:

### Worker claims and prompts

- Remove the absolute `Edit only the path` rule or qualify it with an explicit
  write-set expansion protocol.
- Stop treating `[sourcePath]` as immutable for the claim lifetime.
- Add a structured expansion request containing paths, reason, owner evidence,
  and expected validation scope.
- Reflect the approved expanded write set in worker state and checkpoint
  artifacts.
- Until widening exists, fix the contradictory repair guidance: the QA lint
  repair instruction (`change-validation.ts` line 629) should not recommend
  "owning-header declarations" to an agent whose header edits are silently
  discarded at patch capture.
- Surface out-of-write-set edits as evidence instead of silently dropping
  them (see Implementation priority, item 2).

### QA repair

- Add a cross-file repair lane or allow a queue item to carry supporting owner
  paths.
- Stop automatically rolling back every header edit when the queue item
  explicitly authorizes that header.
- Require broader validation when a header, shared type, `symbols.txt`, or
  `splits.txt` is touched.

### Lint and preship review

- Keep `define_alias` and the truthful-header standard strict.
- Add deterministic coverage for macro/prototype shims that currently escape
  because function-like macros are skipped.
- Add more precise detection for source-local public prototypes that omit the
  `extern` keyword.
- Make lint repair guidance aware that the owning-header fix may require
  write-set expansion rather than a local rewrite or score loss.

### Integration and regression validation

- Derive affected consumers for shared headers and types.
- Require object A/B, focused unit comparison, or whole-project regression
  validation according to the supporting edit's blast radius.
- Preserve isolation by recording the widened paths and conflict group rather
  than silently permitting arbitrary edits.
- Verify whether banked patches are re-scored standalone at integration; the
  validate-then-strip ordering documented above means a patch validated in a
  worker worktree may not reproduce its validated score once the out-of-set
  edits it depended on are dropped.

### PR split and slice manifests

- Allow a match slice to carry cross-subsystem support files when the
  primary motivation is the slice's own target match (the reviewer's ruling),
  rather than routing every out-of-subsystem file to its own slice.
- Run the isolation gate against the slice including its support files, so
  self-containment is verified for the honest shape instead of forcing a
  shim-bearing shape.
- Keep the out-of-manifest hard-error, but make the manifest re-plannable
  when a slice legitimately needs a support path, instead of immutable once
  planned.
- Stop QA repair from restoring the shim-bearing `.c` when it reverts an
  unauthorized header edit, and detect repairs that replace a lint-caught
  shim with a lint-invisible one.

## Suggested acceptance criteria

A corrected pipeline should demonstrate all of the following:

1. A worker targeting one `.c` file can request a specific owning header when
   its objdiff evidence points to a signature mismatch.
2. The approved header appears in the claim's recorded write set.
3. The worker can update the canonical declaration and corresponding definition
   without adding a local alias or prototype.
4. The runner identifies and validates affected consumer objects.
5. A regression in any protected consumer rejects the cross-module change.
6. A clean cross-module change that improves the target and preserves all
   consumers can be checkpointed and shipped.
7. `define_alias`, header-rewrite macros, and fake source-local declarations
   remain rejected.
8. QA repair can perform the same owner-aware fix instead of reporting a
   permanent blocker or reverting the match.
9. Dashboard prompt previews and tests reflect any worker/repair prompt changes.
10. Deterministic lint flags function-like macro shims and bare (non-`extern`)
    source-local prototypes during the worker attempt, so the honest
    lower-score outcome is steered per-attempt rather than left to preship.
11. An out-of-write-set edit produces an explicit repair reason or structured
    expansion request instead of being silently dropped at patch capture.
12. A match slice can ship together with its cross-subsystem support files and
    passes the isolation gate with those files included.

## Conclusion

The standards and reviewer agree on the desired C source shape: one truthful
canonical declaration, owned by the appropriate header/module, with no local
shadowing. The pipeline prevents workers from reaching that source shape
through three independent mechanisms, and all three need addressing.

The one-file write set creates the pressure: correct cross-module edits are
silently dropped at patch capture, with no feedback, so only in-file shapes
persist. The deterministic lint gaps select which shims survive: object-like
aliases and `.c` externs are rejected per-attempt and steered toward honest
lower scores, while function-like macro shims and bare local prototypes bank
as clean improvements. The PR slice isolation gate then makes self-contained
shims the only match shape that can ship, since a match that honestly depends
on another slice's header fix fails isolation by design.

Fixing only the write set will not fix the problem — a widened worker edit
would still be decoupled or stripped at PR assembly, and an uncaught shim
would still be cheaper than a validated cross-module change. The lint gaps
are the fastest, cheapest win and stop new shims banking before any
write-set redesign lands. The durable solution remains the evidence-backed
cross-module write-set expansion and validation path, extended through PR
slicing, while keeping the existing anti-shadowing standards strict.
