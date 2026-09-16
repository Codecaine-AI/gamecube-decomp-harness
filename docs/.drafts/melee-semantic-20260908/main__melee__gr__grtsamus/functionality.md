# Samus Target Test ground controller

## Configuration and lifecycle
`grTSs_StageData` registers `Gr_Kind_TSamus`, `/GrTSs.dat`, the stage lifecycle hooks, and the ground callback table. The table contains three populated records followed by a zero record; row 2 carries bits 30 and 31. The header exports the StageData descriptor. These are source-level observations, not claims about compiled section placement.

`grTSamus_OnInit` passes the local indexed factory to `Ground_InitTargetStage`. That helper clears `stage_info.unk8C.b4`, sets `b5`, calls the factory for IDs 0, 1, and 2 in order, then performs four shared Ground setup calls. Factory results are not checked by that helper. The factory itself selects the matching callback row, retrieves the Ground object, and either invokes callback setup or reports failure before returning the nullable object. It performs no local index bounds check.

The callback installer clears two Ground callback fields, establishes the Ground display GX link, stores callback3, immediately invokes on_init, and schedules gobj_proc at priority 4. It does not consume callback1 or the row flags. Consequently, table membership alone does not prove that the three false-return object predicates are installed or dispatched by this path.

Demo initialization and loading are empty. OnStart calls `grZakoGenerator_801CAE04(NULL)` and discards its nullable GObj result. NULL is a spawn-descriptor pointer, not an associated GObj. The generator entry point allocates its data and attempts GObj creation; failure reports and frees the data, while success schedules its process and publishes the descriptor/data pointers globally. The Samus wrapper supplies no local recovery or teardown.

## Ground-object callbacks
- **Object 0:** initialization forwards its Ground map ID and animation selector 0 to `grAnime_801C8138`; its process and callback3 bodies are empty.
- **Objects 1 and 2:** initialization uses `Ground_JObjInline1`, which performs map-specific JObj setup followed by animation selector 0.
- **Object 1 process:** calls `Ground_801C2FE0` once and discards its Boolean result.
- **Object 2 process:** first advances the shared dynamics list through `lb_800115F4`, then calls the same collision helper. Both calls are unconditional in the wrapper.
- All three callback1 predicates return false without reading their arguments. All callback3 bodies are empty.

Animation setup can select the root's child, conditionally apply archived joint data, replace animation attachments using nullable channel arrays, request frame zero, optionally apply archive flags, and evaluate the hierarchy. Missing archives assert. Selector 0 is established here; the shared callee's `bool` spelling alongside indexing and a negative-value test should not be used to infer a strictly Boolean selector domain.

Collision refresh runs only when the map-state entry is zero. It increments a shared generation, refreshes matching StageData joint entries, and then visits archive entries if an archive exists. Generation checks suppress repeats in the archive loop; the descriptor loop itself does not deduplicate. The helper's Boolean result is ignored by both Samus process callbacks.

The dynamics helper sums pre-update scale only for records with `x0 == 1`, subtracts `x24` from scale with a lower clamp, decrements only positive lifetime counters, increments angle counters, and moves zero-lifetime records from the active list to the free list. Negative counters are not decremented or recycled by the zero test. Shared status becomes 1 or 2 when the sum exceeds 0.1, depending on whether the previous status was positive; otherwise it becomes -1 or 0 by the same previous-status test. These numeric transitions do not establish a Samus-specific wind or hazard mechanic.

## Stage-wide policies and semantic review
The stage-level callback4 returns false. Touch-line lookup always returns NULL, meaning no stage-specific DynamicsDesc is selected through this hook—not that ordinary terrain is absent. The named shadow-render check always returns true and ignores all inputs; this does not establish the behavior of other shadow-system gates.

Canonical table positions and callback types support the nine existing inferred function names. Their mixed prefixes do not justify cosmetic rewrites. The rendered file has no parse errors; `shadowed_binding` leaves the factory and touch-line function unchanged, and the renderer does not rename parameters or data labels. Rendered helper names were treated as hypotheses and checked against canonical helper bodies.

The review retains 107 baseline facts and all 27 links, supersedes seven factual explanations, and leaves one generator/item-spawn mapping unresolved. No visible platform is assigned to object IDs 0–2, no compiled layout is inferred, and no links or entities are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
