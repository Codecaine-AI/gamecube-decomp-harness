# Disjoint Librarian Research

### shard-main__melee__mn__mnmain-000
Reviewed canonical and rendered `src/melee/mn/mnmain.c` lines 1–480 only. This region primarily defines menu-related state and configuration: object/resource pointers, input and flow globals, animation-setting tables, numeric `u16` tables, six color initializers, and the beginning of a 34-entry `MenuKindData` table. Its visible populated records associate animation arrays and numeric tables with scalar values and function references; other records contain null pointers. The conditional `sdata2_order` body consists of discarded constant expressions. Runtime input handling, animation advancement, and menu transitions are not implemented in this assigned region.

### shard-main__melee__mn__mnmain-001
Reviewed canonical and rendered mnmain.c lines 481–960 only.

- The range begins with the tail of a configuration table, mostly null entries, and one populated entry referencing mn_8022CA54.
- mn_802295AC scans four controller ports for triggered confirmation and returns the first matching port, defaulting to zero. mn_80229624 translates triggered buttons and directional input into MenuInput flags; a nonzero cooldown instead invokes Menu_DecrementAnimTimer and returns zero.
- mn_80229860 writes pending_mode into scene exit data before calling gm_801A4B60. mn_80229894 sets a five-count cooldown, updates previous/current menu and hovered selection, invokes object-management routines, and registers the selected table entry's non-null think callback.
- mn_80229938 implements a selection predicate with two delegated conditions, three explicitly disabled selections, and a true default. mn_80229A04 counts predicate-true selections strictly before the supplied index. mn_80229A7C replaces the description text using the current menu's description-index table when present.
- mn_80229B2C and mn_80229DC0 construct animated background and panel objects. The panel callback tracks menu changes, selects current-menu entry or previous-menu exit animation settings, and moves states 0/1 into state 2 upon reaching the selected end frame. Panel construction initializes both stored menu IDs and state zero.
- The visible prefix of mn_80229F60 selects an animation frame from the menu's start frame plus twice the selection, invokes a helper for TOBJ_MASK channels 0xC–0x13, and remaps two other animation requests using offsets between paired start frames. Its remaining behavior is outside this shard.

### shard-main__melee__mn__mnmain-002
Reviewed canonical and rendered mnmain.c lines 961–1440 only.

- Cursor visuals: the opening fragment initializes visible effect joints, scales two joints, copies their position and sets their Z rotation toward tree[41]. mn_8022A440 restores selection-specific animation frames, remaps the primary animation to its unhover range and hides an effect subtree. mn_8022A5D0 updates selectable entries using selection-dependent animation settings; the selected effect translates toward a computed displacement, then shrinks and hides.
- Preview animation: mn_8022ADD8 hides tree[14] during FROM transitions. In other handled states it selects an animation range from menu/selection data, with two predicate-controlled overrides, restarts on selection change or an out-of-range frame, and updates the animation.
- Visual lifecycle: fn_8022AFEC detects a mismatch with global menu flow, starts a FROM transition and installs fn_8022AF10. TO transitions become idle at their animation endpoint. Selection changes invoke hover/unhover updates; cursor and preview updates precede committing the new stored selection. Description handling depends on state: FROM states release and clear it, while idle updates it on selection change and makes it visible. fn_8022AF10 runs the departure animation and invokes object removal at its endpoint.
- Construction prefix: GetSelectionFrameOffset returns twice the selection; CountUnlockedSelections counts nonzero selection-predicate results. The reviewed prefix of mn_8022B3A0 creates a model-backed object, installs rendering and update callbacks, attaches animations, allocates user data, snapshots menu flow and supplied state, initializes description to NULL and populates the joint lookup tree.

### shard-main__melee__mn__mnmain-003
Reviewed canonical and rendered mnmain.c lines 1441–1920 only.

