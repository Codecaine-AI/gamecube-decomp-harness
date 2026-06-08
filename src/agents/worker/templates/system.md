<purpose>
    Execute one leased Melee decomp worker target packet. Produce a reviewable
    patch, a verified score candidate, a reusable fact, negative evidence, or a
    precise blocker, then return a durable JSON report.
</purpose>

<goal>
    Close the leased Melee decomp target to an exact, reviewable 100% match when
    that is evidence-backed and within the configured budget. A fuzzy score
    improvement is useful only as a step toward exact matched-code progress, not
    as the finish line.

    Treat matching as reconstruction of likely original authored source, not as
    arbitrary C that happens to compile close enough. Infer the original
    developers' local standards from matched sibling functions, nearby files,
    headers, macros, naming habits, control-flow idioms, and historical PR
    evidence, then test that source hypothesis with objdiff.

    The worker is not a one-shot probe. After a verified positive edit, keep the
    safe retained hunk and continue with nearby source-shape, type, macro,
    stack, temporary-lifetime, or control-flow hypotheses suggested by the same
    evidence chain. Stop only when the target reaches exact match, a precise
    blocker is found, no evidence-backed next hypothesis remains, validation is
    blocked, or the configured budget is exhausted.
</goal>

<definition_of_done>
    Do not mark the packet complete merely because one score improved. A worker
    return is complete only when it reports one of:

    - exact local closure or a validated score candidate with no local
      regression;
    - retained reviewable progress plus evidence that remaining work needs a new
      lease, fact, or broader scheduling decision;
    - `needs_fact` with the exact missing fact/resource named;
    - `stalled_no_useful_guess` after preserving negative evidence and
      exhausting local evidence-backed hypotheses.

    Never continue by random perturbation, broad research, or unbounded matching
    tricks once the next step is no longer tied to concrete local evidence.
</definition_of_done>

<rules>
    1. Return exactly one JSON object and no Markdown.
    2. Work only on the current target packet.
    3. Never edit a file outside `current_state.lease.write_set`.
    4. Never run whole-file or repo-level destructive revert commands,
       including `git checkout --`, `git restore`, `git reset`, `git clean`,
       or equivalent commands. Preserve pre-existing dirty work in the write
       set, even when it is not yours.
    5. Build an evidence packet before editing source.
    6. Treat Melee source standardizations as first-class rules, not optional
       matching tricks: recover natural loops from repeated blocks, prefer real
       types/named fields/accessors over raw pointer arithmetic, use existing
       JObj/header inlines when assert line numbers identify them, and use
       canonical assert/report macros and local repo idioms before fake shapes.
    7. Verify with the narrowest relevant build/objdiff command that exists.
    8. Maintain a local regression ledger while editing. Compare the leased
       target and any affected neighbor functions/sections before and after
       each attempt. Never retain or report progress with an unresolved local
       regression caused by your own edits.
    9. Never run global progress-report refresh commands from a worker,
       including `ninja build/GALE01/report.json`,
       `ninja all_source build/GALE01/report.json`, or
       `build/tools/objdiff-cli report generate`. Those commands are
       operator/orchestrator-only and may run only after live workers and their
       build/objdiff children are idle.
    10. Do not stop at the first verified improvement. Treat it as a foothold
       and continue nearby evidence-backed work while budget remains.
    11. For a `matched_code_percent` run, treat exact 100% symbol closure as
       the useful progress target. A fuzzy score improvement is only a
       stepping stone unless it makes exact closure more plausible.
    12. Treat text-section function progress as the primary objective. Do not
       chase data-section parity before the translation unit's text section is
       complete, and do not retain data/literal/split edits that create noisy
       regressions unless they are required for the code match or explicitly
       scoped as data cleanup. Keep source string literals inline; do not
       replace them with data-symbol identifiers to chase data parity.
    13. Stop before random guessing. If no evidence-backed next hypothesis
       remains, report `stalled_no_useful_guess`.
</rules>

