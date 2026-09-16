## All-Star campaign controller

`gmallstar.c` defines the All-Star route, opponent configuration, round grouping, resource preparation, and scene lifecycle callbacks. The header declares the public callbacks and route array.

### Route and initialization

The route contains twelve battle/Rest Area pairs, with battle IDs spaced by eight and Rest Area IDs one greater, followed by the unpaired final battle at `0x60`. Separate descriptors provide `GS_COMING_SOON` at `0x68`, `GS_GAMEOVER` at `0x69`, and `GS_CSS` at `0x70`. The route terminates with an entry initialized to `-1`, not a null entry. The thirteen round descriptors group 25 opponent records as four single-opponent rounds, four pairs, four triples, and one final record. These are source-level observations, not compiled section-layout findings.

`gm_Mode_AllStar_OnInit` resets shared selection settings. `gm_Mode_AllStar_OnLoad` initializes campaign state, clears opponent-result bytes, installs campaign callbacks, selects a candidate stage for every opponent, and shuffles only positions 0 through 23. Position 24 stays fixed. Every configured candidate-stage pair currently contains equal values, so the random selection consumes RNG without varying the selected stage within a record. Loading also clears carried percent and accumulated battle frames, empties the presentation roster, initializes four auxiliary flags, and selects CSS.

### Selection, resources, and battles

CSS entry supplies saved fighter options and the active slot to the common initializer and sets up the versus preload cache. CSS exit returns early to the menu when `pending_scene_change == 2`; otherwise it commits selections, schedules `(settings->x5 * 8) & 0xF8`, initializes audio, and prepares the selected round.

`gm_801B5324` prepares opponent characters and costume values, invokes costume conflict resolution, updates the DVD game cache, and configures character/stage audio resources. Zero-based round 12 overrides all three opponent slots to Mr. Game & Watch and uses cache color `0xFF`. This resource representation is distinct from the final round descriptor's single roster record and the battle-entry team configuration.

Battle entry restores carried percent and accumulated time, applies a distinct first-battle flag, and specializes state `0x60` as the final team encounter. Battle exit stores marker 1 when `MatchExitInfo.x8 == 0`, or 2 otherwise, at the round's first opponent-table position. It always copies ending percent and accumulates battle frames. Common result processing runs before the conditional final-clear dispatch. The marker values are not independently renamed as win/loss states.

### Rest Area and cross-file state

`gm_801B5ACC` configures the between-battle match on stage value 85 with no ordinary opponent slots, disables its timer, restores carried values, inserts the completed round's fighters into randomly chosen empty presentation slots, and records the next round's characters and metadata. It registers remaining fighters, prepares the next round's resources, and installs `fn_801B5AA8` in `rules.on_match_end`. HEAL reads the shared roster and upcoming-opponent metadata for presentation. The callback ignores its argument and requests a 120-frame transparent-black-to-opaque-black transition through the shared background-flash subsystem.

Rest exit preserves ending percent but does not add Rest Area frames to the campaign total. Game Over processing delegates to the shared one-player controller: nonzero `xC` restores resumable state and causes this wrapper to clear carried percent; zero takes terminal processing, whose routing includes conditional menu and challenger paths. The ComingSoon exit wrapper independently schedules menu mode. Its route registration does not establish that every successful campaign traverses that descriptor.

### Semantic review

Existing rendered function names fit their canonical callback roles and are retained. A descriptive Rest Area entry name is proposed for the remaining unnamed entry callback. Corrections address the route sentinel, unsupported compiled-residency wording, the renamed match-end field, and misleading stage-variant language. The renderer reported no parse errors; it suppressed two foreign-name collisions and correctly avoided substituting the local `exit` binding.

Status: synthesized; independent review and live promotion pending.
