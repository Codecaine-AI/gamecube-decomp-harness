## Item Switch semantic review

The unit implements Item Switch entry, controller input, a two-column grid of 31 item entries, localized icon frames, a shared six-valued frequency control, transition presentation, and settings synchronization. All ten existing function-name hypotheses fit their canonical responsibilities; none needs renaming. The header renderer leaves three pointer-returning declarations unsubstituted despite recognizing their hypotheses.

### Construction and presentation
`mnItemSw_802358C0` selects menu kind `0x10`, focuses slot zero, asserts the ordinary-input gate, constructs the display in state 1, and creates a separate input-process GObj. `mnItemSw_802351A0` publishes the display GObj, installs its visual updater, allocates `MnItemSwData` with `HSD_Free` as its destructor, loads 31 ordered item states, and translates persistent frequency into `x21 = item_freq + 1`. Entries occupy columns 0–15 and 16–30. The columns, cursor, and frequency control initially remain hidden. [Construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L774-L919)

Item identity, enabled state, and hover presentation are separate animation inputs. IDs 19 and 17 use non-Japanese icon frames `0x27` and `0x28`; otherwise the item-frame table is used. Selection positions 31 and 32 both address the same frequency value and visual control, not two independent settings. [Icon lookup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L98-L115), [frequency presentation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L412-L451)

### Input and persistence
Back precedes the gate: it commits cached settings, updates power time, sets cooldown to 5, invokes the Rules-menu initializer, and removes the input GObj. Other controls are suppressed while the gate is nonzero. A toggles the shared confirmed value only for ordinary entries and then commits the existing cached item array. The visual updater subsequently copies ordinary confirmations into that array; this is not an atomic toggle-and-save operation. Start is an `else if` of A, so A suppresses Start even on a special position. Start commits and takes the `GM_MENU`→`GM_VS` path or the alternate return path. [Input](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L222-L306), [cache synchronization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L695-L732)

Directional masks have priority 1, 2, 4, 8. Masks 1 and 2 traverse opposite directions through each column's cycle, including its special position. Masks 4 and 8 cross columns for ordinary entries, with 15→30 clamped; at either special position they increment or decrement frequency through 0–5. Existing explanations calling the visual arrangement two rows are corrected. [Navigation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L120-L220), [geometry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L336-L368)

### Transitions and lifetimes
The visual updater retains numeric states 0–4. States 1 and 3 complete to 0, create two text objects, initialize the grid, and release the input gate. States 2 and 4 take the display-removal and text-removal path. Hover/confirmation comparisons are enabled in states 0, 1, and 3. Selection-display updates precede cache writes; frequency changes additionally save all cached settings with `item_freq = x21 - 1`. Text pointers occupy `jobjs[7]` and `[8]` through casts. The source's removal ordering and exceptional initialization paths warrant lifetime review rather than an assertion of safety. [Updater](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnitemsw.c#L576-L732)

Rules input explicitly enters Item Switch from selection 5 and removes its own input GObj, confirming that input and display lifetimes span menu boundaries. [Rules entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnmainrule.c#L176-L204)

Authored table shapes and source-level presentation roles remain supported. Compiled section sizes, padding, literal-pool composition, and actual adjacency are not established by source declarations or layout-preservation comments.

Status: synthesized; independent review and live promotion pending.
