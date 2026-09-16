# dbanim semantic review

Reviewed revision `c302741689bd67c361cd7faadb221df3193992c3`. The complete 222-line canonical file and rendered view, all 12 subjects, 50 baseline facts and 16 links were independently examined. Coverage reports no missing files or enumeration offsets. The ledger explicitly retains 23 facts and 11 links, supersedes 6 facts, and defers 21 facts and 5 links. No section-subject writes or cosmetic renames are proposed.

## Source ownership and setup

The source declares `db_AnimationInfo` with a `DevText*` and `char buf[0x5A4]`, plus `db_804D6B48` with declared field widths of 3, 6 and 1 bits. These are source declarations, not proof of compiled section placement or exact section extent.

Setup selects collision mode 1, miscellaneous selector 0 and logical panel-update flag 0. It requests DevText id 7 at position 20,20 with dimensions 60 by 12, stores the result, and conditionally registers and styles it: hidden cursor, transparent-black background, opaque-white text and scale 9 by 12. It does not populate fighter rows or explicitly hide text/background. [Source setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L12-L42).

The inspected DevText creator obtains a record from its pool, attaches the caller's buffer and clears `h * w * 2` bytes, here 1440. Duplicate registered ids return NULL; pool exhaustion enters an assertion path. Setup overwrites its saved pointer before checking success. Subsequent visibility and enabled-update paths lack local NULL checks. Repeated setup therefore cannot be assumed idempotent or safe merely because initial styling is guarded. DevText creation initializes the cursor flag rather than the text/background hide flags. [Creator](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib.c#L24-L83), [visibility operations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib.c#L159-L198).

## Visualization transitions and cross-file effects

From initialized state, miscellaneous selection follows `0 → 1 → 2 → 4 → 8 → 16 → 32 → 0`. The implementation shifts any nonzero value and masks with `0x3F`; the one-hot description applies to the initialized reachable cycle. Each invocation preserves fighters' low two flag bits and replaces the upper six. Selector bits 2, 8 and 32 control enemy-stomp, item-pickup and coin-pickup displays respectively. Exact meanings of all six fighter drawing phases remain deferred. [Transition](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L44-L77).

The item helpers update existing items and persistent item-side selectors. Stomp enable is conditional on an item flag, while disable clears that display for all items; pickup applies to all items; coin operations select `It_Kind_Unk4`. These distinctions are not interchangeable global boolean effects. [Item helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L53-L156).

R+Up advances the shared collision value through 1–3 and assigns the whole visualization byte of every fighter. R+Right excludes slot type 3, advances the selected fighter's low two bits through 1–3, and likewise assigns the whole byte. Both clear upper miscellaneous bits without resetting the shared miscellaneous selector or synchronizing its item-range controls. Only the right branch explicitly refreshes items with an exactly matching owner pointer. R+Left subsequently advances and reapplies the miscellaneous selection. Exact correspondence of numeric collision values to named drawing modes is deferred. [Input writes](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L156-L185), [owned-item refresh](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L227-L240).

`fn_8022697C` reads the complete visualization byte, not merely collision bits. Its class predicate rejects NULL and nonfighter objects but does not independently validate fighter user data. The item consumer separately tests owner class: recognized fighters supply low collision bits after those item bits are cleared; nonfighter owners instead take a global-item-mode OR branch. They are not universally disabled by the accessor's zero fallback. [Accessor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L79-L87), [predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L426-L434), [consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbitem.c#L210-L225).

## Panel rendering

Enabled updates erase the persistent panel, reset its cursor and traverse the fighter list. Motion ids below `0x155` index the motion-name table; others print numerically. Animation id -1 leaves its column blank; other ids below `0x127` index the submotion table, and remaining ids print numerically. These are upper-threshold comparisons, not comprehensive validation of arbitrary indices. The routine supplies no local validation of panel, fighter payload or name-table pointers.

Animation output starts at column 23, frame output at column 44 using `%03.2f`, and status output at column 52. Bits 1, 2 and 4 of `x221C_u16_y` print L, R and T respectively. No additional interpretation of those letters is required by the source. Debug setup obtains the name-table pointers from `DbCo.dat`; asset contents were not inspected. [Renderer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L89-L148), [table initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L63-L96).

## Input freshness, filtering and ordering

The consumer reads stored held and pressed masks. For freshly refreshed records, pressed is `current & (prev ^ current)`, so an unchanged held direction does not produce a fresh edge every frame. This guarantee is conditional: the dispatcher refreshes two records when either hand is present, otherwise four, but invokes `fn_CheckAnimationInfo` for all four indices before one panel update. In the two-record path, indices 2 and 3 are neither refreshed nor cleared by that frame path. Whether stale nonzero records are reachable through scene and hand-presence transitions remains explicitly unresolved; neither repeated stale actions nor their impossibility is asserted.

Before computing edges, the producer sequentially removes vertical-plus-horizontal D-pad combinations from button and repeat masks. Consequently independent direction tests inside dbanim do not imply that arbitrary physical simultaneous directions reach the consumer unchanged. Surviving tests compose in source order: R+Up, R+Right, R+Left, Y+Down, Y+Left, Y+Right. R and Y modifiers are not mutually exclusive, and multiple player calls may affect the same global state before rendering. The caller gates at `DbLKind_DebugRom`, not exclusively at DEVELOP. [Producer and filtering](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L220), [four consumers and update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L243-L246), [consumer order](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbanim.c#L150-L221).

Y+Down XOR-toggles the panel flag and explicitly changes both text and background visibility. Y+Left dispatches Super Mushroom apply without A and Poison Mushroom apply with A; Y+Right dispatches the corresponding end routine. The selected-player branches exclude slot type 3 but do not independently establish complete entity validity. This unit demonstrates effect requests, not an unconditional guarantee of size change or universal restoration.

## Compiled-artifact boundary

The archived `compiled-artifacts.json` records hashes, symbols and bytes for two inspected objects. It reports `.bss` extent 1448 in both, `.sbss` extents 8 and 4, `.sdata` extents 56 and 50, and `.sdata2` bytes `00000000ffffffff4110000041400000`. These are recorded object observations only. The ledger does not establish that the inspected source object was compiled from this pinned revision. Hashing an object identifies its bytes but does not establish source provenance.

Accordingly, current attribution, exact layout, padding and complete occupancy of `.bss`, `.sbss`, `.sdata` and `.sdata2` are deferred. The archived interpretation of colors followed by floats is not promoted to a current section fact. Source independently establishes the two color initializers, scale arguments, strings and static declarations, but cannot prove their section placement. No proposal writes a fact onto a section subject.

## Rendered-name assessment

Rendering succeeded with zero parser errors and seven substitutions. `fn_GetFighterVisualFlags` remains a useful descriptive hypothesis for the full-byte accessor. The independently inspected classifier and owned-item helper support the corresponding rendered descriptions. Canonical function names remain appropriate; no equivalent-wording rename is proposed. Section naming remains deferred despite the canonical source object name `db_AnimationInfo`. Neither rendered aliases nor earlier draft validation are treated as proof.

Status: synthesized; independent review and live promotion pending.
