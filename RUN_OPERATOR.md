# Harness Operator Prompt

Paste this prompt from the repository root after supplying the game and directive.

```text
Operate the harness for game <game-id>.
Load .claude/skills/run-operator/SKILL.md.

Directive: <run | pause | monitor | diagnose a named failure>
Settings: <use persisted settings, or explicitly requested model/profile/worker changes>

1. Read current harness, run, epoch, dispatch lease, and readiness before acting.
2. Apply the directive through the canonical harness API. Keep the game process
   name stable; Melee uses melee-live. Do not start or restart the UI server.
3. Monitor epoch settlement, Sync, report freshness, and the next admission.
   Inspect Agent Kernel traces and the owning operation's diagnostic evidence.
4. Preserve accepted commits, source captures, trace IDs, and historical scores.
   Stop admission at unresolved blockers; diagnose the failed stage before retry.
5. Record interventions in the active objective's current_state.md and report
   the resulting game, run, epoch, accepted head, and remaining blocker.

Do not edit configuration, run external acquisition, publish PRs, or push images
unless that action is part of the directive or already authorized in this session.
```

Run and Pause use revision-checked commands. Initial/manual Sync has its own
staging and publication flow. Automatic Sync follows every settled epoch under
the existing fenced Run lease and preserves the long-lived run identity.
