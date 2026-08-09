---
covers: Operator playbooks for monitoring live runs and repairing stuck targets
concepts: [runbooks, operations, gate-exact, repair, monitoring]
---

# Runbooks

Operator playbooks for working a live orchestrator run: monitoring for stuck
targets, driving repair agents, applying fixes to the live session tree, and
capturing the results as worker reports.

## Contents

- [Gate-exact repair playbook](10-gate-exact-repair-playbook.md): agent
  instructions for delivering a gate-rejected exact match gate-clean.
- [Gate-exact tail repair loop](20-gate-exact-tail-repair.md): operating
  procedure for monitoring a Melee run for stuck gate-exact tails and
  processing them to completion.
