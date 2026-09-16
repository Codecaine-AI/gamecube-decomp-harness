## Kirby item-capture controller

This unit reconfigures an existing item for Kirby's Inhale; it does not allocate a grab box. Grounded and aerial capture callers pass `target_item_gobj`, Kirby's object, and negated Kirby facing to `it_802F23EC`. Initialization stores Kirby in both victim-reference fields, installs the two-entry state table, selects state 0, snapshots capture-relative X/Y displacement, movement limits, scale parameters and original model scale, and installs `it_802F258C`.

Both table entries contain motion index -1. Their animation and collision callbacks return false, and their physics callbacks are empty. These numeric item states should not be conflated with similarly numbered fighter capture states.

State 0's accessory evaluates the length of the saved displacement with Z explicitly zero, before reducing that displacement. Only when distance is strictly below `x1D0` does it write model scale, multiplying the saved scale by `(1 - x1D4) + x1D4 * distance / x1D0`. Otherwise it leaves model scale unchanged. It independently bounds X/Y steps, subtracts them from the residual displacement, queries the current capture anchor, and writes anchor plus residual X/Y and anchor Z. The code does not validate tuning values or implement a local completion transition.

`it_802F23AC` returns squared XYZ distance without mutation. Kirby's caller compares this against squared inhale velocity using a strict less-than test. Success invokes `it_802F2810`, then selects grounded Eat or aerial EatAir fighter continuation.

State-1 entry selects item state 1 with argument 0, replaces the accessory with `it_802F289C`, and invokes shared setup helpers. Crucially, `ftKb_SpecialN_800F5800` assigns fighter `cur_pos` through its Vec3 output pointer. Thus state 1 copies Kirby's position into `Item.pos`; it does not report item position to Kirby. The owner reference survives the state change, and this unit supplies no local lifetime/null guards or cleanup.

## Semantic assessment

The rendered `UnkMotion1_Enter` and `UnkMotion1_Accessory` names fit their canonical registration and behavior and are retained. The rendered external position-getter name agrees with its separately inspected implementation; that implementation, not the rendered name, proves direction. Existing explanations reversing this flow require correction. The dox grab-box suggestion remains speculative. Source-visible table and literal uses do not establish compiled section sizes, string pools, or conversion-constant placement.

Status: synthesized; independent review and live promotion pending.
