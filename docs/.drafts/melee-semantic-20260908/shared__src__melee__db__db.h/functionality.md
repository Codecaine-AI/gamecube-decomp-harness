## Shared debug interface

`src/melee/db/db.h` is a declaration-only interface for debug facilities. It defines `DbLKind` explicitly as Master=0, NoDebugRom=1, DebugDevelop=2, DebugRom=3, and Develop=4; these values alone do not establish an ordering of runtime capabilities ([canonical lines 11–17](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L11-L17)).

The declared API covers launch-button capture, setup, controller queries returning `HSD_Pad`, diagnostics and per-frame processing; item/Pokémon menus, pickup-range visualization and item-spawn controls; CPU, animation, stage and camera information; speed controls, screenshots, exception/crash handling, bonus information and allocation limiting. This describes the interface organization, not verified implementation semantics. In particular, `fn_Setup5xSpeed` retains `UNK_PARAMS` ([canonical lines 19–77](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L19-L77)).

External declarations expose the build timestamp, debug level, an unnamed boolean, three name-table pointers, a `u16` launch-button state and an integer miscellaneous-visual-effects status. Their declarations do not establish ownership, initialization, lifetime, bit meanings or compiled placement ([canonical lines 78–85](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L78-L85)).

## Semantic review

All 88 canonical and rendered lines were reviewed. The rendered view reports eight function-name substitutions and no parse errors. Four substitutions merely change range-control prefixes; the other four introduce collision-bubble or fighter-visual interpretations. None conflicts with the declared signatures, but the header cannot independently prove those behavioral interpretations ([canonical lines 29–45](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L29-L45), [lines 54–58](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/db.h#L54-L58)). No implementation branches, numeric modes or cross-file lifetimes are inferred from rendered names.

The exhaustive subject and link enumerations are empty, matching the task's zero writable subjects, zero facts and zero links. There is consequently no baseline knowledge to disposition and no supported correction to propose within this assignment.

Status: synthesized; independent review and live promotion pending.
