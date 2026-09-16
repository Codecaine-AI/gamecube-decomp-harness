## Common damage response

This translation unit converts pending fighter damage and applied knockback into damage duration, reaction severity, launch direction, velocity, motion selection, feedback and recovery behavior. Its header declares the exported helpers and Damage, DamageFly and DamageFlyRoll callbacks.

### Calculation and entry

Knockback adjustment applies state and size modifiers, subtracts the greater ordinary armor contribution plus optional metal armor, and clamps the result. Angle resolution preserves the encoded 361 special case, its grounded interpolation and airborne constant, and the non-361 branch that arms meteor-cancel fields. Velocity application either replaces XY knockback or reconciles each axis with residual velocity according to time since hit. The four-tier classifier returns numeric values 0–3 despite its canonical `bool` spelling.

The central initializer distinguishes the base severity from the severity forced by an explicit motion request. It computes launch vectors and floor-relative responses, clears ordinary movement before motion entry, installs hitlag callbacks, initializes timers and queues feedback. Explicit motion requests are not absolute: sufficiently strong ice damage can replace the requested motion unless it is numeric `0x145`. The dispatcher separately refreshes ledge cooldown and selects DamageSong for eligible numeric elements 6/7 or delegates ordinary initialization.

### Hitlag and exceptional reactions

Regular SDI applies qualifying left-stick positional displacement and consumes both axis-input timers. Exit-hitlag processing applies C-stick-priority ASDI, consumes a pending collision-immunity request, applies magnitude-preserving DI, then optionally scales knockback magnitude for held L/R. These operations have distinct guards; exit-hitlag displacement does not locally test `allow_sdi`.

Reaction resolution preserves capture-participant ownership, metadata transfers, linked hitlag, partner dispatch values and capture separation. The partner-owned pre-hitlag callback is called with the original `gobj`, as authored. Cape processing can defer work to the common exit; bind, screw, heavy-item, down-damage, burial, frozen and capture-specific branches can intercept ordinary entry. Auxiliary response passes perform queued defeat handling, numeric motion hooks, coloration and ground-only damage-source cleanup. The color selector has an uninitialized return path when temporary damage is zero; it must not be interpreted as reliably returning false there.

### Recovery and cross-file lifetimes

The damage-duration updater decrements a positive countdown and performs one-shot cleanup when the active flag is set and the countdown becomes nonpositive. Meteor cancellation and jump buffering share an IASA helper, but the buffered value is a snapshot of remaining damage duration, not a separately advancing timer. Ordinary Damage and DamageFly animation exits require animation completion and cleared restriction; DamageFlyRoll exits on cleared restriction alone. DamageFall entry is delegated and retains its parasol alternative; grounded neutral dispatch retains boss, defeated and Hammer alternatives.

Launch effects use a separate speed-selected countdown. A nonzero initial interval is normalized to one; expiration emits effect 1032 and recomputes the interval. Fly/Roll physics selects movement policy, aligns the model with combined self and knockback velocity, and performs owner-and-speed-gated hitbox cleanup. Roll preserves two guarded orientation updates. Collision callbacks prioritize accepted floor contact, directional then neutral tech, and the DownBound-family fallback; side contacts prioritize wall and ceiling tech before guarded reflection. The delegated DownBound fallback has an exceptional orientation-dependent neutral/Sandbag path, so its invocation does not guarantee a final DownBound motion.

### Semantic review

Most existing names and explanations remain supported and are explicitly retained in the checkpoint ledger. Proposed corrections distinguish the colliding entry/dispatcher names, qualify motion overrides and initialization order, preserve exceptional fallback destinations, and correct jump-buffer interpretation. Rendered substitutions are hypotheses rather than independent evidence. Both owned files were read completely in canonical and rendered form, and all 81 subjects, 200 facts and 140 links were reviewed. No compiled section placement or physical section ownership was established.

Status: synthesized; independent review and live promotion pending.
