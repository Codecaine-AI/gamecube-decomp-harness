## Sound options implementation

The canonical implementation supports the existing rendered names `mnSound_HandleInput`, `mnSound_ModelProc`, `mnSound_CreateScreen`, and `mnSound_Init`. These describe distinct input, presentation, construction, and entry responsibilities; they remain descriptive hypotheses rather than recovered historical spellings. Both rendered files parsed successfully and matched the canonical function declarations.

### Entry and construction
`mnSound_8024A09C` sets the shared cooldown to 5, preserves the previous menu kind, selects Sound settings, resets hovered selection, and loads four `MenMainConSo_Top` resources into the static model descriptor. It constructs the visible screen before registering a separate input GObj process. Its integer argument is forwarded to a constructor that does not consume it. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsound.c#L363-L382)

`mnSound_80249C08` creates the model GObj, publishes its global handle, attaches the hierarchy and animations, and allocates `sizeof(Menu)`. Allocation is guarded by `HSD_ASSERTREPORT` with diagnostic line operand `0x22C`; the owned source does not establish emitted filename bytes or their section placement. Initialization restores channel and balance values, selects row 0, sets the reveal countdown to 20, creates center text, initializes indicators, and hides the hierarchy. User data is registered with `HSD_Free`. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsound.c#L279-L361)

### Input and numeric behavior
The input callback ignores its formal GObj argument and accesses the model through `mnSound_804D6C30`. A nonzero shared cooldown decrements the animation timer and returns. Input priority is Back, vertical navigation, Left, then Right. Back forwards the balance to `gmMainLib_8015ED80`, updates card power time, and requests transition `(4, 1, 3)`. Vertical input toggles rows and replaces center text with ID `0xBB` or `0xBC`. Channel changes are explicitly 1→0 on Left and 0→1 on Right, with canonical comments identifying mono→stereo and stereo→mono respectively. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsound.c#L87-L204)

Balance handling interprets the stored byte as signed, checks against -100 or 100, and then changes it by 5. These are precondition guards, not saturating clamps: arbitrary non-step-aligned values need not remain within the nominal interval after a step. Slider placement uses `((signed_mix + 100) / 200.0F)` to interpolate endpoint X coordinates. Accepted changes request directional animation, call `gm_801602C0`, and then call `gmMainLib_8015ED80`; those calls do not themselves prove a physical memory-card write. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsound.c#L34-L61) [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsound.c#L132-L202)

### Presentation and lifetime
The model callback first checks whether Sound settings remain active. Otherwise it calls GObj teardown, then accesses `menu->text` for text removal, and returns. The source does not clear the global model handle or explicitly remove the separate input process here; framework reclamation and transition scheduling remain cross-file lifetime dependencies.

While the local countdown is nonzero, it decrements the byte, maintains hidden state until zero, then reveals and returns. Steady animation therefore begins on a later invocation. It animates the selected channel only on row 0; node 6 chooses the left interval when its current frame is inclusively 0–3 and the right interval otherwise. Nodes `0xE` and `0xB` use row- and channel-indexed settings. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsound.c#L206-L287)

### Review outcome
Explicitly retained 37 facts and all 8 links. Twelve facts remain unresolved because their supported source-level behavior is combined with unverified compiled placement, byte-size, filename-object, or lifetime claims. No equivalent wording was rewritten and no speculative replacement facts were proposed.

Status: synthesized; independent review and live promotion pending.
