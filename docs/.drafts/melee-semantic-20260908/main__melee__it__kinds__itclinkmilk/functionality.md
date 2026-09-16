## CLink Milk taunt prop

This unit implements Young Link's attached milk-bottle item. Its two ItemStateTable entries use animation indices 0 and 1 and share all three callbacks. PickedUp selects state 0 only when facing_dir is exactly 1.0f; every other value selects state 1. Both branches request ITEM_ANIM_UPDATE and then call Item_802694CC.

The constructor returns NULL for a missing parent or failed item creation. Success clears four item-command variables and flag xDCC.b3, stores the parent in clinkmilk.x0, and attaches the item at the supplied bone. The fighter's AppealS caller supplies position, facing and the left-thumb bone, stores the returned object in u.lk.x18, and installs damage/death callbacks after successful creation.

The animation callback first applies visibility using the previously stored item command variable: exactly 1 clears JOBJ_HIDDEN, all other values set it. Both locals named child and grandchild obtain the same root child; the code does not traverse to a grandchild. Only afterward does the continuing path sample the fighter command getter and uniformly apply the fighter's common model scale. The removal predicate returns true for a missing fighter/payload, motion other than numeric 342 or 343, or null fighter tracking. It does not establish that the fighter's tracked item equals this item.

On invalid or absent tracking, animation cleanup clears the fighter's reciprocal tracking only when the stored parent is non-null and equals owner, then clears both item references and returns true when its guarded cleanup succeeds. The inline Destroy helper itself does not call common item removal. The animation entry is not generally null-tolerant: it accesses the item and model before those cleanup guards.

The public teardown routine separately tolerates a null object or payload, clears parent and owner, and calls Item_8026A8EC. Its fighter-side caller subsequently clears u.lk.x18. Physics is empty; collision always returns false. The reference event forwards its two arguments to generic interaction-reference cleanup, ignoring the result. That helper does not clear clinkmilk.x0; the surrounding removal loop separately tests its saved pre-callback owner and the owner-dependent flag.

## Semantic review

Existing rendered Spawn, Appeal_Anim, PickedUp and EvtRemoveReference hypotheses fit canonical behavior and are retained without claiming recovered original spelling. Existing supported explanations and all 17 links are retained. Seven small-data facts remain unresolved because source-level literals and JObj calls do not prove compiled section contents or placement. No equivalent wording is rewritten. One useful missing detail is proposed: visibility/sample ordering and the identical model-node expressions.

Status: synthesized; independent review and live promotion pending.
