<goal>
  - Repair one PR-bound candidate file that has deterministic QA findings.
  - Make the smallest source edits that remove the listed maintainer-rejected patterns.
  - Preserve the match when possible, but never by keeping or reintroducing a banned tactic.
  - If the clean fix lowers score, report `score_impact: "lower_score"`; the runner will route it as carry-forward or an explicit improvement policy.
</goal>

<definition_of_done>
  Return exactly one JSON object following the output contract.

  Done means:
  - Every error finding in `<qa_repair_item>` is fixed, or the remaining blocker is listed with concrete evidence.
  - You did not edit unrelated files or opportunistically improve nearby code.
  - You ran the most relevant validation you can run from the available tools and report what passed, failed, or was not run.
  - You do not claim final cleanliness. The runner will re-run `review_lint scan_diff`, score/build/regression checks, and ship-set verification.
</definition_of_done>

<rules>
  1. Return JSON only; no Markdown outside the JSON object.
  2. Fix only the file and findings named in the queue item unless a local include/header edit is strictly required.
  3. Do not preserve exactness by retaining `register`, inline asm, `M2C_FIELD`, generated labels, fake assert macros, extern-literal anchors, packed string blobs, define aliases, or other listed QA violations.
  4. Prefer project idioms already present in nearby source: existing field names, helpers, HSD_ASSERT/HSD_ASSERTMSG forms, canonical macros, and typed accesses.
  5. Do not invent semantic names. If semantics are not evidenced, use a conservative local name and explain the evidence.
  6. Do not use destructive git commands or reset unrelated user work.
  7. If a finding appears false-positive, leave code minimal, set `outcome: "false_positive"`, and explain the rule/evidence gap. Do not call it clean.
  8. If you cannot validate, set the relevant validation row to `not_run` and explain why.
</rules>

<workflow>
    <phase id="1" name="understand_findings">
        - Read the queue item, proofs, lane, source path, and every finding.
        - Inspect nearby source and available standards before editing.
    </phase>

    <phase id="2" name="repair_minimally">
        - Remove the concrete violations one class at a time.
        - Keep unrelated matching work intact.
        - When exact match and cleanliness conflict, choose cleanliness and report the score impact honestly.
    </phase>

    <phase id="3" name="validate">
        - Run focused source/score/build/QA checks available to you.
        - Record each command and artifact path in the JSON.
        - If validation still reports findings, return `needs_rework` with the remaining rule IDs.
    </phase>

    <phase id="4" name="report">
        - Return one compact JSON object with edits, validations, remaining findings, risks, and score impact.
    </phase>
</workflow>

{{DECOMP_STANDARDS_XML}}

<output_contract>
Use this top-level shape:

{{QA_REPAIR_OUTPUT_SCHEMA_JSON}}
</output_contract>
