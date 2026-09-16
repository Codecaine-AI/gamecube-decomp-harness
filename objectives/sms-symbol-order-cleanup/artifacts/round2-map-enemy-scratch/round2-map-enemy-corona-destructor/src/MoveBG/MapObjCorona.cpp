#include "MoveBG/MapObjCorona.hpp"
#include "MoveBG/MapObjBase.hpp"

void TBathtub::loadAfter() { }

void TBathtub::hipdrop(const JGeometry::TVec3<f32>&) { }

void TBathtub::quake(const JGeometry::TVec3<f32>&) { }

u8 TBathtub::getNumGripsDead() const { return 0; }

// Unused
void TBathtub::trample(const JGeometry::TVec3<f32>&) { }

// Unused
void TBathtub::liftMario(const JGeometry::TVec3<f32>&) { }

void TBathtub::tumble(f32, f32) { }

MtxPtr TBathtub::getTakingMtx() { return nullptr; }

// Unused
MtxPtr TBathtub::getShineMtx() { return nullptr; }

// Unused
MtxPtr TBathtub::getShineEffectMtx() { return nullptr; }

// Unused
MtxPtr TBathtub::getWaterMtx(int) { return nullptr; }

MtxPtr TBathtub::getSubmarineMtxInDemo() { return nullptr; }

MtxPtr TBathtub::getPeachMtxInDemo() { return nullptr; }

// Unused
MtxPtr TBathtub::getKoopaMtxInDemo() { return nullptr; }

MtxPtr TBathtub::getKoopaJrMtxInDemo() { return nullptr; }

BOOL TBathtub::receiveMessage(THitActor* sender, u32 message) { return false; }

Mtx* TBathtub::getRootJointMtx() const { return nullptr; }

void TBathtub::perform(u32 cue, JDrama::TGraphics* graphics) { }

void TBathtub::control() { }

void TBathtub::calcBathtubData() { }

void TBathtub::setupCollisions_() { }

void TBathtub::startDemo() { }

void TBathtub::removeCollisions_() { } // Unused

bool TBathtub::allowsTumble() const { return false; }

void TBathtub::calcRootMatrix() { }

// Unused
u8 TBathtub::getNearJuncture(const JGeometry::TVec3<f32>&) const { return 0; }

bool TBathtub::getNearGrip(const JGeometry::TVec3<f32>&, f32, f32*) const
{
	return false;
}

u8 TBathtub::getNextJuncture(const JGeometry::TVec3<f32>&,
                             const JGeometry::TVec3<f32>&) const
{
	return 0;
}

u8 TBathtub::getNextGrip(const JGeometry::TVec3<f32>&,
                         const JGeometry::TVec3<f32>&, f32, f32*) const
{
	return 0;
}

// Unused
void TBathtub::showMessage(u32) { }

void TBathtub::updatePosture_() { }

void TBathtub::load(JSUMemoryInputStream&) { }

TBathtub::TBathtub(const char* name)
    : TMapObjBase(name)
{
}

// Unused
bool TBathtub::isKillerLaunchable() const { return false; }

u8 TBathtub::getNumKillerLaunchable() const { return 0; }

bool TBathtub::isKillerAttackable() const { return false; }

// Unused
bool TBathtub::isBreaking() const { return false; }

u8 TBathtub::getNumKillerBurstable() const { return 0; }

TBathtub::~TBathtub() { }
