# SMS rebuild after lint cleanup (branch lint-cleanup-20260916)

Date: 2026-09-16. Built in a Daytona sandbox, nothing was compiled on this machine.

## Build result

Result: PASS. Every translation unit in `all_source` compiled. `ninja -k 0 all_source` exited 0 and the captured ninja stdout has zero FAILED lines. `ninja progress build/GMSJ01/report.json` exited 0 and produced the report.

Details:

1. Sandbox head after provisioning: 219e9aa03bf212f6585d9c4ee5ed3349405356c4 (branch tip, 62 reverts plus one restore on top of ab168314).
2. Compiler stderr was empty for both ninja invocations (evidence/rebuild-ninja-all_source.stderr.log is 0 bytes).
3. Two informational lines from sjiswrap appeared on stdout: `src/Player/MarioMove.cpp` and `src/Enemy/enemyMario.cpp` contain Shift JIS encoding errors. Both objects still compiled. MarioMove.cpp is not touched by the branch; enemyMario.cpp is (revert 6bb80f41).
4. mwcc_objcache printed 43 `uncacheable` notes (missing .d dependencies such as `include/JSystem/J3d/J3DGraphBase/Blocks/J3DTevBlocks.hpp` and the PCH). These are cache bypasses, not compile failures.
5. The build ran in two passes because the first detached ninja process was killed at 738 of 740 objects when the launching exec session timed out. The second pass rebuilt 311 objects (PCH rebuilt) and finished clean. Logs: evidence/rebuild-build.log, evidence/rebuild-ninja-all_source.stdout.log, evidence/rebuild-ninja-report.stdout.log.

## Totals before and after

| Measure | Before (ab168314) | After (219e9aa0) | Delta |
| --- | --- | --- | --- |
| Matched code percent | 40.92 | 40.72 | -0.20 |
| Matched functions | 8432 of 12881 | 8394 of 12881 | -38 |
| Matched functions percent | 65.46 | 65.17 | -0.30 |
| Complete code percent (linked) | 18.00 | 18.00 | +0.00 |
| Matched data percent | 62.55 | 59.10 | -3.46 |
| Fuzzy match percent | 76.15 | 75.94 | -0.21 |
| Complete units | 396 of 736 | 396 of 736 | +0 |
| Matched code bytes | 1469096 | 1461780 | -7316 |
| Matched data bytes | 400547 | 378419 | -22128 |

Sources: evidence/report-before-lint-cleanup.json, evidence/report-after-lint-cleanup.json, evidence/report-changes-lint-cleanup.json (objdiff-cli report changes, 41 units changed), evidence/rebuild-summary.json (derived comparison).

## Requeue list: functions exact before, below exact after

38 functions. `after` of 0.00 means the symbol is no longer emitted by the rebuilt object (the report has no match percent for it). Kind is `target` when the ledger names the function, `collateral` when the function regressed because a revert in the same file removed or changed code around it.

