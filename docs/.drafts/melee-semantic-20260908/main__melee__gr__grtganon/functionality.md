# TGanon semantic review

## Scope and result
Reviewed all 191 canonical and rendered lines of `grtganon.c`, all 33 canonical and rendered lines of `grtganon.h`, all 41 frozen subjects, 128 facts, and 22 links. Cached evidence was restored into this attempt. Coverage reports no missing ranges or offsets.

Retain 126 existing facts and all 22 links. Replace two inferred-type descriptions that overstate compiled section evidence, and add one useful dynamics-callback state description. Existing function names fit their canonical roles; mixed naming conventions alone do not justify renaming. Historical wiki-backed course context is preserved as inherited knowledge, not claimed as newly verified source evidence.

## Registration and initialization
`grTGn_StageData` registers `Gr_Kind_TGanon`, `/GrTGn.dat`, lifecycle callbacks, a collision-line dynamics lookup, and a shadow eligibility predicate. Its callback array has three populated rows and a fourth all-null row. Only row 2 has `0xC0000000`; the descriptor flags value is `(1 << 0)`. Source declarations do not establish compiled section placement or object layout. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtganon.c#L15-L45)

Initialization caches `Ground_GetYakumonoParam()`, clears `stage_info.unk8C.b4`, sets `b5`, configures IDs 0, 1, and 2 in that order, then calls four shared Ground routines. A failed GObj lookup is reported and returned as null, but initialization ignores each result and continues. The helper indexes the callback table without an explicit bounds check; 0–2 is the observed caller domain, not a validated general input range. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtganon.c#L52-L96)

The canonical setup inline clears two Ground callbacks, registers the display link, installs a non-null fourth callback, invokes initialization, and schedules the process at priority 4. It does not consume `callback1` or the callback-row flags. Their presence in the table is therefore not proof that this setup path installs or interprets them. [Inline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L33-L49)

## Object callbacks
- Object 0 initializes archive-backed model/animation state using its map ID and selector 0. Its process and fourth callback are empty.
- Objects 1 and 2 both invoke `Ground_JObjInline1`, which performs joint setup and animation initialization with selector 0.
- Object 1's process forwards its GObj to `Ground_801C2FE0`.
- Object 2 first calls `lb_800115F4`, then forwards its GObj to `Ground_801C2FE0`.
- All three callback1 bodies return false; all fourth callbacks are empty.

These roles follow from the canonical table and bodies, not rendered names. No visible platform or obstacle is assigned to an internal object ID. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtganon.c#L98-L158) [Joint helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L30) [Animation implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/granime.c#L988-L1048)

The shared `lb_800115F4` update accumulates pre-decay scale for records whose `x0 == 1`, subtracts `x24` with a zero lower clamp, decrements only positive countdowns, increments the angle counter, and recycles records whose countdown is zero. Negative countdowns are not decremented or retired by that test. Aggregate status becomes 1 or 2 above the 0.1 threshold, otherwise -1 or 0, depending on whether its prior value was positive. These numeric states are not assigned additional gameplay meanings here. The rendered wind-effect name does not independently prove the complete subsystem interpretation. [Library implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_00F9.c#L939-L992)

## Lifecycle and cross-file lifetime
Demo initialization and load are no-ops. The parameterless stage predicate returns false. Start requests a shared generator manager with a null spawn-description pointer and ignores the result. The constructor creates data and a GObj; on GObj failure it reports, frees the data, and returns null before assigning generator globals. On success it schedules the process and stores the descriptor and data globally. TGanon supplies no local retry, duplicate-start guard, or cleanup. [Lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtganon.c#L47-L80) [Constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grzakogenerator.c#L303-L329)

## Dynamics and shadow policy
The dynamics callback rejects line sentinel -1, rejects every joint result other than 0, and selects ceiling→`x0`, right wall→`x4`, left wall→`x8`. Other kinds return null. Accepted branches dereference the cached parameter table without a null check; initialization and external resource lifetime must supply a valid table. This function neither allocates nor copies descriptors and does not mutate the cache. Arbitrary invalid line IDs are not proven safe merely because -1 is checked. [Lookup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtganon.c#L160-L185)

The shadow callback ignores all three inputs and returns true. It never rejects through this hook, but does not itself render a shadow or prove that other rendering conditions pass. The integer input's meaning remains unspecified. [Predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtganon.c#L187-L190) [Interface](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/forward.h#L194-L196)

## Rendered-view and type caveats
Both rendered files report zero parse errors. The header reports `shadowed_binding` for `grTGanon_80224784` and `grTGanon_802249B4`; the dynamics name is substituted in the C file but not its header declaration. This is a renderer issue, not evidence against the semantic name. The helper's header return spelling is `Ground_GObj*`, while its definition uses `HSD_GObj*`. The demo callback has a concrete `bool` parameter while the shared descriptor spells that slot's parameter `int`. The animation callee likewise spells its selector `bool` while indexing arrays with it. These source-level spellings are preserved without unsupported ABI normalization.

Status: researched; no-change lead bypass; independent review and live promotion pending.
