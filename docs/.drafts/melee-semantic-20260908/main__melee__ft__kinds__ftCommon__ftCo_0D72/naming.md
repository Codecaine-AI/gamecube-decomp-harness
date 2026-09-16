# Naming Decisions

| Subject | Canonical | Existing Hypothesis | Decision |
|---|---|---|---|
| Function | ftCo_800D72A0 | ftCo_JumpAerialF1_IsMotion | Retain as descriptive hypothesis. Current caller verifies aerial-jump gating and body verifies motion membership. |
| Source | src/melee/ft/kinds/ftCommon/ftCo_0D72.c | None | Empty fact inventory reviewed. |
| Parameter | ftCo_800D72A0#r3 | None | Empty fact inventory reviewed; sole Fighter* argument. |

The original function name is not attested. Neither the include of ftCo_Attack100.h nor imported comments determine this function's gameplay role. The canonical caller supplies that evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0D72.c#L4-L19 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_JumpAerialF1.c#L57-L79.