| Unit::symbol | Before | After | Kind | Revert commits touching the unit |
| --- | --- | --- | --- | --- |
| mario/Camera/CameraMode::isNormalCameraCompletely__15CPolarSubCameraCFv | 100.00 | 72.86 | target | b727d10c (isNormalCameraCompletely__15CPolarSubCam) |
| mario/Enemy/Kumokun::execute__19TNerveKumokunFreezeCFP24TSpineBase<10TLiveActor> | 100.00 | 99.93 | target | 0eb2b6c8 (execute__23TNerveKumokunPostFreezeCFP24T); 3e1f85ec (execute__19TNerveKumokunFreezeCFP24TSpin) |
| mario/Enemy/Kumokun::execute__23TNerveKumokunPostFreezeCFP24TSpineBase<10TLiveActor> | 100.00 | 99.90 | target | 0eb2b6c8 (execute__23TNerveKumokunPostFreezeCFP24T); 3e1f85ec (execute__19TNerveKumokunFreezeCFP24TSpin) |
| mario/Enemy/enemyMario::getPoint__9TPathNodeCFv | 100.00 | 0.00 | collateral | 6bb80f41 (consider__11TEnemyMarioFv) |
| mario/Enemy/feetinv::@120@4@calcTransform__19J3DMtxCalcSoftimageFUsRC16J3DTransformInfo | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@120@4@calc__15TMtxCalcFootInvFUs | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@120@4@init__19J3DMtxCalcSoftimageFRC3VecRA3_A4_Cf | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@120@4@recursiveCalc__15J3DMtxCalcBasicFP7J3DNode | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@120@4@recursiveEntry__15J3DMtxCalcBasicFP7J3DNode | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@120@4@recursiveUpdate__15J3DMtxCalcBasicFP7J3DNode | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@80@__dt__15TMtxCalcFootInvFv | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::@80@calc__15TMtxCalcFootInvFUs | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/feetinv::__dt__15TMtxCalcFootInvFv | 100.00 | 0.00 | collateral | cc9c992f (.data) |
| mario/Enemy/mameGesso::execute__21TNerveMameGessoObjectCFP24TSpineBase<10TLiveActor> | 100.00 | 99.97 | target | 8363182a (execute__21TNerveMameGessoObjectCFP24TSp) |
| mario/MSound/MSModBgm::xFadeBgmForce__10MSBgmXFadeFf | 100.00 | 99.80 | target | 0c2288bf (xFadeBgmForce__10MSBgmXFadeFf) |
| mario/Map/PollutionObj::getDepthFromMap__13TPollutionObjFii | 100.00 | 99.96 | target | 292b2221 (getDepthFromMap__13TPollutionObjFii) |
| mario/MarioUtil/PacketUtil::FifoSetFog__F10_GXFogTypeffff8_GXColor | 100.00 | 1.16 | target | b7b4792f (FifoSetFog__F10_GXFogTypeffff8_GXColor) |
| mario/MarioUtil/ShadowUtil::load__19TMBindShadowManagerFR20JSUMemoryInputStream | 100.00 | 99.95 | target | 2820bdcd (load__19TMBindShadowManagerFR20JSUMemory) |
| mario/NPC/NpcNerve::execute__18TNerveNPCGraphWaitCFP24TSpineBase<10TLiveActor> | 100.00 | 99.43 | target | 5d3da8c7 (execute__18TNerveNPCGraphWaitCFP24TSpine); b0d132e8 (execute__18TNerveNPCGraphWaitCFP24TSpine) |
| mario/Player/MarioAccess::SMS_IsMarioOnWire__Fv | 100.00 | 93.83 | target | f6ad888e (SMS_IsMarioOnWire__Fv) |
| mario/Player/MarioEffect::perform__12TMarioEffectFUlPQ26JDrama9TGraphics | 100.00 | 99.97 | target | 6435d430 (perform__12TMarioEffectFUlPQ26JDrama9TGr) |
| mario/System/CardManager::cmdLoop__12TCardManagerFv | 100.00 | 96.70 | target | 3023692c (cmdLoop__12TCardManagerFv) |
| mario/System/MarNameRefGen_Enemy::__dt__16TLauncherManagerFv | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::__dt__24THamuKuriLauncherManagerFv | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::__dt__24TNameKuriLauncherManagerFv | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::__dt__8TPoiHanaFv | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::changeDrawBuffer__13TEnemyManagerFUl | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::restoreDrawBuffer__13TEnemyManagerFUl | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Map::getNameRef_Map__14TMarNameRefGenCFPCc | 100.00 | 99.92 | target | cc8f56a5 (getNameRef_Map__14TMarNameRefGenCFPCc); d3d61df0 (.rodata) |
| mario/System/MarNameRefGen_MapObj::@32@__dt__10TTakeActorFv | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::@32@__dt__17TSirenaRollMapObjFv | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::__dt__10TTakeActorFv | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::__dt__17TSirenaRollMapObjFv | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::ensureTakeSituation__10TTakeActorFv | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::getRollAngX__17TSirenaRollMapObjCFi | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::getRollAngY__17TSirenaRollMapObjCFi | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::getRollAngZ__17TSirenaRollMapObjCFi | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::receiveMessage__9THitActorFP9THitActorUl | 100.00 | 0.00 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |

Counts: 13 ledger targets, 25 collateral, 25 now absent from the object.

## Requeue list: data sections exact before, below exact after

45 sections. `after` of 0.00 means the section is no longer present in the rebuilt object.

