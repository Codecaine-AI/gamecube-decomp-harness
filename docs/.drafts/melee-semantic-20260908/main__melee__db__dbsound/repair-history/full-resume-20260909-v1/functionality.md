# Developer Sound Controls and Status Panel

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files were read to canonical and rendered EOF: 138 source lines and nine header lines, plus one rendered terminal blank each. The C reading view substitutes six foreign names; the header substitutes none. Both report zero parse errors. [Coverage](coverage.json) records every fact ID/version, pinned evidence and read receipt; [proposal](proposal.json), [naming](naming-table.md), [findings](findings.md) and [links](link-dispositions.json) remain review artifacts.

## Setup and Ownership

`fn_SetupSoundInfo` resets both mode indices and two peak/countdown pairs, obtains the DevText GObj, and creates text ID 9 at position 420,60 with an 18-by-3 cell grid. The module supplies a 112-byte buffer; DevText uses 108 bytes at two bytes per cell. On success the panel enters the draw list, gets gray translucent background and white text, uses scale 12 by 16, and starts with cursor, background and text hidden.

DevText_Create returns NULL for an existing ID; pool exhaustion asserts. Setup does not remove an old panel, apply the reset audio-mode bits or reset the audio debug latch. Repeated setup can therefore lose the local panel pointer while leaving prior external state. DevText_Show ignores its GObj argument and adds the text to the draw list.

[Setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L22-L44), [creation and buffer size](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib.c#L35-L84), [registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textdraw.c#L356-L359).

## Chord and Mode Cycle

Only player 0 changes modes. X newly pressed with left held, or left newly pressed with X held, advances sound mode modulo four and display mode modulo eight. The else-if gives the X-edge branch precedence. These routines observe pressed bits without consuming them; exactly one transition per physical edge depends on the caller presenting the edge once to player 0.

The sound order table is 3,2,0,1. Bit zero supplies BGM enable and bit one supplies FGM enable, yielding normal, music off, both off and foreground effects off. A change writes two mixer factors through lbAudioAx_80025064. The label is selected from these local cached bits, not from a hardware or mixer readback. States zero through three hide the panel, and four through seven show it. The header exposes all three entry points and db_804D4AF8; the latter is initialized to one but not used by this TU.

[Input handling](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L117-L138), [order and labels](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L83-L104), [mixer enable setter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L1021-L1030).

The inspected integration gates setup and per-frame processing at DbLevel >= DbLKind_DebugRom. dbsound itself has no debug-level gate. The caller computes edge masks from current and prior buttons, then calls CheckSoundInfo for all four player indices. Each call unconditionally invokes UpdateSoundInfo, so one caller pass runs the updater four times.

[Setup gate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L63-L97), [update gate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L180), [edge calculation and four calls](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L211-L232).

## Current Values and Retained Peaks

Every updater call writes the audio debug latch from display_mode > 3. With an existing panel in hidden modes it only hides text/background: no voice samples or timer decrements occur. Visible modes sample PVoice and VVoice separately and maintain separate peaks and countdowns. Each new high sets its countdown to 240 and immediately decrements it to 239. When the countdown reaches zero, the retained value becomes the current sample. Equal values do not restart the countdown. A missing panel causes both values to be sampled and both timers cleared every call, regardless of display mode.

The hold measures updater calls, not frames. In the inspected four-call loop, 240 countdown updates span roughly 60 caller passes when visible and without new highs. Hidden calls preserve the remaining hold. No wall-clock duration is established by the local code.

The renderer overwrites local x with VVoice before printing either row. Both current-value columns therefore display the virtual count; the PVoice and VVoice peak columns remain distinct. PVoice's underlying AXDriver query counts logical records associated with Synth nodes, not AX hardware voices: one Synth node can own two voices. VVoice counts allocated logical records, including inactive records awaiting recycling.

[Sampling, hold and current-value reuse](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbsound.c#L46-L115), [audio query wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L2255-L2263), [driver count queries](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/axdriver.c#L1174-L1182), [two-voice Synth node](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L548-L585).

## Storage and Limits

Existing split/source objects have BSS 112 bytes, SBSS 32 bytes and SDATA2 16 bytes. DATA sizes are 136/133 and SDATA 8/4. SDATA2 contains the two RGBA words followed by f32 12 and 16, not just scale constants plus unknown padding. [Object evidence](object-evidence.json) preserves hashes and exact bytes. This was an existing-object inspection, not a build or current source-object parity claim.

All eight targets, two entities, 41 inherited facts and 14 outgoing links have explicit dispositions. No external purpose is assigned to db_804D4AF8 beyond its verified declaration and initializer. Shared DevText, audio and input code is supporting evidence with separate ownership.

Lead review narrowed CheckSoundInfo purpose to per-call edge observation. Thirteen links retained; the exact relationship claiming matched code remains unresolved because historical parity was not verified.
