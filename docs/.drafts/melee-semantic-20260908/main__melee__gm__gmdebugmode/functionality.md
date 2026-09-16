# Debug-mode scene orchestration

`gmdebugmode.c` defines the debug mode's `GameModeState` table and entry/exit callbacks; the header exports `gm_Mode_Debug_States`. Local state IDs 0–14 are followed by a `{-1}` terminator. These IDs are distinct from `GS_*` scene kinds and `GM_*` game-mode identifiers. Every populated state uses `lbDvdPreload_2`. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L77-L259), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.h#L1-L9).

## Menus and transitions

States 0, 1 and 2 use `GS_DEBUG_MENU` and share static `menu_enter_data`. Each entry overwrites its menu-data and callback fields. State 0 installs `fn_801B09F8`; states 1 and 2 install `fn_801B0A8C`. Only input code 0 causes these callbacks to play the back sound and request scene exit. The root callback schedules `GM_TITLE`; the subordinate callback stages local state 0. Both always return 0. Only menu state 1 performs the four-call audio setup sequence. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L266-L309).

`gm_801A4B60` writes scene-loop control value 1, not a local debug-state ID. Control value 2 instead bypasses the remaining render path. [Setters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L170-L178), [loop](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1A45.c#L354-L377).

## Static payloads and retained results

The table publishes static payload addresses, not callback-local temporaries. State 4 supplies `StartMeleeData` to `GS_VS` and retains output in `vs_exit_data`. State 5 initializes `ResultsMatchInfo`, then copies `vs_exit_data.match_end`; its enter and exit pointers share `results0_data`. The callback does not check whether a fresh VS match produced the retained data. Results exit retrieves but discards its output pointer and stages state 0. [Declarations and bindings](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L62-L149), [handoff](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L321-L341).

VS entry delegates to `un_802FFF2C` and performs fixed audio setup. The helper initializes defaults, reads retained configuration, handles match-kind cases 0/1/2 and a default, and initializes four players. Cases 0/2 enable the timer only when the computed `u16` duration is nonzero; case 1 and the default disable it. [Constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/soundtest.c#L985-L1049).

## Presentation tests

- State 3 delegates prize initialization to `un_802FFEE0`; exit selects menu state 2. The helper converts `un_803FA258.x12C` to `u16` before capping it at 62, copies `x130` into payload `x2`, writes `0x98967F` to `x4`, and clears `x8`. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L311-L319), [helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/soundtest.c#L976-L983).
- State 6 prepares audio and delegates Intro Easy configuration. State 7 delegates All-Star intro initialization, whose helper copies `un_803FA258.x138` to payload `x0` and clears `x4`. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L343-L353), [helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/soundtest.c#L2109-L2142).
- State 9 initializes Game Over fields with fixed values, character selection `un_803FA258[0x4D]`, `HSD_Randi(0x3E8)`, and `HSD_Randi(0xA)+1`. Unnamed fields retain numeric descriptions. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L357-L369).
- State 10 clears payload byte 1 and maps selector values 1–11 to 3, 7, 9, 10, 15, 20, 21, 22, 23, 24 and 25. Case 12 and every unmatched value also yield 25. [Switch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L371-L415).
- States 6, 7, 8, 9, 10 and 12 share the unconditional root-return callback `onExitIntro`. Coming Soon (8) and opening movie (12) have no entry callback or payload. Staff roll (14) has neither callback here, so this unit supplies no explicit root-return action for it. [Registrations and exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L151-L264).
- State 13 supplies separate memory-card input/output buffers. Entry writes `x0=1`, `x4=0`; exit retrieves but does not inspect the output and always stages state 0. The specific check or warning remains unproven. [Registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L235-L245), [callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L463-L474).

## Synthetic results and repetition

State 11 uses `DebugResultsData` independently of retained VS output. Configuration is assigned into two one-bit fields and four byte fields. `gm_80166A98` receives an explicitly masked byte, signed-byte casts, and four selection values decremented by one. Across four standings, audio contributions are ORed only when `slot_type != 3 && is_big_loser == 0`, not under an explicit first-place test. Result-audio setup then loads the announcer and calls `gm_801701A0`. [Setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L417-L451).

Exit stops audio before testing the copied held-button mask. Holding L repeats state 11; otherwise it stages state 0. This is not an edge-trigger test, and the callback ignores its argument. [Exit](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmdebugmode.c#L453-L461), [cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbaudio_ax.c#L207-L213).

## Review and evidence limits

Inherited research covers both owned canonical/rendered files, all 42 subjects, 98 facts and 26 links. The distinct lead independently checked every proposed fact citation and every upstream non-retain evidence range. Supported unchanged names, explanations and links are explicitly retained, with no additional overrides. The sole proposal corrects prize cast-before-cap semantics.

The C renderer reports six parse errors and zero substitutions; rendered hypotheses are not independent proof. Source establishes static storage and payload roles, not exact compiled `.bss`, `.sbss` or `.data` membership. Four section-attributed facts and one section link remain unresolved pending compiled evidence; two memory-card links await consumer semantics. The local int-array view of `un_803FA258` remains unreconciled with its structured definition. Historical duplicate links and original identifiers are preserved without merging.

Status: synthesized; independent review and live promotion pending.