| Unit::section | Before | After | Kind | Revert commits touching the unit |
| --- | --- | --- | --- | --- |
| mario/Camera/CameraMode::.data | 100.00 | 89.78 | collateral | b727d10c (isNormalCameraCompletely__15CPolarSubCam) |
| mario/Camera/CameraMode::.text | 100.00 | 96.61 | collateral | b727d10c (isNormalCameraCompletely__15CPolarSubCam) |
| mario/Enemy/DebuTelesa::.rodata | 100.00 | 36.01 | target | 3979059f (.rodata) |
| mario/Enemy/DebuTelesa::.sdata | 100.00 | 90.00 | collateral | 3979059f (.rodata) |
| mario/Enemy/cannon::.sdata | 100.00 | 12.50 | target | dc47ae4b (.sdata) |
| mario/Enemy/elecNokonoko::.sdata | 100.00 | 40.00 | target | 3bd24ccc (.sdata) |
| mario/Enemy/feetinv::.data | 100.00 | 32.26 | target | cc9c992f (.data) |
| mario/Enemy/popo::.sdata | 100.00 | 13.33 | target | eb60922a (.sdata) |
| mario/Enemy/rocket::.sdata | 100.00 | 12.50 | target | 6cc0e5ca (.sdata) |
| mario/GC2D/ConsoleStr::.sdata2 | 100.00 | 97.30 | collateral | c65a1830 (processGo__11TConsoleStrFf) |
| mario/GC2D/SelectDir::.rodata | 100.00 | 97.60 | collateral | 0f138b09 (rsetup__10TSelectDirFv) |
| mario/GC2D/SelectMenu::.rodata | 100.00 | 79.12 | collateral | a7972b6f (initData__11TSelectMenuFUcP10JKRArchiveP) |
| mario/MSound/MSoundSE::.rodata | 100.00 | 98.76 | target | 57a4add1 (.sdata2); 921a7b95 (.rodata) |
| mario/MSound/MSoundSE::.sdata2 | 100.00 | 99.47 | target | 57a4add1 (.sdata2); 921a7b95 (.rodata) |
| mario/Map/PollutionObj::.text | 100.00 | 99.99 | collateral | 292b2221 (getDepthFromMap__13TPollutionObjFii) |
| mario/MarioUtil/MtxUtil::.rodata | 100.00 | 95.59 | target | 5c5b2585 (.rodata) |
| mario/MarioUtil/PacketUtil::.data | 100.00 | 50.00 | collateral | b7b4792f (FifoSetFog__F10_GXFogTypeffff8_GXColor) |
| mario/MarioUtil/PacketUtil::.sdata2 | 100.00 | 13.33 | collateral | b7b4792f (FifoSetFog__F10_GXFogTypeffff8_GXColor) |
| mario/MarioUtil/ShadowUtil::.rodata | 100.00 | 86.61 | collateral | 2820bdcd (load__19TMBindShadowManagerFR20JSUMemory) |
| mario/MoveBG/MapObjBall::.sdata | 100.00 | 20.00 | target | 5ae7948f (.sdata) |
| mario/MoveBG/MapObjBianco::.sdata | 100.00 | 4.76 | target | e99e0fcb (.sdata) |
| mario/MoveBG/MapObjFence::.sdata | 100.00 | 14.29 | target | 49390a2d (.sdata) |
| mario/MoveBG/MapObjMamma::.sdata | 100.00 | 8.33 | target | 4040e261 (.sdata) |
| mario/MoveBG/MapObjMare::.sdata | 100.00 | 5.56 | target | 721227cf (.sdata) |
| mario/MoveBG/MapObjMonte::.sdata | 100.00 | 2.38 | target | c6f043bc (.sdata) |
| mario/MoveBG/MapObjPinna::.sdata | 100.00 | 8.33 | target | 501f9ceb (.sdata) |
| mario/MoveBG/MapObjRicco::.sdata | 100.00 | 6.67 | target | b62c4e2a (.sdata) |
| mario/Player/MarioAccess::.text | 100.00 | 99.62 | collateral | f6ad888e (SMS_IsMarioOnWire__Fv) |
| mario/System/CardManager::.data | 100.00 | 94.12 | collateral | 3023692c (cmdLoop__12TCardManagerFv) |
| mario/System/MarDirectorEvent::.data | 100.00 | 53.85 | collateral | 52a5431c (fireStreamingMovie__12TMarDirectorFUc); a42342c4 (.rodata) |
| mario/System/MarDirectorEvent::.rodata | 100.00 | 98.60 | target | 52a5431c (fireStreamingMovie__12TMarDirectorFUc); a42342c4 (.rodata) |
| mario/System/MarNameRefGen_BossEnemy::.rodata | 100.00 | 42.72 | target | e7395417 (.sdata2); 4c0e46d1 (.rodata) |
| mario/System/MarNameRefGen_BossEnemy::.sdata2 | 100.00 | 65.96 | target | e7395417 (.sdata2); 4c0e46d1 (.rodata) |
| mario/System/MarNameRefGen_Enemy::.data | 100.00 | 0.00 | collateral | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::.rodata | 100.00 | 70.85 | target | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Enemy::.sdata2 | 100.00 | 55.62 | target | 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |
| mario/System/MarNameRefGen_Map::.rodata | 100.00 | 44.71 | target | cc8f56a5 (getNameRef_Map__14TMarNameRefGenCFPCc); d3d61df0 (.rodata) |
| mario/System/MarNameRefGen_Map::.sdata | 100.00 | 50.00 | collateral | cc8f56a5 (getNameRef_Map__14TMarNameRefGenCFPCc); d3d61df0 (.rodata) |
| mario/System/MarNameRefGen_Map::.text | 100.00 | 99.92 | collateral | cc8f56a5 (getNameRef_Map__14TMarNameRefGenCFPCc); d3d61df0 (.rodata) |
| mario/System/MarNameRefGen_MapObj::.data | 100.00 | 56.65 | target | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::.rodata | 100.00 | 93.28 | target | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MarNameRefGen_MapObj::.sdata2 | 100.00 | 97.43 | collateral | 01ecbcac (.data); 97ea337e (.rodata) |
| mario/System/MenuDir::.rodata | 100.00 | 96.99 | collateral | 68285800 (direct__13TMenuDirectorFv); fefe5930 (rsetup__13TMenuDirectorFv) |
| mario/System/MovieDirector::.data | 100.00 | 78.72 | collateral | 757d9761 (__dt__14TMovieDirectorFv) |
| mario/System/MovieDirector::.rodata | 100.00 | 96.92 | collateral | 757d9761 (__dt__14TMovieDirectorFv) |

