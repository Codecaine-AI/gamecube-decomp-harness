# Review Follow-Up

## Template Structure Patch

Re-read the full patch and re-extracted all six original and proposed method bodies.
All six are token-identical after whitespace removal and match the previously recorded SHA-256 digests.
The original headers were read from git HEAD because parent integration began during this review.
The only method-definition semantic change is removal of implicit inline status by moving generic definitions outside the class.
That change is intentional and supported by the four-way MWCC binding probe.
Class layout, base types, data members, method signatures, virtual declaration order, destructor definitions, constructors, and getter bodies are unchanged.

Reparsed original map text layout independently.
The five global method groups occur in this order: StagePositionInfo at 0x800f32a8, CubeGeneralInfo at 0x800f3b74, CameraMapTool at 0x800f4164, nested ScenarioArchiveName pointer-array at 0x800f4ab0, and ScenarioArchiveName value-array at 0x800f4cbc.
The JDrama view-list group intervenes between CubeGeneralInfo and CameraMapTool.
Within every game group the map order is searchF, loadAfter, load, matching reverse generic definition order.
Patch instantiation order is the reverse of these map groups around the existing JDrama instantiation.
Raw parsed rows are in round3-nameref-template-map-order.json.

An include-graph audit found 183 tracked source files transitively reaching either template header.
This is a conservative textual graph, not a substitute for actual Ninja dependency rebuilding.
All are game sources; no restricted library source was found in that consumer set.
The list includes ShadowUtil, whose compiler-generated local-class names are already an uncertain validation case.
Moving template definitions can change internal compiler names or emission order even in TUs without direct template method calls.
Therefore all consumer objects need strict validation as well as full matching comparison.
Consumer paths are recorded in round3-nameref-consumers.json.

The direct real construction contexts include CubeManagerBase.cpp:37 constructing the TCubeGeneralInfo pointer array, and enemytable.cpp:17 constructing the TStageEnemyInfo specialization as a base.
Application.cpp and MarDirectorSetup2.cpp access existing arrays through searches and virtual operations; the template class layout and lookup signatures remain unchanged.

The patch is supported for a controlled trial.
No independent source-correctness rejection reason was found.
Do not accept solely on the expected 15 binding fixes if it adds missing symbols, strict failures in other consumers, or loses existing matches.
Probe byte identity does not establish real-program codegen identity.

## OilBall Patch

Re-read patch and original caller at 0x800fdd9c-0x800fdde4.
The original allocates 0x170 bytes, calls the existing TBEelTears constructor, then stores TOilBall vtable pointers at object offsets 0 and 0x20.
The current TOilBall declaration adds no fields to TBEelTears, whose last declared pointer is at 0x16c.
The target string bytes decode exactly to the proposed 油ダマ literal in CP932.
The proposed inline forwarding constructor performs precisely this construction sequence with no extra work.
The factory's old commented TBEelTears allocation would create the wrong dynamic type if uncommented unchanged.
The patch correctly constructs TOilBall.

Existing BossEel.hpp consumers are bosseel.cpp, GCConsole2.cpp, and liveinterp.cpp.
The patch adds MarNameRefGen_BossEnemy.cpp as a fourth consumer.
No undefined new class or guessed fields are introduced.
No semantic reason to reject this candidate was found.
The rejection conditions are measured codegen/strict regressions or evidence that the current base object layout differs from the target 0x170 allocation.
Compare the actual emitted allocation size, base call, and primary/secondary vtable stores.

No shared source edits or builds were performed during this review.
