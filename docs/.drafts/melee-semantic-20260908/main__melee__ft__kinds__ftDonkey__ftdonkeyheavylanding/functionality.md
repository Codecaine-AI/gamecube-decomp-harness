# Donkey heavy landing and damage-reaction TU

## Scope and interface
The owned implementation is `src/melee/ft/kinds/ftDonkey/ftdonkeyheavylanding.c` (93 lines), with a 14-line header declaring six public `void(HSD_GObj*)` functions. `checkSomething` and `doSomething` have preceding static declarations and internal linkage. There are no local allocations, global C objects or explicit callback registrations. The baseline `.sdata2` identity does not establish compiled contents.

Canonical implementation: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavylanding.c#L1-L93.

## Landing callbacks
`ftDk_HeavyLanding_Phys` forwards to `ft_80084F3C`, which applies ground friction and movement. Its above-walk-speed friction multiplier uses a strict greater-than comparison; equality does not select it. `ftDk_HeavyLanding_Coll` delegates to `ftDk_HeavyWait0_Coll`. That path synchronously invokes the heavy-fall entry callback when its ground query returns zero. The destination requests attribute base+6, freezes animation rate and converts a grounded fighter to air. Unlike HeavyWait2 collision handling, this path requests another motion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavylanding.c#L19-L27; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavywait0.c#L56-L59; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1035-L1041; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavyturn.c#L44-L54.

## Heavy-item damage dispatch
`ftDk_MS_349_800E06D8` is a damage dispatcher, not demonstrably restricted to motion 349. The common caller reaches it after earlier damage and victim branches, with a non-null heavy item and `x2222_b0` set. The item predicate tests `x0_is_heavy == 1`. The caller does not locally verify Donkey fighter kind. Valid attributes and object lifetimes are engine preconditions.

`checkSomething` first tests `ftCo_8008E984`: zero applied knockback, or `allow_sdi && x221A_b3 && kb_applied < x18A8 + common.x140`. Otherwise it scales knockback by common.x154 and accepts classifier results below 3. The classifier uses strict comparisons against x158, x15C and x160 and returns 0 through 3. The pinned C bool typedef is int, not a normalizing C++ bool. Threshold equality advances to the next comparison. NaN scaled knockback fails every comparison and reaches class 3. Threshold ordering, tuning values and exceptional-input safety are not established; caller reachability is narrower than direct predicate capability.

The true branch calls internal `doSomething`, which requests `ftCo_8008DCE0(gobj, motion_state + 9, 0)`. Zero means no facing override. The common initializer's automatic-motion sentinel is exactly -1. Crucially, an explicit motion other than 0x145 can be replaced with 0x5A for Ice at base knockback class >=2. Thus base+9 is a request, not an unconditional final HeavyWait2 state. Common initialization calculates damage movement and countdown, changes motion and installs persistent hitlag/post-hitlag callbacks and damage flags; their eventual clearing is outside this TU.

The false branch initializes a stack Vec3 to zero, calls `Item_8026ABD8(fp->item_gobj, &vec, 1)`, then `ftCo_8008E908(gobj, 0)`. The third item argument is f32 copied to xC44, not a proved mode. The vector consumer copies and scales velocity input rather than retaining the stack pointer. Zero input does not guarantee zero final velocity after exceptional multipliers or item-specific callbacks. The drop routine invokes the item's dropped callback and subsequent attachment/ownership-related notifications. This TU does not directly free the item or clear the fighter's item pointer; complete destruction/reentrancy guarantees remain unresolved. The following common damage entry has an element-specific branch for elements 6 or 7 with !x2228_b2, otherwise using automatic motion selection.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavylanding.c#L29-L62; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L105-L116; code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/stdbool.h#L6-L6; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L668-L694; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L838-L966; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L419-L469; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1994-L2009; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L774-L923.

## HeavyWait2 callbacks
`ftDk_HeavyWait2_Anim` calls the common damage updater, then tests the updated x221C_b6 flag. The updater decrements a positive countdown and clears an active flag when the countdown is nonpositive. Countdown 1 can therefore permit exit this tick; an already-clear flag also permits exit with positive countdown. There is no local animation-completion guard. Exactly GA_Air selects the base+6 recovery destination; every other value selects the base destination. The saved Fighter pointer must remain valid across the updater.

`ftDk_HeavyWait2_Phys` delegates unconditionally to `ftCo_Damage_Phys`. That helper selects different airborne physics according to the damage flag and uses ground friction otherwise.

`ftDk_HeavyWait2_Coll` tests exactly GA_Ground, calls ft_80082708 and invokes ftCommon_8007D5D4 only on zero. Otherwise it calls ft_80081D0C and invokes ftCommon_8007D7FC only on nonzero. Both queries update collision and Fighter positions even if the mode helper is skipped. Their enum return labels are truth values here, not desired fighter modes. The air helper sets GA_Air, resets velocity/position components, uses one jump and locks ECB for 10. Grounding clamps velocity, resets jumps/wall jumps, unlocks ECB and asserts ground support. Neither inspected mode helper directly changes motion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyheavylanding.c#L64-L92; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L968-L984; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Damage.c#L1076-L1088; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L404; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L594.

## Names, consumers and evidence limits
The active table registers the landing Phys/Coll callbacks for HeavyLanding and three callbacks for HeavyWait2, with null IASA. Cargo uses separate callbacks, including CargoLanding_Coll. This is heavy-item behavior, not carried-opponent Cargo behavior. Registration does not establish the runtime-loaded attribute base or unconditional base+9 identity.

Rendered names are hypotheses, not proof of original names. HeavyItem_Damage is a reasonable descriptive alias; HeavyWait2_Enter and ShouldKeepItemOnDamage require the runtime-base and Ice qualifications. The renderer's colliding ftCo_Damage_Enter suggestions refer to distinct canonical callees and remain unresolved.

No compiled section or ABI evidence establishes .sdata2 payload, literal placement, parameter register identities, widths, padding or object ownership. No facts are proposed for .sdata2 or parameter subjects. Exceptional numeric inputs, invalid motion-base arithmetic and cross-file callback lifetimes remain explicitly deferred.

Table evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L129-L160; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L239-L249.

Status: synthesized; independent review and live promotion pending.
