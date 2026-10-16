# Fence backfill: SMS integration checkout vs upstream 81248bda

Checkout `/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/checkout` at `3b83dd46`, base `81248bda` (merge base with upstream), readiness at base, policy gatedPaths `src/System/MarNameRefGen*.cpp`. The checkout has no `orig/GMSJ01/files/mario.MAP` (readiness fails `missing_map` there), so the fence ran in a read-only clone at the same HEAD with the original map copied from `sb-up84`.

- Fence verdict: **reject**; rejected hunks **116**: not_ready 23, order_gated 40, unresolved 2, unused_unverified 51
- Actions: revert 69, keep 47 (not_ready: revert 23; order_gated: revert 40; unresolved: revert 2; unused_unverified: revert 4, keep 47)
- Cascade: 19 functions in 14 units + 3 top-level blocks
- UNUSED stub tests: dead 4, inlined 47
- Plan: 33 files, 88 splices, 8 new headers deleted; 0 review-only splices
- All hunk verdicts: foreign_header 6, local_helper 1, not_ready 23, order_gated 40, own_class 443, ready 5, unresolved 2, unused_unverified 51
- Scope: 19 foreign headers / 279 lines (soft limits 3 / 25); PR size 260 units, 291 files, 17978 lines

## not_ready (23)

