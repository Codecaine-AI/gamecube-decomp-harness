# Mushroom Kingdom II semantic review

Reviewed all canonical and rendered pages of `grinishie2.c` and `grinishie2.h`, all 83 subjects, 250 baseline facts, and 59 links. The checkpoint ledger explicitly retains 226 facts and all 59 links, supersedes 15 facts, and leaves nine compiled-storage claims unresolved.

## Stage organization

The unit publishes a fourteen-entry joint table, sixteen map-object callback records, and the `Gr_Kind_Inishie2` stage descriptor. Active map IDs are 0, 1, 2, 3, 4, and 15; maps 3 and 4 share callbacks, maps 5–14 have null records, and map 2 carries flags `0xC0000000`. Startup caches the externally supplied Yakumono parameter pointer, creates maps 0 and 2, **disables** the fourteen listed collision joints, initializes camera and blast-zone ranges, and supplies camera constants 1.0 and 4000.0. The factory installs callback3, invokes initialization synchronously, and schedules the process; it does not install callback1. Failed acquisition is reported and returned as null.

## Recurring objects

Map 2 coordinates independent signed countdowns for paired log objects 3/4, the Birdo-associated Ground object 15, and the Pidgit-associated traveling platform 1. Expiration tests the saved value before decrement against zero. An attempted creation disarms its channel even on failure; successful children receive a parent backlink after synchronous initialization.

The paired log scheduler disables joints 12/13 on its spawn attempts. Each child's own delayed process subsequently adds its collision joint, refreshes collision, and, on animation completion, rearms the corresponding channel on the persistent controller before destruction. This is not a handoff to the other log.

Birdo's Ground object chooses a side-relative spawn point and creates a Kyasarin item. Its process follows the item's position plus a configured Y offset; null item references skip translation but not collision refresh. The item retains the Ground owner. Its high-damage path separately requests joint-14 deactivation, while its destruction callback rearms the parent and destroys the Ground representation before clearing the item-side owner reference.

Pidgit's traveling platform initializes entry state and animation direction from its selected side. At animation boundaries it evaluates accumulated X against camera bounds, handles entry, early alternation, weighted reversal, and departure, and folds animation displacement into persistent position. The cycle counter increments only in the non-entry branch. Numeric boundary results assigned to the direction field are preserved without inventing a three-state animation enum. Removal requires both departure eligibility and a world-space crossing of a horizontal blast-zone edge; only then is the parent rearmed.

## Other behavior and naming

The music helper is one-shot: with an available timer below 20 seconds it maps 0x29→0x2A or 0x2B→0x2C, passes -1 otherwise, and latches completion. An unavailable timer latches without an audio call. The stage-start hook invokes the shared generator manager with a null descriptor. Empty callbacks, false predicates, the null touch-line descriptor hook, and the always-true shadow query remain explicitly retained.

Most existing names fit canonical behavior and are retained as hypotheses. The factory receives a stage-local name to distinguish its hardwired `grI2_StageCallbacks` dependency from generic Ground helpers. Rendered header bindings for the factory and touch-line hook were shadowed; this is recorded as a renderer issue, not treated as behavioral evidence.

No compiled section extent, padding, literal pooling, or placement is certified. In particular, `grinishie2.c` contains eleven characters and occupies twelve bytes including its terminator; this does not establish its containing section's size.

Status: synthesized; independent review and live promotion pending.
