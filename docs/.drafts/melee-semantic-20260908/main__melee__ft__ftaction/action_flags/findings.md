# Action Flags and Presentation Handlers

Draft. Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC start `2026-09-08T14:33:11Z`, end `2026-09-08T14:38:39.773532Z`. Owned lines 977-1317 have complete canonical and separate frozen rendered reads. 33 targets, 66 empty parameter entities and all 185 facts accounted for. No empty or failed renders; zero parser errors in owned pages. Supplemental interpreter, sound helper and table receipts are recorded separately.

## Handler and Pair Findings

- `ftAction_800726F4`, opcode `0x28`, counterpart `ftAction_800726F4`. Executes the fighter action-script command that applies a requested animation frame to one costume texture object and, when the command's secondary-target flag is set, applies that same frame to a second texture object before advancing the script. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L977-L986.

- `ftAction_800727C8`, opcode `0x29`, counterpart `ftAction_8007283C`. Executes the fighter action-script command that selects an animation variant for one fighter model part, initializes that part's playback timing, applies the selected animation data, and then advances the script to the next command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L988-L993.

- `ftAction_8007283C`, opcode `0x29`, counterpart `ftAction_800727C8`. Handles a fighter action-script command that immediately selects and applies a configured animation variant to one fighter model part, then advances the packed command stream. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L995-L1000.

- `ftAction_80072894`, opcode `0x2a`, counterpart `ftAction_80072894`. Handles the fighter action-script command that transitions an attached ordinary Parasol or Peach Parasol article to a requested normalized Parasol status, optionally fitting the article animation to a command-specified duration, then consumes the command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1002-L1006.

- `ftAction_800728F8`, opcode `0x2b`, counterpart `ftAction_8007296C`. Executes a fighter action-script command that requests controller rumble. A command flag selects whether the encoded rumble program and duration are applied to every current fighter or only to the fighter executing the script, after which the handler advances to the next command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1008-L1018.

- `ftAction_8007296C`, opcode `0x2b`, counterpart `ftAction_800728F8`. Alternate-table counterpart of the one-word rumble request; consumes the event without requesting rumble. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1020-L1023.

- `ftAction_8007297C`, opcode `0x2c`, counterpart `ftAction_800729C4`. Handles a fighter subaction command that conditionally cancels the scheduled controller-rumble effects carrying the command's fighter-level rumble ID, then consumes the command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1025-L1030.

- `ftAction_800729C4`, opcode `0x2c`, counterpart `ftAction_8007297C`. Acts as the alternate-table handler for the one-word fighter subaction command that normally cancels a tagged controller-rumble effect. On this alternate execution path, it consumes the command without performing the cancellation, allowing script interpretation to continue. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1032-L1035.

- `ftAction_800729D4`, opcode `0x2d`, counterpart `ftAction_80072A4C`. Handles the fighter action-script command that starts either extension or retraction of a held Beam Sword's blade. It decodes the command subtype and scaling operands, delegates the guarded Sword-item operation to the corresponding fighter utility, and then consumes the command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1037-L1051.

- `ftAction_80072A4C`, opcode `0x2d`, counterpart `ftAction_800729D4`. Acts as the alternate-table handler for fighter subaction opcode 0x2D, whose normal handler starts either Beam Sword blade extension or retraction. In the throw-flag-aware interpreter path, it consumes the one-word event without changing the held Sword, allowing command interpretation to continue. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1053-L1056.

- `ftAction_80072A5C`, opcode `0x2e`, counterpart `ftAction_80072AAC`. Handles a fighter action-script command that requests activation of a color-animation profile, then advances the action-script cursor. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1058-L1063.

- `ftAction_80072AAC`, opcode `0x2e`, counterpart `ftAction_80072A5C`. Acts as the alternate fighter action-script handler for opcode 0x2E: in the `ftAction_80073354` dispatch mode it deliberately consumes the one-word event without applying the normal opcode-specific fighter behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1065-L1068.

