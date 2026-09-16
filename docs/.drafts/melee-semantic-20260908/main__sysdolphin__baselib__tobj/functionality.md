# Disjoint Librarian Research

### shard-main__sysdolphin__baselib__tobj-000
Reviewed canonical and rendered `tobj.c` lines 1–480 only. This range implements texture-object animation attachment, removal, frame requests and interpretation, with linked-list variants. Animation descriptors are matched by texture-map ID; attachment replaces animation and palette-table resources. Animation updates select images/palettes, change blending, transforms and LOD bias, and convert TEV color channels to bytes; transform changes mark the texture matrix dirty. Descriptor loading recursively constructs texture chains, initializes texture state and dispatches through class load methods. Additional helpers search the current texture chain by coordinate mapping and map GX texture-map IDs to post-transform matrix IDs. Matrix construction combines adjusted translation, rotation and repeat-relative scaling. The visible matrix-setup portion rebuilds dirty matrices and supplies mapping-specific GX matrices, including camera/light-dependent calculations.

### shard-main__sysdolphin__baselib__tobj-001
Reviewed canonical and rendered tobj.c lines 481–960 only.

- Texture-coordinate setup walks the texture-object list, skipping GX_TEXMAP_NULL entries. It selects position-based generation for shadow coordinates, normalized normal-based generation for reflection/hilight coordinates, an extra bump generator selected from the first set diffuse-light-mask bit (falling back to index zero), or SRTG generation for toon coordinates.
- Volatile TEV setup emits two stages for bump objects: an unclamped color-add stage followed by a clamped color-subtract stage using the next coordinate. On a shadow-lightmap object it processes consecutive shadow-coordinate objects through a modulation descriptor and stops the outer traversal. The rendermode parameter is unused here.
- MakeColorGenTExp scans four color and four alpha selectors, creates referenced U8 constant expressions from konst/tev0/tev1 fields, and translates active color and alpha configurations into a texture-bound expression. TEX0/TEX1 selectors here reference stored TEV color fields through intermediate expressions, not additional texture samples. Unsupported active selectors assert. Color and alpha outputs are replaced independently according to active bits; lightmap and repeat are unused in this helper.
- The opening of TObjMakeTExp defaults its sources to texture RGB/alpha, optionally replaces them through MakeColorGenTExp, and begins configuring color combinations with the preceding color using alpha-mask, RGB-mask, or a floating-point blending constant. Its remaining behavior lies outside this shard.

### shard-main__sysdolphin__baselib__tobj-002
Reviewed canonical and rendered tobj.c lines 961–1440 only.

- The opening expression-building fragment configures TEV color operations and, when `repeat` is false, alpha operations; it updates the output expression pointers and asserts on unsupported mapping modes.
- `HSD_TObjAssignResources` allocates texture-map and coordinate resources across a linked list. It keeps the last toon-coordinate object and last eligible bump object, disables earlier competing objects, reduces the ordinary allocation budget for these special objects, assigns generated coordinates before ordinary UV coordinates, and finally assigns bump/toon resources. Bump receives `GX_TEXMTX9` and two coordinate slots. The function returns the coordinate count.
- `HSD_TObjSetup` records the list head, assigns resources, registers the highest allocated coordinate, skips disabled objects, and invokes matrix setup. It initializes indexed or direct GX texture objects, selects and loads palettes where needed, adjusts filtering for indexed textures and absent mipmaps, configures LOD, and loads each texture into its assigned map.
- Palette reuse is determined by entry count in the current `DifferentTluts` body—not palette contents, format, or distinct LUT pointers. Its `MUST_MATCH` pointer expression compares `t0->lut` with itself.
- The complete conversion helpers in this range map texture sources, coordinate IDs, matrix IDs, and map indices through explicit switches with assertion/panic paths. Coordinate-to-generated-source conversion accepts coordinates 0–6 but asserts for coordinate 7; matrix conversions include identity as index 10. The range ends at the beginning of `HSD_TexMap2Index`.

