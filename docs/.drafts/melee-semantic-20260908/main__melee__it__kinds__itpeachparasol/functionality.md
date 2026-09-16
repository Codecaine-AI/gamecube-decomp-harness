## Peach Parasol article

This unit implements Peach's move-generated, attached Parasol article, distinct from the generic collectible Parasol. Its constructor initializes an `It_Kind_Peach_Parasol` spawn request and attaches a successfully created item to the requested fighter part; creation failure returns NULL without attachment. The header declarations agree with the definitions.

### Animation and timing

The three state-table entries have animation IDs -1, 0 and 1, respectively. All install the same owner-lifetime animation callback and have null physics and collision callbacks. Helpers enter item states 1 and 2 with caller-supplied animation speed and `ITEM_ANIM_UPDATE`, then install an empty accessory callback. State 1 additionally calls `Item_8026AE84` with fixed arguments 0xF7, 0x7F and 0x40. Exact opening/closing assignments for these numeric states remain unproven.

`it_802BDA40` ignores its item argument and performs an unchecked state-index → animation-ID → span lookup. States 1 and 2 yield 15 and 16. State 0 supplies animation ID -1 and is not a valid input to the two-element span array. Shared fighter logic maps requested statuses 4 and 6 to states 1 and 2 and computes `frame_speed_mul * (span / duration)`; duration zero bypasses the lookup. Its assertion checks existing Parasol status, not bounds or validity of the requested status argument.

Pickup enters state 2 at speed 16, immediately advances animation/script processing, then restores speed 1. The state-2 helper also has an indirect caller in the shared fighter controller; it is not exclusive to pickup.

### Lifetime and ownership

The separate frame query returns true only when item state is 2 and the current animation frame is at least 16. It does not itself transition or destroy the article. Peach's fighter-side predicate uses it to release the LandingFallSpecial retention guard. The shared article callback instead completes when the owner is absent or `ftPe_SpecialHi_NotActive` returns true. The fighter predicate protects SpecialHi, Peach/common Parasol states, common special-fall states and the guarded landing interval. The generic item update destroys the article after its animation callback returns true.

Destruction notification calls fighter cleanup only for a non-null owner. Cleanup clears active-Parasol tracking and damage/death callbacks; if a saved pre-move item exists, it restores that item and returns true. Only that true result clears the destroyed article's owner field. Explicit removal checks the resolved Item payload, not an explicit GObj-null condition, and orders notification before generic teardown. The outer fighter removal path calls cleanup again; the saved-item pointer has already been consumed when restoration occurred.

### Wrappers and semantic review

The two hitlag wrappers are independently grounded by Peach's pre/post-hitlag callback registration and guarded forwarding of its tracked article. The unknown event wrapper forwards both object arguments unchanged. Existing inferred function names remain useful, including the landing-oriented query name as a description of its consumer rather than an exclusive meaning for state 2.

Both canonical and rendered owned files were read completely, and all 37 subjects, 93 facts and 33 links were enumerated. The review retains 87 facts and all links, supersedes four factual explanations, and leaves two compiled-section assertions unresolved. The header renderer leaves `it_802BDA64` unsubstituted with `shadowed_binding`; this is a rendering limitation, not a declaration mismatch. No compiled section size, placement or padding is established by this source review.

Status: synthesized; independent review and live promotion pending.