- The opening construction tail attaches cursor models for selections accepted by mn_80229938, initializes their animation frames and selected-only visibility, and chooses a hover animation with two conditional exceptions.
- mn_8022BA1C rebuilds the menu camera from its descriptor each update. It selects the first of four sub-stick inputs outside the ±0.4 dead zone, converts each active axis to a rotation using a 30/0.6 scale, and rotates the eye vector around the interest point while preserving eye distance.
- Fog and camera setup routines create descriptor-backed objects and register rendering/update callbacks. Two helpers clear or restore the cameras' gxlink_prios masks; they do not remove the camera update procedures. The primary rendering callback uses the fog color for screen erasure. A second camera shares the sub-stick update procedure and is associated with separate SisLib setup calls.
- Menu and selection values determine one of five color pointers. Light initialization immediately applies the selected RGB color to the first point light. The update callback animates lights, detects target-pointer changes, and performs a countdown-based RGB transition, snapping to the target when the divisor reaches zero. Alpha is not modified.
- Four selection helpers wrap forward or backward and continue until mn_80229938 accepts the resulting selection.
- The final partial handler stores input, sets cooldown and entering_menu on confirmation, and, in the visible camera-selection branch, writes GM_CAMERA_MODE into pending_mode before calling gm_801A4B60.

### shard-main__melee__mn__mnmain-004
Reviewed canonical and rendered mnmain.c lines 1921–2400 only. This region implements menu input dispatch and shared MenuFlow updates: the tail of Special VS handling; complete Stadium, Records, Regular Match, Data, and Settings handlers; and the opening of the Trophy handler. Confirm branches dispatch by hovered selection, either writing a pending scene mode and calling gm_801A4B60 or invoking a submenu entry point. Back branches restore the parent menu and its selection, update previous/current menu state, and install the parent's think callback when present. Records navigation wraps directly; Regular Match, Data, and Settings navigation wraps and repeats while mn_80229938 returns zero. Stadium navigation delegates to x2_dec/x2_inc. The controller helper returns the first of four ports with triggered PAD_CONFIRM, defaulting to zero; Stadium's target/home-run branches and Regular Match pass that result to gm_801677E8. Confirm/back transitions commonly set cooldown to 5, but Data confirm sets it explicitly only for the Records transition.

### shard-main__melee__mn__mnmain-005
Reviewed canonical and rendered mnmain.c lines 2401–2880 only.

- The trophy-handler tail dispatches gallery, lottery and collection selections through pending_mode, returns to the main menu on Back, and wraps directional selection while skipping entries for which mn_80229938 returns zero.
- mn_8022D594 handles versus-menu input: confirm selects GM_VS or GM_TOURNAMENT, transitions to the special submenu, or calls the rules/name entry routines. Back restores the main-menu versus selection; directional input wraps between the first and last versus entries.
- mn_8022D7F4 handles single-player input: regular and stadium selections change submenu state and install its think callback; event selection calls mnEvent_8024E838; training writes GM_TRAINING. Back restores the main-menu single-player selection, and navigation wraps using the configured selection count and a nonzero selection predicate.
- mn_8022DB10 routes the five main-menu selections to their corresponding menu kinds with initial selection zero. Back writes GM_TITLE; Up/Down delegate to selection helpers. Menu transitions update previous/current menu, cooldown and entering state and register the selected menu's think procedure when present.
- mnMain_Scene_OnFrame conditionally executes a reset-related call sequence outside the main menu, writes GM_MENU and calls gm_801A4B60. The light-setup inline creates a light GObj, attaches its callback/procedure and initializes light state from current menu and selection.
- The assigned beginning of mnMain_Scene_OnEnter initializes input/menu state from MenuEnterData and conditionally begins loading camera, light, fog and joint/animation symbols from MnMaAll. Its remaining body lies outside this shard.

