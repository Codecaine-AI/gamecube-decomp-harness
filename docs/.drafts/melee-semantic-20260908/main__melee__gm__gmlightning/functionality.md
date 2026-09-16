## Lightning Melee functionality

`gmlightning.c` defines Lightning Melee's mode-state table and thin lifecycle wrappers. The header declares ten `void(GameModeState*)` callbacks and two `void(void)` mode callbacks. Canonical and rendered views agree structurally; rendered function names remain hypotheses, not recovered identifiers.

### State table

The table contains eight populated descriptors and a final `{ -1 }` sentinel. Primary IDs are 0/CSS, 1/SSS, 2/VS, 3/Sudden Death and 4/Results. Auxiliary IDs are 0x80/Approach, 0x81/Approach VS and 0xC0/Prize Interface. The primary descriptors retain numeric initializer fields `3, 0`; auxiliary descriptors retain `2, 0`, without assigning unsupported meanings to those fields. Approach has no exit callback; Results and Prize have NULL exit payloads. Ordinary VS and Sudden Death share the start-data object but use different exit records. Auxiliary Approach VS uses shared callbacks, not the local Lightning speed-entry wrapper. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmlightning.c#L11-L109)

### Configuration and selection

OnInit initializes `gmMainLib_804D3EE0->modes.vs_lightning` through `gm_InitVsMode`. Shared defaults include game speed 1.0 and -1 for loser, ordered-stage index and winner; the Lightning speed override is separate. OnLoad clears the shared Versus KO-count array, which CSS later references by pointer. CSS entry copies persistent settings and supplies match type 9. CSS cancellation (`CSSPendingSceneChange_2`) requests GM_MENU and returns before persistence/audio work; otherwise the selected configuration is committed and character audio prepared. SSS entry copies persistent settings into its payload. SSS exit commits settings and prepares stage audio only when `start_game` is true; otherwise it requests the supplied CSS destination. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmlightning.c#L111-L130), [lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmlightning.c#L170-L178), [shared selection/reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L107-L169), [defaults](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L3526-L3564).

### Battle setup and exit

`fn_801BA7AC` unconditionally writes `start->rules.game_speed = 1.25F` and ignores its second argument. Ordinary and Sudden Death entry both supply this whole-match callback and a NULL per-player callback. The shared builders copy rules, invoke the speed hook, then copy players. Ordinary setup first updates persistent settings through `gm_80167BC8`, adjusts stock/VS flags, and later loads the announcer. Sudden Death instead finishes with `gm_SetupSuddenDeath` using the prior ordinary match-end record. Thus the speed write targets constructed match data rather than directly overwriting persistent rules. [Lightning hook and registrations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmlightning.c#L132-L153), [builders](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L171-L262).

Ordinary battle exit delegates accounting and passes literal destinations 4 and 3. The shared predicate selects Results when false and Sudden Death when true. This is not exclusively a single-winner distinction: no-contest returns false, and the predicate uses team or individual winner counts as appropriate. [Exit routing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L207-L233), [predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L3241-L3262).

Sudden Death exit delegates to `gm_80166CCC` with the persistent ordinary match-end record and the separate Sudden Death exit record. This is a selective, guarded merge—not a complete record copy. It conditionally propagates no-contest/retry outcomes, adjusts standings under winner-count and participation guards, and can mutate both records. The wrapper itself does not choose a next state. [Delegation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L264-L268), [merge](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L3159-L3239).

### Results and exceptional progression

Results entry initializes its payload and copies the shared ordinary match-end record, including any preceding Sudden Death merge. Results exit passes Lightning's persistent settings and fallback state 0. Canceled matches skip two processing calls but still reach KO-count updating. Progression checks require a human participant and a nonterminating following descriptor. Challenger checks may choose Approach; Prize is considered only without an earlier diversion. Diversions perform archive setup and return; otherwise archive setup precedes fallback selection. The numeric `328` comparison and unresolved fields/callee semantics are not given invented meanings. [Results processing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L270-L344).

### Evidence limits

Source establishes table contents and the 1.25F literal, not compiled section extents or literal placement. The `.data` review retains source-table semantics only. Four `.sdata2` facts and its concept link remain unresolved without compiled evidence. Four facts are superseded to clarify Sudden Death merging and builder ordering; other retained names remain descriptive hypotheses.

Status: synthesized; independent review and live promotion pending.
