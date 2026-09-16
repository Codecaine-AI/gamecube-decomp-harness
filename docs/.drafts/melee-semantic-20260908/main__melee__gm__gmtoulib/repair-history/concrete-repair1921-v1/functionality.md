# Disjoint Librarian Research

### shard-main__melee__gm__gmtoulib-000
Reviewed canonical and rendered `src/melee/gm/gmtoulib.c` lines 1–480 only.

- `fn_8018A514` selects one of three source-table regions using count thresholds 9 and 14, advances through table-defined entry counts, and copies template fields into `lbl_80473AB8`. It sets each copied entry's `x1C` from the float argument, initializes four slot `x52` fields to 9 and `x32` fields to zero, and copies slot `x30` values. For the first region, a helper marks specific slots for count values 1, 3, 5, and 7.
- `fn_8018A970` scans 64 entries and creates a GObj for each entry with nonzero `x0`, storing the entry pointer as user data. Entry zero receives process callback `fn_8018B090`; every created object receives GX callback `fn_8018E46C`. It also applies the same slot markings when its argument is below 9.
- `fn_8018AA74` computes slot coordinate fields from entry geometry, slot index, and entry flags. Special layouts use half- or third-height intermediate coordinates; the regular layout distributes horizontal positions and selects vertical endpoints using `x2`. Selected entry/slot pairs receive further vertical offsets based on `TmData.x2E`. The function finally assigns joint translation X from slot `x44` and Y from negated slot `x48`, including when coordinate recomputation is skipped because entry `x1` is zero.
- `gmTournament_GetBracketSlideYForward` returns `-(0.3f * lbl_804D6630 + slot->x48)`.

### shard-main__melee__gm__gmtoulib-001
Reviewed canonical and rendered gmtoulib.c lines 481–960 only. This range contains bracket-slot helpers and the complete fn_8018B090 state dispatcher. It updates slot-object translations, maintains coordinate targets and a shared animation counter, and advances tm->cur_option. States 20–25 reset the counter, apply directional vertical offsets, initialize current/target/step vectors, update coordinates, apply a ten-index repeating vertical offset, and restore stored vertical coordinates. States 32–35 rearrange coordinate targets and move slots, selecting an active slot whose x4C is zero; completion depends on coordinate equality and tm->x33. States 36–38 prepare the reverse vector transition, run counter-bounded transition and waiting phases, then transfer six slot fields to the destination indexed by the source entry's x5/x6. The transfer activates the destination, clears the source entry's x1 and source slot's x30, and sets source x4E to 3. The range ends with three byte-string arrays, a yellow GXColor constant, and only the opening of fn_8018C8D4.

### shard-main__melee__gm__gmtoulib-002
Reviewed canonical and rendered src/melee/gm/gmtoulib.c lines 961–1440 only. This range draws bracket connector geometry using thin rectangles, with thickness taken from data->x1C. The leading function fragment selects among four geometries using data->x4: a vertical line, a split vertical line, a half-height branching connector, and a thirds-based four-branch connector. When data->x20.g is zero, selected segments are overdrawn with data->x20; ordered tests of slots[].x4C determine the path. fn_8018D50C draws two yellow vertical segments joined horizontally at arg5, optionally recolors one side and its half-connector, and adds conditional negative-height tail segments. Tail selection depends on tm->entrants, slots[].x32, and sometimes data->x2. The final fragment begins fn_8018DC18 by drawing two yellow vertical segments; its remaining behavior lies outside this shard.

### shard-main__melee__gm__gmtoulib-003
Reviewed canonical and rendered src/melee/gm/gmtoulib.c lines 1441–1920 only.

