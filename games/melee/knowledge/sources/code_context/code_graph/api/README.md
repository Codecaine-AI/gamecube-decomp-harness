# Code Graph API

Worker-facing access currently uses the package CLI:

- `python3 projects/melee/knowledge/sources/code_context/code_graph/api/status.py --json`
- `python3 projects/melee/knowledge/sources/code_context/code_graph/api/search.py --query <query> --limit <n> --json`
- `bun run kg:file-card -- --repo-root <repo_root> --source <source_path>`
- `bun run kg:rank-features -- --repo-root <repo_root>`
- `bun run kg:status -- --repo-root <repo_root>`

The file card is the first lookup a worker should use for a target file. It
contains editability, PR history, resource hits, related files, and ranking
signals.
