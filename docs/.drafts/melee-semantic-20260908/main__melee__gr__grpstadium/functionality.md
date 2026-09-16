# Pokémon Stadium semantic review

Both owned canonical files and their rendered reading views were read completely, along with all 164 frozen subjects, 476 facts, and 127 links. Existing supported knowledge is explicitly retained in checkpoint groups; exceptions identify factual corrections or unresolved compiled-layout claims.

## Stage and terrain controller

`grPs_StageData` registers Pokémon Stadium, its collision relationships, and ten indexed Ground callback rows. Startup caches the yakumono parameters, constructs objects 0, Display, and 2, initializes common camera/boundary state, and configures collision. The display-camera initializer and controller-gate release are deferred through the Ground startup queue; the common startup path invokes them after `on_start` and frees their queue nodes.

The terrain controller alternates neutral object 5 with Fire 3, Grass 4, Water 9, or Rock 6. States 0–6 select and optionally load a form, wait for completion, request the warning display, wait, shrink the outgoing terrain, create and grow the replacement, destroy/promote objects, and finalize collision and dwell timing. State 2 changes the jumbotron warning mode, not stage animation. Destruction/promotion occurs in state 5; state 6 performs finalization. The history comparison does not establish a no-repeat rule for elemental forms across neutral intervals.

Training and internal-stage value `0xF0` have separate early-return behavior. Timer comparisons preserve their post-increment/decrement semantics. The unscaled `0.05F` outgoing clamp and initial `-10.0F` replacement translation are retained rather than normalized to the surrounding stage-scaled formulas. Transformation particles use authored scalar weights, not necessarily geometric segment lengths, and issue five nullable generator requests per invocation.

The asynchronous completion callback re-fetches map object 2 and clears its pending flag after assertions. The controller and backing buffer must remain valid across completion. The poller registers the loaded buffer once the flag is clear; it does not independently validate the registrar's return or implement a completion latch. The controller's empty callback3 does not itself free its backing buffer. Broader buffer reclamation remains a cross-file lifetime question.

## Component lifetimes

Terrain initializers associate models and collision, start animation, and establish flags. Their cleanup callbacks remove the corresponding collision joints and effects. Water object 9 owns subordinate objects 7 and 8, propagates parent Y scale, rotates a cached joint, and consumes ordered add/remove requests for collision joint 0. If both requests are set, removal follows addition. Its generator retirement differs from Rock retirement by the extra type-bit operation in the common helper.

The second callback-table slot is callback1, a Boolean predicate, not the third-slot scheduled process. Existing explanations conflating these roles for Rock and Fire predicates are corrected. Supported index-based names remain useful; no equivalent renaming is proposed merely for consistency.

## Jumbotron

The display maintains numeric mode, visibility masks, timers, selected-player state, a camera subject, and three image-producing GObjs: 250×160 text, 640×406 match capture, and 124×80 player capture. The pre-render synchronizer applies changed visibility bits, selects the appropriate descriptor, adjusts the material, and then delegates drawing to the common renderer.

The text-camera callback copies and signals readiness even if camera activation fails. Match and player captures use request/completion flags; the player capture begins armed. Mode 8 clears its flag before its final viewport-fit test, so a failed fit can still leave a capture pending. The positioning helper stores clamped, even-aligned coordinates but returns false when clamping was necessary. Its owning GObj is a precondition, not a comprehensively null-checked allocation.

The texture search uses exact image-descriptor pointer identity, skips instance-child descent, returns the first matching TObj, and writes the owning MObj only on success. Its failure path leaves that output untouched. Display initialization logs missing resources without an early return; this is not safe allocation-failure recovery.

Mode 1 chooses participant/clock or alternate count text. Mode 9 formats human/CPU defeat notices. Mode 14 rebuilds the filtered leader list with count-dependent layout and player/team colors. Modes 10–13 select fixed SIS entries whose exact visible contents remain uncertain. Mode 17 clears dynamic text and selects static SIS entry 4, rather than clearing both windows. The mode setter's third argument is a nonzero duration override, not a substate. Requested modes and effective modes remain distinct under training normalization.

## Evidence boundaries and rendering

Rendered names were treated as hypotheses and checked against canonical behavior. The renderer reported no parse errors, but suppressed several pointer-returning header substitutions as `shadowed_binding`; it also reported external name collisions for generator-removal and text-construction helpers. These are reading-view limitations, not evidence for changing canonical signatures or merging functions.

Source declarations support the semantic roles of parameters, glyph scratch, metadata, strings, and constants. They do not prove compiled section occupancy, literal-pool extent, or padding. Those baseline layout claims remain unresolved. The Sing consumer link could not be validated because its cited foreign path was outside the frozen manifest.

Status: researched; no-change lead bypass; independent review and live promotion pending.
