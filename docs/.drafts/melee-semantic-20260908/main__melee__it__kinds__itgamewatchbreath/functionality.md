## Game & Watch Breath / Sparky article

This unit implements the attached `It_Kind_GameWatch_Breath` article retained by the fighter as `x2260_sparkyGObj`. Up-aerial entry schedules its setup, despite the historical `AttackAirN` prefix on the Sparky helpers. The existing Spawn, Remove, EnterHitlag and ExitHitlag name hypotheses fit canonical behavior; no cosmetic renaming is proposed.

### Construction and ownership
`it_802C720C` initializes a Breath spawn descriptor, creates the item, and attaches a successful result to the requested fighter part using the article's special attributes. Failure returns NULL without attribute access or attachment. The inline initializer sets all three velocity components to zero. Fighter setup supplies the normal left-hand joint position, left-hand part and facing direction, retains the result, and installs damage/death and hitlag callbacks only when creation succeeds. An already-tracked article takes the landing-handler path instead of spawning again.

Evidence: [constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchbreath.c#L17-L33), [initialization and attachment](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/inlines.h#L60-L89), [fighter setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L194-L215), [up-aerial registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L487-L493).

### States and lifetime
The two table entries select animation IDs 0 and 1, share `itGamewatchbreath_UnkMotion1_Anim`, and have NULL physics and collision callbacks. Pickup always clears `xDAC_itcmd_var0`; only an owned article transitions to state 0 and receives the immediate animation/script update. `it_802C7424` unconditionally selects state 1 with `ITEM_ANIM_UPDATE`.

The shared callback returns true for an ownerless article. With an owner, the fighter predicate returns false inside the inclusive `ftGw_MS_AttackAirHi` through `ftGw_MS_LandingAirHi` interval and true outside it. On owner-present completion, fighter cleanup occurs before the callback returns true. Common item processing interprets that true result as removal.

The landing callback's state-1 call is specifically guarded by `ftGw_MS_LandingAirN`, whereas up-aerial landing initializes `ftGw_MS_LandingAirHi`. This discrepancy must remain explicit: a landing-handler association does not prove that state 1 is reached during ordinary up-aerial landing.

Evidence: [table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchbreath.c#L12-L15), [state selectors and lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchbreath.c#L66-L103), [landing guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L219-L236), [inclusive predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L300-L309), [up-aerial landing initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L650-L657), [callback consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1280-L1290).

### Cleanup and hitlag
The destruction hook notifies a non-null owner but does not itself call common item removal. Explicit removal first checks the resolved Item pointer, conditionally notifies its owner, then calls the common removal path even for an ownerless valid item. This is not a general NULL-GObj safety guarantee. Fighter cleanup exits hitlag for all retained aerial articles, clears the Sparky pointer, and clears death and damage callbacks; it does not clear the fighter's pre/post-hitlag callback slots. The fighter removal caller repeats this cleanup after item-side removal.

The entry wrapper sets item flag x3 through its shared helper. The exit wrapper conditionally sets x5 when x7 is active and clears x3 when set. Neither wrapper supplies a local null guard; fighter callers guard the retained article pointers.

Evidence: [destruction and explicit removal](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchbreath.c#L35-L64), [fighter cleanup and hitlag dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchattackair.c#L241-L295), [flag mutations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L387-L406).

### Event reference cleanup
The event hook forwards both arguments to `it_8026B894` and discards its Boolean result. The helper clears matching owner and interaction references; a matching `xCEC_fighterGObj` also resets `xCB0_source_ply` to 6. Clearing the owner can consequently make the shared lifetime callback request removal on a subsequent invocation. This supports a more informative purpose fact without inventing a specific visible event trigger.

Evidence: [event adapter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchbreath.c#L105-L109), [shared reference cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L491-L525).

### Evidence and rendering limits
Both owned files were read completely in canonical and rendered form, and all 25 subjects, 63 facts and 37 links were enumerated. The header renderer reports `shadowed_binding` for the spawn declaration, leaving it canonical while the C definition uses the proposed name. Both views otherwise report no parse errors. Source establishes the two-entry table and zero-velocity initialization, but does not establish exact compiled table size or attribution of the literal to this TU's `.sdata2`; those baseline claims remain unresolved rather than being certified from rendered names or C expressions.

Status: synthesized; independent review and live promotion pending.
