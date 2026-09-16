# forward.h shared declaration review

Pinned to c302741689bd67c361cd7faadb221df3193992c3. Canonical and rendered lines1-182 are fully read through EOF. The header has zero manifest-owned targets or writable subjects. Read-only frozen-baseline queries independently found zero exact-file entities, facts and outgoing links. No baseline-link file exists for this empty scope; this is recorded explicitly, not treated as missing review data.

## Complete declaration inventory

The file contributes94 incomplete struct typedefs,4 incomplete union typedefs,8 callback typedefs,41 macros,2 enums and11 enumerators:160 reviewed declaration items. Every item has its exact source line, family and evidence in [declarations.json](declarations.json). All98 incomplete tags have a same-line definition opening in pinned source; [definition-locations.json](definition-locations.json) records each path, line and manifest owner. These searches locate authority but do not constitute full foreign-layout review.

An incomplete typedef lets callers name a tag and declare pointers. It provides no size, fields, allocation, ownership or cleanup contract. Struct versus union is preserved. No aliases are hypotheses or proposed renames here. Forward declarations span animation, archives, cameras, objects, device I/O, polygons, joints, lights, particles, input/rumble, text, textures, render expressions and audio. Definition owners, rather than suggestive names, resolve cases such as HSD_SM in axdriver, HSD_ViewingRect in shadow, IKHint in robj and AnimJoint in aobj.

## Callback signatures

GObj_RenderFunc takes a GObj and integer code; the inspected dispatcher passes a selected mask-bit index as the code. GObj events and user-data events return void; predicates return bool; interactions receive two GObjs. These typedefs do not define nullability, lifecycle or invocation order.

HSD_ObjUpdateFunc receives an enum channel and HSD_ObjData pointer. The actual union has float,int and Vec3 members, so its fval parameter name does not make every payload a scalar float. HSD_DevComCallback receives two integers, an optional buffer and a cancellation boolean. The inspected dispatch passes request ID and cast opaque args; the header alone does not type that opaque payload. HSD_MObjSetupFunc receives the material object and u32 render mode and occupies the material-class setup slot.

## Polygon and shape constants

POBJ mode bits are encoded alternatives under mask0x3000:skin0,shape0x1000,envelope0x2000. They are not three independent booleans. The inspected loader selects the corresponding union arm and rejects0x3000. Animation bit8 and cull-front/back bits0x4000/0x8000 are separate.

Shape default counts are2000 vertices and2000 normals. HSD_A_S_W0=2 is the base subtracted from animation channel IDs for additive weight indexing. SHAPESET_AVERAGE=1 and ADDITIVE=2 define shape modes; the additive macro's literal spelling is an unparenthesized shift.

PObjSetupFlag contains overlapping numeric names:normal and joint0 both1;reflection and joint1 both2;highlight4;normal-projection6;none0. Normal-projection is reflection|highlight. The foreign setup code combines joint marks and rendering flags. Its MUST_MATCH-only OR conditions are always true for the named nonzero masks, and non-MUST_MATCH builds retain the blocks unconditionally. This is an owner followup, not a requested source fix.

HSD_TrspMask has opaque1,translucent2,texture-edge4 and all7. The header defines the mask, not complete draw-pass ordering. The pobj_type macro does not parenthesize its argument, so it is a preprocessor access expression rather than a typed inline API.

## Lighting constants

Animation channel IDs9..22 cover RGB,visibility,raw attenuation coefficients,cutoff/reference distance/brightness and alpha. The inspected light update function clears HIDDEN for visibility values below0.5 and sets it otherwise. A0/A1/A2 share cases with cutoff/distance/brightness and select a union interpretation using RAW_PARAM; K0/K1/K2 update only in raw mode. RGBA channel writes multiply the float by255; the header supplies no clamping contract.

The low two LObj bits encode ambient0,infinite1,point2,spot3. TYPE_MASK is3; FLAGS_B1 supplies the second type bit. Higher bits encode diffuse,specular,alpha,hidden,raw parameters and diffuse/specular dirty state. Descriptor attenuation constants0/1 are separate from the runtime RAW_PARAM flag. The inspected point loader tests attenuation bit1, while the spot loader tests any nonzero attenuation field; consumers own that distinction.

## Boundaries and artifacts

No source, assets, compiler outputs or shared KB were changed. The proposal is intentionally empty; all findings and followups are draft documentation for the relevant owners. The rendered page has zero parser errors and zero substitutions. No standalone compiled object belongs to this header.

See [shared-findings.json](shared-findings.json), [family-inventory.json](family-inventory.json), [family-followups.json](family-followups.json), [zero-owned-scope-verification.json](zero-owned-scope-verification.json), [coverage.json](coverage.json) and [proposal.json](proposal.json).

Pinned owned evidence: [types](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/forward.h#L6-L103), [callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/forward.h#L105-L112), [polygon/shape/transparency](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/forward.h#L114-L146), [lighting](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/forward.h#L148-L179).

Rendered/canonical snapshot: [src__sysdolphin__baselib__forward.h.1-182.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/shared__src__sysdolphin__baselib__forward.h/pages/src__sysdolphin__baselib__forward.h.1-182.json)

Empty proposal dry-run validates with0 writes,0 rejected and0 skipped.
