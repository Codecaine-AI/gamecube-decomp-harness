# Toy semantic sweep

## Scope and evidence

This revision-scoped review adopts the hash-bound librarian coverage of `toy.c`, `toy.h`, `toy.dox`, and their assigned subjects and links. The lead independently checked the proposed facts and contradiction evidence. Canonical symbols are used below; rendered names remain descriptive hypotheses, not recovered original names. No compiled section, cross-object layout, or register-to-source-parameter mapping is certified.

## Collection state and selection

The module selects working trophy state in the explicit one-player/Lottery branches and persistent state otherwise. Entry accessors read the low-byte quantity, test or toggle `0x8000`, and test or conditionally clear `0x4000`. Category queries combine two working masks or read the saved mask. Capacity lookup handles options 0–8, with a language-dependent value for option 5 and no initialized default result.

`Toy_SetUnlockState` treats its second argument additively despite its source-level `bool` declaration. A zero prior low byte triggers XOR of `0x8000` and increments the distinct-entry count; the quantity update is capped above at 255. The category-7 transition requires a count of at least 250 and absence of category bit `0x80`. Once-only acquisition and unconditional marker-setting descriptions need input/state invariants not enforced here. Other game-manager calls retain their unverified higher-level meanings.

`Toy_80305918` mutates matching per-entry and category availability bits, ignores category 8, and can target a separate working mask. `_Toy_80304D30` refreshes category availability, but its final capacity loop tests a stale or potentially uninitialized `x`, not its loop index. It must not be documented as an unconditional remaining-pool calculation.

`Toy_80305058` filters candidates, separates zero/nonzero quantities, and uses a percentage-controlled preference when selecting an identifier; it returns -1 when no candidate qualifies. `_Toy_803053C4` offers repeated randomized selection or sequential traversal, but both supply random quantities. Exhaustion and count-domain preconditions remain important. The separate alternative-ID builder uses language exclusion and `0x4000`, not an ownership predicate, and checks its maximum only after writing a qualifying ID.

Completion queries implement a threshold with two numeric exclusions, a cardinality equality, and three fixed 26-ID sets. Their stronger normally-obtainable/fighter/Smash identities remain deferred.

## Metadata, ordering, and presentation resources

Metadata lookup searches sentinel-terminated tables and selects alternate values for fields 0–5 under a language mismatch; fields 6–8 use the primary table. The setter edits six fields and can refresh diagnostic text. Text-index calculation applies a default offset or a language-dependent remapping.

Ordering construction gates input indices by quantity but stores metadata-mapped values. Its ownership-preservation invariant is not proven. `Toy_803067BC` copies a selected column; reverse output uses indices `count` through 1. List rebuilding preserves the selected mapped ID, but numeric columns do not prove user-facing sort labels. `Toy_803082F8` accepts a list index, whereas `Toy_80308328` accepts a direct ID; their shared rendered name obscures that distinction.

Model construction resolves archive-backed metadata, replaces the shared model GObj, attaches the trophy hierarchy and paired stand children, and applies metadata transforms. Missing required symbols retain diagnostic/assertion branches. Panel exports are resolved through `x50`, populated by viewer setup from `TyMnView.dat` or `TyMnView.usd`, not from the TyLight archive. Back-label and lighting lookups use string-relative addressing whose compiled backing layout remains unverified.

The information display caches four text objects under three guards: `x144` and `x148` are independent; `x14C` creates both `x14C` and `x150`. Every call refreshes all four SIS contents. Exact authored field meanings remain unresolved. Seven information sprites use language-specific archives and coordinates.

## Cameras, lights, and interaction

Camera setup creates six presentation GObjs, explicitly attaches four CObjs using three descriptors, and initializes two screen layers. EA2 takes precedence over E50 for the frustum update callback; E50 independently replaces render masks. Scene entry sets E50 from L under debug gating. EA0 separately selects the nine-row editor.

The main render callback activates its camera, conditionally performs projected color-only erasure, dispatches mask 7 as callback indices 0–2, clears fog, and finalizes deferred Z-list drawing. Other camera callbacks differ in fog/finalization order. The fog-only wrapper's precise scene registration remains deferred.

Light replacement distinguishes retained-archive replacement from loading `TyLight.dat`. Animated lists receive an update process and scheduler-generation stamping, not activation. `Toy_LoadLObjList` caches spatial data for successful loads, but links every load result. Failures can truncate or replace the apparent head; empty input leaves `first` uninitialized.

Camera updates translate interest along camera vectors, reject coordinates outside the strict interval (-3000,3000), rebuild the eye from stored distance/angles, and transform lights. Stand action control distinguishes guarded timed animation from immediate frame-ten evaluation. Camera state and eye position select actions and paired visibility. The distance helper substitutes an authored zero vector for null inputs but has no universal overflow-safe numerical contract.

Viewer controllers normalize input, manage cooldowns and camera transitions, cycle selected trophies, and rotate a rolling archive window. Shared processing is not exclusive to close-up state. Start/Z select or reset lighting/back-label configuration; trophy-arrangement terminology is not established. Arithmetic input sums can cancel and must not be equated with independent inactivity tests. The camera-interest marker is enabled by panning displacement or held A, including zero displacement, and renders RGB camera-relative axes.

## Lifetimes and developer controls

Initialization, selection persistence, resource finalization, outer scene cleanup, and preload pointer reset are distinct operations. Selection persistence does not require the full-cleanup argument. The thirteen-entry archive cleanup additionally requires nonzero collection count, and the finalizer does not release every archive retained by viewer setup. Pointer clearing alone is not deallocation. State synchronization imports saved entries or exports quantities while preserving saved high-byte flags and propagating selected local flags/categories.

The editor scans X and Y independently, prioritizes horizontal input, applies repeat delays, and processes nine values on acceptance. Start changes selection strategy, not all randomness. The selection clamp permits slot 9 although rendering/acceptance use 0–8. Allocation uses six `sizeof(void*)` elements, whereas clearing explicitly uses `0x18` bytes.

`Toy_80311680`, `Toy_803124BC`, and `Toy_803127D4` return normally; void does not mean non-returning. Header declarations and the documentation TODO do not independently establish runtime ownership or the concrete returned model-record structure.

## Disposition

Retain the inherited supported knowledge without equivalent rewrites. Adopt its supersessions, rejection, and evidence-limited deferrals. Eleven small fact corrections are proposed, with the candidate maximum explicitly described as a post-write check. Exact visible labels, scene/stage mappings, trophy identities, resource contents, compiled layouts, and unresolved lifetime/input invariants remain separate follow-up work.


Status: synthesized; independent review and live promotion pending.
