## Dr. Mario fighter initialization and integration

The source defines a five-entry costume array, ten motion-state descriptors, fighter and animation archive names, four demo resource names, and five costume resource triplets. The first two motion entries use Dr. Mario appeal callbacks; the remaining eight use shared Mario ground/air callbacks for neutral, side, up, and down special. All ten use the common camera-box updater. These are source-level declarations, not proof of compiled section boundaries or sizes. The header declares the callbacks and exported data consistently with the implementation.

### Loading and persistent state

`ftDr_Init_OnLoad` obtains Fighter data without null guards, captures the item descriptor array, invokes Mario's Dr. Mario attribute initializer, then registers `items[1]` as `It_Kind_DrMario_Vitamin` and `items[3]` under attribute `x14`. The registration helper writes an article-table entry; it does not spawn an item. `ftDr_Init_LoadSpecialAttrs` delegates to Mario's attribute loader.

`ftDr_Init_OnDeath` calls `ftParts_80074A4C(gobj, 0, 0)` and clears tornado charge, cape boost, cape object, and `x2240`. It does not itself destroy either stored item. The neighboring appeal implementation identifies `x2240` as the tracked taunt pill, strengthening older descriptions that left this field unidentified.

### Taunt entry and cross-file pill lifetime

The common D-pad-up dispatcher selects `ftDr_Init_80149910` for Dr. Mario. Its common selector disables interruption, chooses AppealSL only for facing direction exactly -1 with the left animation resource available, otherwise falls back to AppealSR, and enters at frame 0, rate 1, blend 0. The Dr. Mario helper subsequently sets command variables 0 and 1 to 1 and 0.

The appeal animation spawns a randomized vitamin when command 0 equals 1 and no pill is tracked. Only successful creation installs `ftDr_Init_80149540` in both damage and secondary-death callback slots. Command 2 invokes cleanup; animation completion also removes the pill, clears callbacks, and exits the appeal. Failed creation leaves the successful-spawn callbacks uninstalled and can be retried while the spawn condition persists.

`ftDr_Init_80149540` delegates to `ftDr_Init_801497CC`. The latter tolerates null objects and missing Fighter data, conditionally calls item teardown, clears `x2240`, and clears both callback slots whenever Fighter data exists, even if no pill exists. Item teardown clears its tracked-parent field before common removal. In contrast, `ftDr_Init_801498A0` only clears fighter bookkeeping and never destroys the item. The item-side notification calls that helper only when its tracked parent still equals its owner, then clears its own parent and accessory callback.

`ftDr_Init_80149844` is a read-only invalidity predicate: false requires an object, Fighter data, `motion_id` equal to literal 0x155 or 0x156, and nonzero `x2240`. The source table identifies 341/342 as the directional appeal state entries; these must not be confused with the table's submotion identifiers. The predicate does not test identity of the tracked pill or reciprocal owner equality. The item consumer separately checks ownership and can request removal even after the predicate returns false.

`ftDr_Init_801498EC` returns command variable 1 or zero for missing object/Fighter data. The appeal item applies its previously stored command value to child-model visibility before refreshing it through this getter: exactly 1 reveals the child; every other value hides it. Scale synchronization additionally requires matching owner. Exact script-event timing beyond this source ordering remains unrecovered.

### Shared event adapters

Pickup and drop forward the incoming boolean and fixed arguments 1,1. Shared pickup handling excludes heavy items, selects presentation by hold kind, and conditionally performs the catch visibility operation. Drop resets the hold presentation and conditionally performs the hide operation. Visible/invisible callbacks pass 1 and their shared implementations exclude heavy items.

Knockback entry and exit pass integer selector 1, not an established boolean enable flag. Their shared inlines call `ftAnim_800704F0` for selectors 1 and 0, using 3.0f on entry and 0.0f on exit. The character wrappers contain no local guards or direct Fighter-field writes.

### Naming and evidence limits

Rendered substitutions were reviewed as hypotheses. Canonical callback installation independently supports the OnTakeDamage hypothesis, including its secondary-death use; canonical callers support the removal predicate, association clearer, getter, and AppealS entry interpretations. Exact original spellings are not proven. No compiled artifacts were supplied, so the claimed 944-byte `.data` extent and `.sdata2` payload classification remain unresolved.

Status: synthesized; independent review and live promotion pending.
