# Round 3 Enemy and Animal Audit

## Scope and State

Audited all 13 nonempty failing units in Enemy plus AnimalBase and AnimalManager from the saved final ledger.
They account for 22 missing symbols and have no remaining strict order or linkage errors.
The owned cohort and exact symbols are recorded in `round3-enemy-cohort.json` and `round3-enemy-symbol-audit.json`.
Original map entries, complete linked-helper bodies, and caller names are recorded in `round3-enemy-map-callers.json`.
Native nm dumps were saved for every unit.
There were no alternative same-class signatures hiding the missing symbols.

Five scratch patches are proposed below, all requiring parent compilation, strict validation, and matching regression checks.
No shared source edit, build, baseline replacement, middleware edit, or live-runtime operation was performed by this agent.
The AGENTS guidance and matching tips were read in this agent session; the completed round-2 report was read before this audit.
No new algorithm was decompiled, so m2c was not needed or invoked.

## Proposed Changes

### Restore Two Existing Static Initializers

`round3-enemy-effectObj-sinit.patch` and `round3-enemy-coasterkiller-sinit.patch` add the existing game headers MSSetSound.hpp and MSoundBGM.hpp beside the existing matching includes.
No middleware header is changed.
Both original initializers are local, size 0x2fc, and contain 191 instructions.
Their 15 guarded list initializations have the same sequence as the round-2 accepted MarNameRefGen initializer.
The guards start with MSBgm, MSSetSoundGrp, and MSSetSound, followed by the twelve JAL modulation lists.
The include order matches the verified MarNameRefGen source.

Original raw assembly and extracted guard order are saved under `round3-enemy-*-original-sinit.s` and `round3-enemy-sinit-evidence.json`.
Map closure lines 54186 and 54647 identify local binding; text layout lines 67399 and 72010 record size 0x2fc.
The current object has neither initializer.
Accept only if the compiler produces the expected original initializer without harming other functions or sections.
Expected gain is two missing symbols, with effectObj becoming a strict pass.

### Extract Existing Animal Parameter Loading

`round3-enemy-animalmanager-params.patch` moves the exact four parameter-loading statements from TMewManager::load into map-named TAnimalManagerBase::loadSaveParams_(const char*).
The caller passes its existing `/Animal/mew.prm` literal.
The method is placed between the constructor and clipEnemies, matching reverse map order.
Only a declaration is added to the game header.

TMewManager::load currently matches all 124 bytes, including allocation, the AnimalSave constructor call, and three parameter assignments.
The map records the missing UNUSED helper as 0x80 bytes.
The full before diff is saved in `round3-enemy-animalmanager-load-before.diff`.
This is extraction of existing verified statements, not invention of a load algorithm.
Accept only if standalone helper size is 0x80 and the existing load remains fully matched, with no consumer regression.

### Extract Existing EMario Collision Handling

`round3-enemy-emario-collision.patch` moves the existing canControl guard and collision loop into map-named TEMario::checkCollision().
Its declaration is added to Emario.hpp, and its definition is placed between init and receiveMessage, matching reverse map order.
The collision statements are unchanged.

The full original/current perform diff revealed an actual control-flow defect.
Original perform branches directly to mEnemyMario->perform when cue lacks CUE_MOVE or canControl is false.
Current source returns from the whole function in both cases, skipping that virtual call.
The proposed perform invokes checkCollision only under CUE_MOVE, while the helper's existing canControl early return exits the helper.
This preserves the original unconditional child perform after the collision section.

The map records checkCollision as UNUSED, size 0x220.
Current perform matches 71.9%; its distance calculations already differ from the original inline arithmetic.
The proposal does not rewrite those calculations, so map-exact helper size is not promised.
Accept only after evaluating helper size, original branch behavior, and per-symbol matching.
The full before diff is `round3-enemy-emario-perform-before.diff`.
execKill remains missing and has no proposed body.

### Move Existing Coaster Parameter Constructors Out of Class

`round3-enemy-coaster-constructors.patch` moves both existing constructor definitions unchanged from the game header to coasterkiller.cpp before TCoasterEnemy::init.
The base constructor precedes the derived constructor in source, consistent with reverse map order.
Expected UNUSED sizes are 0xdc for TCoasterEnemyParams and 0x104 for TCoasterKillerSaveLoadParams.
Consumers found by direct include search are coasterkiller.cpp and MarNameRefGen_BossEnemy.cpp.
Manager load currently matches 98.4%; loadAfter matches 99.6%.

