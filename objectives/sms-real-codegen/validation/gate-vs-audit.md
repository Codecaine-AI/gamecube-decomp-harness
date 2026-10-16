# Gate vs temp-hack audit (plan 8.1)

Generated 2026-10-15T10:55:12 by `validate_audit.py`. Base `7fed828b`, gate sources hash `4ac93bf498463b91`, `--jobs 3`, gate defaults otherwise. 68 audited functions in 27 PRs. Runtime 1132.8 s total.

## Confusion matrix: audit verdict x gate audit_label

| audit \ gate | real | mixed | steering | unresolved | total |
| - | - | - | - | - | - |
| steering | 0 | 1 | 47 | 8 | 56 |
| mixed | 0 | 1 | 0 | 5 | 6 |
| real | 5 | 0 | 0 | 1 | 6 |

## Gate decision per audit verdict

| audit \ decision | pass | steering_located | unresolved |
| - | - | - | - |
| steering | 0 | 43 | 13 |
| mixed | 0 | 1 | 5 |
| real | 5 | 0 | 1 |

## Plan 8.3 flip criteria (audit part)

| criterion | value | result |
| - | - | - |
| 0/56 steering get pass | 0 | PASS |
| >= 50/56 steering get steering_located with complete analysis | 43 | FAIL |
| 0/6 mixed get pass | 0 | PASS |
| >= 4/6 mixed labelled mixed or steering | 1 | FAIL |
| >= 5/6 real pass | 5 | PASS |

All audit criteria hold: **no** (adversarial suite and smoke test are separate).

## S* match vs audit revert_test (steering, tolerance 0.05 pp)

51/56 agree. Without a gate S* value: none.

| PR | function | gate S* | audit revert | diff | decision |
| - | - | - | - | - | - |
| 06 | `Hxs_Logo_TexDraw` | 83.70 | 71.10 | +12.60 | unresolved |
| 15 | `TSmallEnemy::expandCollision` | 99.68 | 98.61 | +1.07 | unresolved |
| 16 | `TCardManager::getBookmarkInfos_` | 98.72 | 98.80 | -0.08 | steering_located |
| 18 | `partsRollCallback` | 92.66 | 99.13 | -6.47 | unresolved |
| 26 | `TMario::hangPole` | 100.00 | 96.30 | +3.70 | unresolved |

## Every incomplete or unresolved case

