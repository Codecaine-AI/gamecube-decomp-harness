# Disjoint Librarian Research

### shard-main__melee__if__soundtest-000
### Assigned range: `src/melee/if/soundtest.c`, lines 1–480
This range contains declarations and data-overlay types, not executable function bodies. It declares a large family of static callbacks returning `bool` and accepting `enum soundtest_callback_arg0`. Two explicitly documented overlay types provide source-level views intended to reach menu data beyond a label block and across adjacent data blocks. The larger `un_803FA258_t` declaration contains scalar fields, repeated four-element integer/float arrays, byte-sized fields, a pointer, and a 17-element integer array. The remaining declarations expose character buffers, character-pointer tables, and arrays of `un_80304138_objalloc_t_x8` records. These declarations establish source-level organization but do not establish callback effects, table contents, gameplay mappings, or actual compiled adjacency. Both canonical and rendered views of all assigned lines were reviewed; this is not complete TU coverage.

### shard-main__melee__if__soundtest-001
Reviewed canonical and rendered soundtest.c lines 481–960, plus lines 961–964 to finish the boundary function; this is not complete TU coverage.

The range begins with external data declarations, initialized labels/defaults and static state. un_802FF7DC loads an archive symbol table and copies elements 0–4 and 7 into selected data fields. Two callbacks simply return false. Initialization resets selection/control state, saves an audio query result, passes 127 to three audio controls, installs a callback conditionally, and sets text scales to 16×32. Other callbacks restore the saved audio value, forward three byte-truncated controls, and compute a selected group's cumulative range from symbol-table slot 6 into entry 7's x14/x18 fields.

Audio-selection callbacks dispatch differently for arguments 0 and 1: one selects an ID through symbol-table slot 5; another remembers the selected value, toggles a one-bit control on repeat selection, and clears remembered state on argument 0. Reset and exit paths restore three audio controls to 127; the exit path explicitly selects GM_TITLE. Additional helpers fill an integer array prefix from arr[count], dispatch menu operations and callbacks, and handle back/forward feedback. fn_802FFE0C sets next-mode state ID 4 on argument 6 without establishing that state's gameplay identity.

### shard-main__melee__if__soundtest-002
Reviewed canonical and rendered soundtest.c lines 961–1440, with limited boundary/helper context; this is not complete TU coverage.

- Initializes a small output record with a capped u16 value, another configuration value, 9999999, and zero. Builds StartMeleeData from defaults and stored configuration: selects match kind and timer behavior, copies stage/team settings, and configures four players including character, slot, colors, team, rumble, ratios, CPU settings, stocks, and scale.
- Implements activation-gated callbacks selecting numeric next-state IDs or named mode constants, usually playing forward feedback before calling gm_801A4B60. Two callbacks first install distinct numeric presets. The gallery callback invokes two Toy functions before selecting GM_TOY_GALLERY.
- Applies saved language without an activation check; conditionally invokes gmMainLib_8015FB68; dispatches menu configuration/callback pairs through a common activation-gated helper.
- Reads four bytes from gmMainLib_8045A6C0 at offset 0x1868 plus a configurable index into local edit fields. Alternate readers mask the index with 0xFFFE or 0xFFFC. A separate activation-gated writer copies all four bytes back.
- Two callbacks copy the fifth int into the preceding four ints at distinct configuration addresses when activated; neither explicitly returns despite its bool signature.
- Refreshes auxiliary values according to selector cases 2 and 3: case 2 performs unsigned integer division by 100 before conversion to float; case 3 reads a value, passes it to another function, and caches it. A separate callback caps the case-3 cached value at 1 without enforcing a lower bound.

### shard-main__melee__if__soundtest-003
Reviewed canonical and rendered soundtest.c lines 1441–1920 only. This region implements callback-driven state editing and mode selection. Activation callbacks set two explicit unlock IDs, write a scaled global through a returned pointer, and update the KO total. Paired callbacks initialize editing globals on argument 1, then handle argument 0 with back feedback and a helper call, or argument 6 by committing match totals, a value scaled by 100, or two globals passed to a setter. Mode-selection callbacks populate selection fields and schedule Adventure, Classic, All-Star, debug game-over, Classic game-over, opening movie, debug cutscene, boot, or progressive-scan modes. Other callbacks select numeric next-state IDs without identifying their gameplay meaning here. The region also contains two direct menu-helper wrappers and an allocation/setup routine that loads card archive 0, allocates snapshot-related buffers and a 0x96000-byte buffer, creates a GObj, assigns its gxlink_prios, and resets a global. The final callback body extends beyond this shard.

