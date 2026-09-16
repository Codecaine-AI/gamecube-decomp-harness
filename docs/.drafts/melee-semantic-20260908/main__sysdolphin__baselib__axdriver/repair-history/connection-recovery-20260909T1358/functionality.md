# AXDriver Sound Records, Streams and Effects

Revision `c302741689bd67c361cd7faadb221df3193992c3`. The full owned `axdriver.c`, public header and static header were read through canonical and rendered EOF. The C renderer reports ten parse errors; substitutions are reading hypotheses, not canonical identifiers. [Coverage](coverage.json) preserves hashes, page receipts, supporting reads, every fact ID/version and disposition. [Findings](findings.md), [naming](naming-table.md), [proposal](proposal.json) and [existing relationships](link-dispositions.json) form the review packet.

## Three Playback Identities

The driver owns a pool of 96 logical `HSD_SM` records. A returned logical handle combines a generation value with a seven-bit pool index. Each record separately stores a Synth node handle, whose low six bits select a 64-slot association table. One Synth node may own two AX voices, so these counts differ. A third global handle tracks a single path-selected disc stream outside the logical-record allocation count.

[Record layout](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.h#L20-L45), [pool declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.static.h#L7-L47), [Synth voice creation](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L531-L638).

Initialization clears only state-mask bits and links all records into the free list. It installs Synth callbacks, disables both aux processors and supplies AXFX allocator hooks. It does not reset all record fields, list heads, lookup slots, generation, counters, clock or channel-pause mask. Correct first initialization relies on zero-initialized storage; repeated calls can duplicate membership and are not a safe reset.

[Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L1147-L1172).

## Metadata and Logical Sound Startup

The metadata loader opens a DVD path, rounds its length to 32 bytes, allocates from the audio heap and starts an asynchronous read. It repeatedly invokes a caller callback until a shared flag changes, then closes the file, parses five count-prefixed sections and relocates entries in tables two, four and five against the image base. The loader does not validate counts, offsets or file bounds. It ignores read-submission status, accepts every completion result except -1, and has no timeout or NULL service-callback guard. The opened zero-length path returns without closing. The allocator asserts on allocation failure.

Unloading frees and clears only the image owner pointer. Derived table pointers/counts and logical command pointers remain unchanged. The language-change caller explicitly keys off logical sounds and unloads old metadata before selecting `/audio/us/smash2.sem` or `/audio/smash2.sem` and coordinating bank replacement.

[Loader and unload](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L796-L913), [audio allocation](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L20-L30), [language-change consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L1897-L1949).

Sound startup splits `sound_id` by 10000 into a bank and member, adds the bank base to obtain a command-stream index, and checks upper bounds, track 0 through 255, channel 0 through 15, the paused-channel mask and free-list availability. It lacks negative sound-ID and sample-index lower guards. A reserved record receives selected defaults, command pointer and a fresh logical ID, becomes ACTIVE and enters the active list. A returned handle does not mean a Synth voice exists yet. The generation shift is not a guarantee of indefinitely nonnegative handles.

[Startup](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L521-L617).

## Commands, Completion and Pausing

The master-clock callback increments the driver tick, initializes a never-scheduled record's deadline, shifts paused deadlines, interprets due ACTIVE records, applies sleeping-record pitch changes and recycles inactive records. State cleared during command execution is recycled on a later traversal. A never-scheduled deadline of -1 takes precedence over the pause-marker branch, so a newly paused record can still execute its initial command batch.

The interpreter decodes a high-byte opcode and delay fields. Opcode 0 uses a 24-bit delay; 6 through 11 and 16 through 19 use 16 bits; 12 and 13 use eight bits. Others have zero delay. Nonzero delay commits earlier pending operations before modifying the current command. Loop-count zero sets an indefinite flag that later nonzero counts do not clear. Backward branches subtract a word offset before the common cursor increment. Stream bounds, loop limits and signed time overflow are unchecked. Opcode 14 sleeps and opcode 15 keys off.

[Interpreter](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L274-L438), [clock and callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L440-L519).

Pending operations are processed in ascending low-bit order. They start a Synth instance, update priority, volume, pan-position, pitch and mix, or sleep/key off. Bit 0x10 produces no Synth update. Bit 0x100 sleeps and returns before clearing that bit. Bit 0x200 calls the inline key-off helper, not an arbitrary record callback. Key-off clears the Synth association and state immediately; later clock processing returns the record to the free list. The Synth inactivation callback clears association/state but leaves `vID` unchanged.

[Pending operations](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L179-L272), [key-off helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L68-L153).

Per-record pan, volume, pitch, aux and pause/resume helpers validate identity before disabling interrupts. Their update regions are protected, but full validation-plus-update is not atomic. Ordinary Synth pause requests queue volume processing; only later does the Synth pause callback mark the driver timeline. Channel pause additionally blocks new starts; channel resume clears that mask. The singleton stream controls use a separate handle and do not pause all logical SFX.

[Per-record controls](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L619-L794), [channel controls](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L1184-L1274), [deferred Synth pause](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L938-L1002).

## Mix and Auxiliary Effects

Each sound stores two send bytes and two multipliers. Define A as `x26*x24[0]/65535` and B as `x27*x24[1]/65535`. The direct gain is `(1-A)*sqrt(1-B)`, Aux A is `sqrt(A)`, and Aux B is `sqrt(B)*sqrt(1-A)`. Cents convert to pitch ratios through `2^(cents/1200)`. The public pitch helper clamps to -10800 through 2400 cents. Synth combines two pitch layers with the base ratio. The pan byte feeds stereo gain and interaural-delay calculations.

The packed low bits in AXDriver_804D603C gate command-authored versus API-authored send changes. They are independent of installed effect types in bits 8 through 15. A per-record API send change requires its low bit set. Channel send updates ignore per-record failure and always save the default, so a successful channel call need not update current records.

[Mix commit](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L179-L272), [aux permissions and defaults](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L697-L775), [Synth pan/mix](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1027-L1100).

Aux setup supports off, high reverb, standard reverb, chorus and delay. It records the requested type, unregisters the bus callback and shuts down the old type before initializing the replacement. Failure retains the requested type nibble, installs no callback and does not restore the prior processor. The public wrapper validates bus/type/required parameter, replaces a shared arena base/cursor/capacity and delegates. It does not validate heap capacity, pointer alignment or parameter ranges.

The AXFX allocator returns the current byte address, increments an unsigned cursor and asserts that it remains strictly below capacity. It does not align, reclaim or detect cursor wrap. Free is a no-op. The size helper computes type-dependent estimates but does not validate arithmetic domains. Delay arithmetic uses unsigned fields; reverb conversion accepts unchecked preDelay. The existing game caller mistakenly asks for standard-reverb size with a delay object before installing delay.

[Setup and sizing](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L915-L1145), [allocator](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L14-L27), [mismatched caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L2124-L2136).

## Stream and Diagnostic Boundaries

The path-selected starter keys off the previous handle, forwards the DVD entry and byte-volume controls to the Synth stream starter, saves the result and returns true. It forwards an invalid DVD entry without checking. The Synth starter busy-waits for prior I/O and dereferences an acquired voice without checking for NULL. Stop/pause/resume test only whether the retained handle equals -1. Their true result confirms forwarding, not liveness or successful completion. The status query delegates to Synth without clearing a stale retained handle.

[Stream wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L1276-L1321), [Synth starter](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1409-L1459).

PVoice returns associated logical-record/Synth-node count; VVoice returns allocated logical-record count, including records awaiting later recycling. The debug overlay separately tracks their peaks, but overwrites its temporary current value with VVoice before printing both rows. The inherited PVoice alias remains a diagnostic label rather than a claim about hardware-voice total.

[Count accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L1174-L1182), [debug display](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L63-L104).

## Storage Evidence

Existing split/source objects both have .rodata 48, BSS 7424, SBSS 104 and SDATA2 80 bytes. DATA sizes are 632/627 and SDATA 24/20. The read-only data contains two reverb dimension arrays, not assertions. Assertion strings are in DATA; SDATA contains two initialized globals plus the `vID > 0` string and padding. SBSS has 26 words; misleading repeated address comments do not alias the generation and tick variables. [Object evidence](object-evidence.json) preserves hashes and contents. No build or source-object equivalence claim is made.

Every owned helper, declaration and parameter subject was read. Foreign AXFX/Synth internals remain separately owned. [Unresolved items](unresolved.md) preserves the fighter-specific claim that still needs its exact caller.

## Lead verification corrections

The existing .data relocations target only the delay decoder and command interpreter; auxiliary switches are not established as .data tables. Singleton pause/resume check sentinel presence, then Synth applies its own validity/state guards. Channel pause is a request and initial scheduling can precede the pause marker. Channel resume ignores per-record failures. Relationship review now retains 66 and rejects 7 exact stored rationales. Shared relationships are unchanged.
