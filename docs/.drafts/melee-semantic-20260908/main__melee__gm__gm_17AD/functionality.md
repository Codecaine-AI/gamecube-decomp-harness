## Functionality

`gm_17AD.c` provides four signed clamp helpers and thirty per-player completed-match statistic accessors. The header declares the same signed interface. The accessors obtain the shared `MatchEnd*` through `fn_80174274`; they do not allocate, own, update, or free the snapshot. Snapshot construction and its lifetime remain external responsibilities.

### Clamps and pairwise KOs

`fn_8017AD04` clamps to a caller-supplied symmetric magnitude, assuming a nonnegative limit. The next three helpers clamp to ±9999, ±9999999, and ±99999. Ordinary statistic getters use the inline ±999999 clamp.

The four wrappers beginning at `fn_8017AE70` read `kills[selected_source][fixed_target]` for fixed targets 0–3. The four beginning at `fn_8017B07C` read `kills[fixed_source][selected_target]` for fixed sources 0–3. Both families return -1 on the diagonal or when the fixed standing is unavailable. They do not validate the variable index or check both participants' occupancy. Four fixed wrappers describe the presentation family, not a four-entry storage bound: snapshot construction handles six standings. The related `gm_17BA` label helper independently reads the same matrix and uses the clamp; it does not call these wrappers.

### Scalar statistics and cross-file flow

The getters expose finalized coins, credited KOs, Falls minus finalized self-destructs, adjusted self-destructs, recorded recovery, hit percentage, non-aerial attacks, aerial attacks, thrown-item attacks, Catch-class attacks, specials, item-log totals, and several still-unidentified fields. The KO aggregate excludes self-attribution and, for teams, same-team attribution. Matching additions to Falls and self-destructs cancel in the difference under ordinary-range arithmetic; that is not an overflow guarantee.

The recovery statistic counts submitted integer recovery reports accepted when the updater's second argument is zero. It is not a proof of exact fractional damage recovery. Hit percentage is computed upstream from hit and attack totals, with a zero-denominator fallback, then explicitly narrowed through `s8` before storage. The x6C/x70 values are divided by 60 using unsigned arithmetic during snapshot construction, not by their getters. The x88 producer performs nine additions after two skipped loop iterations, reading `*(val + 1)`; its exact user-facing category remains unresolved.

Results consumers apply additional presentation rules. KO/Falls/self-destruct lines use an upper-only cap of 999 and are omitted for numeric `match_kind == 3`. The coin branch uses numeric `match_kind == 2` and a five-digit clamp. Signed score consumers use four- or seven-digit clamps; the seven-digit path skips unavailable slots and NO_CONTEST/RETRY outcomes.

### Localized conversions

`fn_8017B410`, `fn_8017B91C`, and `fn_8017B9F4` convert x5C, x94, and x98 according to the saved-language predicate, then clamp. The first uses `30.4788f` on the US path and integer division by 100 otherwise. The later pair uses the double literal `30.4788` with an intervening `f32` cast on the US path and `100.0f` otherwise, followed by unsigned conversion and signed clamping. These sequences must not be normalized into interchangeable formulas. Upstream x5C construction casts before multiplying by ten; x94/x98 use `60 * (10 * value)` before casting.

The divisors support localized feet/meters interpretation, but do not identify every distance category. In particular, the rendered `gmResultPlayer_GetJumpDistance` name is not independently established by canonical code or by adjacency to x94.

### Semantic assessment

The supported existing accessor explanations and descriptive names are explicitly retained in the checkpoint ledger. Naming-style differences alone do not justify changes. Six facts remain unresolved: four compiled-section claims and two Jump Distance hypotheses. One section-to-statistics link is unresolved. No compiled evidence was available to establish `.sdata2` size, alignment, layout, or operand membership. No factual writes are proposed.

Status: synthesized; independent review and live promotion pending.
