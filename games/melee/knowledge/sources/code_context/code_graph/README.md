# Code Graph Source

Indexes current checkout metadata into file, unit, function, match-status, and
editability records.

The actual data is the target repo checkout passed with `--repo-root`; this
slice does not copy source files. See `source.json` for the checkout paths it
reads.

Current API surface:

- `bun run kg:file-card -- --repo-root <repo_root> --source <source_path>`
- `bun run kg:rank-features -- --repo-root <repo_root>`
- `bun run kg:rebuild -- --repo-root <repo_root> --sources code_graph`