## Ledger targets that were not exact before

These reverted targets were below 100 at ab168314. All but one regressed to the ledger's pre-integration score and should be requeued with that score as the floor. The exception is MovieDirector::__dt__14TMovieDirectorFv, which stayed at 99.88 because revert 757d9761 only affected data in that unit.

| Unit::target | Ledger before | Ledger after | Report before | Report after |
| --- | --- | --- | --- | --- |
| mario/Enemy/enemyMario::consider__11TEnemyMarioFv | 94.75 | 95.82 | 95.93 | 94.86 |
| mario/Enemy/limitkoopajr::.sdata | 8.33 | 95.65 | 95.65 | 8.33 |
| mario/Enemy/limitkoopa::.sdata | 10.00 | 88.89 | 88.89 | 10.00 |
| mario/Enemy/Kukku::.sdata | 8.33 | 90.91 | 90.91 | 8.33 |
| mario/Enemy/koopajr::.sdata | 1.92 | 5.77 | 5.77 | 1.92 |
| mario/Enemy/yunbo::.sdata | 10.00 | 88.89 | 88.89 | 10.00 |
| mario/Enemy/Kazekun::.sdata | 10.00 | 88.89 | 88.89 | 10.00 |
| mario/Enemy/fruitsboat::.sdata | 16.67 | 80.00 | 80.00 | 16.67 |
| mario/Enemy/enemyAttachment::generatePolluteModel__25TEnemyPolluteModelManagerFRQ29JGeometry8TVec3<f>RQ29JGeometry8TVec3<f> | 86.33 | 99.92 | 99.92 | 86.33 |
| mario/Enemy/killer::.data | 3.47 | 92.65 | 92.65 | 3.47 |
| mario/Enemy/bosspakkun::.sdata | 16.67 | 80.00 | 80.00 | 16.67 |
| mario/Enemy/bosswanwan::.data | 3.21 | 5.27 | 5.27 | 3.21 |
| mario/Enemy/tinkoopa::.data | 2.75 | 12.02 | 12.02 | 2.75 |
| mario/GC2D/SelectMenu::initData__11TSelectMenuFUcP10JKRArchiveP19TSelectShineManagerP10TSelectDir | 91.64 | 96.32 | 96.37 | 92.01 |
| mario/GC2D/SelectDir::rsetup__10TSelectDirFv | 99.45 | 99.63 | 99.63 | 99.60 |
| mario/Player/Yoshi::thinkAnimation__6TYoshiFv | 96.08 | 98.24 | 98.28 | 96.12 |
| mario/Map/MapCheck::checkWallList__17TMapCollisionDataFPC12TBGCheckListP18TBGWallCheckRecord | 96.77 | 98.69 | 98.71 | 96.79 |
| mario/MoveBG/ModelGate::.data | 12.82 | 24.36 | 24.36 | 12.82 |
| mario/System/MarDirectorEvent::fireStreamingMovie__12TMarDirectorFUc | 74.16 | 99.82 | 99.94 | 74.29 |
| mario/System/MovieDirector::__dt__14TMovieDirectorFv | 99.71 | 99.88 | 99.88 | 99.88 |
| mario/System/MenuDir::direct__13TMenuDirectorFv | 96.06 | 96.73 | 96.73 | 96.12 |
| mario/System/MenuDir::rsetup__13TMenuDirectorFv | 99.26 | 99.77 | 99.77 | 99.36 |
| mario/GC2D/ConsoleStr::processGo__11TConsoleStrFf | 14.52 | 86.51 | 86.63 | 14.56 |

