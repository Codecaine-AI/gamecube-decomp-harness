# Evidence-Backed Game Template Structure Trial

## Measured Parent Trial Result

Parent compiled the patch and ran `ninja changes_all`.
The saved build log shows 182 compilation steps followed by report generation and comparison.
All 15 original linkage mismatches are resolved.
The same five missing symbols remain, with no additions.
The checker now examines 28 non-weak symbols instead of 13 because the 15 repaired symbols have the correct global binding.

An independent pairwise-order audit reconstructed expected and actual sequences from both saved strict logs.
The original 12 inverted symbol pairs shrink to five.
Every remaining inversion was already present before this patch, and all five involve only JDrama view-list helpers.
No new ordering inversion involves any repaired game template or any other symbol.
The std::uninitialized_fill_n placement defects are resolved.
This is partial progress within a still-failing TU, not a new full strict pass.

The saved per-function and per-section report has zero regressions against the round-2 checkpoint.
Parent's immediate-before comparison also reports zero regressions; the only changed matching value is MarNameRefGen .rodata, improving from 88.19072% to 88.91352%.
Matched function/code/data totals are unchanged by this particular template patch.
Current read-only nm checks additionally confirm that all three StageEventInfo methods in MarNameRefGen and all three StageEnemyInfo methods in enemytable remain weak, along with their destructors.

Evidence: `round3-nameref-template-measured-review.json`, `round3-nameref-template-current-bindings.json`, and saved `round3-template-structure-*` build, strict, report, and verification artifacts.
The parent still owns the final repository-wide strict inventory for the entire accepted batch.

Patch changes two game headers and System/MarNameRefGen.cpp only.
No middleware or runtime source changes.
The six existing generic method bodies move outside their classes within the same headers, without inline qualification.
Body tokens are unchanged, verified in round3-nameref-template-bodies.json.
Constructors, destructors, getters, method declarations, and virtual ordering remain unchanged.
The factory's existing body and accepted initializer includes remain unchanged.

## Why This Differs From the Rejected Trial

The old trial added explicit instantiations to methods still defined in-class.
The isolated compiler probe demonstrates that class-inline functions remain weak even when explicitly instantiated.
Out-of-class generic definitions behave differently: implicit instantiation remains weak, explicit class instantiation becomes global.
Inline destructors remain weak in all four combinations.
The probe's eval, set, and destructor instruction bytes are identical across all variants.
See round3-template-probe/README.md and full commands/results.

## Exact Instantiation Set

The original closure records all three load/loadAfter/searchF methods global for these five class specializations:

- TNameRefAryT<TStagePositionInfo>, map lines 39773-39785.
- TNameRefPtrAryT<TCubeGeneralInfo>, 20409-20417.
- TNameRefAryT<TCameraMapTool>, 39693-39705.
- TNameRefPtrAryT<TNameRefAryT<TScenarioArchiveName> >, 39735-39737.
- TNameRefAryT<TScenarioArchiveName>, 39720-39732.

Only these five get explicit class instantiations.
TNameRefAryT<TStageEventInfo> and TNameRefPtrAryT<TStageEnemyInfo> remain implicit because the map requires weak functions.
The unused TNameRefPtrAryT<TStageEventInfo> specialization remains unresolved, not forced into this trial.

Explicit classes appear in reverse original map group order around the existing JDrama view-list instantiation, consistent with inline-deferred emission.
The observed original order is StagePositionInfo, CubeGeneralInfo, JDrama view-list, CameraMapTool, nested ScenarioArchiveName pointer-array, ScenarioArchiveName value-array.
The two methods in the probe similarly reverse on explicit instantiation.
This supports the chosen order but does not prove the compiler will place all nested helper emissions as expected.

## Risks and Required Checks

Both headers have broad indirect consumers through Application.hpp, MarDirector.hpp, CubeManagerBase.hpp, EnemyTable.hpp, CameraMapTool.hpp, and PositionHolder.hpp.
The parent must rebuild all consumers and compare per-function matching, not only aggregate matched bytes.
In particular preserve StageEventInfo weak methods in MarNameRefGen, StageEnemyInfo weak methods in enemytable, all previously matching code, and no new strict failures.

Expected gain is up to 15 linkage fixes.
The original five missing symbols may remain.
Original template ordering may remain partly wrong because the JDrama helper definitions are restricted and unchanged.
Reject if new missing symbols or matching losses outweigh the supported correction; retain diagnostics instead of adding specialization bodies, compiler pragmas, or arbitrary references.
