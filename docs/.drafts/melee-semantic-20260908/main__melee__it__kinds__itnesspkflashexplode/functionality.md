## PK Flash explosion

This unit implements the charge-scaled detonation item used by Ness and Kirby's copied PK Flash. Its single source-level ItemStateTable entry selects motion 0's animation, physics and collision callbacks. The existing proposed names `itNessPKFlashExplode_Spawn`, `itNessPKFlashExplode_Init` and `itNessPKFlashExplode_Logic103_Destroyed` fit their canonical implementations and are retained.

### Construction and lifetime

`it_802AF940` builds a spawn descriptor from owner, projectile, position, kind, facing direction and charge. It forces position Z and all initial velocity components to zero. Only successful creation clears the four command variables, stores charge and a separate owner reference, and invokes initialization; failure returns NULL without explosion-specific initialization. The caller in `itnesspkflash.c` selects Ness or Kirby explosion kinds after its ownership, reflection-state and delay guards. It ignores the constructor's return and returns true after the switch, including its default branch. [Constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflashexplode.c#L24-L55), [caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflash.c#L235-L271).

Destruction tolerates a NULL object or Item payload. For a valid payload it calls `it_802725D4` before clearing `Item.owner`; the local body does not explicitly clear the separate explosion-variable owner reference. The unknown event callback forwards both arguments unchanged to `it_8026B894`; its precise trigger remains unspecified. [Cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflashexplode.c#L57-L66), [event adapter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflashexplode.c#L167-L170).

### Initialization and charge scaling

Initialization enters state 0 with ITEM_ANIM_UPDATE, passes 1024.0f to a shared helper, resets the scale cache, advances animation and immediately invokes the animation callback without consuming its return value. Charge divided by FLASH_EXPL_HITBOX_SIZE_MUL selects four ordered branches: strictly above 0.84999996f requests Medium quake and helper arguments (0xE, 0x14); above 0.65f requests Small quake and (0xD, 0xF); above 0.45f uses (0xC, 0xA); otherwise (0xB, 5). Equality falls to the lower tier. Camera values 3 and 2 are enum identifiers, not measured amplitudes. No local denominator validation or charge clamp is present. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflashexplode.c#L68-L98), [quake enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/forward.h#L57-L64).

Animation computes uniform model scale as initial_size + charge × (growth_size − initial_size) / hitbox_size_multiplier. When command variable 2 is zero and hitbox 0 is enabled, it supplies base_damage + charge × damage_multiplier to `it_80272460`, then sets the latch to one. A zero-valued cache is seeded from the current hitbox scale; the hitbox scale becomes that cache multiplied by model scale. The zero sentinel can permit repeated capture if the cached value remains zero. Completion returns true exactly when `it_80272C6C` returns false. [Animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflashexplode.c#L100-L134).

### Physics and interactions

Physics clears Y and Z velocity only: the chained assignment repeats Z and never writes X. Thus zero initial velocity does not establish that this callback suppresses all later movement. Collision always returns false. Clanked, Absorbed, ShieldBounced and HitShield each ignore the object and return true without local mutations; their dispatcher-level consequences are not proved by these bodies. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itnesspkflashexplode.c#L136-L165).

### Review outcome

All 32 subjects, 69 facts and 19 links were reviewed. The checkpoint retains 61 facts and 18 links, supersedes one overbroad physics explanation, and leaves seven facts and one link unresolved. No compiled section extent or literal-pool placement is asserted. Both owned files were read completely in canonical and rendered form. The header renderer leaves the spawn declaration unchanged with `shadowed_binding`, although its implementation is rendered with the supported Spawn name; this is a rendering discrepancy, not grounds for changing the name.

Status: synthesized; independent review and live promotion pending.
