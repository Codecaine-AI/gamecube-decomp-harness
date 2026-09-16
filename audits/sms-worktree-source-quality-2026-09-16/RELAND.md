# SMS re-land rebuild (branch reland-20260916)

Date: 2026-09-16

## Build result

PASS. Fresh sandbox. `ninja -k 0 all_source` exit 0, 0 FAILED lines, stderr 0 bytes (22:39:29Z to 22:40:29Z UTC). `ninja progress build/GMSJ01/report.json` exit 0 (22:40:29Z to 22:40:48Z UTC), report.json 3245668 bytes. Informational only: sjiswrap notes Shift JIS encoding errors in src/Enemy/enemyMario.cpp (object still compiled), 43 mwcc_objcache `uncacheable` notes (missing .d dependencies, cache bypasses, not failures). Working tree clean, 31 commits over 219e9aa0.

### First attempt

Build 1 at head 0fb394d4 (30 relands) FAILED: 8 TUs did not compile. Each failure came from a "::.sdata via owning-header declarations" reland that added a NEW header declaring a statics-only class with no constructor; mwcc 1.2.5 reported `cannot construct base class '<base>'` at the closing brace of the new class because it could not generate the implicit default constructor (the base class has no default constructor). -maxerrors 1, output on stdout, stderr 0 bytes. rocket 755fedac and pakkun 2788a59e (statics added to existing classes with constructors) compiled. Evidence: reland-build-attempt1.log, reland-ninja-all_source-attempt1.stdout.log (8 FAILED blocks). An interim measurement with those 8 commits reverted in the sandbox was made and then superseded; its files were removed.
Fix: commit cda3372b declares a `(const char*)` constructor in each fabricated header class (TPopo, TCannon, TElecNokonoko, TBombHei, TBossTelesa, TChuuHana, TTobiPuku, TKiller and TFlyEnemy in Killer.hpp), which suppresses the implicit default constructor. Source was otherwise untouched by the build job.

| TU | Error | Reland commit |
|---|---|---|
| elecNokonoko.cpp | ElecNokonoko.hpp line 12, TWalkerEnemy | 1751f720 |
| tobiPuku.cpp | TobiPuku.hpp line 15, TWalkerEnemy | 091d2f78 |
| chuuhana.cpp | ChuuHana.hpp line 23, TWalkerEnemy | f203d0a8 |
| bosstelesa.cpp | BossTelesa.hpp line 19, TSpineEnemy | 1346e3e0 |
| bombhei.cpp | BombHei.hpp line 12, TWalkerEnemy | 910d353c |
| cannon.cpp | Cannon.hpp line 15, TSmallEnemy | fb5f9711 |
| killer.cpp | Killer.hpp line 14, TWalkerEnemy | 76c1ff17 |
| popo.cpp | Popo.hpp line 27, TWalkerEnemy | f2cda215 |

## Totals

| Measure | pre-cleanup ab168314 | post-cleanup 219e9aa0 | post-reland cda3372b |
| --- | --- | --- | --- |
| Matched code percent | 40.92 | 40.72 | 40.73 |
| Matched functions | 8432 of 12881 | 8394 of 12881 | 8395 of 12881 |
| Matched data percent | 62.55 | 59.10 | 59.65 |
| Complete code percent | 18.00 | 18.00 | 18.00 |
| Fuzzy match percent | 76.15 | 75.94 | 75.96 |
| Complete units | 396 of 736 | 396 of 736 | 396 of 736 |
Matched code bytes: 1469096 / 1461780 / 1462124. Matched data bytes: 400547 / 378419 / 381987. Exact values: matched code percent 40.72669, matched data percent 59.654617, fuzzy match percent 75.958565.

## Specific checks

