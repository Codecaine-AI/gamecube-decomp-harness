## Scope and rendering
Reviewed all 395 canonical and rendered lines of `ft_0881.c`, all 34 lines of its header, all 74 subjects, all 125 baseline facts, and all 28 links. Rendered function-name substitutions were consistent between declaration and definition, with no reported parse errors. Existing inferred names remain useful, explicitly tentative hypotheses rather than recovered historical names.

## Managed fighter audio
Seven playback wrappers retain handles in `x2144` through `x215C`, using channel bases `0x1E`, `0x2A`, `0x36`, `0x42`, `0x4E`, `0x5A`, and `0x72`, plus `2 * player_id + x221F_b4`. Ordinary requests pass through fighter-aware SFX selection. Request `0x83D60` does nothing; `0x83D61` invokes the paired reset, which submits the stop command and stores `-1`. The first two wrappers additionally suppress requests when `x2225_b6` is set except for Samus and Mr. Game & Watch, and clear both first channels before ordinary playback. The remaining wrappers do not explicitly stop a prior handle before overwriting their slot.

Random collection playback checks only the collection pointer, consumes one RNG sample, and forwards one selected request at volume `0x7F` and pan `0x40`. It does not validate the count or clear the caller's pending pointer; the damage-audio caller owns that clearing. Script dispatch and concrete DamageIce, Shadow Ball, aerial-jump, and Ottotto callers corroborate the documented gameplay uses.

Both bulk cleanup routines reset both subslot variants of all seven channel groups and invalidate `x2160`. `ft_80088C5C` first removes owner-associated audio objects and attempts retained-voice cleanup using exact `!= -1` guards—not nonnegative tests. Category resets additionally depend on a return value of `1`, but the subsequent full channel reset is unconditional. KO paths and final Fighter destruction call this fuller cleanup; baseline/death reset calls `ft_80088A50`.

The material correction is that `x2164` and `x2168` are accumulated audio-control counts, not pointers to two audio objects. Adjacent acquisition helpers increment each Fighter count and its corresponding global count. Cleanup passes the accumulated amounts to separate subtraction helpers and zeroes the Fighter counts. Those callees subtract only positive amounts and clamp their global counts at zero.

## Stale-move identity and damage
Reset writes attack identity `(1, 0)` without clearing player history. Motion-state entry updates identity when the move ID changes or is `1`; equal non-1 IDs preserve the existing occurrence. Explicit refresh reuses the current move ID, making its inline equality guard tautological, and obtains another occurrence identifier. Rapid-jab cycles and installed down-tilt/Hand Slap callbacks establish external refresh boundaries. The player subsystem allocates u16 identifiers and deduplicates move-ID/instance pairs across its ten stored entries before insertion.

The multiplier helper scans at most nine positions backward through indices `0..9`, beginning immediately before `current_index`. ID `1` returns `1.0F`; an encountered empty move ID `0` terminates scanning; each match subtracts the coefficient indexed by traversal rank. The table is not mutated and `arg2` is unused. The wrapper selects the player's table and multiplies the supplied damage only for a non-neutral factor, bypassing the entire lookup at `DbLevel >= DbLKind_DebugRom`.

Source establishes the neutral float's semantics but does not establish compiled `.sdata2` placement, extent, pooling, or padding. Exact coefficient values and their monotonic ordering were not established by delivered canonical evidence.

Status: synthesized; independent review and live promotion pending.
