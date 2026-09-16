## Clefairy item lifecycle

`itpippi.c` implements a six-entry item state machine. State 0 handles appearance, state 1 provides the guarded waiting countdown, and states 2–5 share one animation/physics/collision callback triplet. The header declares the callbacks and exports the state table.

### Initialization and appearance

`itPippi_Logic20_Spawned` sets `facing_dir` to `0.0f`, clears all three item-command variables, calls shared Pokémon setup with special attribute `x0`, invokes the local initializer, and calls the sound helper with `0x272A`, `0x7F`, and `0x40`. The initializer requests state 0 with `ITEM_ANIM_UPDATE`, clears both hitlag callbacks, and stores the configured Pokémon timer for later consumption in state 1.

State 0's animation callback delegates to shared spawn scaling and returns false. Its physics callback delegates to the shared appearance countdown; only a true result resets velocity, requests state 1, and clears the hitlag callbacks. The shared countdown applies physics before testing expiry. A positive countdown decremented to zero still returns false on that invocation. State 0 collision delegates through `it_8027A118`, which performs shared terrain processing and returns false. Floor contact can invoke the empty local hook and restore normal model scale.

### Waiting and result selection

State 1 decrements its timer only when `it_80272C6C` returns false. A positive remaining timer causes the current state animation descriptor to be reapplied; a nonpositive timer invokes the selector. This is a guarded countdown, not an unconditional per-frame decrement.

The selector makes one `HSD_Randi(sa->max)` call. Ordered comparisons against `xC`, then `xC + x10`, then `xC + x10 + x14` select states 2, 3, and 4; the final fallback selects state 5. It requests the selected state with animation updating enabled and then clears both hitlag callbacks. The source does not establish equal probabilities, concrete attribute values, or which numbered state corresponds to each named Metronome attack.

### Shared result behavior and lifetime

All four result states use `itPippi_UnkMotion5_Anim`, `itPippi_UnkMotion5_Phys`, and `itPippi_UnkMotion5_Coll`. The animation callback conditionally reapplies the current descriptor, then independently returns whether `xDAC_itcmd_var0` is nonzero. The local unit does not establish the external script operation that sets that flag.

Waiting and result physics apply configured falling parameters only for `GA_Air`. Their collision callbacks select `it_8026E15C` for `GA_Air` and `it_8026D62C` for every other value, pass the same no-op hook, and return false. The empty hook does not suppress effects performed by the shared collision routines.

`it_802D32DC` forwards both object pointers to shared interaction-reference cleanup and discards its result. The shared routine clears matching owner, reflector, absorber, fighter, unknown-fighter, and toucher references; a matching fighter reference also resets source-player metadata to 6. The definition spells the second parameter `HSD_GObj*`, while the header spells it `Item_GObj*`; this review does not infer an ABI defect from that spelling difference.

### Semantic review

The rendered `Spawn_Anim`, `Appear_Phys`, `Wait_Phys`, `Appear_Init`, `SelectAttack`, and `Logic20_EvtUnk` names remain useful role hypotheses, not recovered original spellings. Both rendered files were read completely and reported no parse errors. The substantive correction is to describe the result collision callback as shared across states 2–5 rather than as infrastructure for only one motion. Existing supported facts and all links are explicitly retained in the checkpoint ledger. Three `.sdata2` facts remain unresolved because source literals do not prove compiled section contents or loads.

Status: synthesized; independent review and live promotion pending.
