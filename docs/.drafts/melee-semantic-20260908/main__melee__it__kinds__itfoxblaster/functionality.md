## Held Blaster article

This unit implements the held gun, not the damaging laser projectile, for Fox, Falco, and Kirby's copied variants. Its eleven-entry state table assigns shared callbacks to states 0–8, terminal cleanup callbacks to state 9, and conditional owner-scale synchronization to state 10. Three fourteen-entry curves drive firing articulation; a separate five-entry curve drives opening/retraction. These are source-level declarations and roles, not proof of compiled section placement.

### Construction and commands

`it_802AE8A8` creates the requested article from supplied facing, position, fighter and attachment part. On success it records the private fighter owner, initializes command/private state and six shot-history slots, then invokes pickup. `it_802AE994` instead derives position and facing from its owner and sets all four item commands to one before pickup. Independent common-state callers use this alternate constructor for Fox's DeadDown, DeadRight, DeadUpFallHitCameraIce and Sleep presentations. Pickup invokes the lifecycle callback, whose nonzero-command override selects state 10. Otherwise it maps the owner-action discriminator through `{0,9,9,3,9,9,6,7,8,9,10}` and advances animation/script processing.

Visibility commands 0 and 2 hide the child hierarchy; 1 reveals it. Entering command 2 plays a family-specific sound once per command transition. Other integers are stored without a visibility-switch action. Opening initializes private pose index 1 and step +1 unless already at 4, with a sound latch reset by initialization. Retraction initializes index 3 and step -1 unless already at 0. The updater applies the current pose before progressing indices 1–3. Ordinary forward progression reaches 4 while leaving step +1; only a result >=5 clears the upper-bound step. Reverse progression reaches 0 and clears its step. These pose indices are distinct from item motion-state IDs.

### Deferred firing presentation

Native and copied fighter paths create a projectile separately, then call `it_802AE1D0`. This restarts firing articulation at index 1, installs the forwarding accessory callback and raises a pending-effect latch. `it_802ADF10` consumes the latch only when generic and saved ownership match, derives muzzle offset and angle, and spawns effect 1166 for native articles or 1196 for copied articles. It shifts records 0–4 into 1–5 and clears staging slot 0. Unknown item kinds still consume the guarded request and shift history without spawning an effect. The latch represents one pending event, not an unbounded queue. Ownership equality alone is not a nonnull-owner check.

Firing-model updates apply Z translation, Y/Z scale and X rotation to successive joints. Active indices 1–13 advance and reset to 0 upon reaching 14. Index 0 continues applying the baseline pose. Table lookup precedes progression checks; the checks do not validate arbitrary indices. Several helpers dereference their arguments before apparent null guards, so they must not be described as generally null-safe.

### Synchronization and lifetime

Ordinary animation skips resynchronization for item states 2, 5, 6, 7 and 8; other states follow the owner-action discriminator through the identity map. Lifetime processing then distinguishes full cleanup from an alternate destruction branch. Full cleanup conditionally clears fighter-side bookkeeping when generic and private ownership match, clears both item owner fields, destroys effects and invokes common item destruction. The alternate branch clears only the private owner before calling `Item_8026A8EC`, then calls `efLib_DestroyAll`. It is not merely detachment. The animation callback returns false even after explicit destruction.

State-9 animation and collision callbacks perform identical immediate effect/reference cleanup and return true; physics is empty. Native reciprocal cleanup clears the tracked article and damage/death callbacks, whereas Kirby's corresponding helper clears its tracked article. State 10 copies the owner's root Y scale uniformly to the gun only when the owner predicate accepts Sleep or DeadUpFallHitCameraIce; its remaining callbacks are inert. These callbacks do not establish the alternate article's complete external lifetime.

Explicit removal clears both item owner fields before effects and common destruction; fighter-side callers separately clear their stored handles afterward. Reference invalidation forwards to the common item helper, which clears matching common ownership/interaction fields and resets the source-player sentinel when appropriate. It does not visit the separate private `foxblaster.owner` field.

### Semantic review

Existing rendered names generally fit independently verified canonical behavior and are retained. Six factual corrections address destruction-versus-detachment wording, forward-step endpoint handling and constructor ordering. Seven small-data facts and three literal-pool links remain unresolved without compiled evidence. All 143 facts and 76 links have explicit checkpointed dispositions. Both owned files were read completely in canonical and rendered form. The header renderer leaves the two pointer-return constructors unchanged with `shadowed_binding`; this is a rendering issue, not evidence against their supported names.

Status: synthesized; independent review and live promotion pending.
