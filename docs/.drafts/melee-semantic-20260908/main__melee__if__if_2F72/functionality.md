## Scope and assessment
Reviewed all 470 canonical and rendered C lines, all 25 canonical and rendered header lines, all 35 subjects, 97 facts and 36 links. Existing inferred function names fit the canonical behavior and are retained. The ledger retains 88 facts and 33 links; five facts require corrections, four facts remain unresolved, two stock-transfer links are rejected and one compiled-section link remains unresolved.

## Announcement processing
`fn_802F7288` samples the JObj frame before advancing animation, tests two independent sound thresholds, prefers x20 over fallback xC for the first cue, and uses x24 for the second. Sound flags are set only when a nonnegative ID is selected; invalid IDs remain pending. Both announcement callbacks find an owner in the external eight-entry table and perform a one-time start notification. `if_802F73C4` invokes completion, clears ownership and destroys the display; `if_802F74D0` consumes only the completion callback and retains the display. The sibling file creates and resets these records and later tears down retained displays. Both owned callbacks calculate the index before checking for NULL, so their guarded no-match behavior must not be read as proof that the preceding pointer subtraction is defined.

## Player HUD effects
The thirteen-pointer local table holds an archive resource address plus primary and secondary GObj slots for six players. The factory dereferences the resource as a descriptor-pointer table, creates a model, selects an animation using the low eight bits of its u16 argument, initializes animation and places it at the selected HUD anchor. The missing-resource return precedes destruction of the supplied old object. Callers nevertheless overwrite their retained slot with the NULL result, so missing resources can lose tracking without destroying that old object. Other construction failures occur after replacement begins.

Ordinary primary and secondary processes advance active animation and otherwise clear a matching slot and destroy the supplied object, even if no slot matches. The chained process ignores unmatched primary objects. For matched objects it attempts secondary variant 1 whenever the sampled frame is strictly greater than 12 and the secondary slot is empty, before checking primary completion. This is an occupancy guard, not a permanent one-shot latch: failures can retry, and secondary completion can reopen the slot while a primary survives.

The GX callback searches only primary slots and gates drawing on `hide_all_digits`. It does not guard its -1 lookup result. The same factory installs it on secondary objects, leaving an important unresolved registration/lookup mismatch.

## Gameplay routing and lifecycle
Canonical player bookkeeping and status dispatch distinguish ordinary-opponent, same-team and self-attributed KOs. The paired constructor selects variant 1 for the defeated player and variant 2 for the recorded fighter damage-source player; this is not evidence of stock transfer. `if_802F7BB4` creates variant 1 for the defeated teammate. `if_802F7C30` selects variant 0 for -2 and variant 1 for -1, otherwise leaving the table unchanged. `if_802F7D08` selects chained processing for -2/-1 and ordinary variant-1 processing for other values. The accessor returns the signed SD-penalty field but is declared bool; numeric source branches are preserved without a compiled reachability claim.

Common HUD startup invokes resource initialization. Teardown destroys independently populated primary and secondary slots, then explicitly clears 0x34 bytes including the resource pointer. Initialization itself clears without first destroying existing objects, so it is not a substitute for teardown.

## Evidence limitations
Source literals do not establish compiled `.sdata` ownership or `.sdata2` size, order or conversion-bias bytes. The rendered header also fails to substitute `fn_802F77F8`, marking it `shadowed_binding`, despite substituting the C definition. This is a renderer issue, not evidence against the retained inferred name.

Status: synthesized; independent review and live promotion pending.
