## GXPerf semantic review

GXSetGPMetric disables the hardware sources associated with both old cached selections, then stores and programs the requested GXPerf0 and GXPerf1 selections. Destinations include XF register 6, rasterizer commands, bits 4–7 of shared perfSel, and __cpReg[3]. NONE performs no new programming; invalid old or new selectors reach assertions. This is not transactional validation: new values are stored before their programming switches. Completed calls set bpSent to 0.

GXReadGPMetric reconstructs four counters from register halves and interprets them using the cached selections. Clip ratio computes cpCtr1 * 1000 / cpCtr0 without a zero-denominator guard; texture metrics apply scaling or weighted sums. NONE returns zero, and invalid selectors assert then assign zero if execution continues. GXClearGPMetric writes 4 to __cpReg[2] without changing selections. GXInit.c selects NONE for both channels and then clears the counters.

The remaining routines read and clear ten memory-client request counters, read pixel counters with fourfold scaling except copy clocks, configure/read/clear vertex-cache metrics, initialize/read XF-raster metrics, and obtain clocks per vertex after GXDrawDone. GP selection preserves the low perfSel nibble used by GXSetVCacheMetric. GXInitXfRasMetric reprograms hardware also used by GP metrics without updating the cached GP selections; callers must not assume these configurations are independent. Display-list assertions are present in GP and memory reads/clears and pixel reads, but are not universal across this unit. Pixel clear emits two rasterizer commands and sets bpSent to 1; XF-raster initialization sets it to 0.

All 704 canonical and rendered lines were reviewed. The rendered view has no substitutions or parse errors and renders function names only. Existing function names fit the behavior; no rename is warranted. Two factual corrections are proposed. The four .data facts and its link remain unresolved because source switches do not prove emitted table contents, section extent, entry ordering, or alignment.

Status: synthesized; independent review and live promotion pending.