### shard-main__melee__if__soundtest-004
Reviewed canonical and rendered soundtest.c lines 1921–2400 only.

- The opening callbacks gate operations on argument 1, report results, and invoke card-related routines. Some results cause additional calls with literal status values 0 or 4; un_80301840 also forwards its result to gmMainLib_8015FA34.
- Snapshot-related callbacks poll lb_8001B6F8 while its result equals 0xB. The image path creates a replacement graphics object only after a zero polling result and a nonzero lbSnap_8001DE8C result, assigns the image buffer, and sets sprite fields to 320 and 240. Two other operations refresh through lbSnap_8001D40C(0) after successful polling.
- Scene callbacks branch on arguments 0, 1, or 6, play navigation sounds, and dispatch menu or game-mode calls. Numeric next-state values remain uninterpreted. Explicit mode calls use GM_CAMERA_VS and GM_EVENT; the latter first passes x188 minus one to gm_801BEB74.
- Two export helpers copy selected un_803FA258 fields into output records and initialize remaining fields with constants.
- Static data supplies sound-test menu bindings and resource strings, a 76-element integer table, configuration defaults, and debug/global-edit/versus/rule menu descriptors. Rule labels directly associate configuration fields with minute, second, stock, damage-ratio, and item-switch controls. The range ends at the opening rumble-menu descriptor.

### shard-main__melee__if__soundtest-005
Reviewed canonical and rendered soundtest.c lines 2401–2880 only. This range contains data definitions rather than function bodies: menu labels, option-name arrays, and descriptor tables connecting labels to callbacks and backing variables. The DaiRanTou table supplies character, scale, player-kind, color, damage, ratio, CPU, team, stage, and melee-kind entries. Its Stage entry references an 86-string array. Character selection uses 34 strings; player-kind, CPU-type, and team tables use four, eighteen, and three strings respectively. Per-player descriptors reference distinct portions of un_803FA258. Later definitions provide an eight-entry TEST MODE callback menu, a Hanyu Test menu, melee-count descriptors, and two player-count descriptor variants with different Count backing variables and numeric metadata. A separate 77-element u32 table has no established meaning in this range. The boundaries include the tail of an earlier descriptor table and the beginning of Otoguro Test labels.

### shard-main__melee__if__soundtest-006
### Assigned source: soundtest.c, lines 2881–3122
This range contains static test-menu data rather than function bodies: labels, option-string arrays, callback references, pointers to configuration storage, and numeric parameters. Tables cover the displayed Taniguti, Regular Ending, Nagasima, Kim, Yoshiki, Intro Easy, Result, Sakoda, and Sugano test menus, plus an earlier menu's trailing labels and complete table.

The Intro Easy table binds stage, left/right display-count, metal, and player-labeled entries to individual fields of `un_803FA258`. The Result table binds player-kind, rank, win, color, animation, and panel-visibility labels to `x144` elements; its All Player entry references `un_80301CE0`. Other tables connect scene, record, reward, card, and snapshot-labeled entries to callbacks and storage. These are label-to-data/callback associations, not verification of callback effects.

The range also defines diagnostic strings and `un_803FD274`, an `HSD_ImageDesc` initialized with a null image pointer, 640×480 dimensions, and `GX_TF_RGB565`. Each complete menu table ends with a row whose first value is 9 and whose pointers are null.

### shard-main__melee__if__soundtest-007
Reviewed the assigned canonical and rendered header, `src/melee/if/soundtest.h:1–79`, only. It declares callback/string-bearing data, a menu-data aggregate containing 11 entries and two character buffers, and two opaque records with source-level size assertions of 0xC and 0x20. It exposes eight function prototypes and four external data objects, including entry arrays of lengths 11, 4, and 10. This range defines the interface and data declarations, not executable behavior; proposed function names and gameplay meanings are not established here.

