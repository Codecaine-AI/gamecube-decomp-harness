# texpdag semantic review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete canonical and separate rendered C1–1317/H1–41:1358 manifest lines. Renderer exhausted; one order_dag parse error, zero substitutions. Raw canonical function body was fully reviewed. Counts: {'owned_files': 2, 'owned_lines': 1358, 'targets': 14, 'function_targets': 11, 'writable_subjects': 49, 'parameter_entities': 34, 'file_entities': 1, 'existing_facts': 67, 'source_functions': 12, 'source_only_functions': 1, 'proposals': 31, 'dispositions': {'unresolved': 8, 'supersede': 31, 'retain': 28}}.

## Behavior and limits

### `assign_reg`

`int assign_reg(int num, u32* unused, HSD_TExpDag* list, const int* order)`

Traverses candidate order in reverse, retires operand references, and allocates positive-reference outputs from the highest free slot3 down to0 separately for color and alpha. Slot counters are u8 and narrowing/underflow is unguarded. If no slot is free, no failure is returned and the destination remains untouched. Returns (4-min_color_reg)+(4-min_alpha_reg); this is an allocation score, not proof of feasible or globally minimal assignment. The u32 pointer is unused.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L9-L67

### `order_dag`

`void order_dag(int num, u32* dep, u32* full_dep, HSD_TExpDag* list, int depth, int idx, u32 done_set, u32 ready_set, int* order, int* min, int* min_order)`

Writes idx into the candidate order, marks done_set and removes idx from ready_set. done_set is passed onward but never used to filter candidates. Expands ready by direct dependencies, subtracts the union of frontier transitive dependencies, takes an eligible single-dependency shortcut or branches over ready indices in ascending order. At depth==num, assign_reg mutates node destinations for every candidate; only score<*min copies the order and score. Destination assignments are not saved with the best order.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L69-L126

### `CalcDistance`

`void CalcDistance(HSD_TExp** tevs, int* dist, HSD_TExp* tev, int num, int depth)`

Looks up the expression pointer in tevs, returns if absent or candidate depth is not greater than stored depth, otherwise updates the parallel distance and recursively traverses type1 color and alpha inputs with depth+1. On an acyclic graph with all nodes collected this computes maximum root-to-node depth. Cycles are not guarded. MakeDag subsequently performs adjacent swaps using these distances; a complete sorted order is not established by those loops.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L128-L157

### `HSD_TExpMakeDag`

`int HSD_TExpMakeDag(HSD_TExp* root, HSD_TExpDag* list)`

Asserts a TEV root, discovers distinct reachable TEV pointers into fixed32 storage, initializes distances to-1 and calls CalcDistance(root,0). The j<32 assertion precedes processing a node, not every base[n++] append, so safe capacity enforcement is not established. The distance-driven adjacent-swap loops are followed by reverse DAG construction. Nodes receive tev,idx,nb_dep,nb_ref and deduplicated color/alpha dependency pointers; producer nb_ref increments once per distinct edge. Dependency lookup searches only remaining positions and asserts a match. The header dist field is not initialized here; no general sorting or DAG validity guarantee is claimed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L161-L287

### `make_dependancy_mtx`

`static void make_dependancy_mtx(int num, HSD_TExpDag* list, u32* dep_mtx)`

Clears each u32 dependency row and ORs 1<<depend[k]->idx for each direct edge. Counts and indices must fit caller storage and the32-bit mask; there is no validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L289-L301

### `make_full_dependancy_mtx`

`void make_full_dependancy_mtx(int num, const u32* dep, u32* full)`

Copies num direct u32 rows to full, repeatedly unions full[j] into every row containing bit j, and stops after a pass adds no bits. Monotonic finite bit growth computes transitive closure for valid row storage and bit indices. Does not validate acyclicity.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L303-L331

### `HSD_TExpSchedule`

`void HSD_TExpSchedule(int num, HSD_TExpDag* list, HSD_TExp** result, HSD_TExpRes* resource)`

Uses32-entry work arrays, initializes min=5 and min_order to all zeros, builds direct and transitive masks, and calls order_dag starting at index0 without a num0 guard. If no candidate scores below5, the order remains zeros. It never reruns assign_reg on the saved order, so destination fields reflect the final explored candidate. Selected nodes populate result. Non-FF c_dst/a_dst mark reg[dst+4].color=3/alpha=1. RGB color inputs index c_in with producer c_dst; color inputs selecting alpha index a_in with producer c_dst as well, whereas alpha inputs index args with producer a_dst. These exact operations do not guarantee a valid executable schedule.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L333-L385

### `SimplifySrc`

`int SimplifySrc(HSD_TExp* arg0)`