feetinv .data does not emit the vtable. The feetinv reland 73605bf9 (header gains `virtual ~TMtxCalcFootInv() { }`, feetinv.cpp is only `#include <Enemy/FeetInv.hpp>`) does not emit `__vt__15TMtxCalcFootInv`. The object's symbol table holds only PCH string objects (@134 16 bytes, @154 12 bytes, @163 12 bytes in .data, @135 4 bytes in .sdata); no .text, no .sdata2. .data stays 32.26 (100 pre-cleanup), all 9 feetinv functions still absent. Including the header alone does not instantiate the vtable; the .cpp needs its pre-lint class body and functions back.
FifoSetFog is exact again. mario/MarioUtil/PacketUtil::FifoSetFog__F10_GXFogTypeffff8_GXColor back to 100.00 (post-cleanup 1.16). PacketUtil .data 50.00 to 100, .sdata2 13.33 to 100, .text 84.88 to 96.52, ShapePacketCallBackFunc__FP17J3DCallBackPacketi 81.63 to 91.74 (its pre score). PacketUtil fully back at pre-cleanup scores.
Units outside the 31 branch commits that moved between post-cleanup and post-reland: none (0 sections, 0 functions). Regressions post-cleanup to post-reland: 0. objdiff-cli report changes vs post-cleanup lists exactly 17 changed units, all reland units: PacketUtil, MarNameRefGen_BossEnemy, MarNameRefGen_Map, MovieDirector, MSoundSE, MapObjRicco, MapObjMamma, MapObjPinna, MapObjBall, MapObjFence, MapObjMonte, SelectMenu, SelectDir, elecNokonoko, cannon, popo, rocket. vs pre-cleanup lists 27 changed units.

Scores for the 8 units that failed in the first attempt, pre-cleanup / post-cleanup / re-land:

| Previously failing unit | Pre / post / re-land |
|---|---|
| cannon | .sdata 100 / 12.50 / 100 |
| elecNokonoko | .sdata 100 / 40.00 / 100 |
| popo | .sdata 100 / 13.33 / 100 |
| killer | .sdata 100 / 100 / 100; .data 92.65 / 3.47 / 4.86; .rodata 70.97 / absent / 52.52 |
| tobiPuku | .sdata 100 / 100 / 100 |
| chuuhana | .sdata 100 / 100 / 100 |
| bosstelesa | .sdata 100 / 100 / 100 |
| bombhei | .sdata 100 / 100 / 100; .data 5.26 unchanged |

## Recovered

17 sections are exact again (post-cleanup score in parentheses):

Sections with post-cleanup score: mario/Enemy/cannon::.sdata (12.50), mario/Enemy/elecNokonoko::.sdata (40.00), mario/Enemy/popo::.sdata (13.33), mario/Enemy/rocket::.sdata (12.50), mario/GC2D/SelectDir::.rodata (97.60), mario/GC2D/SelectMenu::.rodata (79.12), mario/MSound/MSoundSE::.rodata (98.76), mario/MarioUtil/PacketUtil::.data (50.00), mario/MarioUtil/PacketUtil::.sdata2 (13.33), mario/MoveBG/MapObjBall::.sdata (20.00), mario/MoveBG/MapObjFence::.sdata (14.29), mario/MoveBG/MapObjMamma::.sdata (8.33), mario/MoveBG/MapObjMonte::.sdata (2.38), mario/MoveBG/MapObjPinna::.sdata (8.33), mario/MoveBG/MapObjRicco::.sdata (6.67), mario/System/MovieDirector::.data (78.72), mario/System/MovieDirector::.rodata (96.92).
1 function is exact again:

