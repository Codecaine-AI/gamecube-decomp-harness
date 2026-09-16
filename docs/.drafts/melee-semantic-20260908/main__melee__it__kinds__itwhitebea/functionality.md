# Whitebea semantic sweep — reconciled lead summary

The hash-bound librarian research supplies complete canonical/rendered coverage of the owned C file and header, with all subjects, facts, and links enumerated. Its individual shard statements about incomplete coverage or unread helper bodies describe historical shard scope, not global absence of evidence. Supported retained knowledge is preserved explicitly; unchanged research dispositions are inherited without duplicate writes.

## Structure and state behavior

The C file defines a twelve-entry Whitebea motion callback table, including reused animation indices and no collision callback for motion 8. It also contains distinct Oldottosea callbacks used by the Oldottosea table. Numeric motion-state IDs must not be conflated with animation indices or lifecycle-table slots. The header supplies declarations, not independent gameplay or compiled-register evidence.

Whitebea initialization configures facing and counters, then enters motion 3. Motion 0 conditionally requests its animation state again; its physics decrements any nonzero x40, otherwise samples randomness and selects movement or timed preparation. The random sample occurs even when x3C forces movement. Motion 1 initializes facing-scaled horizontal velocity, maintains movement timing and recurring sound requests, and delegates terrain handling. Motion 2 resets velocity, initializes x40 to 15, reverses facing when an update begins at zero, and later restores motion-1 movement.

Motion-3 entry clears x40, multiplies horizontal velocity by special attribute x4, conditionally reverses facing against horizontal nudge, and requests motion 3. It is used during initialization as well as collision transitions. Multiplication is confirmed; attenuation is not established without the attribute value. Its animation callback returns false and its collision callback delegates with a state-0 continuation.

Motion-3 physics unconditionally forwards fall-speed attributes to it_80272860. That helper classifies both acceleration and existing vertical velocity using `< 0`: negative values map to -1; nonnegative values, including zero, map to +1. Matching classifications permit subtraction without a magnitude test. Different classifications permit subtraction only when existing velocity magnitude is below the supplied limit. It does not clamp the result, so an allowed update can overshoot the limit.

Motion 4 configures a velocity response and restores initial facing. Its animation and collision handling distinguish ground and air; physics subtracts fall speed only in air. Its follow-up restores motion-1 movement. The accumulated-response callback saves facing, adds a category-dependent configured contribution to xC9C, and branches when the result exceeds the attribute threshold OR msid is 9. That branch selects a nonrepeated sound, invokes the remaining helpers in order, calls Camera_RequestQuake with QuakeKind_Small, and randomly chooses motion-10 or motion-11 entry. The other branch enters motion 4; the callback returns false.

Motions 5–7 form a timed preparation, airborne-state entry, and collision-continuation sequence. Motion 5 sets x40 to 20 and tests animation activity and zero before decrementing. Motion 6 copies special attribute x10 to vertical velocity; its sign is not established. Its collision callback supplies the motion-7 initializer, which sets ground state and calls grIceMt_801FA6D8. Motion 7 subsequently resets counters and requests motion 0. The stage call is not an unconditional direct call from the motion-6 collision callback, and its visible scrolling effect is not established here.

The named pickup callback selects motion 8; the dropped callback scales horizontal velocity and selects motion 3; the thrown callback selects motion 9. Motions 8, 9, and 10 conditionally request themselves again. Motion 10 has empty callback-local physics but explicitly receives airborne setup; empty physics does not prove stationary or grounded motion. Motion 11 passes velocity to a shared preparation helper and directly subtracts fall speed in its physics callback.

## Shared mechanics and cross-file lifetimes

The model query forwards the model JObj to lb_8000B09C. Its traversal detects an aobj without AOBJ_NO_ANIM and has explicit JOBJ_INSTANCE traversal handling. This supports the shared activity-test interpretation, without independently proving every animation-restart or callback-result destruction claim.

The map helpers explicitly set GA_Ground or GA_Air; the airborne setter also clears x1F. Whitebea and Oldottosea motion tables independently establish their respective callback registrations. These findings resolve historical read-scope limitations, not unrelated gameplay identities or exact lifecycle slots.

The bounds/association helper sets xDCC_flag.b3 outside stage boundaries and takes its true-return branch whenever that persistent flag is set, including when it was already set. Otherwise it computes three-dimensional linked-object separation and performs threshold-dependent operations. it_8028ECE0 clears the Freeze backlink rather than destroying the object. it_8028EC98 stores freeze.x10 and refreshes lifetime rather than directly assigning object velocity.

The null-tolerant local clearer writes freeze.x20, while local consumers read whitebea.x20 and the Oldottosea creation path writes oldottosea.x20. Reciprocal cleanup intent is visible, including Freeze pickup and destruction calls, but compiled slot equivalence remains deferred. The source comment claiming an exclusive pickup caller is contradicted by actual callers.

The two-object wrappers forward to it_8026B894, which clears matching interaction references and resets source-player attribution when the corresponding fighter reference matches. Its caller can supply a fighter GObj; the invalidated reference is not restricted to an item.

## Naming and evidence limits

Rendered names remain hypotheses, not independent evidence. Retain supported mechanical descriptions while deferring unauthenticated Polar Bear, Topi, and Freezie identities, historical source-split claims, exact untraced lifecycle dispatch, stage-scrolling effects, attribute-value assumptions, and terminal-state naming. No compiled section extent, record-size, relocation, union-layout, or legacy register-binding claim is made.

The final proposal preserves indices 0, 2, and 3 unchanged. Only index 1 is repaired to state the negative-versus-nonnegative partition explicitly, including zero. The no-clamp correction is retained.

Status: synthesized; independent review and live promotion pending.
