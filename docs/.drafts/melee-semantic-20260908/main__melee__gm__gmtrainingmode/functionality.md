## Training Mode lifecycle

This translation unit registers state 0 (`GS_CSS`), state 1 (`GS_SSS`), and state 2 (`GS_TRAINING`), followed by a -1 terminator. Static CSS and SSS payloads serve both entry and exit; gameplay uses separate entry and exit storage. The header exports the state table and initialization/load hooks.

### Initialization and character selection

`gm_Mode_Training_OnInit` initializes persistent `VsModeData`, assigns player colors and CPU-kind defaults, and copies records into `gm_80473814.saved_players`. Its nonzero loop iterations repeatedly assign `players[1].ckind = CHKIND_NONE`, not `players[i]`. `gm_Mode_Training_OnLoad` samples `gm_801677F0()` into `gm_804D68C0` and clears `gm_804D68C1`.

CSS entry initializes two selectors from persistent selections and refreshes preload state. A nonzero bookkeeping byte gates the card-related calls; afterward the byte is replaced with `lbTime_8000AF74`'s result. CSS exit returns immediately to `GM_MENU` when `pending_scene_change == 2`. Otherwise it commits selections, clones the opponent into records 2 and 3, adjusts their colors, assigns slots, updates preload entries and submits the combined character-audio mask. Color adjustment performs only one additional increment when equal to player 0's color; it does not establish general color uniqueness. The zero versus nonzero controller-value branches remain distinct, including the later `slot - 1` CPU-helper arguments.

### Stage selection and gameplay entry

SSS entry writes `x1 = 0`, `force_stage_id = -1`, and `unk_stage = 0`. An exit with `start_game == 0` explicitly selects state 0 and returns. Acceptance copies the selected stage into persistent rules and shared `stage_id`, then prepares stage audio; it does not explicitly write next state 2.

Gameplay entry copies persistent rules and four player records into `StartMeleeData`, installs the empty `void(int)` pause override, and applies literal rule/player flag overrides. It configures player 0 as human and records 1–3 through the CPU helper, then marks records 2 and 3 unavailable. Rumble and common setup follow. Additional-CPU modifier behavior is not implemented by this callback itself.

### Gameplay exit and cross-file effects

Gameplay exit forwards frame count divided by 60, player-standing field `xE`, and character-indexed performance data to bookkeeping helpers. The record helper retains larger character-indexed values. Reward checks include per-character thresholds 10 and 20 and a summed threshold 125, followed by a broader reward scan. `gm_80173754(28, gm_804D68C0)` can publish a pending `GM_CHALLENGER_APPROACH` transition using separately retained challenger data; only failure selects local state 0. `sfxForward` runs in either case.

### Semantic assessment

Existing owned rendered callback names fit their canonical registrations and bodies and are retained. The unnamed CSS-exit callback has a sufficiently clear, useful role to support a new inferred name. One explanation is corrected to remove the unsupported guarantee of nonconflicting colors. The stale Camera Mode link is rejected. Compiled section inventory remains unresolved without compiled evidence. The match-exit data-flow fact's call sequence is supported, but its rationale's saturation claim remains unresolved because the inspected unsigned arithmetic does not establish that guarantee. Rendered helper names are not used as independent proof of their domains.

Status: synthesized; independent review and live promotion pending.
