## Harisen/Fan implementation

The unit defines a ten-entry item-state table and the Fan's scaling, lifecycle, physics, terrain and combat callbacks. The header declares the implementation's public functions and state table.

### State behavior
- **0 — grounded:** entry performs shared setup, clears velocity and selects state 0. Animation returns false and physics is empty. Collision delegates to `it_8026D62C`, supplying the state-1 entry helper for floor loss. The common helper also has an exceptional supported-floor branch calling `Item_8026ADC0`; floor support therefore does not unconditionally guarantee continued residence.
- **1 — ordinary falling:** selected at spawn and through the floor-loss continuation. Physics forwards the configured fall-speed and maximum-fall-speed attributes. Collision supplies the grounded initializer to guarded common landing processing.
- **2–6 — held animation family:** pickup selects 2. Three helpers copy an externally supplied animation speed and select states 3, 4 and 5. State 6 entry restores speed to 1.0. These states share a false-returning animation callback, empty physics and no collision callback. Their animation IDs are -1, 0, 1, 2 and 3 respectively; item-state indices and animation IDs are distinct.
- **7 — thrown; 8 — dropped:** both enter with numeric flags 6 and share animation ID 4 and falling physics. Dropping additionally restores animation speed and common scale. Thrown collision requests guarded landing processing. Dropped collision does so only when `xD4C != 0`; otherwise it returns the floor-contact-only helper's result without requesting the grounded initializer.
- **9 — dedicated EnteredAir state:** animation and physics are inert. Terrain processing supplies separate grounded and ordinary-falling continuations. No floor selects state 1; supported terrain selects state 0 only when the common helper's contact guard permits. The event producer is not established by this wrapper.

### Fighter-controlled animation and scale lifetime
`ftCo_HarisenSwing_Anim` consumes command 1 to select item state 3 for fighter selector 0, state 4 for selectors 1/4, and state 5 for selectors 2/3, forwarding the fighter's frame-speed multiplier. Command 2 selects state 6 and is cleared afterward. The fighter take-damage callback also selects state 6 after restoring scale; this is not exclusively a command-2 operation.

The hit-scale helper multiplies the Harisen-specific scale by the common item scale, stores the result and applies it uniformly to the root joint. Fighter damage-dealt processing applies that scale and initializes a fighter-owned timer. With a held item and a positive timer, animation processing decrements the timer and restores common scale on expiration or animation completion. Taking damage also restores scale. Exact attribute magnitudes are not established here.

### Combat and shared processing
Damage-dealt, clank and HitShield use the same victim-bounce response only in states 7/8 and return false. ShieldBounced instead delegates to the distinct shield-bounce helper. Reflection reverses and scales X/Y velocity, reverses facing and copies the half-life timer into the remaining-life timer. The unknown event forwards both object pointers to shared processing without exposing its producer or exact trigger.

Inert item-specific callbacks do not imply absence of common animation, movement integration or lifetime processing.

### Semantic review
Both owned files were read completely in canonical and rendered form. Rendered function substitutions parse successfully and remain hypotheses rather than independent evidence. Existing names are retained with their sharing and numeric-state caveats. Two supported explanation corrections are proposed: the grounded helper's exceptional branch and state-6 entry on fighter damage. Compiled table extents and literal-pool placement/order remain unresolved. The dropped-function inline comment is speculative and names a different helper from the actual body; it does not establish an inline boundary or override the implementation.

Status: synthesized; independent review and live promotion pending.
