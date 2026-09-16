# Round 3: Map and MoveBG audit

Scope: 13 nonempty failing TUs selected from final round-2 ledger, excluding parent-owned MapObjCorona, MapObjHide, MapObjLib.
The exact selected rows are in `round3-map-owned.json`.
Empty files are excluded because they require decompilation.
No shared source edits, compiler/build commands, runtime operations or live-checkout access were performed by this agent.
All patch files are proposals for serial parent verification, not verified gains.
The final round-2 REPORT and rejected bath trial were read before this audit.

## Proposed trials, ordered by evidence

1. `round3-map-pollution-constructor.patch`: move the existing `TPollutionCounterBase` body from its class definition into PollutionCount.cpp at the map position, unchanged.
   The original map at line 66440 records an UNUSED body of 0x30.
   Both derived constructors already match 100%, and every current derived constructor definition is in this same CPP.
   Their exact direct diffs prove the base initialization is correct; they must remain 100% after the move.
   The map does not encode UNUSED binding, so this is testing a plausible source location, not inferring global linkage.
2. `round3-map-collision-constructor.patch`: same structural trial for `TMapCollisionBase`, UNUSED size 0x74 at map line 66137.
   All three derived classes have constructor definitions in MapCollisionEntry.cpp.
   Current original/body comparison for the Static constructor matches 100% including all base writes and MTXIdentity.
   Full diffs for all three derived constructors are saved.
   Preserve every caller and rebuild all header consumers.
3. `round3-map-base-setup-wrapper.patch`: replace the composed-matrix branch's `col->setMtx(mtx); col->setUp();` with existing `col->setUpMtx(mtx)`.
   The wrapper contains exactly those operations, is already used elsewhere in MapObjBase.cpp, and adds no work or artificial helper.
   Original makeObjAppeared inlines setMtx in its model-matrix branch but calls it in its composed-matrix branch at 0x80188ac0.
   Current code inlines both; its emitted helper is consequently missing.
   An extra existing inline layer is a plausible explanation, but the trial is not accepted until the original call reappears and caller matching does not regress.
   Do not add pragmas or fake extra calls if this hypothesis fails.
4. `round3-map-extract-{bianco,pinna,sirena,option}.patch`: independent extraction trials for four existing initStage switch blocks into original named map helpers.
   Original initStage's full diff matches every operation and differs only in frame/stack save locations (original 0x70, current 0x38).
   Each extracted body is copied from that existing code; guarded case breaks become function returns.
   Validate UNUSED sizes 0x64, 0x58, 0x48, 0x5c respectively, unchanged semantics, preserved caller instructions and zero full-report regressions.
   initStage's larger original frame supports missing inline helper layers, but does not alone prove exact helper boundaries.
   Sirena preserves the pre-existing SMS_LoadParticle wrapper marked fabricated in its game header; this trial does not validate that wrapper's historical spelling.

The constructor and setup-wrapper patches are independent and apply to separate source files.
Each stage extraction patch is independently based on the round-2 Map.cpp.
Their insertions share anchors, so integrating multiple accepted extractions needs conflict resolution to retain reverse-map source order: Option, Sirena, existing Monte/Mare/PinnaParco, PinnaBeach, Bianco, existing StageCommon/Stage.
No proposal changes middleware or SDK files.

## Every owned case

