# Games

The orchestrator is the platform repository. Game descriptors in this
directory tell it which checkout, state directory, graph database, process name,
and local defaults to use for a decomp game.

Tracked game descriptors live at:

```text
games/<game-id>/game.json
```

Machine-specific overrides live at:

```text
games/<game-id>/local.game.json
```

`local.game.json` is ignored. Use it for absolute checkout paths or temporary
local paths that should not be committed. Explicit CLI flags and dashboard
advanced path overrides still win over both tracked and local game config.

Descriptor resolution does not accept legacy aliases. Use only
`games/<game-id>/game.json` and `games/<game-id>/local.game.json`.

For Melee, either clone/worktree `doldecomp/melee` into
`games/melee/checkout/` or create `games/melee/local.game.json` with a
`repoRoot` that points at an existing external checkout.

Game-owned knowledge lives under `games/melee/knowledge/`: source
corpora, generated source indexes, tool caches, tool indexes, and graph
enrichment inputs. The active graph database lives under
`games/melee/graph/graph.sqlite`. Reusable callable tool definitions live in
`toolpacks/`, game-specific tool bindings and data live under each game,
and server APIs live under `apps/server/src`.

PR defaults live under the descriptor's `pr` key. `splitStrategy` can be
`deterministic` or `agent`; the tracked Melee descriptor uses `agent` so
handoff planning asks the PR splitter to reshape the deterministic seed plan.
