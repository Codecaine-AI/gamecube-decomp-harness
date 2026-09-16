## AX three-channel delay

The canonical and rendered file agree; all four SDK function names remain appropriate. Rendering reports zero substitutions and no parse errors. All 113 lines, all ten subjects, 23 facts and five links were reviewed. Twenty-one facts and all links are retained; two settings descriptions require correction.

`AXFXDelayCallback` processes 160 samples independently for left, right and surround. Each channel reads its current delayed block, stores input plus feedback-scaled delayed data, and replaces the audio input with output-scaled delayed data. Gain products are cast to `s32` and shifted right seven bits. Each block position advances modulo its channel's size. No dry-signal addition, saturation, pointer validation or zero-size guard appears in the callback.

`AXFXDelaySettings` first shuts down old storage. It then disables interrupts, computes `currentSize[i] = (((delay[i] - 5) << 5) + 159) / 160U`, resets positions, and derives feedback/output coefficients using `(setting << 7) / 100U`. It allocates three buffers at 640 bytes per block, asserts their pointers, clears their sample history, restores interrupts and returns 1. User configuration arrays are read, not modified. There is no input-range validation, rollback or ordinary failure return. A configured delay of 5 produces zero blocks, which the callback cannot safely process.

`AXFXDelayInit` clears the three storage pointers under interrupt protection, restores interrupts and calls settings. Its declared integer-returning C body has no explicit return; settings returning 1 does not establish source-level return propagation. Calling init on an already owning instance would discard its stored allocation pointers without freeing them first.

`AXFXDelayShutdown` independently frees each non-null channel pointer under interrupt protection and returns 1, without clearing pointers or runtime state. Repeated shutdown or processing after shutdown is therefore not made safe by this implementation. Settings teardown and replacement use separate interrupt brackets, not one uninterrupted critical section.

The AX driver removes the old auxiliary callback before effect teardown, copies delay parameters into its channel instance, and registers `AXFXDelayCallback` with that instance only when initialization compares equal to 1. This establishes the cross-file callback-context lifetime without proving the initializer's compiled return behavior.

Evidence: [delay implementation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/axfx/delay.c#L5-L112), [driver lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L945-L1020), [interrupt helpers](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSInterrupt.c#L59-L102).

Status: synthesized; independent review and live promotion pending.