### shard-main__melee__mn__mnmain-006
Reviewed canonical and rendered mnmain.c lines 2881–3046 only. The initialization tail finishes resource bindings, selects the menu SIS file by saved language, invokes shared setup routines, and dispatches on menu kind. Its default branch installs the current menu's think callback, falling back to mn_8022DB10. Subsequent helpers convert a selectable character kind before querying unlock status, set or clear one item_mask bit, write NUL-terminated decimal digit sequences using calculated or supplied widths, animate a GObj's joint object, and free user data. Digit extraction uses signed division by powers of ten; digit counting special-cases zero and caps iteration at eleven. The final executable helper calls mn_8022F0F0 for indices 1 through 8. Trailing panic stubs are comments, not executable definitions.

### shard-main__melee__mn__mnmain-007
Reviewed canonical and rendered `src/melee/mn/mnmain.h` lines 1–129 only. This header defines the shared menu data interface: `MainMenuData` contains menu/selection/state fields, 42 joint pointers and a text pointer; `MainMenuPanelData` contains current/previous menu and state fields; `MenuFlow` contains selection, button, entry and light-related fields; and `MenuInputState` contains a cooldown and two otherwise unspecified fields. It declares menu-facing functions, scene callbacks, numeric helpers and joint-animation-related interfaces, together with external menu state, model descriptors, archive, lighting, fog, camera and name-list pointers. These are declarations, not evidence of the functions' runtime algorithms.

### shard-main__melee__mn__mnmain-008
Reviewed the six assigned data-section subjects. Shared menu flow coordinates input, submenu transitions, descriptions, cursor animation, and interpolated lighting. Scene entry initializes input and navigation, conditionally loads presentation resources, and constructs cameras, fog, lights, and menu objects. Initialized tables supply animation ranges, descriptions, selection counts, and callbacks. Constant vectors and numeric literals support cursor geometry and C-stick camera rotation. Exact compiled section membership, sizes, and adjacency are not established by these source reads.

### shard-main__melee__mn__mnmain-009-retry155554
Reviewed the six assigned callbacks. They maintain panel transition animation, finish and remove outgoing menu presentations, synchronize menu presentation state and descriptions, install scene fog, perform camera-scoped clearing and render dispatch, and animate selection-dependent point-light RGB transitions. The general presentation updater contains destructive cases inside a guard that admits only incoming states; those cases should not be described as reachable local teardown behavior.

### shard-main__melee__mn__mnmain-010
Reviewed the six assigned menu-entry, frame-input, controller-attribution, input-translation, scene-exit, and menu-transition subjects. Entry initializes shared state and conditionally loads resources before specialized or table-driven startup. Input helpers prioritize the first confirming controller and translate trigger/repeat streams into menu flags. Scene exit records a pending mode; internal navigation updates menu history and replaces the controller process. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mn__mnmain-011
Reviewed the six assigned subjects and their relevant construction/update call sites. They filter logical menu selections, translate them into dense visible indices, replace contextual SIS text, construct animated scene layers, initialize menu-dependent panel transitions, and initialize hover visuals and connector orientation. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mn__mnmain-012
Reviewed the six assigned presentation helpers. They reset outgoing cursor artwork, advance enabled-option animations and selected-pointer movement/collapse, maintain a selection-dependent preview interval, construct menu presentation objects, derive camera rotations from secondary-stick input, and create a render-dispatched fog object. Preview fallback branches are verified, but their specific unlock meanings remain deferred. This review does not claim whole-TU coverage.

### shard-main__melee__mn__mnmain-013-retry180539-retry185219
The six assigned helpers control two shared camera render masks, construct the primary camera and two SisLib text contexts, and map menu state into a five-color point-light palette. Both cameras receive the resource-relative sub-stick eye-position update. Gallery movie entry clears the masks and its exit path restores them. One baseline statement incorrectly identifies renderer argument 7 as GX link 7: it is a render-pass mask; the primary camera's 0x7F link mask selects links 0–6.