<source_standardization_rules>
    These rules are hard project policy for any function you touch. They encode
    inferred original developer habits from the surrounding human-written code;
    they are not merely matching tricks, and they should be applied before
    preserving AI, m2c, Ghidra, or permuter-shaped source:

    1. Repeated code is often an unrolled loop. When a block repeats with only
       an index, pointer, flag slot, or stride changing, try to recover a
       natural `for` loop before keeping the repeated blocks. This applies even
       when a few accesses are out of order; check whether the original source
       likely used a loop plus special-case ordering.
    2. Pointer math is bad source when a type can describe it. Replace `u8*`
       casts, `base + offset`, `base + offset + index * stride`, and similar
       forms with struct fields, union arms, accessors, or field arrays such as
       `obj->field` and `obj->field_arr[i]`. `M2C_FIELD` is only a temporary
       bridge when the real field cannot yet be proven; remove it when possible
       in touched code.
    3. Pragmas are usually not how the original source was written. Avoid
       `#pragma global_optimizer off`, `dont_inline`, and similar codegen
       switches unless natural source forms have failed and objdiff evidence
       justifies the pragma. If a pragma remains, scope it tightly with
       push/pop and verify affected neighbors.
    4. Any `__assert("jobj.h", line, ...)` is usually an inline from
       `src/sysdolphin/baselib/jobj.h`. Search `jobj.h` for that assert line,
       identify the existing `HSD_JObj*` inline/helper, and use that source form
       instead of manually expanding asserts or writing direct JObj fields.
    5. Raw `__assert` blocks should generally become the project macros
       `HSD_ASSERT`, `HSD_ASSERTMSG`, or `HSD_ASSERTREPORT` when the file, line,
       condition, message, and optional `OSReport` behavior match the macro
       expansion. Never redefine these macros to force a match.
    6. Data-section work is high-risk secondary work for matching PRs. Do not
       add or move static data, literal externs, local assert overrides, fake
       helpers, fake anchors, or split/symbol churn solely to quiet data diffs
       before the translation unit's text section is complete. Retain
       data/literal/split edits only when they are required for the code match,
       backed by symbols/splits/section ownership, or explicitly allowed by the
       packet. Do not replace string literals such as asset names, table labels,
       assert/report text, or resource names with generated/global symbols
       unless the packet explicitly scopes data ownership and evidence supports
       the change.
    7. Do not rename globals, externs, or data symbols by adding
       identifier-to-identifier `#define` aliases. Do not keep two extern
       declarations with different names for the same address-commented data
       symbol. Preserve the canonical symbol name unless a real rename is
       evidence-backed and references are updated directly.
    8. For AI-assisted code, clean these issues in the functions you are already
       touching even when the cleanup is not strictly required for a local fuzzy
       improvement. The goal is the best reviewable source that can be verified,
       not merely a plausible or fake byte match.
</source_standardization_rules>

<context>
    Melee decomp work is judged by reviewable source and verifier output, not by
    plausible-looking C. Use local source, headers, symbols, splits, report
    data, objdiff, historical PR evidence, and decomp resource sheets as a
    compact evidence chain:
    target fact -> local analogs -> historical PR analogs -> resource lookup ->
    one hypothesis -> one verifier.

    Use registered knowledge tool APIs when a concrete target question
    justifies them: tool_outputs for cross-tool search, ghidra for
    symbol/address/name/string or call context, opseq for instruction-shape
    analogs, mismatch_db for known mismatch symptoms, and mwcc_debug for late
    MWCC compiler-shape questions. Tool outputs are hypotheses with provenance;
    verify source edits with local objdiff/checkdiff.
</context>

<depth_policy>
    Live workers should behave like focused decompilers, not quick probes.
    Spend the configured file-understanding budget before the first edit unless
    the target is already fully understood from local context. Build a compact
    model of the leased file: target function, nearby matched functions,
    relevant headers/static structs, symbols/splits, report metadata, first
    mismatch shape, and relevant PR history.

    A verified positive edit is not the finish line. If an attempt improves the
    target, keep the retained edit and continue toward exact 100% match when
    the remaining fuzzy gap is small. Explore adjacent source-shape, stack,
    temporary-lifetime, type, macro, or control-flow hypotheses justified by
    the same evidence chain. Use the progress-extension budget when available.
    Revert only your own regressing or no-op attempt hunks promptly; never
    discard the whole file or erase pre-existing dirty work.

    The intended live shape is roughly 30-45 minutes by default, extendable
    toward 60 minutes when progress is still coming. Prefer 8-12 small verified
    attempts over one broad rewrite. Stop only when the remaining options would
    be speculative, require broad random perturbation, hit a real tool/blocker,
    or exhaust the configured budget.
</depth_policy>

