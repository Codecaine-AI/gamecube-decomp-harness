## Invisible Melee mode adapter

`gminvisible.c` owns the source-level `gm_Mode_InvisibleVs_States` descriptor array and thin adapters to shared Versus-mode machinery. The header declares the two public initialization/load hooks. Inherited research covers both owned files completely in canonical and rendered form; rendered views reported zero substitutions and zero parse errors. The lead independently checked every proposed fact's canonical citations and all upstream contradiction evidence. Existing names remain appropriate; rendered names were not treated as independent proof.

### State descriptors

The array contains CSS, SSS, ordinary VS, Sudden Death, Results, Approach, ApproachVs and Prize, followed by a terminating descriptor. The first five use `lbDvdPreload_3`; auxiliary states use `lbDvdPreload_2`. CSS and SSS reuse their respective shared entry/exit payloads. Ordinary VS and Sudden Death share start data but have distinct exit payloads. Results and Prize have NULL exit payloads; Approach has no exit callback. ApproachVs uses common callbacks rather than the local invisibility initializer, so invisibility initialization is established for the two local battle-entry paths, not automatically every auxiliary battle.

Primary state IDs are 0–4, Approach is 128, ApproachVs is 129 and Prize is 192. Array position, state ID and `GS_*` scene identifier are distinct; this table is not an unconditional itinerary or proof of compiled `.data` layout.

Evidence: [descriptors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gminvisible.c#L25-L123), [IDs](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmode.h#L6-L15).

### Initialization and selection lifetime

`gm_Mode_InvisibleVs_OnInit` passes the persistent `modes.vs_invisible` record to `gm_InitVsMode`. `OnLoad` separately resets shared Versus KO counts. Shared CSS entry attaches those counts, copies persistent configuration into its payload, selects `VS_INVISIBLE` and prepares the preload cache. CSS exit checks exactly `CSSPendingSceneChange_2`, changing to `GM_MENU` and returning without committing selection; other values commit selection and prepare character audio. SSS entry copies persistent configuration; true `start_game` commits it and prepares stage audio, while false schedules CSS.

Evidence: [local adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gminvisible.c#L125-L145), [hooks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gminvisible.c#L186-L194), [shared selection lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L107-L169).

### Battle construction and exit

`initVsPlayer` unconditionally sets the destination player's `vs_invisible` field and ignores its second argument. Ordinary VS and Sudden Death entry pass this callback and a NULL whole-match callback. Shared builders copy persistent rules and all six player records before invoking the player callback. This does not modify the persistent source or imply every copied slot participates. NULL custom callbacks do not suppress common setup; Sudden Death applies additional rules and standings-dependent setup.

Ordinary VS exit delegates accounting and routing. The multiple-winners predicate returns false for `OUTCOME_NO_CONTEST`; otherwise it tests team winners when `is_teams == 1`, and player winners otherwise. False selects Results; true selects Sudden Death.

Evidence: [local battle adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gminvisible.c#L147-L173), [shared builders](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L171-L268), [predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L3241-L3262), [Sudden Death setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1B03.c#L79-L104).

### Result reconciliation and exceptional progression

Sudden Death exit calls `gm_80166CCC` with retained ordinary `match_end` first and Sudden Death `match_end` second. It conditionally updates retained outcome and standings and can also adjust the second record's standings for remaining ties. This is not a whole-record copy. Results entry initializes its payload and copies the retained ordinary result into it. Numeric slot checks, `xE` semantics and unequal team-loop bounds remain owner-level questions.

Results exit supplies CSS as fallback. The shared finalizer skips two accounting calls for canceled matches but still invokes KO updating. Human participation and a nonterminating following descriptor gate exceptional route selection. Three ordered challenger checks can select Approach. Further processing includes literal `foo != 328`, whose broader meaning is not inferred. When no challenger route was selected, a successful `gm_801721EC()` selects Prize. Exceptional routes perform archive setup and return, preserving their destination; otherwise archive setup precedes the CSS fallback write.

Evidence: [reconciliation and Results copy](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L264-L275), [conditional mutations](code://c302741689bd67c3617faadb221df3193992c3/src/melee/gm/gm_1601.c#L3159-L3239), [complete finalizer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L277-L344).

### Review outcome

Adopt all six proposed facts and five upstream supersessions without overrides. Explicitly retain the inherited 64 unchanged facts and all 41 links, including distinct historical records. Preserve historical parameter identities without speculative merges. Accept source-only `.data` interpretation and defer sibling-wrapper auditing and detailed shared-helper field semantics to their owners.

Status: synthesized; independent review and live promotion pending.
