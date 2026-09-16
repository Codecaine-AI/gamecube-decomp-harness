## Maxim Tomato implementation

The unit defines a six-entry item-state table and the Maxim Tomato's construction, recovery-attribute initialization, lifecycle events, and update callbacks. The header declares its public interface and state table.

### Creation, recovery configuration, and lifetime

`it_802841B4` creates `It_Kind_Tomato` only when its first object argument is nonnull. That argument is a guard, not the parent passed to `Item_InitSpawnOnPlane`. A missing guard or failed creation returns NULL without Tomato-specific writes. Successful creation sets the tracking flag and stores the supplied index. The destruction callback clears `gm_80473A18.x90[index]` only when that tracking flag is set; it does not perform generic destruction itself.

The spawned callback initializes velocity to `(0, sa->x14, 0)`, loads `heal_amount_0`, clears tracking metadata, and selects state 0. `it_8028428C` instead copies `heal_amount_1` into the active recovery field. The external dispatcher calls this alternate initializer after successful creation and a Tomato-kind check in cases 8 and 9. Neither the numeric attribute values nor the tracking index's validity are established by this unit. These routines configure recovery rather than directly heal a fighter.

### State behavior

- **0:** Initial falling state. Physics forwards configured fall speed and maximum fall speed; collision supplies the state-1 entry helper to shared guarded landing processing.
- **1:** Stationary state entered after clearing all velocity components. Physics is empty. Failed floor contact routes through the state-2 entry helper. The shared floor helper also has a separate supported-floor branch invoking `Item_8026ADC0` under its own guard.
- **2 and 4:** Share all three callbacks. Their physics performs the configured fall update and collision can settle the item into state 1. State 4 is selected on dropping with `ITEM_ANIM_UPDATE | ITEM_DROP_UPDATE`; state 2 is selected by the ordinary falling-entry helper.
- **3:** Selected on pickup after revealing the first-child model hierarchy. Physics is empty and the table's collision callback is NULL.
- **5:** Selected by EnteredAir. Physics is empty. Collision immediately selects state 2 when no floor exists; supported terrain selects state 1 only when the shared helper's flag/counter guard permits. Otherwise state 5 can persist.

Every local animation callback returns false without work. Every local collision wrapper also returns false, but shared-helper side effects and other engine lifetime processing must not be mistaken for a guarantee that the item survives. All table animation identifiers are -1; requesting animation updating is not evidence that a concrete animation plays.

Pickup and drop clear `JOBJ_HIDDEN` recursively from the root's first child. The shared JObj routine accepts NULL and stops recursion below instance boundaries. The unknown-event wrapper forwards both objects to shared reference cleanup, which selectively clears matching ownership and interaction pointers and resets the source-player field to 6 when its fighter-source reference matches.

### Semantic review

Existing rendered names fit canonical behavior and are retained as hypotheses, not recovered original names. Numeric state distinctions remain important: the shared falling callbacks serve both 2 and 4, and the landing/falling entry helpers also serve state 5. The alternate-heal setter has a useful supported name missing from the baseline, proposed below.

Both owned files were read completely in canonical and rendered form, and all subject and link pages were enumerated. The header renderer reports `shadowed_binding` for the spawn declaration. Its first parameter is spelled `Item_GObj*` in the header versus `Fighter_GObj*` in the definition; no ABI incompatibility is inferred from those spellings alone. The three `.sdata2` facts remain unresolved because source literals do not prove compiled constant-pool placement, extent, or contents.

Status: synthesized; independent review and live promotion pending.
