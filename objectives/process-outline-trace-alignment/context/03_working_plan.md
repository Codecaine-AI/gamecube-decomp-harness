<working_plan>
    <overview>
        1. P0 interview_and_process_inventory, in progress.
        2. P1 naming_convention_decision_and_application.
        3. P2 trace_emission_fixes.
        4. P3 outline_rebuild_to_fidelity_standard.
        5. P4 trace_walkthrough_verification.
        6. P5 doctrine_update.
    </overview>

    <operating_principles>
        - Treat the trace as execution evidence, not an automatic naming authority. Round 2 chooses the vocabulary.
        - Model one global harness flow with workflows and lifecycles as subprocesses.
        - Fix trace-emission and labeling bugs inline. Severity-rank behavior bugs and defer their fixes.
        - Update `context/05_process_map.md` after each interview round and phase gate.
    </operating_principles>

    <phase id="P0" name="interview_and_process_inventory" status="in_progress">
        <objective>
            - Settle the remaining design choices and map every documented process to runtime and trace evidence.
        </objective>
        <inputs>
            - Ford's 2026-08-20 decisions, all 49 outlines, runtime entry points, bridge trace files, and `runRunLoop`.
        </inputs>
        <process>
            - Finish Round 2 on naming, global-flow structure, granularity, misuse conversion, and doctrine ownership.
            - Record each process's trigger, entry point, outline, container lineage, and verification state.
            - Classify true processes, seven `*-sequence` blocks, the score-gate conversion, and unnamed migration-map roots.
            - Separate trace defects from behavior bugs and assign severity.
        </process>
        <outputs>
            - `context/05_process_map.md` with dated decisions, complete inventory, naming candidates, and bug catalog.
        </outputs>
        <gate>
            - Every Round 2 question is answered and every outline site has a runtime owner or explicit conversion disposition.
        </gate>
        <failure_handling>
            - Trace ambiguous owners to the first runtime entry point. Keep P0 open if the answer changes naming or structure.
        </failure_handling>
    </phase>

    <phase id="P1" name="naming_convention_decision_and_application">
        <objective>
            - Apply one operator-facing vocabulary to docs, traces, UI labels, and tests.
        </objective>
        <inputs>
            - P0 naming decisions and every drift site for cycle/session, reconcile, lifecycle phases, and PR containers.
        </inputs>
        <process>
            - Record winners, meanings, affected paths, permitted internal aliases, and migration state.
            - Stabilize trace descriptions and UI labels, then apply the same proper names to outlines and tests.
            - Search old terms and classify each remainder as compatibility, deferred behavior work, or missed migration.
        </process>
        <outputs>
            - A decided naming table plus aligned docs, server, frontend, and focused tests.
        </outputs>
        <gate>
            - No operator-facing term is undecided and every retained old identifier has a recorded reason.
        </gate>
        <failure_handling>
            - If a rename affects persistence or protocol semantics, retain the identifier and normalize only its displayed label.
        </failure_handling>
    </phase>

    <phase id="P2" name="trace_emission_fixes">
        <objective>
            - Make every documented process visible as a real hierarchy of containers and named event rows.
        </objective>
        <inputs>
            - P0 inventory, P1 names, bridge mapping and emission code, `spawn-agent.ts`, frontend trace code, and Observatory as a read-only reference.
        </inputs>
        <process>
            - Pass containers to frontend `buildTraceSpans` and test nested rendering.
            - Cover `pr-qa`, `pr-handoff`, and other defaulted kinds in `describeMeleeContainer` with correct labels and parents.
            - Emit missing containers and lineage for uncovered processes, including phase and knowledge-lane gaps.
            - Keep workflow operations such as `prepare.calculateBaseline` under the correct containers without changing behavior.
        </process>
        <outputs>
            - Server and frontend hierarchy fixes, regression tests, and updated coverage state in the process map.
        </outputs>
        <gate>
            - Each documentable process has a named trace path and the harness UI renders its hierarchy.
        </gate>
        <failure_handling>
            - If instrumentation would change runtime behavior, catalog the dependency and keep that process unverified.
        </failure_handling>
    </phase>

    <phase id="P3" name="outline_rebuild_to_fidelity_standard">
        <objective>
            - Rebuild every outline so order, nesting, names, branches, and terminal paths match stable traces.
        </objective>
        <inputs>
            - P1 vocabulary, P2 hierarchy, all `doc.json` block graphs, and the canonical lifecycle, Run Loop, Worker, and Sync outlines.
        </inputs>
        <process>
            - Define the global-flow outline and its subprocess documentation structure.
            - Rewrite true outlines with trace-visible nesting and short explanations; use notes only as leaves.
            - Add Run Loop shutdown and drain from `run-loop.ts:1477-1510`.
            - Convert the seven tracing sequences and repair the score-gate and migration-map misuse according to Round 2.
            - Parse the corpus and reject missing text, invalid kinds, notes with children, and template text.
        </process>
        <outputs>
            - Valid, faithful `docs/**/doc.json` graphs and recorded conversion decisions.
        </outputs>
        <gate>
            - All 49 original sites have valid concrete treatment and every real outline follows the stable trace hierarchy.
        </gate>
        <failure_handling>
            - Route missing runtime evidence back to P2. Do not invent outline steps.
        </failure_handling>
    </phase>

    <phase id="P4" name="trace_walkthrough_verification">
        <objective>
            - Prove that an operator can follow every outline against a real trace.
        </objective>
        <inputs>
            - P3 docs, real traces, the harness UI, Observatory, and the verification contract in `04_validation_and_handoff.md`.
        </inputs>
        <process>
            - Trigger or select a real trace for each process and record its identity and viewer.
            - Check names, order, nesting, operations, branches, completion, shutdown, and drain paths.
            - Mark only fully supported rows confirmed. Route trace gaps to P2 and docs gaps to P3, then repeat.
        </process>
        <outputs>
            - A completed verification ledger in `context/05_process_map.md` with reproducible evidence or exact mismatches.
        </outputs>
        <gate>
            - Every process row is confirmed from a real trace; none is inferred from source or tests alone.
        </gate>
        <failure_handling>
            - If no real trace can be produced, record the trigger and missing evidence and keep the row unconfirmed.
        </failure_handling>
    </phase>

    <phase id="P5" name="doctrine_update">
        <objective>
            - Record the tested convention so future docs and trace changes stay aligned.
        </objective>
        <inputs>
            - Final decisions, verification results, harness `docs-structure.md`, and the Core docs-system Process Outline vocabulary page.
        </inputs>
        <process>
            - Update harness doctrine with schema, note-leaf invariant, global hierarchy, proper-name fidelity, trace emission, and walkthrough rules.
            - Update `Core/docs-system/docs/10-system-design/40-block-vocabulary/90-process-outline` with the matching vocabulary doctrine.
            - Run docs validation and finalize the process map and current state.
        </process>
        <outputs>
            - Updated harness and Core doctrine plus final objective state and deferred behavior-bug handoffs.
        </outputs>
        <gate>
            - Both doctrine locations state the final convention and all completion and validation gates pass.
        </gate>
        <failure_handling>
            - If the peer repo is unavailable, preserve the exact target and paste-ready doctrine change as the sole cross-repo follow-on.
        </failure_handling>
    </phase>
</working_plan>
