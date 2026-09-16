# Cardgame Synthesis

Research/proposals only; no KB application.

{
  "files_expected": 3,
  "files_reviewed": 3,
  "canonical_lines": 369,
  "rendered_lines": 369,
  "targets_expected": 24,
  "targets_reviewed": 24,
  "functions": 20,
  "data_sections": 4,
  "subjects_expected": 32,
  "subjects_reviewed": 32,
  "empty_parameter_entities": 7,
  "inherited_facts": 136,
  "proposal_operations": 75,
  "dispositions": {
    "retain": 17,
    "supersede": 75,
    "reject": 0,
    "unresolved": 44
  }
}

Critical corrections: a blocked request is consumed; zero start status still sets x14; the drain has no timeout; scene coordinates have only one row; loading enables without checking success; partial reset does not free assets or clear condition state.

Static header reports three parser errors but its complete text was reviewed. All source ranges and fact versions are recorded in findings.json. Independent review and foreign-operation proof remain pending.

Independent controls review confirms BE30 ultimately queues retryCardWriteAsync through the task-10 and type-9 pipeline. The three Read aliases contradict this chain and are proposed for clearing. This packet promotes no replacement alias. Foreign files are peer evidence, not owned read coverage. Proposal has 72 fact writes and 3 alias clears.