### shard-main__melee__if__soundtest-008
Reviewed the six assigned subjects. The source defines typed developer-menu tables, initialized audio controls, and runtime audio, record-editor, and snapshot state. Sound Test initialization resets gains and playback selections; callbacks update group ranges and toggle repeated BGM activation. Record callbacks commit staged values, while successful snapshot loading replaces a retained preview object. fn_802FFCC8 is an unconditional false-return callback installed during Sound Test initialization. fn_802FFE0C handles events 0 and 6, with the latter selecting state 4 and writing scene-control value 1 through gm_801A4B60. Exact compiled section layout and several stronger interface interpretations remain deferred; this is not complete TU coverage.

### shard-main__melee__if__soundtest-009
Reviewed the six assigned callback bodies and selected dependencies, not the complete translation unit. The shared callback performs audio/menu handling only for event 0. Three record callbacks handle event 6 by writing four match counters, a scaled character-indexed record, or a character-indexed flag. Two scene-test callbacks copy character/color selections and request mode changes; the configurable callback maps selectors 0–2 to 0x15–0x17 and requests scene exit even for other selectors. Four callbacks have bool declarations but no explicit return. Detailed gameplay labels, proposed original names, and some return-value interpretations remain deferred.

### shard-main__melee__if__soundtest-010
Reviewed the six assigned functions and supporting menu/audio code. They install archive-table values, provide an inert false-returning callback, initialize menu/audio state, apply the editable sound-mode value, apply three volume values, and apply DSP state before forwarding a preview event. The sound-mode callback is an edit/apply callback, not a demonstrated restoration of the pre-session setting. Source-level assignments are established; compiled overlay layout and original function names are not.

### shard-main__melee__if__soundtest-011
The assigned callbacks rebuild a flattened sound-selection interval, stop or replay indexed SFX, request indexed HPS playback or toggle pause, reset three bounded audio controls, and conditionally request a mode transition. The assigned helper copies a trailing integer into all preceding entries. These are request-level behaviors: the BGM callback updates its retained selection without checking whether playback actually started. Review is limited to the six assigned subjects and supporting source.

### shard-main__melee__if__soundtest-012
The six assigned functions provide guarded submenu opening, requests for debug states 4 and 1, construction of a capped single-record Prize Interface payload, initialization of VS rules and four player records from retained configuration, and unconditional forwarding of a retained language selection to the validated saved-language setter. The debug-state table connects state 4 to GS_VS and state 1 to GS_DEBUG_MENU. Exact menu-label mappings and the prize producer's pointer-layout equivalence require further evidence.

### shard-main__melee__if__soundtest-013
Reviewed the six assigned callbacks and their descriptor registrations. Publicity conditionally calls a global-state routine; Global Data Edit opens a descriptor-backed submenu and installs a back callback; Mode Team Test requests state ID 2 only when its enum argument equals true. Three editing callbacks refresh four bytes from a selected backing-buffer offset, optionally rounding that selector down to a two- or four-byte boundary. The adjacent commit callback reverses the transfer on event 1. Physical cross-object layout and the complete downstream reset scope remain deferred; this is not complete TU coverage.

### shard-main__melee__if__soundtest-014
Reviewed the six assigned callbacks and their immediate helper bodies. un_80300410 writes four staged bytes into gmMainLib_8045A6C0 plus the retained selector and offsets 0x1868–0x186B, only on event 1. The other five callbacks select fixed submenu descriptors and delegate event-1 opening and handler installation to un_802FFD94. Four install the generic back handler; un_80300480 installs a handler with an additional event-6 state-selection operation. All six entry callbacks return false. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__if__soundtest-015
The six assigned callbacks forward their enum-typed event and distinct static menu definitions to `un_802FFD94`, always returning false. Event 1 triggers forward feedback, subordinate-menu construction with arguments `0, -60, 0`, and installation of `fn_802FFE6C` in the current menu's `xC` callback field. The text-menu dispatcher forwards unconsumed entry events to that field. The installed callback requests closure on event 0 with back feedback. These are generic hierarchical developer-menu navigation branches; no specific displayed group or gameplay meaning is established here.

### shard-main__melee__if__soundtest-016
The four definition-specific callbacks delegate submenu opening on event 1, install the common fallback on the current menu, and return false, permitting fallback dispatch. The fallback requests closure on event 0. Two additional callbacks broadcast a trailing integer into four preceding integers in state regions beginning at byte offsets 0x10 and 0x24; both are declared bool but omit a return statement. This review covers only the six assigned subjects, not the complete translation unit. The character-specific interpretation of the first broadcast remains unverified.

