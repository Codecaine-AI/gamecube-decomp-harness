## Beam Sword implementation

`itsword.c` implements Sword creation, five item-state dispatch slots, three visual interpolation channels, model-scale application, fighter-afterimage accessors, and lifecycle/combat callbacks. Existing descriptive names remain supported by the inherited research and targeted canonical/rendered checks; rendered names are not independent evidence. Retain the inherited 201 facts and 89 links unchanged.

### State dispatch and lifecycle

- **0 — grounded:** entry resets velocity and landing count, initializes all three channels, and updates the model. Physics is empty; collision supplies the falling initializer to the common floor-support helper.
- **1 — ordinary falling:** selected by ordinary Spawned initialization and floor-loss continuation. Entry resets landing count without the grounded entry's velocity reset.
- **2 — held:** pickup reveals the child hierarchy, selects state 2, resets landing count, configures the first two channels, and advances all three. It does not reinitialize the third channel. Physics is empty and collision returns false.
- **3 — dropped/thrown:** both callbacks select state 3 with `ITEM_ANIM_UPDATE | ITEM_DROP_UPDATE` and perform identical setup. This table slot uses selector 1 while sharing animation, falling physics, and landing callbacks with slot 1.
- **4 — entered-air:** initializes all channels and updates immediately. Physics is empty, unlike states 1/3; terrain handling can select grounded state 0 or falling state 1.

Numeric state indices are distinct from the table's leading selector. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L43-L54 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L238-L495.

### Interpolation and model output

Each channel pairs an integer current/target/step triplet with a floating-point current/target/delta triplet. Components advance independently and clamp/clear their steps only after strict target crossing; equality does not clear a nonzero step. Duration divisors are not locally validated. Fighter action commands configure the first channel: subtype 0 supplies duration and a target multiplier decoded by division by 256; subtype 1 requests a return toward 1.0. The second channel grows from 1.0 toward 2.0 on pickup and returns toward 1.0 in non-held setup. The third uses article attributes `x10`, `x14`, and integer duration `x18`.

Held animation restarts the first channel's four-step reset only when the owner is non-NULL and `ftLib_80086FA8(owner) != 1`. Independently, it reverses the third channel when its counter has stopped exactly at a recognized endpoint. The numeric owner result is not collapsed into an inferred Boolean meaning.

The model writer computes `scale_y = 0.3f * (x28 * (x4C * x10))`, writes bone 6's Y scale, and writes bone 3's full scale. Only state 2 incorporates `x40`; other states use `(1, scale_y, 1)`. Model writes do not themselves establish hitbox or attack-reach updates. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L75-L209, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L288-L437, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itCommonItems.h#L38-L62, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L1213-L1233, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1037-L1051.

### Cross-file presentation and lifetimes

The display adapter forwards the object and display-context integer to the common renderer, preserving its visibility/camera branches, optional owner-relative offset, debug geometry, and conditional cleanup. Afterimage accessors supply independently nullable extent outputs, a borrowed article-owned parameter block, and model joint index 5. Extent arithmetic retains the canonical `star.xvel` union-member access. Joint lookup uses the dynamic-bone table when present, otherwise first-child traversal. The fighter consumer samples world position and matrix column 1; loss of the held item disables sampling with `x2100 = -1` and returns.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L211-L236, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L338-L352, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftafterimage.c#L28-L40, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftafterimage.c#L190-L238, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftafterimage.c#L376-L461, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itdraw.c#L14-L239.

### Exceptional branches and combat

`itSword_Spawn` returns creation failure without grounded setup. Ordinary Spawned initialization instead establishes configured vertical velocity, captures bone 6's base scale, and enters state 1. Falling terrain collision invokes grounded initialization only after contact/validation guards. Entered-air handling selects falling immediately on no floor; supported terrain selects grounded only when its flag/counter guard permits. The grounded floor helper also has a supported-floor branch calling `Item_8026ADC0`; false Sword collision returns do not prove that downstream helpers cannot change item lifetime.

Damage-dealt invokes victim bounce only in state 3; clank and shield-hit invoke it unconditionally. Reflection propagates the common helper result after X/Y velocity reversal/scaling, facing reversal, and copying the half-life timer into the remaining-life timer. Shield-bounce uses a distinct shared response. The unknown-event adapter forwards both pointers without establishing its precise trigger.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L56-L68, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsword.c#L497-L531, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L459-L479, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L750-L778, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L395-L456.

### Review outcome

Adopt four factual corrections covering strict-crossing stopping, state-4 model consumption, and the third channel's integer counter type. No further fact or link overrides are needed. Seven section facts and two section links remain unresolved because source does not prove compiled placement, contents, or the asserted 44-byte size. Header rendering reports three shadowed bindings; canonical declarations remain intact.

Status: synthesized; independent review and live promotion pending.
