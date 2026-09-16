## MetroTRK exception entry stubs

`src/MetroTRK/__exception.s` defines the source-level interrupt-vector table and its end label. The header exposes the table as an external byte array. Existing symbols fit their visible roles; the rendered views introduce no proposed-name substitutions.

The common `trk_redirect` macro saves r2–r4 into SPRG1–SPRG3, puts the interrupted SRR0 and SRR1 into r2 and r4, constructs a new SRR1 from the current MSR OR 0x30, sets SRR0 to `TRKInterruptHandler`, places the vector identifier in r3, and executes `rfi`. This is a transfer into the handler, not an ordinary function call. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.s#L5-L19.

Exceptional paths are significant: reset branches directly to `__TRK_reset`; machine check invalidates instruction-cache state at SRR0 and data-cache state at DAR before redirecting; the performance-monitor branch skips the distinct AltiVec-unavailable entry. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.s#L49-L60 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.s#L103-L110.

The three TLB-miss entries use `trk_tlb_redirect`. It saves CR, tests MSR mask 0x00020000, conditionally toggles that set bit off with synchronization around `mtmsr`, and then restores CR before the common redirect. The taken path writes the resulting r2 into SPRG1 again; it must not be summarized as unconditional preservation of the original r2 without accounting for processor register-bank semantics. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.s#L21-L39 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.s#L112-L122.

The remaining entries supply their explicit vector identifiers to the common redirect. Assembly alignment and padding directives express source organization, not independently verified linked addresses or compiled layout. The public header declares only the table start, without its size or end symbol. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.s#L41-L157 and code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/__exception.h#L1-L8.

There are no baseline facts or links to correct or retain. No naming correction is warranted.

Status: synthesized; independent review and live promotion pending.
