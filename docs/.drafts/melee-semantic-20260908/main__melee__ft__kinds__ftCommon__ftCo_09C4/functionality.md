# Cargo platform drop

Draft at `c302741689bd67c361cd7faadb221df3193992c3`.

The public predicate `ftCo_8009C4F8` delegates to the common Pass input test. That test requires left-stick Y at or below the negative common threshold, tilt age strictly below its threshold, and a platform floor flag. Failure returns false without a local transition. Success invokes the private entry helper and returns true. CargoWait and CargoWalk IASA call this after two higher-priority tests and stop lower-priority dispatch when it succeeds.

`ftCo_8009C540` reads the carrier from gobj, enters cargo motion base plus six through the common Pass setup with no preservation flags and frame zero, requests animation rate zero, and sends victim_gobj to the ShoulderedWait updater. The sibling CargoFall routine uses the same base-plus-six slot. Donkey state-table entries attach CargoWait and CargoFall callbacks to the corresponding carry states.

The Pass helper makes the carrier airborne, clamps horizontal drift, assigns common x46C to self_vel.y, changes motion at speed one, records the current floor as floor_skip, and sets tilt age to 0xFE. Motion entry clears x2223_b0; only FreezeState re-enables it in the inspected setup, and this caller passes no flags. Therefore the subsequent zero-rate request reaches the active rate setter, which writes both animation hierarchies and frame_speed_mul. The rate API can defer in other contexts; that does not require changing the existing fact for this call.

The victim updater is idempotent when the victim already occupies ShoulderedWait. Otherwise it changes the victim state, using its linked carrier as alternate animation source, then applies common shouldered setup and accessory callback. The local executor assumes valid cargo attributes and victim pointers; it has no local eligibility or null guard. The zeroed 16-byte local array is not gameplay state.

The header exposes only the Boolean predicate. A static forward declaration gives the entry helper internal linkage despite the unadorned definition. Existing inferred names and the source-module alias remain hypotheses.

The .sdata2 claim is corroborated by existing object bytes, the frozen report hash and the two zero arguments. No build was run.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_09C4.c#L11-L28
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Pass.c#L26-L36
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Pass.c#L76-L87
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Shouldered.c#L28-L41
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L490-L514
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L457-L460
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mp/mpcoll.c#L4502-L4510
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoWait.c#L52-L59
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoWalk.c#L42-L49
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoFall.c#L16-L29
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L151-L161
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L217-L227
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1068-L1078
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1223-L1246

Existing compiled .sdata2 is 4 bytes; extracted object/report section is 8 bytes. The assembly explicitly labels the latter as one four-byte zero float plus a separate four-byte gap. No second semantic constant or section parity is claimed. Both entry-helper float loads reference the same zero literal.