Function: mario/MarioUtil/PacketUtil::FifoSetFog__F10_GXFogTypeffff8_GXColor (1.16 to 100).
Reland units now at their pre-cleanup scores for every section and function (19): bombhei, bosstelesa, cannon, chuuhana, elecNokonoko, pakkun, popo, rocket, tobiPuku, SelectDir, SelectMenu, PacketUtil, MapObjBall, MapObjFence, MapObjMamma, MapObjMonte, MapObjPinna, MapObjRicco, MovieDirector (5 of these, bombhei, bosstelesa, chuuhana, tobiPuku, pakkun, had nothing to recover).
Partial improvements that did not reach the pre score: DebuTelesa .rodata 36.01 to 92.82 (pre 100); MapObjBianco .sdata 4.76 to 84.72 (pre 100); MapObjMare .sdata 5.56 to 71.43 (pre 100); MarNameRefGen_Map .rodata 44.71 to 96.88 (pre 100) and getNameRef_Map 99.92 to 99.95 (pre 100); MarNameRefGen_BossEnemy .rodata 42.72 to 57.51 (pre 100) and getNameRef_BossEnemy 33.22 to 33.62 (pre 33.63); killer .rodata absent to 52.52 (pre 70.97) and .data 3.47 to 4.86 (pre 92.65); tinkoopa .rodata absent to 8.07 (pre 80.69) and .data 2.75 to 3.86 (pre 12.02); bosswanwan .rodata absent to 16.76 (pre 25.56) and .data 3.21 to 3.85 (pre 5.27). Back to pre but not exact: SelectMenu initData 92.01 to 96.37; MSoundSE construct 99.71 to 99.98.

## Still lost versus pre-cleanup, final requeue set

### Sections

