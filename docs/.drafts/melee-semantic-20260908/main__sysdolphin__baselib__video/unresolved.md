# Video Unresolved Items

The exact external caller described by HSD_VIWaitXFBFlushNoYield's game_mapping fact was not independently read. Its fact ID and baseline timestamp are preserved in coverage.json. Local polling behavior is verified.

External registration of HSD_VIDrawDoneXFB and production of single-buffer EFB DRAWDONE state remain family dependencies. This packet establishes the required local transitions without claiming those consumers were exhausted. HSD_VIGXDrawDone is declared in the owned header but has no definition in the owned source; no identity migration is proposed.

Existing split/source objects support storage observations but were not rebuilt. Promotion must keep that limitation and must not turn these observations into current source-object equivalence claims.

The rejected .sdata counter link remains archived with its exact baseline record. No link was deleted or reclassified in the shared KB.
