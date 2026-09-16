## Grounded Thunder Jolt

This unit implements the grounded Thunder Jolt item for Pikachu, Pichu and their Kirby-copy variants. Its two-entry `ItemStateTable` dispatches numeric states 0 and 1. These are implementation phases, not proof that the ground/air item-name distinction corresponds directly to airborne versus grounded motion.

### Creation and initial movement

`itPikachuThunderJolt_Spawn` constructs a zero-damage, zero-velocity spawn request, supplies both parent references, and returns NULL on allocation failure. Successful creation clears command variables, initializes lifetime through a shared helper, clears the companion pointer and counter, records position data, and initializes state 0. Initialization derives heading from attribute x4 and facing, selects effect 0x4BD for native Pikachu/Pichu kinds or 0x4AD for Kirby copies, and forwards the owner to developer-display setup. The default kind branch neither spawns an effect nor sets xDE0.

State 0 snapshots position before delegating animation status. Its physics callback writes XY velocity as attribute x8 multiplied by cosine/sine of the stored heading; it does not compute angular velocity or locally follow surface geometry.

### Surface transition and paired operation

State-0 collision tests the stored-to-current position segment. On contact it destroys ground-owned effects, clears xDE0, and enters state 1 **before** allocating a kind+1 companion. It selects companion facing from the normalized difference between velocity direction and surface-normal direction. Allocation failure returns true after state entry. Success initializes the companion from position, collision data and normal, resets xDE4, and resets the ground item's hitboxes. That final helper does not stop velocity; state-1 physics separately resets velocity.

State-1 animation requires a companion and a reciprocal backlink, delegates ordinary animation/lifetime processing, then obtains the companion model's dynamic-bone-6 world position with z set to zero. The callback dereferences its item before its later null checks and is not a general null-safe entry point. State-1 collision skips querying while xDE4 is negative and permits frames with no reported intersection. On a reported intersection, xC equal to zero disables angular rejection; otherwise only an angle strictly greater than abs(xC) terminates. A missing companion also terminates within that branch. Successful synchronization resets xDE4 to zero, then the common increment makes it one.

The companion's canonical implementation independently checks reciprocal linkage and a counter limit of 24. Surface setup resets that companion counter. Thus loss of contact is not immediate ground-side termination, and the paired lifetime crosses translation-unit boundaries.

### Interactions and cleanup

Destruction, damage-dealt, clank, absorption and shield-hit cleanup sever the reciprocal relationship and destroy ground-owned effects. The four boolean terminal handlers return true. The companion-clear helper only clears its backlink; companion termination is subsequently requested by its own animation callback, not synchronously performed by the ground callback.

Reflection negates facing, updates model Y rotation, adds pi to the stored heading and wraps it using strict comparisons, allowing the tau endpoint. It does not directly rewrite velocity. Shield bounce mirrors XY velocity, leaves Z untouched, recomputes heading and chooses positive facing for nonnegative X velocity. Both return false without a local state change or unlinking. The unknown-event wrapper delegates selective ownership/interaction-reference removal to the common item helper; the shared sweep handles owner-bound destruction separately.

### Semantic review

The existing `GetAirGObj`, `ClearLinkedAir`, `Init`, `Attached_Anim` and qualified `Clanked` names fit canonical behavior and are retained. Corrections distinguish hitbox reset from velocity suppression, preserve state-entry-before-allocation ordering, remove the every-frame-contact requirement, and distinguish unlinking from simultaneous destruction. Source-level literal arithmetic is supported, but compiled small-data contents, alignment and precision layout remain unverified.

Both owned files were read completely in canonical and rendered form. The header renderer reports shadowed bindings for `it_802B3368` and `itPikachuThunderJolt_Spawn`; the former remains address-named in the header despite being renamed in the rendered C definition. This is a renderer limitation, not evidence against the supported getter name.

Status: synthesized; independent review and live promotion pending.