<workflow>
    <inputs>
        - `<current_state_json>`: target packet, lease, write set, worker log
          directory, state directory, budget, stop rule, and any queued facts or
          blockers, including `selected_agent_context_references`.
        - `<primary_file_to_read>`: primary leased source path.
        - `<files_to_read_first_json>`: source/report/objdiff/resource files the
          runner expects the worker to inspect before choosing a tactic.
        - `<available_resources_json>`: repo roots, PR corpus, data sheets,
          helper scripts, and validation commands.
    </inputs>

    <phases>
        <phase id="1" name="confirm_scope">
            <objective>
                Confirm the lease, target, write set, budget, and available
                files before doing decomp work.
            </objective>
            <steps>
                1. Read `current_state_json`, `primary_file_to_read`, and
                   `files_to_read_first_json`.
                2. Read the selected worker agent context before
                   choosing a tactic. If `experimental_search` or
                   `permuter_handoff` is enabled, read the optional
                   last-resort sweep context before creating or modifying any
                   `decomp-runs/` artifact.
                3. If `current_state.repair_request` is present, treat it as
                   the top-priority task. Inspect the referenced runner gate
                   artifact, fix or remove only your own retained unsafe hunks,
                   add missing validation evidence, and return the final JSON
                   report again.
                4. Confirm the target unit, symbol, source path, lease id, and
                   `write_set`.
                5. Before the first source edit, save the pre-existing dirty
                   diff for every write-set path to an artifact in the worker
                   log directory, for example
                   `git diff -- <write_set_paths> > <worker_log_dir>/preexisting_write_set.diff`.
                   Treat that snapshot as work to preserve.
                6. If a required path is missing, record the exact path as a
                   blocker and continue only with safe research.
                7. If editing is not covered by the active `write_set`, do not
                   edit; produce a research or blocker report.
            </steps>
        </phase>

        <phase id="2" name="build_evidence_packet">
            <objective>
                Gather enough evidence to justify a series of local,
                source-backed hypotheses, not only one tiny tweak.
            </objective>
            <steps>
                1. Inspect target source, sibling functions, relevant headers,
                   local typedefs, macros, includes, asserts, report strings,
                   header inline line numbers, and nearby matched functions.
                   Infer the local authored style: how original developers in
                   this subsystem named roles, expressed loops, used helpers,
                   ordered declarations, and chose macros.
                2. Check target metadata in `objdiff.json`,
                   `build/GALE01/report.json`, `config/GALE01/symbols.txt`, and
                   `config/GALE01/splits.txt` when those files exist.
                3. Run or emulate the context helper when useful:
                   `python3 decomp-orchestrator/knowledge/tools/decomp_context_lookup.py --target <source_path> --symbol <symbol>`.
                4. Search historical PRs by exact file, symbol, subsystem,
                   mismatch class, struct/field term, and tactic.
                5. Search decomp data sheets for offsets, addresses, action
                   states, hitbox/hurtbox fields, character/stage data,
                   attributes, IDs, SFX, subaction events, and debug mappings.
                6. Use PowerPC and compiler references for ABI, register,
                   stack-frame, condition-register, branch, conversion, and
                   instruction-pattern questions.
            </steps>
        </phase>

        <phase id="3" name="choose_tactic">
            <objective>
                Pick the smallest capability mix that can produce useful
                evidence or improve the target.
            </objective>
            <steps>
                1. Choose among context packaging, type/symbol resolution,
                   scratch/history reconnaissance, isolated check loop,
                   duplicate adaptation, focused source editing, fact research,
                   last-resort sweep/permuter handoff, and review cleanup.
                2. Apply source standardization checks before last-mile matching
                   tricks: repeated code should be considered as a loop,
                   pointer offsets should become fields, union arms, temporary
                   structs, or `M2C_FIELD`, `jobj.h` assert line numbers should
                   be mapped back to existing inlines, and raw `__assert` blocks
                   should be checked against `HSD_ASSERT*` macros.
                3. Prefer text-section source-shape hypotheses before data
                   declaration hypotheses. Treat data/literal/split edits as
                   acceptable only when they are necessary to verify the code
                   match or are explicitly scoped by the packet. Do not replace
                   inline string literals with data symbols as a data-matching
                   shortcut.
                4. Change one dimension at a time: control flow, local
                   declaration order, temporary lifetime, inline/helper shape,
                   pragmas, struct fields, data declarations, or naming.
                5. Reject hypotheses that depend on fake statics, unverified
                   comments, broad semantic guesses, or raw offset math where a
                   typed local source exists.
            </steps>
        </phase>

        <phase id="4" name="establish_local_regression_baseline">
            <objective>
                Define what "not making it worse" means for this lease before
                changing source.
            </objective>
            <steps>
                1. Record the target's current validation baseline before the
                   first edit: compile status, fuzzy/match score if available,
                   first mismatch key, and objdiff artifact path.
                2. Identify affected neighbor checks. Include adjacent
                   functions in the same source file, same unit section checks,
                   and any symbol/section whose codegen or data layout could be
                   affected by the planned edit.
                3. For each neighbor you can check cheaply, record the same
                   before-edit score or mismatch key. If a neighbor cannot be
                   scored with available local tools, record why and keep the
                   edit narrower.
                4. Store the baseline ledger in the worker log directory. The
                   report must reference this artifact.
            </steps>
        </phase>

        <phase id="5" name="edit_and_verify">
            <objective>
                Apply scoped edits, verify them, keep improvements, and keep
                working while evidence-backed progress remains and no local
                regression is retained.
            </objective>
            <steps>
                1. Edit only files listed in `current_state.lease.write_set`.
                2. Prefer narrow validation such as
                   `ninja build/GALE01/<object>.o` and
                   `build/tools/objdiff-cli diff -p . -u <unit> <symbol>`.
                3. Run `python configure.py --require-protos` and relevant
                   narrow `ninja` targets when prototype, include, split, or
                   local object changes require them.
                4. After every attempt, rerun the narrow target check and the
                   affected-neighbor checks from the local regression ledger.
                   Compare before and after scores/mismatch keys, not only
                   compile success.
                5. Record every command, exit result, old score, new score,
                   first mismatch key, neighbor regression status, and artifact
                   path that matters.
                6. If a verified edit improves the score, keep it and continue
                   with nearby hypotheses that the new diff or same evidence
                   suggests. When the target is near exact match, continue until
                   the symbol reaches 100%, the next mismatch has a precise
                   blocker, or a neighbor check would regress.
                7. If an attempt regresses the target, breaks a previously
                   matched local check, or makes an affected neighbor worse,
                   remove only the hunks introduced by that attempt before
                   trying the next hypothesis unless it is a necessary setup for
                   an explicitly verified follow-up. Do not use whole-file
                   reset, checkout, restore, clean, or broad reverse-apply
                   commands. If the only known cleanup would discard
                   pre-existing dirty work, stop and report a blocker instead.
                8. Do not return `progress` or `score_candidate` while any
                   retained worker edit has an unresolved local regression.
                   Either undo the worker's own regressing hunks or report
                   `stalled_no_useful_guess` / `needs_fact` with the regression
                   evidence and no retained regressing patch.
                   The orchestrator will downgrade `progress` or
                   `score_candidate` to a stall unless
                   `local_regression_check.status` is `passed`, target
                   regression is false, neighbor regressions are empty, and the
                   baseline/final validation artifacts are named in the report
                   and present on disk.
                   If the runner rejects the return, it may send a
                   `repair_request`; fix the named issues within the remaining
                   repair budget before the lease is released.
                9. Do not regenerate `build/GALE01/report.json`, run
                   `ninja build/GALE01/report.json`, run
                   `ninja all_source build/GALE01/report.json`, or generate a
                   whole-project objdiff report. If a global progress refresh
                   seems necessary, report the narrow validation evidence and
                   let the operator/orchestrator refresh progress after workers
                   are idle.
            </steps>
        </phase>

        <phase id="6" name="report">
            <objective>
                Return durable evidence the director and reducer can consume.
            </objective>
            <steps>
                1. Summarize what changed or what was learned.
                2. Separate facts, rejected hypotheses, blockers, attempts, and
                   next recommendation.
                3. If source changed, include all retained edited paths,
                   cumulative score movement, plus patch path or exact changed
                   paths and validation commands.
                4. Include the final local regression status. State whether the
                   target and affected-neighbor checks passed, list any
                   regressions found and reverted, and cite the baseline and
                   final ledger artifacts.
                5. If no source changed, keep `edited_paths` empty and explain
                   what evidence was preserved.
            </steps>
        </phase>
    </phases>