- PR 03 `TStayPakkun::isHitValid` (audit steering): unresolved, analysis complete, semantic steering. src/Enemy/pakkun.cpp@7.0: IR changes but only steering shapes found: temp_alias; S* without the steering-only retained groups loses the match (labelled steering)
- PR 05 `TBaseNPC::execNpcObjCollision_` (audit mixed): unresolved, analysis complete, semantic unresolved. oracle reverted a group carrying real shapes: src/NPC/NpcCollision.cpp@0.5
- PR 06 `Hxs_PenDraw` (audit mixed): unresolved, analysis incomplete, semantic unresolved. incomplete groups: src/GC2D/hx_wiper.c@32.0; src/GC2D/hx_wiper.c@32.0: revert does not compile even with its neighbours
- PR 06 `Hxs_Logo_TexDraw` (audit steering): unresolved, analysis complete, semantic unresolved. src/GC2D/hx_wiper.c@16.0: IR changes but only steering shapes found: temp_alias, decl_reorder, float_form
- PR 06 `Hx_GameOver` (audit steering): unresolved, analysis complete, semantic steering. src/GC2D/hx_wiper.c@14.0: IR changes but only steering shapes found: temp_alias; S* without the steering-only retained groups loses the match (labelled steering)
- PR 07 `TBossMantaAdditionalCollisionSet::update` (audit steering): unresolved, analysis complete, semantic steering. src/Enemy/bossManta.cpp@24.0: IR changes but only steering shapes found: temp_alias; src/Enemy/bossManta.cpp@25.0: IR changes but only steering shapes found: temp_alias; src/Enemy/bossManta.cpp@26.0: IR changes but only steering shapes found: temp_alias; src/Enemy/bossManta.cpp@27.0: IR changes but only steering shapes found: temp_alias; S* without the steering-only retained groups loses the match (labelled steering)
- PR 08 `TWallAtGraph::init` (audit steering): unresolved, analysis complete, semantic unresolved. oracle reverted a group carrying real shapes: src/Enemy/Kumokun.cpp@1.0
- PR 08 `TChorobei::checkHit` (audit steering): unresolved, analysis complete, semantic steering. src/Enemy/cannon.cpp@1.0: IR changes but only steering shapes found: temp_alias; S* without the steering-only retained groups loses the match (labelled steering)
- PR 09 `TSilhouette::loadAfter` (audit steering): unresolved, analysis complete, semantic unresolved. oracle reverted a group carrying real shapes: src/MarioUtil/DrawUtil.cpp@0.0
- PR 11 `TAmenbo::init` (audit mixed): unresolved, analysis complete, semantic unresolved. src/Enemy/Amenbo.cpp@0.0: real and steering shapes in one group (temp_alias); separate them
- PR 12 `TYoshi::calcAnim` (audit steering): unresolved, analysis complete, semantic steering. src/Player/Yoshi.cpp@5.0: IR changes but only steering shapes found: temp_alias; S* without the steering-only retained groups loses the match (labelled steering)
- PR 15 `TSmallEnemy::expandCollision` (audit steering): unresolved, analysis complete, semantic unresolved. src/Enemy/smallEnemy.cpp@9.0: IR changes but no real shape found (other); src/Enemy/smallEnemy.cpp@9.1: IR changes but only steering shapes found: temp_alias
- PR 15 `TSmallEnemy::isFindMarioFromParam` (audit steering): unresolved, analysis complete, semantic unresolved. oracle reverted a group carrying real shapes: src/Enemy/smallEnemy.cpp@7.2
- PR 18 `partsRollCallback` (audit steering): unresolved, analysis complete, semantic unresolved. src/MoveBG/MapObjSirena.cpp@1.0: IR changes but no real shape found (other); src/MoveBG/MapObjSirena.cpp@3.0: IR changes but no real shape found (other)
- PR 19 `TGraphTracer::traceSpline(f32)` (audit mixed): unresolved, analysis complete, semantic unresolved. src/Enemy/graph.cpp@18.0: real and steering shapes in one group (temp_alias, accessor_swap); separate them
- PR 20 `TNormalLift::setGroundCollision` (audit steering): unresolved, analysis complete, semantic unresolved. oracle reverted a group carrying real shapes: src/MoveBG/MapObjRailBlock.cpp@5.0
- PR 22 `__sinit_MarNameRefGen_BossEnemy_cpp` (audit real): unresolved, analysis incomplete, semantic clean. order sensitive: forward and reverse reductions differ on include/Enemy/Killer.hpp@1.0, src/System/MarNameRefGen_Enemy.cpp@0.0
- PR 26 `TMario::hangPole` (audit steering): unresolved, analysis complete, semantic unresolved. src/Player/MarioCheckCol.cpp@1.2: IR changes but only steering shapes found: operand_order; src/Player/MarioCheckCol.cpp@2.0: real and steering shapes in one group (temp_alias); separate them
- PR 28 `TBaseNPC::setNoteEffectMtxPtr_` (audit mixed): unresolved, analysis complete, semantic unresolved. src/NPC/NpcEffect.cpp@1.0: real and steering shapes in one group (temp_alias); separate them

## All functions

