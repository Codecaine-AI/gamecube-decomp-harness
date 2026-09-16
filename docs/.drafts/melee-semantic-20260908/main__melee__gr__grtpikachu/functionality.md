# Pikachu Target Test stage controller

The unit registers `Gr_Kind_TPikachu`, `/GrTPk.dat`, lifecycle callbacks and three populated Ground callback records followed by a null record. The header declares the matching interfaces. This is source-level configuration evidence, not proof of compiled section placement.

## Initialization and callback lifetime

`grTPikachu_80222E80` supplies `grTPikachu_80222F20` to `Ground_InitTargetStage`. The shared inline clears `stage_info.unk8C.b4`, sets `b5`, invokes the installer for IDs 0, 1 and 2, then calls four shared Ground setup routines. Installer results are not checked by that inline. The installer indexes the callback table without a local bounds check, obtains the corresponding Ground GObj, and either performs callback setup or reports lookup failure before returning the nullable result.

Successful setup clears two Ground callback fields, establishes the GX link, stores callback3 when present, immediately invokes on_init, and schedules gobj_proc at priority 4. This path does not consume callback1 or the record flags. Consequently the constant-false predicates and row-2 value `0xC0000000` remain table facts, not evidence of predicate dispatch or flag-driven behavior on this path.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpikachu.c#L12-L75 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L33-L62.

## Ground components

Row 0 initializes archive-backed animation using the object's map ID and index zero; its process and fourth callbacks are empty. Rows 1 and 2 use `Ground_JObjInline1`, which performs joint setup followed by the same animation helper. Row 1's process forwards its GObj to `Ground_801C2FE0`; row 2 first calls parameterless `lb_800115F4`, then the Ground helper. Both discard the Ground helper's Boolean result. The helper conditionally updates collision joints, including archive-provided joints, rather than unconditionally changing geometry. Visible course components corresponding to IDs 1 and 2 remain unidentified.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpikachu.c#L77-L137; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L30; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/granime.c#L988-L1048; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/ground.c#L1676-L1732.

## Stage hooks and manager ownership

Demo initialization and loading are inert. Stage start calls `grZakoGenerator_801CAE04(NULL)` and ignores its result. The callee creates a scheduled manager and publishes descriptor/data pointers on success; GObj creation failure reports an error, frees the newly allocated data and returns NULL. The wrapper neither retries nor retains the manager pointer. This is manager startup, not direct target or fighter creation.

The stage-level Boolean callback returns false. The touch-line hook ignores its argument and returns no DynamicsDesc; that does not remove ordinary collision geometry. The shadow eligibility hook ignores all three arguments and returns true, without guaranteeing that every later rendering condition succeeds.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpikachu.c#L36-L59; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grzakogenerator.c#L303-L329; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpikachu.c#L139-L147.

## Semantic review

Retain the existing descriptive lifecycle and callback-slot names: canonical registrations support them independently of the rendered substitutions. Three corrections distinguish source declarations from compiled layout, separate the shared initializer from its ID-taking callback, and replace the misleading description of a void start callback as non-returning. The header renderer reports shadowed bindings for `grTPikachu_80223150` and `grTPikachu_80222F20`; this is a rendering limitation, not a signature discrepancy. The rendered wind-effects name for the external library call is not independently established by this review.

Status: researched; no-change lead bypass; independent review and live promotion pending.