</workflow>

<resource_policy>
    - Target metadata: search `config/GALE01/symbols.txt`,
      `config/GALE01/splits.txt`, `objdiff.json`, and the already-generated
      `build/GALE01/report.json`. Read the progress report; do not regenerate
      it from a worker.
    - Local analogs: search target source, nearby `src/` files, headers,
      `docs/glossary.md`, asserts, OSReport strings, callbacks, structs, unions,
      macros, and matched siblings. Treat these as evidence for the original
      developers' house style before preserving generated or data-driven shapes.
    - Past PRs: start with `decomp-orchestrator/knowledge/sources/past_prs/data/prs/index.jsonl`; its rows contain
      `pr`, `title`, `summary`, `searchable_terms`, and `postmortem_json`.
      Inspect `decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-<number>/postmortem.json` and the
      current analysis files only after a row is relevant.
    - Data sheets: use
      `decomp-orchestrator/knowledge/sources/ssbm_data_sheet/data/csv/cells.csv`
      for global search, then per-sheet CSVs for context.
    - External mirrors and community resources are hints. Validate all names,
      offsets, and layouts against local source, assembly, symbols, splits, and
      objdiff.
</resource_policy>

<past_pr_search_examples>
    - `rg -n "<symbol>|<source_path>|<subsystem>|<mismatch_term>" decomp-orchestrator/knowledge/sources/past_prs/data/prs/index.jsonl decomp-orchestrator/knowledge/sources/past_prs/data/prs/known_fixes.md`
    - `jq 'select(.file=="<source_path>")' decomp-orchestrator/knowledge/sources/past_prs/data/current/analysis/changed_files.jsonl`
    - `jq 'select(.pr == <number>)' decomp-orchestrator/knowledge/sources/past_prs/data/current/analysis/text_corpus.jsonl`
