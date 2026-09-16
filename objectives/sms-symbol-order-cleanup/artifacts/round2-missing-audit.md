# Ranked Missing-Symbol Audit

Ten nonempty game units were selected for small missing counts and zero strict order/linkage errors in the saved final ledger.
No build, baseline operation, source edit, or live-runtime operation was performed.
All expected gains below remain conditional on parent compilation and strict/matching checks.

## Ready for Parent Verification

`round2-missing-mapobj-const.patch` adds const to the two related virtual getters in `include/MoveBG/MapObjHide.hpp`.
The map closure explicitly marks both CFv symbols weak at lines 36712 and 39311.
Map text entries at lines 64886 and 65977 give sizes 0x8 and 0xc.
Native objdump shows identical instructions between the emitted Fv getters and the original CFv getters.
Only their signatures differ.
The base and override must change together to preserve virtual dispatch.
Expected result is two missing symbols resolved and MapObjSirena becoming a strict pass; MapObjHide still has killNearWoodBox missing.

Sixteen source consumers were found by recursively tracing project includes.
They are listed in `round2-missing-mapobj-consumers.txt`; parent Ninja dependency tracking remains authoritative.
The original/current getter disassemblies are saved in `round2-missing-mapobj-getters-disassembly.txt`.

Two lower-confidence compiler experiments are also saved.
`round2-missing-camera-emission.patch` and `round2-missing-mapcheck-emission.patch` remove explicit inline from existing bodies.
These are experiments, not accepted fixes.
The camera caller must retain its existing 100% match.

## Ten Ranked Cases

### 1. `MoveBG/MapObjSirena`

Strict missing count: 1.

High-confidence source signature defect. Base getObjAppearPos lacks const in MapObjHide.hpp. Original and current getters have identical 8-byte instruction sequences. Shared const patch should resolve the sole missing symbol.

```text
  - getObjAppearPos__23TWaterHitPictureHideObjCFv
```

### 2. `MoveBG/MapObjHide`

Strict missing count: 2.

Same signature defect in derived getObjAppearPos, identical 12-byte instruction sequences. Shared const patch should resolve this symbol. killNearWoodBox remains a separate absent algorithm and is not reconstructed.

```text
  - killNearWoodBox__8TWoodBoxCFff (UNUSED)
  - getObjAppearPos__19THideObjPictureTwinCFv
```

### 3. `Camera/CameraMultiPlayer`

Strict missing count: 1.

Existing complete removePlayer body is explicitly inline in the CPP. Source TODO says it should not be marked inline. Map UNUSED size is 0x88. Proposed experiment removes only inline and stale TODO. Caller removeMultiPlayer currently matches 100%; reject if that caller loses its match or a call replaces its original inline loop.

```text
  - removePlayer__18TCameraMultiPlayerFPCQ29JGeometry8TVec3<f> (UNUSED)
```

### 4. `Map/MapCheck`

Strict missing count: 1.

Existing intersectLineList body is explicitly inline in the CPP. Map UNUSED size is 0x78. Proposed experiment removes only inline. Caller TMapCollisionData::intersectLine currently matches 71.4%; preserve its instruction comparison and all existing matched symbols. A successful strict check alone cannot justify caller regression.

```text
  - intersectLineList__FPC12TBGCheckListRCQ29JGeometry8TVec3<f>RCQ29JGeometry8TVec3<f>bPQ29JGeometry8TVec3<f> (UNUSED)
```

### 5. `Enemy/gesso`

Strict missing count: 1.

Existing checkDropInWater body is explicitly inline. Map UNUSED size is 0x144. Its source TODO says size and logic match but non-inline form will not inline. This is an existing code-generation tradeoff, so no patch proposed without analysis of the TNerveGessoFall caller.

```text
  - checkDropInWater__6TGessoFv (UNUSED)
```

### 6. `Map/PollutionCount`

Strict missing count: 1.

Existing TPollutionCounterBase constructor is defined inside the game header. Map UNUSED size is 0x30. Moving it out-of-line may produce the symbol but can change derived constructor inlining in other units. Original UNUSED binding is unknown; it does not prove the constructor was not inline. Defer rather than force emission.

```text
  - __ct__21TPollutionCounterBaseFv (UNUSED)
```

### 7. `Map/MapCollisionEntry`

Strict missing count: 1.

Existing TMapCollisionBase constructor is defined inside the game header. Map UNUSED size is 0x74. Same header emission question as PollutionCount, with more consumers. No proposed out-of-line move without caller evidence.

```text
  - __ct__17TMapCollisionBaseFv (UNUSED)
```

### 8. `GC2D/Option`

Strict missing count: 3.

Found a template const mismatch: map expects ArrayWrapper<Ul>::begin() const, current object emits ArrayWrapper<CUl>::begin() const. Current member is ArrayWrapper<const u32>. However setupToggle map signature itself accepts const u32*, so blindly changing template argument requires an unjustified const removal or changing the shared wrapper API. Documented only. Other missing functions are SMSGetMSound and JUTRect constructor emission.

```text
  - SMSGetMSound__Fv (UNUSED)
  - begin__Q29@unnamed@16ArrayWrapper<Ul>CFv (UNUSED)
  - __ct__7JUTRectFiiii
```

### 9. `Animal/AnimalManager`

Strict missing count: 1.

loadSaveParams_ has neither a declaration nor definition. Map UNUSED size is 0x80. TMewManager::load contains a plausible parameter-loading sequence, but extracting or reconstructing it would require algorithm/body evidence beyond this audit. No patch.

```text
  - loadSaveParams___18TAnimalManagerBaseFPCc (UNUSED)
```

### 10. `Strategic/objmanager`

Strict missing count: 1.

initObjArray(int) has a declaration but no definition. Map UNUSED size is 0x3c. load contains allocation/setup, but there is no differently mangled implementation. This is absent body reconstruction, not a signature fix. No patch.

```text
  - initObjArray__11TObjManagerFi (UNUSED)
```

## Additional Screened Cases

`MarioUtil/EffectUtil` and `MarioUtil/PacketUtil` each have a declared but absent UNUSED function, with no differently mangled counterpart.
`MarioUtil/ModelUtil` has a declared but absent SMS_DumpJ3DModel, map size 4 bytes.
An empty release-build debugging function is plausible, but the UNUSED map does not contain its opcode, so this audit did not invent a body.

No int-versus-long signature mismatch was established in the screened candidates.
The two getter const qualifiers are the concrete signature defect supported by exact original instructions.
