---
name: mega-target
description: Coordinate parallel decompilation attempts on one difficult Melee target or an open PR, using Astra, isolated GPT-5.6 Sol workers, validated target-branch improvements, and the existing librarian.
---

# Mega Target

Run this workflow when the user supplies a target or open PR and asks for a sustained parallel search. The coordinator is Astra; spawn GPT-5.6 Sol workers with xhigh reasoning. Default to four workers and a 60-minute search timeout unless the user supplies different values. Support up to 16 workers.

The user provides the target and budget. You execute the workflow through completion. A validated exact result or the deadline ends search. Preserve accepted improvements, clean up the sandboxes, and process completed attempts through the existing summarizer and librarian.

## Start

1. Resolve the input. For a function, identify its objdiff unit and symbol from the game checkout. For an open PR, run `bun mega-target/scripts/cli.ts inspect-pr --pr <URL>` and inspect the changed functions. Use the sole intended unmatched target when clear. If several targets are plausible, ask which one to focus on before provisioning. This workflow processes one target per session.
2. Run `bun mega-target/scripts/cli.ts init --unit <unit> --symbol <symbol> --minutes <minutes> --workers <count>`. Add `--pr <URL>` to start from the fetched PR head, or `--ref <commit>` for another starting revision. The helper resolves the source from objdiff.json, creates a dedicated branch/worktree, and launches the timeout watchdog.
3. Run `bun mega-target/scripts/cli.ts prompt --session <returned-directory>`. Follow that rendered coordinator prompt. It contains the actual session, absolute command path, and current target knowledge.

The PR path reads and fetches the PR. Work lands on a new local experimental branch. Publishing to an existing PR requires a separate user instruction; the workflow does not infer that authorization from a PR URL.

## Execution Contract

Use native agent collaboration to spawn the workers, with the model identifier `gpt-5.6-sol`, `reasoning_effort: "xhigh"`, and a fresh context such as `fork_turns: "none"`. Supply the full rendered worker prompt. Record each returned agent ID in the ledger. If that model or collaboration is unavailable, report the limitation before creating sandboxes. Do not silently substitute a model.

Each worker owns its sandbox lifecycle and uses the host CLI to operate it. The coordinator is the only writer to the target integration branch. The scripts reuse the existing Daytona provider, toolpack, compiler/objdiff validation, summarizer, and librarian; they do not claim scheduler jobs or create harness epochs.

Search continues across multiple worker attempts until exact or the deadline. An individual worker finishing is a reason to evaluate its result and replace it with a fresh attempt when time remains. Failed and partial attempts still go to the librarian.

For command examples, recovery, record formats, and current limits, read [README.md](README.md). The command help is `bun mega-target/scripts/cli.ts help`.

## Completion

Call `finish` after stopping the native agents. It stops intake, preserves worker records, deletes session-owned sandboxes, and imports knowledge. Inspect `finish.json`: cleanup failures or librarian failures require retries or an explicit final report. A queued or claimed librarian task is not proof that facts were updated.

Retain the target branch, integration worktree, and host artifacts. Report the starting and final score, branch and commit, exact versus partial outcome, cleanup status, and librarian status. A scoped target match is not a claim that a PR has merged or passed the full project regression suite.
