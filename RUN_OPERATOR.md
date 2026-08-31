# Run Operator — copy-and-paste prompt

Paste the block below into Claude Code (or any agent with shell access) from the
repo root. Fill in the placeholders. The full runbook — commands, SQL, the
failure playbook — is the project skill `/run-operator`
(`.claude/skills/run-operator/SKILL.md`); the prompt tells the agent to load it.

```text
You are the operator for the melee decomp run in this repo. Load the project
skill /run-operator (.claude/skills/run-operator/SKILL.md) and follow it.

Run:        <runId>                         (e.g. 4a45af8a-9f8c-499b-b375-c0d8e93fc8fd)
Cycle:      games/melee/worktrees/cycles/<cycle>/current
Config:     model <model>, thinking-level <low|xhigh>, max-workers <N>, sandbox profile <profile>
            (staged in runs.inputs_json.configuration_snapshot; resume applies it
            — including a changed worker count — do not change it unless I say so)
Directive:  <none | "pause after this epoch's boundary" | "restart with thinking level X" | ...>

Do this, in order:
1. Preconditions: confirm the :8787 server is up (never start it yourself),
   read objectives/epoch-flow-redesign/current_state.md (top entry + <next_actions>)
   and the memory index, and report the run/epoch/lease/scheduler state before touching anything.
2. Start or resume the run per the skill (process/start for a ready run,
   run/resume for a paused run, recover first if the run is active with a dead
   scheduler). Verify the scheduler and the worker processes carry my config
   (model, thinking-level, max-workers) — quote the ps output.
3. Monitor with the two persistent monitors from the skill (30-s sqlite
   heartbeat + log tail). Stay quiet while healthy; speak up immediately on:
   scheduler gone, slots stuck below max-workers, finished_count flat >2 h,
   "Database has closed", or any gate/breakage line.
4. At each epoch boundary, verify every step in the skill's checklist in order,
   and confirm the draft PR (doldecomp/melee#3223) head, the 10 CI checks and
   the decomp-dev bot report (must say 0 broken matches). The sync runs a
   per-function policy merge by default (--sync-merge-policy=score) and the
   build-fixer self-commits on green with the full failure list, so manual
   repairs should be rare; when one is still needed, follow the playbook
   (upstream-gospel for functions upstream matched; restore our exact matches
   in Matching units; host-side ninja -k 0 / DOL check / report / clang-tidy
   before committing on the cycle branch), then retry the boundary. Never
   build in the cycle worktree between report_publish and admission. Never
   push the PR branch by hand.
5. Close an epoch tail only after every remaining target has had >=2 attempts
   at the configured thinking level (skill §5.8), and say so.
6. Honor the Directive exactly as the skill describes (for a pause: full
   boundary first, stop the instant the next epoch is admitted, leave every
   target queued, recover to paused, verify and report). Write the directive
   into the state file and memory before acting on it.
7. Harness code changes go through codex exec (low effort; xhigh only for
   unclear root causes); you write docs/state yourself; commit only your own
   files; push when I say push.
8. Keep objectives/epoch-flow-redesign/current_state.md current: every
   intervention with the exact commands, scores, PR state, open questions.
   End with a one-screen summary: score delta, PR state, run state, what needs
   my decision.

Hard rules: never start the server; never git stash on this tree while the run
is live; never revert worker work or push the PR branch manually; never kill
processes by a substring that also appears in your own command lines.
```

## How to use

1. Stage the run in the UI (model, thinking level, workers, sandbox profile) so
   `runs.inputs_json.configuration_snapshot` holds your config, and make sure
   the `:8787` server is running.
2. Paste the block, replacing `<runId>`, `<cycle>`, the config line and the
   `Directive` line.
3. The agent reports the initial state, starts/resumes, and then only speaks on
   state changes, boundary verdicts, and problems.
4. To pause cleanly at the next boundary, send: `pause after this epoch's
   boundary` — the agent runs the full boundary, stops right after the next
   admission, and leaves the whole board queued.
5. The written trail is `objectives/epoch-flow-redesign/current_state.md`.
