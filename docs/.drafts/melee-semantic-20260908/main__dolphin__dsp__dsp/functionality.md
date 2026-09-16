## DSP public driver layer
The canonical and rendered file agree; rendering reports zero substitutions and zero parse errors. Existing function names fit their behavior and need no renaming.

Mailbox status accessors normalize bit 15 of registers 0 and 2 to 0/1. Mail readers combine register pairs into full words without masking the upper status bit. Sending writes the high half before the low half. These primitives do not implement readiness loops; AX and DSP task code perform polling and protocol interpretation externally.

DSPInit emits its build diagnostic before testing the initialization flag. Unless that flag equals 1, it disables interrupts, installs interrupt handler 7, unmasks DSP interrupts, updates control register 5, clears four shared task pointers, publishes initialization state 1, and restores interrupts. DSPCheckInit returns the flag unchanged. DSPReset updates hardware and clears the flag, but does not clear task pointers or pending override globals. Halt, unhalt, and interrupt assertion use protected register updates. DSPGetDMAStatus returns the bit-9 mask, not a normalized Boolean.

DSPAddTask asserts initialization, inserts the descriptor under interrupt protection, assigns state 0 and flags 1, then restores interrupts before conditionally booting the first task. Cancellation only ORs flags with mask 2; the handler later interprets cancellation in its mailbox protocol.

DSPAssertTask asserts initialization and active membership. A request for the current task publishes a pending override without asserting an interrupt. A different task is accepted only with a strictly smaller numeric priority; it triggers DSPAssertInt only when the current task has numeric state 1. Rejection returns NULL without replacing pending state. All paths restore interrupt state. The handler consumes and clears accepted overrides later; AX uses this mechanism for its priority-zero audio task and delayed-frame compensation. Numeric task states are preserved rather than generalized into an unsupported enum.

The inherited 38 function/TU facts and 10 behavioral/ownership links are explicitly retained. Source supports build-string use and the static initialization flag, but does not establish their compiled section allocation or padding; eight section-target facts and two section links remain unresolved.

Status: synthesized; independent review and live promotion pending.
