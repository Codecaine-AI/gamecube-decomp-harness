## Grounded Escape family

This unit implements input admission, motion entry and lifecycle callbacks for directional EscapeF/EscapeB rolls and neutral EscapeN spot dodge. Inherited research coverage and supported retention dispositions are accepted without changes. Rendered names remain hypotheses, not independent evidence.

### Input and entry

`ftCo_8009917C` prioritizes left-stick X when its absolute magnitude is at least `x31C` and its tilt timer is strictly below `x320`; otherwise it tests C-stick X. The accepted X multiplied by facing selects EscapeF for a nonnegative product and EscapeB otherwise. C-stick admission does not use the left-stick freshness timer. `ftCo_80099264` accepts held L/R and requests EscapeF with the Boolean option false; its Dash caller supplies additional arbitration.

`ftCo_80099794` requires held L/R, left-stick Y at or below `x314`, and a vertical tilt timer strictly below `x318`. `ftCo_8009980C` accepts that stick condition or downward C-stick Y without a local shoulder-button requirement.

Directional dispatch selects Samus, Yoshi or common setup, then calls `ftCommon_8007EBAC(fp, 23, 0)`. Common setup clears throw flags, changes to the supplied motion with `(Ft_MF_None, 0, 1, 0, NULL)`, calls `ftAnim_8006EBA4`, sets `x221D_b5`, and copies the Boolean option into `escape.x0`. Neutral dispatch specializes only Yoshi and converges on fixed EscapeN entry. Neutral common entry does not explicitly clear throw flags or initialize the directional Escape variables.

### Character-specific lifetimes

Samus entry clears `cmd_vars[0]` and `escape.x4`, performs common entry, and installs specialized animation and collision callbacks. Animation separately checks command/latch combinations to enable compact hurt-capsule setup or request restoration, then always calls common directional animation. Collision selects geometry from the command rather than the latch. The shared SpecialLw helpers manipulate capsules; these calls do not themselves enter SpecialLw or spawn a bomb. Restoration on every interrupted exit remains unproved.

Yoshi directional entry selects model group 0 variant 1, initializes a specialized hurt capsule, and installs `ftCo_80099644`. On animation exhaustion this callback clears ground velocity and offers shield resumption. Success returns immediately, skipping cleanup and the final Yoshi update. Failure performs cleanup and calls the action-ending helper, then still calls `ftYs_Init_8012B8A4`. That update also runs while frames remain. Neutral Yoshi entry performs cleanup only when `x5F4_arr[0].idx == 1`, then always enters common EscapeN. Cleanup restores model selector 0, enables capsules and requests effect 1231; these numeric identities are not generalized.

Evidence: [specialized callbacks and entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Escape.c#L96-L259).

### Callback behavior and exits

Directional animation handles scripted facing reversal and clears `gr_vel` on exhaustion before calling `ft_8008A2BC`. Neutral animation delegates on exhaustion without that explicit velocity clear. Completion is not invariably ordinary Wait: the helper has Master Hand/Crazy Hand branches and guarded alternatives, including DownSpot.

Directional IASA delegates to `ftCo_8009563C`. Inherited research establishes item eligibility and a nonzero `itemthrow4.unk_timer` as admission requirements, with LightThrowF4 selected only from EscapeF and LightThrowB4 otherwise. Rejection decrements a nonzero timer. Source declarations place Boolean `escape.x0` and integer `itemthrow4.unk_timer` at the same documented motion-variable offset. Preserve this cross-file lifetime and type ambiguity rather than calling the Boolean unused or assigning an unverified multi-frame duration.

Neutral IASA is empty: it neither reads input nor initiates transitions. Its inactivity does not guarantee that EscapeN persists until animation exhaustion. Both common collision callbacks call `ft_80084104`, which independently enters Fall when its support query fails. Samus's specialized collision path can also enter Fall.

Directional physics delegates to root-motion-versus-friction processing; neutral physics delegates to ground friction and movement. These inherited explanations remain supported, without expanding their scope into global state-lifetime guarantees.

Evidence: [directional callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Escape.c#L127-L196), [neutral entry and callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Escape.c#L228-L278), [Fall branch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1043-L1050), [completion alternatives](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109).

### Reconciliation and evidence limits

All three proposed corrections are supported by independently restored canonical evidence. They retain verified entry and no-op IASA behavior while correcting animation-only lifetime and unconditional grounded-return claims. All unchanged upstream facts and links retain their inherited dispositions.

The duplicate `ftCo_EscapeN_Enter` hypotheses for dispatcher `ftCo_80099894` and initializer `ftCo_800998EC` remain unresolved: canonical source establishes distinct functions, not original spelling. Source literals cannot establish compiled `.sdata2` size, contents, placement or read-only attribution. No compiled artifact was supplied. Numeric helper arguments, field meanings, motion-variable ambiguity and interrupted presentation cleanup retain their stated evidence limits.

Status: synthesized; independent review and live promotion pending.
