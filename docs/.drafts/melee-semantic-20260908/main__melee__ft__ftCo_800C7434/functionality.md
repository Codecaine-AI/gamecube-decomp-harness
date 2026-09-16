## Reviewed functionality

The owned C file defines five exported handlers; the header declares all five consistently. Both canonical and rendered files were read completely. Rendered substitutions parse correctly, but their semantic claims were assessed against canonical bodies and cross-file callers/callees rather than accepted as evidence.

`ftCo_800C7434` selects numeric motion state `0xE` for `FTKIND_GKOOPS`, with transition arguments `0, 0.0F, 1.0F, 0.0F, NULL`, then sets `x2219_b2` and `x2219_b1`. Every other kind follows the inline-wrapper chain to `ftCo_800C7070`, which enters `ftCo_MS_RebirthWait`, sets the same bits, and returns. The numeric selection alone does not establish ordinary Wait behavior for Giga Bowser. Its specialized descriptor uses `ftCo_SM_RunBrake` and installs `ftCo_800C74AC`; the complete state-selection context remains unresolved.

`ftCo_800C74AC` unconditionally delegates to `ft_8008521C`. That helper replaces all three self-velocity components with model-root translation minus current fighter position. Physics functionality is supported; the rendered revival-specific name and gameplay explanation require further state-table tracing.

`ftCo_800C74F4` is a state-changing predicate. Its short-circuit guard requires a Leadead damage element, exactly zero capture timer, a motion other than CaptureLeadead, and a zero result from `it_802EAF28` on the damage source. Success calls CaptureLeadead initialization and returns true; failure returns false without entering that state. The accessor actually reads `xDD4_itemVar.likelike.x38`; its rendered Great Fox laser type name must not be interpreted as proving the source is a laser.

Capture initialization stores the damage-source item in `captureleadead.x0` and installs `fn_800C74CC` as the damage callback and `fn_800C7568` as the secondary-death callback. Both unconditionally forward that stored item to `it_802EADD8`. Item-side teardown consumes and clears the item's fighter association, restores attachment-related fields, and selects grounded or airborne successor behavior. Neither local callback clears the fighter-side stored item pointer or checks for null. Ordinary timed/mash escape instead calls `it_802EAE80`, then enters CaptureCut and initializes a recapture cooldown; its grounded item successor differs from forced release.

Source float arguments are established, but no compiled evidence was delivered to establish the `.sdata2` section's size, ordering, or attribution.

Status: synthesized; independent review and live promotion pending.
