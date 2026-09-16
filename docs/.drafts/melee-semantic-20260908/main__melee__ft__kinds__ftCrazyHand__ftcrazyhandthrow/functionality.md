## Crazy Hand Throw-state implementation

The header declares five void(HSD_GObj*) routines; the source implements the entry routine and animation, IASA, physics and collision callbacks.

- **Entry:** `ftCh_Init_8015A560` clears `cmd_vars[1]`, stores `ftBossLib_GetFighterGObj(FTKIND_MASTERH)` in `x1A5C`, enters numeric motion state `0x17B` with arguments `(0, 0.0f, 1.0f, 0.0f, NULL)`, and calls `ftAnim_8006EBA4`. There is no local null guard or alternate entry branch. `ftCh_Throw_Enter` remains a convention-based naming hypothesis, not a recovered original identifier.
- **Animation:** A nonzero command latch calls `ftBossLib_8015C5F8` and is reset immediately afterward. The helper selects among four SFX IDs, `0x4E21A`–`0x4E21D`. This event processing precedes the exit test, so an event and termination can occur in the same callback. The short-circuit exit guard tests Master Hand motion IDs `0x158`/`0x159`, then Master Hand's `x221F_b3`, then animation exhaustion. On exit the callback calls `Fighter_UnkSetFlag_8006CFBC`, clears `x1A5C`, and invokes `ftCh_GrabUnk1_8015BC88`.
- **Partner lifetime:** Entry's stored object is not dereferenced by these animation predicates: they independently search the global fighter list. The lookup can return NULL; the flag predicate then returns false, and the motion-ID helper returns `ftCo_MS_DeadDown`. No automatic cleanup solely on a missing partner is explicit here. Master Hand's `ftMh_MS_383_80155484` conditionally invokes this entry, stores Crazy Hand reciprocally and enters `ftMh_MS_TagRockPaper`. Its conditional call has no explicit null-object guard. This supports coordinated Hand behavior, not a unique player-facing attack name.
- **Continuation:** `ftCh_GrabUnk1_8015BC88` resets bookkeeping, derives a destination from attributes, assigns `0x184` before comparing against `0x156` and therefore takes the else branch in the shown straight-line path. It subsequently installs `ftCh_Init_80156198` and stores the destination. Its GrabUnk spelling does not prove victim-grab gameplay.
- **IASA:** Only a human player slot invokes `ftBossLib_8015BD20`; that helper is currently empty. Non-human slots skip the hook.
- **Physics:** Unconditionally delegates to `ft_80085134`, which assigns `self_vel.x = x6A4_transNOffset.z * facing_dir` and `self_vel.y = x6A4_transNOffset.y`. The helper does not assign z velocity or implement victim release or damage.
- **Collision:** Entirely empty.

### Evidence

- Entry and complete callbacks: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandthrow.c#L15-L56
- Header declarations: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandthrow.h#L1-L13
- Nullable partner queries: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L177-L245
- Event SFX implementation: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L289-L306
- Empty IASA hook: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34
- Physics implementation: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125
- Reciprocal entry: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandtagapplaud.c#L49-L59
- Continuation setup: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L109-L133

Source literals establish neither compiled section placement nor literal sharing. No compiled artifacts were supplied. Rendered names were reviewed as hypotheses rather than evidence.

Status: synthesized; independent review and live promotion pending.
