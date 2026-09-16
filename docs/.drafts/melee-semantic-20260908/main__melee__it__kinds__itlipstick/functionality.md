## Lip's Stick controller

The translation unit implements six item motion states. Motion-state indices and animation IDs are distinct: the table uses animation IDs **0, 0, 0, 1, 1, 0**, and the dispatcher separately indexes the motion-state table and animation descriptors ([table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L15-L27), [dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1180-L1231)).

- **0 — resting/grounded:** setup sets `xDC8_word.flags.x15`, zeroes velocity and selects state 0. Animation returns false and physics is empty. Collision can select falling state 1 after support loss.
- **1 — ordinary falling:** selected on spawn and through support-loss callbacks. Physics forwards configured fall acceleration and speed threshold. The shared helper conditionally subtracts acceleration rather than clamping the resulting velocity. Accepted landing invokes state-0 setup.
- **2 — held:** pickup selects this state. Animation arms `xDAC_itcmd_var0`; physics is empty and collision is null.
- **3 — thrown:** the thrown event selects state 3 with mask 6. Physics is shared with dropped state 4. Nonzero ammunition enables contact processing. A low-nibble contact plus an armed flag requests a stationary spore and clears the flag. Collision response follows; `(result & 1) != 0` plus acceptance permits grounded setup. This path returns false. Exactly zero ammunition instead forwards the alternate collision helper's result.
- **4 — dropped:** selected with mask 6. Nonzero ammunition uses the shared landing helper and returns false; exactly zero uses the alternate collision helper. No spore is emitted by this callback.
- **5 — EnteredAir-selected:** animation and physics are inert. Collision selects state 1 without support, or state 0 when the grounded-exit guard succeeds. Support with a failed guard permits state 5 to persist; it is not interchangeable with ordinary falling.

The [controller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L29-L189), [x15 setter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L165-L172), [velocity reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/inlines.h#L21-L24), and [state-5 resolver](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778) support these distinctions. Inherited research establishes mask 6 as `ITEM_ANIM_UPDATE | ITEM_DROP_UPDATE` and the shared fall-helper behavior.

## Resource and cross-file lifetime

Spawn initializes ammunition from special attribute `x0` and clears the pending flag. The offset accessor copies attribute vector `x4`. Inherited caller research establishes that the fighter transforms this offset through its held-item joint and checks exhaustion before invoking the emission wrapper.

The wrapper decrements only a positive count but requests construction unconditionally, including at zero or negative counts. Allocation failure does not refund a decremented charge. Thrown-contact emission instead leaves ammunition unchanged and clears the pending flag after the void constructor call, including on allocation failure. Spore construction creates a separate object and initializes it only after successful allocation ([wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L43-L50), [contact path](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L135-L162), [constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstickspore.c#L66-L92)). Negative-count reachability remains unestablished.

## Combat and cleanup

Damage-dealt, clank and shield-hit share a response that bounces only in states 3 or 4 and returns false. Shield-bounce delegates separately. Inherited contextual research establishes that reflection reverses/scales x and y velocity, reverses facing and copies the half-life timer into remaining life. The unknown-event adapter delegates interaction-reference cleanup and discards its boolean result; surrounding cleanup may separately destroy an owned item after that callback ([adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlipstick.c#L164-L214)).

## Semantic review

Full baseline, header and rendered coverage is inherited from the hash-bound research. Independent lead reads confirmed every proposed fact's cited source and all upstream contradiction evidence. The rendered Held, Thrown_Coll, Dropped_Coll, SpawnSpore, GetSporeSpawnOffset and state-0 Setup names fit canonical behavior. Thrown_Phys is shared with dropped state 4, as existing knowledge already explains; no equivalent rename is warranted.

Supported unchanged facts and links are retained verbatim through handoff adoption. The five corrections distinguish animation IDs from flags, correct the x15 setter's effect, and preserve guarded transitions and allocation-failure behavior. Four .sdata2 facts and three section-specific links remain deferred: source does not establish compiled section allocation, pooling, stride or payload identity.

Status: synthesized; independent review and live promotion pending.