This is a lower-confidence emission experiment.
UNUSED does not establish non-inline linkage, so lack of an emitted copy alone does not prove current header placement wrong.
Accept only if sizes and all caller comparisons support the move.
Do not introduce a pragma or artificial call if ordinary source placement fails.

## Full Cohort Dispositions

| Unit | Remaining Finding | Evidence and Disposition |
|---|---|---|
| Animal/AnimalBase | TVec3 set<float>, MsClamp<float>, UNUSED TVec4 set<float> | Existing math helpers are present in headers/source usage. Original execWalk calls the first two out of line; current code inlines them. execWalk already notes incorrect quaternion code, while flyToCurPathNode is a stub. Reconstruct original caller structure before changing emission. Middleware edits or forced instantiation rejected. |
| Animal/AnimalManager | UNUSED loadSaveParams_ | Existing verified loading sequence supports the extraction trial above. |
| Enemy/BathtubKiller | TVec3 set<int> | Original Break and Explosion nerve execute bodies call this specialization. Both current execute bodies are return-FALSE stubs. This requires implementing the callers; changing a float literal or forcing a template instance would conceal incomplete source. |
| Enemy/bossgesso | getMActorAnmData, SMS_GetMarioPos | Existing inline APIs and uses have correct signatures. Original getMActorAnmData calls occur in nine nerve execute methods through nested animation helpers; SMS_GetMarioPos is called in moveObject. Deferred-inline boundaries differ. No safe signature-only change or body relocation established. |
| Enemy/coasterkiller | Two UNUSED parameter constructors and sinit | Two independent trials above: restore original initializer through game includes, then verify ordinary out-of-class definitions of existing constructors. |
| Enemy/effectObj | sinit | Restore game includes, grounded in complete original initializer evidence. |
| Enemy/emario | UNUSED execKill and checkCollision | checkCollision extraction and original perform flow are supported. execKill has no current declaration/body and only a 0x54 size constraint; no algorithm proposed. |
| Enemy/enemy | TVec3 assignment operator | Original goToExclusiveNextGraphNode calls the existing implicit assignment operator twice. Current object inlines it. This is a caller-boundary issue; changing shared middleware or forcing a copy is unjustified. |
| Enemy/enemyMario | TPathNode::getPoint | Existing game-header helper has correct signature. Original consider calls it; source already has a TODO naming unresolved deferred-inline boundaries. No repeat forced-inline attempt. |
| Enemy/enemymanager | UNUSED TPosition3 constructor | Existing middleware constructor is absent from output; current TSharedMActorSet::calcAnm and setScale are empty and source lacks the relevant matrix setup. No original UNUSED body is available and no artificial declaration or call is proposed. |
| Enemy/enemytable | UNUSED TVector_pointer<TStageEnemyInfo*> destructor | Existing inherited container body comes from NameRefPtrAry/JGadget. Object emits no separate destructor under this name. UNUSED binding is unknown; forcing a middleware template is not a source reconstruction. |
| Enemy/fireWanwan | TVec4 constructor, isTaken, const ArrayWrapper subscript and size | Original calls are located exactly in RecoverGraph/FindMario execute, updateRumble, and tail-hit perform respectively. Existing helpers are present; source uses direct back() for the tail velocity where original contains size()+const subscript calls. Original const accessor/inline depth is unresolved. No arbitrary wrappers, casts, or changes to shared ArrayWrapper are proposed. |
| Enemy/gesso | UNUSED checkDropInWater | Existing complete inline body and source TODO show known conflict between emission and caller inlining. Parent explicitly identified prior rejected trial; not retried. |

The two static initializers are the strongest proposals.
The parameter-loading extraction is independently constrained by an already fully matched caller and an exact UNUSED size.
The other two source-organization trials require compiler evidence before any claim of improvement.
A strict pass for a stub-heavy unit would not establish that its game behavior is reconstructed.

## EMario Trial Outcome

The parent tested and reverted the collision extraction because perform fell from 71.90426% to 33.957447%.
The helper emitted at 0x1c4, short of the map 0x220.
The follow-up audit rejects a second narrow extraction that preserves the original source early returns because original assembly contradicts those returns and the weaker helper boundary has no positive evidence.
See `round3-enemy-emario-followup.md` for the complete disposition.
