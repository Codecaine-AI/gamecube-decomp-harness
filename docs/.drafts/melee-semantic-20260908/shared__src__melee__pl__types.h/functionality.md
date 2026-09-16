## Player-module shared types

`src/melee/pl/types.h` declares data structures rather than executable behavior.

- `plAllocInfo` and `plAllocInfo2` describe fighter allocation using a fighter kind, slot and flags including `has_transformation`. Their intervening fields differ; the comment suggesting eventual unification is tentative, not proof of equivalence. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.h#L10-L42)
- `plAttackStats` contains total, per-attack and category counters. `plActionStats` combines attack/hit records, an explicitly questioned union interpretation, and additional counters and flags. The down-special counter comments remain hypotheses. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.h#L44-L96)
- `StaleMoveTable` declares an index and ten move-ID/attack-instance pairs, followed by action statistics, nested records, item-log-indexed arrays and numerous unresolved fields. The source includes `ASSERT_SIZE(..., 0xCF4)`; this review does not independently verify compiled size or layout. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.h#L98-L170)
- `pl_StaleMoveTableExt_t` embeds the stale-move structure and adds mostly unnamed scalar fields and two byte/bitfield unions. Its size is explicitly unknown. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.h#L172-L255)
- `pl_800386E8_arg0_t` is an inferred, padded argument record; `pl_804D6470_t` is a largely unnamed mixed numeric record with explicitly unknown size. Neither declaration establishes allocation ownership or cross-file lifetime. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.h#L257-L363)

## Semantic assessment

Both canonical and rendered views were read completely. The renderer reports three parse errors, zero substitutions and function-name-only coverage; it supplies no independent validation of field meanings. Existing descriptive source names fit the declarations, while unresolved names and tentative comments should remain conservative. The frozen baseline contains no subjects, facts or links to disposition. No supported correction or scoped knowledge write is proposed.

Status: synthesized; independent review and live promotion pending.