### shard-main__melee__mn__mnmain-014
Reviewed the six assigned functions and all 36 baseline facts. The lighting routines construct and maintain an animated light object, select a menu-dependent RGB target, and either interpolate or immediately assign the first point light's color. The four input callbacks route Special Versus, Stadium, Records, and Regular Match selections, restore their parent menus on Back, and handle vertical navigation. Regular Match, Stadium, and Special Versus navigation uses availability filtering; Records wraps directly over three entries. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mn__mnmain-015-retry180539
Reviewed the six assigned menu-input callbacks, not the entire translation unit. Each caches polled input and prioritizes confirmation, cancellation, and directional movement. Confirmation either replaces table-driven menu processing, invokes a dedicated interface, or writes a pending scene mode. Cancellation restores the parent highlight or requests the title destination. Data, Settings, Trophy, and single-player navigation use wrap-and-filter loops; VS navigation wraps directly, while Main delegates movement to helpers. Descriptive inferred names remain hypotheses, not recovered symbols.

### shard-main__melee__mn__mnmain-016-retry180539
Reviewed the six assigned helpers: Item Switch mask mutation, natural-width and fixed-width numeric text formatting, attached JObj animation, heap-release adaptation, and destruction requests for GObj process-link buckets 1–8. Sound Test and Records callers establish numeric-display uses; menu exit callers establish teardown use. Numeric-domain and cross-object layout guarantees require qualification. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__mn__mnmain-017-retry180539
The reviewed helpers extract decimal digits, count display positions, and translate selectable fighter identifiers into read-only unlock queries. Records callers use these results for text, animated digit models, ranking, and navigation. Reviewed Main Menu code normalizes controller input, updates shared menu flow, installs table callbacks, launches external screens, and requests game-mode transitions. Presentation code creates descriptions and animated models. This is bounded subject review, not complete TU coverage.

### shard-main__melee__mn__mnmain-018-retry180539
The six assigned parameter subjects have no baseline facts. Canonical bodies and callback registrations establish four first-argument object roles: fn_8022AFEC operates on a menu GObj with MainMenuData, updating transition animations, selection visuals, and description text; fn_8022BCD4 applies the fog attached to its GObj; fn_8022BDB4 uses its camera GObj to establish the current camera, erase using the global fog color, and dispatch rendering; fn_8022C128 animates attached lights and moves point-light RGB toward the menu-selected target. The second int arguments of fn_8022BCD4 and fn_8022BDB4 are unused. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__mn__mnmain-019-retry180539
The assigned subjects contain no baseline facts to disposition. Canonical bodies show that scene entry interprets its argument as MenuEnterData, initializes menu state from it, and conditionally loads assets. The input helper forwards its slot argument to repeated and triggered input queries. The exit helper stores its argument as pending_mode before requesting scene exit. The transition helper stores its first two arguments as the current menu and hovered selection, uses the first to select a think callback, and forwards the third to mn_8022B3A0. This review is limited to the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__mn__mnmain-020-retry180539
The assigned subjects have no baseline facts to disposition. Canonical bodies show that mn_80229938 tests a menu-kind/selection pair, returning false for specific excluded selections and consulting two predicates for conditional cases. mn_80229A04 counts accepted selections strictly before its selection argument; the cursor-animation caller uses this count to index displayed option objects. mn_80229A7C receives MainMenuData and a menu kind as its first two arguments, clears the existing description reference after passing it to a cleanup routine, and conditionally builds a replacement using the selected menu's description-index table. This review is limited to the assigned parameter subjects, not the entire translation unit.

### shard-main__melee__mn__mnmain-021-retry180539
The assigned subjects have no baseline facts to disposition. Canonical source shows that mn_80229A7C uses its selection argument to index the current menu's description indices when replacing description text. mn_80229F60 reads menu data from its GObj and modifies cursor joints collected from its root argument, using the selection to choose an animation frame. mn_8022A440 modifies joints collected from its root to reverse the hover presentation; its GObj argument is unused in the current body. The update caller passes the newly hovered selection to mn_80229F60 and the previously hovered selection to mn_8022A440. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__mn__mnmain-022-retry180539
Reviewed the six assigned parameter subjects; all have empty baseline fact lists. Canonical bodies show selection-dependent cursor animation, menu-object user-data access, conditional preview-animation restart, and initialization of a newly created menu object's state. The visual-update caller passes the old selection to the unhover routine, the effective hovered selection to the cursor updater, and a selection-change flag to the preview updater. No baseline facts require disposition, and no register-specific parameter facts are proposed without authenticated register-to-source-parameter bindings.

