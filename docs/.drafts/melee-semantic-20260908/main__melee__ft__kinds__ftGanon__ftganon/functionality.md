## Ganondorf initialization and lifecycle integration

This translation unit defines Ganondorf's motion-state registration table, character resource strings, five costume descriptors, four demo-resource keys, and nine lifecycle adapters. The header declares this interface and the five-element costume list. Source declarations do not establish compiled section placement.

### Motion and resource registration

The table begins with six callback-free item-swing placeholders, annotated as indices 341–346. The following entries reuse Captain-family submotions, motion flags and special-move callbacks, with ftCamera_UpdateCameraBox. All six down-special entries have NULL IASA callbacks. The final entry, annotated SpecialHiThrow1/363, is exceptional: it uses SpecialLwRebound flags and the SpecialLw move-ID category despite its HiThrow1 submotion/callback names. These differences must not be normalized away. Resources include PlGn.dat, ftDataGanon, PlGnAJ.dat, five costume archive/shared-joint pairs and four demo keys. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGanon/ftganon.c#L18-L303.

### Attribute ownership and lifetime

OnLoad forwards gobj->user_data to ftCa_Init_OnLoadForGanon; LoadSpecialAttrs forwards the object to ftCa_Init_LoadSpecialAttrs. The former uses PUSH_ATTRS with ftCaptain_DatAttrs: it copies this fighter's external attributes into dat_attrs_backup and installs that storage as dat_attrs. COPY_ATTRS subsequently refreshes the active storage from the fighter's own external attributes. Shared structure layout does not imply identical Ganondorf/Falcon values. Unlike Falcon's own OnLoad, the Ganon helper does not enable walljump. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGanon/ftganon.c#L334-L342, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/ftcaptain.c#L347-L362 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L21-L35.

### Death and presentation boundaries

Death unconditionally clears during_specials and during_specials_start, and calls ftParts_80074A4C with (0,0) and (1,-1). Canonical helper evidence independently supports the rendered pending-selection hypothesis: the helper writes the selection's prev field and sets a dirty bit; another function copies prev to idx. This is not proof of immediate visual application. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGanon/ftganon.c#L305-L312 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L577.

Pickup/drop forward their event boolean and fixed true,true options. In the shared pickup path, heavy items skip processing; hold kinds 1,2,3,4 select numeric variants 1,0,2,3, respectively, and the default performs no selection update. The catch flag separately gates the visible-side helper within the non-heavy branch. Drop always applies selection -1 and conditionally invokes the invisible-side helper, without the pickup weight guard. Invisible/visible callbacks forward true and skip their animation-helper call for heavy items. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGanon/ftganon.c#L314-L332 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L193.

Knockback entry applies part-animation selection 3 to parts 3 and 4; exit applies selection 2 to those same parts. Every call supplies zero as its fourth argument. These adapters contain no launch-force calculation. Anatomical meanings for these numeric parts/selections are not established here. Source zero arguments do not prove a particular constant-pool label, section footprint or inter-file padding. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGanon/ftganon.c#L344-L354.

Status: synthesized; independent review and live promotion pending.
