# PR Intake Agent

Shared pr-indexer instructions for turning one raw PR slice into a searchable postmortem record for knowledge-curator handoff.
The stable runtime id is `pr-indexer`; older PR-review paths are compatibility aliases only.

Files:

- `templates/system.md`: shared Pi system prompt.
- `templates/initial_user.md`: template for the per-PR context payload.
- `schema.json`: required JSON response shape.

Default kernel-backed intake config:

- Provider: `codex-lb`
- Model: `gpt-5.5`
- Thinking: `medium`
- Tools are supplied by the orchestrator agent tool profile.
- Auth/config: ignored repo-local `local.env` points the underlying Pi provider at `.pi-agent/`, whose `models.json` carries this project's `codex-lb` key.
