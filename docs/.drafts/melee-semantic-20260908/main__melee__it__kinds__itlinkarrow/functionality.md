## Link-family arrow article

This unit implements the shared arrow article for Link, Young Link, and their Kirby-copy variants. The canonical and rendered files support the existing Spawn, Release, Draw, RemoveAuxModels, flight, nocked, shield-attached, and stage-embedded naming hypotheses. No cosmetic renames are proposed. The ledger explicitly retains 177 facts and 72 links, supersedes five factual explanations, and leaves 13 section-scoped facts and eight section-scoped links unresolved pending compiled evidence.

### State machine

The five table indices are distinct from animation identifiers: state 1 requests animation 0; states 0, 2, 3, and 4 use animation identifier -1.

- **0 — held/nocked:** pickup selects this state. Animation reapplies the saved fighter-derived scale and checks the originating fighter against the current owner before invoking native or copied-bow lifetime predicates. A null originating fighter requests removal; a non-null ownership mismatch returns false. Physics and collision are inert. Fighter-side code supplies the held geometry through the two-vector setter.
- **1 — released flight:** entry resets the life timers from attribute x0. Animation initializes the primary hitbox behind an itcmd flag, progressively enables two auxiliary models, updates their transforms, and checks lifetime. Physics snapshots position and subtracts ABS(attribute x1C) from vertical velocity. Collision derives a facing-relative, clamped model angle and performs swept stage collision. A valid active line leads to state 4; the callback returns false on either path.
- **2 — shield-attached:** accepted fighter contact resets velocity, selects state 2, removes auxiliary models, and derives a polar attachment from shield geometry and the movement-segment midpoint. Physics refreshes the planar shield-relative position. Animation continues only for GuardOn, Guard, or GuardSetOff and checks lifetime afterward. Guard loss bypasses the local timer-cleanup path. Collision is inert.
- **3 — inert:** all three callbacks do nothing. The table registers this state, but this file demonstrates no entry into it; no gameplay phase or global unreachability is inferred.
- **4 — stage-embedded:** entry sets the embedded lifetime, initializes wobble counter x9C to 3–6, clears expiry counter xF0, removes auxiliary models, and selects variant-specific sound/effect presentation. Cases 0–6 produce alternating randomized rotation, so normal entry yields 4–7 randomized updates. After lifetime expiry, the first expired update triggers effect/hitbox cleanup; subsequent expired updates remain hidden and advance xF0, with true returned when it exceeds 300. Collision independently follows the retained active stage line and compensates for changes in surface-normal angle. Missing or inactive attachment returns true; only the -1 line-ID branch explicitly clears velocity. Physics is inert.

### Construction, release, and resource lifetime

Construction flattens the supplied position before attempting creation, initializes arrow-local fields only on success, and attaches the article to the requested fighter part. Release writes angle, charge, and an initial lifetime before its ownership guard. On success, flight entry overwrites that lifetime with attribute x0 before launch velocity is established. Charge interpolation is not clamped and has no local zero-denominator guard. Ownership failure has no explicit Boolean return. The local joint-loader helper also leaves its result uninitialized for a null joint descriptor; it must not be described as safely returning NULL.

The two auxiliary JObj hierarchies are independently drawn, transformed, removed, and nulled. Their cleanup does not itself destroy the primary item. Explicit removal performs auxiliary cleanup before generic item removal; fighter callers clear their retained handles separately. The destruction notification invokes fighter-side arrow cleanup only for an unreleased arrow still owned by its originating fighter, then clears item-side ownership fields for every valid Item.

Damage-dealt scales horizontal velocity, cleans auxiliary visuals, and returns true. Clank cleans those visuals and returns true. Reflection reverses planar velocity and facing, advances position once, and synchronizes the model while returning false. Its angle adjustment uses pi-sized increments, not conventional 2*pi wrapping. Reference invalidation delegates only to the common reference helper; it does not clear arrow-local xE0 or xC4.

### Evidence boundaries and rendering

All owned canonical and rendered pages, all 81 subjects, and all 80 links were reviewed. Rendered names were assessed against canonical behavior rather than treated as evidence. The header suppresses the Spawn substitution as shadowed_binding; this does not contradict the constructor interpretation. Source declarations and the conditional literal-order helper do not establish compiled section membership, size, or layout. In particular, state-4 animation accesses floating data through arithmetic based on it_803F6A28; equivalence to the separately declared it_803F6A84 lookup remains a compiled-layout question.

Status: synthesized; independent review and live promotion pending.
