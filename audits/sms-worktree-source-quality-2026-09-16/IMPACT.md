# Lint Impact on Retained SMS Integrations: Verified

Companion to REPORT.md Part 4. The composed scan (global `source_fidelity`, SMS `sms_baseline` and `sms_fidelity`, engine `review_lint/api`) was replayed over all 1,046 retained SMS integrations (evidence/all-integrations.json, evidence/impact-raw.json, both md5-identical to the /tmp replay inputs). Every error finding in the 99 rejected rows was opened in its post-change tree (`qa_tree/<file>` at the reported line) and labeled true positive or false positive against the REPORT.md 4.2 definitions. Legacy rules rescoped to C only (`bare_local_prototype`, `sms_name_change_requires_review`, `packed_string_blob`, `address_named_static_data`, `pointer_offset_arithmetic`) are excluded throughout.

Two adjustments are reported. "Label only" drops findings that are false positives and keeps every remaining error at the severity the engine emits today. "4.2 severities" additionally applies the tiers REPORT.md 4.2 asked for: `m2c_goto_label` is a warning in `.cpp`, a single-use `static inline` is never an error, and `unused_static_data` is a warning on function-target attempts. The 4.2 column is the number that matters for the proposed rule set; the label-only column shows how much of the gap is severity rather than detection.

## 1. Headline

| Measure | Baseline (replay) | Label only | 4.2 severities |
| --- | --- | --- | --- |
| Integrations scanned | 1,046 | 1,046 | 1,046 |
| Rows rejected | 99 | 92 | 75 |
| Rejected, PR era / worktree era | 25 / 74 | 24 / 68 | 18 / 57 |
| Exact matches lost | 51 | 48 | 43 |
| Exact lost, function / section | 25 / 26 | 22 / 26 | 17 / 26 |
| Section targets rejected (of 81) | 43 | 43 | 43 |
| Gain points lost (of 9,143.5) | 2,760.9 | 2,656.5 | 2,487.8 |
| Gain points lost, section / function | 2,005.7 / 755.2 | 2,005.7 / 650.8 | 2,005.7 / 482.1 |
| Share of lost rows that are section targets | 43% | 47% | 57% |
| Share of lost exact matches that are section targets | 51% | 54% | 60% |
| Share of lost points that are section targets | 73% | 76% | 81% |

Era split under 4.2 severities: PR era loses 18 rows, 10 exact (3 function, 7 section), 194.6 points. Worktree era loses 57 rows, 33 exact (14 function, 19 section), 2,293.2 points.

Finding level: 429 error findings were verified. 420 are the construct the rule targets. 9 are false positives (8 `sms_fabricated_marker` static-inline hits on multi-statement helpers, 1 `volatile_local_tactic` hit that mirrors an upstream idiom). No regex misread produced a false rejection on its own; the 24 rows that leave the rejected set do so because of the 4.2 severity tiers (8 of those 24 were recorded exact: rows 23, 128, 397, 806, 831, 963, 1013, 1037).

Every one of the 43 section-target rejections stands under both adjustments. Not one section target was rescued by verification.

## 2. Per-rule verification

Findings are counted once per (rule, file, line). "Rows" is rows in which the rule fired at least once. "Sole cause" is rows where, under 4.2 severities, this rule was the only error tier rule that fired (pragma double-reports, alias double-reports and PCH-string double-reports are folded into one construct).

