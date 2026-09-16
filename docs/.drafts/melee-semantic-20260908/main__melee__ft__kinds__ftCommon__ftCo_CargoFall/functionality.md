# Airborne cargo carry

Draft at `c302741689bd67c361cd7faadb221df3193992c3`.

`ftCo_8009BC58` enters carrier motion base plus six with KeepFastFall, frame zero, speed one and zero blend. It then sets animation rate zero, converts the carrier to airborne handling only if currently grounded, and invokes the victim ShoulderedWait updater. That updater leaves an already-ShoulderedWait victim untouched. The entry assumes valid cargo attributes and victim pointers. KeepFastFall bypasses the ordinary fast-fall clear, while the animation-freeze flag remains clear, so the rate setter applies zero to both animation hierarchies and frame_speed_mul.

CargoWait collision can dispatch this entry, and CargoWait2 recovery selects it when still airborne. The Donkey ThrowFFall state table installs these four callbacks. Anim does nothing. IASA calls the shared directional cargo-throw selector once; RETURN_IF has no lower-priority checks to suppress here. The selector requires an A-or-B press and directional thresholds; horizontal direction wins over vertical, choosing forward/back by facing, otherwise up/down. A changed selection enters the carrier throw state with an air offset when appropriate and synchronizes the victim thrown state.

Phys calls the same ft_80084DB0 used by ordinary Fall. It checks fast-fall, applies fast-fall or gravity/terminal speed, then delegates remaining aerial movement. Coll calls ft_80082C74 with CargoLanding entry; the shared collision result decides whether to invoke that callback. CargoLanding copies character landing lag, selects base plus eight, freezes animation and keeps the victim shouldered. Its Anim checks the timer before decrementing it; a nonpositive timer enters CargoWait, then the function still executes its decrement.

The header agrees with all five definitions. The zeroed local array is stack/matching scaffolding without a gameplay role. Existing canonical callback names remain; only the anonymous entry carries an inferred alias.

## Literal pool and links

Both existing objects contain eight bytes `000000003f800000` (f32 zero and one). Source object flags are WRITE|ALLOC and split object flags ALLOC only. The local code reads the literals, but that fact does not prove nonwritable sections or final runtime protection. Report hash matches the frozen manifest; no build ran.

All 11 outgoing records are individually retained, with original endpoints, roles, rationale and locator preserved plus current canonical evidence. No links are written or deleted.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoFall.c#L16-L43
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoLanding.c#L1-L44
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoThrow.c#L24-L118
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Shouldered.c#L28-L41
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L490-L514
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1072-L1076
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1100-L1103
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1235-L1244
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L549-L556
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L217-L227
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L203-L206
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L38-L59
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoWait.c#L30-L40
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CargoWait.c#L66-L69
