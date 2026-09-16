# Global Knowledge

Platform-level knowledge shared by every game. The layout mirrors a game's
`games/<id>/knowledge/` tree so the same loaders read both:

```text
knowledge/global/
+-- README.md
+-- sources/
    +-- registry.json
    +-- injectable/decomp_standards/   # global decomp standards (records, rules, api)
```

`ORCH_GLOBAL_KNOWLEDGE_ROOT` overrides this directory; the standards slices
root alone can be overridden with `REVIEW_LINT_GLOBAL_STANDARDS_DIR`.

## Composition

Every game composes `game + global`: its own
`games/<id>/knowledge/sources/injectable/decomp_standards/` records load
first, then the global set here. Families are deduplicated by name and the
game's slice wins, so a game overrides a global family by shipping a slice
with the same name. Composed records carry `scope: "game" | "global"`.

Game-scoped standards live under
`games/<id>/knowledge/sources/injectable/decomp_standards/`. Melee ships an
empty shell there (its rules are the global set); SMS ships `sms_baseline` and
`sms_fidelity`.

Loaders: `apps/server/src/core/knowledge/standards-files.ts` (server) and
`toolpacks/gamecube-decomp/source_editing/review_lint/api/_qa_rules.py`
(review_lint scanner).