| Rule | Findings | TP | FP | Tier per 4.2 | Rows | Sole cause | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| unused_static_data | 149 | 149 | 0 | E on section targets (130), W on function targets (19) | 34 | 13 | Every flagged name has exactly one occurrence in the TU (its definition). 23 of the names also appear in symbols.txt as `scope:local` data (killer_bastable, tinkoopa joint tables, sRadius, mGrowStartFrame, gateMActorNames and others), so they are map-verified data whose consumer is not decompiled. Still inert emission by the 4.2 definition. |
| mangled_symbol_in_source | 94 | 94 | 0 | E | 12 | 10 | 91 hand-mangled `mMember__NTClass` definitions in MoveBG and Enemy `.sdata` rows, 2 `extern "C" {` blocks, 1 hand-mangled `extern "C"` prototype used as `(u8*)showGPR__12JUTExceptionFP9OSContext + 0x18` in a `.data` table (row 407). |
| discarded_expression | 52 | 52 | 0 | E | 7 | 7 | 27 `(void)<float>;` in one BathtubKiller nerve, 15 `strcmp(name, "...");` pure calls in MarNameRefGen_MapObj, 6 `(void)"<TClass>";` in MarNameRefGen, `(void)180.0f;`, `(void)"\x83..."` in an empty body, 2 `(void)x.member;`. |
| sms_pch_string_convention | 31 | 31 | 0 | E | 15 | 7 | Hand copies of `dummyMactorStringValue1`, `SMS_NO_MEMORY_MESSAGE`, `MtxCalcTypeName`, one guard predefine, two renamed copies (`unk1937`, `unk2322`). The headers `System/DummyStrings.hpp` and `M3DUtil/InfectiousStrings.hpp` exist in the checkout. |
| sms_fabricated_marker | 24 | 16 | 8 | pragma forms E (6); static inline W (10 TP, 8 FP) | 22 | 0 | Pragma hits duplicate `codegen_pragma`. Static-inline hits on one-expression wrappers (matanNegate, getConsole, isWaterSurface, dotProduct, getParamName and 5 more) are the 4.2 `single-use-wrapper` construct, warning tier. The 8 FP are multi-statement helpers (doThing x2, startDisappearBalloonImpl, makeRotZMtx, loadAfterInPollution x2, readOptionSector, getManagerByNameInline) that are plausible lost inlines, not trivial wrappers. |
| sms_dummy_stack_padding (error tier) | 21 | 21 | 0 | E | 15 | 15 | 15 unreferenced aggregate locals (`Mtx`, `Mtx44`, `TVec3`, `TVec2`, `Vec`, `u32[2]`, `JUTRect`), 6 discarded `JGeometry::TVec3<f32>();` constructor statements, 1 unused scalar (`iVar1`), 1 unused pointer (`tmp2`). Reference counts re-checked inside each function: all zero. |
| volatile_local_tactic | 16 | 15 | 1 | E | 3 | 2 | 14 `*(volatile u16*)&unk4C` casts in one MarDirectorEvent function, 1 `(volatile TTakeActor*)gpMarioOriginal`. FP: `volatile f32 f = v.y * estimate;` under a TODO in enemy.cpp, the same idiom upstream uses in `THitActor::calcEntryRadius` (`volatile f32 f = rad2 * __frsqrte(rad2);`). |
| m2c_goto_label | 14 | 14 | 0 | W | 5 | 0 | MenuDir label networks (2 rows), Yoshi `goto selected` switch, MapObjLib `goto demo`/`not_demo` (F18), ObjModel `goto found_data` out of a search loop. All real gotos; 4.2 keeps them as warnings with the "find the inline" hint. |
| codegen_pragma | 11 | 11 | 0 | E | 6 | 5 | 9 unmarked `#pragma dont_inline on/off` pairs (BathtubKiller x2, MapObjRailBlock, MapObjCorona, MapEventSink), 2 `#pragma force_active on/off` (WaterGun). Row 718 carries a prose comment but not the `fabricated`/`TODO`/`fakematch` marker 4.2 requires. |
| manual_vtable | 7 | 7 | 0 | E | 1 | 0 | killer.cpp: 6 hand-written `__vt__*` arrays plus `killer_vtable_padding[16]`. |
| header_override_macro | 5 | 5 | 0 | E | 5 | 4 | 2 guard predefines (`STRATEGIC_TAKE_ACTOR_HPP`, `SYSTEM_DUMMY_STRINGS_HPP`), 2 include renames (`TOrthoProj`, `TRiccoHookManager`), 1 declaration rewrite (`#define inv_sqrt inv_sqrt(f32); static f32 inv_sqrt_inline`). |
| define_alias | 3 | 3 | 0 | E | 3 | 0 | Same three macro lines as `header_override_macro`. |
| dangling_ref_return | 1 | 1 | 0 | E | 1 | 1 | `static inline const TVec3<f32>& scaleVector(TVec3<f32> vector, f32)` returns `vector` (row 190, Tongue.cpp). |
| novel_pragma | 1 | 1 | 0 | E | 1 | 1 | `#pragma inline_depth(2)` in CameraChange.cpp; 4.2 keeps `inline_depth` at E even with the adjacent TODO. |
| Total | 429 | 420 | 9 | | 99 | 65 | 10 further rows under 4.2 have two or more error tier rules on the same construct family. |

