## Kirby copied-Samus Charge Shot

The unit implements grounded startup, charging hold, cancellation and firing, plus aerial startup and firing. Canonical callback registration annotates states 407–412 (0x197–0x19C), including cancel at 409 and firing at 410; rendered names alone are not evidence for these mappings.

### State and article lifetimes

`u.kb.xA4` tracks the held shot, `xA8` stores charge, and `xAC` is cleared with fighter-effect cleanup. The charge query returns -1 for a null fighter or absent held shot; otherwise it writes current charge and the converted configured maximum. The first lifetime predicate returns the fighter flag within states 0x197–0x19C and true otherwise, including null. The second returns true for null, out-of-range states and exceptional in-range state 0x199. Item-side queries and destruction detachment have originating-owner equality guards; destruction detachment additionally requires an unreleased Kirby-specific shot.

Detachment clears fighter references and effects without destroying the item or resetting charge. Cancellation cleanup removes the held item and effects but preserves charge. Full reset additionally clears charge. Release launches the item before relinquishing its fighter-side reference.

### Startup, charging and input

Both entries reset animation commands and per-use work without resetting stored charge. Ground entry clears vertical velocity and sets the origin selector to zero; aerial entry sets it to one. Startup consumes command 0 only when it equals one and no held shot exists, computes a hand-relative position with flattened world z, and attempts article creation. Failure leaves a null pointer and requires another command for another attempt. Animation completion is independent of creation success. Ground startup chooses firing when the origin selector equals one or charge exactly equals the configured maximum, otherwise hold. Aerial startup proceeds to aerial firing. The exact equality must not be generalized to >=.

Hold consumes command 2 for charge-indexed sound feedback using a six-entry u32 array: five nonzero IDs followed by zero. Charge advances when the incremented timer is strictly greater than the configured interval. Maximum charge triggers feedback, clamping, cancel entry and charge-preserving cleanup. Sound indexing has no local bounds guard for abnormal charge or attributes.

Hold IASA gives the common escape check first priority. Otherwise `input.pressed_buttons & 0x200` selects 0x19A and returns after callback setup; only then can `input.pressed_buttons & 0x80000000` select 0x199 with cleanup. Historical continuously held-input descriptions are stale. The other five IASA callbacks are locally empty, not proof of immunity to other interruption systems.

### Release and completion

[Release](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialsamus.c#L201-L232) requires command 1 equal to one and a retained shot. It changes the command to two, computes a hand launch position and launches using current and maximum charge. Facing exactly 1.0 selects angle zero, otherwise pi. Aerial firing motion or airborne status triggers charge-scaled horizontal recoil. Release then clears charge and held-shot/effect state, spawns effect 0x4A4 and restores the saved unrelated `item_gobj`.

Both firing animation callbacks invoke release before checking completion. Ground firing and cancellation use common action completion, normally Wait but with exceptional branches. Air firing chooses ordinary Fall for a zero configured value; otherwise that value is passed as landing lag to special-fall entry, which also has an exceptional redirect.

### Physics and collision

Four grounded physics callbacks delegate to shared ground friction/movement; two aerial callbacks delegate to shared falling and aerial friction. Startup and firing collision transitions preserve their phase. Hold ground-loss uniquely plays sound 0x3F7B5 and arms command 1. Cancel ground-loss enters AirN but neither creates a shot nor arms release: this transition does not guarantee firing after cancellation removed the article. Preserve literal collision-result comparisons rather than treating their enum names as the fighter's current status.

Inherited research covers all 69 subjects, 181 facts and 56 links, with 173 retained facts, four superseded facts, four unresolved facts, 54 retained links and two unresolved links. Lead checks independently reconcile all proposed facts and upstream non-retain claims. Names remain semantic hypotheses. Source literals and authored arrays do not independently establish compiled section layout, alignment or extent.

Status: synthesized; independent review and live promotion pending.