| Unit::section | Pre ab168314 | Post 219e9aa0 | Reland cda3372b | Branch commits |
|---|---:|---:|---:|---|
| `mario/Camera/CameraMode::.data` | 100.00 | 89.78 | 89.78 | none |
| `mario/Camera/CameraMode::.text` | 100.00 | 96.61 | 96.61 | none |
| `mario/Enemy/DebuTelesa::.rodata` | 100.00 | 36.01 | 92.82 | cd81e051 |
| `mario/Enemy/DebuTelesa::.sdata` | 100.00 | 90.00 | 90.00 | cd81e051 |
| `mario/Enemy/Kazekun::.sdata` | 88.89 | 10.00 | 10.00 | none |
| `mario/Enemy/Kukku::.sdata` | 90.91 | 8.33 | 8.33 | none |
| `mario/Enemy/bosspakkun::.sdata` | 80.00 | 16.67 | 16.67 | none |
| `mario/Enemy/bosswanwan::.data` | 5.27 | 3.21 | 3.85 | 48fcaf77 |
| `mario/Enemy/bosswanwan::.rodata` | 25.56 | 0.00 | 16.76 | 48fcaf77 |
| `mario/Enemy/enemyAttachment::.text` | 99.45 | 98.01 | 98.01 | none |
| `mario/Enemy/enemyMario::.text` | 98.16 | 97.94 | 97.94 | none |
| `mario/Enemy/feetinv::.data` | 100.00 | 32.26 | 32.26 | 73605bf9 |
| `mario/Enemy/feetinv::.sdata2` | 10.53 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::.text` | 10.11 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/fruitsboat::.sdata` | 80.00 | 16.67 | 16.67 | none |
| `mario/Enemy/killer::.data` | 92.65 | 3.47 | 4.86 | cda3372b 01d90250 76c1ff17 |
| `mario/Enemy/killer::.rodata` | 70.97 | 0.00 | 52.52 | cda3372b 01d90250 76c1ff17 |
| `mario/Enemy/koopajr::.rodata` | 2.99 | 0.00 | 0.00 | none |
| `mario/Enemy/koopajr::.sdata` | 5.77 | 1.92 | 1.92 | none |
| `mario/Enemy/limitkoopa::.sdata` | 88.89 | 10.00 | 10.00 | none |
| `mario/Enemy/limitkoopajr::.sdata` | 95.65 | 8.33 | 8.33 | none |
| `mario/Enemy/tinkoopa::.data` | 12.02 | 2.75 | 3.86 | 3319055a |
| `mario/Enemy/tinkoopa::.rodata` | 80.69 | 0.00 | 8.07 | 3319055a |
| `mario/Enemy/tinkoopa::.sdata2` | 54.83 | 0.00 | 0.00 | 3319055a |
| `mario/Enemy/yunbo::.sdata` | 88.89 | 10.00 | 10.00 | none |
| `mario/GC2D/ConsoleStr::.sdata2` | 100.00 | 97.30 | 97.30 | none |
| `mario/GC2D/ConsoleStr::.text` | 91.62 | 80.55 | 80.55 | none |
| `mario/MSound/MSModBgm::.text` | 99.41 | 99.39 | 99.39 | none |
| `mario/MSound/MSoundSE::.sdata2` | 100.00 | 99.47 | 99.47 | 6b1cf1e1 |
| `mario/Map/MapCheck::.text` | 87.43 | 87.15 | 87.15 | none |
| `mario/Map/PollutionObj::.text` | 100.00 | 99.99 | 99.99 | none |
| `mario/MarioUtil/MtxUtil::.rodata` | 100.00 | 95.59 | 95.59 | none |
| `mario/MarioUtil/MtxUtil::.text` | 96.27 | 96.27 | 96.27 | none |
| `mario/MarioUtil/ShadowUtil::.rodata` | 100.00 | 86.61 | 86.61 | none |
| `mario/MoveBG/MapObjBianco::.sdata` | 100.00 | 4.76 | 84.72 | 81941d25 |
| `mario/MoveBG/MapObjMare::.sdata` | 100.00 | 5.56 | 71.43 | 0529bfff |
| `mario/MoveBG/ModelGate::.data` | 24.36 | 12.82 | 12.82 | none |
| `mario/MoveBG/ModelGate::.rodata` | 46.27 | 0.00 | 0.00 | none |
| `mario/MoveBG/ModelGate::.sdata2` | 7.09 | 0.00 | 0.00 | none |
| `mario/NPC/NpcNerve::.text` | 99.46 | 99.43 | 99.43 | none |
| `mario/Player/MarioAccess::.text` | 100.00 | 99.62 | 99.62 | none |
| `mario/Player/MarioEffect::.text` | 99.95 | 99.95 | 99.95 | none |
| `mario/Player/Yoshi::.text` | 99.63 | 99.49 | 99.49 | none |
| `mario/System/CardManager::.data` | 100.00 | 94.12 | 94.12 | none |
| `mario/System/CardManager::.text` | 99.61 | 99.39 | 99.39 | none |
| `mario/System/MarDirectorEvent::.data` | 100.00 | 53.85 | 53.85 | none |
| `mario/System/MarDirectorEvent::.rodata` | 100.00 | 98.60 | 98.60 | none |
| `mario/System/MarDirectorEvent::.text` | 93.45 | 89.68 | 89.68 | none |
| `mario/System/MarNameRefGen_BossEnemy::.rodata` | 100.00 | 42.72 | 57.51 | 31f57830 |
| `mario/System/MarNameRefGen_BossEnemy::.sdata2` | 100.00 | 65.96 | 65.96 | 31f57830 |
| `mario/System/MarNameRefGen_Enemy::.data` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Enemy::.rodata` | 100.00 | 70.85 | 70.85 | none |
| `mario/System/MarNameRefGen_Enemy::.sdata2` | 100.00 | 55.62 | 55.62 | none |
| `mario/System/MarNameRefGen_Enemy::.text` | 91.28 | 52.40 | 52.40 | none |
| `mario/System/MarNameRefGen_Map::.rodata` | 100.00 | 44.71 | 96.88 | 698a7a53 |
| `mario/System/MarNameRefGen_Map::.sdata` | 100.00 | 50.00 | 50.00 | 698a7a53 |
| `mario/System/MarNameRefGen_Map::.text` | 100.00 | 99.92 | 99.95 | 698a7a53 |
| `mario/System/MarNameRefGen_MapObj::.data` | 100.00 | 56.65 | 56.65 | none |
| `mario/System/MarNameRefGen_MapObj::.rodata` | 100.00 | 93.28 | 93.28 | none |
| `mario/System/MarNameRefGen_MapObj::.sdata2` | 100.00 | 97.43 | 97.43 | none |
| `mario/System/MarNameRefGen_MapObj::.text` | 86.11 | 81.08 | 81.08 | none |
| `mario/System/MenuDir::.rodata` | 100.00 | 96.99 | 96.99 | none |
| `mario/System/MenuDir::.text` | 98.86 | 98.53 | 98.53 | none |

### Functions

| Unit::symbol | Pre ab168314 | Post 219e9aa0 | Reland cda3372b | Branch commits |
|---|---:|---:|---:|---|
| `mario/Camera/CameraMode::isNormalCameraCompletely__15CPolarSubCameraCFv` | 100.00 | 72.86 | 72.86 | none |
| `mario/Enemy/Kumokun::execute__19TNerveKumokunFreezeCFP24TSpineBase<10TLiveActor>` | 100.00 | 99.93 | 99.93 | none |
| `mario/Enemy/Kumokun::execute__23TNerveKumokunPostFreezeCFP24TSpineBase<10TLiveActor>` | 100.00 | 99.90 | 99.90 | none |
| `mario/Enemy/enemyAttachment::generatePolluteModel__25TEnemyPolluteModelManagerFRQ29JGeometry8TVec3<f>RQ29JGeometry8TVec3<f>` | 99.92 | 86.33 | 86.33 | none |
| `mario/Enemy/enemyMario::consider__11TEnemyMarioFv` | 95.93 | 94.86 | 94.86 | none |
| `mario/Enemy/enemyMario::getPoint__9TPathNodeCFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/Enemy/feetinv::@120@4@calcTransform__19J3DMtxCalcSoftimageFUsRC16J3DTransformInfo` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@120@4@calc__15TMtxCalcFootInvFUs` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@120@4@init__19J3DMtxCalcSoftimageFRC3VecRA3_A4_Cf` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@120@4@recursiveCalc__15J3DMtxCalcBasicFP7J3DNode` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@120@4@recursiveEntry__15J3DMtxCalcBasicFP7J3DNode` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@120@4@recursiveUpdate__15J3DMtxCalcBasicFP7J3DNode` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@80@__dt__15TMtxCalcFootInvFv` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::@80@calc__15TMtxCalcFootInvFUs` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/feetinv::__dt__15TMtxCalcFootInvFv` | 100.00 | 0.00 | 0.00 | 73605bf9 |
| `mario/Enemy/mameGesso::execute__21TNerveMameGessoObjectCFP24TSpineBase<10TLiveActor>` | 100.00 | 99.97 | 99.97 | none |
| `mario/GC2D/ConsoleStr::processGo__11TConsoleStrFf` | 86.63 | 14.56 | 14.56 | none |
| `mario/MSound/MSModBgm::xFadeBgmForce__10MSBgmXFadeFf` | 100.00 | 99.80 | 99.80 | none |
| `mario/Map/MapCheck::checkWallList__17TMapCollisionDataFPC12TBGCheckListP18TBGWallCheckRecord` | 98.71 | 96.79 | 96.79 | none |
| `mario/Map/PollutionObj::getDepthFromMap__13TPollutionObjFii` | 100.00 | 99.96 | 99.96 | none |
| `mario/MarioUtil/MtxUtil::setup__15TMultiMtxEffectFP8J3DModelPCc` | 91.45 | 91.40 | 91.40 | none |
| `mario/MarioUtil/ShadowUtil::calcVtx__19TMBindShadowManagerFv` | 97.08 | 97.07 | 97.07 | none |
| `mario/MarioUtil/ShadowUtil::load__19TMBindShadowManagerFR20JSUMemoryInputStream` | 100.00 | 99.95 | 99.95 | none |
| `mario/NPC/NpcNerve::execute__18TNerveNPCGraphWaitCFP24TSpineBase<10TLiveActor>` | 100.00 | 99.43 | 99.43 | none |
| `mario/Player/MarioAccess::SMS_IsMarioOnWire__Fv` | 100.00 | 93.83 | 93.83 | none |
| `mario/Player/MarioEffect::perform__12TMarioEffectFUlPQ26JDrama9TGraphics` | 100.00 | 99.97 | 99.97 | none |
| `mario/Player/Yoshi::thinkAnimation__6TYoshiFv` | 98.28 | 96.12 | 96.12 | none |
| `mario/System/CardManager::cmdLoop__12TCardManagerFv` | 100.00 | 96.70 | 96.70 | none |
| `mario/System/MarDirectorEvent::fireStreamingMovie__12TMarDirectorFUc` | 99.94 | 74.29 | 74.29 | none |
| `mario/System/MarNameRefGen_BossEnemy::getNameRef_BossEnemy__14TMarNameRefGenCFPCc` | 33.63 | 33.22 | 33.62 | 31f57830 |
| `mario/System/MarNameRefGen_Enemy::__dt__16TLauncherManagerFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Enemy::__dt__24THamuKuriLauncherManagerFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Enemy::__dt__24TNameKuriLauncherManagerFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Enemy::__dt__8TPoiHanaFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Enemy::changeDrawBuffer__13TEnemyManagerFUl` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Enemy::getNameRef_Enemy__14TMarNameRefGenCFPCc` | 98.18 | 55.60 | 55.60 | none |
| `mario/System/MarNameRefGen_Enemy::restoreDrawBuffer__13TEnemyManagerFUl` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_Map::getNameRef_Map__14TMarNameRefGenCFPCc` | 100.00 | 99.92 | 99.95 | 698a7a53 |
| `mario/System/MarNameRefGen_MapObj::@32@__dt__10TTakeActorFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::@32@__dt__17TSirenaRollMapObjFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::__dt__10TTakeActorFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::__dt__17TSirenaRollMapObjFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::ensureTakeSituation__10TTakeActorFv` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::getNameRef_MapObj__14TMarNameRefGenCFPCc` | 89.68 | 86.01 | 86.01 | none |
| `mario/System/MarNameRefGen_MapObj::getRollAngX__17TSirenaRollMapObjCFi` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::getRollAngY__17TSirenaRollMapObjCFi` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::getRollAngZ__17TSirenaRollMapObjCFi` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MarNameRefGen_MapObj::receiveMessage__9THitActorFP9THitActorUl` | 100.00 | 0.00 | 0.00 | none |
| `mario/System/MenuDir::direct__13TMenuDirectorFv` | 96.73 | 96.12 | 96.12 | none |
| `mario/System/MenuDir::rsetup__13TMenuDirectorFv` | 99.77 | 99.36 | 99.36 | none |

## Sandbox

Snapshot sms-sandbox-20260916-ab168314 (ACTIVE, baked ab168314, /work/sms, 2 cpu). Final build: sandbox name sms-reland2-20260916, id f421400c-2996-4a4b-a0a3-7f9e01aecf07, region us. (Build 1: sandbox sms-reland-20260916, id 24aa9fa8-7df6-4390-bb00-0d63a3bc4173, deleted earlier.) Provisioning both times: full branch bundle (11145077 bytes for cda3372b) uploaded to /tmp/reland.bundle through the Daytona SDK (the CLI has no upload command), `git fetch /tmp/reland.bundle reland-20260916`, `git checkout --force -B reland-20260916 FETCH_HEAD`, stale report.json / report_changes.json / baseline.json removed from build/. Env ORCH_TOOL_PLATFORM=linux-i686, MWCC_CACHE_DIR=/work/sms/build/mwcc-objcache. objdiff-cli report changes run in the sandbox for both baselines. Sandbox started before exec, stopped after, deleted at the end; `daytona sandbox list` shows none of ours (an unrelated sandbox from another job, e53e40df, was present and left alone). Local bundles deleted. Nothing pushed; the local checkout was not modified by this job.

## Evidence files

report-after-reland.json (cda3372b), report-changes-reland-vs-cleanup.json, report-changes-reland-vs-original.json, reland-build-cda3372b.log, reland-ninja-all_source-cda3372b.stdout.log, reland-ninja-report-cda3372b.stdout.log, reland-build-attempt1.log and reland-ninja-all_source-attempt1.stdout.log (failed build 1 at 0fb394d4). Baselines: report-before-lint-cleanup.json, report-after-lint-cleanup.json.