### shard-main__sysdolphin__baselib__tobj-003
Reviewed canonical and rendered tobj.c lines 1441–1627 only. This range provides texture-object list removal and null-safe next access; validated default-class selection and allocation; direct destroy-method dispatch; zero-initialized TLUT, TEV, and image-descriptor allocation with corresponding free helpers. The EFB-copy helper configures source and destination from an image descriptor, optionally sets depth state for clearing, copies into image_ptr, and optionally issues pixel-mode synchronization and texture-cache invalidation. Object release removes animation, TLUT, TEV, and null-terminated TLUT-table resources before delegating to the parent. Class amnesia clears matching global references; class initialization registers inheritance and lifecycle/load/expression/matrix callbacks. The opening fragment maps GX_TEXMAP1 through GX_TEXMAP7 to indices and asserts on its default branch.

### shard-main__sysdolphin__baselib__tobj-004
Reviewed canonical and rendered `tobj.h` lines 1–315 only. This header defines the texture-object data model and public interface: animation-channel constants, TEV selectors and activation masks, packed texture flags and extraction macros, linked texture objects and descriptors, palette/image/LOD/TEV records, class callbacks, and texture-animation tables. The runtime object includes transform, matrix, animation and resource references; its descriptor is distinct, including `Vec3` rotation rather than the runtime object's `Quaternion`. Public declarations cover animation, descriptor loading, allocation/removal, texture setup/resource assignment, EFB image copying, and GX identifier/index conversions. These are interface observations, not verified implementation behavior or complete TU coverage.

### shard-main__sysdolphin__baselib__tobj-005
Reviewed the six assigned subjects, not the complete translation unit. TObj class selection falls back to the built-in class; class initialization installs lifecycle and rendering callbacks, and amnesia clears associated global pointers. Texture setup installs the current list and supplies fallback LOD settings. Image-descriptor allocation asserts success and zeroes the descriptor. EFB capture configures and issues a GX texture copy with independently controlled clear preparation and post-copy synchronization/cache invalidation. Source establishes these behaviors but does not establish compiled section membership or layout.

### shard-main__sysdolphin__baselib__tobj-006
Reviewed the six assigned subjects. Image-descriptor freeing releases only the descriptor memory piece. The conversion helpers explicitly translate bounded texture-coordinate, texture-map, texture-matrix, and generator-source domains, with assertion or panic paths for invalid inputs. Resource assignment consumes the coordinate/map converters. Animation attachment matches a texture ID, replaces its controller and palette resources, installs its image table, and resets palette selection; subsequent animation evaluation updates texture render properties. This is bounded subject coverage, not complete TU coverage.

### shard-main__sysdolphin__baselib__tobj-007
Reviewed the six assigned subjects only. Texture-animation attachment searches descriptors by map ID for each list node and replaces matched animation/palette resources. Single-object and list-wide playback delegate to AObj interpretation with a texture-property callback. Resource assignment reserves specialized slots, disables excess objects, and supplies IDs used by material compilation and texture setup. Allocation and freeing are class-dispatched wrappers. Two baseline claims require qualification: unrestricted suppression by AOBJ_NO_UPDATE and absence of indirect allocator side effects.

### shard-main__sysdolphin__baselib__tobj-008
Reviewed the six assigned subjects only. They provide null-safe successor access, descriptor-driven construction with virtual loading, list-wide object removal, animation-controller teardown without unlinking textures, and single/list animation-frame requests. Animation requests forward a common frame into AObj state and request its FObj channels; material teardown callers distinguish removing animation attachments from removing texture objects.

### shard-main__sysdolphin__baselib__tobj-009
Reviewed the six assigned subjects and all 27 baseline facts. These routines distribute texture-animation requests, bind texture and palette sampling state, configure ordinary/toon/bump coordinate generators, append bump and shadow TEV stages, and allocate or copy optional per-texture TEV configuration. Review is bounded to these subjects and supporting source, not the complete translation unit.

