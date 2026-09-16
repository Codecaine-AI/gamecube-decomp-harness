# Controller Cadences and Runtime Service

Coordinates a two-cadence controller scheduler and periodic raw-input/card service callback, plus reset and delegated disc/card maintenance. Requested intervals are staged separately from effective alarm timing; game/copy status publication uses cadence 0.

Initialization invokes its callback first, then requests a nominal 60 Hz interval and forces the first scheduler pass. Reconfiguration copies the requested interval into cadence 0, clears an over-threshold accumulator, computes a minimum period capped at one frame, updates PAD sampling when its millisecond value changes, and arms the periodic callback. The callback calls raw input renewal and two card-related helpers in order.

The queue-count wrapper masks interrupts while taking the count and reconfiguring. Cadence advancement adds one effective period to both accumulators and subtracts at most one configured interval. Both game and copy input publication use cadence 0. Due flags remain readable until the next advancement; the query does not consume them.

Shutdown cancels only the marked-active software alarm. It leaves timing caches and PAD sampling unchanged. An unchanged request therefore does not restart the alarm. Initialization also clears the active marker without first cancelling an old alarm, so repeat-initialization safety is not established. The unsigned interval setter has no validation before signed timing use.

Reset maintenance waits for card result to differ from 11, disconnects retrace callbacks, blacks video and waits two retraces before requesting reset. Disc-service behavior is delegated and remains a family claim.

## Function Coverage

| Symbol | Canonical Evidence | Behavior |
|---|---|---|
| lb_8001955C | [30–45](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L30-L45) | Checks the reset-switch query. If true, calls the audio helper, waits while card polling returns 11, removes both VI retrace callbacks, blacks and flushes video, waits two retraces, and calls OSResetSystem(0,0,0). The trailing path polls card state and calls lb_8001CC84. |
| lb_800195D0 | [47–51](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L47-L51) | Passes lb_8001955C as the callback to lb_800192A8, then calls lb_8001CC84 after it returns. Owns no local branch or loop. |
| fn_800195FC | [53–58](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L53-L58) | Periodic alarm callback calls HSD_PadRenewRawStatus(0), lb_8001C600 and lbSnap_8001D2BC once in that order. It accepts no arguments and is installed through an OSAlarmHandler cast. |
| lb_80019628 | [60–113](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L60-L113) | On changed requested interval, updates cadence 0, zeros its accumulated ticks if already at the new threshold, chooses the minimum configured interval capped at one-sixtieth second, and returns if the effective period is unchanged. Otherwise updates the bounded millisecond PAD rate if changed and replaces/arms the periodic alarm, marking it active. |
| lb_80019880 | [115–118](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L115-L118) | Stores the supplied u64 requested cadence interval in x38. Does not validate it or immediately reconfigure PAD sampling or the alarm. |
| lb_80019894 | [120–128](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L120-L128) | Disables interrupts, snapshots raw input queue count, calls scheduler reconfiguration, restores the previous interrupt state, and returns the pre-reconfiguration count. |
| lb_800198E0 | [130–134](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L130-L134) | Calls HSD_PadRenewMasterStatus once without a local guard or state mutation. |
| lb_80019900 | [135–154](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L135-L154) | Adds the effective period to each of two signed cadence accumulators. At threshold subtracts exactly one interval and writes true, otherwise false; cadence-0 due checks separately gate game-status and copy-status renewal. |
| lb_80019A30 | [156–159](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L156-L159) | Returns the selected cadence due flag without clearing it or validating the index. Valid records are indices 0 and 1. |
| lb_80019A48 | [161–170](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L161-L170) | Disables interrupts and cancels the embedded alarm only when its active marker is set, then clears that marker and restores the previous interrupt state. Does not reset timing caches or PAD sampling. |
| lb_80019AAC | [172–192](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0195.c#L172-L192) | Calls the supplied callback unconditionally before initializing both cadence records to one-sixtieth second with zero accumulator/due flags. Clears PAD-rate, active-alarm and period caches, sets cadence-0 interval to zero to force reconfiguration against the requested nominal interval, and calls the scheduler. |

Both owned files were read fully in canonical and rendered form with no parse errors or read failures. The private structure and timing expressions are documented; section placement and SDK internals remain unresolved. Findings include every fact ID and update marker plus every owned entity, with no new name promotion.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0195/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0195/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/b7c6431f023131ac6e940d6db946ee665bd2ad1867610f33f294a4230e9376de/2026-09-08T14-51-21.068Z-b017cc52-0d59-4eaa-9455-1992ed2b2a3d.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.

Verified completion: live promoted. [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0195/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0195/staged-completion.json>).
