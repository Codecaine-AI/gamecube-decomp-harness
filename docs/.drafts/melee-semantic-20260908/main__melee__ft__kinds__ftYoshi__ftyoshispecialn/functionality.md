## Yoshi neutral special: attacker-side Egg Lay

The inherited research establishes complete canonical/rendered coverage of both owned files and enumeration of 121 subjects, 338 facts, and 77 links. The lead independently checked every proposed fact's canonical citations and the contradiction evidence. Retain the inherited 287 supported facts and all 77 links; accept the 13 supersessions and 38 unresolved dispositions without semantic overrides.

### State progression

Grounded and aerial entry clear command variable 0, select their opening motion, initialize animation, and register separate fighter-victim and target-item callbacks. Capture callbacks preserve the current animation frame. Item callbacks set the SpecialN branch flag and install damage/death cleanup; fighter-victim callbacks clear that flag. The four subsequent N1 animation callbacks require both command variable 0 and an extant selected target before clearing command variables 0 and 1 and entering their respective N2 states at frame zero. Failed guards leave those commands untouched. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialn.c#L129-L355.

N2_0 handles a fighter victim: command 1 requests victim invisibility/collision processing, while command 0 separately performs the throw/YoshiEgg handoff. Each command is cleared only when its victim exists. N2_1 handles the item outcome: command 1 tears down an extant target-item association and clears both references; command 0 independently requires the one-shot branch flag, assembles EggLay article attributes, invokes creation, and clears its gates without testing a creation return value. Animation exhaustion is checked afterward. Grounded completion uses the common action-ending dispatcher; aerial completion uses Fall. Preserve the inherited finding that the grounded dispatcher has exceptional branches and is not an unconditional Wait transition. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/ftyoshispecialn.c#L357-L447.

### Physics, collision, and lifetime

Grounded physics delegates to friction selection and ground movement; airborne physics delegates to gravity/terminal-velocity and aerial-friction processing. The above-walk-speed multiplier is visible, but its numeric value was not established. Collision wrappers register phase-paired conversions. Opening conversions restore capture callbacks; item-phase conversions restore damage/death callbacks. Physical ground-loss interpretations remain deferred: enum return labels and a negated dispatch guard must not be treated as self-proving physical semantics. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L53, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1035-L1041.

Retain the inherited cross-file cleanup ownership: the installed Yoshi dispatcher invokes held-egg and target-item cleanup. Target cleanup checks item presence and selects clear_destroy_type for the four item-branch motions before clearing the association and references. Normal N2 item processing instead passes false.

### Accessors and corrections

Per-fighter attributes supply initial velocity, damage behavior, growth parameters, and duration inputs; facing is read from fighter state. Global Yoshi attributes supply captivity decay, mash processing, animation-pulse timing/rate, breakout velocity, release duration, and the unguarded x44/x18 ratio. Victim processing continues in the common YoshiEgg implementation after handoff, including a separately guarded forced-expiry damage branch.

The aerial OnGrab hypothesis obscures an item-specific callback. GetEggJObj incorrectly suggests a live HSD_JObj rather than an HSD_Joint model definition. The release accessor's bool spelling does not restrict its result to zero or one because this project defines bool as int. Its consumer only extends the integer countdown when the requested value is larger, selects numeric state 2, and runs before YoshiEgg fall entry.

The x1C getter supplies the shared scale coefficient; x20 supplies the progress denominator. The multiplier is applied separately to saved fighter-model and accessory scales, not between those scales. Preserve x14's unusual initialization from mv.co.walk.fast_anim_frame. The x24 getter supplies article lifetime and a grab-initialization duration input; exact configured values, units, and the complete duration formula remain unestablished. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_YoshiEgg.c#L40-L152.

No compiled section size, address, adjacency, or literal-pool association is established by these source reads. The inherited locator erratum for fact:90ca8c3b-515c-4c99-b6db-e7e4082a202f refers to code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L1041; its semantic disposition is unchanged.

Status: synthesized; independent review and live promotion pending.
