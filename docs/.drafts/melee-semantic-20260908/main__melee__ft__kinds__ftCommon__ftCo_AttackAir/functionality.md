# Common aerial attack selection and lifecycle

Inherited research provides complete coverage of 29 subjects, 73 facts, and 35 links, including canonical and rendered C/header views. The independent lead reconciled the document and empty proposal against targeted canonical evidence and the rendered C view. Supported existing rows are retained verbatim; rendered substitutions are not independent proof.

## Input and selection

The public input predicate and its local counterpart accept A-button input or `ftCo_800DF478(fp)`. The held-item override requires the unsigned selected-motion offset from `ftCo_MS_AttackAirN` to be at most one, a non-null item, and classification equal to 3. Otherwise the request reaches the roster dispatcher. Both accepted branches return true after dispatch, without guaranteeing a downstream motion change. The item-kind dispatcher includes a no-op default; its explicit cases are item-use paths rather than a generic item throw.

Link and Young Link use the Link-family entry, Mr. Game & Watch uses his dedicated dispatcher, and other kinds use common entry. Despite the CStick suffix, common selection uses C-stick coordinates and angle only when the alternate-input predicate succeeds; otherwise it uses the main stick. Strict neutral-axis thresholds precede strict positive and negative angular thresholds, followed by facing-relative horizontal selection. Angular equality reaches the horizontal test; a horizontal product of zero selects forward.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackAir.c#L29-L123 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0CDD.c#L35-L53.

## Entry and animation

Common entry accepts the supplied motion ID without local range validation. It disables interruption, clears `cmd_vars[0]` and throw flags, changes motion with `Ft_MF_KeepFastFall` and arguments 0, 1, 0, then calls the animation helper. The animation callback conditionally negates facing before independently checking animation completion and entering Fall.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackAir.c#L125-L144.

## Interrupt arbitration and cross-file lifetime

All five directional IASA callbacks expand the same macro. When `allow_interrupt` is false, none of its six checks runs. Otherwise priority is `ftCo_80095328(gobj, false)`, `ftCo_800D7100`, `ftCo_800C3B10`, the local attack-input helper, `ftCo_800D705C`, and `ftCo_800CB870`. The first true result terminates processing.

Acceptance is not necessarily immediate motion-state replacement. Immediate pickup attaches an item; delayed pickup initializes `x209C`. The separate updater searches for an item and decrements the counter, marks `x2224_b1` on expiration, and clears the counter after successful pickup. Existing broad transition descriptions are retained with this scheduling qualification. The two descriptions calling the local item-use branch a throw remain explicitly deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackAir.c#L147-L180 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L272-L341.

## Physics and landing

Physics is an unconditional single-call wrapper. Collision forwards the fighter and `ftCo_LandingAir_EnterWithLag` callback. That callback uses `cmd_vars[0]` and current motion to select one of five dedicated landing states and its attribute lag. A qualifying timing comparison applies divided, integer-truncated lag, replacing a zero result with one. A disabled command or unmapped motion instead enters basic landing; attack-specific landing lag is not unconditional.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackAir.c#L184-L192 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_LandingAir.c#L14-L65.

## Review boundaries

No compiled section-layout conclusion follows from source literals. All three `.sdata2` facts remain unresolved pending compiled evidence. C-stick-only wrapper explanations remain explicitly deferred rather than accepted as complete descriptions. Source comments about stack usage, helper existence, and inlining are not independently verified compiled findings. No cosmetic renames or equivalent fact rewrites are proposed.

Status: synthesized; independent review and live promotion pending.
