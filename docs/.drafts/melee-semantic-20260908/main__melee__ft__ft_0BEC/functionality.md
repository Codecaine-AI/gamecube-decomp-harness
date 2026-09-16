## Review scope
Full coverage of both owned files, 14 subjects, 41 facts and 13 links is inherited from the hash-bound research handoff. This distinct lead independently read the proposal and functionality artifacts, the owned C file in canonical and rendered form, and the indicated canonical demo caller, alternate motion table and callback-field definitions. No selectable ancestor cache was listed. Previous validation failure and unvalidated artifacts are not correctness evidence.

## Canonical behavior
The header declares six `void(Fighter_GObj*)` exports. Three initialize fighter presentation state; three have empty bodies.

`setupInitialState` sets `x2219_b2`, `x2219_b1` and `x2228_b1`, then clears `item_gobj` and `x1984_heldItemSpec`. It does not locally destroy the previously referenced objects. Each initializer calls `Fighter_ChangeMotionState` before this reset, with `Ft_MF_None` and floating arguments `0, 1, 0`.

* `ftCo_800BECB0` supplies `ftCo_MS_DeadDown`. Only Fox receives the Blaster constructor call using his configured item kind and mapped right-thumb part. Its result is retained and passed to the scale utility with `Y scale * model_scaling`.
* `ftCo_800BED88` supplies `ftCo_MS_DeadRight`. Fox receives the same setup. Dr. Mario receives two vitamin constructor calls, each with a separate variant-selection call, using selectors 1 and 0 and separate pointer slots. Each scale is `0.71428f * (Y scale * model_scaling)`. Other kinds receive only shared initialization.
* `ftCo_800BEF04` supplies `ftCo_MS_DeadUpStarIce`. Only Ness receives the right-thumb bat constructor and scale `0.8f * (Y scale * model_scaling)`.
* `ftCo_800BED84`, `ftCo_800BEF00` and `ftCo_800BEFD0` do nothing. Constructor results are not locally tested before being passed to the scale utility; callee failure behavior is not established here.

See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0BEC.c#L18-L117 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0BEC.h#L6-L11.

## Cross-file interpretation
The initializers are demo creation callbacks 0, 1 and 2. `ftDemo_CreateFighter` installs `ftData_803C52A0` before invoking the selected callback. Death-themed enum spellings therefore do not independently establish gameplay KO behavior. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L42-L70 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L123-L127.

The three empty functions occupy the animation callback fields of alternate-table entries 0, 2 and 5. In particular, `ftCo_800BEFD0` is registered against `ftCo_SM_Unk005`, with its camera field NULL. It is distinct from `ftCo_800BEFD4` in the demo creation table. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L3887-L3947 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L878-L882.

## Retention and uncertainty
The rendered `ftCo_DeadUpStarIce_Cam` hypothesis conflicts with callback registration. Its rejection is retained. Other retained names and local descriptions are accepted only for symbolic calls and immediate behavior, not as independent evidence of gameplay death semantics. Family-wide naming and domain reconciliation remain deferred.

Source literals do not establish a 16-byte `.sdata2` pool, its representation or placement. Pointer clearing and constructor-result retention are locally supported; cleanup, constructor failure behavior and repeated-initialization safety remain cross-file questions.

The empty proposal agrees with these boundaries. Rejected hypotheses remain unapplied ledger findings; this packet does not claim to remove existing KB values or to have passed canonical validation.

Status: synthesized; independent review and live promotion pending.
