## Shared menu animation and navigation utilities

The complete canonical and rendered `src/melee/mn/mn_22EC.c` were reviewed, together with all 45 subjects, 82 baseline facts and 15 links. The checkpoint ledger explicitly retains 77 facts and all 15 links, and supersedes five facts. Existing supported names and explanations are otherwise preserved.

### Animation playback

`mn_8022EC18` and `mn_8022ED6C` use hierarchy-wide animation requests/evaluation; `mn_8022EE84` and `mn_8022EFD8` use single-JObj requests/evaluation. All four inspect the frame through `mn_8022F298`, recover frames outside the inclusive configured interval, select one-shot mode with **loop_frame == -0.1f**, and otherwise apply one overshoot-preserving wrap. This is not modulo reduction across arbitrarily many loop periods. The All variants advance one-shot playback while the queried frame is below the endpoint; the single-node variants instead test inequality. The source comment naming end_frame as the sentinel field is misleading; the existing facts correctly identify loop_frame. The two masked variants additionally invoke the selective FObj-stop traversal after explicit seeks. Their returned frame controls caller-owned process handoffs and destruction in Deflicker, Erase Data and Sound Test; the helpers do not perform those lifecycle actions themselves.

`mn_8022F298` checks the current JObj AObj, then the first DObj's material AObj, then that material's first texture AObj. Only if none exists does it search child subtrees in sibling order, and only when flag 0x1000 is clear. It neither scans all DObjs/TObjs nor validates a null root. A directly returned frame of -1.0f is indistinguishable from the not-found sentinel to a recursive parent. The proposed state explanation preserves this ambiguity.

`mn_8022F360` is the per-AObj callback: it stops FObjs matching obj_type, with 0xFF selecting every channel. `mn_8022F3D8` is the JObj-rooted, category-mask traversal wrapper. The delegated stop flushes KEY interpreter data when applicable and sets FObj state zero; the callback supplies a null property-update callback and zero rate and does not set the parent AObj's AOBJ_NO_ANIM flag. The wrapper accepts a null root through HSD_ForeachAnim's early return. Its category mask filters eligible animation callbacks, while traversal still visits intermediary hierarchy nodes. Both baseline inferred names were `mn_StopFObjAnimByType`, producing rendered name collisions. The proposal distinguishes the wrapper by naming its JObj scope, retaining the callback name.

### GObj lifecycle and input

`mn_8022F0F0` requests destruction of objects in a low-byte-selected process-link bucket, saving each successor before the destructive call. `mn_8022F138` applies this over inclusive u16 bounds using an int counter; reversed bounds are a no-op. Narrowing can revisit buckets for ranges beyond 255. Complete-chain safety presumes cleanup callbacks do not invalidate the saved successor. Destruction of the specially tracked active GObj can be deferred until its callback returns, when the scheduler consumes the pending request.

`mn_8022F1A8` traverses an inclusive range with the same byte narrowing, but stamps attached process chains with the current scheduler generation rather than destroying them. The scheduler skips matching stamps and advances its generation modulo three before subsequent passes. This is current-pass suppression, not persistent pausing.

`mn_8022F218` reads the aggregate processed trigger mask and tests PAD_LR_START. Input processing synthesizes this bit independently per physical port from a complete held L+R+Start chord plus a constituent press edge, then aggregates ports. Buttons split across controllers do not form the chord. `mn_8022F268` only writes 1 to force_main_menu; callers separately request exit and manage presentation.

### Scalar approach and return routing

`mn_8022F410` and `mn_8022F470` update mutable float/int scalars using target-clamped addition or subtraction. Their return values identify the pre-update comparison branch, not guaranteed observed movement or post-update completion. Zero steps can return nonzero without movement; negative steps can move away from the target. Float rounding and NaNs, and signed integer intermediate overflow, limit unconditional convergence claims. Tournament callers independently consume updated coordinates and branch results for cards, text and bracket-camera presentation.

`mn_8022F4CC` selects a Tournament return path with SisLib and menu cleanup, a GM_MENU path delegating the unchanged tuple (2,3,3) without local cleanup, or a cleaned-up Character Select fallback. Shared menu cleanup requests destruction in buckets 1 through 8. SisLib reset reinitializes its existing arena rather than freeing that arena. No additional semantic labels are assigned to the tuple values, and the void(void) signature is not a noreturn claim.

### Evidence limits

Rendered substitutions were assessed against canonical behavior, not treated as proof. Both rendered pages have no parse errors; the callback/wrapper name collision is the identified rendering issue. No compiled artifact was supplied for .sdata2, so no compiled section, constant placement or layout claim is made.

Status: synthesized; independent review and live promotion pending.
