# TEV semantic review

Reviewed all 548 lines of `tev.c`, all 37 lines of `tev.h`, both canonical and rendered views, all 46 subjects, 136 baseline facts and 38 links. Existing function names fit their implementations; no rename is warranted. Rendered views made no substitutions and reported no parse errors. The header renderer marked the three allocator getters `shadowed_binding`; their canonical declarations and definitions agree.

## Responsibilities

The unit initializes three persistent allocator descriptors with requested object sizes 28, 20 and 48 and alignment 4, and exposes their mutable addresses through getters. Allocator initialization removes previous registry occurrences and clears/re-registers descriptors; that registry behavior is not a guarantee that reinitializing live pools preserves allocated memory.

Channel setup translates `HSD_Chan` descriptors into GX ambient, material and lighting-control state. NULL and GX_COLOR_NULL are no-ops. Ambient colors require enabled lighting and register sourcing; material colors require register sourcing. Color invalidation forces a combined-channel color write under those gates. Otherwise comparisons distinguish RGB, alpha and RGBA. Combined-channel control writes synchronize the paired alpha cache only when the primary cache comparison triggers a write. Bulk channel setup processes the whole linked list and computes the highest required channel count, not list length.

`HSD_StateSetNumChans` compares against `prev_num_chans` without updating it. The static value begins at zero and color invalidation sets it to -1. This must not be described as a fully maintained last-submitted-count cache.

TEV setup always installs stage routing. Zero flags select predefined-mode setup and reset both swap selectors; nonzero flags install explicit color/alpha operations, inputs, swaps and konst selectors. Stage allocation postincrements a software cursor through a checked 0–15 conversion. Bulk setup instead computes the greatest inclusive stage requirement. The GX count API requires 1–16: forwarding zero from an empty list or empty accumulator is not valid zero-stage installation. Render-mode finalization normally supplies a pass-through stage when the accumulator is empty.

Texgen registration retains the greatest inclusive coordinate requirement. Commit submits the accumulated count and resets it; invalidation discards it without GX programming. Its lifetime is independent of TEV initialization. NULL texture setup returns without clearing pending texgens, and the shadow path's textureless descriptor does not itself establish a zero pending count.

The four-entry signed TEV-color table is conditionally flushed with slot-to-register mapping 0→1, 1→2, 2→3, 3→0. Flush and invalidation clear pending markers; invalidation leaves colors untouched. No nonzero-marker producer appears in the owned source, so the conditional protocol must not be presented as evidence of active staging traffic.

`ChanUpdateFunc` handles selectors 5–8 as material RGBA and 9–12 as ambient RGBA, multiplying a pointed-to float by 255.0. NULL channels and unknown selectors do nothing. There is no clamping or handled-case value-pointer validation; normalized input is an intended convention rather than an enforced property.

## Evidence boundaries

Source behavior and signatures support 109 retained facts and 24 retained links. Seven facts receive factual corrections. Twenty section-subject facts and fourteen section links remain unresolved because source declarations do not establish compiled section membership, order, extent, padding or constant pooling. No compiled-layout claim is adopted. Similar baseline links remain separately accounted for rather than merged.

Cross-file reads confirm allocator initialization and diagnostics, material setup lifetime, expression compilation and accounting-only stage allocation, shadow/emboss stage construction, render-mode fallback and finalization, and GX count validation. The header declares the public setup/invalidation interfaces; HSD_TexCoordID2Num has a local forward declaration in the C file rather than a declaration in this header.

Status: researched; no-change lead bypass; independent review and live promotion pending.
