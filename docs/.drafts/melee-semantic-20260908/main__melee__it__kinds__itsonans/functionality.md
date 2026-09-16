## Sonans / Wobbuffet

This unit implements Wobbuffet's summon lifecycle and damage-responsive rocking Counter. The header declarations agree with the implementation. Both owned files were read completely in canonical and rendered form; rendered substitutions were assessed as naming hypotheses rather than independent evidence.

### State lifecycle
- The three table indices are 0, 1 and 2; their animation identifiers are 0, 1 and -1 respectively. Index 2 must not be confused with animation identifier -1.
- Initialization clears the rocking flag, velocity, angle and stored Counter strength, loads lifetime from special attribute x24, performs shared setup and enters airborne startup state 2.
- State 2 delegates scale animation, falling/readiness and collision processing to shared Pokémon helpers. Readiness is a startup-timer test, not a landing test. Its false path still applies falling and decrements the shared startup timer. On success, Sonans runs its ordered setup helpers, selects state 0 with flag 2 and installs effect-hitlag callbacks.
- State 0 changes to state 1 and plays SFX 0x272B when the animation query returns zero. It decrements lifetime even on that transition invocation.
- State 1 decrements the existing lifetime and returns true only when the resulting float equals exactly zero. This is not a nonpositive test; fractional or already-negative values need not expire through this predicate.
- States 0 and 1 share Counter physics and both explicitly dispatch ground-versus-air collision handling. Neither is exclusively grounded.

### Counter data flow
Received damage and direction produce a signed rocking impulse. An inactive response accepts it immediately; an active response replaces its velocity only for a strictly greater incoming magnitude. Independently, every received hit refreshes stored Counter strength using scaled damage with an upper cap, so a weaker hit can lower strength without replacing the stronger rocking velocity.

The shared updater applies falling while airborne. While rocking is enabled, it adjusts velocity according to angle/velocity signs, settles only when both magnitudes are strictly below the threshold, otherwise integrates velocity into angle, and reverses/damps velocity by -0.9 on strict angular overshoot. It writes the degree angle to dynamic bone 4 as radians. Hitbox 0 receives the stored strength cast to u32 before unconditional strength decay. There is no local lower clamp, including when rocking is inactive; compiled conversion behavior and effective negative-strength outcomes are not established here. Damage dealt unconditionally negates rocking velocity and returns false.

### Interfaces and lifetime boundaries
The empty local callback remains a no-op even when rendered as Destroyed. The two-object event wrapper delegates reference cleanup and discards its Boolean result. The canonical shared helper independently clears matching owner, reflector, absorber, source-fighter, auxiliary-fighter and toucher pointers, resetting source-player value to 6 when clearing the source-fighter reference. Its dispatcher can separately remove an item based on the saved pre-callback owner and a flag.

Existing inferred function names remain useful and are retained as inferences. Numeric UnkMotion names avoid unsupported semantic specificity. Source literals do not establish compiled .sdata or .sdata2 contents. Startup helper calls also must not be summarized as blanket teardown: inspected hitbox helpers both set and clear flags.

Status: synthesized; independent review and live promotion pending.