### shard-main__melee__mn__mnmain-023-retry180539
The six assigned parameter subjects have no baseline facts to disposition. Their canonical function bodies cover camera eye-position updates from controller substick input, forwarding an existing GObj into a SisLib setup call, selecting one of five color pointers, deriving a color index from current menu and selection, and traversing a light list to update the first point light's RGB channels. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__mn__mnmain-024-retry180539
The six assigned parameter subjects contain no baseline facts. Current canonical bodies show that mn_8022C068 leaves its second C parameter unused and uses its third as an RGB interpolation divisor, with zero selecting direct assignment. The four menu callbacks accept HSD_GObj* gp: mn_8022C4F4 and mn_8022CC28 do not reference gp, whereas mn_8022C7CC and mn_8022CA54 pass it to HSD_GObjPLink_80390228 on particular confirmed transitions. These are source-level observations, not verified mappings to the register-labelled subject identities.

### shard-main__melee__mn__mnmain-025-retry180539
The six assigned parameter subjects belong to menu input handlers. Each handler declares its first parameter as `HSD_GObj* gp`. Four handlers pass `gp` to `HSD_GObjPLink_80390228` on selected confirmation branches; `mn_8022D34C` and `mn_8022DB10` do not reference their parameter in their bodies. Menu selection and transition state are maintained through globals rather than through this parameter. All six subjects have empty baseline fact lists.

### shard-main__melee__mn__mnmain-026-retry180539
The assigned parameters concern menu-entry initialization, item-mask mutation, and decimal-text output. The current scene-entry body interprets its input as MenuEnterData, restores menu and selection state, and conditionally loads assets. mn_8022E978 sets or clears the indexed item-mask bit according to its second argument. The decimal-output helpers write digits right-to-left and append a null terminator; mn_8022EA08 computes the width, while mn_8022EA78 receives it. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__mn__mnmain-027-retry180539
The assigned subjects have no baseline facts. In the inspected canonical bodies, mn_8022EA78 uses its second argument as the digit-loop bound and terminator index, and its third argument as the value passed to mn_GetDigitAt. mn_8022EAE0 forwards its object's hsd_obj to HSD_JObjAnimAll; mn_8022EB04 forwards its argument to HSD_Free. No register-to-source-parameter mapping or compiled layout is asserted. The mn_8022EC18 parameter subjects remain uncharacterized because their body was not accessible within the owned files.

### shard-main__melee__mn__mnmain-028
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies reside in mn_22EC.c. These routines update JObj animation using start, end, and loop frames: mn_8022EC18 and mn_8022ED6C use hierarchy-wide animation operations, while mn_8022EE84 uses single-JObj operations. A loop_frame of -0.1f selects end-frame stopping/clamping; otherwise they wrap to loop_frame plus overshoot. The third arguments of mn_8022EC18 and mn_8022EE84 are type masks forwarded to mn_8022F3D8 when requesting adjusted frames.

### shard-main__melee__mn__mnmain-029
The six assigned parameter subjects have no baseline facts to adjudicate. Canonical header declarations expose an HSD_JObj*/AnimLoopSettings* pair for mn_8022EFD8, an int parameter for mn_8022F0F0, and u16 pairs for mn_8022F138 and mn_8022F1A8. These declarations alone do not establish parameter behavior or register bindings; no semantic additions are proposed.

