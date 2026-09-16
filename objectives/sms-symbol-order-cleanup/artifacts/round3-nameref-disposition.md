# Five Name-Reference Factories, Round 3 Disposition

Read AGENTS.md and AGENT_MATCHING_TIPS.md during the prior audit and retained their restrictions.
The accepted round-2 main-factory initializer and rejected explicit-class experiment were reviewed before this round.
No shared source/header files, build products, Wine processes, or live harness state were changed by this sub-agent.
All proposals are scratch patches for parent compilation and review.
Counts below are the round-2 final strict inventory, before round-3 integration.

| Owned File | Current Strict Findings | Disposition |
|---|---|---|
| System/MarNameRefGen.cpp | 5 missing, 15 linkage mismatches, template ordering at round-2 checkpoint | Round-3 structural template patch verified: all 15 linkage mismatches fixed; unchanged 5 missing; remaining order inversions only in restricted JDrama helpers. |
| System/MarNameRefGen_BossEnemy.cpp | 5 missing | Sound initializer restoration ready. Optional exact TOilBall forwarding-constructor/factory recovery ready. Demo Hanachan class structures absent. |
| System/MarNameRefGen_Enemy.cpp | 17 missing | Optional exact TMewManager forwarding constructor ready. Most remaining cases require missing class/constructor reconstruction, not signature edits. |
| System/MarNameRefGen_Map.cpp | Pass | No changes proposed. Three commented factory branches remain, but strict validation does not assess implementation completeness. |
| System/MarNameRefGen_MapObj.cpp | 29 missing, weak-order warning | Missing base virtual bodies and incomplete inlining/class constructors need separate reconstruction. No artificial emission requests proposed. |

## Ready Trials

1. `round3-nameref-boss-sinit.patch` restores the existing two MSound includes. Original local initializer is 0x2fc with identical 15-list guard order to main factory and MenuDir. Exact sequences are saved in `round3-nameref-boss-sinit-evidence.json`.
2. `round3-nameref-oilball.patch` restores original OilBall construction through existing TOilBall class, with the missing inline forwarding constructor recovered from the complete target callsite. Detailed evidence and header consumers are in the adjacent .md.
3. `round3-nameref-mew.patch` supplies the declared-but-undefined TMewManager forwarding constructor, recovered from the complete original callsite. The factory already constructs this class, so no new callsite is added. Evidence and consumers are in the adjacent .md.

The latter two recover complete short constructor bodies, not placeholder stubs.
The empty constructor compound statements represent base-constructor delegation plus compiler-generated derived vtable assignment, exactly what the target performs.
Count no gain until MWCC strict and matching verification accepts the trial.

## Main Factory

The two missing JGadget pointer-vector destructors differ in template argument shape: original `TVector_pointer<T*>`, current `TVector_pointer<T>`.
The current middleware template itself adds the pointer level to its value/iterator types.
Changing only the game template argument to a pointer would double the pointer level.
This is a middleware-interface reconstruction question, not a validator bug and not a safe game-only textual replacement.
Leave restricted middleware untouched.

The other three missing functions are the unused load/loadAfter/searchF methods of TNameRefPtrAryT<TStageEventInfo>.
The existing factory constructs the value-array specialization instead.
Bodies exist generically, but original instantiation intent and placement are unresolved.
Do not change the factory collection type or add dummy calls just to emit the symbols.

The 15 binding failures are current class-inline game template methods versus original globals.
The same generic methods for StageEventInfo and StageEnemyInfo must remain weak according to the map.
The previous explicit-class-only trial failed and was not repeated.
A possible real structural explanation is out-of-class generic template bodies plus explicit instantiation for the five global groups, leaving the two implicit groups weak.
A small compiler probe must establish this binding distinction before any broad header refactor is defensible.
The parent was notified of that hypothesis.

Ordering involves JDrama view-list helper placement and std::uninitialized_fill_n instances.
No ordinary game function permutation fixes this independently.
Restricted template definitions are not edited.

## Boss Factory

The absent static initializer is directly recoverable through existing game includes and has a known exact target.
The absent TBEelTears destructor corresponds to the original derived TOilBall construction, whose current branch is commented and incorrectly says TBEelTears.
Original code allocates 0x170 bytes, calls TBEelTears with 油ダマ, and installs TOilBall primary/secondary vtables.
The optional trial repairs that actual class construction.

TDemoBossHanachan and TDemoBossHanachanManager are not declared in the current 18-line BossHanachan.hpp, which only declares nerve types.
Their constructors/destructors cannot be restored by an honest declaration shuffle.
The missing JGeometry set specialization also depends on original class construction that is currently absent; no explicit middleware instantiation is forced.
The source has 36 commented factory branches, indicating partial reconstruction independently of strict checks.

## Enemy Factory

The TAnimalManagerBase destructor should be needed by the original inline TMewManager constructor.
Its complete body is evident from the original callsite and supplied as an optional trial.

The following missing items are associated with absent or incomplete factory class construction: TTobiPuku, TTobiPukuManager, TTobiPukuLaunchPad, TTobiPukuLaunchPadManager, TPakkun, TSamboFlower, TNameKuriLauncherManager, and THamuKuriLauncherManager.
Their factory branches are commented; launcher manager class definitions are absent from the current game headers.
Restoring branches blindly would either fail compilation or construct the wrong object.

TSimpleEffect, TLauncherManager, TPoiHana, TGesso, and TNameKuriManager destructors have existing base classes, but emission depends on the original inlined derived constructors and vtable generation.
Adding explicit empty destructors only to chase symbols is not proposed.
The rotation constructor is a middleware template emission dependent on missing class initialization, also not forced.
TEnemyManager::restoreDrawBuffer and changeDrawBuffer already have inline empty definitions; missing standalone copies in this factory reflect class/vtable emission context, not missing bodies.
The source has 70 commented factory branches.

## Map-Object Factory

TMapObjBase declares the missing getRadiusAtY, getTakingMtx, setModelMtx, loadBeforeInit, calc, draw, dead, touchWater, getHitObjNumMax, and getDepthAtFloating methods, but tracked source has no corresponding definitions.
TTakeActor::getRadiusAtY is also only declared.
These need real body reconstruction from target assembly, which was not replaced with guesses or empty implementations.

Other missing methods already have inline bodies: TSirenaRollMapObj getRollAngX/Y/Z, TTakeActor::ensureTakeSituation, THitActor::receiveMessage, and TTakeActor destructor.
Their absence here is an emission-context issue linked to constructor/vtable reconstruction.
The remaining missing destructors and TTelesaSlot constructor likewise need a class-specific reconstruction audit, not manufactured references.

The existing weak-symbol ordering warning is advisory and was not treated as an error to eliminate.
The source has 15 commented factory branches.

## Verification

Parent owns applying, compiling, rejecting, and accepting each patch serially.
Require direct strict comparison and function-level matching checks, then required ninja changes_all and full inventory for the accepted batch.
Do not overwrite the preserved upstream baseline.
All before-counts and missing symbol names are saved in `round3-nameref-inventory.json`.

## Later Measured Template Result

After the initial audit, a four-way isolated MWCC probe established the real binding mechanism.
Out-of-class generic methods plus explicit instantiation emit globals; implicit instances and inline destructors stay weak.
The parent tested the structurally supported patch and resolved all 15 linkage failures without function or section matching regressions.
Order inversions fell from 12 pairs to five preexisting JDrama-only pairs; no new inversion or missing symbol was introduced.
See `round3-nameref-template-structure.md` for measured evidence.
