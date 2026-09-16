## Food item implementation

`itfoods.c` implements Food creation, randomized variant configuration, variant-dependent positioning, and four-state item dispatch. The header declares its externally used helpers and state table.

### Creation and configuration

`it_8028FAF4` first checks the Food-kind gate and returns NULL if disabled. On the enabled path it copies the supplied position into `SpawnItem.prev_pos`; a non-NULL source object supplies the current position through `it_8026BB68`, otherwise current and previous positions match. It initializes facing to -1, velocity and damage to zero, both parent references to NULL, and the visible fixed descriptor fields. It returns the common constructor's result and calls `it_80274ED8` only on success. The position pointer is needed on the enabled path, not dereferenced before the gate.

The spawn callback uses the configured attribute count as the random bound, stores the selected healing amount and variant index in the item, forwards the selected setup value to `it_80273318`, and enters state 0. It does not apply healing or locally validate the selected index. The positioning helper reuses that index for horizontal and vertical offsets, multiplies the horizontal offset by the supplied orientation, copies supplied Z unchanged, and synchronizes the model translation. See [creation and configuration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoods.c#L36-L100).

### State behavior

- **0 — falling:** constant-false animation callback, shared attribute-driven falling physics, and terrain collision that lands through `it_8028FCE8`.
- **1 — resting:** landing clears velocity, requests sound 0x107 with pan 0x7F and volume 0x40, then enters state 1. Animation and physics callbacks are inert. Support loss routes back to state 0.
- **2 — held:** pickup clears `JOBJ_HIDDEN` on the first-child hierarchy before entering state 2. Animation and physics callbacks are inert, and the collision slot is NULL. Hierarchy traversal tolerates NULL and stops descending at instance boundaries.
- **3 — dropped:** the drop event selects state 3 with numeric flags 6. Its falling physics and landing collision parallel state 0.

All local animation and collision callbacks return false. Their inert returns do not establish indefinite object lifetime: common item processing has independent lifetime and destruction paths. All four table animation IDs are -1; requesting `ITEM_ANIM_UPDATE` therefore does not imply loading an animation resource. The common state changer removes animations and clears the script pointer for that ID, then installs the selected callbacks. See [Food dispatch and callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoods.c#L26-L180) and [common state selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1181-L1231).

The shared falling helper uses a sign-dependent pre-update speed threshold, not a numerical clamp; one update can overshoot the threshold. Terrain processing preserves non-floor contact handling before the floor-triggered landing callback. Ground-support processing also contains a guarded `entered_air` dispatch on its supported branch, so its complete behavior is broader than a simple support-loss test. See [falling update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204), [airborne collision](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L554-L581), and [support processing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L44-L70).

### Cross-file lifetimes

Fly Guy creates Food, retains its pointer, positions it, and invokes the Food pickup callback. Thus held state 2 is not exclusive to a fighter's pre-consumption interval. Carrier updates supply facing and an explicitly adjusted Z. Carrier release invokes the Food state-0 entry helper and then clears the retained reference; it does not use the Food state-3 drop callback. A separate carrier boundary path invokes another helper and clears the reference. See [creation and pickup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheiho.c#L64-L76), [release](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheiho.c#L250-L259), and [placement and boundary handling](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheiho.c#L368-L407).

Mr. Game & Watch's Judgment setup creates Food for internal result 6, corresponding to displayed number 7. The generated Food is separate from the retained Judgment object and its hitlag/removal callbacks. See [Judgment setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecials.c#L29-L102) and [zero-based state selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecials.c#L176-L190).

The unknown Food event callback only forwards two object references to `it_8026B894`; no narrower visible trigger is established locally.

### Semantic assessment

Existing SetPosition, Spawn, Fall, Held, Dropped, and EnterResting names fit canonical behavior. The state-0 entry name can meaningfully improve from `itFoods_UnkMotion0_Enter` to `itFoods_EnterFalling`, covering spawn, support loss, and carrier release. Other supported knowledge is retained explicitly in the checkpoint. Seven compiled-section claims remain unresolved: C initializers and literals do not prove section sizes, exclusive contents, or emitted allocation. The header's missed Spawn substitution is a renderer issue, not contrary behavioral evidence.

Status: synthesized; independent review and live promotion pending.
