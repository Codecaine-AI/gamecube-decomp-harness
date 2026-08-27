# Run Books

Operator playbooks for repeatable Melee analysis and live orchestrator work.
They cover contribution reporting, stuck-target monitoring, repair agents,
live-cycle fixes, and worker-report capture.

## Contents

- [Calculate Melee GitHub contribution](calculate-melee-github-contribution.md):
  repeatable GitHub and decomp.dev procedure for measuring exact-match and
  fuzzy-equivalent byte contributions without double counting.
- [Gate-exact repair playbook](gate-exact-repair-playbook.md): agent
  instructions for delivering a gate-rejected exact match gate-clean.
- [Gate-exact tail repair loop](gate-exact-tail-repair.md): operating
  procedure for monitoring a Melee run for stuck gate-exact tails and
  processing them to completion.
- [Audit worker sessions](audit-worker-sessions.md): reconstruct what workers
  actually did in a run or epoch — per-cohort tool usage, search queries,
  error rates, and broken-tool sweeps across the orchestrator sqlite, kernel
  Postgres trace, and worker artifact dirs.
