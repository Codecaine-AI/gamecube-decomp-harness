# MarNameRefGen Audit, Round 2

## Status

Two independent source-only compiler trials prepared.
Neither is accepted or counted as a fix until the parent compiles and compares output.
No repository source/header, build output, live checkout, Wine runtime, queue, or configuration was changed by this sub-agent.
Read `AGENTS.md` and `docs/AGENT_MATCHING_TIPS.md` before this audit.

The saved strict result has six missing symbols, one ordering category, and 15 binding mismatches.
Evidence is in `final-strict/mario__System__MarNameRefGen.log`, original `orig/GMSJ01/files/mario.MAP`, current `build/GMSJ01/src/System/MarNameRefGen.o`, and original `build/GMSJ01/asm/System/MarNameRefGen.s`.

## Trial A: Explicit Game Template Instantiations

Patch: `round2-name-ref.patch`.
Adds five explicit class instantiations in `src/System/MarNameRefGen.cpp` before the existing JDrama instantiation.
All existing function bodies and headers remain unchanged.
This is a compiler experiment, not a demonstrated fix.

The original map explicitly marks `searchF`, `loadAfter`, and `load` global for these types:

| Game Template Argument | Class | Map Closure Lines | Original/Current Sizes, searchF / loadAfter / load |
|---|---|---|---|
| TStagePositionInfo | TNameRefAryT | 39773-39785 | 0x9c / 0x60 / 0x1f8 |
| TCubeGeneralInfo | TNameRefPtrAryT | 20409-20417 | 0x9c / 0x60 / 0x110 |
| TCameraMapTool | TNameRefAryT | 39693-39705 | 0x9c / 0x60 / 0x1f8 |
| TNameRefAryT<TScenarioArchiveName> | TNameRefPtrAryT | 39735-39737 | 0x9c / 0x60 / 0x110 |
| TScenarioArchiveName | TNameRefAryT | 39720-39732 | 0x9c / 0x60 / 0x1d8 |

Current `nm -S --defined-only` reports W for all 15 methods.
All their current byte sizes equal the original map sizes, though equal size alone does not prove instruction identity.
The corresponding template destructors are already weak as required.
The generic methods are currently defined in-class in `include/Strategic/NameRefAry.hpp` and `include/Strategic/NameRefPtrAry.hpp`.

A blanket move of those bodies out of their classes is not justified.
The same map explicitly marks TNameRefAryT<TStageEventInfo> methods weak in this TU, lines 39675-39689.
It also marks TNameRefPtrAryT<TStageEnemyInfo> methods weak in enemytable.cpp, lines 39662-39664.
These cases rule out a universal linkage conversion.

Explicit template instantiation is plausible source structure, and the TU already explicitly instantiates TViewObjPtrListT<THitActor, TViewObj>.
The unresolved compiler question is whether MWCC gives explicit instantiations of class-inline methods global linkage while leaving destructors weak.
Reject the trial if linkage does not improve, if correctly weak methods/destructors become global, or if it introduces ordering/matching regressions.
Do not introduce fabricated specialization bodies or pragmas to force the result.

No headers change, so the direct compile consumer is only MarNameRefGen.
Linking can still resolve a weak definition in another TU to a newly strong definition, so full matching validation is necessary.
Current users worth checking if an accepted fix later needs header changes are Camera/CubeManagerBase.cpp, Enemy/enemytable.cpp, System/Application.cpp, System/MarDirectorSetup2.cpp, System/PositionHolder.cpp, and Camera/CameraMapTool.cpp.
System/MarDirector.hpp includes NameRefAry.hpp and has many additional transitive consumers.

## Trial B: Restore the Existing Sound Initializers

Patch: `round2-name-ref-sinit.patch`.
Adds the same two game-header includes and explanatory comment already present at `src/System/MenuDir.cpp:21`.
The includes are `<MSound/MSSetSound.hpp>` followed by `<MSound/MSoundBGM.hpp>`.
No middleware source/header is changed.

Original MarNameRefGen has a local `__sinit_MarNameRefGen_cpp` of size 0x2fc, map line 62194 and asm lines 6668-6875.
The current object has no such symbol.
The original body contains 15 calls to `__register_global_object`, following JSUPtrList initialization, guarded by template static-list construction flags.
The guard sequence is exactly the same as the original `__sinit_MenuDir_cpp` sequence.
MenuDir currently passes strict validation with these two includes.

Expected initializer order:

```text
MSBgm
MSSetSoundGrp
MSSetSound
JALSeModEffDGrp
JALSeModPitDGrp
JALSeModVolDGrp
JALSeModEffFGrp
JALSeModPitFGrp
JALSeModVolFGrp
JALSeModEffDist
JALSeModPitDist
JALSeModVolDist
JALSeModEffFunk
JALSeModPitFunk
JALSeModVolFunk
```

Original map closure at 51873-51891 also lists 15 local 0xc-byte BSS registration records, @6138 through @6152.
Compiler-generated numeric labels need not have the same literal values for objdiff matching, but size, initialization sequence, relocations, and BSS layout should agree.
Test this patch independently of Trial A to distinguish effects.
Require the emitted initializer to match the original, existing matched symbols to remain unchanged, and no new strict errors.

## Remaining Findings

The two absent JGadget TVector_pointer destructors have a type-shape mismatch, not evidence of absent destructor bodies.
The map names TVector_pointer<P16TCubeGeneralInfo> and TVector_pointer<P55TNameRefAryT<...>>.
Our game base uses TVector_pointer<T>, and the middleware template currently defines value_type as T* and iterator as T** at `include/JSystem/JGadget/std-vector.hpp:348`.
It emits a destructor with the non-pointer template argument spelling.
Changing only the game argument to T* would make the existing middleware interface use an extra pointer level.
Leave this unresolved because a proper interface correction involves restricted middleware.
Do not normalize these names away in the validator.

The three missing TNameRefPtrAryT<TStageEventInfo> methods are UNUSED with sizes searchF 0x9c, loadAfter 0x60, load 0x110, map 62174-62176.
The factory constructs TNameRefAryT<TStageEventInfo>, not that pointer-array specialization.
Generic bodies exist, so an explicit pointer-array instantiation could reproduce them without inventing bodies.
Their original emission reason and appropriate instantiation placement remain unverified.
No speculative calls or factory type changes are proposed.

Ordering includes JDrama TViewObjPtrListT loadSuper/loadAfterSuper versus their parent methods, plus std::uninitialized_fill_n specializations.
The current source has only one ordinary getNameRef function and an existing explicit JDrama template instantiation.
This is compiler/template emission structure, not a simple sequence of ordinary game function definitions to swap.
Middleware and runtime template edits are restricted.
Leave these ordering errors documented unless a source-only instantiation arrangement is supported by compiler evidence without harming matches.

## Verification Required by Parent

1. Preserve the existing upstream baseline and first-batch accepted source changes.
2. Apply and compile each independent trial, then run the unchanged strict checker on MarNameRefGen.
3. Compare existing per-symbol matching and original initializer assembly, plus `ninja changes_all` for accepted trials.
4. Reject trials without a supported gain and document compiler evidence here.
5. Refresh the complete strict inventory and durable ledger after accepted integration.
