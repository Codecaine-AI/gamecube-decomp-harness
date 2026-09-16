# Fighter Family Naming and File Patterns

Draft catalog at `c302741689bd67c361cd7faadb221df3193992c3`. Use canonical symbols for identity and the supported aliases below for explanation. No source, KB or scheduler changes were made.

## Coverage and Review State

The inventory contains 440 tasks. This snapshot has 369 accepted-for-staged-apply review files and 71 missing review files. Scheduler states and proposal-hash checks are separate in [fighters.json](fighters.json). Acceptance here does not establish live application or final rendering.

All existing inventory functionality/review/proposal/followup bytes indexed and hashed; family_followups parsed and keyword-grouped. Ten named functionality sets read closely; selected canonical ranges independently inspected through git show at the pinned revision. This is not a complete canonical rereview of 440 TUs. Keyword groups may overlap and are discovery aids, not adjudication.

The JSON records every task, source paths, proposal and review hashes, review status, scheduler status, hash match, and original family followups. Ten closely read task sets are marked individually. Stale pending sentences in functionality drafts do not override newer review receipts, and an unaccepted scheduler task is not promoted to accepted by this catalog.

## Canonical Conventions and Supported Names

### State callback suffixes describe dispatch roles

Classification: `canonical_convention`.

Anim, IASA, Phys and Coll names recur in common and character motion tables. Actual table rows determine reuse. FallAerialF/B use ordinary Fall Anim/Phys/Coll and FallAerial IASA. Mario appeal placeholders have null callbacks, so a complete suite is not mandatory.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L453-L518) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L20-L55).

### Character initializer, resources and move files have separate responsibilities

Classification: `canonical_convention`.

ftmario.c defines motion descriptors and lifecycle integration; ftmariostrings.c defines archive strings and costume-resource triples; ftfoxspecials.c owns SpecialS phase callbacks and shared Fox/Falco state accessors. File spelling is a navigation hint, not proof of exclusive character ownership.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L20-L55) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L156-L190) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariostrings.c#L5-L44) · [4](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L44-L83).

### Directional fall blend is caller-owned state with shared part traversal

Classification: `canonical_behavior`.

Fall, FallAerial and FallSpecial pass their own x4 address to the shared selector. It clamps a velocity ratio, not velocity, smooths weight and writes mv.co.fall.smid only when nonzero weight selects a changed motion. Application starts at TransN and traverses eligible later parts. The selector accesses fall.smid even for other callers; binary storage equivalence is not established here.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L90-L112) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L153-L196) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallAerial.c#L10-L24) · [4](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L69-L74) · [5](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L925-L952).

### ftCo_FallSpecial_EnterDefault

Classification: `supported_inferred_name`.

The one-argument wrapper forwards defaults and Fighter.x2EC to the configurable entry. EnterDefault distinguishes this adapter from configurable entry. It remains an inferred alias. The optional scalar on ftCo_800969D8 is animation blend, not starting frame or persistent directional x4.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L22-L67) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L933-L936).

### ftFx_SpecialS_GetGhostRotationIndexed

Classification: `supported_inferred_name`.

The accessor returns blendFrames[index], but producers fill that array from model X rotation and item consumers feed it to HSD_JObjSetRotationX. Rotation names follow the producer/consumer contract, despite the field spelling. This does not prove that arbitrary indices are valid.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L77-L83) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L420-L438) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoxillusion.c#L154-L166).

### Wrapper names do not transfer all owner behavior

Classification: `canonical_behavior`.

Mario OnLoadForDrMario performs PUSH_ATTRS only, while Mario OnLoad also enables walljump and registers items. FallSpecial can divert before ordinary setup. A canonical Attack100_CheckInput name dispatches ftData_SpecialHi. Preserve exact wrapper scope and inspect the callee before assigning gameplay names.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L168-L190) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L28-L59) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L90-L101).

### Callback installation and retention require separate evidence

Classification: `canonical_behavior`.

Fox dash setup installs accessory4_cb after the motion change; its graphics callback clears that slot. Fighter transition callback-assignment code also clears accessory slots. Crazy Hand positioning stores a continuation in move state and copies a destination value; arrival invokes the continuation without clearing it. These mechanisms do not imply one universal one-shot or ownership-transfer contract.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L30-L42) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L420-L461) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1370-L1390) · [4](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L50-L75) · [5](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L98-L107).

### Do not rename Crazy Hand 0x184 entry as Wait1_2 from Master Hand symmetry

Classification: `rejected_analogy`.

The Crazy Hand table labels 388/0x184 TagCancel and 389/0x185 Wait1_2, sharing callbacks. ftCh_GrabUnk1_8015B8FC selects 0x184. The proposed Wait1_2 alias is not justified for that endpoint. The return helper writes 0x184 before comparing with 0x156; preserve its shown else path rather than importing a symmetric two-way interpretation.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhand.c#L568-L589) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L22-L44) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L109-L133).

### IASA names identify callback roles, not input level or universal interruptibility

Classification: `canonical_behavior`.

Fox aerial SpecialS IASA tests pressed_buttons B and routes by actual ground_or_air. FallAerial IASA delegates to the common checker. Neither naming pattern alone proves held-input behavior or side-effect-free false-return callees.

Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecials.c#L314-L326) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallAerial.c#L27-L35).

## Contradictions Resolved for This Catalog

| Conflict | Catalog Decision |
|---|---|
| transn_only | FallAerial functionality says processes its TransN component; Fall functionality correctly describes traversal from TransN through eligible later parts. Use traversal wording. No task artifact was edited. |
| blend_domains | Fighter_ChangeMotionState anim_blend, persistent directional fall x4, and Fox blendFrames X-rotation history are distinct data roles. Similar words are not evidence of equivalent quantities. |
| callback_one_shot | Fox accessory callback clears itself; Crazy Hand arrival continuation does not. Caller destination value is copied in the latter. Remaining transition/interruption and dispatch-order invariants require owner review. |
| stale_draft_status | Several functionality files end with synthesized/pending language although a later review/task snapshot exists. Current hashes and statuses are recorded independently. Review acceptance does not prove application or final rendering. |

## Followups Still Open

The counts below are overlapping keyword groups of original family followups, not counts of proven defects. Full requests and task IDs are in the JSON.

| Owner Review | Tasks Flagged | Remaining Question |
|---|---:|---|
| animation_blend | 17 | Establish active animation assets, ordinary finite parameter invariants, and storage/layout relationships before claiming bounded blend or state equivalence. |
| callback_state_lifetime | 281 | Trace producer, dispatch, interruption and teardown paths before claiming retained ownership, one-shot invocation or safe pointer lifetime. |
| common_character_wrappers | 43 | Verify flags, jump-use policy and delegated side effects before copying common helper descriptions into character wrappers. |
| numeric_state_analogy | 113 | Use active tables, callers and animation/mechanics evidence before assigning public move names or importing Hand state symmetry. |
| compiled_layout | 240 | Use matching object sections, relocations and disassembly for section/ABI facts. Source literals and address-like symbol names are insufficient. |

Next catalog action: refresh the artifact hashes and task statuses after the remaining fighter tasks finish. Keep unresolved gameplay and lifetime requests open until their owning code paths supply evidence.
