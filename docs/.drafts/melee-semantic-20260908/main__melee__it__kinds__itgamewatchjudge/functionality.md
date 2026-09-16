## Judgment display article

This unit implements Mr. Game & Watch's numbered Judgment display article, not the random-result selector. The existing behavioral names fit the canonical implementation; no semantic rename or equivalent wording rewrite is warranted.

### Construction and presentation

`it_802C7774` initializes a spawn descriptor for `It_Kind_GameWatch_Judge`. Creation failure returns NULL and skips all article dereferences and setup. Success associates the article with the supplied parent and attachment part, passes `(f32) (s32) (arg4 + 1)` to `it_80273670` with state argument 0, updates facing, and invokes debug/integration hooks. The unsigned addition and subsequent signed conversion are preserved; this function does not validate the result domain. The fighter caller supplies its right-thumb position and bone and retains the returned object. Intended random results are 0–8, although the fighter selector explicitly documents an exceptional uninitialized-result path. [Constructor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L23-L45), [caller and selector](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecials.c#L29-L163).

`it_802C78B8` changes the root model's child-of-child Y rotation: π when owner facing equals exactly 1.0f, zero otherwise. With no owner it leaves rotation unchanged. It does not locally validate the model hierarchy. [Facing update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L47-L60).

### State and lifetime

The source defines one table entry with animation ID 0, an animation callback, and NULL physics/collision callbacks. Pickup unconditionally clears two item-command variables, then selects state 0 with `ITEM_ANIM_UPDATE` only when an owner exists. Animation updates facing before checking lifetime. An absent owner requests removal; otherwise the fighter predicate retains the article within the inclusive `ftGw_MS_SpecialS1` through `ftGw_MS_SpecialAirS9` interval. Removal notification precedes the true return. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L19-L21), [pickup and animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L90-L118), [predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecials.c#L108-L118).

The destroyed callback only notifies a non-null owner. Explicit removal separately checks the resolved Item payload, not the incoming GObj itself, then notifies before calling the common removal routine. Fighter cleanup exits hitlag on the tracked article before clearing its pointer and damage/death callbacks. Fighter-side explicit removal calls cleanup again after the item-side path; the tracked-pointer guard prevents a second article hitlag operation once tracking has been cleared. [Item cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L62-L78), [fighter cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecials.c#L64-L103).

### Cross-file integration

The adjacent hitlag wrappers forward their arguments without local guards. Fighter pre/post-hitlag callbacks guard the tracked article. After a spawn attempt, damage/death callbacks are installed only on success, whereas hitlag callbacks are installed regardless of success within the setup branch. The caller's result-6 food-spawn branch is also independent of display-spawn success. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L80-L88), [setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/ftgamewatchspecials.c#L35-L59).

The reference event forwards both objects to selective shared cleanup and discards its owner-match return value. Matching owner, reflector, absorber, fighter, secondary-fighter and toucher pointers are cleared; clearing the fighter reference also sets source-player value 6. Clearing the owner makes the next animation callback request removal without notifying that former owner. Exact event-dispatch timing is not established here. [Event wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itgamewatchjudge.c#L120-L123), [shared cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L491-L525).

### Review outcome

Retained 62 facts and all 38 links explicitly in checkpoints. Eight section-related facts remain unresolved because source behavior does not establish compiled placement, literal ownership, sizes or alignment. Both owned files were read completely in canonical and rendered form. The header's spawn declaration is not substituted because the renderer reports `shadowed_binding`; this does not invalidate the Spawn name. No KB changes are proposed.

Status: synthesized; independent review and live promotion pending.
