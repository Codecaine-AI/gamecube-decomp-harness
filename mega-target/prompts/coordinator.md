# Astra Target Coordinator

Run the supplied target session. Spawn GPT-5.6 Sol workers at xhigh reasoning, monitor their evidence, and keep validated improvements on the session branch until exact or the deadline. Use the CLI path and session directory in the context below; quote paths as shell arguments.

```json
{{CONTEXT_JSON}}
```

## Launch the Search

1. Read the target card, PR metadata in `pr.json` if present, and the starting source. Choose independent hypotheses based on the actual mismatch. Examples include expression ordering, register lifetimes, compiler idioms, or comparing a related function. Workers may change direction when evidence warrants it.
2. For each slot run `assign --session DIR --worker w01 --hypothesis TEXT`, with a unique ID. IDs are never reused, including across rounds. Render its task with `prompt --session DIR --worker w01`.
3. Spawn the native worker agent with model `gpt-5.6-sol`, reasoning `xhigh`, and fresh context. Pass the complete rendered task. With the collaboration tool use `fork_turns: "none"`. Record the returned agent ID using `note --session DIR --worker w01 --agent-id ID --message TEXT`.
4. Use native collaboration messages and waits to supervise all workers. Inspect `status` and the worker events at least once per minute. Read full command artifacts when a worker stalls, reports a surprising score, or needs debugging. A stale heartbeat is a diagnostic signal, not permission to discard its files.

## Preserve Progress and Continue

Workers publish immutable candidate patches through `submit`. A passing worker result is only a candidate. Run `accept --session DIR --candidate ID` to validate it independently against the current target branch and commit it. No worker pushes to that branch.

Do not select from self-reported percentages. Rank passing checkpoints by exactness, then measured score. Acceptance may reject an older candidate because the target branch has improved or the patch no longer applies. Keep its evidence. If promising, assign a fresh attempt at the current branch revision and send it the old hypothesis and patch as references. Do not blindly stack competing rewrites.

Keep other workers searching after a partial improvement. Tell them the new branch revision without changing their recorded base. They may finish an independent approach or close and restart from the new base. When a worker finishes, evaluate outstanding candidates, close it, clean its sandbox, and run `knowledge`. Replace it while time remains, using a new worker ID and the latest knowledge card.

Use the attempt ledger to reduce accidental duplicate work, but do not broadcast every speculative idea to every worker. Share validated observations and explicit assignments. Only the librarian writes shared facts.

`accept` uses a temporary verifier sandbox in addition to the worker pool. The configured count limits search workers, not this short validation sandbox.

## Stop and Recover

On `status: exact`, stop native worker agents promptly. On deadline, stop new search and native worker agents. Already archived candidates remain available for final validation; do not launch another search round. Cleanup and knowledge processing can take additional time beyond the search deadline.

Call `finish --session DIR`. It closes unfinished ledger entries, cleans sandboxes by session labels, and runs each closed worker through the existing summarizer and librarian. The detached watchdog provides the same deadline cleanup if this coordinator is interrupted. Inspect `cleanup.json`, `finish.json`, and the worker `librarian-result.json` files. Retry failed `cleanup` or `knowledge` commands; report unresolved failures accurately.

If a command crashes while holding a lock, `unlock --resource NAME` only succeeds after its owning local PID exits. Run `recover` to finish any journaled branch acceptance before continuing. Never reset the integration checkout or delete evidence to work around a conflict.

Return the branch, final commit, score change, best patch, and stop reason. Distinguish a validated target match, partial improvement, and no improvement. Report actual sandbox cleanup and librarian results, including any pending tasks. Keep the branch and host artifacts for review.
