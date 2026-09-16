## Mario initialization and integration

This unit defines Mario's motion-state descriptors and lifecycle, attribute, item, knockback, and demo callbacks. The header declares these interfaces, two motion-state arrays, and an external five-entry costume list; it does not define the costume resources.

### Motion dispatch

The primary table contains ten initializers: two callback-free appeal placeholders, followed by grounded/aerial pairs for neutral, side, up, and down special. Each special descriptor supplies animation, IASA, physics, collision, and camera callbacks. Both side-special forms use `ftMr_MF_SpecialS`; other pairs retain their separately named flags. The auxiliary table contains RunBrake and Kneebend submotions with only physics callbacks populated (`ftCo_800C7158` and `ftCo_800C7200`). These are source-level descriptor observations, not proof of compiled section placement or contiguity. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L20-L154)

### Attributes, resources, and per-life state

`ftMr_Init_OnLoad` obtains the Fighter from object user data, enables wall jumping, invokes `PUSH_ATTRS` with `ftMario_DatAttrs`, and passes `items[0]`/`It_Kind_Mario_Fire` and `items[2]`/the installed attributes' Cape kind to `it_8026B3F8`. The Dr. Mario helper takes a Fighter directly and performs only the shared attribute operation. `PUSH_ATTRS` copies that fighter's external attributes into existing backup storage and installs that storage as `dat_attrs`; `COPY_ATTRS`, used by `LoadSpecialAttrs`, instead copies into existing active storage. Neither macro allocates storage. Sharing the layout does not imply sharing identical attribute values. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L168-L220), [macro definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L41)

On death, the unit calls `ftParts_80074A4C(gobj, 0, 0)`, writes 9 to both vitamin-history fields, clears Tornado charge and Cape boost, nulls the stored Cape reference, and zeros `x2240`. The consumer meaning of 9 and the meaning of `x2240` are not established by these writes. Nulling the reference is not itself article destruction. [Death callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L156-L166)

### Cape lifetime across files

`OnTakeDamage` unconditionally delegates to `ftMr_SpecialS_RemoveCape`. Independently read side-special code installs this callback in both `death2_cb` and `take_dmg_cb` when a Cape reference exists. Removal does nothing for a null reference. Otherwise it calls the item-side removal routine, then reset invokes the hitlag-exit path before clearing the reference and death/damage callbacks. Reset does not explicitly clear pre/post-hitlag callback slots or `x1984_heldItemSpec`; broader lifetime conclusions require those owners. [Wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L192-L195), [cross-file lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariospecials.c#L25-L99)

### Item and knockback adapters

Pickup/drop forward the supplied object and Boolean unchanged, adding constants 1,1. Invisible/visible and knockback callbacks add constant 1. These wrappers have no local guards, but their shared implementations do: pickup excludes heavy items, maps hold kinds 1/2/3/4 to animation IDs 1/0/2/3, leaves other kinds without that assignment, and optionally applies the stored animation according to the incoming flag. Visibility operations also exclude heavy items. Drop stores -1 and conditionally removes the active part animation. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L197-L230), [shared implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L205)

Visible restoration reads slot 1's `x10` and applies it with duration 0.0 only when it is not -1; this is an exact sentinel comparison, not a general bounds check. Invisible removal returns if `x11` is -1; otherwise it clears that active selection and follows either the current-animation or costume fallback path. Knockback entry and exit invoke `ftAnim_800704F0` for slots 1 and 0 using 3.0 and 0.0 respectively, rather than computing knockback magnitude. [Animation helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftanim.c#L1257-L1327), [knockback helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L195-L205)

### Demo selection and exceptional inputs

`UnkDemoCallbacks0` maps selector 9 to output pair 14/14 and selector 10 to 15/15, storing through the third argument before the second. Every other integer returns without writes. `GetMotionFileString` maps the same selectors to table indices 0 and 1, yielding `ftDemoVi0102MotionFileMario` and `ftDemoVi1101MotionFileMario`. Unlike the output callback, its unsupported-input path consumes an uninitialized offset and has undefined behavior. No specific on-screen pose is established for either selector. [Demo callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmario.c#L232-L262), [independent resource table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMario/ftmariostrings.c#L26-L36)

### Rendered-name review

Both owned files were read completely in canonical and rendered form. Rendered substitutions for `ftCo_800C7200`, `ftParts_80074A4C`, and `it_8026B3F8` were treated as hypotheses, not independent proof of their semantics. The header renderer reports a shadowed binding for `ftMr_Init_GetMotionFileString`; its canonical declaration agrees with the implementation.

Status: synthesized; independent review and live promotion pending.
