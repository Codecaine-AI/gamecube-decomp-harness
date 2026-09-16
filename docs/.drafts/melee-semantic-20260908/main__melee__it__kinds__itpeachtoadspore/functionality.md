## Toad-spore projectile

This unit implements the projectile used by Peach's Toad counterattack and Kirby's copied Peach special. The fighter callers supply their own object, a joint-derived position with Y increased by 2.5 and Z cleared, a fighter-specific item kind, and facing direction.

`it_802BE214` creates the item and returns NULL on failure without initialization or debug setup. On success, `it_802BE2E8` initializes it and enters state 0 before the factory invokes its debug helper. Initialization assigns ownership, calls the lifetime helper with 60.0, clears the script variable, and samples speed and angle separately. Velocity is `facing * speed * sin(angle)` on X and `speed * cos(angle)` on Y, with `angle = (pi - range)/2 + range * random`. Both branches of the item-kind test spawn effect 0x4D3.

The single authored state-table entry selects animation and physics callbacks with a null collision callback. A nonzero script variable requests termination immediately, without decrementing the timer. Otherwise animation decrements the timer, clamps nonpositive values to zero, and returns true on expiration. Physics unconditionally multiplies X and Y velocity by the configured decay factor; the source does not establish the factor's numeric range.

Damage dealt, clanking, shield contact, and absorption synchronously remove owner-keyed effects and return true. Shield bounce forwards the shared helper's result unchanged. Reflection saves and restores remaining lifetime around shared processing and returns false. Reference invalidation clears matching relationships through the common helper, without locally changing motion or lifetime. The outer item scan may nevertheless separately remove an owned item when its x13 flag is set.

The existing Spawn, Init, and EvtRemoveReference hypotheses fit canonical behavior. The state-table name is retained as semantic identification of the authored table, not a compiled-section extent claim. No equivalent-wording replacements are proposed. Five .sdata2 facts and its concept link remain unresolved because source literals do not prove compiled pool placement.

Canonical anchors: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itpeachtoadspore.c#L18-L153; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L474-L524; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L244-L283.

Status: synthesized; independent review and live promotion pending.
