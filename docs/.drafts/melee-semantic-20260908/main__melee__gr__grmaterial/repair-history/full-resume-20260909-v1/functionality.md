# Ground Material Semantic Review

All 656 owned canonical/rendered lines, 25 functions, three data targets, 53 entities and 166 facts reviewed. 52 empty parameter entities have explicit dispositions. {'unresolved': 33, 'supersede': 70, 'retain': 63}; 70 proposed writes. All 34 outgoing links reviewed.

## grMaterial_801C87D0

For nonnull JObj, obtain DObj chain and call HSD_MObjSetFlags on each nonnull MObj. Reviewed setter ORs mask into rendermode. No child traversal or root siblings; unavailable DObj union returns NULL. Does not change JObj flags or links.

## grMaterial_801C8858

Null root no-op; apply 801C87D0 to current node, then recursively process each child subtree in sibling order. Starting root siblings are excluded. Same material mask is ORed at each visited DObj; no cycle detection.

## grMaterial_801C897C

For nonnull JObj, obtain DObj chain and call HSD_MObjClearFlags on each nonnull MObj. Reviewed setter ANDs rendermode with complement mask. No children or root siblings; no JObj flag/link changes.

## grMaterial_801C8A04

Null root no-op; clear mask through801C897C at current node, then recurse through child subtrees in sibling order. Starting root siblings excluded; no cycle detection.

## grMaterial_801C8B28

NULL returns NULL. Otherwise repeatedly follow parent until parentless joint, then return it. Read-only; no cycle guard. Does not itself prepare or attach animation.

## grMaterial_801C8B68

Null no-op. Insert each reached node only if arg1==0 and flags&0x4000, passing NULL table and pointer cast to u32 as key plus same pointer as value. Nonzero arg1 suppresses all inserts but traversal still occurs. flags&0x1000 prunes descendants after possible insertion of that node. Visits root and child subtrees, excluding root siblings. Default-table and duplicate-insert behavior delegated.

## grMaterial_801C8CDC

Calls Item_8026A8EC(gobj) once. No local guard, result, ownership change or retained-handle clearing; teardown details require item owner review.

## grMaterial_801C8CFC

Returns it_802E6AEC(arg2,arg0,arg1,arg3,NULL,0,arg4,arg5,arg6). Reorders Ground and integer arguments, forwards JObj and three callback pointers unchanged, fixes Vec3 pointer NULL and following integer0. No local guard or allocation; proxy identity, callback roles and failure semantics require ityaku owner review.

## grMaterial_801C8D44

Returns it_802E6AEC(arg2,arg0,arg1,0,arg3,arg4,arg5,arg6,arg7). Forwards Ground, integer inputs, Vec3 pointer and three callback pointers; fixes JObj source null. No local validation; position interpretation, allocation and event meanings delegated.

## grMaterial_801C8D98

Calls it_802725D4(gobj), then Item_80268E5C(gobj,id,2). No local guard or result. Hitbox reset and motion-state internals require item owner evidence.

## grMaterial_801C8DE0

Unchecked gobj->user_data Item and xACC_itemHurtbox pointer; overwrites first capsule a_offset.xyz,b_offset.xyz,scale from seven float inputs. No count check, enable-state change or cached-position invalidation; all other fields unchanged.

## grMaterial_801C8E08

Calls it_802756E0 once. Reviewed callee writes Item.xD0C=0 then it_802714C0; reviewed second callee clears skip_update_pos for indices0..xAC8_hurtboxNum-1 and sets xDAA_flag.b1. No local guard; combat interpretation of mode0 needs collision consumer evidence.

## grMaterial_801C8E28

Calls it_802756D0 once; reviewed callee writes Item.xD0C=2 and returns. No hurt-capsule cache invalidation. Exact suppression of item/fighter damage remains a collision-consumer followup.

## grMaterial_801C8E48

Reads Item.x524_cmd.u without guards; returns true iff NULL, otherwise false. No writes. Does not itself remove anything or establish all animation completion.

## grMaterial_801C8E68

