## Hazard-warning controller

`ifhazard.c` implements the shared animated warning UI with constructor variants labeled Onett (0), Mute City (1), and Big Blue (2). Its header exposes the controls, callbacks, constructors, and lifecycle hooks.

The common constructor creates a UI GObj, loads the supplied descriptor's joint, attaches it, invokes descriptor animation setup, and registers GX and process callbacks. It clears activity and suppression and stores the new object pointer. Only selector 0 adds 18 units to the root's existing X translation; selectors 1, 2, and unmatched integers receive no translation adjustment. There is no local allocation-failure recovery or descriptor-null guard.

Activation retrieves the retained object's JObj, requests animation frame zero, immediately evaluates animation, replaces the signed countdown, and sets activity. It does not clear suppression. Each process invocation decrements a nonzero countdown, clears activity when the result reaches zero, and advances animation regardless of activity or suppression. Zero therefore disables countdown-driven expiration. Negative arguments are not validated and decrement away from zero; no safe finite lifetime or signed-overflow behavior should be inferred.

The GX callback forwards its original arguments only when activity is nonzero and suppression is zero. Explicit deactivation clears activity without clearing the countdown. The suppression pair changes only rendering eligibility and participates in aggregate HUD hide/show dispatch. This does not prove that the global scheduler runs during a pause.

Both lifecycle hooks are empty. Their positions in aggregate HUD startup and teardown support the existing Init/Free name hypotheses, but neither performs resource management. Construction overwrites the retained pointer without locally releasing an earlier object and leaves the countdown unchanged. External object cleanup and descriptor lifetime remain outside the demonstrated local lifecycle.

## Semantic review

The existing controller explanations and Proc/Create/CreateBigBlue names largely fit canonical behavior. The rendered source and header report Show/Hide collisions because activation/deactivation and suppression controls share proposed names. Renaming the activity controls to Activate/Deactivate resolves the collisions while preserving the HUD-oriented Show/Hide pair. The suppression explanation also needs its constructor-reset exception.

Source declarations and floating-point uses support state roles and constant semantics, but do not prove compiled section sizes, contiguous layout, string pooling, padding, or literal-pool representation. Five baseline section facts remain unresolved rather than being silently validated.

Status: synthesized; independent review and live promotion pending.