- The opening drawing tail and fn_8018DF68 construct bracket connectors from rectangles. The latter draws four vertical branches and a horizontal bar in yellow, using x1C as thickness. When x20.g is zero, it overlays selected segments with x20, testing slots 0–2 in order and otherwise using the fourth branch.
- fn_8018E46C reads BracketEntry user data, disables fog, invokes drawing setup, and dispatches among four drawing routines using x3. Coordinates account for half-thickness and inverted vertical coordinates; x2 chooses the horizontal connector endpoint.
- fn_8018E618 drains two entity-list heads through a removal helper, optionally resets 64 entries and four slot fields per entry, loads and attaches a camera, configures its GX link, and invokes bracket initialization. The inline initializer conditionally calls fn_8018A514 and always calls fn_8018A970.
- fn_8018E85C iterates enabled entries and slots. With flag set, it searches 64 tournament records for a sequential bracket index and copies selected bytes and a halfword into slot storage. It creates joint-backed GObjs, selects an animation frame from two slot bytes, sets X/Y scale from tournament data and an index comparison, and chooses between two placement calls according to cur_option.
- fn_8018EC48 and fn_8018EC7C are paired helper-call wrappers with fixed numeric arguments; their precise menu/transition lifecycle roles are not established here.
- fn_8018ECA8 routes name text to one of two indexed text objects. It either calls GetNameText or modifies language-selected shared templates with decimal suffixes for two numeric ID intervals. IDs at least 0x3E7 are ignored unless the earlier name_type == 0xFF branch applies. The trailing declarations alias several template pointers.

### shard-main__melee__gm__gmtoulib-004
Reviewed canonical and rendered gmtoulib.c lines 1921–2400, with continuation through line 2413 to finish the boundary function; this is not complete TU coverage.

- Formats slot names using language-selected mutable templates or GetNameText. ID 999 leaves the destination unchanged; numeric suffixes are not zero-padded.
- Computes a Boolean predicate from match_type, hmn_cpu_count, x30 and n_winners; provides table lookup, reverse lookup and numeric classification helpers.
- Rejection-samples an enabled index from 25 candidates while excluding the previous three selections, then advances that history. Another helper validates a stage-selection result and asserts on failure.
- Scans for the first bracket entry with nonzero x1; counts four raw slot-status bytes unequal to 3, optionally returning the last qualifying index. Other helpers select a language-specific resource filename, expose tournament data and integer-cast GObj user_data, and cap input-wrapper arguments at 4.
- Performs character-index arithmetic, computes arg0 + 30 * arg1 as a float, and counts four controller statuses whose err field is zero.
- Clears x20.g on the first marked bracket entry and, when x33 equals 5, on its successor. The boundary function copies four bracket-slot records into tournament storage, invokes player character/slot-type/costume setters, and stores the count of slot types unequal to 3.

### shard-main__melee__gm__gmtoulib-005
Reviewed canonical and rendered `src/melee/gm/gmtoulib.c` lines 2401–2782 only.

- The opening function tail counts slots whose stored type differs from 3, updates player slot types and costumes, copies another byte per record, and stores the count. `fn_8018FBD8` assigns an integer cast to a pointer directly to GObj user data. `fn_8018FBE0` initializes three shared fields and selected fields of 64 records, including their sequential indices.
- Translation and scale helpers independently skip axes whose values convert to integer 666. Two camera constructors use different object/link parameters and priority masks; another helper constructs and links a light object. SIS setup conditionally replaces its supplied argument with zero and saves the returned context value.
- The model-object constructor loads and attaches a joint, installs a rendering link and optional process callback, and conditionally prepares/evaluates animation. Hiding occurs only inside that animation-enabled branch. A separate helper requests and evaluates a joint animation frame.
- Camera helpers set FOV, restore stored interest/eye positions, or set interest to the supplied vector and eye to the same vector with a 415.6922 Z offset. Default-selection tests use integer conversions, not exact floating-point equality.
- `gm_801905F0` builds match rules and four player records from shared tournament data and game settings. It disables teams, configures timing, stock behavior, pause and other fields, initializes players, applies character-ID conversion, selects stored or helper-produced character/color values, sets stocks, rumble, CPU level and handicap ratios, marks unused slots unavailable, and passes a stage/slot/character/color snapshot to `fn_8019EF08`.

### shard-main__melee__gm__gmtoulib-006
Reviewed canonical and rendered `src/melee/gm/gmtoulib.h`, lines 1–177 only. This guarded header provides declarations rather than executable behavior. Its interface includes functions accepting bracket entries, model/camera descriptors, game objects, match-start/end data, tournament data, and results data; it also declares setup, bracket, and alternate scene entry/frame/exit functions. Shared declarations include a `TmData` object, a `MatchEnd` object, a 64-element `BracketEntry` array, an integer, and two struct objects. Several function signatures retain unknown-type placeholders. No implementation behavior, gameplay mapping, or compiled structure layout is established by these declarations.

