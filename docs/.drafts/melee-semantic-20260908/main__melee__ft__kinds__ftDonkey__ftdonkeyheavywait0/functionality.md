## HeavyWait0 functionality

The owned C file implements five routines; its header declares these plus two HeavyWalk routines implemented elsewhere. Both canonical and rendered views were read completely. Rendered substitutions are naming hypotheses, not independent evidence.

- `ftDk_MS_341_800DF938` tests `ft_8008A1FC`, enters the configured HeavyWait motion on success, and returns whether it did so. The predicate accepts reversed horizontal input or absolute stick magnitude strictly below the walking threshold. HeavyWalk invokes this after throw and jump checks and before its continuing-walk fallback. Equality with the threshold alone does not satisfy the stop guard.
- `ftDk_MS_341_800DF980` obtains the Fighter, conditionally calls `ftCommon_8007D7FC` for an airborne fighter, then requests `donkey_attr->motion_state` with arguments `0, 0, 1, 0, NULL`. This is attribute-selected, not proof of a fixed numeric motion ID. Ground conversion includes velocity/jump/ECB bookkeeping and can assert if valid ground is absent; it is not merely a status-bit assignment.
- `ftDk_HeavyWait0_IASA` short-circuits in throw, jump, turn, walk order. The first accepted handler suppresses subsequent checks; all-false returns without a local transition. Throw processing requires an item and can use A/B with the left stick or the C-stick; it returns false if no different throw motion is selected.
- `ftDk_HeavyWait0_Phys` forwards to `ft_80084F3C`, which scales ground friction when absolute ground velocity exceeds maximum walking velocity, applies friction, and updates ground movement.
- `ftDk_HeavyWait0_Coll` forwards to `ft_8008403C` with `ftDk_MS_345_800E0294`. The latter requests attribute base plus six with flags 1, freezes animation rate, and converts a grounded fighter to air. However, the shared dispatcher uses `!ft_80082708(gobj)`, while that query returns symbolic `GA_Air`/`GA_Ground` values through a ternary. This pass does not establish the enum's numeric polarity. Therefore the exact loss-of-support interpretation remains unresolved rather than being inferred from rendered HeavyFall naming.

## Cross-file lifetime and exceptional paths

HeavyTurn animation completion and the local stop-walk guard return to the entry routine. HeavyLanding tests its timer before decrementing it and still decrements the shared motion-variable field after the entry call returns. Pickup completion reaches entry only with an available item, a non-LightGet motion, and `x2222_b0`; other branches use generic handling. HeavyWalk, HeavyTurn, and HeavyWait1 reuse the collision wrapper. The owned routines neither allocate nor release the item directly.

`HeavyWait0_CheckInput` and `HeavyWait0_Enter` remain reasonable inferred names, not recovered original names. No compiled section size, literal-pool layout, or register ABI claim is established by this source review.

Status: synthesized; independent review and live promotion pending.