### shard-main__melee__if__soundtest-017
The six assigned callbacks forward an enum event, a distinct fixed submenu definition, and the common fallback fn_802FFE6C to un_802FFD94, then return false. The helper performs forward navigation only for event 1 and installs the fallback on the current menu. The dispatcher can subsequently pass the same event to that fallback. Event 0 in the fallback plays back feedback and requests deferred menu closure. These bodies establish generic developer-menu hierarchy navigation, not specific displayed submenu names.

### shard-main__melee__if__soundtest-018
The six assigned callbacks delegate opening a fixed submenu, request two distinct pending game modes, synchronize per-fighter persistent fields into editor caches, upper-clamp the kind-3 integer cache, and queue logical state 4. Activation callbacks act only on event 1 and return false; the synchronization and clamp callbacks ignore their event argument. Kind 2 converts the stored integer to unsigned before integer division by 100 and float conversion. Kind 3 reads and rewrites a persistent bit. Its clamp preserves negative values rather than enforcing a complete Boolean domain. Menu-label associations, inferred original-style names, and claimed gameplay outcomes remain unverified in this bounded review.

### shard-main__melee__if__soundtest-019
Reviewed the six assigned callback bodies, not the complete translation unit. All return false and gate their effects on event 1. Two install fixed shared settings and queue state 4. The remaining callbacks initialize trophy availability, then respectively rebuild the region-filtered collection, request acquisition of ID 0xE6 or 0xC9, or assign un_804D6DDC times ten through a settings accessor. They request deferred mode changes and invoke scene control. Exact debug-command labels, trophy identities, and proposed original names remain unverified.

### shard-main__melee__if__soundtest-020
The six assigned callbacks gate their effects on event 1 and return false. Three initialize or select child editors; their registered handlers write four match counters, a scaled per-fighter integer, or a per-fighter bit. Another callback overwrites the save-backed KO total. The remaining callbacks request state identifier 4 or configure an Adventure route selection and request a mode change. Exact menu labels and speculative original names are not established by these canonical bodies. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__if__soundtest-021-retry180539
The six assigned callbacks are activation-gated and always return false. Two commit selection-minus-one to shared settings and request Classic or All-Star. Two open the same descriptor with different completion handlers, distinguishing a Classic game-over request from a three-way debug game-over request. Two configure opening-mode selector values 0 and 5 and request a deferred mode change. Exact displayed-command mappings and some downstream semantic labels remain unverified; this review does not claim complete TU coverage.

### shard-main__melee__if__soundtest-022
Reviewed the six assigned callbacks and their immediate routing dependencies. Four callbacks act only on event 1, issue forward feedback, schedule a major-mode or logical-state change, request scene exit, and return false. Two wrappers forward events and menu definitions to an activation-gated submenu helper; their installed handlers cancel on event 0 or schedule states 6 and 11 on event 6. The debug table explicitly connects states 6, 7, 11, and 13 to GS_INTRO_EASY, GS_INTRO_ALLSTAR, GS_RESULTS, and GS_MEMCARD. Exact displayed menu labels and historical function names remain unverified. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__if__soundtest-023
Reviewed the six assigned callbacks, not the entire translation unit. Five callbacks perform activation-only confirmation and deferred routing, always returning false. Four request logical debug states 3, 9, 12, and 10; the progressive-scan callback instead requests a pending top-level mode change. The state setter's plus-one storage is an encoding: the router subtracts one before dispatch. The sixth callback unconditionally initializes card/snapshot resources, allocates memory, configures a display GObj, and clears the retained preview handle.

### shard-main__melee__if__soundtest-024
The six assigned callbacks are registered in the Yoshiki Test menu. Each ignores arguments other than 1 and always returns false. Activated callbacks delegate card work and print diagnostics. Create clears shared card state only for result 0; Load invokes reconciliation before clearing state for results 0 or 2; Delete assigns state 4 regardless of its result. Save updates accumulated Power Time and sets a pending request rather than waiting for card completion. This review covers only the assigned subjects and supporting source reads.