### shard-main__melee__gm__gmtoulib-007
Reviewed canonical and rendered `src/melee/gm/gmtoulib.static.h` lines 1–102 only. This header defines data and initial state, not executable functions. It declares `BracketSrcEntry` using byte fields, four signed 32-bit fields, and explicit padding arrays; initializes `lbl_803D9D20` with three numeric sequences; and initializes a three-vector record with equal `current` and `target` values `(320, -240, 415.6922)` and a zero `step`. It also defines a zero-initialized camera-pointer record, two static world-object descriptors with differing Z coordinates, a 32-row signed-16-bit pair table, and storage for 64 `BracketEntry` elements, `TmBoxArrays`, `MatchEnd`, and `TmData`. Runtime consumers and gameplay meanings are not established by this declaration-only range.

### shard-main__melee__gm__gmtoulib-008
The assigned documentation range contains two annotated declarations: `fn_8018F71C(int, int)` returns `float` and is tentatively described as returning a tournament character-selection icon frame; `fn_8019C570(HSD_GObj*)` returns `void` and is described as updating character-icon visibility on the “press start” screen. These are documentation claims, not implementation-verified behavior. Coverage is limited to `gmtoulib.dox` lines 1–10.

### shard-main__melee__gm__gmtoulib-009-retry180539-retry185219
The reviewed storage supports tournament bracket construction, entrant-to-match configuration, camera and slot animation, localized labels, and random-character recency filtering. Source confirms persistent bracket, selection, result, camera, counter, and text state. It does not establish compiler-emitted section membership or complete physical section layouts. A caller additionally identifies lbl_804D6638 as the retained TmBox archive handle, contrary to the baseline's wholly unidentified-byte description. This review covers only the assigned storage subjects, not the entire translation unit.

### shard-main__melee__gm__gmtoulib-010-retry180539
The assigned functions form a tournament-bracket presentation pipeline: expand a selected layout into shared entries, create entry-level render objects, calculate participant-slot coordinates, animate the focused bracket and transfer participant presentation fields to an encoded destination, and draw connector geometry with selected-route overlays. Numeric layout selectors must not be equated with literal competitor counts. This review covers the six assigned subjects and their necessary local context, not the complete translation unit.

### shard-main__melee__gm__gmtoulib-011-retry180539
Reviewed the six assigned functions and their 35 baseline facts. The two line helpers draw three- and four-branch bracket connectors with ordered, slot-dependent color overlays. Their GObj callback derives coordinates, configures drawing state, and dispatches by layout selector. The initialization routine removes prior display objects, optionally resets bracket data, creates a camera, and reconstructs display GObjs. The model-population routine optionally refreshes slot metadata and creates animated, scaled, positioned models. The cleanup wrapper traverses two fixed process-link ranges. Corrections distinguish integer truncation from floor and renderer line-width units from pixels; packed-record layout remains explicitly deferred.

### shard-main__melee__gm__gmtoulib-012-retry180539
Reviewed the six assigned helpers and relevant callers. They provide selective GObj-list cleanup, entrant-label submission and buffer formatting, inverse/direct character-grid lookup, and a stateless three-way roster-position classifier. Navigation callers implement five-column movement with 25-position wraparound and availability filtering. Important qualifications are the forced-name selector overriding label-ID guards, shared CPU template storage across language selections, and the buffer formatter accepting IDs above 999 except for 999 itself. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmtoulib-013-retry180539
Reviewed the six assigned Tournament utility subjects and their 34 baseline facts. The helpers select random character indices with a three-selection exclusion history, validate a random stage, count four byte-addressed bracket slots, select a saved-language SIS filename, retrieve an integer GObj tag, and access processed controller triggers with an upper index clamp. Current callers establish entrant initialization, bracket presentation and routing, SIS loading, and indexed UI/controller use. Broader gameplay interpretations and unverified producer details are explicitly deferred; this is not complete translation-unit coverage.

