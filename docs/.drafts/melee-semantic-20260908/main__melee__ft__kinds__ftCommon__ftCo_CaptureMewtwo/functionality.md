# CaptureMewtwo Setup

Revision `c302741689bd67c361cd7faadb221df3193992c3`. This unit initializes the captured fighter for Mewtwo's grounded or aerial Confusion move. Both entry points use the same inline helper and differ only in the chosen CaptureMewtwo/ThrownMewtwo motion pair.

## Argument Roles and State Flow

The first argument is the captured fighter, the second is Mewtwo. This is verified through registration into `grabbed_cb` and the dispatcher call `grabbed_cb(victim_gobj, gobj)`; the local second-argument name `victim_gobj` is misleading in isolation. [Dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L2589-L2604).

Shared setup runs prior-state helpers, saves Mewtwo in x1A5C and victim_gobj, clears two capture bits, copies facing and establishes an XRotN constraint against Mewtwo's TransN2 joint. It enters CaptureMewtwo or CaptureMewtwoAir with frame zero, speed one and blend zero. Both paths then set GA_Air, jumpsUsed one and ECB lock ten, set x1A6A to 0x1FF, update animation and reset velocity fields. Grounded therefore names the initiating move variant, not the victim's resulting ground/air state. [Shared helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureMewtwo.c#L15-L46) and [airborne setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525).

The final call immediately enters ThrownMewtwo or ThrownMewtwoAir on the same captured fighter. That initializer chooses FreezeState only when x2222_b6 is set, resets capturekoopa.x0, refreshes facing and installs ftCo_800DE508 as accessory1_cb. The callback computes position from XRotN plus scaled offsets and sets Z to zero. The Capture rows have no submotion or ordinary action callbacks; the Thrown rows select their corresponding animation with empty ordinary callbacks. [Thrown setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ThrownMewtwo.c#L16-L28), [position callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Thrown.c#L48-L59), [active rows](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L3445-L3488).

## Constants and Coverage

The eight-byte .sdata2 pool contains 0.0F and 1.0F. Both existing objects agree on bytes, while split-object flags are ALLOC and source-object flags are ALLOC|WRITE. The assembly loads the literals in each expanded wrapper. The one proposed fact correction distinguishes load-only use from ELF permissions. [Object/report evidence](data-corroboration.json).

All 58 owned C/header lines, three targets, one source entity and four parameter entities are reviewed. Parameter inventories are empty. Static inline doEnter has no separate manifest target and is covered in its owning source. Seven exact outgoing relationships are supported, including duplicate historical records.

## Canonical and Rendered Snapshots

- [src/melee/ft/kinds/ftCommon/ftCo_CaptureMewtwo.c 1-48](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_CaptureMewtwo/pages/src__melee__ft__kinds__ftCommon__ftCo_CaptureMewtwo.c.1-48.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_CaptureMewtwo.h 1-10](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_CaptureMewtwo/pages/src__melee__ft__kinds__ftCommon__ftCo_CaptureMewtwo.h.1-10.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_ThrownMewtwo.c 1-45](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_ThrownMewtwo/pages/src__melee__ft__kinds__ftCommon__ftCo_ThrownMewtwo.c.1-45.json>)
- [src/melee/ft/kinds/ftMewtwo/ftmewtwospecials.c 35-99](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftMewtwo__ftmewtwospecials/pages/src__melee__ft__kinds__ftMewtwo__ftmewtwospecials.c.35-99.json>)

Additional bounded source ranges and hashes are in [supplemental-canonical.json](supplemental-canonical.json).
