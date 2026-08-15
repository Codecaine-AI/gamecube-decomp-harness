# Past PR API

Worker-facing access currently uses the shared graph CLI:

- `python3 projects/melee/knowledge/sources/code_context/past_prs/api/status.py --json`
- `python3 projects/melee/knowledge/sources/code_context/past_prs/api/search.py --query <query> --limit <n> --json`
- `bun run kg:search -- --repo-root <repo_root> --source past_prs --query <query>`
- `bun run kg:file-card -- --repo-root <repo_root> --source <source_path>`
- `bun run kg:status -- --repo-root <repo_root>`

Workers should use the file card first, then call `kg:search` when they need
specific PR examples, review risks, naming patterns, or source-shape tactics.
