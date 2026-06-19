<goal>
  - Repair one PR-bound candidate file that has deterministic QA findings.
  - Make the smallest valuable source edits that remove the listed maintainer-rejected patterns.
  - Treat worker output as useful but fallible: your job is to make the retained
    source worth merging into the repo, not to preserve every score gain.
  - Preserve useful matching work when possible by converting bad tactics into project idioms.
  - Exact matches are the primary PR value. Fuzzy-only improvements are expendable,
    and peeling them back is acceptable when that keeps the code reviewable.
  - Do not introduce new regressions in existing report items. If a repair would
    break an already-matched or already-improved baseline item, stop and report
    the regression evidence instead of shipping the edit.
  - If a clean source repair is not possible, revert only the minimal problematic hunk needed to remove the violation.
  - If the clean fix lowers score, report `score_impact: "lower_score"` and explain exactly which useful work was lost and why the lower-score repair is still the cleanest option.
  - If the only source shape that keeps a new exact match is review-sensitive but
    not fake, banned, or a listed QA violation, keep the match-preserving shape
    only with explicit `left_with_evidence` and `risks[]` entries naming the line,
    concern, validation result, and reviewer question.
  - Do not recover the score by replacing one rejected tactic with another; clean
    source is the repair objective.
</goal>

<definition_of_done>
  Return exactly one JSON object following the output contract.

  Done means:
  - Every error finding in `<qa_repair_item>` is fixed, or the remaining blocker is listed with concrete evidence.
  - If `<qa_repair_item>.repair_warnings` is true, every warning finding is also fixed or listed with concrete evidence.
  - `<standard_examples>` has been used as targeted repair context for matching `standard_id` or `rule_id` findings.
  - Every finding has a `finding_dispositions[]` row: `fixed_source`, `fixed_by_minimal_revert`, `left_with_evidence`, or `false_positive`.
  - Any retained match-vs-cleanliness tradeoff is called out in `risks[]` with
    enough line-level evidence for a maintainer or PR reviewer to decide.
  - You did not edit unrelated files or opportunistically improve nearby code.
  - You ran the most relevant validation you can run from the available tools and report what passed, failed, or was not run.
  - You do not claim final cleanliness. The runner will re-run `review_lint scan_diff`, score/build/regression checks, and ship-set verification.
</definition_of_done>

<rules>
  1. Return JSON only; no Markdown outside the JSON object.
  2. Fix only the file and findings named in the queue item unless a local include/header edit is strictly required.
  3. Do not preserve exactness by retaining `register`, inline asm, `M2C_FIELD`, generated labels, fake assert macros, extern-literal anchors, packed string blobs, define aliases, or other listed QA violations.
  4. Prefer project idioms already present in nearby source: existing field names, helpers, HSD_ASSERT/HSD_ASSERTMSG forms, canonical macros, and typed accesses.
  5. Treat `<standard_examples>` as pattern-specific repair guidance, not as permission to edit unrelated code.
  6. Do not invent semantic names. If semantics are not evidenced, use a conservative local name and explain the evidence.
  7. Do not "fix" a finding by deleting useful unrelated implementation work. Preserve the useful hunk and remove only the banned tactic when an idiomatic source repair exists.
  8. Revert or drop source only after trying an idiomatic repair. When you revert, keep the revert minimal and report the disposition as `fixed_by_minimal_revert`.
  9. For extern/data-symbol/literal findings, inspect ownership evidence before editing: determine whether the current TU owns the data, whether an inline literal is sufficient, or whether binary-order data definition is required. Do not leave fake self-TU externs.
  10. For raw `__assert`/`OSReport` findings, try to restore the project assert/report idiom (`HSD_ASSERT`, `HSD_ASSERTMSG`, or an existing helper) before removing matching work.
  11. Do not use destructive git commands or reset unrelated user work.
  12. A small score loss is acceptable when it is the cost of removing
      standards-violating worker output; record the loss instead of chasing it
      back with generated, tactic-shaped, or fake source.
      Fuzzy improvements are less important than exact matches, and both are
      less important than avoiding new regressions in existing items.
  13. If a finding appears false-positive, leave code minimal, set `outcome: "false_positive"`, add a `false_positive` disposition, and explain the rule/evidence gap. Do not call it clean.
  14. Do not silently normalize away a new exact match for a merely suspicious
      source shape. First try a clean idiomatic repair; if exactness depends on
      a non-banned but reviewer-sensitive line, leave the smallest match-preserving
      form and mark it `left_with_evidence` plus a `risks[]` entry for reviewer
      judgment. If the shape is fake, cheating, a listed violation, or causes an
      existing regression, fix/revert it even if the match is lost.
  15. If you cannot validate, set the relevant validation row to `not_run` and explain why.
</rules>

<workflow>
    <phase id="1" name="understand_findings">
        - Read the queue item, proofs, lane, source path, and every finding.
        - Inspect nearby source and available standards before editing.
        - Separate repair targets from advisory context. Error findings are always repair targets; warning findings are repair targets when `repair_warnings` is true.
    </phase>

    <phase id="2" name="repair_minimally">
        - Remove the concrete violations one class at a time.
        - Keep unrelated matching work intact.
        - Try `fixed_source` first: inline a constant, use an owned data definition, restore an HSD assert macro, replace generated residue names, or use typed fields/helpers.
        - Use `fixed_by_minimal_revert` only for the smallest hunk that cannot be made reviewable without keeping the banned tactic.
        - Prefer losing fuzzy improvements over losing exact matches when both
          choices remain standards-compliant and regression-free.
        - When exact match and a known violation conflict, choose cleanliness and
          report the score impact honestly.
        - When exact match depends on a non-banned unresolved style or source-shape
          tradeoff, keep the minimal match-preserving code and annotate that line
          in the JSON for PR-reviewer/maintainer guidance rather than hiding the concern.
    </phase>

    <phase id="3" name="validate">
        - Run focused source/score/build/QA checks available to you.
        - Record each command and artifact path in the JSON.
        - If validation still reports findings, return `needs_rework` with the remaining rule IDs.
        - Do not return `fixed` while a required finding lacks a disposition row.
    </phase>

    <phase id="4" name="report">
        - Return one compact JSON object with edits, validations, remaining findings, risks, and score impact.
    </phase>
</workflow>

{{DECOMP_STANDARDS_XML}}

{{STANDARD_EXAMPLES_XML}}

<output_contract>
Use this top-level shape:

{{QA_REPAIR_OUTPUT_SCHEMA_JSON}}
</output_contract>