## Changes outside the reverted targets

No function or section improved. Every one of the 57 function changes and 89 section changes is a regression, and all of them sit inside units named by the ledger (53 of the 53 ledger units changed). No unit outside the ledger changed. Zero functions were added or removed from the report inventory.

34 function regressions are collateral (the ledger does not name the function) and 52 section regressions are collateral (the ledger does not name the section). The largest are listed here; the full set is in evidence/rebuild-summary.json under `unexpected_function_changes` and `unexpected_section_changes`.

Collateral function regressions (not in the requeue table above because they were not exact before):

| Unit::symbol | Before | After |
| --- | --- | --- |
| mario/MSound/MSoundSE::__ct__29MSSetSoundTL<13MSSetSoundGrp>FUlPCcP13MSSetSoundGrpUcUcUcUcfUcffffflflfffb | 99.79 | 99.68 |
| mario/MSound/MSoundSE::construct__Q214MSoundSESystem8MSoundSEFv | 99.98 | 99.71 |
| mario/MarioUtil/MtxUtil::setup__15TMultiMtxEffectFP8J3DModelPCc | 91.45 | 91.40 |
| mario/MarioUtil/PacketUtil::ShapePacketCallBackFunc__FP17J3DCallBackPacketi | 91.74 | 81.63 |
| mario/MarioUtil/ShadowUtil::calcVtx__19TMBindShadowManagerFv | 97.08 | 97.07 |
| mario/System/MarNameRefGen_BossEnemy::getNameRef_BossEnemy__14TMarNameRefGenCFPCc | 33.63 | 33.22 |
| mario/System/MarNameRefGen_Enemy::getNameRef_Enemy__14TMarNameRefGenCFPCc | 98.18 | 55.60 |
| mario/System/MarNameRefGen_MapObj::getNameRef_MapObj__14TMarNameRefGenCFPCc | 89.68 | 86.01 |
| mario/System/MovieDirector::rsetup__14TMovieDirectorFv | 97.77 | 97.75 |

Collateral section regressions that were not exact before:

| Unit::section | Before | After |
| --- | --- | --- |
| mario/Enemy/Kumokun::.text | 98.39 | 98.39 |
| mario/Enemy/bosswanwan::.rodata | 25.56 | 0.00 |
| mario/Enemy/enemyAttachment::.text | 99.45 | 98.01 |
| mario/Enemy/enemyMario::.text | 98.16 | 97.94 |
| mario/Enemy/feetinv::.sdata2 | 10.53 | 0.00 |
| mario/Enemy/feetinv::.text | 10.11 | 0.00 |
| mario/Enemy/killer::.rodata | 70.97 | 0.00 |
| mario/Enemy/koopajr::.rodata | 2.99 | 0.00 |
| mario/Enemy/mameGesso::.text | 99.70 | 99.70 |
| mario/Enemy/tinkoopa::.rodata | 80.69 | 0.00 |
| mario/Enemy/tinkoopa::.sdata2 | 54.83 | 0.00 |
| mario/GC2D/ConsoleStr::.text | 91.62 | 80.55 |
| mario/GC2D/SelectDir::.text | 99.73 | 99.71 |
| mario/GC2D/SelectMenu::.text | 95.05 | 93.78 |
| mario/MSound/MSModBgm::.text | 99.41 | 99.39 |
| mario/MSound/MSoundSE::.text | 99.50 | 99.39 |
| mario/Map/MapCheck::.text | 87.43 | 87.15 |
| mario/MarioUtil/MtxUtil::.text | 96.27 | 96.27 |
| mario/MarioUtil/PacketUtil::.text | 96.52 | 84.88 |
| mario/MarioUtil/ShadowUtil::.text | 79.19 | 79.19 |
| mario/MoveBG/ModelGate::.rodata | 46.27 | 0.00 |
| mario/MoveBG/ModelGate::.sdata2 | 7.09 | 0.00 |
| mario/NPC/NpcNerve::.text | 99.46 | 99.43 |
| mario/Player/MarioEffect::.text | 99.95 | 99.95 |
| mario/Player/Yoshi::.text | 99.63 | 99.49 |
| mario/System/CardManager::.text | 99.61 | 99.39 |
| mario/System/MarDirectorEvent::.text | 93.45 | 89.68 |
| mario/System/MarNameRefGen_BossEnemy::.text | 23.86 | 23.57 |
| mario/System/MarNameRefGen_Enemy::.text | 91.28 | 52.40 |
| mario/System/MarNameRefGen_MapObj::.text | 86.11 | 81.08 |
| mario/System/MenuDir::.text | 98.86 | 98.53 |
| mario/System/MovieDirector::.text | 99.01 | 99.00 |

