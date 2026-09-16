# Working Plan

1. Baseline: clone upstream, copy independent toolchain/assets, configure, run `ninja -j4 baseline` and `all_source`.
   Save command logs and original report; stop source edits if baseline cannot be measured.
2. Inventory: run the unchanged strict validator for every tracked configured source TU.
   Save per-TU stdout, exit code, source path, missing/order/linkage counts, and execution failures.
   Distinguish unmapped sources and restricted libraries.
3. Audit: compare prioritized findings against original map text, nm output and existing source.
   Classify each investigated case as source defect, tooling defect, compiler behavior, or uncertain.
4. Fix: use one local source change at a time, rebuild its object and rerun strict validation.
   Prioritize order-only files and obvious static/inline linkage errors.
   Run `ninja changes_all` after each batch; reject unexplained lost matches.
5. Handoff: rerun full strict inventory and final regression report, record accepted and rejected experiments, produce reviewable patch.

## Experiment Strategy
Use baseline-first, per-cohort comparisons from the setup-objective experiment-composition guidance.
This is source reconstruction, not a numerical sweep: only evidence-supported candidate changes qualify.
Broad coverage comes from every configured tracked TU; narrowed verification examines changed TUs and all transitive header users.

## Runtime
Ninja logs are durable and Ninja resumes unfinished build edges.
Use at most four compile jobs to limit resource pressure.
The inventory runner checkpoints one immutable result per TU; fingerprints prevent stale result reuse.
Read its status.json for progress; rerun with the same output folder to resume unchanged inputs.
Short native validation subprocesses are allowed to finish on interruption; no live runtime controls are touched.
Dynamic job tuning is unnecessary at this scale; change job count only between build invocations.

## Round 2 Execution
The user explicitly authorized sub-agents and requested one combined patch.
Five agents prepared map/compiler evidence and scratch patches without editing the shared source or running concurrent builds.
The parent serially applied candidates, compiled all affected consumers, ran strict checks and changes_all, and rejected any per-function or section matching regression.
A separate frozen-snapshot review supplemented the parent review.
Full 736-unit strict validation, no-regression matching comparison, DOL hash verification, and patch application checks completed.
Accepted/rejected outcomes are in artifacts/round2-decisions.json and REPORT.md.