## 3. Exact matches truly lost (4.2 severities, 43 rows)

"Path to keep it" is the least invasive change that would make the row pass the proposed rules without changing the bytes it produced, or "no legitimate path: fake" where the construct exists only to emit bytes.

| Commit | Era | Unit and symbol | Before to after | Rule(s) | Construct | Path to keep it |
| --- | --- | --- | --- | --- | --- | --- |
| 22b3c3b | pr | System/MarNameRefGen_MapObj::.rodata | 93.28 to 100 | discarded_expression | 15 `strcmp(name, "...");` statements under "not yet declared" TODOs | Declare the missing classes (TMapObjFlagManager, TWoodLog and others) in their headers and restore the `new` branches; no marker path |
| da9c92d | pr | System/MarNameRefGen_BossEnemy::.rodata | 42.72 to 100 | sms_pch_string_convention, unused_static_data | Hand-copied PCH strings, cDirtyFileName/cDirtyTexName, unreferenced bossEnemyNames[] | Include M3DUtil/InfectiousStrings.hpp; include the header that emits the pollution texture strings; decompile the consumer of bossEnemyNames or drop it |
| 711ad8e | pr | System/MarNameRefGen_BossEnemy::.sdata2 | 65.96 to 100 | unused_static_data | Unreferenced `cBossEnemyKoopa[]`, `cBossEnemyZero[]` and similar literals | Declare the boss classes so the `strcmp` branches that use these literals exist; otherwise no legitimate path: fake |
| 31f53f2 | pr | System/MarDirectorSetupObjects::.rodata | 98.82 to 100 | header_override_macro, define_alias | `#define TOrthoProj TOrthoProjWithDefaultName` around a JDrama include | Fix the TOrthoProj constructor default name in the owning JDrama header (needs H6) |
| 3d33a21 | pr | MarioUtil/LightUtil::perform__12TLightCommonFUlPQ26JDrama9TGraphics | 99.86 to 100 | sms_dummy_stack_padding | Unused `Vec pos;` | Find the inline that owned the Vec; otherwise leave nonmatching per upstream AGENTS.md |
| 15b3731 | pr | Player/MarioEffect::perform__12TMarioEffectFUlPQ26JDrama9TGraphics | 99.97 to 100 | sms_dummy_stack_padding | Unused `Mtx mtx;` | Find the inline; otherwise leave nonmatching |
| f17196c | pr | System/MarDirectorEvent::.rodata | 98.60 to 100 | discarded_expression | `(void)"\x83\x6a\x83\x52...";` as the whole body of getTalkMsgID | No legitimate path: fake; recover the real getTalkMsgID body |
| d97a509 | pr | Player/MarioAccess::SMS_IsMarioOnWire__Fv | 93.83 to 100 | volatile_local_tactic | `((volatile TTakeActor*)gpMarioOriginal)->mHolder` | Find the accessor inline that reloads the field; a `// fakematch` marker does not lift a volatile cast under 4.2 |
| 491f0ec | pr | MarioUtil/MtxUtil::.rodata | 95.59 to 100 | unused_static_data | Unreferenced `static const Vec sZeroVec` | Decompile the MtxUtil function that reads it; or allow with map owner-evidence once the tuning in section 5 lands |
| e98abb8 | pr | System/MarNameRefGen_MapObj::.data | 56.65 to 100 | header_override_macro | `#define STRATEGIC_TAKE_ACTOR_HPP` guard predefine plus local `class TTakeActor` | Fix include/Strategic/TakeActor.hpp in the owner (H6) and include it |
| 3ca7ccd | worktree | GC2D/GCConsole2::processDrawTelop__11TGCConsole2FUl | 99.71 to 100 | sms_dummy_stack_padding | Unused `JUTRect textBounds(unk528->getBounds());` | Use the value in the comparison it was hoisted from; otherwise leave nonmatching |
| 5884d49 | worktree | Enemy/bosseel::updateTearsCnt__8TBossEelFv | 99.97 to 100 | sms_dummy_stack_padding | Unused `Mtx44 transform;` and `TVec3<f32> position;` | Find the inline; otherwise leave nonmatching |
| 51a9fd7 | worktree | Enemy/fireWanwan::execute__20TNerveFireWanwanTurnCFP24TSpineBase<10TLiveActor> | 99.13 to 100 | sms_dummy_stack_padding | Unused `TVec3<f32> local_68, local_74;` | Find the inline; otherwise leave nonmatching |
| e383b75 | worktree | Enemy/Kumokun::execute__23TNerveKumokunPostFreezeCFP24TSpineBase<10TLiveActor> | 99.90 to 100 | sms_dummy_stack_padding | Unused `TVec2<f32> position;` | Find the inline; otherwise leave nonmatching |
| a88e2bf | worktree | Enemy/Kumokun::execute__19TNerveKumokunFreezeCFP24TSpineBase<10TLiveActor> | 99.93 to 100 | sms_dummy_stack_padding | Unused `TVec3<f32> position;` | Find the inline; otherwise leave nonmatching |
| a84377c | worktree | Camera/cameragc::.rodata | 86.03 to 100 | unused_static_data | Unreferenced `dummyCameraBckString3[]` path literal | Decompile the camera function that loads that bck; otherwise no legitimate path: fake |
| 938e5ad | worktree | Player/ModelWaterManager::.data | 4.44 to 100 | mangled_symbol_in_source | `extern "C" void showGPR__12JUTExceptionFP9OSContext();` used as `(u8*)showGPR__... + 0x18` in a `void*` table | No legitimate path: fake (relocation forgery) |
| 0c11785 | worktree | Camera/CameraNotice::.sdata2 | 93.18 to 100 | header_override_macro, define_alias | `#define inv_sqrt inv_sqrt(f32); static f32 inv_sqrt_inline` before JGUtil.hpp | No legitimate path: fake; if a real static is needed, declare it in the owning header (H6) |
| 51a6646 | worktree | Player/MarioMove::checkGraffitoElec__6TMarioFv | 99.95 to 100 | sms_dummy_stack_padding | Four `JGeometry::TVec3<f32>();` discarded constructor statements | Find the inline; otherwise leave nonmatching |
| c52cd3f | worktree | Enemy/mameGesso::execute__21TNerveMameGessoObjectCFP24TSpineBase<10TLiveActor> | 99.97 to 100 | sms_dummy_stack_padding | Unused `TVec3<f32> position;` | Find the inline; otherwise leave nonmatching |
| cf45a1b | worktree | MoveBG/MapObjRailBlock::load__10TWoodBlockFR20JSUMemoryInputStream | 44.51 to 100 | codegen_pragma, sms_fabricated_marker | Unmarked `#pragma dont_inline on/off` around TRailMapObj::load | Add `// TODO: fakematch` on the adjacent line; 4.2 then downgrades to W |
| d453e18 | worktree | Enemy/DebuTelesa::.rodata | 36.01 to 100 | sms_pch_string_convention, unused_static_data | `unk1937[]` copy of the no-memory string, MtxCalcTypeName copy, unreferenced `unk1490/unk2602/unk2604` int triples | Include M3DUtil/InfectiousStrings.hpp; emit the 0xC triples through the upstream `static void dummy(Vec*)` helper with `// dummy: emits` |
| b34703d | worktree | Enemy/BathtubKiller::init__14TBathtubKillerFP12TLiveManager | 3.12 to 100 | codegen_pragma, sms_fabricated_marker | Unmarked `#pragma dont_inline` around resetBathtubKiller | Add the marker; downgrade to W |
| 5e24e36 | worktree | Enemy/riccohook::.data | 99.62 to 100 | header_override_macro, define_alias | `#define TRiccoHookManager TRiccoHookManagerHeader` around RiccoHook.hpp plus a local class | Fix include/Enemy/RiccoHook.hpp in the owner (H6) |
| 53ff3ce | worktree | Enemy/rocket::.sdata | 12.50 to 100 | mangled_symbol_in_source | `float mTestAng_y__7TRocket = 90.0f;` and 2 more | Declare `static f32 mTestAng_y;` in TRocket and define `f32 TRocket::mTestAng_y = 90.0f;` (H6); names are map-verified |
| 563f1b5 | worktree | Enemy/popo::.sdata | 13.33 to 100 | mangled_symbol_in_source | 16 hand-mangled TPopo statics | Static members in the owning header (H6) |
| 722ce94 | worktree | Enemy/cannon::.sdata | 12.50 to 100 | mangled_symbol_in_source | 4 hand-mangled TCannon statics | Static members in the owning header (H6) |
| ac34880 | worktree | MSound/MSoundSE::.sdata2 | 99.47 to 100 | discarded_expression | `(void)180.0f;` as the last statement of a function | No legitimate path: fake; find the expression that used 180.0f |
| 5b524b3 | worktree | MSound/MSoundSE::.rodata | 98.76 to 100 | sms_pch_string_convention, unused_static_data | Hand-copied `dummyMactorStringValue1`, `SMS_NO_MEMORY_MESSAGE` | Include System/DummyStrings.hpp |
| 761b5d3 | worktree | Enemy/elecNokonoko::.sdata | 40.00 to 100 | mangled_symbol_in_source | `unsigned char mReflectSw__13TElecNokonoko = 1;` | Static member in the owning header (H6) |
| 1036e2b | worktree | Enemy/hamukuri::stateLaunch__17THamuKuriLauncherFv | 99.84 to 100 | sms_dummy_stack_padding | Unused `int iVar1 = iVar2 / 180 + (iVar2 >> 15);` | Find the inline whose dead computation this is; otherwise leave nonmatching |
| a9ddff0 | worktree | MoveBG/MapObjGrass::perform__19TMapObjGrassManagerFUlPQ26JDrama9TGraphics | 99.94 to 100 | sms_dummy_stack_padding | Unused `Mtx viewItm;` | Find the inline; otherwise leave nonmatching |
| 23c9f96 | worktree | MSound/MSModBgm::xFadeBgmForce__10MSBgmXFadeFf | 99.80 to 100 | sms_dummy_stack_padding | Unused `u32 timing[2];` | Find the inline; otherwise leave nonmatching |
| 2daaff2 | worktree | Map/PollutionObj::getDepthFromMap__13TPollutionObjFii | 99.96 to 100 | sms_dummy_stack_padding | Unused `const TBGCheckData* tmp2;` under "TODO: inlines are wrong here" | Find the inline; otherwise leave nonmatching |
| abf421d | worktree | MoveBG/MapObjBase::makeObjDead__11TMapObjBaseFv | 99.94 to 100 | sms_dummy_stack_padding | Unused `Mtx mtx;` | Find the inline; otherwise leave nonmatching |
| a1aef83 | worktree | System/MarNameRefGen::.rodata | 98.20 to 100 | discarded_expression | `(void)"<TSilhouette>";` and 5 similar class-name literals | Give the classes their default-name constructors in the owning headers so `new TSilhouette` emits the literal (H6) |
| 8fc834c | worktree | MoveBG/MapObjMonte::.sdata | 2.38 to 100 | mangled_symbol_in_source | 20 `extern "C" float mX__19THangingBridgeBoard = ...;` and similar | Static members in the owning headers (H6) |
| d035c42 | worktree | MoveBG/MapObjMare::.sdata | 5.56 to 100 | mangled_symbol_in_source, unused_static_data | `extern "C" {` block of TCogwheel statics plus unreferenced `sRadius`, `mGrowStartFrame`, `mGrowEndFrame` | Static members in the owning header; file statics carry map names, keep them once the consumer is decompiled or with owner-evidence |
| 349873d | worktree | MoveBG/MapObjFence::.sdata | 14.29 to 100 | mangled_symbol_in_source | 6 hand-mangled TFenceWater/TRailFence/TRevolvingFenceInner statics | Static members in the owning headers (H6) |
| 3ef9ac3 | worktree | MoveBG/MapObjBall::.sdata | 20.00 to 100 | mangled_symbol_in_source | `extern "C" {` block of TResetFruit statics | Static members in the owning header (H6) |
| 7bf3b11 | worktree | MoveBG/MapObjMamma::.sdata | 8.33 to 100 | mangled_symbol_in_source | 17 hand-mangled TSandBase/TSandBombBase/TLeanMirror/TMammaBlockRotate statics | Static members in the owning headers (H6) |
| 4dc5225 | worktree | MoveBG/MapObjRicco::.sdata | 6.67 to 100 | mangled_symbol_in_source | 14 hand-mangled TCraneRotY/TRiccoWatermill/TFruitLauncher statics | Static members in the owning headers (H6) |
| 4345454 | worktree | MoveBG/MapObjBianco::.sdata | 4.76 to 100 | unused_static_data | Unreferenced `static f32 sRadius, sSubZ, sSpeed, sMessengerPosZ, sMessengerPosY` (all names present in symbols.txt) | Decompile the consumer; or allow map-named statics with owner-evidence at W (section 5) |

