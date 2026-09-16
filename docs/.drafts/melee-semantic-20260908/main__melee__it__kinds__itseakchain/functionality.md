## Sheik Chain article

This unit implements the item side of Sheik's Chain: independently managed GObj-backed ItemLinks, attachment-relative deployment, collision and steering, retraction, model/hitbox synchronization, and owner-dependent lifetime.

### Construction and topology

`it_802BAF2C` constructs the configured number of links. The first-created link is stored in `seakchain.x4` and has `next == NULL`; the final-created terminal-model link is stored in `seakchain.x0` and has `prev == NULL`. Thus `prev` runs from the attachment-side constructor head toward the free tip, while `next` runs back toward the attachment. All links retain the supplied fighter attachment JObj. The constructor returns the terminal model pointer cast to `int`, or zero on GObj creation failure. Spawn ignores that result and proceeds with attachment registration after successful article allocation. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L71-L205.

### States and outcomes

All five table rows have animation ID -1 and share the owner-lifetime callback. Their distinct behavior comes from separately installed accessory callbacks:

- **0:** update the terminal display model from the attachment matrix.
- **1:** extend from the free endpoint; outcome 1 reverses/scales horizontal velocity and enters state 2.
- **2:** continue extension with gravity; outcome 1 reverses/scales horizontal velocity without changing state.
- **3:** simulate from the attachment-side active boundary using delayed fighter stick changes, damping, velocity limits, collision, and spacing constraints.
- **4:** retract toward the attachment; the shared helper's absence-of-further-link result restores state 0. The current tick still publishes transforms afterward.

Both extension helpers return **2 on list exhaustion**, after a backward constraint pass, and their callers enter state 3. Outcomes 0/1 are selected only when extension stops at an inactive link that need not activate; outcome 1 uses the retained leading-link wall collision mask. These outcomes are not item state IDs. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L212-L520 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L870-L936.

Passing `ITEM_ANIM_UPDATE` does not restart an article animation here: the generic state changer takes the -1 animation-ID branch, removes animations, clears the script pointer, installs table callbacks, and clears `on_accessory` before the entry helper assigns it again. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1180-L1236.

### Collision, steering, and publication

The collision helper refreshes sweep positions, tracks contact and gated contact audio, writes corrected link positions, and returns `env_flags & 0x18FFF`. The canonical masks establish **0x18000 as floor** and **0xFFF as walls**, not ceiling or reversed surface classes. Floor contact preserves proposed X; otherwise wall contact may add the supplied Y offset under neighbor guards. The assignment of 0xF to the suppression field must not be described as a demonstrated fifteen-frame timer. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L343-L374 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/forward.h#L87-L103.

State-3 physics skips inactive links initially, shifts X/Y input history, applies direction-dependent stick-delta scaling, and propagates older samples along `prev`. Current stick position selects how many near links skip collision. Every fifth traversal index may enable contact audio. Floor contact produces vertical restitution or horizontal damping plus vertical stopping. `x10` retains the final processed link's masked floor result, not an accumulated whole-chain mask; `x18` independently retains a fighter-state sample used for audio gating. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L552-L748.

Transform publication traverses from the first active attachment-side link toward the tip, applies translation and neighbor-derived orientation, scales the matrix basis, and samples hitbox slots 0–2 at configured thirds. The terminal free tip updates slot 3. Fighter-side publication is guarded by a non-null fighter and `cmd_vars[0]`; collision-position updates additionally require nonzero X or Y. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L789-L868 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecials.c#L219-L247.

### Cross-file lifetime

Fighter startup stores the spawned article in two fighter fields, registers hitlag forwarding, and launches it one startup count after creation. Cleanup notifies a present owner while its article handle is still live, clears item owner/parent references, removes segment GObjs, and then requests article removal. The common animation callback cleans up when the owner is absent or outside the inclusive grounded/aerial SpecialS range; the generic item dispatcher consumes its true result as article completion. Reference invalidation separately clears matching common references and the Chain-specific parent. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecials.c#L391-L573, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L148-L174, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakchain.c#L318-L341, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1280-L1289.

Grounded and aerial ending callbacks request retraction at x24 only while their counter is below x28; equality with x28 instead requests removal. Retraction completion is not a prerequisite for that timed removal. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecials.c#L873-L945.

### Semantic review result

The existing inferred function names remain useful and are retained. Corrections address reversed topology/surface explanations, animation-ID handling, ignored construction failure, and exceptional timing. Source constants are established, but compiled section contents, adjacency, and conversion-operand provenance are not. The ledger explicitly covers 182 facts: 158 retained, 16 superseded, and 8 unresolved; all 38 links are covered, with 36 retained and 2 unresolved. All owned canonical and rendered pages and all subject/link pages were read.

Status: synthesized; independent review and live promotion pending.
