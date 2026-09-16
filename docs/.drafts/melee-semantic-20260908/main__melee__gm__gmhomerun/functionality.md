## Home-Run Contest orchestration

`gmhomerun.c` defines two active `GameModeState` entries followed by a negative sentinel: state 0 uses CSS with shared CSS entry/exit data; state 1 uses VS with separate start and exit payloads. The header declares the four state callbacks, two parameterless lifecycle hooks, and retained `VsModeData`.

### Selection and retained configuration

Mode initialization delegates to `gm_InitVsMode`. Mode load samples `gm_801677F0()` into the participant-context byte and clears the CSS-visit byte. CSS entry skips its card-work sequence on the first visit, executes it on later visits, rebuilds selection data from the retained fighter/color/nametag, and requests Sandbag color 0 and stage `0x54` in the preload cache. Its visit count saturates at 255, as confirmed by `lbTime_8000AF74`.

CSS exit tests exactly `pending_scene_change == 2`: that branch schedules `GM_MENU` and returns before roster mutation. Every other value resets the retained players, transfers the selected fighter, and prepares player 1 as CPU Sandbag with CPU kind `0xF`, defense ratio 1.0, one stock and team 1.

### Gameplay entry

VS entry calls the rules-default initializer and then overwrites the rules with retained mode rules. It forces stage `St_Kind_Unk84`, match kind 1, enabled timer, ten-second limit, non-team play, unity game speed and `x30`, callback `gm_80181998`, and several still-anonymous flags. All player descriptors are copied and specialized; player 0 is configured as a one-stock human using the retained participant context. Rumble and Home-Run startup bookkeeping follow. Unknown numeric fields are not assigned speculative meanings.

### Results and retry lifetime

VS exit always calls `gm_80162968(frame_count / 60)`, `gm_8016247C(standing.xE)` and `gm_80180BA0` before checking retry. The last helper writes cached records through `gmMainLib_8015D06C`, multiplying cached values by ten; VS entry loads that cache through the corresponding helper. Thus retry is not a blanket no-record-write path.

`OUTCOME_RETRY` requests state 1 and returns, retaining the roster and bypassing the subsequent distance/threshold pipeline. Every other outcome converts player 0's character to selection kind, obtains distance, conditionally passes a derived value onward unless it is `0x148`, and updates the record returned by `gmMainLib_8015D084` only when the comparison succeeds. The distance local is `u32` while the record pointer is `s32*`; the source's mixed-signedness comparison must not be silently rewritten. Trophy checks follow, including two current-distance thresholds and an aggregate saved-record threshold. A successful challenger-staging call owns the pending transition; otherwise the callback requests CSS state 0.

### Semantic review

The existing CSS-entry, CSS-exit and VS-preparation names fit canonical registration and behavior. The rendered `gm_Mode_Homerun_Exit` obscures the distinction between exiting the VS state and exiting the whole mode; an explicit VS-exit name is proposed. Stale `x1C` references are corrected to `defense_ratio`, and retry explanations are qualified to preserve pre-guard record writeback. Both rendered files were read completely; substitutions are hypotheses, not evidence for their own meanings. No compiled section size, adjacency, padding or exclusive section inventory is certified.

Status: synthesized; independent review and live promotion pending.
