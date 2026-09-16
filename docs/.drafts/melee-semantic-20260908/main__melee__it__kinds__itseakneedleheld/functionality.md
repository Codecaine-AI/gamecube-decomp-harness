## Held-needle display

This module implements the fighter-attached held Needle Storm stock display for Sheik and Kirby's copied move, rather than the fired projectile. The constructor initializes a SpawnItem, creates the requested variant, and returns NULL on failure. Success clears four item-command variables and xDCC.b3, retains the originating fighter, and attaches the article to the requested fighter part. The shared initializer projects the supplied position onto Z=0 and initializes zero velocity. Fighter startup callers track the returned article in Sheik's u.sk.x4 or Kirby's u.kb.xB8.

The sole ItemStateTable entry is selected by pickup with state index 0 and ITEM_ANIM_UPDATE. Its first field is animation ID -1: the shared state-change implementation removes resource animation and clears the command pointer on this branch, while still installing the animation, physics and collision callbacks. Requesting ITEM_ANIM_UPDATE therefore does not imply a playable animation resource.

The visibility helper first rejects a null retained owner or a mismatch with the common Item.owner. For either supported kind, it obtains the fighter's stock count and visits six sibling needle subtrees beneath the root's first child. It clears JOBJ_HIDDEN for indices below the count and sets it otherwise. It neither clamps the count nor assigns it for unsupported kinds; those kinds are outside the valid input contract and can reach an uninitialized count.

The animation callback returns true for a null retained owner, but returns false without display updates when common and retained owners differ. With matching ownership, it returns true only when the character-specific predicate equals 1. Those predicates test whether the fighter's tracked held article is absent. Otherwise it refreshes visibility, applies the fighter-derived uniform scale to the root's first child, and returns false. The shared item runner removes the item on a true animation result. Physics is empty; collision returns false without processing its argument.

The reference-event wrapper forwards both arguments to it_8026B894 and ignores its result. That helper independently clears matching common owner, reflector, absorber, source-fighter, auxiliary-fighter and toucher references, resetting source-player to 6 when clearing the source fighter. It does not clear the held-needle-specific retained owner. Consequently, clearing the common owner creates the mismatch path rather than the null-retained-owner termination path.

## Semantic review

The existing UpdateNeedleVisibility, Spawn and EvtRemoveReference name hypotheses fit canonical behavior and are retained without equivalent rewrites. Existing supported behavior and gameplay explanations are retained explicitly in the checkpoint ledger: 47 facts and all 19 links. Eight facts remain unresolved only where they claim compiled section contents, attribution or exact extent unsupported by available compiled evidence. No knowledge writes are proposed.

Both canonical and rendered owned files were read completely. The C rendering is consistent with the reviewed name hypotheses. The header renderer reports shadowed_binding for it_802B19AC and leaves that declaration unrenamed despite substituting the name in the implementation; this is a renderer issue, not evidence against the Spawn name.

Status: synthesized; independent review and live promotion pending.
