## Oil Panic article

This unit implements the attached `It_Kind_GameWatch_Panic` article, not the fighter's absorption or charge mechanics. The constructor initializes a spawn descriptor, attempts creation, and attaches only a successful result to the requested fighter part using the article's special attributes. Failure returns NULL. The fighter caller retains the result in `x2268_panicGObj`; damage/death callbacks require a non-null retained article, whereas pre/post-hitlag callbacks are installed regardless.

The two source table rows have animation IDs 0 and 1 and share one animation predicate, with null physics and collision callbacks. Pickup always clears both item-command variables. With an owner, it copies the owner's ground/air situation, requests state index 0 for `GA_Ground` and index 1 otherwise, then updates animation/script processing. Without an owner, it does not select a state or perform that update. The table's animation IDs and its state indices happen to coincide here but are distinct concepts.

The shared animation predicate returns true immediately for an ownerless article. With an owner, it returns false while the fighter remains within the inclusive `ftGw_MS_SpecialLwShoot` through `ftGw_MS_SpecialAirLwShoot` interval. Outside that interval it invokes fighter cleanup and returns true; the item engine consumes true as a destruction request. This is a lifetime test, not a test that the article animation has finished.

Destruction notification calls fighter cleanup only when an owner remains. Explicit removal first resolves and checks the Item pointer, then notifies the owner before common item removal; this is not an explicit null-GObj guard. Fighter cleanup requests exit from article hitlag before clearing the tracked article and damage/death callbacks. The fighter removal caller also calls cleanup after item removal, so the cross-file sequence can revisit cleanup after the tracked pointer has already been cleared.

The hitlag wrappers forward unchanged to common item helpers. Entry sets `xDC8_word.flags.x3`; exit conditionally sets x5 when x7 is set and clears x3. Thus the retained EnterHitlag/ExitHitlag names fit the registered fighter callbacks without implying that all engine resume processing completes inside these wrappers. The event wrapper delegates selective removal of matching owner/interaction references and discards the helper's owner-match result; clearing `xCEC_fighterGObj` additionally writes source-player value 6.

## Semantic review

Retained 53 existing facts and all 13 links. Two facts need factual corrections: distinguish table animation IDs from state indices without asserting compiled byte size, and explicitly preserve the animation callback's ownerless true-return path. Three `.sdata2` facts remain unresolved because source-level zero initialization does not establish compiled literal-pool placement, size, or padding.

Existing Spawn, Remove, EnterHitlag, ExitHitlag and OnReferenceRemoved hypotheses fit canonical behavior. A shared lifetime-oriented animation callback name is more informative than `UnkMotion1_Anim`, which obscures its use by both states. Rendered C and header pages were read completely; the header leaves the spawn declaration unchanged with `shadowed_binding`, despite substituting the definition in the C file. This is a renderer issue, not evidence against the Spawn hypothesis.

Status: synthesized; independent review and live promotion pending.
