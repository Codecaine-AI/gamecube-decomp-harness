## OSAlarm semantic review

Read all 261 canonical and rendered lines, all 26 subjects, all 49 facts, and all 15 links. Existing function names fit their canonical roles; no rename is warranted. The renderer made no substitutions, reported three parse errors, and marked the assembly entry/callback references parse-uncertain; canonical source, rather than rendered hypotheses, grounds this review.

The module maintains a private doubly linked, nondecreasing-deadline alarm queue. Equal deadlines are inserted after existing equals. Creation clears only the handler sentinel and is not cancellation. Relative and absolute setters select period zero; periodic setup stores a converted start and positive period. Setters and cancellation bracket mutations with saved interrupt state. Assertions express preconditions, not independently established release-build validation.

Periodic insertion uses start unchanged when start >= now, including equality. If start < now, it computes start + period * (((now - start) / period) + 1), skipping an occurrence exactly at now when now is a later phase boundary. Two existing purpose descriptions obscure these boundaries and merit correction.

SetTimer writes zero for overdue deadlines, the delta when below 0x80000000, and 0x7fffffff otherwise. Cancellation only rearms when removing a head that has a successor; emptying the queue does not explicitly disable the decrementer. Initialization resets endpoints only when exception slot 8 has another handler, without clearing detached alarm records.

The assembly entry invokes the GPR-save macro and branches to the dispatcher. Empty-queue and early-deadline paths load the interrupted context; the latter first rearms the timer. A due path removes exactly one alarm, captures and clears its handler, reinserts positive-period alarms before user dispatch, and programs the resulting head. The captured callback receives the alarm and interrupted context while scheduling is disabled and a cleared stack-local context is current. The temporary context is cleared before restoring the original current context, reenabling scheduling, rescheduling, and loading context. Thus a periodic alarm is already queued during its callback; a one-shot is not automatically reinserted, though callback code may rearm it.

Source establishes AlarmQueue's declaration and behavior but does not establish that the compiled .sbss target is precisely that object or its claimed eight-byte extent. Those target-bound claims remain unresolved rather than being inferred from the rendered name.

Status: synthesized; independent review and live promotion pending.
