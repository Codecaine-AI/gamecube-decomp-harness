## Zako Boy initialization integration

The owned implementation defines mutable resource-name arrays for `PlBo.dat`, `ftDataBoy`, `PlBoNr.dat`, `PlyBoy_Share_joint`, and `PlBoAJ.dat`. Its demo record contains only `ftDemoIntroMotionFileBoy` in the second slot; the other three slots are null. The single costume-string record references the normal archive and shared joint, with a null third resource. A separate one-element `UnkCostumeStruct` array has no explicit initializer. `MUST_MATCH` conditionally surrounds the demo declaration with force-active pragmas; this does not establish compiled placement. The header declares all seven callbacks and selected resource objects. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZakoBoy/ftboy.c#L8-L31), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZakoBoy/ftboy.h#L10-L21).

### Death and deferred model state

`ftBo_Init_OnDeath` unconditionally calls `ftParts_80074A4C(gobj, 0, 0)`. Canonical callee evidence—not its rendered proposed name—shows a write of zero to `x5F4_arr[0].prev` and setting `x221D_b2`. The separate `ftParts_80074A8C` copies pending selections into `idx` for each configured model group and clears the flag. The callback neither calls that application routine nor establishes when it runs. Selection zero is not independently identified as a particular visible variant. [Callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZakoBoy/ftboy.c#L33-L36), [pending/application implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L577).

### Item events and exceptional paths

Pickup and drop forward the incoming object and boolean unchanged and append two zeros. Invisible and visible forward the object with one zero. All return void. The shared pickup implementation skips heavy items; otherwise hold kinds 1, 2, 3, and 4 select numeric helper values 1, 0, 2, and 3 respectively. Other hold kinds skip that selection call, but the catch-flag-controlled call still occurs. Both visibility paths skip heavy items. Drop has no corresponding heavy-item guard: it always calls `ftAnim_80070FB4(gobj, 0, -1)` and calls `ftAnim_80070CC4(gobj, 0)` only when its incoming flag is true. Zero-valued options therefore must not be described as disabling the entire operation. These callbacks do not themselves prove normal gameplay item availability or null-item safety. [Adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZakoBoy/ftboy.c#L38-L56), [shared implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L193).

### Attribute storage lifetime

OnLoad obtains `Fighter*` from `gobj->user_data`. `PUSH_ATTRS` copies one typed `ftZakoboyAttributes` value from `ft_data->ext_attr` into `dat_attrs_backup`, then redirects `dat_attrs` to that backup. LoadSpecialAttrs instead uses `COPY_ATTRS`, overwriting the object at the existing `dat_attrs` pointer from the external attributes. It does not allocate storage or reinstall the pointer. The callbacks rely on valid object, source, and destination storage; their bodies contain no validation. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZakoBoy/ftboy.c#L58-L68), [macros](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L41).

### Review boundaries

Both owned canonical files and their complete rendered views were read, along with all 19 subjects, 38 facts, and 13 links. The rendered C view substitutes only `ftParts_80074A4C`; canonical implementation independently supports its pending-selection interpretation. No renderer parse errors were reported. The baseline's Male Wire Frame identification retains external provenance but was not independently established by the source examined here; affected records are unresolved rather than rejected. No compiled section or layout conclusion is made.

Status: synthesized; independent review and live promotion pending.