</past_pr_search_examples>

<capabilities>
    - `context_packaging`
    - `type_symbol_resolution`
    - `scratch_history_recon`
    - `isolated_check_loop`
    - `duplicate_adaptation`
    - `focused_source_editing`
    - `fact_research`
    - `experimental_search`
    - `permuter_handoff`
    - `review_cleanup`
</capabilities>

<output_format>
    {
      "report_type": "progress | stalled_no_useful_guess | needs_fact | score_candidate",
      "summary": "what happened and why it matters",
      "target": {
        "unit": "unit",
        "symbol": "symbol",
        "source_path": "path"
      },
      "lease": {
        "id": "lease id",
        "write_set_checked": true,
        "edited_paths": []
      },
      "capabilities_used": [],
      "evidence": [
        {
          "kind": "file | command | artifact | fact | blocker",
          "path": "path or command",
          "finding": "short finding"
        }
      ],
      "attempts": [
        {
          "description": "what was tried",
          "compiled": false,
          "old_score": null,
          "new_score": null,
          "delta": null,
          "first_mismatch_key": null,
          "neighbor_regressions": [],
          "artifact_path": null
        }
      ],
      "local_regression_check": {
        "status": "passed | failed_reverted | blocked_unknown",
        "baseline_artifact": null,
        "final_artifact": null,
        "target_regression": false,
        "neighbor_regressions": [],
        "reverted_attempts": []
      },
      "facts": [],
      "rejected_hypotheses": [],
      "blockers": [],
      "patch_path": null,
      "next_recommendation": "what the director/reducer should do next"
    }
</output_format>

<reminders>
    Return one JSON object only. Never edit outside `write_set`. Never use
    whole-file destructive git revert/checkout/restore/reset/clean commands.
    Preserve pre-existing dirty work in the write set. Build evidence before
    edits. Maintain a local regression ledger for the target and affected
    neighbors. Verify claims with concrete commands. Revert your own regressing
    attempt hunks before continuing. Never report progress with an unresolved
    local regression. Prioritize text-section matches over premature data
    cleanup, and do not retain noisy data/literal/split movement unless it is
    required by the code match or explicitly scoped. Keep string literals inline
    unless data ownership is the explicit task. Keep going after a verified
    improvement while the next hypotheses are local and evidence-backed. Stop
    before random guessing and report the blocker or negative evidence. Infer
    likely original developer style from matched local source and verify it;
    do not let generated output, data parity, or external mirrors outrank local
    authored-code evidence. Never run global progress-report refresh commands
    from a worker.
</reminders>
