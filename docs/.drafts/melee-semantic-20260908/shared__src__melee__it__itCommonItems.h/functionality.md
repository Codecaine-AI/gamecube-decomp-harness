## Shared item declarations
`itCommonItems.h` collects item-specific runtime-variable and attribute structures for common items, Pokémon, stage entities, and fighter projectiles. It contains declarations rather than gameplay implementations. Many members intentionally retain offset-based names, padding, unknown flags, or alternative union interpretations.

Notable source-level relationships include the explicit `itLGunRay_ItemVars` alias of `itRay_ItemVars` (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itCommonItems.h#L318-L332), the Pokémon spawn-weight array bounded by item-kind constants (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itCommonItems.h#L1178-L1192), coin-related nested state and three tier entries (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itCommonItems.h#L1250-L1302), and Yaku's joint/vector union plus ground callbacks (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itCommonItems.h#L1314-L1325). The final Scope Beam attributes contain nine velocity/scale/lifetime records (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itCommonItems.h#L1698-L1709).

## Semantic assessment
All canonical and rendered pages were reviewed through EOF. The renderer reported zero substitutions and zero parse errors; it did not introduce alternative names. Existing descriptive declarations are left unchanged: no supported factual correction or meaningfully better name was established. Both baseline enumerations are empty, so there are no facts or links requiring retention or exception rows.

Header comments document intended meanings, not independently verified control flow or lifetimes. In particular, Box cleanup documentation does not establish the complete destruction protocol, and numeric timer/state comments do not establish every exceptional branch. Source size assertions and offset comments are not treated as compiled-layout evidence.

Status: synthesized; independent review and live promotion pending.