### shard-main__melee__gm__gmtoulib-014-retry180539
Reviewed the six assigned helpers and relevant consumers. The input wrappers clamp selectors >=4 and return narrowed snapshots of repeat or held input. Two pure conversions translate tournament character-selection indices; they are not unrestricted mathematical inverses. The portrait helper computes character + costume*30 as a float. The bracket helper returns the first nonzero marker index, or 64 on exhaustion. Caller code connects these helpers to character navigation, costume selection, portrait animation and four-player setup. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmtoulib-015-retry180539
Reviewed the six assigned functions and selected callers, not the complete translation unit. They count error-free controller records, clear a marked bracket field with an optional adjacent-entry clear, transfer four bracket records into tournament/player state, encode an index in GObj user_data, initialize 64 setup records, and selectively set JObj translation axes using an integer-conversion sentinel of 666. Source-level operations are supported; stronger gameplay and storage-layout interpretations are deferred where the reads do not establish them.

### shard-main__melee__gm__gmtoulib-016-retry180539
Reviewed the six assigned helpers and supporting source. They selectively replace JObj scale axes using an integer-conversion sentinel; construct two camera passes with distinct scheduling and GX masks; instantiate and register scene lights; reset and register a SisLib text context; and construct model GObjs with independent optional processing and animation initialization. Hiding during model construction is conditional on animation initialization. The SisLib camera argument acts as a null/non-null token, not a retained camera reference. Detailed presentation mappings beyond the observed caller behavior remain deferred.

### shard-main__melee__gm__gmtoulib-017-retry180539
Reviewed the six assigned subjects. They implement immediate hierarchy animation evaluation, shared-camera FOV and position updates with truncation-based reset sentinels, a count-dependent sudden-death eligibility query, and Tournament match-start construction. Camera movement is driven by callers rather than local timers. The match initializer translates rules and entrant records, resolves random selections, marks unused slots unavailable, and forwards a stage/player summary. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__gm__gmtoulib-018-retry180539
The reviewed code exposes mutable shared tournament data, selects and initializes bracket layouts, rebuilds bracket presentation objects and camera state, transfers active bracket participants into player configuration, and evaluates result conditions. Menu and result callbacks consume the same singleton. This is a bounded assessment of the assigned subjects, not complete translation-unit coverage.

### shard-main__melee__gm__gmtoulib-019-retry180539
The assigned subjects contain no baseline facts. Canonical source shows fn_8018AA74 using entry and slot indices to calculate stored coordinates and set a joint's translation. fn_8018B090 operates on global bracket and tournament state to animate coordinates, update the camera, and transfer slot data; its HSD_GObj argument is unused. fn_8018C8D4 draws rectangle-based connectors using entry thickness, color and slot flags plus integer geometry arguments. Register-labelled parameter identities remain unverified; no semantic writes are proposed.

### shard-main__melee__gm__gmtoulib-020-retry180539
The assigned subjects have no baseline facts. Their two enclosing canonical functions draw rectangle-based bracket lines using entry thickness and conditional entry-color overlays. fn_8018C8D4 selects geometry through x4; fn_8018D50C draws two vertical segments, a horizontal connector, and conditional extra segments. Both canonical signatures contain six arguments, not explicit register-named parameters. No register-to-source-parameter mapping is asserted.

### shard-main__melee__gm__gmtoulib-021
The assigned bundle contains six parameter subjects for `fn_8018D50C`, each with no baseline facts. The canonical function accepts a `BracketEntry*` and five signed integers. It draws two vertical segments and a horizontal connector, using entry-provided thickness, conditional color overlays, and optional additional segments. Its integer arguments supply horizontal origin, vertical origin, horizontal span, vertical extent, and connector vertical position, respectively. No register-to-source parameter mapping or gameplay interpretation is proposed.

### shard-main__melee__gm__gmtoulib-022
The two current function bodies draw bracket connector geometry using rectangles, thickness from the supplied BracketEntry, and conditional color overlays. fn_8018D50C draws two vertical segments and a horizontal connector, with conditional tail segments. fn_8018DC18 draws left, center, and right vertical segments and a horizontal connector, then conditionally overlays selected segments. Both canonical signatures contain one pointer and five integer parameters. All six assigned subjects have empty baseline fact lists; there are no baseline facts to disposition.