### shard-main__melee__if__soundtest-025
The four snapshot callbacks accept action 1 and always return false. They respectively refresh channel 0's catalog, conditionally replace a preview after a pending load completes and conversion succeeds, delete an indexed entry and rescan after successful pending completion, and submit a two-index operation with the same polling/rescan guards. The INTRO EASY callback handles events 0 and 6; event 6 requests debug state 6, whose dispatch record explicitly selects GS_INTRO_EASY. Its entry wrapper calls a straight-line initializer that copies retained settings, installs constants, repeats two source settings across three fields each, and zeros six fields. This review covers only the six assigned subjects.

### shard-main__melee__if__soundtest-026
Reviewed the six assigned functions and selected routing consumers. un_80301C64 initializes the GS_INTRO_ALLSTAR enter payload. un_80301C80 handles events 0 and 6, with event 6 requesting debug state 11, mapped by the state table to GS_RESULTS. un_80301CE0 additionally broadcasts the fifth integer to four preceding integers on event 1; its bool body has no explicit return. The remaining callbacks conditionally request GM_CAMERA_VS, configure a decremented selection before requesting GM_EVENT, or queue debug state 4 (GS_VS). Mode requests are latched; state requests are encoded with +1 and decoded after exit processing. Exact visible menu-command identities and unsupported layout claims remain deferred. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__if__soundtest-027
The reviewed callbacks retain audio selections and mixer settings, forward record edits into game-data accessors, request scene transitions, and perform card/snapshot operations with conditional sprite-preview replacement. `un_80301E08` acts only when its argument equals true: it calls `sfxForward`, requests state 14, requests scene-loop exit state 1, and returns false. The router encodes pending state IDs with +1 and decodes them after scene exit; the debug-state table explicitly associates state 14 with `GS_STAFFROLL`. This review does not establish complete translation-unit coverage.

### shard-main__melee__if__soundtest-028
The six assigned parameter subjects have no baseline facts to disposition. Canonical bodies show that the first arguments of fn_80300DE0, fn_80300ED0, fn_8030110C and fn_803011EC select callback branches: value 0 invokes backward navigation, while value 6 applies stored selections or values and requests a scene transition. un_802FF884 ignores its char-pointer argument and returns false; un_802FF88C ignores its enum argument while resetting audio-related state and configuring the current menu object. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__if__soundtest-029
The six assigned parameter subjects have no baseline facts. Their current function bodies declare an enum soundtest_callback_arg0 parameter. Three callbacks ignore it; one forwards it unchanged to another assigned callback; two distinguish values 1 and 0 to select audio calls and, in one case, update cached selection/toggle state. These observations do not establish the event meanings of those numeric values or a compiled register mapping. Review is limited to this bounded shard.

### shard-main__melee__if__soundtest-030
The assigned subjects contain no baseline facts. Current bodies show that un_802FFC30 ignores its argument and unconditionally invokes four audio operations; un_802FFC6C gates audio operations and a title-mode transition on its argument equaling true. un_802FFCD0 treats its data pointer as an int array and copies element count into elements [0, count). un_802FFD94 gates menu construction on its first argument equaling 1 and forwards its second argument to un_80304210. This review is limited to the assigned parameter subjects, not the complete translation unit.

### shard-main__melee__if__soundtest-031
The six assigned parameter subjects have no baseline facts to disposition. Current bodies show a callback forwarded during conditional menu setup; two event arguments gating scene-transition calls; two output pointers populated from global configuration and defaults; and an unused event argument in a saved-language setter. Numeric scene-state values are not assigned gameplay meanings. Review is limited to this bounded shard.

