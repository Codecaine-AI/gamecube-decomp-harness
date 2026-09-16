## Klap Trap actor

The unit implements Klap creation, retained Kongo-stage association, five motion states, damage response, Barrel Cannon positioning and launch, and generic interaction-reference cleanup.

### State dispatch

The five table slots use animation indices **0, 1, 2, 3, 2**; slot 4 is not animation 4. Slots 0 and 1 share callbacks. Their animation callback returns false, physics conditionally alternates the slots after the model predicate and a 30-of-100 random test, and collision processing follows the retained source object's transform with a five-unit downward offset. Missing source and nonnegative child world Z independently request state 2: the callback does not return after the missing-source transition and can request entry twice. The child test is guarded, but the state-2 entry helper itself obtains and passes the child without a null guard.

State 2 clears X/Y velocity on entry, captures the child's position and sets xDCC.b3. Its physics subtracts fall speed and approaches X rotation π/2 by approximately two degrees per update. Animation and collision callbacks return false.

State 3 stops all velocity, marks the item airborne through it_802762BC, selects animation/state 3, calls the shared hitbox helper and installs an accessory callback. Ordinary callbacks are inert. Accessory processing places the item at the stage position plus (-6 sin(angle), 6 cos(angle), 0), with rotation components (π/2, 0, angle, 0). Kongo code retains the captured object, waits, and invokes the item launch path separately from the fighter path.

State 4 is entered by damage setup or the explicit launch path. It initializes independent Y/Z increments of approximately [-5°, 5°), applies gravity and accumulates those increments. Each rotation component receives at most one full-turn correction per update. The launch helper copies position, applies hit data, records knockback and direction, and adds 360 once to a negative input angle—not general modulo normalization.

### Lifetimes and naming assessment

The spawn helper returns NULL for a null source or failed creation and stores the source only after successful creation. The source pointer survives changes in motion control; destruction conditionally passes it to Kongo cleanup and clears it. Generic interaction cleanup clears common Item references, not klap.x20. Accessory installation and state changes must not be interpreted as proving callback lifetime without the common dispatcher implementation.

Existing inferred names remain useful and appropriately qualified, including Fall, DamageFall, EnterBarrel, BarrelLaunch and the numbered SetStatus helpers. Numeric states 0/1 do not establish particular visible animations. Two factual corrections are proposed: state-3 setup is airborne rather than grounded, and its entry routine is externally callable rather than private. Three .sdata2 facts remain unresolved because source literals do not establish compiled section placement or encodings.

Both owned canonical and rendered files were read completely. The header renderer incorrectly reports the it_802E18B4 declaration as shadowed_binding and leaves it unchanged, although the source definition renders as itKlap_Spawn. This is a renderer issue, not evidence against the name.

Status: synthesized; independent review and live promotion pending.
