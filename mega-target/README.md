# Mega Target

Give Astra [SKILL.md](SKILL.md), a target or open PR, and a search timeout. It coordinates up to 16 GPT-5.6 Sol workers at xhigh reasoning. Each worker owns an isolated Daytona sandbox. Astra keeps validated improvements on one local target branch, then cleans up and runs the existing librarian.

## Invoke

```text
Read mega-target/SKILL.md and run it for <unit>:<symbol>.
Use four GPT-5.6 Sol workers at xhigh. Search for 60 minutes or until a match.
```

Or:

```text
Read mega-target/SKILL.md and work on <GitHub PR URL>.
Use eight GPT-5.6 Sol workers at xhigh, with a 90-minute timeout.
```

For a PR containing several plausible unmatched targets, the coordinator asks which target to pursue. It fetches the PR head and starts a new local branch; it does not modify the existing PR.

This folder is the skill's source. A top-level folder is not automatically installed into Codex's skill catalog; explicitly asking the agent to read `mega-target/SKILL.md` works without installation.

## Requirements

Use the existing repository installation: Bun dependencies, configured Melee checkout, current knowledge database, Daytona credentials in the existing local environment, and the configured sandbox snapshot. PR inputs also require authenticated `gh` and Git access. Summarization and librarian passes use the repository's configured agent provider and model, independently of the Sol search workers.

The coordinator runtime must expose native agent spawning with the requested model and reasoning controls. The CLI operates sandboxes and records evidence; it does not itself call the Sol model or create an Astra session.

## Commands

Run commands from the harness repository root. The CLI prints JSON except for `help` and rendered prompts.

```sh
bun mega-target/scripts/cli.ts init --unit melee/lb/lbcommand --symbol SYMBOL --workers 4 --minutes 60
bun mega-target/scripts/cli.ts prompt --session /absolute/session/directory
bun mega-target/scripts/cli.ts status --session /absolute/session/directory
bun mega-target/scripts/cli.ts finish --session /absolute/session/directory
```

`SYMBOL` above must be replaced with the actual function name. `init` resolves the `.c` path from the selected revision's `objdiff.json`. Use `--pr URL`, `--ref REV`, or `--source PATH` when needed. `init` prints the created directory, branch, and watchdog PID.

Use `help` for the full command list. Worker-specific examples live in the rendered worker prompt. `prompt` renders from the real session rather than leaving unresolved placeholders.

## Ownership and Records

| Record | Owner and meaning |
| --- | --- |
| `session.json` | Coordinator. Target, branch, starting/current commit, accepted score, deadline, capacity, integration journal. |
| `workers/ID/worker.json` and `events.jsonl` | One worker. Identity, hypothesis, starting revision, sandbox, heartbeat, closure. |
| `workers/ID/checkpoints/` and `candidates/` | CLI-generated patches and compiler evidence. Failed gates remain recorded. |
| `verification/` and `events.jsonl` | Coordinator's independent validation and accepted-commit history. |
| `workers/ID/external-attempt.json`, `knowledge-import.json`, `librarian-result.json` | Archived external attempt, idempotent V2 import, and actual librarian processing result. |

All runtime files live under ignored `mega-target/sessions/` by default. Each worker has a separate record and lock. No shared Markdown table is edited concurrently. `status` aggregates the ledger for Astra. Writes use atomic file replacement; long commands hold a per-worker lock. Branch acceptance holds the session lock.

The coordinator may maintain `coordinator-notes.md` in the session directory with confirmed findings, rejected approaches, and replies to worker questions. Only the coordinator writes this file. Worker `exec` responses include its current contents as `coordinatorNotes`, so active workers receive shared findings on their next command without interruption. Worker requests belong in their own ledger through `note`.

## Validation and Branch Progress

Every worker starts from a recorded commit. `start` captures the compiler baseline in its sandbox. `submit` exports an immutable patch and invokes the existing worker change validator, including same-unit regression checks, section parity, undefined-symbol checks, banned idioms, and review lint. Validation logs stay on the host.

`accept` checks the patch hash and scope, provisions a fresh verifier at the latest accepted commit, and validates again. It creates a Git commit through a private index, journals that commit, then advances only the integration worktree. Repeating an accepted candidate is idempotent. An interruption after commit creation can be recovered with `recover`.

Other workers can continue from older revisions after an improvement. Their patches must apply and improve the current branch before acceptance. If a patch conflicts, keep it as evidence and start a fresh worker from the newer revision. Patches are not automatically merged by a resolver.

The current integration scope is the target `.c` file. Header/config changes require a separate reviewed workflow. A passing target result does not replace the repository's full PR regression checks. Search capacity is four by default and accepts 1–16 workers; acceptance temporarily adds one verifier sandbox, for up to 17 session-owned sandboxes.

## Timeout and Cleanup

The search timeout starts at `init`, including sandbox setup. A detached watchdog wakes at the deadline, or when the session becomes exact/stopped. The coordinator should also stop native agents and call `finish` itself. The watchdog can stop sandbox work even if the coordinator session is interrupted; it cannot directly cancel native agent sessions belonging to another process.

`finish` stops intake, closes unfinished attempts, deletes owned sandboxes, and then runs knowledge processing. Already archived candidates can still be considered by an explicit `accept` after timeout; this is final validation, not another search round. Cleanup, final validation, and model-based knowledge processing may extend beyond the search timeout.

Sandboxes carry `mega_session` and `workflow=mega-target` labels. They deliberately omit the harness's `game_id` lifecycle label, so its job reconciler cannot mistake them for orphaned scheduler jobs. Cleanup discovers by labels, including sandboxes created just before a crash. A provider TTL provides a second bound on resource lifetime.

Worker cleanup retains all host evidence. Session cleanup also retains the target branch and integration worktree. No remote branch is pushed automatically.

## Librarian Handoff

Each closed worker becomes one V2 `worker_run` with scored submissions and a narrative from the existing worker summarizer. A stable ID prevents duplicate imports. The importer atomically queues the existing `run_closed` pathway. `knowledge` runs only that task through the existing librarian, so it works even when the main harness loop is stopped.

No fake scheduler jobs, claims, epochs, or worker-state rows are created. The attempt records explicitly carry the experimental branch, starting commit, artifact path, and `canonical_integration: false`. Their integration field remains unset. The librarian corroborates against the canonical checkout and decides whether reusable findings belong in shared facts.

Worker notes and sandbox command output form the default transcript. Native agent conversation logs are included when supplied as `workers/ID/transcript.jsonl`. Missing conversation text is not invented. Unscored failures remain in the narrative and archived checkpoint data rather than acquiring a fabricated numeric submission.

## Recovery

1. Run `status` and inspect `watchdog.log`, `cleanup.json`, and `finish.json`.
2. For a crashed command, use `unlock --resource NAME`. It refuses to remove a lock whose owning local PID still exists. If a crash occurred before `owner.json` was written, inspect the lock manually; the helper refuses to guess.
3. Run `recover` for a pending acceptance. It verifies the integration branch before finishing the recorded commit.
4. Retry `finish`, or `knowledge --worker ID` for a failed summary/librarian pass. Check task completion and pass failures in the returned result.

Keep failed patches and dirty worktrees for inspection. Do not reset the integration worktree to make recovery pass. On host failure, restart the watchdog with `watch --session DIR`; until then the provider TTL remains the fallback for sandboxes.

## Verify the Helpers

```sh
bun test ./mega-target/tests/workflow.test.ts
bunx tsc --noEmit -p mega-target/tsconfig.json
```

Tests use temporary Git repositories, a temporary knowledge database, and fake sandbox providers. They do not launch model workers or create paid sandboxes.
