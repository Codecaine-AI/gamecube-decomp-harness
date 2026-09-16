## Link neutral-special bow sequence

The translation unit implements grounded and aerial start, loop, and end phases of Link's Bow, together with fighter-side bow/arrow reference management. The header declares the callbacks and an external Vec3-group symbol; that declaration does not establish compiled layout.

### Entry and startup
Both entry routines reset the two charge-related x0 components, unk_timer, and all four command variables, select the corresponding startup motion, install ftLk_800EAF58 as damage and secondary-death callback, and apply specialn_anim_rate. Ground entry additionally performs common grounded setup and clears vertical self-velocity. Bow construction uses the right-thumb position, facing direction, bone index, and attribute x10. A preexisting x14 bow reference and a failed constructor both abort startup; these are distinct exceptional cases. Abort clears references rather than directly invoking the destructive removal helpers. Airborne abort selects ordinary fall when x8 is zero and otherwise calls ftCo_80096900.

Startup animation consumes command 2 only while x0.x is zero, enabling charge accumulation. Arrow construction is attempted only when command 0 equals 1 and arrow_gobj is absent; the command is cleared before the attempt. The misleadingly named isDrawn returns true only for failed requested arrow creation, not for an already-drawn arrow. Successful or unnecessary creation permits geometry updates and transition to the matching loop when startup frames finish. Ground startup reapplies specialn_anim_rate each animation callback; aerial startup does not.

### Geometry, charging, and release
Both loop animation callbacks update geometry without making input decisions. The helpers sample left thumb, right thumb, and root; store right-hand root-relative X/Y offsets in x8.y/z, zero x14, and store atan2 of the hand-to-hand displacement in x8.x. An attached arrow receives the right- and left-hand positions. The three static zero Vec3 initializers are source-level templates, not proof of .rodata placement.

Startup IASA increments charge by one, capped at attribute x0, only after x0.x becomes nonzero. Loop IASA assigns maximum charge unconditionally. Absence of held B selects the matching end phase. Both end IASA callbacks are empty.

End collision performs release before terrain processing. Release requires command 1 equal to true and a non-null arrow. It clears the command, samples both thumbs, flattens their z coordinates, saves item_gobj, calls itLinkArrow_802A850C with a five-degree-radian angle and current/maximum charge, unsets arrow tracking, restores item_gobj, and invokes item-pickup handling. The item routine additionally requires retained-owner agreement; its return value is ignored here. Thus the fighter attempts release and relinquishes tracking even though successful launch has additional cross-file conditions.

### Ending and movement
updateParts changes part 2 at most once after x221E_b3 becomes true, using held-item presence to choose the setting. Ground end completion clears only x14, updates parts, and calls the common exit. Aerial completion clears both arrow and bow references, updates parts, and selects normal fall or x8-parameterized special fall. The downstream helper identifies x8 as landing lag, not an airborne countdown, and has an exceptional x2224_b2 exit before normal FallSpecial initialization.

All grounded physics callbacks delegate to ft_80084F3C: ground friction, multiplied by the common factor above maximum walk speed, followed by ground movement. All aerial physics callbacks delegate to ft_80084EEC: gravity/terminal-velocity processing and aerial friction.

### Terrain continuity and numeric-state caution
Terrain transitions select the corresponding phase and preserve cur_anim_frame through the common inline transition helpers, then restore callbacks and animation processing. Ground start/loop use !ft_80082708; ground end uses ==GA_Ground. Aerial callbacks use ft_80081D0C==GA_Air. These are collision-result conventions, not direct tests of the fighter's current ground_or_air field. Physical ground-loss explanations remain unresolved where the helper's enum return and locally named fall_off_ledge value require deeper reconciliation; neither rendered names nor destination states prove that polarity.

### Cross-file lifetimes and naming review
GetIndex is null-safe, requires x14, maps the six consecutive neutral-special motions to indices 0 through 5, and otherwise returns None, whose enum value is 6. Bow item code consumes this index for animation synchronization, including frame preservation across paired ground/air item states.

IsActiveAnd2071b6 is not an active-AND-bit predicate: it returns false only in the six phases with x2071_b6 clear, and true otherwise. Bow and held-arrow item callbacks independently establish its removal-predicate role, supporting CheckItemRemove as a hypothesis. It is not null-safe.

UnsetArrow and UnsetFv14 clear fighter references without directly destroying items. Item destruction can notify these helpers; release also calls UnsetArrow. ProcessFv10 and ProcessFv14 invoke item removal and then clear tracking, supporting RemoveArrow and RemoveBow hypotheses. The bow constructor and destruction callback independently support UnsetBow for UnsetFv14. The composite damage/death dispatcher reaches both destructive helpers. Trailing ftLk_Init_BoomerangExists calls discard a pure boolean query; they do not perform shared article bookkeeping.

All owned canonical and rendered pages, all 67 subjects, all 172 facts, and all 42 links were enumerated. Rendered substitutions were treated as hypotheses. No compiled section/layout evidence was available.

Status: synthesized; independent review and live promotion pending.
