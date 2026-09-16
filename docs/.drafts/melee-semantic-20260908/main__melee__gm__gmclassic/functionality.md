## Classic campaign configuration and lifecycle

The unit defines eleven paired introduction/VS encounters, followed by Coming Soon (104), Game Over (105), CSS (112), and a terminating descriptor. The header declares the public lifecycle and state callbacks. Canonical registration and implementations support the existing rendered function names; no naming changes are proposed.

Initialization establishes six player defaults. Mode loading clears phase matchup pointers, initializes and shuffles four traversal-index regions, resets common campaign storage and twelve Classic status bytes, initializes x24 storage through a helper, installs eleven configuration callbacks, and selects state 0x70. Actual matchup assignment occurs after CSS acceptance, not during mode loading. CSS cancellation requests the menu before campaign mutations. Acceptance commits five player settings and calls gm_SetNextGameModeStateId(x5 << 3); the canonical scheduler stores its input plus one.

## Encounter assignment

Assignment processes category-priority passes, installs fixed descriptors for exact flag-0x80 subtypes, and assigns the dedicated matchup to the first phase carrying 0x20. Required randomized-selection failures enter nonterminating loops. Returned matchup pointers are borrowed from persistent pools or fixed objects and remain in phase xC fields for later intro and match setup.

Selection traverses a supplied index order using a sentinel-derived pool count. Availability, selected-character exclusion, prior-character checks, and ground-stage comparison occur inside the per-fighter loop. A same-ground-stage candidate becomes the fallback immediately, bypassing validation of its later fighter slots. The last saved fallback is returned if no preferred candidate succeeds. All-NONE candidates bypass stage checks entirely. Consequently, fallback selection does not guarantee every fighter satisfies the ordinary eligibility checks.

## Presentation, resources, and results

Intro setup constructs presentation categories, participant arrays, colors, counts, and player metadata. It generates allies and separately prepares DVD cache entries and audio requests. Exact flags 4 select stage 0xAF for preload and match construction, but the audio-stage helper uses the assigned descriptor stage. Zelda-to-Sheik presentation/preload substitution does not replace the original player ckind used for the player audio-mask query. These resource operations do not write stage or audio requirements into the intro payload itself.

VS entry transfers phase metadata, supplies a numeric status byte to common match construction, and loads rumble settings. VS exit writes status 2 for nonzero mei->x8 and 1 for zero; no win/loss interpretation is imposed. It delegates common result processing, conditionally performs final-run processing, and updates subtype-1 target records. Before the first clear, the mixed record can hold a maximum destroyed-target count; after a clear it holds a minimum frame count. Separate clear-time and completion-bit updates are preserved.

Game Over callbacks delegate through the shared campaign object. Continuing restores stocks and schedules the saved intro mode plus one, rather than the saved mode itself. Terminal processing has both challenger routing and a no-challenger helper-controlled branch: menu routing occurs only when gm_80173754 returns zero. Coming Soon departure unconditionally stages menu mode.

## Evidence limits

Both owned files were read completely in canonical and rendered form, and every frozen subject and link page was restored and assessed. Rendered names were treated as hypotheses, not proof. Source overlay typedefs describe intended combined access but do not establish compiled adjacency, section extents, or a single allocated aggregate. Those layout-dependent facts remain unresolved. Detailed opponent-slot reset claims also remain unresolved: restored source shows an x24 initialization call, while intro code consumes that storage as allies.

Status: synthesized; independent review and live promotion pending.
