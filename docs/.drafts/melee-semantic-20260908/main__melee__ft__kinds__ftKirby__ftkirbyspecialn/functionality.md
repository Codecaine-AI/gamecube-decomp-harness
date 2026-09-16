# Kirby Special-N semantic reconciliation

## Scope and disposition

The hash-bound research establishes full inherited coverage. Its supported retained facts and links are preserved unchanged. This lead independently checked the proposed correction and the canonical evidence for the non-retain claim families; this is not a new independent audit of every retained row. The disjoint research summaries describe observations at different scopes: broader terminology in one shard does not discharge another shard's explicitly deferred registration, gameplay-mapping, callee, or lifetime dependency.

The final proposal preserves the single supported data-flow correction: `ftKb_SpecialNLoop_IASA` reads `input.held_buttons[0]`, not `input.held_inputs`. A nonzero `u.kb.xE4` is decremented and immediately ends the update; only an already-zero value permits the mask test and request for `ftKb_MS_SpecialNEnd`. Neither the physical meaning of mask `0x200` nor suction behavior is established by that correction. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialn.c#L1146-L1174.

## EatLanding evidence repair

`fn_800F6528`, rendered as `ftKb_EatLanding_Enter`, is at **L472-L480**. It obtains the Fighter, calls `ftCommon_8007D7FC`, requests `ftKb_MS_EatLanding` with flags `0x12`, frame zero, rate one and zero blend, reinstalls callbacks, and invokes `ftAnim_8006EBA4`. The previous L481-L489 citation instead begins `fn_800F6588`, whose transition requests `SpecialAirN`. The corrected disposition for `fact:9e0e9180-8af7-475f-9c30-7bc61f1acc7f` remains unresolved: this entry does not independently establish non-release or continued lifetime of a retained fighter or item. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialn.c#L472-L495.

## State-machine behavior

Startup resets command and shared state, caches results from nested resource helpers, and installs distinct ground/air callback tuples. The cached values' resource semantics and copied-special dispatcher preconditions remain separate dependencies. The callback passed through a parameter named `release_cb` is not thereby a release implementation: `fn_800F6178` initializes item capture.

Capture processing separates item references from fighter-victim references. Intake completion uses a strict less-than comparison against squared inhale velocity; it is not exact arrival. The Eat/EatAir entry routines themselves are unconditional and do not perform proximity tests. Callback suffixes must not be normalized into destination suffixes: `SpecialNCapture0_Coll` selects `fn_800F6908`, which requests `SpecialAirNCapture1`. `SpecialNCapture0_Anim` processes `target_item_gobj`, while `SpecialNCapture_Anim` processes `victim_gobj`. Motion-table binding and downstream carry/swallow/spit availability remain explicitly deferred where required by the inherited records.

Eat and landing animation completion request EatWait; airborne captured and turn completion request EatFall. Turning reverses facing on animation completion. Target-dependent IASA routines prioritize their first item/fighter action test, then the second action test, then turning; grounded processing can subsequently check jump and walking. Target actions require the corresponding non-null reference. Numeric destinations remain numeric where no independent mapping was established.

EatJump1 completion requests EatJump2 and invokes scaled jump initialization. EatWait/EatWalk write `mv.kb.specialhi.x4/x0`; the common short-hop checker reads `mv.co.kneebend`, while launch selection reads `mv.co.jump.x0`. Source-sensitive release latching is visible, but these expressions do not establish compiled overlap or preservation through motion changes. Neither short jump height nor slow walking follows from parameter names alone.

Several animation callbacks are empty. The rejected EatWait `implements` link remains rejected because its rationale establishes at most state membership. Empty EatJump2, CaptureWait and loop callbacks retain their recorded deferrals; paired IASA behavior does not make an empty animation body independently implement that behavior.

## Movement and terrain

Most physics callbacks delegate to common grounded or airborne processing. EatWalk delegates to the shared walker; EatJump2 delegates to a one-update-gated jump-physics routine. The three common walking values forwarded by EatWalk entry become animation-rate divisors, not merely tier-selection thresholds. Under low friction, playback-rate calculation can use stored walk movement instead of `gr_vel`. Above-walk-speed friction is multiplied by a common-data field whose magnitude is not established here; stronger friction is not asserted.

Collision wrappers supply the same object and a specific response to conditional shared dispatchers. Common grounding and airborne routines perform additional bookkeeping. Exact animation continuity, transition-flag preservation, deeper collision predicates, numeric ground/air interpretation and complete target continuity remain distinct dependencies. Symbolic state names and Boolean tests are not substitutes for those proofs.

## Item and fighter processing

Item spit/drink command processing requires a non-null retained item. With no item, the command remains pending, while animation completion is independently tested. Spit builds position, velocity, deceleration and duration parameters, invokes a factory and cleanup wrapper, then clears Kirby's references. The factory identifies only `It_Kind_Unk2` and has a null-spawn branch. Cleanup clears item relationships and calls `Item_8026A8EC`; terminal destruction and lower player-bookkeeping semantics remain unasserted. SFX `0x222F6` is not independently identified as a swallow sound. Common neutral return has exceptional branches and is not unconditional Wait.

Fighter processing similarly preserves the victim guard, call ordering, command acknowledgement and independent completion path. Drink forwards a victim-derived result through `u.kb.xE0`. The selector has Kirby, Boy-family/Sandbag and Nana exceptions; a copy-star release does not itself prove acquisition of a new ability. Thrown-state code connects velocity and duration callbacks to named victim states, but complete capture resolution and ability installation remain separate from those local data flows.

## Cleanup, accessors and remaining limits

`ftKb_SpecialN_800F9070` assigns two death callbacks; it does not directly refresh retained-target state. The handlers call cleanup and clear themselves, but comprehensive interruption/resource guarantees exceed those bodies. `ftCommon_8007E2F4` is a common `x1A6A` setter, not a second Special-N helper. Its `s16` parameter does not establish destination layout. The historical `ftKirbyDmgInline` spelling remains unresolved.

Captured-fighter input code supplies signed vertical requests and consumes resistance through grab-mash processing. These relationships do not independently establish every mouth-retention, recovery-duration or complete lifecycle clause. The floor-skip wrapper is visible, but the raw `0x840` field masked by `0x100` is not identified. Fighter X scaling uses `guard.x2C`, unlike the Y/Z capture-scale expressions; compiled aliasing is not asserted. An unchecked attribute getter does not establish nonnegativity.

All inherited bounded deferrals remain accepted and explicit, including numeric gameplay mappings, callback registration, animation/resource semantics, target lifetimes, article/sound identity, deeper callee effects, pinned-wiki provenance, compiled register identities and structure layout. Rendered names remain hypotheses, not evidence of their own correctness. No source or KB writes, compiled section/layout claims, or additional proposal facts are introduced.


Status: synthesized; independent review and live promotion pending.