### shard-main__melee__if__soundtest-032
The six assigned parameter subjects have no baseline facts to disposition. Current bodies declare each parameter as `enum soundtest_callback_arg0`. In `un_80300248`, `un_80300290`, and `un_803002FC`, the parameter gates actions on value 1; the first additionally requires a nonzero stored field. In `un_80300338`, `un_80300378`, and `un_803003C4`, the parameter is unused: these functions copy four bytes from a global buffer into menu-data fields, with the latter two first masking the buffer offset by `0xFFFE` and `0xFFFC`, respectively. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__if__soundtest-033
The six assigned parameter subjects have no baseline facts to disposition. In the canonical bodies, un_80300410 uses its enum argument to gate a sound call and four byte writes: only argument value 1 copies x224–x227 into gmMainLib_8045A6C0 at x220 plus offsets 0x1868–0x186B. The other five functions forward their enum argument unchanged to un_802FFD94 with distinct data pointers and a callback. All six return zero. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__if__soundtest-034
The six assigned parameter subjects belong to thin callback wrappers. Each function accepts `enum soundtest_callback_arg0 arg0`, forwards it unchanged as the first argument to `un_802FFD94`, supplies a distinct data address and the shared callback `fn_802FFE6C`, and returns zero. The bundle contains no baseline facts for any of these subjects; consequently there are no fact dispositions or proposed changes. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__if__soundtest-035
The six assigned parameter subjects have no baseline facts to disposition. In the current function bodies, all six parameters are declared as `enum soundtest_callback_arg0`. Four wrappers forward the argument unchanged to `un_802FFD94`, with distinct data addresses and the same `fn_802FFE6C` callback, then return zero. The other two functions test the argument against 1 and conditionally call `un_802FFCD0` with 4 and different offsets into `un_803FA258`; neither body has an explicit return statement. No gameplay meaning or compiled parameter layout is inferred.

### shard-main__melee__if__soundtest-036
The six assigned parameter subjects belong to un_803007FC, un_80300830, un_80300864, un_80300898, un_803008CC, and un_80300900. Each function accepts an enum soundtest_callback_arg0 and forwards it unchanged as the first argument to un_802FFD94, alongside a distinct data address and the shared fn_802FFE6C callback, then returns zero. All six subjects have empty baseline fact arrays, so there are no baseline fact IDs to disposition. This review is limited to the assigned subjects, not the complete translation unit.

### shard-main__melee__if__soundtest-037
The six assigned parameter subjects have no baseline facts to disposition. Their canonical function bodies declare enum soundtest_callback_arg0 parameters. un_80300934 forwards its argument to a helper that acts only on value 1. un_80300968, un_803009A4, and un_80300AB8 gate transition calls on equality with true. un_803009E0 and un_80300A88 do not use their arguments; their behavior instead depends on un_804D6DD8. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__if__soundtest-038
The six assigned parameters are callback arguments of source type `enum soundtest_callback_arg0`. Each corresponding function performs its side effects only when the argument equals 1 (spelled `true` in three bodies), and always returns false. The first two callbacks initialize different numeric values in shared configuration before requesting next state 4. The remaining callbacks respectively request the toy gallery, set unlock entry 0xE6 or 0xC9 before requesting the menu, or store ten times a shared value through a returned pointer before requesting the menu. No gameplay identity is inferred from numeric entries or state IDs.

### shard-main__melee__if__soundtest-039
The six assigned parameter subjects have no baseline facts. Their canonical function bodies declare the first parameter as `enum soundtest_callback_arg0` and gate side effects on equality to 1 (written as `true` in un_80300FEC), returning false otherwise and after execution. un_80300D78 initializes four globals and forwards the argument to un_802FFD94; un_80300E74 and un_80300F3C set a selector and likewise forward it. un_80300F98 writes the configured KO total and requests GM_MENU; un_80300FEC sets next state ID 4; un_80301028 writes a selection field and requests GM_ADVENTURE. No gameplay meaning is inferred for numeric callback or state IDs.

### shard-main__melee__if__soundtest-040
The six assigned parameter subjects belong to callbacks whose side effects are gated on the first argument equaling 1 (or true); all six return false/0. un_80301074 and un_803010C0 update x5 in their respective retrieved data objects before requesting a mode change. un_80301280 and un_803012D4 forward the argument to un_802FFD94 with the same data address but different callbacks. un_80301328 and un_8030136C request the same mode, with distinct preceding gm_801BF708 arguments (0 and 5). All assigned subjects have empty baseline fact lists, so there are no fact IDs to disposition. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__if__soundtest-041
The six assigned parameter subjects have no baseline facts to disposition. Their current function bodies accept enum soundtest_callback_arg0. un_803013B0, un_80301454, un_80301490 and un_803014CC gate their side effects on the argument equaling true: they play forward feedback, select a game mode or numeric next-state ID, and call gm_801A4B60. un_803013EC and un_80301420 instead forward the argument unchanged to un_802FFD94 with distinct menu-data and callback pointers. All six return false/0. This review covers only the assigned subjects, not the full translation unit.

