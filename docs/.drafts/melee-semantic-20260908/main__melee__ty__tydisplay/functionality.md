## Collection display and shared trophy presentation

`tydisplay.c` implements Collection scene entry, trophy arrangement, camera control, debug inspection and exit handling. It also exposes a separate archive-cache/JObj construction API used by gameplay trophy items and shares display-entry/name lookups with the regular-ending trophy tableau.

### Arrangement pipeline
- The float sorter orders complete records by ascending second-word floating value; position helpers use it to order X/Z records by Z. The integer sorter orders complete trophy-ID/metadata records by descending signed value.
- The list producer inserts acquired trophy IDs at a randomized circular offset. Its oversized-count branch instead scans valid display entries and then samples additional valid IDs. The normal branch relies on the requested count matching acquisition state; it does not enforce a general output-capacity contract.
- Radial variants differ in spacing, jitter and ring-start angles, but both can undergo randomized inward contraction. Rectangular placement supports a short initial row and optional odd-row staggering. Triangular placement expands centered rows and optionally reverses and sorts depth.
- Arrangement helpers clear the whole grid, including the entry-selected numeric mode. Thus the later camera initializer's mode-specific branches must not be described as necessarily receiving the original selection.

### Scene and debug behavior
Entry allocates shared state, chooses localized room assets, preloads category archives, constructs environment objects and installs either the normal or debug camera process. Camera callbacks independently deadzone four axes, honor a cooldown and implement bounded angles, zoom and reset. Debug controls additionally edit in-memory X/Z display-entry coordinates, cycle trophies and request exit after the held-exit counter exceeds 120.

Camera/table fitting uses exact floating thresholds and integer-conversion guards, not a universal 3.2-degree minimum or an integral-only scale. Missing background resources are fatal. The missing-light-export/debug combination reaches a color operation without initializing the local light pointer.

Cleanup mostly clears retained references, removes camera processes and explicitly releases optional debug resources. It does not itself demonstrate freeing every scene allocation. Several cleanup guards are nested rather than independent.

### Shared resources and lifetimes
The Collection constructor uses `TyDspBgData.archives`; the auxiliary loader and JObj constructor use the distinct static `_tyDisplay_804A2DE8` cache. Shared preload setup clears cache slots 0 through 42 without freeing their former archives. Gameplay item construction remains present at `src/melee/it/kinds/itcoin.c`, despite stale baseline citations to an `items/` path.

Display-entry lookup prefers the US override table when applicable and returns the default sentinel on failure, not NULL. Name accessors normalize signed -1 to slot zero. Constructors and the cache loader do not equivalently normalize their raw archive indices, so this is not general invalid-category recovery. The matching-ID search tests capacity after writing a result.

### Semantic assessment
Supported existing names and explanations are explicitly retained in the checkpoint ledger. Corrections address actual branch behavior, numeric thresholds, cleanup dependencies, return semantics and source-versus-compiled layout evidence. All owned canonical/rendered pages, 64 subjects, 198 facts and 55 links were reviewed. Rendered names were treated as hypotheses. The renderer reports shadowed bindings for the internal trophy constructor and several pointer-returning header declarations; these are rendering issues, not reasons to discard supported names. Source comments and composite casts do not prove compiled section placement or adjacency.

Status: researched; no-change lead bypass; independent review and live promotion pending.