Reverts that removed more than the integration added (report after is lower than the ledger's recorded pre-integration score):

| Unit::target | Ledger before | Report after | Note |
| --- | --- | --- | --- |
| mario/System/MarNameRefGen_Map::.rodata | 96.88 | 44.71 | stacked reverts in the same file; see cc8f56a5 (getNameRef_Map__14TMarNameRefGenCFPCc); d3d61df0 (.rodata) |
| mario/System/MarNameRefGen_Enemy::.sdata2 | 89.08 | 55.62 | stacked reverts in the same file; see 78ad5842 (.sdata2); ed5f0ae5 (.rodata) |

Whole-file reverts that emptied a translation unit or dropped inline members: feetinv (cc9c992f left src/Enemy/feetinv.cpp with no code, so .text, .sdata2, and 9 functions vanished), MarNameRefGen_Enemy (ed5f0ae5 and 78ad5842 removed class bodies, so .data and 6 functions vanished and getNameRef_Enemy fell from 98.18 to 55.60), MarNameRefGen_MapObj (01ecbcac and 97ea337e removed class bodies, so 9 functions vanished), enemyMario (6bb80f41 removed getPoint__9TPathNodeCFv). These files need their pre-lint content restored by the requeued worker, not just the single target.

## Symbol order validation

Not run to completion. `tools/validate-symbol-order.py` requires the original linker map at `orig/GMSJ01/files/mario.MAP`. The map is absent from the sandbox image (only `orig/GMSJ01/sys` exists) and from the local checkout, and the image's `build/GMSJ01/mario.elf.MAP` is the freshly linked map, not the original. All 53 changed units were attempted and each exited 2 with `Map file not found: /work/sms/orig/GMSJ01/files/mario.MAP`. Log: evidence/rebuild-symbol-order.log. Rerun once a disc extract with mario.MAP is available.

## Sandbox

1. Snapshot: `sms-sandbox-20260914-72a4b712` (baked rev 72a4b712a304aca6b0ab52ac86d73b5c73a836d6, 2 cpu). `daytona snapshot list` showed no `sms-sandbox-20260916-ab168314` snapshot, so the 2026-09-14 image was used.
2. Sandbox id: `8e9626af-beec-4526-962d-402de1090781`, name `sms-lint-rebuild-0916`. Deleted after the artifacts were downloaded; `daytona sandbox list` reported no sandboxes afterwards.
3. Provisioning: the image clone is depth 1 at the baked rev, so a `72a4b712..lint-cleanup-20260916` bundle was rejected (`Repository lacks these prerequisite commits: 5f868fb3`). A full bundle of the branch (11 MB) was uploaded instead, then `git fetch /tmp/lint-cleanup-full.bundle lint-cleanup-20260916` and `git checkout --force -B lint-cleanup-20260916 219e9aa0`. Stale `report.json`, `report_changes.json`, and `baseline.json` under `build/` were removed before building, matching apps/server/src/core/validation/build/daytona.ts.
4. Environment: `ORCH_TOOL_PLATFORM=linux-i686`, `MWCC_CACHE_DIR=/work/sms/build/mwcc-objcache`. Targets: `ninja -k 0 all_source`, then `ninja progress build/GMSJ01/report.json`.
5. Changes report: `build/tools/objdiff-cli report changes -o /tmp/changes.json /tmp/report-before.json build/GMSJ01/report.json` inside the sandbox, downloaded to evidence/report-changes-lint-cleanup.json.