Unchecked Item payload; copies GroundOrAir argument unchanged to ground_or_air. No validation, physics update, callback or broader state transition.

## grMaterial_801C8E74

Calls hsdInitClassInfo for local descriptor with parent hsdMObj, library sysdolphin_base_library,class gr_mobj,sizes HSD_MObjInfo/HSD_MObj. Copies parent release/amnesia,load,make_texp and sets setup=fn_801C8EF8. Does not explicitly assign setup_tev/unset; class inheritance internals delegated.

## fn_801C8EF8

Ignores argument rendermode; reads mobj->rendermode. Initializes TEV, sets material colors, conditional shininess, appends shadow textures when enabled, optionally prepends valid toon texture. Sets textures/coordinates, asserts tevdesc, installs base TExp and volatile TEV, reads current HSD_GObj_804D7814->user_data as Ground, calls owned overlay inline, then customPE render mode. Detaches appended shadow tail afterward; toon->next is not restored. Assumes valid mobj,mat,current Ground. Overlay inline adds one stage only when color enable or b6 set; reports/asserts on unavailable color/alpha registers. No graceful register-exhaustion recovery.

## grMaterial_801C92C0

Null root no-op. Each node with flags&0x4020 skips own DObj conversions but descendants still traversed. For eligible nodes call hsdChangeClass(nonnull mobj,&local descriptor), ignoring results. Root and child subtrees only; root siblings excluded. No stop on instance0x1000 and no rollback for failed conversion.

## grMaterial_801C9470

Forwards both arguments to local801C9490. Table entry for dispatcher opcode21; despite Item_GObj spelling downstream payload is Ground.

## grMaterial_801C9490

Interprets user_data as Ground, reads u16 at cmd->ptr[0], extracts (word>>2)&0xFF, stores raw0..255 as f32 xC0, sets b6. No normalization, pointer advance, validation or clearing of b6. Renderer alpha path consumes these exact fields.

## grMaterial_801C94D8

Treats void pointer as nullable JObj; converts root DObj materials only when !(flags&0x4020), then calls801C92C0 for every child subtree. Mask skips current materials, not descendants. No root sibling traversal; ignores class-change results.

## grMaterial_801C95C4

Unchecked Ground payload; calls lb_80014498 on embedded overlay, then sets b4=1. Reviewed reset clears x8_ptr1,x4_pri,x28_colanim.ptr,color_enable,flag2 only; it does not clear Ground.b6/xC0, stored colors, timer or loop. Therefore stopping color overlay does not disable separate alpha modulation.

## grMaterial_801C9604

Unchecked Ground payload; assigns bool arg2 to overlay.x4_pri and casts int arg1 into x8_ptr1. Zeros timer/loop,color_enable,flag2 and Ground.b4, then immediately calls801C9698. Does not clear Ground.b6/xC0 or x28_colanim.ptr. Lifetime meaning of x4_pri and interpreter progress delegated.

## fn_801C9664

Unchecked index arg2-21 into one-entry ItCmd table. Only21 is valid locally; dispatches801C9470(gobj,cmd). Does not validate, advance cmd pointer or prove caller supplies only21.

## grMaterial_801C9698

Unchecked Ground payload; calls lb_80014258(gobj,&color_overlay,fn_801C9664). True sets b4=1; false leaves b4 unchanged. No b4 guard before call and no direct b6 reset. Timer/interpolation/lifetime internals delegated.

## Limits

Item constructors only prove forwarding; damage/touch roles and objective-target identity require ityaku owner evidence. Hurt capsule geometry setter does not enable or invalidate it. E08 writes mode0 and invalidates all caches; E28 writes mode2 only. Damage semantics require collision consumers. Stop and start do not clear separate Ground.b6/xC0 alpha state. Reviewed overlay reset does not zero timer/loop or colors. One-entry command dispatcher accepts only opcode21 safely; caller range guarantee unreviewed. Rendering assumes current GObj user_data is Ground. Toon next-link is not restored; appended shadow tail is detached. No source, shared knowledge, compilation, matching, publishing or UI changes.
