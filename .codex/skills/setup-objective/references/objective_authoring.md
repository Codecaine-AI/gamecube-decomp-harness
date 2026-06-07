# Objective Authoring

Use this reference when writing `goal.md`, `context/*.md`, or the initial
working plan for a serious objective. The objective bundle is not a notes
folder. It is the durable operating context that future agents will execute.

## Authoring Standard

Write objective files as context-engineered instructions, not vague project
notes. Each section must answer what the agent should do, what input it should
use, what output it should produce, and how it knows the step is complete.

Borrow these principles from prompt engineering:

- use semantic pseudo-XML tags for structure;
- separate instructions, data, constraints, state, and examples;
- use imperative wording for actions and gates;
- make every section earn its token cost;
- include concrete output schemas when a file, CSV, report, or command result
  is expected;
- include failure handling so the agent does not silently accept weak evidence;
- use contrastive examples when the likely failure mode is generic work.

Do not copy the prompt skill's run model. Objective files are not prompt-run
artifacts. Use the prompt skill's discipline: clear structure, explicit inputs,
gates, and evaluation.

## Required Depth

For nontrivial objectives, every context file should be specific enough that a
fresh agent can start useful work without asking what "analyze", "validate",
"sweep", "audit", or "finish" means.

Avoid lazy placeholders:

- "Run tests"
- "Analyze results"
- "Try thresholds"
- "Write report"
- "Validate candidate"
- "Update state"

Replace them with executable guidance:

- exact commands or command families;
- datasets, shards, configs, caches, or artifacts to read;
- output files and required columns;
- decision gates and rejection criteria;
- candidate families and ablation rows;
- known risks and what to do when they appear;
- handoff updates and final report requirements.

## File Responsibilities

Keep `goal.md` short enough for `/goal`, but make it dense. Put depth in
`context/*.md`.

- `goal.md`: outcome, context-refresh path, working strategy, success metrics,
  non-goals, completion criteria.
- `current_state.md`: compact live state, durable decisions, next actions,
  risks, important paths.
- `context/00_problem.md`: why this objective exists, current baseline,
  failure modes, expected value, prior evidence.
- `context/01_constraints.md`: hard validity rules, forbidden shortcuts,
  production boundaries, data boundaries, promotion gates.
- `context/02_implementation_scope.md`: owned files, read-only references,
  allowed edits, risky adjacent surfaces, generated artifacts.
- `context/03_working_plan.md`: phase-gated execution plan with inputs,
  process, outputs, gates, artifacts, and failure handling.
- `context/04_validation_and_handoff.md`: validation ladder, acceptance gates,
  report requirements, state updates, promotion/handoff rules.

## Pseudo-XML Formatting

Use semantic tags and 4-space indentation inside tags. Markdown bullets are
allowed inside tags.

```xml
<working_plan>
    <overview>
        1. baseline_reproduction - Reproduce the current baseline and record
           metrics before changing behavior.
        2. matrix_design - Generate candidate rows with explicit families,
           features, thresholds, and risk postures.
    </overview>
</working_plan>
```

Prefer descriptive tags over generic tags. Use `<baseline_reproduction>`, not
`<step_1>`. Use `<promotion_gate>`, not `<notes>`.

## Working Plan Shape

`context/03_working_plan.md` should use this shape for substantial objectives:

```xml
<working_plan>
    <overview>
        1. [phase_name] - [one-line intent]
        2. [phase_name] - [one-line intent]
        3. [phase_name] - [one-line intent]
    </overview>

    <operating_principles>
        - [Non-negotiable principle that applies to all phases.]
        - [Priority rule for resolving speed, safety, score, or scope tradeoffs.]
    </operating_principles>

    <phase id="1" name="[phase_name]">
        <objective>
            - [Specific outcome for this phase.]
        </objective>
        <inputs>
            - [Files, artifacts, commands, datasets, or prior outputs.]
        </inputs>
        <process>
            - [Imperative action.]
            - [Imperative action.]
            - If [condition], [specific branch]. Otherwise, [specific branch].
        </process>
        <outputs>
            - `[artifact/path.ext]`: [required contents or columns].
        </outputs>
        <gate>
            - [Concrete condition required before moving to the next phase.]
        </gate>
        <failure_handling>
            - If [failure mode], [diagnose, narrow scope, or stop condition].
        </failure_handling>
    </phase>
</working_plan>
```

Every phase should be self-contained. The output of one phase should become an
input to a later phase. If a phase produces no artifact, no decision, and no
state update, remove it or merge it into another phase.

## Working Plan Required Blocks

For complex optimization or implementation objectives, include these blocks
when relevant:

- `<baseline_reproduction>`: exact baseline artifacts, commands, metrics, and
  mismatch handling.
- `<candidate_matrix_design>`: candidate families, feature columns, thresholds,
  ablations, unsafe anchors, near-misses, and config schema.
- `<proxy_sweep>`: cheap screening metrics, per-shard rows, aggregation logic,
  vectorization/chunking, and selection rules.
- `<frontier_selection>`: Pareto criteria, anchors, near-misses, family
  coverage, and rejection reasons.