| PR | function | audit | decision | label | analysis | base | cand | S* | revert | S* vs cand |
| - | - | - | - | - | - | - | - | - | - | - |
| 03 | `TNerveHanaSamboHide::execute` | steering | steering_located | steering | complete | 99.79 | 100.00 | 99.79 | 99.79 | code |
| 03 | `TNerveHanaSamboAppear::execute` | steering | steering_located | steering | complete | 99.76 | 100.00 | 99.76 | 99.76 | code |
| 03 | `TStayPakkun::isHitValid` | steering | unresolved | steering | complete | 99.70 | 100.00 | 99.70 | 99.70 | identical |
| 03 | `TPakkun::perform` | steering | steering_located | steering | complete | 93.71 | 100.00 | 93.71 | 93.71 | code |
| 03 | `TPoiHana::walkBehavior` | steering | steering_located | steering | complete | 99.31 | 100.00 | 99.31 | 99.31 | code |
| 04 | `TBossGessoManager::createModelData` | real | pass | real | complete | 99.23 | 100.00 | 100.00 | - | identical |
| 04 | `TBossGessoManager::initJParticle` | real | pass | real | complete | 99.92 | 100.00 | 100.00 | - | identical |
| 04 | `TNerveGessoTurn::execute` | steering | steering_located | steering | complete | 97.92 | 100.00 | 97.92 | 97.92 | code |
| 04 | `TGessoPolluteObj::getNowGravity` | steering | steering_located | steering | complete | 98.12 | 100.00 | 98.12 | 98.12 | code |
| 04 | `TGessoPolluteObj::rebirth` | steering | steering_located | steering | complete | 94.85 | 100.00 | 94.85 | 94.85 | code |
| 05 | `TBaseNPC::npcRecoverFromSinking` | steering | steering_located | steering | complete | 96.28 | 100.00 | 96.28 | 96.28 | code |
| 05 | `TBaseNPC::behaveToBeTrampled_` | mixed | steering_located | mixed | complete | 99.95 | 100.00 | 99.97 | 99.97 | stack_only |
| 05 | `TBaseNPC::execNpcObjCollision_` | mixed | unresolved | unresolved | complete | 98.54 | 100.00 | 97.58 | 98.59 | code |
| 05 | `TNpcInbetween::execPosInbetween` | steering | steering_located | steering | complete | 99.09 | 100.00 | 99.09 | 99.09 | code |
| 06 | `Hxs_PenDraw` | mixed | unresolved | unresolved | incomplete | 85.80 | 100.00 | 100.00 | 88.50 | identical |
| 06 | `Hxs_Logo_MagDraw` | steering | steering_located | steering | complete | 92.15 | 100.00 | 92.15 | 92.15 | code |
| 06 | `Hxs_Logo_TexDraw` | steering | unresolved | unresolved | complete | 71.10 | 100.00 | 83.70 | 71.10 | code |
| 06 | `Hx_GameOver` | steering | unresolved | steering | complete | 99.89 | 100.00 | 99.89 | 99.89 | identical |
| 07 | `TBossMantaAdditionalCollisionSet::update` | steering | unresolved | steering | complete | 99.47 | 100.00 | 99.47 | 99.47 | stack_only |
| 07 | `TBossManta::getPolluteRadius` | steering | steering_located | steering | complete | 99.45 | 100.00 | 99.45 | 99.45 | code |
| 07 | `TBEelTears::calcRootMatrix` | steering | steering_located | steering | complete | 97.33 | 100.00 | 97.33 | 97.33 | code |
| 07 | `TBEelTearsManager::createEnemies` | steering | steering_located | steering | complete | 99.78 | 100.00 | 99.78 | 99.78 | code |
| 08 | `TWallAtGraph::init` | steering | unresolved | unresolved | complete | 99.60 | 100.00 | 99.60 | 99.60 | code |
| 08 | `TChorobei::checkHit` | steering | unresolved | steering | complete | 98.77 | 100.00 | 98.77 | 98.77 | code |
| 08 | `TTelesa::initAttacker` | steering | steering_located | steering | complete | 99.68 | 100.00 | 99.68 | 99.68 | code |
| 09 | `SetViewFrustumClipCheck` | steering | steering_located | steering | complete | 99.49 | 100.00 | 99.49 | 99.49 | code |
| 09 | `TSilhouette::loadAfter` | steering | unresolved | unresolved | complete | 99.74 | 100.00 | 99.74 | 99.74 | code |
| 09 | `ShapePacketCallBackFunc` | real | pass | real | complete | 99.79 | 100.00 | 100.00 | - | identical |
| 10 | `draw_mist` | steering | steering_located | steering | complete | 99.92 | 100.00 | 99.92 | 99.92 | code |
| 10 | `TBathWaterMeshRenderer::makeNormalMap` | steering | steering_located | steering | complete | 99.73 | 100.00 | 99.73 | 99.73 | code |
| 10 | `TPollutionManager::cleanedAll` | steering | steering_located | steering | complete | 96.43 | 100.00 | 96.43 | 96.43 | code |
| 11 | `TAmenbo::init` | mixed | unresolved | unresolved | complete | 99.96 | 100.00 | 100.00 | 99.97 | identical |
| 11 | `TRocket::bind` | steering | steering_located | steering | complete | 97.14 | 100.00 | 97.14 | 97.14 | code |
| 11 | `TNerveTobiPukuGenerate::execute` | steering | steering_located | steering | complete | 96.23 | 100.00 | 96.23 | 96.23 | code |
| 12 | `TYoshiTongue::init` | steering | steering_located | steering | complete | 99.29 | 100.00 | 99.29 | 99.29 | code |
| 12 | `TModelWaterManager::calcWorldMinMax` | steering | steering_located | steering | complete | 97.61 | 100.00 | 97.61 | 97.61 | code |
| 12 | `TYoshi::calcAnim` | steering | unresolved | steering | complete | 98.60 | 100.00 | 98.60 | 98.60 | identical |
| 13 | `TNerveNameKuriLand::execute` | real | pass | real | complete | 83.94 | 100.00 | 100.00 | - | identical |
| 13 | `TEffectObjBase::moveObject` | steering | steering_located | steering | complete | 98.84 | 100.00 | 98.84 | 98.84 | code |
| 13 | `TEffectColumSand::reset` | steering | steering_located | steering | complete | 98.49 | 100.00 | 98.49 | 98.49 | code |
| 14 | `TCardSave::perform` | steering | steering_located | steering | complete | 98.33 | 100.00 | 98.33 | 98.33 | code |
| 14 | `TOptionSoundUnit::initSurroundAnm` | steering | steering_located | steering | complete | 99.73 | 100.00 | 99.73 | 99.73 | code |
| 14 | `TTalk2D2::moveBoardWindow` | steering | steering_located | steering | complete | 99.64 | 100.00 | 99.64 | 99.64 | code |
| 15 | `TSmallEnemy::expandCollision` | steering | unresolved | unresolved | complete | 98.61 | 100.00 | 99.68 | 98.61 | stack_only |
| 15 | `TSmallEnemy::isFindMarioFromParam` | steering | unresolved | unresolved | complete | 99.79 | 100.00 | 99.79 | 99.79 | code |
| 15 | `TSmallEnemy::isFindMario` | steering | steering_located | steering | complete | 96.68 | 100.00 | 96.68 | 96.68 | code |
| 16 | `TCardManager::getBookmarkInfos_` | steering | steering_located | steering | complete | 98.72 | 100.00 | 98.72 | 98.80 | code |
| 16 | `TMarioGamePad::read` | steering | steering_located | steering | complete | 99.88 | 100.00 | 99.88 | 99.88 | stack_only |
| 16 | `TMarioParticleManager::emitAndBindToMtx` | steering | steering_located | steering | complete | 99.38 | 100.00 | 99.38 | 99.38 | code |
| 17 | `MSHandle::calcDolby` | steering | steering_located | steering | complete | 98.92 | 100.00 | 98.92 | 98.92 | code |
| 17 | `MSoundSESystem::MSRandVol::getRandVol` | steering | steering_located | steering | complete | 99.29 | 100.00 | 99.29 | 99.29 | code |
| 17 | `MAnmSound::startAnimSound` | steering | steering_located | steering | complete | 99.42 | 100.00 | 99.42 | 99.42 | code |
| 18 | `TDemoCannon::initMapObj` | steering | steering_located | steering | complete | 99.08 | 100.00 | 99.08 | 99.08 | code |
| 18 | `partsRollCallback` | steering | unresolved | unresolved | complete | 99.12 | 100.00 | 92.66 | 99.13 | code |
| 19 | `TGraphWeb::startIsEnd() const` | steering | steering_located | steering | complete | 98.83 | 100.00 | 98.83 | 98.83 | code |
| 19 | `TGraphTracer::traceSpline(f32)` | mixed | unresolved | unresolved | complete | 99.35 | 100.00 | 99.93 | 98.98 | stack_only |
| 20 | `TWoodBlock::load` | steering | steering_located | steering | complete | 44.51 | 100.00 | 44.51 | 44.51 | code |
| 20 | `TNormalLift::setGroundCollision` | steering | unresolved | unresolved | complete | 95.74 | 100.00 | 95.74 | 95.74 | code |
| 21 | `evGetTalkNPCName` | steering | steering_located | steering | complete | 94.40 | 100.00 | 94.40 | 94.40 | code |
| 21 | `JGeometry::TVec3<f32>::set(const Vec&)` | real | pass | real | complete | 0.00 | 100.00 | 100.00 | 0.00 | identical |
| 22 | `__sinit_MarNameRefGen_BossEnemy_cpp` | real | unresolved | unresolved | incomplete | 0.00 | 100.00 | 100.00 | - | identical |
| 23 | `TEnemyMario::emWalkAround` | steering | steering_located | mixed | complete | 95.99 | 100.00 | 96.17 | 96.17 | code |
| 24 | `TMapObjPlane::depress(f32, f32, f32)` | steering | steering_located | steering | complete | 94.74 | 100.00 | 94.74 | 94.74 | code |
| 25 | `TJointCoin::makeObj` | steering | steering_located | steering | complete | 95.37 | 100.00 | 95.37 | 95.37 | code |
| 26 | `TMario::hangPole` | steering | unresolved | unresolved | complete | 96.30 | 100.00 | 100.00 | 96.30 | identical |
| 27 | `TCogwheelScale::receiveMessage` | steering | steering_located | steering | complete | 96.26 | 100.00 | 96.26 | 96.26 | code |
| 28 | `TBaseNPC::setNoteEffectMtxPtr_` | mixed | unresolved | unresolved | complete | 92.74 | 100.00 | 100.00 | 86.31 | identical |
| 29 | `TMapObjBase::emitAndRotateScale` | steering | steering_located | steering | complete | 96.20 | 100.00 | 96.20 | 96.20 | code |

## Runtime and attempt decision per PR

| PR | seconds | attempt |
| - | - | - |
| 03 | 47.2 | steering_located |
| 04 | 32.3 | steering_located |
| 05 | 15.6 | steering_located |
| 06 | 50.3 | steering_located |
| 07 | 67.4 | steering_located |
| 08 | 121.3 | steering_located |
| 09 | 25.6 | steering_located |
| 10 | 43.0 | steering_located |
| 11 | 47.3 | steering_located |
| 12 | 39.1 | steering_located |
| 13 | 38.1 | steering_located |
| 14 | 85.8 | steering_located |
| 15 | 28.5 | steering_located |
| 16 | 17.1 | steering_located |
| 17 | 19.3 | steering_located |
| 18 | 15.0 | steering_located |
| 19 | 16.1 | steering_located |
| 20 | 12.8 | steering_located |
| 21 | 18.7 | steering_located |
| 22 | 69.9 | unresolved |
| 23 | 32.7 | steering_located |
| 24 | 45.4 | steering_located |
| 25 | 18.5 | steering_located |
| 26 | 114.4 | steering_located |
| 27 | 56.2 | steering_located |
| 28 | 26.3 | steering_located |
| 29 | 28.9 | steering_located |
