## Super Scope beam projectiles

The unit implements ten numbered beam variants with one shared animation/physics/collision callback family. The existing rendered names `itSScopeBeam_Spawn`, `itSScopeBeam_Init`, and `itSScopeBeam_Anim` fit canonical behavior; they are descriptive hypotheses, not proven original names. Both owned files were read completely in canonical and rendered form, with no renderer errors.

### Creation and lifetime
The weapon caller debits ammunition before calling the beam spawner. The spawner copies the supplied position into `prev_pos`, forces its Z component to zero, obtains the current spawn position through a fighter helper, and initializes parent references, facing, damage and velocity. Successful creation stores the charge/variant index and invokes initialization and the final setup hook; null creation skips that work. Neither inspected function refunds ammunition on failure. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscope.c#L138-L154 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscopebeam.c#L37-L59.

Initialization stores the owner, selects indexed attributes, maps supported indices 0–9 to same-numbered states, sets horizontal velocity to configured velocity times facing, applies uniform model scale, and initializes lifetime. The index is not checked, and the switch has no default. The public header expresses item/fighter pointer roles while the definition uses HSD_GObj pointers. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscopebeam.c#L61-L109 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscopebeam.h#L11-L12.

Animation scales hitbox 0 only when its state is at least HitCapsule_Enabled and the timer exactly equals the configured lifetime. It then subtracts one, clamps nonpositive values to zero, and returns true on expiry. The equality test is not an independent once-only latch. Physics is locally empty; this does not establish absence of engine-level movement. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscopebeam.c#L111-L135.

### Stage collision
The collision callback snapshots position, collision data and horizontal velocity before common collision processing. Result bits in 0xE return true immediately. Special floor handling requires both result bit 1 and environment bits 0x18000. Contacts within one degree restore position and collision data and call it_8026D9A0. Otherwise, angles within x78 construct a horizontal vector multiplied by x7C and rotate it about positive Z by twice the floor angle plus a facing-dependent random term. A nonpositive resulting Y restores saved X velocity and zeros Y. Over-limit eligible contacts return true; other paths return false. The source does not establish that x7C necessarily reduces speed. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscopebeam.c#L137-L186.

### Interaction boundaries
Damage-dealt, clank, ordinary shield-hit and absorption callbacks return true without local mutation or cleanup. Shield bounce and reflection return their respective shared helpers' results unchanged. The unknown-event callback forwards both pointers to it_8026B894. Actual shared-helper side effects and engine destruction remain outside these local bodies; rendered helper names are not independent evidence. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscopebeam.c#L188-L221.

### Review outcome
Retained 69 existing facts and all 23 links explicitly in checkpoints. Three factual explanations receive targeted corrections; six compiled-section assertions remain unresolved. Historical duplicate link identities are preserved. No compiled section size or layout is asserted from source literals or helper calls.

Status: synthesized; independent review and live promotion pending.
