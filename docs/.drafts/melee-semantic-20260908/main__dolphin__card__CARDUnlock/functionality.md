## CARDUnlock semantic review

This unit implements a two-phase GameCube memory-card unlock exchange. Existing function names fit their canonical behavior; the rendered view made no substitutions and reported no parse errors.

- `ReadArrayUnlock` selects EXI device 0 with frequency code 4, constructs opcode `0x52`, sends command and latency bytes, receives the requested bytes, and deselects. Mode zero splits address fields; any nonzero mode transmits the high 16 bits instead. After selection, all stages are attempted even after an error. Any failure maps to `CARD_RESULT_NOCARD`, which alone does not prove physical removal.
- `GetInitVal` reseeds the C PRNG from ticks and masks its generated value to a 4 KiB boundary. `DummyLen` returns 4–32 after at most ten retries and a lower-bound clamp. Its shift-counter wrap branch cannot be reached within that retry limit. The XNOR-style helpers advance scramble state in opposite directions, and `bitrev` reverses all 32 bits.
- `__CARDUnlock` performs two initial reads, derives persistent scramble state, and decodes five words. Three become the 12-byte flash ID; two become DSP input. The source declares `CardData[352]` with 32-byte alignment and supplies it as a 0x160-byte DSP instruction image. Input and descriptor are flushed, output is invalidated, callbacks are installed, and the DSP task is queued. Returning READY marks initial-phase success, not final unlock verification. A second-read failure occurs after scramble initialization and does not roll it back.
- `InitCallback` identifies the card by its embedded task pointer, then sends `0xff000000` and the parameter address, busy-waiting after each mailbox write without a timeout.
- `DoneCallback` reconstructs the work-area buffers, consumes the DSP output and sends two response-derived transactions, advancing scramble between them. Either read failure or failed presence probe releases EXI and reports NOCARD. A READY status with bit `0x40` **clear** releases EXI and becomes IOERROR. Other status results are forwarded unchanged without a local EXI unlock.

The embedded task, work-area descriptor/buffers and scramble state bridge the asynchronous boundary; the flash-ID pointer is not retained by these callbacks. EXI acquisition and downstream mount ownership are outside this file. Source behavior supports the existing knowledge apart from the corrected unit-level status explanation. The compiled `.data` association remains unverified rather than inferred from the source declaration.

Status: synthesized; independent review and live promotion pending.