- `ftAction_80072ABC`, opcode `0x2f`, counterpart `ftAction_80072B04`. Executes a fighter action-script command that resets the ordinary fighter color-animation controller associated with the command's encoded color-animation ID, allows persistent status overlays to be restored by the color-animation subsystem, and then advances to the next script command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1070-L1074.

- `ftAction_80072B04`, opcode `0x2f`, counterpart `ftAction_80072ABC`. Handles the alternate execution mode for the one-word fighter subaction command whose normal handler resets a fighter color animation. In this mode it deliberately suppresses the reset operation and only advances the command stream. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1076-L1079.

- `ftAction_80072B14`, opcode `0x30`, counterpart `ftAction_80072B14`. Sets Fighter.x221E_b1 from the command operand and advances cmd->u once. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1081-L1086.

- `ftAction_80072B3C`, opcode `0x31`, counterpart `ftAction_80072B84`. Handles one fighter animation-script opcode by copying its two `unk16` payload values into persistent fighter state fields `x2100` and `x2101_bits_8`, then advancing the script cursor. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1088-L1094.

- `ftAction_80072B84`, opcode `0x31`, counterpart `ftAction_80072B3C`. Serves as the alternate-table handler for the one-word fighter subaction opcode normally handled by `ftAction_80072B3C`. It consumes that command without copying its `unk16` payload into `Fighter.x2100` and `Fighter.x2101_bits_8`, allowing the throw-flag-aware command resolver to continue without applying the normal fighter-state update. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1096-L1099.

- `ftAction_80072B94`, opcode `0x32`, counterpart `ftAction_80072BE4`. Handles the one-word fighter action-script command that toggles a selected model part at a dynamic-bone boundary. It forwards the command's fighter-part selector and the fighter's current animation frame to the dynamic-bone subsystem, then consumes the command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1101-L1106.

- `ftAction_80072BE4`, opcode `0x32`, counterpart `ftAction_80072B94`. Serves as the alternate-table handler for the one-word fighter subaction command that normally toggles a selected model part at a dynamic-bone boundary. During nonzero-frame motion-entry catch-up, it consumes that command without replaying the dynamic-bone transition, allowing script interpretation to continue. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1108-L1111.

- `ftAction_80072BF4`, opcode `0x33`, counterpart `ftAction_80072C5C`. Executes the fighter action-script command that applies the command's encoded damage amount to the fighter running the script, then advances the command cursor so interpretation can continue. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1113-L1118.

- `ftAction_80072C5C`, opcode `0x33`, counterpart `ftAction_80072BF4`. Handles an effectless fighter action-script command by consuming it without changing fighter state, allowing interpretation to continue at the following command. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1120-L1123.

- `ftAction_80072C6C`, opcode `0x34`, counterpart `ftAction_80072C6C`. Handles a fighter action-script command that configures the fighter's grounded terrain-conforming pose. It forwards the command payload as the enable mask for the two leg-IK paths and floor-slope body alignment, then advances the command stream. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1125-L1129.

- `ftAction_80072CB0`, opcode `0x35`, counterpart `ftAction_80072CB0`. Handles a one-word fighter action-script command that sets the Fighter flag `x2225_b2` from the command payload and advances the script cursor. The flag provides animation data with direct control over a conditional fighter-rendering behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1131-L1136.

- `ftAction_80072CD8`, opcode `0x36`, counterpart `ftAction_80072E24`. Executes the three-word fighter footstep-effect animation command, adapting its sound and graphics to the collision surface beneath the fighter while preserving its configured fallback audio behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1138-L1188.

- `ftAction_80072E24`, opcode `0x36`, counterpart `ftAction_80072CD8`. Consumes a three-word fighter footstep-effect command without executing its terrain-sensitive sound or graphics behavior, preserving command-stream alignment. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1190-L1193.

- `ftAction_80072E4C`, opcode `0x37`, counterpart `ftAction_80072FE0`. Handles a three-word fighter ground-contact effect command by selecting surface-specific command and graphics replacements when available, falling back to the embedded effect, and coordinating graphics, default sound, command execution, and controller rumble. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1195-L1245.

