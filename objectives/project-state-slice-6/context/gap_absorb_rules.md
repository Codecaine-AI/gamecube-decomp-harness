# Gap-absorption rules — all lanes (Slice 6 close-out)

Input: `objectives/project-state-slice-6/context/gap_verification.md` — your lane owns the
MINIMAL ABSORPTION WORKLIST sections named in your prompt. For each fact id in your
sections: read its row in the verification table (original + verified verdict, the exact
absent aspect), render its source bundle under
`docs/40-new-features/20-project-state-and-events/` with the docs CLI
(`bun packages/docs-framework/packages/docs-cli/src/index.ts render <path>`), and absorb
ONLY the absent aspect into your destination doc.

Hard rules:
- Edit ONLY the destination bundles your prompt assigns. Other lanes run concurrently on
  other bundles. Never touch `docs/40-new-features/**` (sources stay untouched), themes/,
  apps code, or any other doc bundle.
- All edits via the docs-server/workbench API (doc_get / doc_update_blocks style, per
  `.codex/skills/docs-framework/`); never hand-edit or hand-read `doc.json`.
- Where the fact is a field of an existing state object or table row, extend the existing
  `state-shape` / `structured-table` block in place; otherwise add compact design-narrative
  prose (what/where/why, see writingstyle.md). Keep identifiers literal (underscores).
- Cross-link instead of duplicating full contracts; preserve dated decision callouts.
- Do not run global index/backlink rescans; do not run git write commands; never start the
  melee UI server; no expanding scope beyond your fact list.
- Verify: re-render every destination doc you touched (must render; zero `[a-z]*[a-z]`
  emphasis artifacts).
- Write your ledger `objectives/project-state-slice-6/context/absorb_gaps_lane<X>.md`:
  one row per fact (id → destination doc → block added/extended), plus render results and
  deviations.
