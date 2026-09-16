# Tournament shared-library semantic reconciliation

## Scope and evidence

Full canonical/rendered file coverage and subject/link enumeration are inherited from the hash-bound librarian handoff. This lead independently restored targeted canonical evidence for all five proposed writes and the upstream contradictions. Supported existing knowledge is retained without equivalent rewrites. Rendered names remain descriptive hypotheses, not evidence of original spellings or behavior. The reported renderer parse errors, suppressed substitutions, and name collisions remain unresolved.

## Bracket construction and presentation

`fn_8018A514` selects a source-table region using thresholds 9 and 14, advances by table-defined entry counts, and copies layout fields into shared bracket entries. It initializes thickness and slot fields and applies special markings for selector values 1, 3, 5, and 7. These are selector-domain operations; they must not be described as literal odd competitor counts without the missing conversion evidence.

`fn_8018A970` admits entries using nonzero `x0`, stores entry pointers in render GObjs, installs the state process on entry zero, and installs the drawing callback on each admitted object. Coordinate helpers calculate stored slot coordinates and update joint translation. The state process maintains shared counters and camera vectors, animates slot coordinates, and eventually transfers six slot fields to the destination encoded by `x5/x6`, activating the destination and clearing source markers. Object admission (`x0`), marked-entry selection (`x1`), slot activation (`x30`), and zero-height visual bypass are distinct conditions. Numeric states and slot flags are not automatically gameplay enums.

The connector helpers draw rectangle-based geometries with thickness from `x1C` and ordered route overlays controlled by `x20.g` and slot `x4C`. `fn_8018E46C` reads entry user data and performs the explicit `x3` self-assignment. It computes the `x2`-dependent connector coordinate before graphics setup, then dispatches cases 0–3. Half-thickness is converted with an `s32` cast, which truncates representable values toward zero rather than applying floor. Drawing setup receives unit scales and raw width value 1; physical pixel units are not established. Other `x3` values still execute common setup but do not dispatch geometry.

`fn_8018E618` removes objects from two lists, optionally resets bracket state, constructs a camera, conditionally repopulates layout data, and reconstructs entry GObjs. `fn_8018E85C` optionally refreshes slot metadata, creates models, selects animation frames, scales them, and chooses a placement path. Its metadata search can exhaust at 64 and still proceed with copying; a successful-match invariant remains necessary. Raw strides and aggregate casts are source behavior, not independently verified compiled layouts.

## Labels, selection, and input

`fn_8018EC48` and `fn_8018EC7C` delegate cleanup to fixed list ranges or indices. The latter is an ordinary parameterless void-returning wrapper, not a noreturn routine.

`fn_8018ECA8` submits labels to indexed text objects. Selector 255 forces `GetNameText((u8)display_id)` to the primary destination before any ID-range checks. Otherwise IDs below 800 use saved-name lookup for selectors 0 or 1; 800–899 format the primary template, 900–998 format the secondary template, and IDs at least 999 cause no submission.

`fn_8018F00C` formats into a caller buffer. ID 999 leaves the buffer untouched. Its second-family language pointers alias the same mutable storage, and the executable branch accepts every ID at least 900 except 999. It does not implement general arbitrary-width decimal formatting above the intended suffix domain. Shared template mutation and caller buffer requirements remain relevant.

Roster helpers perform direct/reverse table lookup, numeric classification, and compact-index conversions with exceptional mappings. Setup explicitly initializes `x72[i]` from `gm_IsCKindUnlocked((u8)fn_8018F6FC(i))`. Navigation combines availability and classification. The random selector rejection-samples 25 candidates while excluding three recent accepted values and then shifts the history; termination requires an eligible candidate outside that history.

The stage wrapper validates a selector result and asserts on failure without retrying locally. A verified Tournament caller supplies separate previous-stage retry logic and stores the selected stage in its request. This establishes Tournament integration, not the specific Random Stage Switch setting relationship. SIS filenames are selected as US versus non-US and consumed by Tournament scene entry; asset language contents are not established by suffixes alone.

Input wrappers clamp selectors at least 4 to aggregate index 4, leave negative inputs unguarded, and return narrowed snapshots. The controller manager separately exposes held, trigger, and `repeat2` masks. Its default repeat producer emits trigger-backed events, counts down delays, and emits held input at selected repeat intervals; evaluation unions physical-port masks into the aggregate. Trigger masks also contain synthesized semantic bits and callback processing, so unqualified raw-edge descriptions remain deferred. Entrant setup's aggregate held-button shortcut and alternate-scene sustained-B/L/R controls are verified.

## Object identity and cross-file lifetimes

`fn_8018FBD8` stores an integer cast to a pointer in GObj user data; `fn_8018F62C` returns user data cast to `u32`. Construction writes are verified in `gmtou_1.c` lines 1320–1349 and 1380–1436, where newly constructed GObjs receive `fn_8018FBD8(gobj,i)`, including a conditional construction branch. Retrieved indices demonstrably address controller, text, selection, and animation state. For fact:8c7017c5-f813-4712-89cf-59208fe1149c, only the complete enumerated consumer set remains deferred—not construction provenance.

Bracket scene entry acquires the `TmBox.dat` archive through `lbl_804D6638`, and scene exit releases that handle. Its declaration as four bytes in this TU requires cross-TU type reconciliation. Shared tournament data has a mutable external definition and is returned by `gm_GetTournamentData`; it is not translation-unit-private storage.

## Model, camera, and match helpers

Translation and scale helpers independently skip axes whose integer conversions equal 666. Camera constructors use different scheduling/link parameters and masks; those differences do not independently establish a primary-camera role. Model construction installs an optional process independently of animation initialization, and hiding occurs only inside the animation-enabled branch. The animation wrapper requests a frame before evaluating the hierarchy; delegated null handling and instance traversal boundaries remain relevant. Actual Tournament subtree consumers are verified, while the particular reconstructed two-stored-frame caller claim remains deferred.

Camera helpers apply FOV or interest/eye updates immediately. Reset tests use integer conversions, so finite fractional values between -1 and 1 participate in zero sentinels. Position updates use the supplied interest point and an eye offset of 415.6922 on Z; defaults come from separate WObj descriptors. Animation timing belongs to callers.

The multiple-winner policy reads Tournament counts and match results without mutation. The verified match-exit caller combines it with a separate multiple-winner predicate before selecting sudden death versus results. Numeric match-type values retain their exact branch behavior without additional mode labels.

`gm_801905F0` initializes runtime rules and four player records from Tournament selections and saved rules, disables teams, applies timer/stock/pause/score policies, resolves random selections, marks unused slots unavailable, and forwards a stage/player snapshot. The numeric `mode == 1` timer branch is preserved without an independently authenticated enum definition. Raw match-player synchronization and the initializer's cast-based storage view do not prove compiled aliasing or layout.

## Remaining boundaries

Compiled section membership, physical contiguity, switch tables, constant pooling, target ABI layouts, and register-labelled parameter bindings require appropriate compiled evidence. Complete gameplay progression, terminal-state meanings, visual-category inventories, authored asset bounds, and selected compound caller enumerations remain deferred. Shard-local statements that a function lies outside one shard are not TU-wide coverage gaps.

Status: synthesized; independent review and live promotion pending.
