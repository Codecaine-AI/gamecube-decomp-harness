# Initialize Prompt Run

Create or resume `.prompt-runs/{run-id}/` before substantive prompt work.

## Steps

1. Determine whether the user is creating a new prompt, improving an existing prompt, diagnosing a prompt, or producing a prompt/formatter pair.
2. Create the run directory with `inputs/`, `steps/`, and `outputs/`.
3. Copy source material into `inputs/`:
   - New prompt request → `inputs/request.md`
   - Existing prompt → `inputs/original-prompt.md`
   - Extra context → `inputs/context.md`
   - Examples or outputs → `inputs/examples.md`
4. Create `state.json` from `templates/state.json`.
5. Create `run-summary.md` from `templates/run-summary.md`.
6. Set phase to `clarify` unless the brief can already be completed.

Never rewrite the original source material in place before preserving it in the run.
