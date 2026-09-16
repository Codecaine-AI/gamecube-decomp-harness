## Toad article lifecycle

This unit implements the attached Toad article shared by Peach's neutral special and Kirby's copied version, not the separate damaging spore article. Its constructor accepts parent, position, attachment part, item kind and facing direction; creation failure returns NULL, while success returns the attachment helper's result.

The two-entry ItemStateTable selects animation callbacks for numeric states 0 and 1, with no table-specific physics or collision callbacks. Pickup selects state 0 and performs three ordered setup calls. State 0 invokes it_8026BB20 exactly at animation frame 7 and it_8026BB44 on every evaluation at frame 53 or later. State 1 is entered from both fighters' successful-counter handlers; entry selects state 1, sets joint-animation rate to 10, evaluates the hierarchy once, restores rate to 1 and calls the shared setup helper. Its callback invokes it_8026BB44 from frame 60 onward.

Both animation callbacks terminate when the owner is absent or the fighter-specific removal predicate returns true. Canonical fighter implementations return false within their respective Toad motion-state ranges, despite the potentially misleading IsActive naming. State 0 directly performs owner notification before returning true; state 1 does not. Neither frame threshold alone requests termination.

Owner notification dispatches to Peach only for It_Kind_Peach_Toad; every other kind follows the Kirby branch. A missing owner skips notification. The destroyed callback only notifies, whereas explicit removal first checks the resolved Item, notifies its owner and then invokes generic item removal. Fighter cleanup exits article hitlag before clearing the retained article pointer; Peach additionally clears death/damage callbacks. The paired item hitlag wrappers forward unchanged arguments, and generic exit conditionally sets another flag as well as clearing the entry flag. The event wrapper delegates matching-reference cleanup and discards its Boolean result; that helper can clear Item.owner, making the next animation lifetime check terminal.

## Semantic assessment

Existing owned function names and behavioral explanations remain useful and supported; no equivalent-wording rewrites are proposed. Numeric state identities, exact equality versus inclusive frame thresholds, missing-owner behavior and asymmetric cleanup are preserved. The header's spawn declaration remains canonical in the rendered view because the renderer reports shadowed_binding, although the implementation is renamed. This is a rendering limitation, not evidence against the supported Spawn name.

Source proves the two-entry table and the five floating-point literal consumers, but does not prove 32-byte compiled occupancy or physical .sdata2 allocation. Those compiled-storage claims remain unresolved rather than being affirmed from source or rendered names.

Status: synthesized; independent review and live promotion pending.