Eight further exact rows are rejected today but fall to warning tier under 4.2 and are not in the table: f71eb72 ShadowUtil::load (unused static on a function target), 8eb0320 PacketUtil::FifoSetFog 1.16 to 100 (unused `sFogOffColor` on a function target), f69084a EventWatcher (one-expression `getConsole()` wrapper), 3383d5b CardManager::cmdLoop and 81a66cf conductor::getManagerByName and ffd0c3b NpcNerve (multi-statement static inline helpers, labeled FP), c82ad52 MapObjFloat (one-expression `getParamName` wrapper), a8c8d44 MapObjLib::isDemo (goto pair, F18).

## 4. Warning tier noise

Burden: 84 of the 947 non-rejected rows (8.9%) carry at least one warning; 82 once rows whose only warning is `type_erasing_cast` are removed. Rows per warning rule among non-rejected rows: `sms_local_class_needs_owner` 16, `storage_widening` 12, `layout_cue_local` 10, `sms_dummy_stack_padding` 9, `sms_intrinsic_bypass` 7, `arg_order_change` 7, `duplicated_inline_body` 6, `fixed_fn_pointer_call` 4, `cancelling_arithmetic` 4, `type_erasing_cast` 4, `scalar_member_index` 2, `m2c_residue_names` 2, `sms_dummy_vec_helper` 2, `guard_removal` 1.

