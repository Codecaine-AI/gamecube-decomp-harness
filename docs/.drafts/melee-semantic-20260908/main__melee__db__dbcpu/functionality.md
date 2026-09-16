## CPU/handicap diagnostic panel

`dbcpu.c` owns a persistent `DevText*`, a `0x34C`-byte backing buffer, and the separate `db_ShowCpuHandicapInfo.b0` control flag. The canonical function names accurately describe setup, refresh, and controller checking. The complete rendered view contains no substitutions or parser errors; it supplies no independent naming evidence.

### Setup
`fn_SetupCpuHandicapInfo` obtains the shared DevText GObj, clears the enabled flag, and stores the result of `DevText_Create(6, 20, 20, 60, 7, buf)`. Only a non-NULL result receives registration and styling: hidden cursor, transparent-black background color, opaque-white text, and scale `(9.0F, 12.0F)`. Clearing the enabled flag is not itself an explicit call to hide text or background. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcpu.c#L6-L28)

### Refresh
When enabled, `fn_UpdateCpuHandicapInfo` erases and rewinds the panel, prints the A–G heading, and prints one row for each slot 0–5 without filtering player state. Columns contain `player_state`, `cpu_level`, `cpu_type`, `handicap`, `unk50`, `attack_ratio`, and `defense_ratio`, respectively. The routine reports these fields rather than modifying gameplay state. Numeric player-state meanings and the meaning of `unk50` are not established here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcpu.c#L30-L50)

### Input and lifetime
`fn_CheckCpuHandicapInfo(int player)` forwards its selector to the debug input accessors. B combined with newly pressed D-pad Down XOR-toggles the shared flag. The zero branch hides background and text and returns; the other branch shows both. No qualifying chord leaves panel state unchanged. Neither this routine nor the enabled refresh path locally checks the stored handle for NULL. The unit contains no destruction or repeated-setup cleanup path, so creation failure recovery and renderer teardown must not be inferred from these routines. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcpu.c#L52-L66)

The debug dispatcher returns below `DbLKind_DebugRom`. Otherwise, it checks four controller selectors and then refreshes once. Its earlier input-state refresh handles only two selectors when Master Hand or Crazy Hand is present, otherwise four; this exceptional bound does not change the four CPU-panel checks or six displayed rows. Multiple qualifying controller checks can therefore toggle the shared flag before the single refresh. [Dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L242)

### Compiled evidence boundary
The upstream hash-bound review reports inspecting `compiled-artifacts.json`, SHA-256 `69fe9ab019347ecdbe066eec261e7229a2b962df028bece9fe73ac9d6c7ec1a4`, and retains qualified storage descriptions on that basis. That artifact was not available in this lead's input artifacts, so this lead does not claim independent verification of compiled section bytes, offsets, or object extents. No compiled layout conclusions are inferred from canonical source or rendered names.

The lead independently reconciled the canonical and rendered unit, the dispatcher, the functionality document, and the empty proposal. All 39 upstream retained facts and all 14 links remain explicitly retained without overrides. One existing visibility-state fact remains deferred because its unconditional initial-hidden interpretation is not established by the inspected creation caller. No cosmetic rewrites or speculative renames are proposed.

Status: synthesized; independent review and live promotion pending.