### shard-main__melee__gm__gmtoulib-023
The assigned subjects have no baseline facts. Their parent functions draw rectangle-based line arrangements using a BracketEntry pointer and five integer geometry arguments. fn_8018DC18 draws three vertical lines and a horizontal connector; fn_8018DF68 draws four vertical lines and a horizontal connector. Both obtain thickness from x1C and conditionally redraw segments using x20 based on its green component and slot x4C values. The caller derives geometry from the entry's coordinates and dimensions. Register-named subject bindings remain unverified; no parameter facts are proposed.

### shard-main__melee__gm__gmtoulib-024-retry180539
The assigned subjects have no baseline facts to disposition. The current fn_8018DF68 body draws four vertical segments and a horizontal connector, then conditionally overlays a selected path using entry color and slot fields. Its caller fn_8018E46C obtains a BracketEntry from GObj user_data, computes coordinates, initializes drawing state, and dispatches among four drawing routines according to x3. Register-labelled parameter identities are not established by these C bodies.

### shard-main__melee__gm__gmtoulib-025
This bounded subjects shard contains six parameter identities and no baseline facts. There are therefore no fact records to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-layout claims are proposed.

### shard-main__melee__gm__gmtoulib-026
`fn_8018ECA8` selects text and one of two indexed `tm->x518` destinations, forwarding the supplied floating-point coordinates to `HSD_SisLib_803A6B98`. Mode 255 directly uses `GetNameText` and the first destination. Otherwise, IDs 800–899 and 900–998 update language-selected templates with decimal suffixes and use the first and second destinations respectively; IDs at least 999 produce no call. For IDs below 800, modes 0 and 1 select the respective destination. All six assigned subjects have empty baseline fact lists.

### shard-main__melee__gm__gmtoulib-027
The six assigned parameter subjects have no baseline facts. Their current function bodies implement destination-buffer name formatting selected by an integer identifier; reverse lookup and direct indexing of `lbl_803D9D20.x59`; numeric three-way classification; and a four-position count with an optional last-matching-index output. The formatter leaves the destination unchanged for identifier 999. The count helper returns -1 before writing its output when the selected entry's first byte is zero. This review is limited to the assigned subjects, not the full translation unit.

### shard-main__melee__gm__gmtoulib-028
The six assigned parameter subjects have no baseline facts to assess. Their current function bodies show: `fn_8018F62C` accepts an `HSD_GObj*` and returns its `user_data` cast to `u32`; `fn_8018F640`, `fn_8018F674`, and `fn_8018F6A8` clamp integer arguments of at least 4 to 4 before forwarding them, with the last additionally casting to `u8`; `fn_8018F6DC` returns its argument unchanged below 0x13, maps 0x1D to 5, and otherwise subtracts one; `fn_8018F6FC` accepts `CSSIconHud`, returns `CharacterKind`, and uses the corresponding branch structure but adds one. No gameplay interpretation of the numeric mappings is asserted.

### shard-main__melee__gm__gmtoulib-029
The six assigned parameter subjects have no baseline facts to disposition. Current canonical bodies show that fn_8018F71C computes arg0 + 30 * arg1 and returns it as float; fn_8018FBD8 treats arg0 as an HSD_GObj pointer and stores arg1, cast to void*, in user_data; fn_8018FBE0 writes its first two arguments to cur_option and x1C through a cast-based TmData view and initializes additional fields. These observations do not establish gameplay meanings or validate the cast-based storage layout. Review is limited to this bounded shard.

### shard-main__melee__gm__gmtoulib-030
The six assigned parameter subjects contain no baseline facts. Their current function bodies show that fn_8018FBE0 stores three arguments into shared state and initializes 64 records using narrowed argument values and sequential indices. fn_8018FDC4 accepts an HSD_JObj pointer and conditionally sets each translation component, skipping a component when its float-to-int conversion equals 666. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__gm__gmtoulib-031
The assigned parameter subjects belong to two axis-selective joint update helpers. `fn_8018FDC4` passes each supplied float to the corresponding translation setter unless its integer conversion equals 666. `fn_8018FF9C` applies the same independent checks to scale setters. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition. This review does not establish compiled-register mappings or complete TU coverage.

