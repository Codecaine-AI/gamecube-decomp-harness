# Clarify

Ask clarifying questions when the prompt brief cannot be completed from provided context.

## Rules

1. Ask numbered questions.
2. Ask only questions whose answers would materially change the final artifact.
3. Prefer 3–7 high-leverage questions.
4. Do not ask questions already answered by files, examples, or prior messages.
5. If the user wants speed, write assumptions and ask for approval.

## Gate

Clarification is sufficient when the run can state:

1. Intended job.
2. Artifact type.
3. Runtime inputs.
4. Desired output.
5. Known or likely failure modes.
6. Hard constraints.

Record questions, answers, and assumptions in `steps/01-clarification.md`.