| Unit | Remaining strict findings | Disposition and concrete evidence |
| --- | --- | --- |
| Map/BathWaterManager | 1 missing, 1 ordering, 3 linkage | Defer. Rejected round2-bath moved the three render helpers in-class; they disappeared and render fell 93.8% to 51.3%. Accepted clearHeightMap is retained. Original weak render helpers need real compiler-context explanation; no forced emission. clearEFB is an existing unused empty stub with unknown body, so forcing it out would be false progress. |
| Map/Map | 7 missing | Four existing stage blocks have extraction trials above. initDolpic lacks unambiguous current case mapping and remains undocumented body reconstruction. Two vector overloads are declared but not defined; scalar/neighbor overloads suggest simple forwarding but UNUSED sizes (0x3c and 0x9c) alone cannot prove their complete dead bodies. No new wrappers proposed without parent decision on reconstruction scope. |
| Map/MapCollisionEntry | 1 missing | Existing base-constructor emission trial above. Correct initialization is present in matching derived caller; this is not an absent algorithm. |
| Map/MapMirror | 1 missing, 1 ordering | Defer compiler/caller reconstruction. Source has one scaleAdd in perform, while original perform has three out-of-line calls at 0x801e5090, 0x801e50c4, 0x801e50f8. Source explicitly leaves the other vector math as TODOs. Original local set<float> emission position differs from current; moving ordinary methods cannot explain it. No middleware edit or artificial call justified. |
| Map/MapWireManager | 1 missing | TTakeActor constructor exists in shared game header and is inlined into TMapWireActor constructor. Map UNUSED size 0x50. Unlike Collision/Pollution bases, TTakeActor has many derived classes across the game; moving its definition to this TU would change their visibility and emission. Defer until a sound shared-source arrangement explains all consumers. |
| Map/PollutionCount | 1 missing | Existing base-constructor emission trial above; both derived constructor callers presently 100%. |
| Map/PollutionEvent | 9 missing | Incomplete original classes. Current four event classes do not inherit a hit actor/view object and have no virtual destructors; original map has destructor adjustment thunks at offset 32. Existing constructor/perform bodies are mostly stubs. Proper base classes/layout and bodies must be recovered; adding empty destructors would conceal this defect. |
| MoveBG/MapObjBase | 1 missing | Existing wrapper trial above. Original setMtx is weak size 0x2c and one real original call is absent from current makeObjAppeared. Changing it globally out of line would contradict both map binding and other inline call sites. |
| MoveBG/MapObjDolpic | 3 missing | TWeathercock class/body is absent from source and headers. Missing control, destructor and adjustment thunk are all UNUSED; no similarly named implementation found. Requires genuine class/body reconstruction. |
| MoveBG/MapObjManager | 1 missing | Compiler-context mismatch in newAndRegisterObjByEventID. Original calls local set<float> at 0x8018e60c while constructing TTelesaBlock through TJuiceBlock; current game header already calls unk140.set(1,1,1), and factory already creates TTelesaBlock. Required operation exists but is inlined instead. No name correction or missing code established; do not instantiate or call the template artificially. |
| MoveBG/MapObjRailBlock | 1 missing | Missing MsWrap<float> has original three real calls at 0x801c7ce4, 0x801c7d08, 0x801c7d2c inside TRailBlock::control. Current control is empty. It is a consequence of unfinished decompilation, not an arbitrary missing template declaration. The separate TRollBlock angle-normalization loop does not justify inserting MsWrap to force emission. |
| MoveBG/MapObjSample | 5 missing | TMapObjSample is not declared or implemented; the TU implements only a TGateShadow stub. Missing methods and destructor require genuine class/body reconstruction. |
| MoveBG/MapObjTown | 2 missing | Current TShadowObj has only a load declaration and no inheritance; original map expects destructor plus offset-32 adjustment thunk. Correct hierarchy is unresolved. No invented inheritance or empty destructor proposed. |

## Evidence and verification

`round3-map-symbol-evidence.txt` contains exact original map lines for proposed constructors, setMtx and stage helper names/sizes.
`round3-map-evidence-0.txt` and `-1.txt`: Pollution derived constructor direct diffs.
`round3-map-evidence-2.txt` through `-4.txt`: Collision derived constructor direct diffs.
`round3-map-evidence-5.txt`: full makeObjAppeared direct diff.
`round3-map-evidence-6.txt`: full initStage direct diff.
The strict starting logs remain in `final-strict/` and are referenced by `round3-map-owned.json`.
Scratch candidate texts are stored under `round3-map-scratch/`.

For each parent-integrated trial, compile affected TU and header consumers, run unchanged strict validator, then `ninja changes_all` against the preserved original baseline.
Check matching per function and section, not only aggregate counts.
Reject a constructor move if its new UNUSED size differs from the original map or existing callers regress.
Reject extracted helpers if caller behavior/instructions regress or helper sizes do not support the proposed boundary.
Run full strict inventory after accepted header changes.
No claim of a resolved failure is made by this audit alone.

## Parent stage-helper trial update

The corrected combined stage extraction preserves the full matching report and fixes all four symbol-presence diagnostics, but three UNUSED sizes fail the stricter evidence requirement.
Only Option is map-exact (0x5c) and is being retained separately by the parent.
Bianco emits 0x70 versus 0x64, PinnaBeach 0x48 versus 0x58, Sirena 0x58 versus 0x48.
The combined patch is rejected as a final change.
No obvious source boundary correction is proven; the subsequent raw size/disassembly audit and reasons are in `round3-map-extract-stage-combined.md` and `round3-map-stage-size-audit-disassembly.txt`.