### shard-main__sysdolphin__baselib__tobj-010-repair4
Reviewed the six assigned subjects and their 24 baseline facts. The conversion helpers validate GX coordinate, texture-map, and matrix selectors and return corresponding indices or selectors. Coordinate-source conversion feeds the additional bump-coordinate generator; post-transform matrix selection populates texture-object matrix state. TLUT allocation produces an asserted, zero-filled record subsequently populated from a descriptor and released through matching structure-sized frees. This is bounded subject coverage, not complete TU coverage.

### shard-main__sysdolphin__baselib__tobj-011
Reviewed the six assigned subjects: nullable shallow TLUT loading and record cleanup; custom texture-expression construction with independently enabled color and alpha halves; texture-matrix composition; and TObj class initialization and amnesia handling. The custom combiner's color and alpha selector sets differ. This review does not claim complete translation-unit coverage.

### shard-main__sysdolphin__baselib__tobj-012
Reviewed the six assigned subjects: descriptor-based texture-object initialization, animation-property updates, mode-dependent GX texture-matrix loading, TEV expression composition, resource release, and continuation-based lookup by coordinate mode. Current bodies support the baseline semantics, with render-readiness and matrix-rebuild statements understood as initialization/invalidation rather than immediate GPU setup. This is bounded subject coverage, not complete TU coverage.

### shard-main__sysdolphin__baselib__tobj-013
The reviewed paths load linked HSD texture objects, attach and interpret texture animations, and translate texture state into matrices, GX coordinate generation, and specialized TEV stages. Transform animation channels set the matrix-dirty flag; matrix setup rebuilds and clears it. Rendering includes normal-based reflection/highlight coordinates, position-based shadow coordinates, toon generation, and paired emboss-bump stages. This review assesses the four assigned baseline facts, not complete TU coverage.

### shard-main__sysdolphin__baselib__tobj-014
Reviewed the six assigned parameter subjects; all have empty baseline fact lists. Current source shows image-descriptor deallocation, index-to-GX texture coordinate/map/matrix conversions, GX texture-generation-source-to-index conversion, and attachment of matching texture animation data to a texture object. No compiled register-to-parameter mapping is established by these source bodies.

### shard-main__sysdolphin__baselib__tobj-015
The assigned subjects concern texture-object animation inputs and resource assignment. AddAnim searches an animation-descriptor chain by texture-map ID and replaces the matched object's animation and palette-table state; AddAnimAll applies this operation along the texture-object chain. Anim interprets an object's animation with TObjUpdateFunc, while AnimAll traverses the chain. AssignResources mutates texture-map, matrix, and coordinate assignments across a chain, disables excess entries, reserves capacity for selected special-coordinate entries, and returns the coordinate count. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition. This review does not claim complete translation-unit coverage.

### shard-main__sysdolphin__baselib__tobj-016
The six assigned parameter subjects have no baseline facts. Their current source functions accept nullable texture-object pointers, except LoadDesc, which accepts a nullable descriptor. Free dispatches the object's destroy method; GetNext returns the next pointer; RemoveAll saves each successor before deletion; RemoveAnimAll removes and clears animation objects throughout the chain; ReqAnim forwards a start frame to the object's animation request helper. LoadDesc selects a class, allocates an object, and dispatches descriptor loading, returning NULL for a NULL descriptor. This review covers these subjects, not the entire translation unit.

### shard-main__sysdolphin__baselib__tobj-017
The reviewed animation-request functions forward a floating-point start frame to HSD_AObjReqAnim when the texture object is non-null and TOBJ_ANIM is enabled. The AllByFlags variant traverses the next-linked object chain, forwarding the same frame and flags to each object. The unflagged wrappers supply TOBJ_ANIM. All six assigned subjects have empty baseline fact lists; there are no baseline facts to dispose.

### shard-main__sysdolphin__baselib__tobj-018
The complete bundle assigns six parameter subjects, all with empty baseline fact arrays. There are therefore no baseline facts to retain, supersede, reject, or mark unresolved. No new parameter semantics or register-to-source-parameter mappings are asserted.

