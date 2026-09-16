# CaptureDamage translation unit

`src/melee/ft/kinds/ftCommon/ftCo_0DC2.c` implements CaptureDamageHi and CaptureDamageLw entries, their Anim/IASA/Phys/Coll callbacks, and transition adapters. Canonical entries are `ftCo_800DC284` and `ftCo_800DC3A4`; rendered Enter aliases are inferred names, not recovered originals. No source-defined global objects occur here, and baseline section identities do not prove compiled contents or layout.

## Entry and animation

Both entries request the named motion with flags zero, frame zero, rate one, remaining float zero and NULL, clear `capturedamage.x4`, and call `fn_800DB5D8`. Situation-switch helpers instead pass the existing frame and `Ft_MF_UpdateCmd`, without explicitly clearing x4. Both animation callbacks perform `fn_800DB8A4` bookkeeping before testing animation completion and returning to the corresponding CaptureWait state. Both IASA bodies are empty; this is not proof of global non-interruptibility. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0DC2.c#L11-L75.

CaptureWait setup has additional linked-Yoshi behavior, but also unconditional setup; its rendered InitYoshi name understates its scope. Bookkeeping updates the capture counter, grab timer and mash result without a local timer-crossing release. Animation completion delegates to joint animation checks, rather than directly comparing the current frame with zero. Lower-level exhaustion semantics remain delegated.

The active table assigns all eight action callbacks to the named CaptureDamage records with corresponding submotions, `ftCo_MF_Thrown`, and camera-box updating. The reviewed damage dispatcher supports a held fighter's damage reaction, not a pummel-only interpretation. Its zero-knockback or guarded strict-threshold eligibility is only one entry path; other calls occur through inlineB2. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L2598-L2652 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L738-L892.

## Position and transitions

Hi physics always calls `fn_800DAD18`, ignoring its result. The helper computes linked attachment minus current XRotN world position, tests the pre-correction Y displacement strictly against `common.x3C4 * x34_scale.y`, and always adds XYZ displacement to current position. Equality and unordered comparisons return false; arithmetic still runs. No positive-scale or finite-value guard exists, so true does not universally imply positive displacement. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CapturePulled.c#L148-L179.

Lw physics uses that result. Only true requests Hi at the current frame with UpdateCmd, reapplies setup and pair alignment, conditionally invokes the Hi collision dispatcher when x2226_b2 is clear, then copies final current position to the model root. A synchronous nested callback can request Lw before that final copy. False still receives the helper's position correction but skips this callback's explicit model write. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0DC2.c#L77-L103.

Hi collision gates `ft_80083C00(gobj, fn_800DC384)` on clear x2226_b2. Its predicate synchronizes collision positions, performs map collision, copies position back, suppresses success when ft_80081A00 succeeds, and otherwise checks floor flags. The synchronous adapter forwards to fn_800DC404, which requests Lw at the current frame, reapplies setup and alignment. No explicit ground_or_air change occurs in this adapter. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0DC2.c#L35-L65 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L347-L365.

Pair alignment is conditional: a grounded current fighter updates the linked fighter's x2170; otherwise it clears linked x2170 and adds attachment displacement to current position. It is not an unconditional position copy. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CapturePulled.c#L72-L86.

Lw collision similarly gates ft_8008403C with fn_800DC624. That callback performs Hi switching, setup, alignment, optional Hi floor dispatch and model translation without first testing vertical displacement. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0DC2.c#L105-L130.

The Lw dispatch's gameplay meaning remains unresolved: ft_8008403C tests !ft_80082708, while that predicate returns fall_off_ledge ? GA_Air : GA_Ground, with GA_Ground=0 and GA_Air=1. Literal invocation therefore occurs on zero/GA_Ground. Names and family conventions cannot resolve the actual map predicate's meaning. Do not retain a loss-of-support interpretation as proved. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L404, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1035-L1041 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L442-L445.

## Ownership and limits

Engine objects, fighters, linked state, joints and common data are borrowed; this TU allocates and frees none. Valid pointers and stable Fighter user_data across helper calls are preconditions, not locally enforced. Collision adapters are synchronously invoked function pointers, not retained closures. Motion switching installs table callbacks and resets accessory callbacks; capture setup can reinstall its accessory callback.

UpdateCmd selects ftAction_8007349C, not a demonstrated guarantee that every command-state field remains unchanged. Existing-frame forwarding is explicit, but exceptional frame handling belongs to the motion subsystem. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1341-L1389.

No finite-value validation is introduced here. Exact animation exhaustion, malformed-object behavior, global lifetime enforcement, x2226_b2's broader meaning, compiled sections, parameter registers, stack layout and union overlays remain unproved. PAD_STACK, the duplicate-collision TODO and broad Attack100 header inclusion are source conventions, not independent compiled or gameplay evidence.

Status: synthesized; independent review and live promotion pending.
