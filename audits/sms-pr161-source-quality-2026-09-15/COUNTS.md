# Occurrence Counts for SMS PR #161

Audited head: `f37da262e537d5cc4e8a2e15ae311370a0d67039`

Static source sites, not runtime executions, worker attempts, or independent score gains. Counting units differ; do not sum the rows. Pre-existing issues and excluded review candidates are outside these counts.

All 19 findings have a count below. Counts cover the retained instances established by this audit, not a claim that a general-purpose lint has found every possible similar construct in the repository.

| ID | Finding | Count | Unit and Extent |
| --- | --- | ---: | --- |
| [F01](REPORT.md#f01) | Return a Reference to a Destroyed Local | 1 | helper definition; 1 file |
| [F02](REPORT.md#f02) | Invent Class Layouts and Allocate the Wrong Size | 54 | wrong-size allocation site; 1 file |
| [F03](REPORT.md#f03) | Index Across Scalar Members as if They Were an Array | 1 | out-of-bounds expression; 1 file |
| [F04](REPORT.md#f04) | Disable a Header and Substitute a Different TTakeActor | 1 | class substitution; 1 file |
| [F05](REPORT.md#f05) | Macro-Rename a Library Class to Insert a Conflicting Copy | 1 | class substitution; 1 file |
| [F06](REPORT.md#f06) | Replace the Pollution Header with a Different Local Class | 1 | class substitution; 1 file |
| [F07](REPORT.md#f07) | Discard strcmp Results to Emit Constructor Labels | 15 | discarded strcmp call; 1 file |
| [F08](REPORT.md#f08) | Add an Uncalled Dummy to Force Constants and Vtables | 1 | uncalled helper; 1 file |
| [F09](REPORT.md#f09) | Create an Unused Array to Reproduce Missing Factory Strings | 1 | unused string array; 1 file |
| [F10](REPORT.md#f10) | Put a Discarded String Literal in an Empty Function | 1 | discarded literal expression; 1 file |
| [F11](REPORT.md#f11) | Cast an Ordinary Flag to Volatile to Force Reloads | 7 | flag-check/update pair; 1 file |
| [F12](REPORT.md#f12) | Use a Volatile Base-Class View for One Holder Test | 1 | volatile cast expression; 1 file |
| [F13](REPORT.md#f13) | Add an Unused Matrix Solely to Enlarge the Frame | 1 | unused matrix declaration; 1 file |
| [F14](REPORT.md#f14) | Add an Unused Vector Solely to Move Stack Slots | 1 | unused vector declaration; 1 file |
| [F15](REPORT.md#f15) | Enlarge a 3x4 Matrix to 4x4 for a Small Partial Gain | 1 | widened matrix declaration; 1 file |
| [F16](REPORT.md#f16) | Invent a Negation Helper for Only One Operand | 1 | synthetic helper definition; 1 file |
| [F17](REPORT.md#f17) | Route a Fixed sqrt Through a Pointer to Defeat Inlining | 2 | fixed function-pointer call site; 1 file |
| [F18](REPORT.md#f18) | Replace Simple Two-Value Tests with Goto Networks | 2 | control-flow rewrite; 1 file |
| [F19](REPORT.md#f19) | Spell Addition as Subtraction of a Negation | 1 | subtraction-of-negation expression; 1 file |

The largest repeated groups are F02 with 54 wrong-size allocations across 45 local classes, F07 with 15 discarded comparisons, and F11 with seven flag-check/update pairs containing 14 volatile casts. F04-F06 together are three class substitutions; F13-F14 together are two unused aggregate declarations.

<a id="f01"></a>
## F01: Return a Reference to a Destroyed Local

**1 helper definition.** One invalid helper definition, called once at line 106. Definition and use are not counted as two independent defects.

| Occurrence | Location |
| --- | --- |
| scaleVector | [src/Player/Tongue.cpp:27](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/Player/Tongue.cpp#L27) |

<a id="f02"></a>
## F02: Invent Class Layouts and Allocate the Wrong Size

**54 wrong-size allocation site.** 54 allocation sites across 45 newly declared local classes: 53 undersized and one oversized. The file contains 51 new local classes used at 60 allocation sites; six classes have no size mismatch in this saved comparison and are not counted as confirmed wrong-size layouts. Three other mismatched allocations use header-owned types and are outside this finding.

Sizes below come from the saved checkpoint. The factory source differs from that checkpoint only in declaration-macro formatting, which preserves expanded definitions. The comparison includes all 140 operator-new sites; only wrong-sized allocations of newly introduced local classes enter this count.

| Class | Sites | Candidate Bytes | Target Bytes | Source Lines |
| --- | ---: | --- | --- | --- |
| TAmiNoko | 1 | 0x150 | 0x214 | [551](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L551) |
| TAmiNokoManager | 1 | 0x54 | 0x60 | [548](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L548) |
| TAnimalBird | 1 | 0x154 | 0x184 | [257](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L257) |
| TAnimalBirdManager | 1 | 0x60 | 0x54 | [260](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L260) |
| TBeeHive | 1 | 0x150 | 0x1c0 | [278](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L278) |
| TBombHei | 1 | 0x150 | 0x1a8 | [539](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L539) |
| TBombHeiManager | 1 | 0x54 | 0x64 | [536](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L536) |
| TCannon | 1 | 0x150 | 0x2b4 | [533](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L533) |
| TCannonManager | 1 | 0x54 | 0x60 | [530](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L530) |
| TChuuHanaManager | 1 | 0x54 | 0x64 | [476](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L476) |
| TEffectEnemy | 1 | 0x150 | 0x198 | [320](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L320) |
| TEffectEnemyManager | 1 | 0x54 | 0x60 | [317](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L317) |
| TElecNokonoko | 1 | 0x150 | 0x1b4 | [437](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L437) |
| TElecNokonokoManager | 1 | 0x54 | 0x64 | [434](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L434) |
| TFruitsBoat | 4 | 0x150 | 0x178 | [227](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L227), [230](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L230), [233](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L233), [236](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L236) |
| TFruitsBoatManager | 4 | 0x54 | 0x58 | [239](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L239), [242](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L242), [245](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L245), [248](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L248) |
| THanaSambo | 1 | 0x150 | 0x1e4 | [389](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L389) |
| THanaSamboManager | 1 | 0x54 | 0x60 | [386](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L386) |
| TKazekun | 1 | 0x150 | 0x1d4 | [625](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L625) |
| TKazekunManager | 1 | 0x54 | 0x60 | [622](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L622) |
| TKiller | 1 | 0x150 | 0x210 | [545](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L545) |
| TKillerManager | 1 | 0x54 | 0x60 | [542](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L542) |
| TKukku | 1 | 0x150 | 0x1b4 | [607](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L607) |
| TKukkuManager | 1 | 0x54 | 0x64 | [604](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L604) |
| TPakkun | 1 | 0x150 | 0x1c0 | [380](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L380) |
| TPakkunManager | 1 | 0x54 | 0x6c | [377](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L377) |
| TPopo | 1 | 0x150 | 0x240 | [410](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L410) |
| TPopoManager | 1 | 0x54 | 0x6c | [407](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L407) |
| TPukuPuku | 1 | 0x150 | 0x1f4 | [503](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L503) |
| TRocketManager | 1 | 0x54 | 0x6c | [521](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L521) |
| TSamboFlower | 1 | 0x150 | 0x170 | [404](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L404) |
| TSamboFlowerManager | 1 | 0x54 | 0x68 | [401](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L401) |
| TSamboHead | 1 | 0x150 | 0x1b4 | [395](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L395) |
| TSamboHeadManager | 1 | 0x54 | 0x60 | [392](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L392) |
| TSeal | 1 | 0x150 | 0x154 | [572](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L572) |
| TStayPakkun | 1 | 0x150 | 0x1c0 | [383](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L383) |
| TTabePuku | 1 | 0x150 | 0x1f0 | [512](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L512) |
| TTabePukuManager | 1 | 0x54 | 0x60 | [509](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L509) |
| TTobiPuku | 1 | 0x150 | 0x1f4 | [506](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L506) |
| TTobiPukuLaunchPad | 2 | 0x150 | 0x1ac | [488](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L488), [494](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L494) |
| TTobiPukuLaunchPadManager | 2 | 0x60 | 0x64 | [485](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L485), [491](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L491) |
| TTobiPukuManager | 2 | 0x54 | 0x60 | [497](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L497), [500](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L500) |
| TWireTrap | 1 | 0x150 | 0x184 | [518](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L518) |
| TYumbo | 1 | 0x150 | 0x1dc | [527](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L527) |
| TYumboManager | 1 | 0x54 | 0x64 | [398](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Enemy.cpp#L398) |

[All 140 allocation comparisons](evidence/allocation-count-evidence.json).

<a id="f03"></a>
## F03: Index Across Scalar Members as if They Were an Array

**1 out-of-bounds expression.** One out-of-bounds member access in MarioWaistCtrl. The pointer declaration is supporting code, not a second occurrence.

| Occurrence | Location |
| --- | --- |
| unk[2] | [src/Player/MarioDraw.cpp:481](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/Player/MarioDraw.cpp#L481) |

<a id="f04"></a>
## F04: Disable a Header and Substitute a Different TTakeActor

**1 class substitution.** One replacement class. The guard override, copied body, and out-of-line destructor are parts of the same substitution.

| Occurrence | Location |
| --- | --- |
| TTakeActor header suppression and replacement | [src/System/MarNameRefGen_MapObj.cpp:1](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L1) |

<a id="f05"></a>
## F05: Macro-Rename a Library Class to Insert a Conflicting Copy

**1 class substitution.** One replacement class. The macro rename and local class body are parts of the same substitution.

| Occurrence | Location |
| --- | --- |
| TOrthoProj macro rename and replacement | [src/System/MarDirectorSetupObjects.cpp:8](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorSetupObjects.cpp#L8) |

<a id="f06"></a>
## F06: Replace the Pollution Header with a Different Local Class

**1 class substitution.** One local replacement class conflicting with its owning header.

| Occurrence | Location |
| --- | --- |
| TPollutionTest local replacement | [src/System/MarNameRefGen_Map.cpp:20](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_Map.cpp#L20) |

<a id="f07"></a>
## F07: Discard strcmp Results to Emit Constructor Labels

**15 discarded strcmp call.** 15 discarded comparison calls in 15 distinct placeholder factory branches, all in one function.

| Occurrence | Location |
| --- | --- |
| MapObjFlagManager | [src/System/MarNameRefGen_MapObj.cpp:144](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L144) |
| MapObjFlag | [src/System/MarNameRefGen_MapObj.cpp:156](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L156) |
| RiccoLog | [src/System/MarNameRefGen_MapObj.cpp:345](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L345) |
| BigWindmill | [src/System/MarNameRefGen_MapObj.cpp:375](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L375) |
| MiniWindmill | [src/System/MarNameRefGen_MapObj.cpp:380](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L380) |
| MapObjRootPakkun | [src/System/MarNameRefGen_MapObj.cpp:389](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L389) |
| BiaBell | [src/System/MarNameRefGen_MapObj.cpp:394](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L394) |
| BiaWatermill | [src/System/MarNameRefGen_MapObj.cpp:399](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L399) |
| BellWatermill | [src/System/MarNameRefGen_MapObj.cpp:404](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L404) |
| BiaWatermillVertical | [src/System/MarNameRefGen_MapObj.cpp:409](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L409) |
| LeafBoat | [src/System/MarNameRefGen_MapObj.cpp:418](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L418) |
| LeafBoatRotten | [src/System/MarNameRefGen_MapObj.cpp:423](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L423) |
| LampSeesawMain | [src/System/MarNameRefGen_MapObj.cpp:428](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L428) |
| LampSeesaw | [src/System/MarNameRefGen_MapObj.cpp:433](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L433) |
| TelesaSlot | [src/System/MarNameRefGen_MapObj.cpp:559](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L559) |

<a id="f08"></a>
## F08: Add an Uncalled Dummy to Force Constants and Vtables

**1 uncalled helper.** One uncalled helper containing two vector stores and three explicit destructor calls. Those five statements are not five independent helper defects.

| Occurrence | Location |
| --- | --- |
| dummy | [src/System/MarNameRefGen_MapObj.cpp:82](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_MapObj.cpp#L82) |

<a id="f09"></a>
## F09: Create an Unused Array to Reproduce Missing Factory Strings

**1 unused string array.** One unused array containing 72 string entries. Entries measure its extent; they are not 72 separate array defects.

| Occurrence | Location |
| --- | --- |
| bossEnemyNames | [src/System/MarNameRefGen_BossEnemy.cpp:24](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarNameRefGen_BossEnemy.cpp#L24) |

<a id="f10"></a>
## F10: Put a Discarded String Literal in an Empty Function

**1 discarded literal expression.** One discarded string-literal expression in one empty function.

| Occurrence | Location |
| --- | --- |
| getTalkMsgID discarded literal | [src/System/MarDirectorEvent.cpp:32](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L32) |

<a id="f11"></a>
## F11: Cast an Ordinary Flag to Volatile to Force Reloads

**7 flag-check/update pair.** Seven pairs in fireStreamingMovie, containing 14 volatile cast expressions. Compound assignment can perform both a read and a write; this is a source-expression count, not a machine-access count.

| Occurrence | Location |
| --- | --- |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:248](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L248) |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:258](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L258) |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:266](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L266) |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:274](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L274) |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:282](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L282) |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:290](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L290) |
| flag-check/update pair | [src/System/MarDirectorEvent.cpp:299](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MarDirectorEvent.cpp#L299) |

<a id="f12"></a>
## F12: Use a Volatile Base-Class View for One Holder Test

**1 volatile cast expression.** One volatile cast in one holder-test condition.

| Occurrence | Location |
| --- | --- |
| volatile TTakeActor view | [src/Player/MarioAccess.cpp:136](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/Player/MarioAccess.cpp#L136) |

<a id="f13"></a>
## F13: Add an Unused Matrix Solely to Enlarge the Frame

**1 unused matrix declaration.** One unused matrix in TMarioEffect::perform.

| Occurrence | Location |
| --- | --- |
| Mtx mtx | [src/Player/MarioEffect.cpp:181](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/Player/MarioEffect.cpp#L181) |

<a id="f14"></a>
## F14: Add an Unused Vector Solely to Move Stack Slots

**1 unused vector declaration.** One unused vector in TLightCommon::perform. Neighboring used Vec declarations are excluded.

| Occurrence | Location |
| --- | --- |
| Vec pos | [src/MarioUtil/LightUtil.cpp:123](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/MarioUtil/LightUtil.cpp#L123) |

<a id="f15"></a>
## F15: Enlarge a 3x4 Matrix to 4x4 for a Small Partial Gain

**1 widened matrix declaration.** One matrix widened from 3x4 to 4x4 in NozzleCtrl.

| Occurrence | Location |
| --- | --- |
| Mtx44 mtx | [src/Player/WaterGun.cpp:134](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/Player/WaterGun.cpp#L134) |

<a id="f16"></a>
## F16: Invent a Negation Helper for Only One Operand

**1 synthetic helper definition.** One helper definition, called once at line 156. The call is not counted as a second helper.

| Occurrence | Location |
| --- | --- |
| matanNegate | [src/MarioUtil/MathUtil.cpp:134](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/MarioUtil/MathUtil.cpp#L134) |

<a id="f17"></a>
## F17: Route a Fixed sqrt Through a Pointer to Defeat Inlining

**2 fixed function-pointer call site.** Two fixed function-pointer declarations, each immediately used by its distance test, in two functions.

| Occurrence | Location |
| --- | --- |
| evIsNearSameActors | [src/System/EventWatcher.cpp:195](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/EventWatcher.cpp#L195) |
| evIsNearActors | [src/System/EventWatcher.cpp:227](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/EventWatcher.cpp#L227) |

<a id="f18"></a>
## F18: Replace Simple Two-Value Tests with Goto Networks

**2 control-flow rewrite.** Two rewritten control-flow regions in two functions, containing six goto statements in total.

| Occurrence | Location |
| --- | --- |
| rsetup movie fallback | [src/System/MenuDir.cpp:129](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MenuDir.cpp#L129) |
| direct movie/stage dispatch | [src/System/MenuDir.cpp:277](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/System/MenuDir.cpp#L277) |

<a id="f19"></a>
## F19: Spell Addition as Subtraction of a Negation

**1 subtraction-of-negation expression.** One arithmetic expression in MtxToQuat.

| Occurrence | Location |
| --- | --- |
| (m[0][0] + m[1][1]) - -m[2][2] | [src/MarioUtil/MtxUtil.cpp:17](https://github.com/doldecomp/sms/blob/f37da262e537d5cc4e8a2e15ae311370a0d67039/src/MarioUtil/MtxUtil.cpp#L17) |

Full machine-readable locations and secondary counts are in [counts.json](counts.json).
