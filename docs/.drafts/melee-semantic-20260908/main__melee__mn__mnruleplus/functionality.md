## Rules Plus semantic review

The unit implements Additional Rules through separate display and input GObjs. Construction publishes the display GObj in `mn_804D6BE0`, attaches allocated `MenuRulesPlusData` with `HSD_Free`, copies five persistent rule values, builds visible option/cursor/value hierarchies, and creates contextual text. The initializer restores row 5 when returning from Rules Stage and otherwise selects row 0.

Input priority is A, Start, B, Up, Down, then Left/Right. A only acts on row 5; its presence suppresses lower-priority actions even on other rows. Navigation wraps and skips unavailable rows. Horizontal edits wrap within table bounds and exclude row 5. B saves settings before returning: it is not a rollback. Start has a distinct `GM_MENU` route to `GM_VS`; other modes use the surrounding return router.

The visual process compares shared selection/value state with its cache, refreshes options and descriptions, then updates cached values and all five persistent rule fields. States 1 and 3 finish at 0; states 2 and 4 remove the display GObj at transition completion. Description state 5 simply returns and does not establish a valid state-5 path through the visual process. Constructor animation selection is explicitly initialized only for numeric states 1 and 3, not every nonzero state.

Time-limit zero hides the four mapped numeral hierarchies and requests the dedicated off frame. Nonzero values reveal them, animate tens and ones, and set two further numeral hierarchies to zero. Ordinary value-animation lookup handles rows 1–4 and directional wraparound. Its loop updater preserves the exceptional no-match fallback to `mn_803ED270[2]`.

All nine existing function-name hypotheses fit their canonical responsibilities and are retained. The rendered view is not independent proof: it reports an external visibility-helper name collision and two shadowed header bindings. Source-level metadata roles are supported, but compiled section extents, offsets, padding and conversion-constant placement remain unverified.

Lifetime and representation qualifications remain important: the input callback accesses the display through a global rather than its own GObj; display teardown does not clear that global locally. Several paths index a five-element rule-value array with row 5. The header's presentation-table declaration also differs from the C definition. These are preserved as uncertainties rather than normalized into safe six-value storage or a proven shared layout.

Status: synthesized; independent review and live promotion pending.
