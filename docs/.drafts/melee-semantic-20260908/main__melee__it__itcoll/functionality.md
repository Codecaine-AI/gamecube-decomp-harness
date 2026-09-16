## Item collision semantic review

Inherited research covers every owned canonical and rendered page and all 99 subjects, 210 facts, and 56 links. The lead independently checked every proposed fact's citations and all upstream contradiction evidence. Supported existing knowledge and unchanged dispositions are explicitly retained. Seven factual or naming corrections are accepted; five compiled-section facts remain unresolved.

### Combat pipeline
`itcoll.c` collects fighter- and item-originated contacts for one recipient item into shared, bounded damage-log storage. Reset clears only the active count. Append stores source category and source/hit/hurt pointers, not the supplied victim Item argument. The caller in `item.c` orders reset, fighter scan, item scan, and resolution; the resolver does not clear the log.

Eligibility includes ownership, team rules, ground/air targeting, capsule state, prior victim history, and item-specific overrides. Inert contacts take separate association/toucher paths. Item clank work is gated by list order and the grab flag; successful clank or inert hitbox contact skips that attacking capsule's subsequent hurtbox processing. Reciprocal integer-damage comparisons determine clank responses, with independent maximum-bookkeeping guards and asymmetric scratch-clearing arguments.

Damage resolution evaluates capped knockback and optional effects per record, then uses the strict maximum to select final source, direction, angle, element, and hit-property state. Hold kinds 4 and 6 use the element-effect table; other kinds use the normal effect. The first qualifying maximum wins ties. Arbitrary NaN or sufficiently negative knockback inputs are not safely handled by the selection initialization.

Catch scanning returns on the first accepted overlap, not after finding a global nearest fighter. Its caller dispatches item- and victim-side grab callbacks for a non-null result.

### Geometry and persistent history
Matching logical hitboxes share victim registrations, optionally across a nonzero shared item group. Registration happens before the Boolean scratch-clearing gate. Duplicate registrations may refresh metadata without clearing scratch eligibility. Activation/regrouping inherits both victim tables and cursors from the first matching capsule, otherwise clears their logical contents. Countdown aging preserves untimed entries and clears identities on expiration.

Single-slot and four-slot position updaters maintain current/previous endpoints through the explicit Enabled, Unk2, and Unk3 lifecycle; Disabled and Unk4 perform no positional update. Hurtbox cache invalidation, bulk state assignment, geometry-only setting, and geometry-only export remain distinct operations. Article initialization checks two-entry limits; absent hurtbones clear their count, whereas absent dynamics leave that block untouched.

### Body collision and ownership
ECB reconstruction restores base extents, optionally mirrors them, and rotates four cardinal points about positive Z before taking extrema. The axis is explicitly read from `it_803B8560` as a Vec3. Repeated angle normalization is not guaranteed to progress for all finite magnitudes. Body-overlap scans assign, rather than accumulate, horizontal nudges and OR result bits; physics consumes the nudge separately under its own guards. The x1B clear/set pair records processing order for near-coincident-center tie breaking. Fighter tracking copies current positions and fixed ECB offsets when invoked for the item-list head.

Damage-source ownership promotion prefers xCEC, falls back to xCF0, and resets attack information. Despite its spelling, xCF0 receives an attacking item's fighter owner. Contact ownership promotion validates xCFC and does not reset attack information. The damage setter applies fighter-owner scale and stale processing without checking capsule enabled state; the current stale helper receives but does not use the attack-instance argument.

### Rendered-name assessment
Most existing names accurately distinguish their operations. FA2C and FAC4 share an inferred name, causing renderer name collisions; the proposed group-wrapper name makes their distinction explicit. Header bindings for 7236C and 723FC are shadowed despite normal substitution in the C definitions. Rendered names were treated as hypotheses, not behavioral proof. No compiled section composition or placement was inferred from C declarations or ordering helpers.

Status: synthesized; independent review and live promotion pending.
