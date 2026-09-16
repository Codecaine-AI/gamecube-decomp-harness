# Naming Decisions

Propose ftCo_AttackHi4_Enter for doEnter. The two owned dispatchers select it as the generic entry after item handling and Ness exclusion; its exact body enters AttackHi4 beside the canonical callback family. Frozen-KB exact inferred-name and canonical-target-symbol queries returned no owner for this candidate. Canonical-source exact-name search returned no hits. It is a hypothesis, not a recovered original name.

Retain all six canonical public function names. NoD0 specifically means the left-stick timer check is omitted; the C-stick alternative is unchanged. checkLStick and checkLStickNoD0 remain source-only static helpers, not added entities. Seven gobj parameter identities and the source/.sdata2 identities are covered without renames. HSD_GObj/Fighter_GObj spellings are compatible outside M2C.

Rendered aliases for C-stick, item throw, animation, physics and collision were checked against canonical definitions; no foreign naming writes are proposed. Per-page replacement/fact metadata stays in coverage.json and campaign pages.
