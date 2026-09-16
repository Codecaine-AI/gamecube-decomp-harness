## Fighter data registry and resource management

`ftdata.c` centralizes parallel fighter-kind tables for costumes, lifecycle callbacks, motion states, grounded/aerial specials, item reactions, knockback, attributes, model hooks and demo resources. Null entries and shared callbacks are meaningful dispatch policy, not evidence that every fighter has a distinct implementation.

Resource preparation separates filename-based preloading from synchronous lazy resolution. The preload dispatcher normalizes invalid concrete costume selectors to zero and expands `0xFF` to every costume. Base fighter roots are cached in `gFtDataList`; costume loaders use the cached joint as their initialized sentinel and retain an archive descriptor plus an optional material-animation root. The two costume-loader bodies are identical at this revision; their different demo call paths do not establish different loading policies. The optional post-load dispatcher is distinct from per-instance `OnLoad` and currently selects only Kirby's copy-resource hook.

Shared animation loading rebases nonempty descriptors against a retained file head, enforcing the `0x8000` size threshold. Gameplay and demo initialization allocate two per-Fighter work buffers and reset source-cache keys. Demo initialization rebases a caller-selected inclusive range, enforces `0xB000` for present entries and consumes the shared base marker without freeing the backing archive. Demo allocator setup uses size `0xB000` and alignment `0x20`.

The primary motion loader separates the descriptor-source Fighter from the destination Fighter. Both motion loaders cache by backing-source token, distinguish request sources below `0x80000000` from memory sources, and can copy and relocate a matching partner archive for non-demo Nana. Crucially, the secondary FigaTree accessor's partner branch writes `x59C`, while its ordinary acquisition branch writes `x5A0`; its returned tree therefore does not always have an independent secondary-buffer lifetime. Cache hits return existing result pointers, including when the matching token is zero. `x58C` is `u32`, so comparisons with signed motion selectors use unsigned conversion; absence of an explicit lower-bound test does not imply negative IDs pass for normal counts. The descriptor getter itself performs no bounds validation.

Reference counters track eligible fighter-owned character items through a saved owner-kind index across acquisition and destruction. Counter adjustment occurs before the negative-result assertion. Fighter teardown separately clears one shared-record bit only when no other live Fighter holds the same `x61C`; neither operation establishes archive deallocation. Work buffers are freed later by Fighter teardown.

The leading movement helper writes root-joint translation minus current position into all three self-velocity components. Its character-specific adapters participate in demo presentation selection. Common-state enum spellings used by those adapters must not be interpreted as gameplay revival-platform behavior when the constructor has installed demo state tables.

## Semantic review outcome

All 121 baseline facts and 39 links have explicit checkpointed dispositions: 109 facts retained, seven superseded and five unresolved; 36 links retained and three unresolved. Existing inferred names remain supported and are retained. Corrections address demo-state interpretation, allocator size versus alignment, exact reset fields, effect-sentinel signedness, secondary-buffer asymmetry and zero-token cache behavior.

All owned canonical and rendered pages were reviewed. Rendered views reported no parse errors. The header leaves `ftData_80085E50`, `ftData_80085FD4` and `ftData_80086060` unchanged due to shadowed bindings; the dox view similarly leaves `ftData_80085FD4` unchanged. The dox file also contains stale signatures and signedness declarations, which are not authoritative over the current C definition and header. Source declarations and ordering helpers do not establish compiled section placement, pooling, padding or aggregate layout.

Status: researched; no-change lead bypass; independent review and live promotion pending.
