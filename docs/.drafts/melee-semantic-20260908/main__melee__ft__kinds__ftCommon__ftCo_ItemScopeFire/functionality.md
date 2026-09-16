## Super Scope Fire

This unit implements fighter-side grounded and airborne Super Scope firing: fresh entry, ground/air continuation, animation completion, physics and collision callbacks, damage handling, and the shot-event helper. The header declares `fn_800D84D4(Fighter_GObj*, int)`.

### Entry and continuation

`fn_800D8140` and `fn_800D81D0` clear throw flags, map the corresponding Fire motion, start it at frame zero and normal speed, retain the integer selector in `mv.co.common.x0`, and install accessory and damage callbacks. Air entry additionally clamps aerial drift. The reciprocal collision continuations preserve current frame and playback multiplier using literal flags `0x0C4C5080`, restore callbacks, and clamp drift on conversion to air. These flags are not treated as a fully decoded preservation contract. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemScopeFire.c#L12-L74)

### Shot event

`fn_800D86B8` forwards the stored selector to `fn_800D84D4`. The helper requires a held item and acceptance by `ftCheckThrowB0`, obtains the item's offset, and transforms it through the fighter's item bone. Values 0, 1–8, and 9 request an item-side shot; all other integers take the no-projectile fallback. Valid shots use effect `0x430`, with sounds `0xFC` for 0, `0xFF` for 1–4, and `0x100` for 5–9. The effect position's Z is zeroed after the projectile request. Fallback instead uses effect `0x405` and sound `0x101`, without that explicit Z reset. It is not a local ammunition test. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemScopeFire.c#L125-L167)

The item-side routine subtracts level-dependent ammunition, clamps negative ammunition to zero, and forwards the item owner and shot parameters to beam construction. Upstream selection can return -1 for an empty weapon, but its insufficient-ammunition loop also has a visible fall-through path without an explicit return; this review does not normalize that path to a valid selector. Projectile lifetime and successful allocation are not established by the fighter-side request. [Item source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itsscope.c#L109-L154)

### Other phases

Both animation callbacks wait for a false animation-remaining result, then invoke the situation-sensitive ordinary-state exit followed by mode-1 character pickup handling. Unlike the damage callback, these bodies do not test the held-item pointer first. The damage callback only delegates when an item remains held; it does not itself change motion. Both IASA callbacks are empty, which establishes no input transitions from those slots, not immunity to external interruption. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemScopeFire.c#L76-L103)

Ground physics delegates to friction and grounded movement, with a symbolic friction multiplier above maximum walking speed. Air physics delegates to fast-fall checking, fast-fall or ordinary gravity, then horizontal aerial movement. Ground collision invokes its air continuation only on a false support result; air collision invokes its ground continuation only on a successful shared collision result. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemScopeFire.c#L105-L123)

### Evidence limits

Rendered names were reviewed as hypotheses, not proof of canonical names. No compiled artifacts were supplied, so source literals do not establish `.sdata2` contents or layout. Cross-file Rapid registration remains unresolved in the link ledger.

Status: synthesized; independent review and live promotion pending.
