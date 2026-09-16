## Staff Roll semantic review

This unit constructs and runs Melee's interactive ending credits. Entry loads SIS text and scene assets, allocates credit-state and sorting buffers, creates two cameras plus light, fog and model objects, combines ten name-model sets, registers callbacks and initializes playback state. The header agrees with the canonical callback signatures.

The credit-entry process advances animation only when `gm_804D6818 == 0`, but maintains text and rebuilds the depth-sorted active list even while paused. Eligibility and localization include explicit exceptional indices and distinguish saved language from configured language. Hidden-entry teardown removes both text objects but clears only `win[0]`, which serves as the presence sentinel. The primary renderer traverses the descending-depth buffer backward, preserves its assertions and orientation test, and restores the camera matrix after each entry. The secondary renderer independently skips null detail/tally pointers and ends the camera pass unconditionally after its second activation attempt.

The main process maps dead-zoned stick values directly to cursor position with nonlinear scaling; it does not integrate velocity. Selection tests projected quadrilaterals before timeline `0x1285`. Trigger priority is A, B, Start, then Z. A can register hits and B can inspect details; pause entry does not require a selected credit. The final tally counts entries hit at least once, not total shots. Playback steps are 1 or 6. Tally creation and audio fading use threshold comparisons, whereas the closing flash uses equality. Scheduled sounds advance at most one cue per invocation in authored array order; the table contains frame 2350 followed by frame 2000.

Character and trophy predicates remain read-only wrappers. Trophy queries preserve the distinction between temporary and saved collection state. Existing inferred function names fit their canonical roles and remain hypotheses rather than recovered original spellings. The C renderer reports six parse errors and makes no substitutions; the header successfully substitutes seven names. Neither rendered names nor source address comments establish compiled layout.

The frame callback performs terminal audio handling and requests scene-loop state 1 at or beyond `0x134D`. The exit callback is empty: it establishes no local teardown ownership. Resource disposal outside this TU remains unresolved.

All owned canonical and rendered pages, all 43 subjects, 119 facts and 39 links were enumerated. Saved dispositions explicitly retain supported knowledge and isolate corrections or unresolved claims.

Status: synthesized; independent review and live promotion pending.