### shard-main__melee__if__soundtest-042
The first parameters of un_80301508, un_80301544, un_80301580, un_803015BC, and un_803015F8 gate their side effects on equality to true. Those branches call sfxForward, request a state or mode change, and call gm_801A4B60; all five callbacks return false. In contrast, un_80301634 does not use its parameter: it unconditionally allocates and initializes card/snapshot-related resources and a graphics object, clears un_804D6E08, and returns zero. All six assigned subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition.

### shard-main__melee__if__soundtest-043
The six assigned parameter subjects belong to callbacks un_803016D8, un_80301734, un_8030178C, un_80301800, un_80301840, and un_803018BC. Each canonical definition takes enum soundtest_callback_arg0 arg0 and returns zero immediately unless arg0 equals 1. Thus the parameter gates the callback's reporting and downstream calls; it is not forwarded as a card-operation argument. All six callbacks also return zero after executing their gated paths. The bundle contains no baseline facts for any of these subjects, so there are no fact IDs to disposition. This review is limited to the assigned subjects, not the entire translation unit.

### shard-main__melee__if__soundtest-044
The assigned subjects contain no baseline facts. Current canonical bodies show four callbacks that perform their operations only when the first argument equals 1: one calls the snapshot subsystem with index 0, one conditionally builds an image-display object after polling completion, and two poll operations and refresh index 0 on successful completion. Another callback branches on argument values 0 and 6 for menu navigation or a mode-transition request. The remaining function takes an output-structure pointer and fills selected fields from global configuration and constants. This review is limited to these six parameter subjects.

### shard-main__melee__if__soundtest-045
The six assigned parameter subjects have no baseline facts. Canonical bodies show that un_80301C64 receives an output pointer, copies un_803FA258.x138 into x0, and clears x4. The other five receive enum soundtest_callback_arg0 values used to select callback actions: un_80301C80 handles values 0 and 6; un_80301CE0 handles 1 and 6; un_80301D40, un_80301D7C, and un_80301DCC act only when the argument equals 1. These branches invoke menu-navigation or game-mode transition helpers. Numeric state IDs are not assigned gameplay meanings here.

### shard-main__melee__if__soundtest-046
The assigned parameter belongs to `un_80301E08`, whose canonical argument is `enum soundtest_callback_arg0 update_scene`. Only equality with `true` triggers calls to `sfxForward`, `gm_SetNextGameModeStateId(0xE)`, and `gm_801A4B60`; the function always returns false. The callback is registered on the menu entry labeled `STAFFROLL START >`. The bundle contains no baseline facts to disposition. This review does not claim complete TU coverage.

### shard-main__melee__if__soundtest-047
The reviewed callbacks control selected audio, replicate menu configuration values, open subordinate menus, commit record totals, and request configured mode transitions. Specialized result-screen, card-formatting, audio-bus, and compiled-section claims require additional downstream evidence. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__if__soundtest-048
The reviewed callbacks delegate to descriptor-backed menu panels, commit a saved-language selection, schedule scene or major-mode transitions, and invoke trophy and memory-card services. Record editing includes scaling a value before committing it; snapshot display setup assigns two floating-point coordinates. This review assesses only the twelve assigned links, not the complete translation unit.

### shard-main__melee__if__soundtest-049
The reviewed callbacks open descriptor-selected submenus, modify audio controls, seed mode-selection data, and queue scene transitions. Other callbacks invoke snapshot operations or broadcast an aggregate value to four entries. Specific gameplay interpretations of opaque fields and indexed destinations remain deferred; this review does not establish complete TU coverage.

### shard-main__melee__if__soundtest-050
The reviewed callbacks open descriptor-backed menus with a shared back handler, broadcast a retained value to four entries, populate match rules and player settings, and request scene transitions. Explicit destinations include trophy gallery, opening movie, title, and GM_CAMERA_VS. The snapshot callback submits an indexed channel-0 operation and polls its result. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__if__soundtest-051
The reviewed callbacks forward menu state to audio routines, dispatch pending scene or major-mode changes, and commit edited values through record accessors. Current source also explicitly connects sound-test controls to shared scalar state. Specific gameplay destinations, external documentation mappings, and compiled section membership require additional corroboration; this review does not establish complete TU coverage.

