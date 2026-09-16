## CrowdSFX semantic review

The unit implements recurring and event-driven crowd reactions using shared `CrowdSFX_UnkStruct` state. `x2C` retains the sound handle for a fighter-cheer sequence; `x28` retains the immediate reaction handle. Playback helpers replace these handles, while stop helpers conditionally request key-off and unconditionally invalidate the retained handle with `-1`.

### Initialization and cross-file lifetime

`src/melee/sfx/sfx_unk.c` registers `fn_803219AC`, binds `un_804D7050` to `un_804A2F08`, and initializes the state. The initial recent-event timer is `0x10000`, cooldown is `cheer_limit`, sequence index is `max_gasp_count`, fighter SFX is `0x83D60`, flags and identities are zero, and both audio handles are `-1`. Registration precedes binding in source order; this does not establish when the scheduler first invokes the process.

The recurring coordinator increments `x4` while below `0x10000`, then updates the cheer sequence and lower-boundary proximity count. The sequence waits for its retained sound to finish, advances `x18`, replays the stored fighter SFX, or completes/intercepts the sequence. `x18` is a sequence index, not a demonstrated count of audience gasps.

### Deferred interruption and exceptional completion

`un_80321C70` sets `x1C` only within a configured active-sequence window. Its effect is deferred cheer interruption, not immediate gasp playback. `un_80322314` sets both `x1C` and `x20` while the sequence is below its maximum; the Transform handoff invokes this request before outgoing-fighter cleanup and the incoming callback.

The consumer checks pending flags only after playback ends and the incremented sequence index remains below the maximum. That branch clears the request, terminates the sequence, and optionally plays `0x144`. If the increment instead reaches the maximum, normal completion plays `0x140` without clearing `x1C` or `x20`. Thus the two-flag request neither guarantees `0x144` nor guarantees immediate one-shot consumption. Cheer startup also leaves these flags unchanged.

### Event and spatial dispatch

Knockback classification tests high, middle, then low thresholds inclusively and returns categories 3, 2, 1, or 0. Angle adjustment multiplies the magnitude only inside a strict open angular interval. The relocated damage implementation stores that adjusted magnitude and immediately calls the two-fighter crowd event handler. Fighter movement can later clear the retained magnitude when the horizontal predicate is false and `x221C_b6` is clear.

The hit handler distinguishes the first identifier's attribution/auxiliary-knockback role from the second identifier's classified-magnitude role. It suppresses category zero without changing history, routes simultaneous or recent repeated events through the alternate dispatcher, and otherwise chooses `0x144`–`0x146`. Handled events reset `x4` and retain the first identifier and current magnitude.

Cheer startup rejects missing fighters, effective player classification equal to literal `1`, insufficient damage/cooldown, duplicate tracked identity, and SFX sentinel `0x83D60`. The player helper includes a secondary-slot classification override, so this is not simply a direct human-versus-CPU test. The sentinel rejection occurs after `x14` has been overwritten. Success replaces `x2C`, records the spawn identifier, resets `x18`, and invokes player bookkeeping.

The fighter-associated reaction dispatcher selects `0x13F`, `0x13E`, or `0x13D` for categories 1, 2, or 3. Category zero returns false immediately. Unsupported categories select no sound but still fall through to optional fighter bookkeeping and return true. A nonzero spawn lookup is not null-checked. The generic dispatcher instead leaves unsupported categories untouched.

Proximity detection counts eligible fighters strictly below `box[1].bottom + blastzone_y_offset`; there is no lower cutoff restricting the count to a bounded band above the bottom. Only an upward count-threshold crossing triggers category 3. Fighter association requires the tracked eligible fighter to be outside the counted lower region.

Horizontal eligibility uses strict comparisons against inset boundaries. Recovery-height eligibility uses a stage reference plus configured offsets. Descriptions of ordered intervals assume normal configuration; the source's ordered comparisons remain authoritative. Floating-point unordered cases are not universally rejected: a NaN recovery-height input reaches category 1, whereas NaN knockback classifies as zero and a NaN angle preserves the original magnitude.

### Return and rendering limitations

`un_803224DC` explicitly returns zero for an inside position but has no explicit return after outside dispatch. Its callers nevertheless test the result before clearing retained knockback. `un_80322598` similarly lacks an explicit post-dispatch return, which its existing type fact already documents. No dispatcher-result forwarding or reliable success result is inferred.

All owned canonical and rendered pages, all 46 subjects, all 129 facts, and all 36 links were reviewed. Most existing names and explanations remain useful. The substantive naming corrections concern the deferred interruption helpers. Rendered C reports five parse errors and leaves some proposed names unsubstituted, including the horizontal predicate and offstage helper; the header renders without parse errors. These rendering limitations are not semantic evidence. Compiled `.sdata2` contents and exact `.sbss` placement/size remain unresolved because no compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
