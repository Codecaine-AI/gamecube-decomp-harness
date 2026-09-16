## AX chorus processing

This translation unit implements chorus initialization, settings updates, shutdown, and in-place processing of 160-sample left, right, and surround blocks. Its two assembly helpers use a 512-float table as 128 four-tap interpolation phases and use `i2fMagic` for signed-integer-to-floating-point conversion.

### Lifetime and initialization
`AXFXChorusInit` allocates one 0x1680-byte block and derives three 480-sample channel regions, each split into three 160-sample banks. It clears only the first 320 samples of each channel, initializes `currentLast` to 1, clears four old-array slots per channel, and sets the source wrap trigger/target to 480/0. The first callback fills bank 2 before resampling. Allocation failure restores interrupts and returns zero; success restores interrupts before calling settings. Shutdown passes the original allocation to `__AXFXFree` under interrupt save/restore, returns one, and neither clears pointers nor unregisters any callback. External callback ownership and allocator-hook behavior are not established here.

### Settings and modulation
Settings reset the fractional cursor and compute the integral cursor relative to the current bank, modulo 480. The modulation period is exactly `((period / 5) + 1) & ~1`, the initial countdown is half that result, and the offset is `(variation << 16) / (pitchOffsetPeriod * 5)`. Existing sample histories are preserved. There is no input validation; a zero derived period leaves a division-by-zero expression, and valid parameter ranges are not established by this file.

### Callback and resamplers
The callback captures each input block into the next history bank, derives pitch fields before possibly reversing the offset, and resets each channel's source cursor to the same saved position. Consequently, reversal affects the following callback. `pitchHi == 0` selects `do_src1`, which advances the source on fractional carry; `pitchHi == 1` selects `do_src2`, which advances once plus fractional carry and includes exact unity when the fractional increment is zero. Other integer pitch values select neither helper: input buffers remain unchanged by resampling while bank and countdown bookkeeping still occurs.

Both helpers generate 160 outputs from three retained old samples plus the current source sample, truncate filtered results to integers, wrap advances from trigger to target, and save three old samples and the updated fixed-point cursor. Final-iteration paths avoid loading an unnecessary next current sample. The callback retains the final cursor modulo 480 and advances the bank modulo three.

### Semantic review
Existing public function names fit their canonical behavior. Rendered pages made no substitutions; they report 339 parse errors and identify assembly definitions as parse-uncertain, so rendered text is not independent proof of names. One callback explanation needs correction: four initialized old-array slots are not four samples consumed through `src.old`. Source object names and numerical roles are clear, but anonymous compiled-section placement and exclusive occupancy remain unverified.

Status: synthesized; independent review and live promotion pending.
