# Fox/Falco Reflector semantic sweep

The owned C and header implement shared grounded/aerial Start, Loop, Turn, Hit and End phases. Entry initializes releaseLag, isRelease, gravityDelay, command state and deferred Start GFX; aerial entry additionally zeroes vertical self-velocity and divides horizontal self-velocity by its attribute. Release is a one-way latch across phases: repressing B does not cancel pending termination. Positive releaseLag decrements in Loop/Turn/Hit, while Start only records release. Loop exits for latched release and nonpositive lag. Hit waits for animation exhaustion; Turn waits for nonpositive turnFrames; both use the situation-sensitive shared End/Loop decision.

Ground Loop interrupt order is turn, jump, then platform pass. Air Loop attempts the aerial-jump helper only if turning fails; its redundant local return does not remove helper side effects. Start permits grounded platform passing, while aerial Start and all Hit/Turn/End IASA callbacks are inert. Pass paths retain animation progress and recreate reflection collision, not GFX.

Situation adapters preserve phase. Loop adapters recreate the reflection record; Hit/Turn adapters restore reflecting and Hit_Enter. Landing adapters clamp air drift. Turn entry performs an immediate turning update; the command latch prevents repeated facing reversal. The canonical ftPartGetRotZ actually reads Y, including alternate-joint quaternion handling, validating the rendered Y hypothesis independently. The existing rendered AirToGround name for canonical SpecialAirLwTurn_GroundToAir fits its body and is retained.

Aerial physics decrements any nonzero shared gravityDelay (including negative values); only zero invokes attribute-driven falling. The trailing movement helper is unconditional. Only Loop/Turn/Hit physics clear reflect_hit.skip_update_pos for later position refresh; they do not perform map collision there. Ground physics delegates friction and movement. End animation cleans effects and uses the common situation-selected exit.

GFX IDs 1160/1161/1162 attach to HipN, spawn only with a clear effect latch, and always install hitlag callbacks and clear accessory4_cb. Effect cleanup clears the latch and destroys effects; scheduling and collision registration have separate lifetimes.

All owned canonical/rendered pages, all 140 frozen subjects and all 103 links were delivered. Existing supported names and explanations are explicitly retained. Corrections address obsolete held_inputs fields, release-latch qualification, situation-restricted continuation, collision-versus-GFX terminology, post-turn successors and the rotation axis. No compiled section/layout conclusion is made.

Status: synthesized; independent review and live promotion pending.
