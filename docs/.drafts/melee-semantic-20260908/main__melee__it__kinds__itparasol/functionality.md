## Parasol item implementation

The translation unit defines eleven item states and the standalone Parasol's lifecycle, collision responses, loose-item motion, and held-animation entry helpers. The header declares the public callbacks, helpers, and state table. Canonical and rendered versions of both files were read completely; rendered names were assessed as hypotheses rather than evidence.

### World-item states
- **State 0:** entry performs common setup, resets velocity, and requests animation updating. Its animation callback returns false and its physics callback is empty. Collision processing maintains floor information and enters state 1 on loss of floor contact. Importantly, valid floor contact does not guarantee remaining in state 0: the common helper can dispatch EnteredAir when its additional condition passes and `xDCD_flag.b3` is clear, selecting state 3.
- **State 1:** selected at spawn after clearing `xDCE_flag.b7`, and also reached through terrain transitions. It uses animation ID 4, shared loose-item rotation/collision callbacks, and horizontal deceleration attribute 0.
- **State 2:** drop delegates directly to throw. Throw requests sound ID 247 with pan 127 and volume 64, then selects state 2 with animation and drop updates. State 2 uses animation ID 0 and horizontal deceleration attribute 1. The common state changer copies `xC44` to `xC40` for the drop-update flag.
- **State 3:** selected by EnteredAir, with inert animation and physics callbacks. Its common collision helper enters state 1 when floor contact fails; with support, entry to state 0 is conditional on the contact flag/counter guard. It can therefore remain in state 3 while supported.

States 1 and 2 use common falling parameters. The fall helper conditionally applies acceleration based on direction and speed; it does not explicitly clamp velocity to the configured maximum. Horizontal deceleration moves velocity toward zero for nonnegative configured drag and snaps it to zero within one step; this module does not validate attribute signs.

The shared animation callback adds `deg_to_rad * facing_dir * (attrs[2] + abs(velocity_y * attrs[3]))` to the root child's Y rotation. A missing root skips model work; a present root's child is not separately checked here. The callback always returns false.

### Held animation and synchronization
States 4–10 use animation IDs 1–7, a shared constant-false animation callback, empty physics, and no collision callback. Their entry helpers write caller-provided animation speed before requesting animation updating. States above 4 first invoke the audio helper; state 4 skips that operation. Pickup selects state 4 at speed 1.

The duration accessor performs unchecked state-to-animation-ID-to-integer-table indexing. Its table is `{20,16,45,2,20,30,40,16}`. States 0 and 3 have animation ID -1 and are not valid duration-lookup inputs. Fighter common logic maps status indices to states `{7,8,9,10,5,6,4}`. For nonzero requested duration it scales the lookup result by fighter frame speed and divides by that duration. For zero duration it bypasses the lookup and uses fighter frame speed directly. Numeric held-state names remain appropriate; these observations do not recover exact gameplay-action names.

### Combat and lifetime boundaries
Damage-dealt, clank, and shield-hit callbacks invoke the common victim-bounce response and return false. Reflection delegates velocity reversal/scaling, facing reversal, and copying the half-life timer to the remaining-life timer. Shield bounce delegates velocity mirroring and facing maintenance. Both shared handlers return false. EvtUnk forwards both object pointers without local processing; its exact trigger is not established by this wrapper.

Inert or constant-false callbacks do not imply an immortal or globally inactive item: the generic item engine separately processes animation, lifetime, and destruction conditions. The audio helper stores a sound handle in `xD6C`; its arguments are not attack masks.

### Semantic assessment
Existing rendered names generally fit canonical behavior and are retained without cosmetic renaming. Three factual corrections are proposed: preserve the supported-floor transition to state 3, replace the state-7 helper's misleading animation-preserving description, and identify the state-9 helper's audio arguments correctly. Compiled section placement, size, and padding remain unverified. Loose-item drifting behavior is distinguished from fighter-side parachute descent.

Status: synthesized; independent review and live promotion pending.
