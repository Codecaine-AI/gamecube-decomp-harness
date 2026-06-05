# Decomp Orchestrator Knowledge

This directory is the runtime knowledge surface for director and worker Pi
agents. It was migrated from repo-local Codex skills so the orchestrator can
render explicit, role-specific knowledge references without depending on Codex skill
loading.

The runner includes a small default set for each role and adds capability references
for worker packets. Agents should treat these files as authoritative local
workflow guidance, then verify every decomp claim with the repo resources and
commands listed in their prompt.

Entry point:

- `manifest.json`

Reusable corpora:

- `decomp_resources/` - data-sheet CSVs, PowerPC indexes, external hint
  indexes, manifests, and resource notes for Melee decomp research.
- `past_prs/` - stable PR dump, searchable per-PR postmortem library, shared
  PR-agent prompts, and refresh/postmortem utilities.

Runtime references and workflows:

- `references/director/` - scheduling policy and target-selection heuristics.
- `references/melee/` - core Melee decomp workflow, matching tactics,
  resource-guided research, review standards, and PR/resource evidence notes.
- `workflows/targeted-iteration.md` - default worker loop for one bounded target.
- `workflows/experimental-sweeps/` - optional reproducible experiment workflow
  for broader source-shape searches.
- `tools/` - helper scripts such as target ranking, context lookup, and optional
  experimental-search utilities.
- `archive/legacy-packs/` - exact pre-cleanup pack tree retained for history,
  not used by the runtime manifest.

Package command surface:

- `bun run pr:refresh:dry` previews recent PR discovery.
- `bun run pr:refresh` refreshes missing PR slices and rebuilds deterministic
  searchable records.
- `bun run pr:postmortems -- --dump-root knowledge/past_prs/current --run-agent`
  reruns model-reviewed PR records.
- `bun run pr:sync` syncs the local branch and PR library together.