### shard-main__melee__gm__gmtoulib-032
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies implement conditional per-axis joint scaling, two camera-object constructors with different creation/link settings, light-object construction, conditional forwarding of an SIS initialization argument, and model-object construction with optional processing and animation. Register-labeled parameter identities are not treated as proof of compiled argument placement. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__gm__gmtoulib-033
The assigned subjects contain no baseline facts. Their parent, `fn_8019035C`, creates a GObj, loads `model->joint`, attaches it and configures its rendering link. It optionally installs a process callback. When `arg5` is true, it passes the model and `arg2` to `gm_8016895C`, requests and evaluates animation at `arg8`, and hides the joint hierarchy if `arg0` is also true. It returns the created GObj. This review is limited to the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__gm__gmtoulib-034
The assigned subjects have no baseline facts. Their enclosing functions request and evaluate joint animation, set camera field of view with a saved-value fallback when the input converts to integer zero, and set camera interest/eye positions. The position helper restores saved positions when all three inputs convert to integer zero; otherwise it uses the supplied coordinates for interest and adds 415.6922 to Z for the eye position. This review covers only the assigned parameter subjects, not the complete translation unit.

### shard-main__melee__gm__gmtoulib-035
The two assigned parameter subjects have no baseline facts to disposition. In the current source, gm_8018F1B0 accepts MatchEnd* me and reads me->n_winners alongside tournament-state fields to return 0 or 1, without writing through me. gm_801905F0 accepts StartMeleeData* arg0 as a mutable destination: it initializes rules and four player records using defaults, saved rules, and tournament state, then copies stage and player selections into a local TmVsData passed to fn_8019EF08. These observations cover only the assigned subjects, not the entire translation unit.

### shard-main__melee__gm__gmtoulib-036
Reviewed the twelve assigned links against current canonical source. The functions support tournament bracket display and player configuration, roster navigation, controller-status counting and triggered-input access, camera setup and FOV selection, and hierarchical animation evaluation. Language-dependent resource selection is confirmed, but its attribution to the compiled .rodata section remains unresolved. This is bounded link review, not complete TU coverage.

### shard-main__melee__gm__gmtoulib-037
The reviewed routines support tournament bracket positioning and route drawing, scene cameras and text, entrant input and character-index conversion, and menu transitions. The stage wrapper calls a selector and asserts on an invalid result. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__gm__gmtoulib-038-retry180539
The reviewed helpers dispatch bracket drawing, format language-selected labels, locate marked bracket entries, convert character-selection identifiers, tag interface objects, apply subtree animation frames, configure light/text rendering, and populate match rules and players. This assessment covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__gm__gmtoulib-039
Reviewed the twelve assigned concept links against current helper implementations and selected callers. The code supports tournament bracket construction and drawing, camera restoration, presentation transitions, controller-dependent setup, entrant character-grid navigation, label formatting, and selective model translation. Random-stage validation is directly visible, but its tournament caller remains unverified. This review does not establish complete TU coverage or compiled structure layouts.

### shard-main__melee__gm__gmtoulib-040
The reviewed helpers support tournament entrant-model animation, name-label display, bracket geometry and reconstruction, scene lighting, camera framing, and processed controller-mask access. Camera positioning writes both interest and eye vectors, with a reset path when all three coordinates truncate to zero. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__gm__gmtoulib-041
The reviewed helpers support tournament entrant initialization, character-selection navigation, held-button handling, localized assets and entrant labels, bracket model construction and advancement animations, and SIS text presentation. Current function bodies and scene call sites support the function-level mappings. Mapping whole compiled data sections remains unresolved; source-level accesses do not establish section membership or extent. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__gm__gmtoulib-042
The reviewed helpers support tournament interface construction, localized text-resource selection, shared state access, and indexed model updates. The position classifier participates directly in directional character-grid candidate selection. Six function-to-concept links are supported; the compiled `.sdata2` attribution remains unresolved. This review covers only the assigned links, not the entire translation unit.

Status: researched; no-change lead bypass; independent review and live promotion pending.