Recursively simplifies TEV sources and replaces disabled outputs with the zero descriptor. RGB add pass-through requires A/Bzero,bias0,scale0; TEV D bypass checks clamp, texture D checks resource/swap, raster D compares parent ras_swap against child tex_swap and adopts child tex_swap. Alpha bypass uses the analogous add predicate and texture/channel compatibility without the color clamp/swap guards. References are adjusted on replacement. Only recursive changes from color inputs propagate into changed; alpha-only recursive changes do not unless a replacement occurs.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L394-L534

### `SimplifyThis`

`int SimplifyThis(HSD_TExp* arg0)`

Repeats local rewrites while changed. Clears unused texture/raster metadata without setting changed, so return0 does not imply no mutation. Color elimination and algebraic/compare rewrites are gated on alpha opFF,E,F or<=1; unreferenced alpha is disabled independently. Handles selected zero/one inputs and operation families0/1 and8..15. The alpha A/B/Dzero branch disables a_op without checking a_bias or clearing/unreferencing C. Several branches adjust references, but complete reference maintenance and semantics preservation are not established.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L549-L811

### `SimplifyByMerge`

`int SimplifyByMerge(HSD_TExp* arg0)`

Both merge halves are gated on alpha opFF,E,F or<=1. Add/sub parents with B/Czero and nonconstant endpoints may fold A or D children subject to branch-specific scale,bias,texture and channel checks. A-child folding requires add/sub and Dzero with representable combined bias. D-child folding does not require add/sub and default combined bias maps0. Color inherits unset swaps without rejecting conflicting set swap selectors; alpha does not adopt swaps. An A/D exchange does not set merged. Failed alpha bias composition can reset merged after a color merge. Therefore return0 does not imply unchanged, and universal fixed-point, state-preservation or complete-guard claims are unsupported.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L813-L1240

### `HSD_TExpSimplify`

`int HSD_TExpSimplify(HSD_TExp* texp_)`

Classifies the root; nonTEV returns false. Runs SimplifySrc, SimplifyThis and SimplifyByMerge once each in that order and ORs their reported flags without short-circuiting. There is no outer fixed-point loop. The helpers can mutate without reporting it, so the result reports helper flags rather than every graph change.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L1242-L1259

### `HSD_TExpSimplify2`

`int HSD_TExpSimplify2(HSD_TExp* texp_)`

Assumes a mutable TEV root without null/type guard. Examines RGB-selected TEV color inputs and TEV alpha inputs whose source passes IsThroughColor/Alpha: add,A/Bzero,bias0,scale0; those predicates do not test clamp. Copies source D when IMM or when KONST with unset/equal parent kcsel/kasel, adopting an unset selector. References the copied operand and unreferences the bypassed source. Other source/D kinds and conflicting selectors are unchanged. Always returns0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/texpdag.c#L1261-L1316

## Header, types and data

Owned H12–19 defines HSD_TExpDag: HSD_TETev pointer, u8 idx/nb_dep/nb_ref/dist and eight dependency pointers. MakeDag does not populate dist. Header prototypes expose scheduling/simplification and helper signatures; fn_80386230(UNK_PARAMS) atH31 has no owned implementation or baseline target. C387–390 declares unused Clear; C392 defines zero HSD_TEArg {0,7,255} with null pointer by aggregate initialization. C333–338 defines c_in[4],a_in[4],args[5] with an implicit trailing zero. Source declarations do not prove section membership.

Foreign texp.h135–173 establishes byte argument kind/selector/GX arg, expression pointer, signed32 expression refcounts and byte destinations/state. Its HSD_TExpRes has eight byte color/alpha register entries plus bookkeeping. IsThroughColor/Alpha test add,zero A/B,bias0,scale0 without clamp. Foreign texp.c53–104 increments color only for selector1, otherwise alpha; Unref decrements nonzero refs and recursively releases children when both reach zero. These routines do not validate arbitrary graphs or prove every simplifier branch balances references.

Compiler evidence texp.c1181–1225: reference root color/alpha, Simplify, MakeDag/Schedule, TExpAssignReg, reverse Simplify2, rebuild/reschedule, emit descriptors and free expression lists. No foreign TU completion is claimed.

## Dispositions

Every one of67 baseline facts and49 subjects is accounted for; raw snapshots preserve original IDs, values and timestamps. 31 corrections replace guarantees that the pinned code does not establish. Section facts stay unresolved. All34 parameter entities carry their exact canonical declaration and inherited identity; no ABI mapping claim. Canonical names remain unchanged.

Exact outgoing links: {'expected': 21, 'reviewed': 21, 'retain': 13, 'reject': 0, 'unresolved': 8}. Original records remain intact. Link claims of unconditional best-order capture, universal merge/identity/resource preservation, and compiled section attribution remain unresolved.

Dry-run validation only. No shared KB/source changes, matching, Git, UI or publication.

Validation result: `valid`,31 accepted in dry-run,0 rejected,0 skipped. Proposal SHA256 `41a13398f3be17b28c3b8db74ac8425b7c6c22c4967b77d6f468bf68a15f5b9e`. Reviewed validator receipt at 2026-09-08T15:45:26.579324+00:00.