Sample: 15 warnings-only rows, 39 non-`type_erasing_cast` findings, opened in context.

| Rule | Rows sampled | Verdict |
| --- | --- | --- |
| scalar_member_index | d22ecee MarioDraw (`s16* unk = &...->unkFC; unk[2]`), e339163 ConsoleStr (`(&unk2AC)[i]`, `unk2AC` is `void*` in the header) | Both TP. Every finding is emitted twice on the same line. |
| storage_widening | d967bc8 WaterGun, ffaad56 bosseel, 3d0c039 MapObjBlock (`Mtx44` passed to `MtxPtr` APIs, one with `MtxPtr ptr = transform + 1`) | All TP. |
| duplicated_inline_body | 9943e6c BathtubKiller (nerve body duplicating another nerve in the same file), b724e0c WaterGun (switch case duplicating a body at line 746) | Both plausible lost inlines; correct at warning tier. |
| arg_order_change | 75a7fc8 Application (`setFlag(3, 0x20001)` became `setFlag(0x20001, 3)`; header is `setFlag(u32 flag, s32 value)`, so the new order is the fix), 632eb7f CameraJetCoaster (`mult33` operands swapped) | Both real permutations; the reviewer flag is the right tier. |
| sms_local_class_needs_owner | 5f9576f MarNameRefGen_Enemy (13 placeholder classes), a0262d0 bosstelesa (`class TBossTelesa { static float ...; }` on a `.sdata` exact) | Both TP. Message says "no map symbol" for classes whose constructors are in symbols.txt, so the map lookup is not finding them. |
| sms_dummy_stack_padding (warning) | 8daaff3 Strategy::load (`TObjHitCheck* hitCheck = new TObjHitCheck();` reported as unused call result), dab15f7 BathtubKiller (`static const char* loopFilenames[] = { one entry }; SMS_LoadParticle(loopFilenames[0], ...)` reported as partially used aggregate) | Both FP. A `new` with constructor side effects is not frame shaping; a one-element table indexed at [0] is fully used and is not stack storage. |
| cancelling_arithmetic | 84db8d3 MtxUtil (`- -m[2][2]`), 99f2839 MapMirror (`- -unk90` three times) | Both TP. |

