# Tournament shared utilities — gmtoulib

Revision: `c302741689bd67c361cd7faadb221df3193992c3`.

The inherited research covers all owned canonical/rendered files, subjects, facts and links. This lead independently checked the proposed corrections and upstream contradiction evidence, including contextual producers and callers. Existing supported knowledge is retained; descriptive rendered names are hypotheses rather than independent behavioral evidence.

## Bracket construction and presentation

`fn_8018A514` expands a table-selected layout into the shared 64-entry bracket array. Its integer argument selects a source region using thresholds 9 and 14 and advances through table-defined record counts. It copies geometry, flags, colors and slot activation fields, installs the supplied thickness, and initializes slot defaults. Special numeric selector values 1, 3, 5 and 7 mark specific slots. These selector values must not be equated with literal competitor counts.

`fn_8018A970` creates display GObjs for entries with nonzero `x0`, attaches entry pointers as user data, registers the shared bracket process only on entry zero, and registers the drawing callback on every admitted entry. `fn_8018AA74` computes slot coordinates and writes joint translation, with entry/layout-dependent geometry and separate handling when recomputation is skipped.

`fn_8018B090` maintains cross-frame counters and camera vectors, moves slot models, and advances numeric presentation states. The `x0` admission flag, `x1` marked-entry flag, slot `x30` activation and zero-height visual bypass are distinct. Its later transfer copies six slot fields to the destination encoded by the source entry's `x5/x6`, activates that destination, clears source activation, and sets source slot state to 3. Numeric states and slot flags are not automatically gameplay enums.

The connector helpers draw rectangle-based line arrangements, usually yellow, with ordered slot-dependent overlays when `x20.g` is zero. The two-branch helper adds marker-dependent extensions for specific numeric `entrants` values. `fn_8018E46C` reads entry user data, self-assigns `x3`, computes the connector coordinate, disables fog and sets up drawing, then dispatches `x3` values 0–3. Its horizontal correction uses an `s32` cast of half-thickness, not floor. Drawing setup forwards raw line-width value 1; no one-pixel interpretation is asserted. Other `x3` values perform common setup without geometry dispatch.

`fn_8018E618` removes prior objects from two lists, optionally resets bracket fields, creates a camera and reconstructs bracket objects. `fn_8018E85C` optionally refreshes slot metadata by searching 64 records, then creates, animates, scales and positions enabled slot models. A search miss leaves `j == 64` and copying proceeds without a local failure guard. First-marked-entry scans likewise return 64 on exhaustion, and several consumers do not locally guard that sentinel.

## Labels, selection and input

`fn_8018EC48` and `fn_8018EC7C` delegate cleanup using fixed numeric list arguments. The latter is an ordinary parameterless void-returning wrapper, not a non-returning function. Detailed menu-versus-transition lifecycle labels remain subject to caller context.

`fn_8018ECA8` submits either saved-name text or a formatted template to indexed text destinations. Selector 255 forces saved-name lookup, narrowing the identifier to `u8`, before any identifier-range rejection. Otherwise 800–899 select the primary template, 900–998 the secondary template, and IDs at least 999 produce no submission. Below 800, selectors 0 and 1 choose the corresponding destination.

`fn_8018F00C` formats into a caller buffer. ID 999 leaves the destination unchanged. Its second numeric branch accepts every ID at least 900 except 999, not just 900–998. The second family's two language entries alias the same storage. Suffixes are not zero-padded, and this arithmetic is not a general decimal formatter for larger inputs. Locale-dependent SIS filename selection is US versus fallback; asset-language contents remain unverified.

Character helpers provide table lookup/search, a stateless three-way grid classifier, compact identifier conversions, and `character + costume * 30` frame arithmetic. The conversions are not unrestricted mathematical inverses, and arithmetic stride does not establish asset-bank bounds. Setup explicitly initializes the availability table from `gm_IsCKindUnlocked`. Random selection rejection-samples 25 candidates, excludes unavailable entries and the preceding three accepted choices, then shifts its history. Termination requires an eligible candidate outside that history.

Input wrappers clamp selectors at least four to aggregate slot four and return narrowed snapshots. They do not guard negative selectors. The controller manager separately stores held, triggered and repeat2 masks, synthesizes semantic bits, invokes an evaluator callback and ORs individual records into the aggregate. Repeat2 production is directly verified. Triggered masks should not be described indiscriminately as pure physical-button edges. Canonical setup and alternate-scene callers establish aggregate shoulder shortcuts, individual shoulder chords and sustained-B timing.

## Shared state, models and match setup

The unit exposes mutable shared `TmData`, bracket storage, result storage, camera state and text context state. Bracket scene entry acquires `TmBox.dat` through `lbl_804D6638`, populates the box-array pointers and later releases the archive on exit. This TU declares that symbol as four bytes; cross-TU type compatibility remains unresolved. Declaration order, address comments, casts and size assertions do not authenticate compiled section placement or storage adjacency.

The four-slot synchronization routine uses explicit byte strides, copies selected fields into tournament storage, invokes Player character/slot-type/costume setters and records the non-3 slot count. The 64-record initializer writes through a cast-based view whose identity with the separately declared singleton is not independently established by compiled evidence.

GObj tag helpers store an integer as user data and recover it as `u32`; observed constructor loops and callbacks use such tags as indices. Translation and scale helpers independently skip axes whose float-to-integer conversion equals 666. Camera helpers use integer-conversion reset sentinels, restore authored vectors or apply a fixed positive-Z eye offset. Camera constructors have distinct scheduling and GX masks, but stronger primary/secondary role claims require context.

The model constructor independently supports an optional process callback and optional animation initialization. Initial hiding occurs only inside the animation-enabled branch. The animation wrapper requests a hierarchy frame before immediate evaluation; null roots are harmless, instance nodes bound child traversal, and accumulated callbacks run after evaluation. Specific stored-frame provenance claims remain separate from that generic behavior.

`gm_801905F0` initializes match rules and four player records from shared tournament state and saved settings, disables teams, configures timing and other rule fields, resolves stored or random character/color choices, marks unused slots unavailable and forwards a stage/player snapshot. The timer policy tests numeric mode 1 separately from a symbolic Stock flag check; the numeric-to-gameplay identification remains deferred. `gm_8018F1B0` is a read-only count-dependent policy query used after the multiple-winner test to select the sudden-death route versus results.

## Evidence limits

The five proposed writes correct truncation, graphics-setup order/units, void-return terminology, forced-name precedence and formatter domain/template aliasing. No naming churn, entities, links, merges or proposal follow-ups are added. Register-labelled parameter identities are not bound to source parameters without ABI evidence. Compiled section inventories, conditional packed layouts, numeric gameplay interpretations, complete visual-resource mappings and stronger progression claims remain explicitly deferred. Rendered C reports two parse errors and some suppressed/colliding substitutions; no specific canonical control-flow alteration was observed in the targeted rendered views.


Status: synthesized; independent review and live promotion pending.
