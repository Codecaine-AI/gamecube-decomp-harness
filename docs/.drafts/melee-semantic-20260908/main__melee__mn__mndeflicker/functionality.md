## Deflicker settings screen

The unit implements screen entry, visual construction, controller handling, and entrance/active/exit animation callbacks. Entry selects menu ID `0x15`, records the previous menu, installs cooldown `5`, clears the A-toggle enable byte, loads four `MenMainConDf_Top` resources, constructs the visual GObj, and creates a separate input GObj. Construction attaches heap-owned `Menu` data with `HSD_Free`, restores the selection through `gmMainLib_8015F4E8`, uses its byte value as node-5 animation frame, forwards it to `gmMainLib_8015F588`, and creates centered text `0xBD`.

The entrance callback uses settings `{0,19,-0.1}`. Exact endpoint equality installs the active callback and enables A toggling. The active callback updates node 6 with `{50,350,50}`. Either callback detects departure from menu `0x15`, replaces itself with the exit callback, and releases text immediately. Exit uses `{20,30,-0.1}` and destroys the visual GObj only when the animation helper returns exactly the configured endpoint.

Input cooldown suppresses all button processing. Afterwards Back takes priority over A, forwards the current selection to `gmMainLib_8015F4F4`, updates power-time bookkeeping, clears `entering_menu`, and requests transition `(4,2,3)`. Back does not require entrance completion. Enabled A assigns `cursor = (cursor == 0)`, updates node 5, and forwards the result to both setting helpers. Numeric values are preserved without asserting which value means filter enabled or disabled.

The visual and input objects have distinct lifetimes. This file neither removes the separate input GObj at visual teardown nor clears the retained visual pointer. Archive ownership, transition-wide cleanup, actual video-filter behavior, and durable storage semantics remain external responsibilities rather than consequences proved here.

Canonical evidence: [input and animation lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mndeflicker.c#L34-L121), [construction and entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mndeflicker.c#L123-L195).

## Semantic review

Retained 45 supported facts and 11 links. Three facts receive supported replacements: two colliding `mnDeflicker_Think` names become phase-specific names, and the animation-state explanation distinguishes A gating from Back availability. Nine facts and one link remain unresolved where claims exceed available layout, compiled-pool, or helper evidence. Existing useful descriptions otherwise remain unchanged.

Both rendered files suppress the two colliding names while successfully substituting the other four owned function names. The header also retains placeholder declarations and an `int` entry parameter inconsistent with the C definition's `HSD_GObj*`; the rendered view does not resolve that discrepancy.

Status: synthesized; independent review and live promotion pending.