Estimate: 2 of 15 sampled rows (13%) and 2 of 39 findings (5%) are wrong; a further 4 of 39 findings (10%) are duplicate emissions of a correct finding. Applied to the 82 burdened rows this predicts roughly 10 rows with a spurious warning across the corpus, concentrated in `sms_dummy_stack_padding` and in the duplicate output of `scalar_member_index`. The warning tier is usable as a reviewer signal; it is not clean enough to gate on.

## 5. Rule tunings from the false positives

| Rule | What misfired | Suggested fix |
| --- | --- | --- |
| sms_fabricated_marker (static inline branch) | Fires at error tier on any single-call-site `static inline`, including 7 rows of multi-statement helpers (doThing, startDisappearBalloonImpl, makeRotZMtx, loadAfterInPollution, readOptionSector, getManagerByNameInline) that are plausible lost inlines. 4.2 says `single-use-wrapper` is never E. | Emit at W. Report only one-expression bodies as "trivial wrapper"; report multi-statement helpers at info with the "promote to method or UNUSED function" hint from upstream AGENTS.md. |
| m2c_goto_label | Severity is E in `authored_source_shape`; 4.2 asks for W in `.cpp` because upstream says apparent gotos are usually inlined early returns. 5 rows, 2 recorded exact, would be rejected on gotos alone. | Severity W when the file is `.cpp` under an SMS scan; keep the repair hint "find the inline". |
| unused_static_data | Always E. 4.2 asks for E on section-target attempts and W on function-target attempts; 9 rows (2 exact) are function targets. 23 flagged names are `scope:local` data symbols in symbols.txt whose consumer is simply not decompiled yet. | Take the target kind from the scan invocation (or a post-scan hook) and emit W on function targets. Add an owner-evidence exemption: a static whose name is in symbols.txt for this unit and carries a `// map:` comment drops to W. Skip names already covered by `sms_pch_string_convention` (double report on 9 rows). |
| volatile_local_tactic | `volatile f32 f = v.y * estimate;` with an adjacent TODO mirrors `THitActor::calcEntryRadius` in the upstream tree. | Downgrade to W when a `TODO`/`fakematch` marker is on the adjacent line and the same `volatile f32 ... __frsqrte` idiom exists in upstream `src/`. Keep casts at E. |
| codegen_pragma with sms_fabricated_marker | Every `#pragma dont_inline` line is reported twice (11 plus 6 findings on the same lines) and `codegen_pragma` stays E even when the SMS marker is present, which defeats the 4.2 "W with marker" tier. | In the SMS composition suppress `codegen_pragma` for `dont_inline` in `.cpp` and let `sms_fabricated_marker` own the severity. Keep `force_active` and `inline_depth` at E in both. |
| sms_dummy_stack_padding (warning branch) | `unused_call_result` fires on `T* p = new T();` where the constructor has side effects; `partial_aggregate` fires on one-element arrays indexed at `[0]` and on `static const` locals. | Exempt initializers that start with `new`; require at least two components before reporting partial use; skip locals declared `static`. |
| scalar_member_index | Each finding is emitted twice with identical (file, line, member). | Dedupe on (file, line, member) before returning. |
| define_alias with header_override_macro | Same three macro lines reported by both rules. | Suppress `define_alias` when `header_override_macro` fires on the same line. |
| sms_local_class_needs_owner | Message reports "no map symbol" for classes whose `__ct__`/`__dt__` entries are in symbols.txt (TFruitsBoat, TBossTelesa). | Verify the symbols.txt lookup keys on the mangled constructor and vtable names, since 4.2 uses that lookup to choose E versus W. |

## Evidence

- evidence/all-integrations.json: 1,046 rows (era, commit, files, patch path, validation path, qa_tree, qa_patch, target).
- evidence/impact-raw.json: per-row scan results from the v2 replay (legacy C-only rules rescoped), findings for every proposed rule byte-identical to the v1 replay.
- evidence/impact-summary.json and evidence/measure_impact.py: replay driver and its raw summary.
- Labels used for section 1 through 3 are reproducible from the per-rule policy in section 2 (the 9 FP findings are named there; every other finding is TP).
