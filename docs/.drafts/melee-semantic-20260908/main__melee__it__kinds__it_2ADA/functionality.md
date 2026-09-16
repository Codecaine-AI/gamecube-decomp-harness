## Functionality

This unit implements `It_Kind_Unk1`, independently identified as Kirby's Copy Ability loss star by the canonical caller in `ftKb_SpecialN_800F5D04`. That caller conditionally spawns the article using ability-loss-star attributes before resetting Kirby's copied hat kind; this is not the Star Spit projectile.

`it_802ADA1C` copies the requested position, forces its Z coordinate to zero, copies the resulting position into both spawn positions, and preserves the supplied velocity and facing direction. It clears damage and parent fields and sets the recorded spawn flag. Creation failure returns silently through the void API. Successful creation initializes the life timer and scaled half-life timer from the first special attribute, then enters the module initializer.

`it_802ADAF0` clears the common `x15` flag, selects motion-state index 0 with `ITEM_ANIM_UPDATE`, and clears `xDCE_flag.b7`. The sole table entry has animation ID 0; its first field is not itself the motion-state index. The animation callback subtracts one before testing `lifeTimer <= 0`. The shared animation dispatcher destroys the article when this callback reports true, subject to its update gate.

The physics callback forwards the item's fall acceleration and maximum-fall-speed attribute to `it_80272860`. That helper uses a sign-aware pre-update threshold: it can subtract acceleration past the nominal limit and does not clamp the result. The collision callback returns the boolean result of `it_8026DFB0`, which refreshes collision information, synchronizes position, conditionally records the floor index, combines two further environment predicates, and tests the low four bits. The local wrapper does not directly transition state.

`it_802ADBE4` forwards both arguments to the shared reference-invalidation helper and ignores its owner-match result. Matching ownership, reflection, absorption, fighter/source, auxiliary-fighter and toucher references are cleared independently; the source-player field becomes 6 when its associated reference matches. The outer removal dispatcher caches the owner before notification and may separately destroy an owned item, so reference cleanup does not guarantee survival.

## Semantic review

Both owned canonical files and their complete rendered views were reviewed, along with all 18 subjects, 51 facts and 10 links. Existing descriptive names remain useful hypotheses; canonical caller and helper bodies, rather than rendered substitutions, support their meanings. No equivalent-wording renames are proposed. Four obsolete inhale/Star Spit links are rejected. Two factual refinements distinguish animation ID from state index and threshold-controlled falling from a strict speed cap. Compiled section-size and literal-placement claims remain unresolved because no compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