- `ftAction_80072FE0`, opcode `0x37`, counterpart `ftAction_80072E4C`. Acts as the alternate no-effect counterpart to the three-word ground-impact handler, consuming the event during nonzero-frame motion-entry catch-up without replaying its graphics, sound, command, or rumble effects. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1247-L1250.

- `ftAction_80073008`, opcode `0x38`, counterpart `ftAction_8007309C`. Executes the smash-charge animation command by decoding its timing, charge-rate, and color-animation parameters and passing the normalized configuration to the common fighter smash-charge setup routine. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1252-L1266.

- `ftAction_8007309C`, opcode `0x38`, counterpart `ftAction_80073008`. Acts as the alternate smash-charge command handler during nonzero-frame motion-entry catch-up, consuming the command's two words without applying the ordinary smash-charge setup. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1268-L1271.

- `ftAction_800730B8`, opcode `0x39`, counterpart `ftAction_80073108`. Executes a one-word fighter visual-state command by decoding two operands, applying them to the fighter's refractive-effect flag and model-vibration frame field, and advancing the command stream. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1273-L1278.

- `ftAction_80073108`, opcode `0x39`, counterpart `ftAction_800730B8`. Provides the skip-only handler used by the alternate fighter color-animation dispatcher, consuming selector 23 without applying the normal `ftCo_800C8B60` visual-state side effect. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1280-L1283.

- `ftAction_80073118`, opcode `0x3a`, counterpart `ftAction_8007320C`. Handles the fighter animation-script `wind_fx` command by decoding its four packed command words and requesting a transient, bone-anchored wind source from the fighter dynamics subsystem. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1285-L1311.

- `ftAction_8007320C`, opcode `0x3a`, counterpart `ftAction_80073118`. Handles the catch-up variant of the four-word fighter `wind_fx` command by advancing past its payload without creating the transient dynamics effect submitted by the normal handler. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1313-L1316.

## Cross-Handler Invariants

Texture animation, parasol dispatch, x221E_b1, ground-pose flags and x2225_b2 use the same callback in both fighter tables. Part animation is a modified alternate, forcing zero timing instead of suppressing all effects. Other paired alternate handlers in this cluster advance 1, 2, 3 or 4 command words without fighter/subsystem writes. Timing and throw_flags handling belong to the enclosing resolver. Nonzero-frame motion entry invokes the alternate resolver, so its handlers are not exclusively throw-script handlers.

Footstep and impact replacement sound commands use a temporary cursor; changing it does not advance the original command. The original advances through the sound helper or explicit skips. The sound helper has an unrecognized-behavior path consuming only two words, so three-word terminal claims require valid behavior inputs. Footstep graphics are conditional; impact graphics and rumble requests are attempted unconditionally. The latter still passes through fighter rumble eligibility checks.

Wind operand labels are shifted relative to their roles: wind_fx_1.timer supplies x, wind_fx_1.x supplies y, wind_fx_2.y supplies magnitude, wind_fx_2.mag supplies decay, wind_fx_3.angle supplies integer duration, and wind_fx_3.decay supplies angular increment. Five floats use literal 0.003906, not exact 1/256. The handler advances four words before calling the dynamics helper.

## Corrections and Retentions

{'retain': 166, 'supersede': 17, 'unresolved': 2}. Only 17 corrections are proposed; valid facts are retained without rewriting. Corrections distinguish integer command storage from float call arguments, replace the wrong Peach auxiliary-model attribution with Purin/Jigglypuff, remove throw-only rumble naming, and qualify footstep length and rumble conditions. Shared field layouts are foreign evidence only. No new shared entity, link, merge or follow-up is proposed.

Independent-review ledger repair: packed operand widths and malformed random-selection outcomes must not be inferred from destination types. The final fact-dispositions.json supersedes any broader narrative here for the eight deferred retained claims. Consolidated final counts: 327 retain, 48 supersede, 88 unresolved; 49-write proposal unchanged.