- `<full_validation>`: validation shards, commands, result schema, by-ladder
  summaries, and promotion gates.
- `<diagnostics>`: residual examples, false-merge audits, cohort summaries,
  visual sheets, or stage-attribution ledgers.
- `<productionization>`: files to edit, config flags, mask equivalence checks,
  tests, and rollback boundaries.
- `<reporting>`: report sections, final tables, state updates, and next-route
  handoff.

## Context File Templates

Use these section patterns when replacing scaffold text.

```xml
<problem>
    <objective_question>
        - [The concrete question this objective must answer.]
    </objective_question>
    <current_baseline>
        - [Current behavior, metric, candidate, or known state.]
    </current_baseline>
    <failure_modes>
        - [Named failure mode]: [why it matters and how it appears].
    </failure_modes>
    <prior_evidence>
        - `[path]`: [decision-relevant summary].
    </prior_evidence>
    <expected_value>
        - [What improvement would justify the work.]
    </expected_value>
</problem>
```

```xml
<constraints>
    <hard_rules>
        - [Rule that cannot be violated.]
    </hard_rules>
    <forbidden_shortcuts>
        - [Shortcut] is invalid because [reason].
    </forbidden_shortcuts>
    <validity_gates>
        - [Gate]: [exact pass/fail condition].
    </validity_gates>
    <risk_budget>
        - [Metric or failure mode]: [allowed budget and escalation rule].
    </risk_budget>
</constraints>
```

```xml
<implementation_scope>
    <owned_surfaces>
        - `[path]`: [allowed edit or artifact responsibility].
    </owned_surfaces>
    <read_only_references>
        - `[path]`: [why it should be read but not changed].
    </read_only_references>
    <generated_outputs>
        - `[path]`: [contents and regeneration command].
    </generated_outputs>
    <out_of_scope>
        - `[path or behavior]`: [why it is excluded].
    </out_of_scope>
</implementation_scope>
```

```xml
<validation_and_handoff>
    <validation_ladder>
        - [Tier or command]: [purpose and required pass condition].
    </validation_ladder>
    <artifact_contract>
        - `[path]`: [required contents, columns, or summary fields].
    </artifact_contract>
    <acceptance_gates>
        - [Gate]: [exact condition required for completion or promotion].
    </acceptance_gates>
    <handoff_update>
        - Update `current_state.md` with [decisions, paths, risks, next
          actions].
    </handoff_update>
</validation_and_handoff>
```

## Anti-Lazy Checks

Before accepting an objective bundle, check it against these questions:

- Could a fresh agent execute the first phase without asking what to read?
- Does every phase have concrete inputs, outputs, and a gate?
- Are expected artifacts named, including required columns or fields?
- Are failure modes and invalid shortcuts explicit?
- Does the plan include decision logic, not only activity descriptions?
- Are validation gates objective enough to reject a tempting weak result?
- Does the bundle state what should happen if the best candidate is unsafe?
- Is the context curated, or did it accumulate unrelated history?

If the answer to any question is no, revise the context before starting work.

## Contrastive Example

Bad working-plan entry:

```xml
<working_plan>
    - Sweep thresholds and analyze results.
    - Validate the best one.
</working_plan>
```

Good working-plan entry:

```xml
<phase id="2" name="candidate_matrix_design">
    <objective>
        - Generate a deployable config matrix that tests endpoint rescue,
          low-agreement rescue, and repeated-pattern brake interactions.
    </objective>
    <inputs>
        - `artifacts/baseline_summary.json`
        - `artifacts/residual_ledger.csv`
        - Prior visual taxonomy in `artifacts/pattern_notes.md`
    </inputs>
    <process>
        - Create one baseline row, one unsafe high-recall anchor per family,
          conservative and high-recall threshold bands, one-factor ablations,
          and near-miss rows around the expected safety boundary.
        - Record every threshold, feature source, risk class, and selection
          reason in the matrix.
        - If a candidate needs truth labels or hand labels as inputs, mark it
          `diagnostic_only` and exclude it from production selection.
    </process>
    <outputs>
        - `artifacts/config_matrix.csv`: includes `config_id`, `family`,
          `search_pass`, `posture`, `feature_sources`, `risk_class`,
          `ablation_of`, `near_miss_reason`, thresholds, and gates.
    </outputs>
    <gate>
        - Matrix contains baseline, unsafe anchors, ablations, near-misses,
          and at least one production-shaped row for every active family.
    </gate>
    <failure_handling>
        - If required feature columns are missing, write
          `artifacts/missing_feature_audit.csv` and route the objective to
          feature plumbing before running proxy sweeps.
    </failure_handling>
</phase>
```

## Authoring Rubric

Evaluate objective context before using it:

- Structural precision: semantic pseudo-XML, clear hierarchy, no wall of text.
- Execution value: phases include inputs, process, outputs, gates, and failure
  handling.
- Context quality: only relevant prior evidence is included, with paths.
- Decision quality: gates, risk budgets, rejection criteria, and promotion
  routes are concrete.
- Handoff value: artifacts and `current_state.md` updates let another agent
  reproduce the decision.

Do not start a serious objective from context that fails any of these areas.
