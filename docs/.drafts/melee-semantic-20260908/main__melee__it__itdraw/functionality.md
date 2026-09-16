## Shared item rendering

`itdraw.c` implements item-model submission, indexed model-part visibility, diagnostic collision drawing, and the common item draw callback. All five rendered function-name hypotheses fit their canonical operations; no naming changes are warranted. The header agrees with the definitions. Rendered views have no reported parsing problems, but substitute only function names. Supported retained research facts and links remain unchanged.

### Model submission and visibility

`it_8026EB18` submits the GObj's JObj hierarchy with the converted rendering-pass mask. A non-NULL Vec3 supplies a translation concatenated after the current camera view matrix; otherwise the matrix argument is NULL. The declared parameter is `Vec3*`, although this helper only reads it.

`it_8026EBC8` and `it_8026EC54` traverse counted byte indices into the item's dynamic-bone table. They respectively clear and set hierarchy hidden flags, provided the selected joint's immediate parent does not have bit 0x10. The specialized draw helpers exchange configured groups around submission; this is not a snapshot-and-restore mechanism for arbitrary incoming visibility.

### Collision visualization

`it_8026ECE0` separates `It_Kind_Unk4` from the ordinary geometry paths. The special branch requires b0 and either special-record flag. Other items use b6 to gate hitboxes and hurtboxes; b2 enables four hitbox submissions, while hurtboxes require b1 and clear x13. Rectangle and auxiliary-matrix branches have independent flag pairs outside b6. Successful renderer results accumulate into a 0-or-1 return without ending subsequent traversal.

The important correction is that `xD0C` is a numeric hurtbox display-state/color override, not a transform reference. Both hurtbox calls receive NULL matrices. The override renderer preserves the intangible-state exception by selecting palette index 2. These are diagnostic rendering operations, but their callees can update cached hurtbox endpoints and `skip_update_pos`; they are not wholly read-only.

The fixed byte vector `{FF,40,80,80}` supplies the auxiliary rectangle's color. The downstream GX renderer only emits this geometry for pass value 2. Source confirms the object and literal uses, not compiled section extent or pooled-zero placement.

### Callback state and lifetime

`it_8026EECC` gates model work on b7. With x13 set, it additionally applies owner classification/permission checks and refreshes the owner-displacement flag. With x13 clear, it skips that refresh and uses a locally zero-initialized position if an existing b7 displacement flag selects it. The owner accessor obtains XY displacement from fighter damage fields; unsuccessful acquisition leaves the initialized position unchanged and the refreshed displacement flag clear.

Camera value 1 with presentation b3 set runs configurations (b4,b5)=(1,0),(0,0),(1,1); camera value 0 with b3 clear runs only (0,0). Other combinations submit no model. Display flags persist after the final configuration rather than being restored. Collision drawing runs independently of model eligibility, and a nonzero result triggers state invalidation, TEV initialization, and vertex-descriptor clearing.

Canonical anchors: `itdraw.c` lines 14–72, 76–143, and 148–239; `it_2725.c` lines 263–271; `lbcollision.c` lines 2462–2505 and 2529–2578; `ftlib.c` lines 725–735; `lbgx.c` lines 9–84.

Status: synthesized; independent review and live promotion pending.
