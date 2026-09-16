# Round 3 NPC and UI audit

All six remaining failing owned units were read against their strict logs, current source, original linker map, and original assembly.
No shared source edits or builds were performed by this agent.
Four candidate patches require parent serial integration, strict validation, and full matching comparison before acceptance.

| Unit | Evidence and disposition |
|---|---|
| NPC/NpcBase | Proposed `round3-npc-ui-base.patch`: actual existing-body defects. Target at 0x8016B5B4 compares animation to 10, then 23; current source treats any nonzero animation as true. Target calls nerve0 and selects param0 when true, else calls nerve1 and selects param1 when true; source incorrectly combines negated conditions and always selects a parameter. Correct structure retains camera far for neither nerve. Conditional max corresponds to target's fmr/branch diamond. Correct larger inline body may restore missing weak function organically. |
| NPC/NpcColor | Proposed `round3-npc-ui-color.patch`: extract existing conditional packet dispatch into exact map-named helpers. UNUSED sizes 0x30 and 0x50; original inlined caller at 0x801771C8..1FC and 0x80177220..260 provides body evidence. This is extraction, not fabricated code. Parent must reject if caller regresses; original UNUSED binding is unknown. m2c draft for linked caller saved in `round3-npc-ui-color-m2c.txt`. |
| NPC/NpcWalkTurn | Proposed `round3-npc-ui-walk.patch`: target inlined isCanWalk at 0x8017BA88..BAC0 copies path point, computes X/Z differences, sets Y=0 through vector constructor/set, then squares. Source mistakenly subtracts full 3D vector using fabricated operator-. Natural constructor should both correct semantics and potentially restore absent local set<float>. No middleware changes. |
| NPC/NpcNerve | Lower-confidence `round3-npc-ui-nerve.patch`: const getCurrent uses existing getCurGraphIndex rather than direct field. Target at 0x80171958 and 0x80171964 calls index/graph const getters within inlined hasOnlyOneNext. Parent should test whether natural getter use restores emission; do not force emission if it doesn't. Original getter implementations already exist and are exactly lwz/blr. |
| GC2D/CardLoad | Remaining missing JSUInputStream constructor is present in middleware header but current game caller fully inlines it. Original perform at 0x8022D400 retains weak constructor call during loadBookmark, then writes derived vtables and initializes memory stream. Current source already has loadBookmark helper and same behavior. Need determine original inline nesting/threshold; no justified source-only change identified. Middleware editing or forced no-inline prohibited. |
| GC2D/Option | Three missing symbols: SMSGetMSound is existing game-header inline and gets fully inlined; JUTRect ctor likewise exists but is fully inlined. Original movementOption calls JUTRect ctor at 0x80243BCC inside inlined arrow update chain. ArrayWrapper<u32>::begin const mismatch is real type spelling discrepancy versus ArrayWrapper<const u32>, but setupToggle has map-confirmed const u32* input and tables are const; cannot safely change only specialization without correcting storage API design. No cast-away-const or artificial instantiation proposed. |

NpcColor m2c path: existing harness `toolpacks/gamecube-decomp/_impl/gamecube/m2c/m2c.py`, used read-only on isolated clone assembly.
All proposed changes stay within game code and preserve validator behavior.

## NpcWalkTurn trial disposition

Parent measured the horizontal-vector reconstruction: execWalk fell from 89.435486% to 86.951614%, while set<float> remained missing.
The source was restored.
The saved `round3-npcwalk-report.json` confirms that all other linked function percentages were unchanged, isolating the matching loss to the inlined isCanWalk expansion.
Original assembly still establishes a semantic defect: Y is passed as zero at 0x8017BA94 and the vector uses only X/Z differences at 0x8017BAA8..BAC0.
The rejected constructor source represents those semantics, but does not reproduce the original compiler's out-of-line set<float> call.
The likely unresolved factor is original inline nesting; inventing a helper solely to exceed the compiler's inline-depth threshold would not be supported by present evidence.
No second speculative source form is proposed.
This is a documented genuine source defect with an unresolved matching-preserving implementation, not a validator false positive.
