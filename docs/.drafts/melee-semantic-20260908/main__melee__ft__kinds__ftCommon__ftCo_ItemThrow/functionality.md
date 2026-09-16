# ItemThrow semantic review

Reviewed all 700 canonical and rendered C lines, all 31 canonical and rendered header lines, all 65 frozen subjects, 172 facts and 76 links. The inherited disposition ledger retains 162 facts and supersedes 10; it retains 75 links and leaves one unresolved. Independent lead checks support all ten proposed facts. The previously incomplete delivered-read coverage is now complete. Supported unchanged names, explanations and links are retained without equivalent rewrites.

## Input and entry

The unit separates a read-only A-button eligibility predicate from wrappers that actually enter throw states. Eligibility accepts A together with held L/R or item action classification zero. Heavy selection chooses main-stick input when A/B is pressed and otherwise C-stick input, prioritizes timed directional throws, defaults unclassified main-stick input to forward throw, and enters only a changed motion. Shield and Escape predicates consume externally established countdowns and decrement them on unsuccessful checks. Their consumers alone do not establish exact initialization windows or union-state lifetimes. The aerial predicate prioritizes qualified C-stick input; its Boolean return means the command was handled, whereas its optional output can remain false for a non-Parasol neutral drop.

Light entry clears command variables and throw flags, stores item-dependent animation speed, caches throw-facing direction, changes motion, advances animation and installs and immediately invokes the accessory callback. Heavy entry additionally installs a damage callback and conditionally substitutes dual-environment physics and collision callbacks when x2222_b0 is set. Unlike light entry, its body does not explicitly save animation speed in movement state.

## Release and lifetime

The velocity helper multiplies fighter and motion tuning by a command percentage, decodes a signed twelve-bit angle, treats 361 as the motion-default sentinel, consumes a nonzero command and constructs a facing-adjusted planar velocity. The accessory callback caches attachment position before release. At release it computes a timing-relative position, consumes the second command's scale, reports the event and chooses dropped or thrown item handling. Motion range selects the final throw Boolean; item weight selects feedback calls. The current item-side Item_8026AD20 body does not consume that Boolean, so no downstream strength effect is inferred from it.

The immediate drop helper supplies zero initial velocity—not zero displacement. Its item-side consumer independently derives position from owner attachment geometry. Recognized Parasol status invokes a fighter Fall or FallSpecial entry path before the item drop; unrecognized status leaves fighter motion unchanged locally. These calls do not guarantee the ultimate motion: the downstream FallSpecial initializer has an x2224_b2 branch that delegates to ftCo_80090780. Item-side dropped/thrown callbacks and owner bookkeeping remain separate from fighter-side animation completion.

## Animation, physics and collision

Animation independently handles scripted facing reversal and completion. IASA is empty. Ordinary grounded and aerial callbacks delegate to shared movement routines. Dash physics uses an inclusive animation-frame threshold to select friction arguments; the shared consumer can use animation-derived acceleration instead of friction. Its empty cd != NULL block is not a null-safety guard.

Directional light throws preserve animation frame, stored speed and accessory processing across paired ground/air motions using offsets of four or six. The helper temporarily uses facing_dir1 for motion entry and restores prior facing afterward. This continuity is not universal: dash/drop collision enters generic Fall, and ordinary heavy collision invokes Lift's handler, which drops a remaining item before damage-fall handling or enters Fall directly when no item remains. The conditional heavy collision override changes situation bookkeeping without locally changing motion or dropping the item. Its exact comparison polarity is retained; GroundOrAir-typed collision results must not be mistaken for the resulting fighter situation.

## Semantic corrections and rendering

The renderer reported no parse errors but suppressed two pairs of colliding inferred input names. Proposed names distinguish pure eligibility from transition consumption and shoulder-only dash input from A-based input. The inferred LightThrowDrop physics and HeavyWait2 collision names are narrowed by analogy rather than direct use; replacements describe the demonstrated dual-environment behavior and heavy-throw registration. Exact original spellings remain unknown.

The six reversed-facing IDs include four light variants and two heavy variants. Existing compiled dispatch and constant-pool interpretations are retained on the inherited research's pinned build-evidence basis, including relocations, symbols and bytes in addition to canonical source. These are existing-artifact observations, not a fresh build, fresh matching result or new section-tail/layout claim.

The heavy-item link's waiting-state rationale remains unresolved: direct HeavyThrow registration does not establish a waiting role. No replacement link, entity or merge is proposed.

Status: synthesized; independent review and live promotion pending.