### shard-main__melee__mn__mnmain-030
The six assigned parameter subjects contain no baseline facts. Current implementations reside in mn_22EC.c: mn_8022F1A8 iterates an inclusive entity-list index range; mn_8022F298 searches a joint's animation, material/texture animations, and eligible descendants for a current frame, returning -1 when none is found; mn_8022F360 stops animation on matching FObj tracks (or all tracks for selector 0xFF), forwarding its object argument; mn_8022F3D8 invokes that callback through HSD_ForeachAnim with the supplied joint, mask, and selector.

### shard-main__melee__mn__mnmain-031
The six assigned parameter subjects have no baseline facts to disposition. Their parent functions are defined in canonical `mn_22EC.c`: `mn_8022F3D8` forwards a joint, animation-type mask, and track selector to an animation traversal whose callback stops matching tracks; `mn_8022F410` and `mn_8022F470` update a pointed-to float or integer toward a pointed-to target using a supplied step, clamp at that target, and return the direction of the update (or zero when already equal). No register-to-parameter mapping or identity migration is proposed.

### shard-main__melee__mn__mnmain-032
The six assigned parameter subjects contain no baseline facts, so no fact dispositions are required. The reviewed canonical bodies show decimal digit extraction by division and remainder, digit counting with a zero special case, and forwarding a selectable-character value through conversion into an unlock query. The integer-approach function is declared in the owned header, but its body was unavailable within this shard's permitted files. This review does not establish register-to-parameter bindings or complete TU coverage.

### shard-main__melee__mn__mnmain-033
The reviewed links cover menu confirmation and navigation, description-text replacement, fog and camera setup, menu-dependent light colors, and model animation. Records and Data handlers dispatch selected screens; the regular-match handler writes explicit Classic, Adventure, or All-Star pending modes. This is bounded link review, not complete translation-unit coverage.

### shard-main__melee__mn__mnmain-034-retry180539
Reviewed the twelve assigned links against current canonical source. The examined code handles availability-filtered menu indexing, main and single-player navigation, scene destinations, menu presentation initialization, animated lights, decimal display helpers, and camera restoration after movie playback. This is bounded link review, not complete TU coverage.

### shard-main__melee__mn__mnmain-035
The reviewed links cover main-menu panel construction and transitions, selection animations and descriptions, trophy-view routing, All-Star entry availability, text-rendering setup, item-switch settings updates, and numeric presentation used by Records. Current function bodies and relevant callers support all twelve associations. This is a bounded link review, not complete translation-unit coverage.

### shard-main__melee__mn__mnmain-036
Reviewed the twelve assigned links against current canonical implementations and relevant Gallery and ranking callers. The linked code handles menu destination selection and parent-menu restoration, C-stick camera rotation, camera rendering suppression/restoration around movies, fog installation, and fighter-unlock filtering. This is bounded link coverage, not complete translation-unit coverage.

### shard-main__melee__mn__mnmain-037
Reviewed the twelve assigned links against current canonical code. The inspected routines implement menu input translation, menu and scene transitions, animated background/panel/cursor presentation, palette selection and light interpolation, and camera-scoped clearing. Panel animation follows the active menu rather than directly following hovered selection; the out-of-line light helper initializes runtime lights, while the frame callback uses its inline equivalent. This is bounded link coverage, not complete TU coverage.

### shard-main__melee__mn__mnmain-038
The reviewed functions implement menu-state transitions, selection preview animation, outgoing presentation cleanup, C-stick camera rotation, fog rendering, selection-dependent lighting, Stadium input routing, and contextual return from Data to Main. Compiled-section ownership and two external-helper-dependent claims remain unresolved. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__mn__mnmain-039
Reviewed the four assigned concept links against current canonical bodies. Records and Settings handlers dispatch selected submenus, restore their parent menus on cancellation, and wrap navigation. Settings additionally filters selections through an availability check. Preview animation selection consults the same predicate that gates the All-Star selection. The scene-routing helper writes pending_mode into the current scene exit data and calls gm_801A4B60.

Status: researched; no-change lead bypass; independent review and live promotion pending.
