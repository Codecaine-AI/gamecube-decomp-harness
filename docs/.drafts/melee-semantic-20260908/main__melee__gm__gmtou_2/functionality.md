# Tournament alternate participant-selection scene

`gmtou_2.c` implements the alternate Tournament participant-selection interface, model callbacks, prospective-match preload updates and post-results participant rotation. `gmtou_2.h` contains only an include guard. Supported inherited knowledge and descriptive names are retained; rendered names are hypotheses, not independent proof.

## Presentation and animation

The source declares archive and scene-descriptor handles, shared `TmAnimTimers`, a 25-entry character-to-model map, six animation-state frame ranges and an index initializer. Conditional ordering helpers do not establish compiled section contents or layout.

`fn_8019D1BC` constructs active-player models, optional handicap displays, decorations and entrant cards with name text. It samples frames 10 through 50 into 41 Y positions. Layout distinguishes counts four and three; the remaining branch is not explicitly restricted to two players.

Callbacks preserve exceptional behavior: special selection hides all thirteen character-dependent descendants; controller errors hide ordinary player models, while the error indicator uses opposite visibility. State 4 can hide hierarchies without preventing subsequent child updates. The slot callback's final controller-error/slot-type branch can restore its base position. Entrant motion calls `mn_8022F410` twice; the second result selects model/text Y and depth, and the zero/default branch commits `xF=xE`.

Animation update order matters. `fn_8019BF18` displays 0..800 before wrapping. `fn_8019BF8C` eventually displays 90..119 or 130..159, resetting stored 120/160 before posing; initialization to 80 and option changes can produce lower transients. `fn_8019C6AC` displays offsets through 60 and subsequently stores 61 between callbacks. `fn_8019CA38` increments before display. `fn_8019CBFC` poses before incrementing, and entry does not explicitly reset x1C. The panel callback consumes b as current animation frame and c as animation end, with guarded 0→1 and completion-driven 1→2 transitions.

## Input and transitions

Readiness requires controller error zero, state 2 and current animation frame b>=60—not sixty elapsed updates. All-ready processing increments a separate counter and at >=30 commits entrant positions and invokes the external router. Otherwise the counter resets and connected players process input: held B aborts after more than ninety eligible updates; L+R sets special selection; directional input cycles unlocked characters and clears that flag; A/Start initiates confirmation; B changes state 2 to 3; X/Y bound costume changes. Character/costume editing excludes states 1 and 2. Preload-summary refresh occurs only on the non-all-ready path, absent an earlier return. Both position lookups return entrant zero on failure.

## Resources and lifetime

Entry loads `GmTou1p`, `GmTou4p` and Tournament SIS resources, constructs presentation objects, selectively initializes timers, configures audio, resolves stage policy and initializes the versus preload cache. It excludes numeric slot type 3 from fighter audio preparation and explicitly converts character identifiers. Exit destroys the two archives in load order without clearing handles or scene pointers. Local exit does not establish framework ordering of model/text teardown relative to archive backing-storage reclamation.

`fn_8019EE80` copies fighter/color entries below x30 irrespective of supplied slot types and preserves cached stage when `(stage_selection_type==2 && x32==0) || stage_selection_type==3`. `fn_8019EF08` scans four slots, updates only non-NA entries and never writes stage. Skipped cache entries persist. Both request reconciliation; matching descriptions can cause an immediate return, while resource registration and asynchronous scheduling belong to the DVD subsystem. Match setup resolves special fighter choices before calling `fn_8019EF08`.

## Post-results rotation

The Results callback copies match_end to `gm_80477738`. Match type zero bypasses this updater and selects state 1; nonzero types invoke `gm_8019E634` and select state 2. The updater stably sorts standings values alongside player indices. Handicap lookup uses sorted results values, not the parallel identities. Rotation uses the indices, choosing opposite ends according to `match_type==1`, moves replaced entrants to tail positions, shifts waiting positions and rebuilds active selection records. Local Team/FFA comments do not establish team-rule semantics. The final audio mask uses raw CSS-icon bytes cast to `CharacterKind`, unlike entry's explicit conversion. Intended equivalence of result keys or character domains remains unverified.


Status: synthesized; independent review and live promotion pending.
