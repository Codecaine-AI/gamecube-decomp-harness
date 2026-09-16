## Character Selection Screen

This unit implements Melee's interactive Character Selection Screen and its scene lifecycle. It combines initialized fighter-icon, mode, door, nametag and KO-star records with runtime CSSData, resource handles, scene objects and per-cursor/per-token userdata. The header declares the presentation helpers and lifecycle callbacks.

### Construction and lifetime

Scene entry retains the supplied CSSData pointer, derives the controlling port, records the saved-name boundary, resets the name-entry requesting-port sentinel and all four selected-since-load flags, configures audio, and loads Japanese `.dat` or non-Japanese `.usd` archives and SIS resources. The initializer builds camera, lights, fog, animated hierarchies, cursors, selection tokens, nametag controls and mode-specific text. Match types below 11 use four cursors; later types use one cursor, with Training additionally constructing a second participant/token. Unlock state controls icon visibility and the Luigi/Pikachu row exchange. Invalid saved fighter choices are repaired, including closing invalid CPU slots.

Cursor, token and tag userdata are allocated and registered with HSD_Free callbacks. Rules and new-name submenus replace the interactive objects while retaining the extension archive. Rules-menu return reconstructs the CSS through the initializer; the handicap-reset latch survives this round trip and is consumed there, setting the initializer's participant range to handicap 9. Fresh scene entry clears that latch. Scene exit shuts down SIS, releases and nulls both archives, and writes the pending transition into CSSData. Its fighter-audio preparation branch runs only when the pending value is zero; this must not be described as the ordinary Start-confirmed path without additional evidence.

### Interaction and presentation

CursorThink converts copied stick input into bounded screen motion and handles token pickup/placement, costume cycling, human/CPU/empty slot toggles, team controls, CPU and manual-handicap sliders, saved-name opening, single-player stocks and difficulty, and back/rules requests. Cursor state 1 means holding an object; identifiers 0–3 select tokens, 4–7 CPU sliders and 8–11 handicap sliders. Free presentation is normalized to state 0 outside the roster Y interval and state 2 inside it. State 3 marks disconnection on the explicit disconnect path, which hides the cursor and returns before display normalization. A disconnected human slot becomes CPU and loses its nametag.

The object called CSSCharModel is the movable selection token, not a fighter preview. Token state zero is released; a nonzero state identifies its owning cursor plus one. Released tokens undergo separation and portrait-bound relaxation, while held tokens follow cursor offsets. Target coordinates and displayed coordinates are distinct; the displayed pair snaps near the target or advances three units toward it. Training's second token uses CPU presentation variant 8 despite the one-cursor layout.

Door refresh synchronizes fighter/tag text, costume conflicts, opening/closing timers, CPU/handicap controls, port/team graphics and mapped player colors. CostumeChange gives X precedence over Y, wraps within the fighter's costume count and skips duplicates. The random chooser rejects unavailable icons, updates the mapped player and token target, optionally snaps the displayed coordinates, and starts selection animation and audio. Stored-character restoration uses the literal signed `c_kind < CKIND_PLAYABLE_COUNT` guard; no extra lower-bound or unlock validation is inferred.

### Readiness, records and names

The readiness callback separately handles Camera's fourth-controller requirement, one-player readiness and multiplayer participant/team validation. Multiplayer requires at least two valid participants, differing teams when applicable, and no held cursors or open name lists. One-player readiness checks the first cursor/icon and keeps the banner hidden. Start sets pending state 1 after cooldown and may schedule rumble. The scene-frame callback updates preload entries only in states 0 or 1, preserving the asymmetric second-entry behavior in one-player layout. Its state-1 revalidation repeatedly reads token entry 0, not token entry i. State 2 exits with back feedback; state 3 enters rules; state 4 enters new-name creation; both submenu paths become state 5.

Record presentation dispatches across regular, Stadium and Training modes, preserving personal-versus-total visibility, completion branches, localized KO text and truncated distance conversion. The decimal kerning formatter saturates at 9999, suppresses leading zeroes and returns the terminator entry after the final digit. KO presentation uses individual stars below six and numeric text thereafter. TagThink opens, scrolls, selects and closes the saved-name list, rejects names already used by another player, supports no-name and new-name outcomes, and conditionally refreshes handicap presentation. Opening and closing waits use thresholds greater than ten.

### Semantic review

Supported baseline knowledge is retained explicitly in the checkpoint ledger. Corrections address pointer-return semantics, target/display coordinate direction, token naming and Training presentation, cursor states and navigation, the requesting-port sentinel, rules-versus-name dispatch, and numeric exit branching. Source declarations and cast overlays are not treated as proof of compiled section placement or contiguity. Rendered names were checked against canonical behavior rather than used as evidence for themselves.

Status: researched; no-change lead bypass; independent review and live promotion pending.