### shard-main__sysdolphin__baselib__tobj-019
The assigned functions convert texture-coordinate, texture-map, and texture-matrix identifiers, or manage TLUT descriptors. Coordinate conversion accepts GX_TEXCOORD0–6; GX_TEXCOORD7 and other inputs assert. Texture-map conversion maps slots 0–7 to indices or corresponding post-transform matrix identifiers. Texture-matrix conversion maps matrices 0–9 to indices and GX_IDENTITY to 10. TLUT loading returns NULL for a NULL descriptor; otherwise it allocates a TLUT and copies sizeof(HSD_Tlut) bytes. TLUT removal conditionally frees a non-NULL object. All six assigned subjects have empty baseline fact arrays.

### shard-main__sysdolphin__baselib__tobj-020
MakeColorGenTExp constructs texture-associated TEV expressions from the texture object's TEV configuration. It scans color and alpha selectors, creates referenced constant expressions, and conditionally replaces the supplied color and alpha expression pointers for active channels. The source parameters lightmap and repeat are unused in this function. Its caller supplies local texture color/alpha sources and invokes it only when a TEV configuration has an active color or alpha channel. All six assigned subjects have empty baseline fact arrays; there are no baseline facts to disposition.

### shard-main__sysdolphin__baselib__tobj-021
The bundle contains six parameter subjects, all with empty baseline fact lists; consequently there are no baseline facts to disposition. Reviewed source shows that TObjLoad initializes a texture object from a descriptor, MakeTextureMtx builds its matrix from transform and repeat settings, and TObjAmnesia conditionally clears class-related globals before delegating to the parent callback. These source-level observations do not establish the register-bound parameter identities.

### shard-main__sysdolphin__baselib__tobj-022
The six assigned parameter subjects contain no baseline facts. Current source shows that TObjMakeTExp builds a texture-combining expression, replaces the caller's color expression, and replaces its alpha expression only when the object's lightmap bits do not overlap lightmap_done. TObjSetupMtx refreshes dirty texture matrices and loads a coordinate-mode-dependent matrix, except for the early-return coordinate mode. TObjRelease removes attached animation, palette, and TEV resources before delegating to the parent release method. Register-to-source-parameter identities remain unverified; no new facts are proposed.

### shard-main__sysdolphin__baselib__tobj-023
The assigned subjects have no baseline facts. In the reviewed source, TObjUpdateFunc receives an object, channel selector, and value pointer; it applies floating-point animation values to texture state, marks transform changes matrix-dirty, and converts color-channel values to bytes. HSD_TObjAnim supplies this callback to the animation interpreter. _HSD_TObjGetCurrentByType searches from the current list head when its starting pointer is null, otherwise from the following node, returning the first node whose tobj_coord result equals the requested mapping or null if none matches. This review covers these subject-related bodies, not the entire translation unit.

### shard-main__sysdolphin__baselib__tobj-024
Reviewed the 12 assigned links against current canonical function bodies and relevant material/rendering callers. The linked functionality covers texture animation requests and interpretation, texture-coordinate matrix construction and mapping resources, TEV expressions and shadow modulation, EFB-to-texture copying, and class-amnesia cleanup. All assigned relationships remain supported; this is not a complete TU review.

### shard-main__sysdolphin__baselib__tobj-025
The reviewed links connect texture-object animation attachment, requests and teardown to material/scene animation, and connect GX resource conversion, coordinate generation and TEV setup to texture mapping, shadow modulation and emboss bump rendering. Current bodies and material callers support all 12 assigned relationships. This assessment covers only the bounded link shard, not the entire translation unit.

### shard-main__sysdolphin__baselib__tobj-026
Reviewed the six assigned implementation links against current canonical source. The inspected code applies texture-property animation, dispatches texture-coordinate generation, constructs TEV color/alpha expressions, configures paired emboss-bump stages, and initializes color-indexed textures and palettes. Palette-name reuse is based on entry count, not demonstrated palette-content equivalence. This review does not claim complete translation-unit coverage.

Status: researched; no-change lead bypass; independent review and live promotion pending.