| Id | File | Lines | Class / function | Action | Reason |
|---|---|---|---|---|---|
| H000 | `include/Animal/BeeHive.hpp` | 7-14 | `TBeeHive` | revert | TBeeHive belongs to mario/Animal/BeeHive, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H001 | `include/Animal/BeeHive.hpp` | 16-19 | `TBeeHiveManager` | revert | TBeeHiveManager belongs to mario/Animal/BeeHive, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H002 | `include/Animal/Bird.hpp` | 7-12 | `TAnimalBird` | revert | TAnimalBird belongs to mario/Animal/Bird, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H003 | `include/Animal/Bird.hpp` | 14-17 | `TAnimalBirdManager` | revert | TAnimalBirdManager belongs to mario/Animal/Bird, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H004 | `include/Enemy/BathtubPeach.hpp` | 8-15 | `TBathtubPeach` | revert | TBathtubPeach belongs to mario/Enemy/BathtubPeach, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H005 | `include/Enemy/BathtubPeach.hpp` | 18-21 | `TBathtubPeachManager` | revert | TBathtubPeachManager belongs to mario/Enemy/BathtubPeach, whose implementation of it has not started; do not add or change its declaration out of order (class introduc... |
| H006 | `include/Enemy/BossHanachan.hpp` | 77-84 | `TBossHanachanManager` | revert | TBossHanachanManager belongs to mario/Enemy/BossHanachanMain, whose implementation of it has not started; do not add or change its declaration out of order (class intr... |
| H007 | `include/Enemy/FruitsBoat.hpp` | 7-12 | `TFruitsBoat` | revert | TFruitsBoat belongs to mario/Enemy/fruitsboat, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H008 | `include/Enemy/FruitsBoat.hpp` | 14-19 | `TFruitsBoatManager` | revert | TFruitsBoatManager belongs to mario/Enemy/fruitsboat, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H009 | `include/Enemy/Koopa.hpp` | 7-19 | `TKoopa` | revert | TKoopa belongs to mario/Enemy/Koopa, whose implementation of it has not started; do not add or change its declaration out of order (members added/changed: public:; u8 ... |
| H010 | `include/Enemy/Koopa.hpp` | 22-25 | `TKoopaManager` | revert | TKoopaManager belongs to mario/Enemy/Koopa, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H011 | `include/Enemy/KoopaJr.hpp` | 30-37 | `TKoopaJr` | revert | TKoopaJr belongs to mario/Enemy/koopajr, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H012 | `include/Enemy/KoopaJr.hpp` | 40-43 | `TKoopaJrManager` | revert | TKoopaJrManager belongs to mario/Enemy/koopajr, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H013 | `include/Enemy/KoopaJr.hpp` | 46-53 | `TKoopaJrSubmarine` | revert | TKoopaJrSubmarine belongs to mario/Enemy/koopajr, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H014 | `include/Enemy/KoopaJr.hpp` | 56-59 | `TKoopaJrSubmarineManager` | revert | TKoopaJrSubmarineManager belongs to mario/Enemy/koopajr, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H015 | `include/Enemy/Kukku.hpp` | 6-11 | `TKukku` | revert | TKukku belongs to mario/Enemy/Kukku, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H016 | `include/Enemy/Kukku.hpp` | 13-18 | `TKukkuManager` | revert | TKukkuManager belongs to mario/Enemy/Kukku, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H017 | `include/Enemy/LimitKoopa.hpp` | 8-15 | `TLimitKoopa` | revert | TLimitKoopa belongs to mario/Enemy/limitkoopa, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H018 | `include/Enemy/LimitKoopa.hpp` | 18-21 | `TLimitKoopaManager` | revert | TLimitKoopaManager belongs to mario/Enemy/limitkoopa, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H019 | `include/Enemy/TabePuku.hpp` | 6-11 | `TTabePuku` | revert | TTabePuku belongs to mario/Enemy/TabePuku, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H020 | `include/Enemy/TabePuku.hpp` | 13-16 | `TTabePukuManager` | revert | TTabePukuManager belongs to mario/Enemy/TabePuku, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H021 | `include/Enemy/WireTrap.hpp` | 7-12 | `TWireTrap` | revert | TWireTrap belongs to mario/Enemy/wireTrap, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |
| H022 | `include/Enemy/WireTrap.hpp` | 14-17 | `TWireTrapManager` | revert | TWireTrapManager belongs to mario/Enemy/wireTrap, whose implementation of it has not started; do not add or change its declaration out of order (class introduced) |

## unresolved (2)

| Id | File | Lines | Class / function | Action | Reason |
|---|---|---|---|---|---|
| H023 | `include/Map/MapCollisionData.hpp` | 69-117 | `TBGWallCheckRecord` | revert | TBGWallCheckRecord is not in the target map/objects and is declared in a header (members added/changed: TBGWallCheckRecord(const JGeometry::TVec3<f32>&center,f32 ra) |
| H024 | `libs/JSystem/include/JSystem/JGeometry/JGVec3.hpp` | 106-127 | `JGeometry::TVec3` | revert | JGeometry::TVec3 is not in the target map/objects and is declared in a header (out-of-class definition added: JGeometry::TVec3::TVec3; out-of-class definition added: J... |

## order_gated (40)

| Id | File | Lines | Class / function | Action | Reason |
|---|---|---|---|---|---|
| H076 | `src/System/MarNameRefGen_BossEnemy.cpp` | 37-37 | `TOilBall::TOilBall` | revert | order-gated file references TOilBall::TOilBall via call; its readiness is unresolved (absent) |
| H077 | `src/System/MarNameRefGen_BossEnemy.cpp` | 51-51 | `TBossHanachan` | revert | order-gated file references TBossHanachan via new; its owner unit mario/Enemy/BossHanachanMain does not define its constructor yet |
| H078 | `src/System/MarNameRefGen_BossEnemy.cpp` | 54-54 | `TBossHanachanManager` | revert | order-gated file references TBossHanachanManager via new; its owner unit mario/Enemy/BossHanachanMain does not define its constructor yet |
| H079 | `src/System/MarNameRefGen_BossEnemy.cpp` | 75-75 | `TKoopa` | revert | order-gated file references TKoopa via new; its owner unit mario/Enemy/Koopa does not define its constructor yet |
| H080 | `src/System/MarNameRefGen_BossEnemy.cpp` | 78-78 | `TKoopaManager` | revert | order-gated file references TKoopaManager via new; its owner unit mario/Enemy/Koopa does not define its constructor yet |
| H081 | `src/System/MarNameRefGen_BossEnemy.cpp` | 93-93 | `TTinKoopa` | revert | order-gated file references TTinKoopa via new; its owner unit mario/Enemy/tinkoopa does not define its constructor yet |
| H082 | `src/System/MarNameRefGen_BossEnemy.cpp` | 96-96 | `TTinKoopaManager` | revert | order-gated file references TTinKoopaManager via new; its owner unit mario/Enemy/tinkoopa does not define its constructor yet |
| H083 | `src/System/MarNameRefGen_BossEnemy.cpp` | 105-105 | `TKoopaJrManager` | revert | order-gated file references TKoopaJrManager via new; its owner unit mario/Enemy/koopajr does not define its constructor yet |
| H084 | `src/System/MarNameRefGen_BossEnemy.cpp` | 108-108 | `TKoopaJr` | revert | order-gated file references TKoopaJr via new; its owner unit mario/Enemy/koopajr does not define its constructor yet |
| H085 | `src/System/MarNameRefGen_BossEnemy.cpp` | 111-111 | `TKoopaJrSubmarineManager` | revert | order-gated file references TKoopaJrSubmarineManager via new; its owner unit mario/Enemy/koopajr does not define its constructor yet |
| H086 | `src/System/MarNameRefGen_BossEnemy.cpp` | 115-115 | `TKoopaJrSubmarine` | revert | order-gated file references TKoopaJrSubmarine via new; its owner unit mario/Enemy/koopajr does not define its constructor yet |
| H087 | `src/System/MarNameRefGen_BossEnemy.cpp` | 124-124 | `TLimitKoopaManager` | revert | order-gated file references TLimitKoopaManager via new; its owner unit mario/Enemy/limitkoopa does not define its constructor yet |
| H088 | `src/System/MarNameRefGen_BossEnemy.cpp` | 127-127 | `TLimitKoopa` | revert | order-gated file references TLimitKoopa via new; its owner unit mario/Enemy/limitkoopa does not define its constructor yet |
| H089 | `src/System/MarNameRefGen_BossEnemy.cpp` | 136-136 | `TBathtubPeachManager` | revert | order-gated file references TBathtubPeachManager via new; its owner unit mario/Enemy/BathtubPeach does not define its constructor yet |
| H090 | `src/System/MarNameRefGen_BossEnemy.cpp` | 139-139 | `TBathtubPeach` | revert | order-gated file references TBathtubPeach via new; its owner unit mario/Enemy/BathtubPeach does not define its constructor yet |
| H091 | `src/System/MarNameRefGen_BossEnemy.cpp` | 142-142 | `TBossWanwan` | revert | order-gated file references TBossWanwan via new; its owner unit mario/Enemy/bosswanwan does not define its constructor yet |
| H092 | `src/System/MarNameRefGen_BossEnemy.cpp` | 145-145 | `TBossWanwanManager` | revert | order-gated file references TBossWanwanManager via new; its owner unit mario/Enemy/bosswanwan does not define its constructor yet |
| H093 | `src/System/MarNameRefGen_BossEnemy.cpp` | 160-160 | `TBossTelesa` | revert | order-gated file references TBossTelesa via new; its owner unit mario/Enemy/bosstelesa does not define its constructor yet |
| H094 | `src/System/MarNameRefGen_BossEnemy.cpp` | 163-163 | `TBossTelesaManager` | revert | order-gated file references TBossTelesaManager via new; its owner unit mario/Enemy/bosstelesa does not define its constructor yet |
| H095 | `src/System/MarNameRefGen_BossEnemy.cpp` | 166-166 | `TBubbleManager` | revert | order-gated file references TBubbleManager via new; its owner unit mario/Enemy/bosstelesa does not define its constructor yet |
| H096 | `src/System/MarNameRefGen_Enemy.cpp` | 71-71 | `TFruitsBoat` | revert | order-gated file references TFruitsBoat via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H097 | `src/System/MarNameRefGen_Enemy.cpp` | 74-74 | `TFruitsBoat` | revert | order-gated file references TFruitsBoat via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H098 | `src/System/MarNameRefGen_Enemy.cpp` | 77-77 | `TFruitsBoat` | revert | order-gated file references TFruitsBoat via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H099 | `src/System/MarNameRefGen_Enemy.cpp` | 80-80 | `TFruitsBoat` | revert | order-gated file references TFruitsBoat via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H100 | `src/System/MarNameRefGen_Enemy.cpp` | 83-83 | `TFruitsBoatManager` | revert | order-gated file references TFruitsBoatManager via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H101 | `src/System/MarNameRefGen_Enemy.cpp` | 86-86 | `TFruitsBoatManager` | revert | order-gated file references TFruitsBoatManager via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H102 | `src/System/MarNameRefGen_Enemy.cpp` | 89-89 | `TFruitsBoatManager` | revert | order-gated file references TFruitsBoatManager via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H103 | `src/System/MarNameRefGen_Enemy.cpp` | 92-92 | `TFruitsBoatManager` | revert | order-gated file references TFruitsBoatManager via new; its owner unit mario/Enemy/fruitsboat does not define its constructor yet |
| H104 | `src/System/MarNameRefGen_Enemy.cpp` | 101-101 | `TAnimalBird` | revert | order-gated file references TAnimalBird via new; its owner unit mario/Animal/Bird does not define its constructor yet |
| H105 | `src/System/MarNameRefGen_Enemy.cpp` | 104-104 | `TAnimalBirdManager` | revert | order-gated file references TAnimalBirdManager via new; its owner unit mario/Animal/Bird does not define its constructor yet |
| H106 | `src/System/MarNameRefGen_Enemy.cpp` | 122-122 | `TBeeHive` | revert | order-gated file references TBeeHive via new; its owner unit mario/Animal/BeeHive does not define its constructor yet |
| H107 | `src/System/MarNameRefGen_Enemy.cpp` | 125-125 | `TBeeHiveManager` | revert | order-gated file references TBeeHiveManager via new; its owner unit mario/Animal/BeeHive does not define its constructor yet |
| H108 | `src/System/MarNameRefGen_Enemy.cpp` | 353-353 | `TTabePukuManager` | revert | order-gated file references TTabePukuManager via new; its owner unit mario/Enemy/TabePuku does not define its constructor yet |
| H109 | `src/System/MarNameRefGen_Enemy.cpp` | 356-356 | `TTabePuku` | revert | order-gated file references TTabePuku via new; its owner unit mario/Enemy/TabePuku does not define its constructor yet |
| H110 | `src/System/MarNameRefGen_Enemy.cpp` | 359-359 | `TWireTrapManager` | revert | order-gated file references TWireTrapManager via new; its owner unit mario/Enemy/wireTrap does not define its constructor yet |
| H111 | `src/System/MarNameRefGen_Enemy.cpp` | 362-362 | `TWireTrap` | revert | order-gated file references TWireTrap via new; its owner unit mario/Enemy/wireTrap does not define its constructor yet |
| H112 | `src/System/MarNameRefGen_Enemy.cpp` | 386-386 | `TKillerManager` | revert | order-gated file references TKillerManager via new; its owner unit mario/Enemy/killer does not define its constructor yet |
| H113 | `src/System/MarNameRefGen_Enemy.cpp` | 389-389 | `TKiller` | revert | order-gated file references TKiller via new; its owner unit mario/Enemy/killer does not define its constructor yet |
| H114 | `src/System/MarNameRefGen_Enemy.cpp` | 448-448 | `TKukkuManager` | revert | order-gated file references TKukkuManager via new; its owner unit mario/Enemy/Kukku does not define its constructor yet |
| H115 | `src/System/MarNameRefGen_Enemy.cpp` | 451-451 | `TKukku` | revert | order-gated file references TKukku via new; its owner unit mario/Enemy/Kukku does not define its constructor yet |

## unused_unverified (51)

| Id | File | Lines | Class / function | Action | Reason |
|---|---|---|---|---|---|
| H025 | `src/Camera/CubeManagerBase.cpp` | 90-100 | `TCubeManagerBase::isInCube(Vec const &, char const *) const` | revert (stub test: dead (no target function changes); back to base) | UNUSED TCubeManagerBase::isInCube(Vec const &, char const *) const reconstructed without bound inlined evidence: no unused check |
| H026 | `src/Camera/cameralib.cpp` | 314-326 | `CLBCalcNearClipAngle(JGeometry::TVec3<float> *, S16Vec *, JGeometry::TVec3<float> const &, JGeometry::TVec3<float> const &, short, float)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED CLBCalcNearClipAngle(JGeometry::TVec3<float> *, S16Vec *, JGeometry::TVec3<float> const &, JGeometry::TVec3<float> const &, short, float) reconstructed without ... |
| H027 | `src/Camera/cameralib.cpp` | 410-427 | `CLBCalcNearFourPos(JGeometry::TVec3<float> *, JGeometry::TVec3<float> *, S16Vec *, JGeometry::TVec3<float> const &, JGeometry::TVec3<float> const &, short, float, JGeometry::TVec2<float> const &)` | revert (stub test: dead (no target function changes); back to base) | UNUSED CLBCalcNearFourPos(JGeometry::TVec3<float> *, JGeometry::TVec3<float> *, S16Vec *, JGeometry::TVec3<float> const &, JGeometry::TVec3<float> const &, short, floa... |
| H028 | `src/Enemy/BathtubKiller.cpp` | 318-323 | `TBathtubKiller::killBathtubKiller(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::killBathtubKiller(void) reconstructed without bound inlined evidence: no unused check |
| H029 | `src/Enemy/BathtubKiller.cpp` | 331-334 | `TBathtubKiller::explodeBathtubKiller(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::explodeBathtubKiller(void) reconstructed without bound inlined evidence: no unused check |
| H030 | `src/Enemy/BathtubKiller.cpp` | 405-419 | `TBathtubKiller::makeNoseColor(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::makeNoseColor(void) reconstructed without bound inlined evidence: no unused check |
| H031 | `src/Enemy/BathtubKiller.cpp` | 421-421 | `TBathtubKiller::getBathtubY(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::getBathtubY(void) reconstructed without bound inlined evidence: no unused check |
| H032 | `src/Enemy/BathtubKiller.cpp` | 475-484 | `TBathtubKiller::moveStraight(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::moveStraight(void) reconstructed without bound inlined evidence: no unused check |
| H033 | `src/Enemy/BathtubKiller.cpp` | 645-657 | `TBathtubKiller::updateTimers(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::updateTimers(void) reconstructed without bound inlined evidence: no unused check |
| H034 | `src/Enemy/BathtubKiller.cpp` | 659-665 | `TBathtubKiller::isAttackable(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::isAttackable(void) reconstructed without bound inlined evidence: no unused check |
| H035 | `src/Enemy/BathtubKiller.cpp` | 711-728 | `TBathtubKiller::canChase(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBathtubKiller::canChase(void) reconstructed without bound inlined evidence: no unused check |
| H036 | `src/Enemy/Kumokun.cpp` | 901-905 | `TKumokun::isCrashing(void) const` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TKumokun::isCrashing(void) const reconstructed without bound inlined evidence: no unused check |
| H037 | `src/Enemy/bossManta.cpp` | 59-63 | `TNerveMantaMove::theNerve(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TNerveMantaMove::theNerve(void) reconstructed without bound inlined evidence: no unused check |
| H038 | `src/Enemy/bossManta.cpp` | 71-75 | `TNerveMantaSpawn::theNerve(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TNerveMantaSpawn::theNerve(void) reconstructed without bound inlined evidence: no unused check |
| H039 | `src/Enemy/bossManta.cpp` | 77-81 | `TNerveMantaDeath::theNerve(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TNerveMantaDeath::theNerve(void) reconstructed without bound inlined evidence: no unused check |
| H040 | `src/Enemy/bossManta.cpp` | 83-87 | `TNerveMantaAppearDemo::theNerve(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TNerveMantaAppearDemo::theNerve(void) reconstructed without bound inlined evidence: no unused check |
| H041 | `src/Enemy/chuuhana.cpp` | 554-566 | `TChuuHana::margeVelocity(JGeometry::TVec3<float> &)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TChuuHana::margeVelocity(JGeometry::TVec3<float> &) reconstructed without bound inlined evidence: no unused check |
| H042 | `src/Enemy/chuuhana.cpp` | 721-737 | `TChuuHana::rolling(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TChuuHana::rolling(void) reconstructed without bound inlined evidence: no unused check |
| H043 | `src/Enemy/enemy.cpp` | 439-447 | `TSpineEnemy::updateStayCount(float)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TSpineEnemy::updateStayCount(float) reconstructed without bound inlined evidence: no unused check |
| H044 | `src/Enemy/graph.cpp` | 726-730 | `TGraphWeb::perform(long unsigned, JDrama::TGraphics *)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TGraphWeb::perform(long unsigned, JDrama::TGraphics *) reconstructed without bound inlined evidence: no unused check |
| H045 | `src/Enemy/hinokuri2.cpp` | 548-559 | `THinokuri2::emitPolParticle(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED THinokuri2::emitPolParticle(void) reconstructed without bound inlined evidence: no unused check |
| H046 | `src/Enemy/hinokuri2.cpp` | 618-631 | `THinokuri2::shakeCamera(int)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED THinokuri2::shakeCamera(int) reconstructed without bound inlined evidence: no unused check |
| H047 | `src/Enemy/pakkun.cpp` | 332-335 | `TPakkun::isHideEnd(void) const` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TPakkun::isHideEnd(void) const reconstructed without bound inlined evidence: no unused check |
| H048 | `src/GC2D/BoundPane.cpp` | 82-96 | `TBoundPane::makeNewPosition(float, JUTPoint &, JUTPoint &, JUTPoint &, JUTPoint &)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBoundPane::makeNewPosition(float, JUTPoint &, JUTPoint &, JUTPoint &, JUTPoint &) reconstructed without bound inlined evidence: no unused check |
| H049 | `src/GC2D/CardSave.cpp` | 1559-1570 | `TCardSave::changePattern(J2DPicture *, short, long unsigned)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TCardSave::changePattern(J2DPicture *, short, long unsigned) reconstructed without bound inlined evidence: no unused check |
| H050 | `src/GC2D/GCConsole2.cpp` | 1335-1355 | `TGCConsole2::startUpLeftBot(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TGCConsole2::startUpLeftBot(void) reconstructed without bound inlined evidence: no unused check |
| H051 | `src/MSound/MSound.cpp` | 1231-1238 | `MSound::getBstPitch(long unsigned)` | revert (stub test: dead (no target function changes); back to base) | UNUSED MSound::getBstPitch(long unsigned) reconstructed without bound inlined evidence: no unused check |
| H052 | `src/Map/BathWaterManager.cpp` | 482-493 | `initScreen2D(short, short)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED initScreen2D(short, short) reconstructed without bound inlined evidence: no unused check |
| H053 | `src/Map/Map.cpp` | 33-38 | `initOption(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED initOption(void) reconstructed without bound inlined evidence: no unused check |
| H054 | `src/Map/Map.cpp` | 41-44 | `initSirena(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED initSirena(void) reconstructed without bound inlined evidence: no unused check |
| H055 | `src/Map/Map.cpp` | 132-137 | `initPinnaBeach(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED initPinnaBeach(void) reconstructed without bound inlined evidence: no unused check |
| H056 | `src/Map/Map.cpp` | 140-147 | `initBianco(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED initBianco(void) reconstructed without bound inlined evidence: no unused check |
| H057 | `src/Map/Map.cpp` | 150-156 | `initDolpic(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED initDolpic(void) reconstructed without bound inlined evidence: no unused check |
| H058 | `src/Map/Map.cpp` | 324-327 | `TMap::isTouchedOneWall(JGeometry::TVec3<float> const &, float) const` | revert (stub test: dead (no target function changes); back to base) | UNUSED TMap::isTouchedOneWall(JGeometry::TVec3<float> const &, float) const reconstructed without bound inlined evidence: no unused check |
| H059 | `src/Map/Map.cpp` | 397-401 | `TMap::checkGroundExactY(JGeometry::TVec3<float> const &, TBGCheckData const * *) const` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMap::checkGroundExactY(JGeometry::TVec3<float> const &, TBGCheckData const * *) const reconstructed without bound inlined evidence: no unused check |
| H060 | `src/Map/MapEventMare.cpp` | 243-258 | `TMareEventDepressWall::finishEvent(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMareEventDepressWall::finishEvent(void) reconstructed without bound inlined evidence: no unused check |
| H061 | `src/Map/MapEventMare.cpp` | 260-265 | `TMareEventDepressWall::setJointPosX(float, int)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMareEventDepressWall::setJointPosX(float, int) reconstructed without bound inlined evidence: no unused check |
| H062 | `src/Map/MapEventMare.cpp` | 294-305 | `TMareEventDepressWall::emitEffect(int)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMareEventDepressWall::emitEffect(int) reconstructed without bound inlined evidence: no unused check |
| H063 | `src/Map/MapMirror.cpp` | 21-37 | `TMirrorCamera::makeMirrorViewMtx(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMirrorCamera::makeMirrorViewMtx(void) reconstructed without bound inlined evidence: no unused check |
| H064 | `src/Map/MapWarp.cpp` | 91-109 | `getWarpPointNo(char const *)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED getWarpPointNo(char const *) reconstructed without bound inlined evidence: no unused check |
| H065 | `src/Map/MapWarp.cpp` | 111-122 | `loadWarpPointPos(JSUMemoryInputStream &, int, Vec *)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED loadWarpPointPos(JSUMemoryInputStream &, int, Vec *) reconstructed without bound inlined evidence: no unused check |
| H066 | `src/Map/Shimmer.cpp` | 24-24 | `TShimmer::near(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TShimmer::near(void) reconstructed without bound inlined evidence: no unused check |
| H067 | `src/Map/Shimmer.cpp` | 26-26 | `TShimmer::far(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TShimmer::far(void) reconstructed without bound inlined evidence: no unused check |
| H068 | `src/NPC/NpcChange.cpp` | 208-211 | `TBaseNPC::changeNerveToWet_(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TBaseNPC::changeNerveToWet_(void) reconstructed without bound inlined evidence: no unused check |
| H069 | `src/Player/MarioDraw.cpp` | 525-535 | `CheckMarioFootPosCtrl(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED CheckMarioFootPosCtrl(void) reconstructed without bound inlined evidence: no unused check |
| H070 | `src/Player/MarioDraw.cpp` | 1725-1740 | `TMario::calcAnimHands(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMario::calcAnimHands(void) reconstructed without bound inlined evidence: no unused check |
| H071 | `src/Player/MarioParticle.cpp` | 317-320 | `TMario::smallRippleEffect(JGeometry::TVec3<float> *)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMario::smallRippleEffect(JGeometry::TVec3<float> *) reconstructed without bound inlined evidence: no unused check |
| H072 | `src/Player/MarioParticle.cpp` | 728-738 | `TMario::rocketEffectNozzle(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMario::rocketEffectNozzle(void) reconstructed without bound inlined evidence: no unused check |
| H073 | `src/Player/MarioSpecial.cpp` | 992-1014 | `TMario::getNozzleEmitVX(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMario::getNozzleEmitVX(void) reconstructed without bound inlined evidence: no unused check |
| H074 | `src/Player/MarioSpecial.cpp` | 1215-1227 | `TMario::setPullingAnm(JGeometry::TVec3<float> const &, float)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMario::setPullingAnm(JGeometry::TVec3<float> const &, float) reconstructed without bound inlined evidence: no unused check |
| H075 | `src/Player/MarioWait.cpp` | 80-94 | `TMario::checkPutStart(void)` | keep (stub test: inlined (a same-unit caller gets worse); keep with evidence) | UNUSED TMario::checkPutStart(void) reconstructed without bound inlined evidence: no unused check |

## Cascade

Names that disappear with the rejected edits (strong: new classes and names absent from the whole base tree; weak: members with a new declaration, counted only next to their class):

- H000 `TBeeHive` (include/Animal/BeeHive.hpp): strong TBeeHive; weak -
- H001 `TBeeHiveManager` (include/Animal/BeeHive.hpp): strong TBeeHiveManager; weak -
- H002 `TAnimalBird` (include/Animal/Bird.hpp): strong TAnimalBird; weak -
- H003 `TAnimalBirdManager` (include/Animal/Bird.hpp): strong TAnimalBirdManager; weak -
- H004 `TBathtubPeach` (include/Enemy/BathtubPeach.hpp): strong TBathtubPeach; weak -
- H005 `TBathtubPeachManager` (include/Enemy/BathtubPeach.hpp): strong TBathtubPeachManager; weak -
- H006 `TBossHanachanManager` (include/Enemy/BossHanachan.hpp): strong TBossHanachanManager; weak -
- H007 `TFruitsBoat` (include/Enemy/FruitsBoat.hpp): strong TFruitsBoat; weak -
- H008 `TFruitsBoatManager` (include/Enemy/FruitsBoat.hpp): strong TFruitsBoatManager; weak -
- H009 `TKoopa` (include/Enemy/Koopa.hpp): strong -; weak unk150
- H010 `TKoopaManager` (include/Enemy/Koopa.hpp): strong TKoopaManager; weak -
- H011 `TKoopaJr` (include/Enemy/KoopaJr.hpp): strong TKoopaJr; weak -
- H012 `TKoopaJrManager` (include/Enemy/KoopaJr.hpp): strong TKoopaJrManager; weak -
- H013 `TKoopaJrSubmarine` (include/Enemy/KoopaJr.hpp): strong TKoopaJrSubmarine; weak -
- H014 `TKoopaJrSubmarineManager` (include/Enemy/KoopaJr.hpp): strong TKoopaJrSubmarineManager; weak -
- H015 `TKukku` (include/Enemy/Kukku.hpp): strong TKukku; weak -
- H016 `TKukkuManager` (include/Enemy/Kukku.hpp): strong TKukkuManager; weak -
- H017 `TLimitKoopa` (include/Enemy/LimitKoopa.hpp): strong TLimitKoopa; weak -
- H018 `TLimitKoopaManager` (include/Enemy/LimitKoopa.hpp): strong TLimitKoopaManager; weak -
- H019 `TTabePuku` (include/Enemy/TabePuku.hpp): strong TTabePuku; weak -
- H020 `TTabePukuManager` (include/Enemy/TabePuku.hpp): strong TTabePukuManager; weak -
- H021 `TWireTrap` (include/Enemy/WireTrap.hpp): strong TWireTrap; weak -
- H022 `TWireTrapManager` (include/Enemy/WireTrap.hpp): strong TWireTrapManager; weak -
- H024 `JGeometry::TVec3` (libs/JSystem/include/JSystem/JGeometry/JGVec3.hpp): strong ASSIGN_COPY, EAssignCopy, assignCopy; weak -

Changed functions and added top-level lines that still use them after the rejected edits (each goes back to its base text, or is deleted when new):

| Unit | File | Function | Lines | Status | Via |
|---|---|---|---|---|---|
| None | `include/System/ParamInst.hpp` | `template<>inlineTParamT<JGeometry::TVec3<f32>>::TParamT` | 51-58 | added | ASSIGN_COPY |
| None | `include/System/ParamInst.hpp` | `TParamVec::TParamVec` | 63-71 | changed | ASSIGN_COPY |
| mario/Enemy/BathtubKiller | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::isAboided` | 668-708 | changed | ASSIGN_COPY |
| mario/Enemy/Kumokun | `src/Enemy/Kumokun.cpp` | `TKumokun::bind` | 210-283 | changed | ASSIGN_COPY |
| mario/Enemy/Kumokun | `src/Enemy/Kumokun.cpp` | `TKumokun::rotateGoalDirToLocal` | 791-804 | changed | ASSIGN_COPY |
| mario/Enemy/cannon | `src/Enemy/cannon.cpp` | `TCannon::setKillerGoalPoint` | 847-863 | changed | ASSIGN_COPY |
| mario/Enemy/fireWanwan | `src/Enemy/fireWanwan.cpp` | `TFireWanwan::bindBody` | 1635-1688 | changed | ASSIGN_COPY, assignCopy |
| mario/Enemy/hamukuri | `src/Enemy/hamukuri.cpp` | `DEFINE_NERVE` | 2662-2704 | changed | ASSIGN_COPY |
| mario/Enemy/telesa | `src/Enemy/telesa.cpp` | `TTelesa::behaveToWater` | 366-395 | changed | assignCopy |
| mario/MarioUtil/ShadowUtil | `src/MarioUtil/ShadowUtil.cpp` | `TMBindShadowManager::calcVtx` | 1330-1614 | changed | ASSIGN_COPY |
| mario/MoveBG/MapObjBall | `src/MoveBG/MapObjBall.cpp` | `getBallVelocity` | 320-324 | added | ASSIGN_COPY |
| mario/MoveBG/MapObjBall | `src/MoveBG/MapObjBall.cpp` | `TMapObjBall::calcCurrentMtx` | 326-363 | changed | getBallVelocity |
| mario/MoveBG/MapObjMare | `src/MoveBG/MapObjMare.cpp` | `TMuddyBoat::touchWall` | 769-779 | changed | assignCopy |
| mario/MoveBG/MapObjMare | `src/MoveBG/MapObjMare.cpp` | `TMuddyBoat::bind` | 794-840 | changed | ASSIGN_COPY, assignCopy |
| mario/MoveBG/MapObjMonte | `src/MoveBG/MapObjMonte.cpp` | `TFluff::control` | 827-883 | changed | ASSIGN_COPY |
| mario/NPC/NpcNerve | `src/NPC/NpcNerve.cpp` | `DEFINE_NERVE` | 144-198 | changed | ASSIGN_COPY |
| mario/NPC/NpcWalkTurn | `src/NPC/NpcWalkTurn.cpp` | `TBaseNPC::isCanWalk` | 8-21 | changed | ASSIGN_COPY |
| mario/NPC/NpcWalkTurn | `src/NPC/NpcWalkTurn.cpp` | `TBaseNPC::execWalk` | 23-91 | changed | ASSIGN_COPY |
| mario/Player/MarioSpecial | `src/Player/MarioSpecial.cpp` | `TMario::wireWait` | 705-796 | changed | ASSIGN_COPY, assignCopy |
| mario/System/MarNameRefGen_BossEnemy | `src/System/MarNameRefGen_BossEnemy.cpp` | `<top-level>` | 2-2 | added_lines | #include include/Enemy/BathtubPeach.hpp |
| mario/System/MarNameRefGen_BossEnemy | `src/System/MarNameRefGen_BossEnemy.cpp` | `<top-level>` | 13-15 | added_lines | #include include/Enemy/LimitKoopa.hpp |
| mario/System/MarNameRefGen_Enemy | `src/System/MarNameRefGen_Enemy.cpp` | `<top-level>` | 44-50 | added_lines | #include include/Animal/BeeHive.hpp, #include include/Animal/Bird.hpp, #include include/Enemy/FruitsBoat.hpp, #include include/Enemy/Kukku.hpp, #include include/Enemy/TabePuku.hpp, #include include/Enemy/WireTrap.hpp |

## UNUSED stub tests (`steering_check.py unused-test`, shadow roots, 1 job each, max 3 at once)

| Job | File | Function | Status | Action | Evidence |
|---|---|---|---|---|---|
| u00 | `src/Camera/CubeManagerBase.cpp` | `TCubeManagerBase::isInCube(Vec const &, char const *) const` | dead | revert | no target-present function changes status or match with the body stubbed |
| u01 | `src/Camera/cameralib.cpp` | `CLBCalcNearClipAngle(JGeometry::TVec3<float> *, S16Vec *, JGeometry::TVec3<float> const &, JGeometry::TVec3<float> const &, short, float)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: CLBCalcNearNinePos(JGeometry::TVec3<float>*, S16Ve; CLBCalcNearNinePos(JGeometry::TVec3<float>*, S16Vec*, const JGeometry::TVec3<float>&, const JGeometry::TVec3<float>&, short, float, const JGeometry::TVec2<float>&) 91.8562%->78.3987% |
| u02 | `src/Camera/cameralib.cpp` | `CLBCalcNearFourPos(JGeometry::TVec3<float> *, JGeometry::TVec3<float> *, S16Vec *, JGeometry::TVec3<float> const &, JGeometry::TVec3<float> const &, short, float, JGeometry::TVec2<float> const &)` | dead | revert | no target-present function changes status or match with the body stubbed |
| u03 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::killBathtubKiller(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TBathtubKiller::perform(unsigned long, JDrama::TGr; TBathtubKiller::perform(unsigned long, JDrama::TGraphics*) 79.0825%->71.9003% |
| u04 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::explodeBathtubKiller(void)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TBathtubKiller::isCollidMove(THitActor*) 69.5618% ; TBathtubKiller::isCollidMove(THitActor*) 69.5618%->51.4008%, TBathtubKiller::receiveMessage(THitActor*, unsigned long) 62.6065%->51.3355% |
| u05 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::makeNoseColor(void)` | inlined | keep | 5 function(s) of this unit get worse with the body stubbed: TBathtubKiller::perform(unsigned long, JDrama::TGr; TBathtubKiller::perform(unsigned long, JDrama::TGraphics*) 79.0825%->65.7182%, TBathtubKiller::bind() 72.2749%->72.255% |
| u06 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::getBathtubY(void)` | inlined | keep | 3 function(s) of this unit get worse with the body stubbed: TNerveBathtubKillerWander::execute(TSpineBase<TLiv; TNerveBathtubKillerWander::execute(TSpineBase<TLiveActor>*) const 88.0714%->85.584%, TBathtubKiller::isAboided() 90.9904%->87.7847% |
| u07 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::moveStraight(void)` | inlined | keep | 7 function(s) of this unit get worse with the body stubbed: TNerveBathtubKillerStraight::execute(TSpineBase<TL; TNerveBathtubKillerStraight::execute(TSpineBase<TLiveActor>*) const 86.98%->29.07%, TNerveBathtubKillerWander::execute(TSpineBase<TLiveActor>*) const 88.0714%->87.9454% |
| u08 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::updateTimers(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TBathtubKiller::perform(unsigned long, JDrama::TGr; TBathtubKiller::perform(unsigned long, JDrama::TGraphics*) 79.0825%->75.5292% |
| u09 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::isAttackable(void)` | inlined | keep | 4 function(s) of this unit get worse with the body stubbed: TBathtubKiller::isCollidMove(THitActor*) 69.5618% ; TBathtubKiller::isCollidMove(THitActor*) 69.5618%->64.8352%, TBathtubKiller::attackToMario() 93.8119%->64.9208% |
| u10 | `src/Enemy/BathtubKiller.cpp` | `TBathtubKiller::canChase(void)` | inlined | keep | 9 function(s) of this unit get worse with the body stubbed: TNerveBathtubKillerWander::execute(TSpineBase<TLiv; TNerveBathtubKillerWander::execute(TSpineBase<TLiveActor>*) const 88.0714%->24.8025%, TBathtubKiller::isAboided() 90.9904%->90.9665% |
| u11 | `src/Enemy/Kumokun.cpp` | `TKumokun::isCrashing(void) const` | inlined | keep | 9 function(s) of this unit get worse with the body stubbed: TNerveKumokunFly::execute(TSpineBase<TLiveActor>*); TNerveKumokunFly::execute(TSpineBase<TLiveActor>*) const 100.0%->95.6629%, TNerveKumokunPostFreeze::execute(TSpineBase<TLiveActor>*) const 100.0%->90.0804% |
| u12 | `src/Enemy/bossManta.cpp` | `TNerveMantaMove::theNerve(void)` | inlined | keep | 6 function(s) of this unit get worse with the body stubbed: TBossMantaManager::TMantaMessageState::update() 10; TBossMantaManager::TMantaMessageState::update() 100.0%->99.6429%, TBossMantaManager::TMantaBattleState::update() 100.0%->99.9239% |
| u13 | `src/Enemy/bossManta.cpp` | `TNerveMantaSpawn::theNerve(void)` | inlined | keep | 5 function(s) of this unit get worse with the body stubbed: TBossMantaManager::TMantaMessageState::update() 10; TBossMantaManager::TMantaMessageState::update() 100.0%->80.9018%, TBossMantaManager::TMantaBattleState::update() 100.0%->99.9239% |
| u14 | `src/Enemy/bossManta.cpp` | `TNerveMantaDeath::theNerve(void)` | inlined | keep | 4 function(s) of this unit get worse with the body stubbed: TBossMantaManager::TMantaBattleState::update() 100; TBossMantaManager::TMantaBattleState::update() 100.0%->99.9239%, TBossManta::initNthGeneration(int) 99.9204%->99.8469% |
| u15 | `src/Enemy/bossManta.cpp` | `TNerveMantaAppearDemo::theNerve(void)` | inlined | keep | 3 function(s) of this unit get worse with the body stubbed: TBossMantaManager::TMantaBattleState::update() 100; TBossMantaManager::TMantaBattleState::update() 100.0%->99.9239%, TBossManta::initNthGeneration(int) 99.9204%->92.5755% |
| u16 | `src/Enemy/chuuhana.cpp` | `TChuuHana::margeVelocity(JGeometry::TVec3<float> &)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TChuuHana::moveObject() 95.4229% -> 77.8943%, TChu; TChuuHana::moveObject() 95.4229%->77.8943%, TChuuHana::behaveToWater(THitActor*) 97.272%->89.4145% |
| u17 | `src/Enemy/chuuhana.cpp` | `TChuuHana::rolling(void)` | inlined | keep | 17 function(s) of this unit get worse with the body stubbed: TNerveChuuHanaRoll::execute(TSpineBase<TLiveActor; TNerveChuuHanaRoll::execute(TSpineBase<TLiveActor>*) const 85.7721%->46.3676%, TNerveChuuHanaKeepBalance::execute(TSpineBase<TLiveActor>*) const 100.0%->99.9595% |
| u18 | `src/Enemy/enemy.cpp` | `TSpineEnemy::updateStayCount(float)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TSpineEnemy::zigzagToCurPathNode(float, float, flo; TSpineEnemy::zigzagToCurPathNode(float, float, float, float) 93.8677%->89.7032%, TSpineEnemy::walkToCurPathNode(float, float, float) 98.984%->92.1821% |
| u19 | `src/Enemy/graph.cpp` | `TGraphWeb::perform(long unsigned, JDrama::TGraphics *)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TGraphGroup::perform(unsigned long, JDrama::TGraph; TGraphGroup::perform(unsigned long, JDrama::TGraphics*) 100.0%->96.8182% |
| u20 | `src/Enemy/hinokuri2.cpp` | `THinokuri2::emitPolParticle(void)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TNerveHino2Pollute::execute(TSpineBase<TLiveActor>; TNerveHino2Pollute::execute(TSpineBase<TLiveActor>*) const 99.8941%->91.4025%, TNerveHino2GraphWander::execute(TSpineBase<TLiveActor>*) const 99.907%->93.516% |
| u21 | `src/Enemy/hinokuri2.cpp` | `THinokuri2::shakeCamera(int)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TNerveHino2Squat::execute(TSpineBase<TLiveActor>*); TNerveHino2Squat::execute(TSpineBase<TLiveActor>*) const 100.0%->83.25% |
| u22 | `src/Enemy/pakkun.cpp` | `TPakkun::isHideEnd(void) const` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TNervePakkunGenerate::execute(TSpineBase<TLiveActo; TNervePakkunGenerate::execute(TSpineBase<TLiveActor>*) const 99.9291%->53.9134% |
| u23 | `src/GC2D/BoundPane.cpp` | `TBoundPane::makeNewPosition(float, JUTPoint &, JUTPoint &, JUTPoint &, JUTPoint &)` | inlined | keep | 4 function(s) of this unit get worse with the body stubbed: TBoundPane::update() 74.192% -> 34.2634%, TBoundPa; TBoundPane::update() 74.192%->34.2634%, TBoundPane::setPaneSize(long, const JUTPoint&, const JUTPoint&, const JUTPoint&) 100.0%->99.6552% |
| u24 | `src/GC2D/CardSave.cpp` | `TCardSave::changePattern(J2DPicture *, short, long unsigned)` | inlined | keep | 5 function(s) of this unit get worse with the body stubbed: TCardSave::waitForAnyKeyBM(TEProgress) 99.9211% ->; TCardSave::waitForAnyKeyBM(TEProgress) 99.9211%->99.9014%, TCardSave::waitForSelect3(TEProgress, TEProgress, TEProgress) 99.925%->99.9083% |
| u25 | `src/GC2D/GCConsole2.cpp` | `TGCConsole2::startUpLeftBot(void)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TGCConsole2::pauseOut() 100.0% -> 89.083%, TGCCons; TGCConsole2::pauseOut() 100.0%->89.083%, TGCConsole2::endCameraDemo() 99.8628%->83.5229% |
| u26 | `src/MSound/MSound.cpp` | `MSound::getBstPitch(long unsigned)` | dead | revert | no target-present function changes status or match with the body stubbed |
| u27 | `src/Map/BathWaterManager.cpp` | `initScreen2D(short, short)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TBathWaterFlatRenderer::render(JDrama::TGraphics*,; TBathWaterFlatRenderer::render(JDrama::TGraphics*, const TBathtubData&, TBathWater**, TBathWaterParams**, int) 99.809%->89.3821% |
| u28 | `src/Map/Map.cpp` | `initOption(void)` | inlined | keep | 5 function(s) of this unit get worse with the body stubbed: initStage() 99.7963% -> 81.9537%, initStageCommon(; initStage() 99.7963%->81.9537%, initStageCommon() 99.6359%->99.3098% |
| u29 | `src/Map/Map.cpp` | `initSirena(void)` | inlined | keep | 5 function(s) of this unit get worse with the body stubbed: initStage() 99.7963% -> 80.1852%, initStageCommon(; initStage() 99.7963%->80.1852%, initStageCommon() 99.6359%->99.3098% |
| u30 | `src/Map/Map.cpp` | `initPinnaBeach(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: initStage() 99.7963% -> 89.6111%; initStage() 99.7963%->89.6111% |
| u31 | `src/Map/Map.cpp` | `initBianco(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: initStage() 99.7963% -> 81.2685%; initStage() 99.7963%->81.2685% |
| u32 | `src/Map/Map.cpp` | `initDolpic(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: initStage() 99.7963% -> 83.1296%; initStage() 99.7963%->83.1296% |
| u33 | `src/Map/Map.cpp` | `TMap::isTouchedOneWall(JGeometry::TVec3<float> const &, float) const` | dead | revert | no target-present function changes status or match with the body stubbed |
| u34 | `src/Map/Map.cpp` | `TMap::checkGroundExactY(JGeometry::TVec3<float> const &, TBGCheckData const * *) const` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TMap::update() 99.9412% -> 99.8431%, initStageComm; TMap::update() 99.9412%->99.8431%, initStageCommon() 99.6359%->99.6087% |
| u35 | `src/Map/MapEventMare.cpp` | `TMareEventDepressWall::finishEvent(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMareEventDepressWall::rising() 100.0% -> 56.289%; TMareEventDepressWall::rising() 100.0%->56.289% |
| u36 | `src/Map/MapEventMare.cpp` | `TMareEventDepressWall::setJointPosX(float, int)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMareEventDepressWall::rising() 100.0% -> 82.4541%; TMareEventDepressWall::rising() 100.0%->82.4541% |
| u37 | `src/Map/MapEventMare.cpp` | `TMareEventDepressWall::emitEffect(int)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMareEventDepressWall::rising() 100.0% -> 82.555%; TMareEventDepressWall::rising() 100.0%->82.555% |
| u38 | `src/Map/MapMirror.cpp` | `TMirrorCamera::makeMirrorViewMtx(void)` | inlined | keep | 7 function(s) of this unit get worse with the body stubbed: TMirrorModelManager::perform(unsigned long, JDrama; TMirrorModelManager::perform(unsigned long, JDrama::TGraphics*) 55.8926%->40.0556%, TMirrorModelManager::isUpperThanMirrorPlane(const JGeometry::TVec3<float>&) const 100.0%->99.9107% |
| u39 | `src/Map/MapWarp.cpp` | `getWarpPointNo(char const *)` | inlined | keep | 3 function(s) of this unit get worse with the body stubbed: TMapWarp::TMapWarp() 100.0% -> 99.2857%, TMapWarp:; TMapWarp::TMapWarp() 100.0%->99.2857%, TMapWarp::init(JSUMemoryInputStream&) 99.8713%->88.4257% |
| u40 | `src/Map/MapWarp.cpp` | `loadWarpPointPos(JSUMemoryInputStream &, int, Vec *)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMapWarp::init(JSUMemoryInputStream&) 99.8713% -> ; TMapWarp::init(JSUMemoryInputStream&) 99.8713%->65.2525% |
| u41 | `src/Map/Shimmer.cpp` | `TShimmer::near(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TShimmer::perform(unsigned long, JDrama::TGraphics; TShimmer::perform(unsigned long, JDrama::TGraphics*) 100.0%->96.142% |
| u42 | `src/Map/Shimmer.cpp` | `TShimmer::far(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TShimmer::perform(unsigned long, JDrama::TGraphics; TShimmer::perform(unsigned long, JDrama::TGraphics*) 100.0%->96.7901% |
| u43 | `src/NPC/NpcChange.cpp` | `TBaseNPC::changeNerveToWet_(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TBaseNPC::behaveToHitObject_(THitActor*, EnumHitNp; TBaseNPC::behaveToHitObject_(THitActor*, EnumHitNpcObjectKind) 99.9472%->92.2007% |
| u44 | `src/Player/MarioDraw.cpp` | `CheckMarioFootPosCtrl(void)` | inlined | keep | 5 function(s) of this unit get worse with the body stubbed: MarioFootDirLCtrl(J3DNode*, int) 89.1402% -> 0.853; MarioFootDirLCtrl(J3DNode*, int) 89.1402%->0.8537%, MarioFootPosLCtrl(J3DNode*, int) 99.9103%->1.7949% |
| u45 | `src/Player/MarioDraw.cpp` | `TMario::calcAnimHands(void)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TMario::calcAnim(unsigned long, JDrama::TGraphics*; TMario::calcAnim(unsigned long, JDrama::TGraphics*) 99.3511%->81.9031%, TMario::initModel() 99.4086%->92.1797% |
| u46 | `src/Player/MarioParticle.cpp` | `TMario::smallRippleEffect(JGeometry::TVec3<float> *)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMario::runningRippleEffect() 100.0% -> 72.1364%; TMario::runningRippleEffect() 100.0%->72.1364% |
| u47 | `src/Player/MarioParticle.cpp` | `TMario::rocketEffectNozzle(void)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMario::rocketEffectStart() 100.0% -> 54.6078%; TMario::rocketEffectStart() 100.0%->54.6078% |
| u48 | `src/Player/MarioSpecial.cpp` | `TMario::getNozzleEmitVX(void)` | inlined | keep | 2 function(s) of this unit get worse with the body stubbed: TMario::wireRolling() 98.6578% -> 92.9552%, TMario; TMario::wireRolling() 98.6578%->92.9552%, TMario::wireHanging() 94.7122%->79.6659% |
| u49 | `src/Player/MarioSpecial.cpp` | `TMario::setPullingAnm(JGeometry::TVec3<float> const &, float)` | inlined | keep | 1 function(s) of this unit get worse with the body stubbed: TMario::pulling() 99.0717% -> 87.2368%; TMario::pulling() 99.0717%->87.2368% |
| u50 | `src/Player/MarioWait.cpp` | `TMario::checkPutStart(void)` | inlined | keep | 12 function(s) of this unit get worse with the body stubbed: TMario::waitMain() 100.0% -> 87.8816%, TMario::ju; TMario::waitMain() 100.0%->87.8816%, TMario::jumpEndCommon(int, int) 100.0%->99.8438% |

## Rollback plan

| File | Unit | Revert splices | Review splices | Deletes file | Kinds |
|---|---|---|---|---|---|
| `include/Animal/BeeHive.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Animal/Bird.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Enemy/BathtubPeach.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Enemy/BossHanachan.hpp` | None | 1 | 0 | False | class_delete 1 |
| `include/Enemy/FruitsBoat.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Enemy/Koopa.hpp` | None | 2 | 0 | False | class_base 1, class_delete 1 |
| `include/Enemy/KoopaJr.hpp` | None | 4 | 0 | False | class_delete 4 |
| `include/Enemy/Kukku.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Enemy/LimitKoopa.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Enemy/TabePuku.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Enemy/WireTrap.hpp` | None | 2 | 0 | True | class_delete 2 |
| `include/Map/MapCollisionData.hpp` | None | 1 | 0 | False | class_base 1 |
| `include/System/ParamInst.hpp` | None | 2 | 0 | False | function_delete 1, function_base 1 |
| `libs/JSystem/include/JSystem/JGeometry/JGVec3.hpp` | None | 1 | 0 | False | header_region 1 |
| `src/Camera/CubeManagerBase.cpp` | mario/Camera/CubeManagerBase | 1 | 0 | False | function_delete 1 |
| `src/Camera/cameralib.cpp` | mario/Camera/cameralib | 1 | 0 | False | function_delete 1 |
| `src/Enemy/BathtubKiller.cpp` | mario/Enemy/BathtubKiller | 1 | 0 | False | function_base 1 |
| `src/Enemy/Kumokun.cpp` | mario/Enemy/Kumokun | 2 | 0 | False | function_base 2 |
| `src/Enemy/cannon.cpp` | mario/Enemy/cannon | 1 | 0 | False | function_base 1 |
| `src/Enemy/fireWanwan.cpp` | mario/Enemy/fireWanwan | 1 | 0 | False | function_base 1 |
| `src/Enemy/hamukuri.cpp` | mario/Enemy/hamukuri | 1 | 0 | False | function_base 1 |
| `src/Enemy/telesa.cpp` | mario/Enemy/telesa | 1 | 0 | False | function_base 1 |
| `src/MSound/MSound.cpp` | mario/MSound/MSound | 1 | 0 | False | function_base 1 |
| `src/Map/Map.cpp` | mario/Map/Map | 1 | 0 | False | function_delete 1 |
| `src/MarioUtil/ShadowUtil.cpp` | mario/MarioUtil/ShadowUtil | 1 | 0 | False | function_base 1 |
| `src/MoveBG/MapObjBall.cpp` | mario/MoveBG/MapObjBall | 2 | 0 | False | function_delete 1, function_base 1 |
| `src/MoveBG/MapObjMare.cpp` | mario/MoveBG/MapObjMare | 2 | 0 | False | function_base 2 |
| `src/MoveBG/MapObjMonte.cpp` | mario/MoveBG/MapObjMonte | 1 | 0 | False | function_base 1 |
| `src/NPC/NpcNerve.cpp` | mario/NPC/NpcNerve | 1 | 0 | False | function_base 1 |
| `src/NPC/NpcWalkTurn.cpp` | mario/NPC/NpcWalkTurn | 2 | 0 | False | function_base 2 |
| `src/Player/MarioSpecial.cpp` | mario/Player/MarioSpecial | 1 | 0 | False | function_base 1 |
| `src/System/MarNameRefGen_BossEnemy.cpp` | mario/System/MarNameRefGen_BossEnemy | 22 | 0 | False | lines 21, function_delete 1 |
| `src/System/MarNameRefGen_Enemy.cpp` | mario/System/MarNameRefGen_Enemy | 18 | 0 | False | lines 18 |

## Validation

Validation of this plan: fence_revert.py --out-dir /tmp/sms-fence-overlay --verify-fence, then fence-work/compile_check.py (shadow roots of the clone, 3 MWCC jobs, SMS.mch rebuilt per phase from that phase's headers; the checkout's SMS.mch is stale and fails 29 HEAD units with `macro 'RAD_TO_DEG' redefined`). Units that hit the 300 s MWCC timeout under host load are rebuilt once (`retried_after_timeout`).
- Overlay: 33 files, 88 splices, 25 rewritten (10 equal to base), 8 deleted, self-check errors 0. Fence over base -> HEAD+overlay: rejected {'unused_unverified': 47}; all 47 are the kept/review items; unexpected 0.
- MWCC compile all units: 693/693 build with the overlay; failures none; retried after timeout: JSystem/J2D/J2DGrafContext, JSystem/J2D/J2DOrthoGraph

Nothing is applied. `python3 fence_revert.py` (dry run) or `--out-dir DIR` (overlay of reverted files + `DELETED.txt`); `--include-review` adds the review splices. It reads base/head from git and refuses when a head file no longer matches `after_sha256`.
