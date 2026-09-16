## Home-Run Contest distance and result presentation

This translation unit owns the runtime record table, attempt/result control fields, distance-history words, model descriptors and presentation callbacks for Home-Run Contest. All 374 canonical and rendered lines, all 19 subjects, all 56 facts and all 17 links were reviewed. The checkpoint explicitly retains 53 facts and 17 links and supersedes three facts.

### Setup and lifetime

`gm_80181A00` stores the configured contestant's character kind and nametag unchanged. `gm_80180B18` makes 27 character-kind iterations, maps each through `gm_CKindToSelKind`, and imports persistent records using unsigned division by ten. `gm_80181998` loads `IfHrNoCn` and `IfHrReco`, requesting `ScInfCnt_scene_models` into separate descriptor slots, then calls `fn_80181708`. Both archive results overwrite the same archive-pointer variable. The initializer resets transient flags, timers and four distance/history words, but preserves the contestant fields and imported records. It registers a parameterless result controller through a callback cast and creates two animated model GObjs: initially hidden No Contest at frame 0 and visible distance/record presentation at frame 10 with selected child visibility adjustments. [Canonical setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_180A.c#L303-L373).

The descriptor consumers perform no local null checks. No archive release or scene teardown appears here; overwriting the archive handle alone establishes neither a leak nor safe reclamation. Source overlay casts treating the state and subsequent distance words as one aggregate do not prove compiled adjacency or section layout.

### Measurement and presentation

`gm_80180AF4` directly returns `Player_GetEntity(1)`. Canonical Home-Run stage code independently identifies this object as Sandbag, checks availability before reading its position, and uses the same getter for collision identity. `gm_80180AE4` returns the current runtime distance multiplied by ten, not the high-water value.

`fn_80180C60` computes `(s32)(0.1f * Ground_801C57F0(0))`, clamps negative results to zero and stores the current distance. Its phase logic distinguishes `b76`, `b54`, `b32` and the two-bit `b10`; they are not interchangeable boolean completion flags. The stability tests are strictly greater than 60 or 120, and the two branches have different conditions for setting `b10`. The Ground signal is examined only in the outer else branch. Before readiness the root requests frame 0; after readiness a nonzero `b10` hides it, otherwise a surpassed character record enables one-shot audio/feedback and reveals the record child. Feedback reads the live `Player_GetNametagSlotID(0)`, not the saved `unk_8`.

US-language display divides the runtime integer by `0.304788`; the displayed integer is capped at 99,999. Ones and tens always receive decimal frames, while absent hundreds, thousands and ten-thousands request frame 10. The root then animates, previous distance is updated, and a current value strictly more than ten above the retained high-water value updates that value and emits progress audio. The display cap does not clamp the stored measurement or getter. [Complete distance callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_180A.c#L89-L244).

`fn_80180C14` reveals and animates the No Contest hierarchy whenever `b10` is nonzero; it neither resets the mode nor hides the hierarchy again. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_180A.c#L79-L87).

### Dismissal and record synchronization

`fn_80181598` returns immediately while `gm_801A4624()` is nonzero. Otherwise its nonzero-mode branch transitions mode 1 to 2 after two sounds and advances an auxiliary dismissal timer. A-button dismissal requires a counter strictly greater than 60; timeout occurs at 240. Its termination call is followed by an immediate return. Only if that return was not taken can the subsequent ready-result branch process mode 0 or 3, advance its separate timer, conditionally increase the selected runtime record and request termination. Mode 3 therefore participates in both ordered paths; the first can prevent the record update. No local assignment establishes mode 3. [Result controller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_180A.c#L246-L301).

`gm_80180BA0` unconditionally exports the mapped runtime records at ten times their stored value. The external Home-Run exit callback invokes this before checking `OUTCOME_RETRY`; non-retry handling separately uses the distance getter and the `gmMainLib_8015D084` best-record table for comparison and reward processing. That table is distinct from the `gmMainLib_8015D06C` persistent fields used by this TU's import/export loops. Save-backed memory synchronization is not evidence of immediate memory-card I/O. [Exit ordering](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmhomerun.c#L149-L166), [distinct accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain_lib.c#L333-L341).

### Evidence limitations

Both rendered pages reported nine parse errors and zero substitutions. Suggested names were treated as hypotheses, not proof. Physical distance interpretations apply to normal representable gameplay values; the source does not establish safety for arbitrary floating-point inputs or signed overflow. The 27-iteration loops do not independently prove 27 distinct mapped identities. No compiled section or layout claims are made.

Status: synthesized; independent review and live promotion pending.
