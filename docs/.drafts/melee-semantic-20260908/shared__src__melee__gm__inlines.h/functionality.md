## Shared game-mode inline helpers

`gmClampResultStat` saturates a signed value to the inclusive interval [-999999, 999999], leaving values within that interval unchanged (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/inlines.h#L7-L15). Its existing clamp name fits the implementation; the result-stat use domain is not independently established here.

`fn_801A7FB4_inline` and `fn_801A7FB4_inline2` have identical observable logic, differing only in local declaration order. Each visits indices 0 through 25, passes each through `gm_801A659C`, calls `Toy_803048C0` on the result, and counts nonzero returns. They count qualifying indices, not the sum of returned quantities, and return an integer from 0 through 26. Neither deduplicates mapped values or stops early (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/inlines.h#L17-L42).

The rendered view preserves this behavior and substitutes only external callee names. `gmRegTyFall_GetCharacterTrophyId` and `Toy_GetTrophyCountById` are compatible hypotheses, not established by this header: canonical evidence here proves only mapping followed by a nonzero predicate. No allocation, persistent local state, or explicit ownership transfer appears in these wrappers; external callee effects are unspecified here. The placement TODO remains unresolved. No compiled layout claims are made.

The frozen scope contains no subjects, facts, or links to revise or retain. No proposal is warranted solely from this header.

Status: synthesized; independent review and live promotion pending.
