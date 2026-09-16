## MSL rand

`src/MSL/rand.c` implements `int rand(void)` and `void srand(unsigned int seed)` over one file-local persistent object, `static unsigned long int next = 1`.

- `srand` unconditionally replaces `next` with its argument. It neither validates the seed nor advances the generator; zero has no special branch.
- `rand` performs exactly one update, `next = next * 1103515245 + 12345`, then returns `(next >> 16) & 0x7FFF`. The result uses bits 16–30 of the updated state and lies between 0 and 32767 inclusive.
- Repeating a seed restores the same starting state for the deterministic recurrence. State persists between calls; neither function allocates resources or calls another function.
- The arithmetic uses unsigned-long state. This source review does not independently establish its compiled width or section placement.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/rand.c#L1-L14.

The complete rendered view matches canonical source, with no substitutions or parse errors. Existing source-level names and behavioral explanations fit the implementation; no semantic rewrite is warranted. The baseline initialized-small-data claim remains unresolved because compiled placement evidence was not supplied.

Status: synthesized; independent review and live promotion pending.
