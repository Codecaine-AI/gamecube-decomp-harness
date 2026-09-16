# Aerial-Jump Motion Membership

The TU's only function, ftCo_800D72A0, is a read-only bool(Fighter*) predicate. It obtains fp->x2D0 and tests two contiguous range starts beginning at x2C. A start of -1 disables that range. Each other start defines the half-open interval [start,start+x28); membership of fp->motion_id returns true immediately. If neither range matches, the function returns false. There are no writes, callbacks, allocations or timer operations, and no null checks.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0D72.c#L4-L19.

The current caller's later-jump branch independently checks jumpsUsed against max_jumps, checks controller input, and blocks entry when this predicate is true while cmd_vars[0] is zero. A nonzero command variable bypasses this membership block; it does not bypass capacity or input checks. This establishes the aerial-jump context directly. The ranges contain motion IDs, not elapsed animation frames, so the proposal replaces inherited animation-interval wording.

Caller evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_JumpAerialF1.c#L57-L79.

A bounded canonical declaration read verifies x28 as integer and x2C/x30 as adjacent fields. That header warns its descriptive comments were copied from an unconfirmed database, so those comments are not used to assign character-specific meanings. No shared layout facts are proposed. The implementation directly uses pointer arithmetic beginning at x2C; this review documents that source behavior without modifying it.

## Scope

The manifest owns one20-line C file and no paired header or section targets. All20 lines were reviewed in canonical and separate rendered views. Source entity and #r3 parameter entity inventories are both empty. The parameter is the sole Fighter* input and is not mutated by the predicate. All six function facts have ID/timestamp dispositions: five retained, one superseded. No new names are proposed.
