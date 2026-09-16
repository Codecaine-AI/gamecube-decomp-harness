# plbonuslib semantic sweep

## Scope and evidence

Revision: `c302741689bd67c361cd7faadb221df3193992c3`.

Full canonical/rendered file coverage and baseline enumeration are inherited from the hash-bound librarian handoff. This lead performed a targeted repair and independently checked the canonical citation ranges supporting the five retained proposals. Existing retained fact and link rows remain retained; all upstream unresolved dispositions and their bounded reasons remain unchanged. Rendered names are hypotheses, not independent evidence or recovered original symbols.

The unit maintains player bookkeeping: counters, item-category histories, streaks, attribution fields, timers, flags, extrema, averages, and indexed bonus values. Its header establishes source interfaces, not compiled parameter locations or gameplay meanings by itself.

## Attribution and indexed decisions

`pl_8003D60C` recognizes exactly `0xA0`, `0xE1`, and `0xEA–0xED`. Direct and accumulated item-collision paths use this predicate after failing to identify a fighter owner. A true result selects a flag that preserves the victim's previous source-player field rather than replacing it with sentinel `6`. This is not the predicate's only use: the death processor also consumes it for victim decision `0x88` and opposing-source decision `0x80`.

`pl_8003D644` resolves player/fighter state and queries metadata before checking the entity index. Index `1` skips the subsequent bookkeeping block, not those preceding reads. Other indices snapshot metadata and evaluate guarded decisions. Sentinel, self, and same-team attribution clear `xD60` and reset `xD64` to `6`. Opposing attribution can consume a matching pending relationship in the source player's record before replacing the victim's remembered source. Further source decisions depend on the opposing-source branch and additional context tests.

The small event wrappers distinguish replacement from increment operations. The shared bonus implementation writes a supplied value, increments an indexed value, or decrements only when the current value is nonzero. These operations do not establish displayed bonus names or score signs.

`pl_80040688` calls the current canonical `gm_GetFrameCount`. Its frame-threshold update is independent of its saved-context branch. The latter selects a record only when its argument guards pass, checks the associated player, and conditionally updates decisions `0x2A`, `7`, and `6`. The decrement call is present in the current source.

## Item observations and lifetimes

`pl_8003E17C` normalizes eligible item kinds, increments `x674` when the selected player's holder-history query is false, and increments `x710` only when all six queries are false. It never sets those history bits. Ordinary pickup notification occurs before attachment, and item-side attachment mutates holder history externally. A separate item callback also invokes the collector. Consequently, counting is conditioned on external history and sequencing; this collector does not independently guarantee once-per-instance counting.

The item-log accessors retrieve individual entries or aggregate arrays. The batch updater normalizes and deduplicates kinds within an invocation, advances present-category streaks, resets absent categories, and submits decision `0x9D` at the configured equality threshold. Its `-1` mapping fallback and upper-bound-only indexing check remain subject to the inherited enum-typing and caller-domain uncertainty.

Other item hooks save owner-derived attribution in `xD6C`, conditionally transfer it into fighter metadata, reset attribution, and reset item-related counters. The transfer wrapper's second argument remains explicitly uncertain in source. Exact fighter-structure alias correspondence and complete cross-file lifetimes are not inferred from member spellings.

The acquisition path compares an accessor result directly against a threshold. The BombHei accessor can return `-1` in an excluded state; the code must not be described as first validating an available fuse timer. Assignment of a decision to `1` is also not a separate once-only eligibility guard.

## Recurring collection and measurements

The recurring wrapper dispatches observation, threshold-evaluation, input, and position-statistics helpers. Collection maintains counters, maxima, sticky observations, countdowns, item-holding streaks, and position-derived aggregates. A held but nonqualifying item does not take the no-item streak-finalization branch.

Position collection separates planar displacement totals and maxima from absolute horizontal and direction-separated vertical accumulation. It also maintains horizontal-separation averages. Numeric classifier results and helper names alone do not prove every grounded, self-propelled, knockback, altered-state, or magnifier interpretation. The formula using frame count does not establish unbiased sampling across every match frame.

The four-stage sequence detector accepts ranges `1–3`, `6–8`, `9–11`, and `17–48`. Completion increments decision `0x56` and resets the state. A mismatch resets without retrying the same input as a new first stage.

Other hooks accumulate absolute displacement components, count threshold-qualified observations, maintain activity counters, and lower a stored minimum. Caller evidence can establish an event context without establishing the full producer formula, measurement lifetime, public result label, or configuration ordering. Those stronger inherited claims remain deferred.

## Statistics accessors

Read-only accessors expose action totals, selected attack categories, extended-record fields, guarded ratios, and displacement statistics. `pl_80040A04` computes total attacks minus aerial attacks; that subtraction is not by itself proof of a grounded-attack category.

`pl_80040A9C` performs eleven loop iterations and sums nine `u32` entries, at offsets `+3` through `+11` from the initial category pointer, into an `int`. The source does not enforce a nonnegative result or guard out-of-range accumulation. Getter return types do not independently establish the signedness of every underlying member, and floating-to-unsigned conversions require representable-input qualifications.

At function level, `pl_80040DB8(int slot)` forwards `slot` unchanged to `Player_GetStaleMoveTableIndexPtr2` and returns the selected record's `x0_staleMoveTable.xCB0`. The adjacent `pl_80040D8C` increments the same field. This accurately describes source-slot behavior, but does not authenticate the register-labelled entity `pl_80040DB8#r3`. The former proposal against that entity is removed, with no replacement parameter fact.

## Reconciliation and retained uncertainty

The final proposal contains only five supported corrections: predicate-consumer scope, pre-index-guard reads, externally history-conditioned item logging, the current frame-count callee spelling, and the aggregate's unsupported nonnegative-return guarantee. No equivalent-wording rewrites or additional naming proposals are introduced.

Cross-shard evidence can bridge some historical caller-path or helper gaps without resolving every compound claim. Shared mutator definitions establish operation semantics, not every event trigger or public label. Pickup evidence establishes a particular ordering, not all caller and history lifetimes. A current decrement edge does not silently change an inherited unresolved disposition in this targeted repair.

Displayed bonus titles, point signs and values, reaction sound identities, sole-caller assertions, timer direction, complete reset/producer chains, movement classifier meanings, configuration ordering, and later result-clamping/display chains remain bounded deferrals wherever the handoff leaves them unresolved. No compiled section, layout, or register-binding conclusion is made.

Status: synthesized; independent review and live promotion pending.
