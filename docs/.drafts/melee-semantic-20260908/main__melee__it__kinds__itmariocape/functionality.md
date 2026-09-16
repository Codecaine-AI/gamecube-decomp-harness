## Mario Cape article

This unit implements the attached Cape article, rather than the fighter's reflector mechanics. `it_802B2560` builds a spawn descriptor using the supplied fighter, position, facing direction and item kind. Failed creation returns NULL; success attaches the item to the supplied fighter part. Mario's caller supplies right-thumb attachment data and stores the returned object in both Cape tracking and special held-item fields.

The two-entry state table selects animation IDs 0 and 1, sharing one animation callback and installing no state-specific physics or collision callbacks. Pickup always clears both effect-command variables. Only with an owner does it select state 0 for `ftLib_800865CC(gobj) != 1`, otherwise state 1, then advance animation/script and perform common setup. The actual predicate argument is the item object, not `ip->owner`; the numeric selection must not be silently rewritten as an owner-ground/air test.

The shared animation callback processes effects before deciding lifetime. Each nonzero command is cleared and spawns effect 1149 on dynamic bone 16 or effect 1150 on bone 6. Both can fire during the same update, including a terminal update. An ownerless article returns true. With an owner, the fighter predicate retains the article within the inclusive `ftMr_MS_SpecialS` through `ftMr_MS_SpecialAirS` interval; outside it, the callback resets fighter bookkeeping and returns true. The common item update interprets true as a destruction request.

Destroyed notification conditionally resets the owner. Explicit removal additionally guards the resolved Item and invokes common teardown even when that Item has no owner. These are not interchangeable entry points, and the resolved-Item guard does not establish arbitrary NULL-GObj safety. Fighter reset exits Cape hitlag before clearing the tracked Cape pointer and damage/death callbacks; explicit fighter removal also calls reset after article removal.

The hitlag wrappers forward unchanged to paired item helpers. Entry sets x3; exit conditionally sets x5 when x7 is active and clears x3. Fighter callbacks guard the tracked Cape pointer. Reference invalidation delegates to the common helper, independently clearing matching ownership and interaction pointers and resetting the source-player field to 6 when its source reference matches. Its Boolean result is discarded. The surrounding removal dispatcher separately uses the owner captured before the callback for flag-gated destruction.

Existing descriptive names and source-level explanations remain useful. No equivalent rewrites are proposed. Compiled table size and `.sdata2` literal attribution remain unresolved rather than being inferred from source literals.

Status: synthesized; independent review and live promotion pending.