### shard-main__melee__if__soundtest-052
The reviewed callbacks dispatch descriptor-backed panels, configure pending scene transitions, edit persistent-record staging values, and control audio selections. Specific documented menu-command mappings remain deferred where current bodies expose only opaque descriptors, numeric identifiers, or unverified callees. This review covers the assigned links, not the entire translation unit.

### shard-main__melee__if__soundtest-053
The reviewed callbacks initialize audio-menu state, open descriptor-specific submenus, write the KO-total value, and request deferred major-mode or state transitions. Explicit destinations include GM_TITLE, GM_BOOT, GM_HANYU_SSS, and GM_PROGRESSIVE_SCAN. Numeric state requests alone do not establish battle or results-screen mappings. This review covers only the assigned links, not the full translation unit.

### shard-main__melee__if__soundtest-054
Reviewed the twelve assigned links against current canonical callback bodies. Supported behavior includes descriptor-backed menu activation, three bounded audio controls, an Adventure-mode request, indexed scene requests, and card/snapshot resource allocation. Exact external menu-command mappings and several downstream gameplay interpretations remain deferred; this is not complete TU coverage.

### shard-main__melee__if__soundtest-055
The reviewed code supplies Sound Test descriptors and archive-loaded selection metadata, shared submenu opening/back callbacks, match-total editing, and scene-transition commands. Snapshot operations retain indices and preview state in static storage. This assessment covers only the twelve assigned links, not the full translation unit.

### shard-main__melee__if__soundtest-056
The assigned callbacks delegate descriptor-specific menu navigation, request scene transitions, and invoke card/snapshot operations. Snapshot callbacks poll pending operations and conditionally refresh state or construct an image display object. This review covers only the assigned links; detailed downstream file semantics and compiled section membership remain deferred.

### shard-main__melee__if__soundtest-057
Reviewed the twelve assigned links against current callback bodies and selected supporting code. The callbacks open descriptor-backed menus, commit a saved-language selection, control audio through helper calls, request scene changes, and invoke save/snapshot operations. Navigation, saved-language delegation, and snapshot-card catalog refresh are directly supported. More specific control labels, gameplay destinations, record meanings, and persistence semantics remain deferred where the inspected code does not establish them. This is bounded link review, not complete TU coverage.

### shard-main__melee__if__soundtest-058
The reviewed callbacks load archive symbols, open menu configurations, handle back actions, write staged bytes into shared data, and request scene or major-mode transitions. Other reviewed code stages character/color selections and polls a snapshot operation before a conditional refresh. This review covers only the twelve assigned links, not the complete translation unit.

### shard-main__melee__if__soundtest-059
The assigned callbacks perform descriptor-backed menu navigation, unconditional audio-reset calls, record-editor confirmation, and activation-gated scene routing. Current bodies support the navigation relationships and several scene-launch relationships. Specific record meanings, the trophy-command identity, and the indexed game-over destination remain deferred rather than inferred from proposed names or numeric identifiers. This review covers only the assigned links.

### shard-main__melee__if__soundtest-060
The reviewed callbacks configure match rules and players, navigate descriptor-backed debug submenus, select subsequent scene states, launch the trophy gallery, edit match and KO totals, and invoke card operations. Sound-test initialization installs an inert fallback callback and sets menu scale. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__if__soundtest-061
The reviewed callbacks apply stored audio parameters, compute cumulative sound-selection bounds, initialize match rules and four player descriptors, dispatch descriptor-backed menu navigation, and request configured mode transitions. The Game Over entry installs a callback that copies character/color settings and selects among three debug presentation variants. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__if__soundtest-062
The reviewed callbacks delegate descriptor-backed menu entry to a shared helper, install cancellation or confirmation handlers, commit four match counters, configure scene transitions, and invoke trophy and card-related APIs. This review assesses only the twelve assigned links; detailed destination mappings and several downstream effects remain unverified.

### shard-main__melee__if__soundtest-063
Reviewed the five assigned links, not the entire translation unit. The inspected code opens a submenu with a scene-transition callback, schedules HANYU_SSS and numeric pending states, copies stored settings into an output payload, and supports card/snapshot diagnostics and snapshot display. Specific gameplay mappings and compiled-section ownership remain deferred where the inspected source does not establish them.

Status: researched; no-change lead bypass; independent review and live promotion pending.
