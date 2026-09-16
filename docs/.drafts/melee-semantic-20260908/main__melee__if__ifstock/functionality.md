# Stock-interface semantic review

Reviewed all 1,130 canonical and rendered C lines, all 38 header lines, all 68 subjects, 186 facts, and 46 links. Existing names generally fit the implementation. The ledger retains 171 facts and 43 links, leaves 13 facts and three links unresolved for insufficient compiled evidence, and supersedes two initialization explanations.

## Player panels

`ifStock_802F98E8` constructs or replaces a player panel using shared model resources and persistent per-player animation state. Its process dispatches mode 0 to ordinary stocks, mode 1 to a single fighter-icon refresh, and mode 2 to the coin display; other mode values perform no update branch. The rules caller selects these presentation values rather than passing match-kind numbers through unchanged.

The stock updater maps negative counts to one and caps counts above 99. Counts up to five use individual icons; larger counts use a compact numeric presentation. Coin updates retain the raw count separately from a display copy capped through an unsigned comparison at 99999, including a zero-display branch. Texture animation frames are requested and frozen rather than advanced normally.

Stock-sharing setup reserves one of two donor-owned animation slots, records the recipient, and constructs a raised three-point path. It returns 1 for zero donor stocks, 2 for occupied slots, and 0 for successful visual setup. The GM caller commits the actual stock transfer only after success. The updater interpolates slots at timers 1–10, emits endpoint effects, then clears the slot and restores the recipient's animation flag on the following update.

## Auxiliary displays and ownership

Separate managers maintain two descriptor-driven grids using 130 entries, while a distinct 16-object pool displays remaining targets. Grid update processes belong to the first icon, independently of their manager processes. Descriptor -1 hides the current icon; both -2 update branches repeatedly hide the current indexed object before returning, not every subsequent object. Existing explanations correctly preserve this exceptional indexing behavior.

The shared numeric setter clamps to 0–9999 and requests decimal animation frames. Its polling caller caches the original observed count. Multi-Man logic also updates this display externally, including a later accumulated-progress write in its nonterminal branch; the generic `SetMatchCounter` name remains appropriate.

Cleanup scopes differ materially: `ifStock_802FB390` removes its controller and 130 icons, `ifStock_802FB41C` clears all 16 target slots, and `ifStock_802FB484` clears only the first 16 main-grid icons without clearing that manager's controller or active latch. Player removal clears the model/count record, not the separate x204 animation record. Engine destruction can be deferred even though these ownership pointers are cleared immediately. Player resume clears only process flags_2 and does not bypass other scheduler gates.

## Corrections and evidence limits

The proposed corrections document that subsystem initialization preserves x204, and that player construction does not universally reset transfer slots or safely handle every allocation failure. Existing RGB-only recoloring, prioritized match-info flags, numeric-state distinctions, and teardown caveats are retained.

Source declarations and size assertions do not establish compiled section layout. Claims assigning switch tables, colors, padding, or literal pools to anonymous sections remain unresolved; no replacement compiled-layout claims are proposed.

The C renderer reported no parse errors. The header renderer reported `shadowed_binding` for the three pointer-return constructors, leaving their declarations canonical despite substituting their names in the C view. This is a rendering limitation, not evidence against the names.

Status: synthesized; independent review and live promotion pending.
