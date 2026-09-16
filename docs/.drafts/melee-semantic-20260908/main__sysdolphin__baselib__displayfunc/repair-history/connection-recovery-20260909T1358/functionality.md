# main/sysdolphin/baselib/displayfunc

Status: TU synthesis complete; independent root review pending.

# Display Function Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC 2026-09-08T15:34:05.337347Z to 2026-09-08T15:40:45.470688+00:00. Canonical and rendered reads cover all owned C/header lines separately; zero parse errors and substitutions.

## Entry-point behavior

### HSD_ZListInitAllocData

Initializes and registers the HSD object-pool descriptor used for temporary HSD_ZList rendering records, configuring sizeof(HSD_ZList) entries with four-byte alignment during the engine-wide HSD object-allocation startup sequence.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L56-L59

### HSD_StateInitDirect

Calls HSD_ClearVtxDesc (GX clear and both HSD descriptor-cache pointers reset), sets XYZ/F32 and RGBA/RGBA8 formats, calls HSD_StateInitTev, then SetupRenderMode(rendermode|0x28000000). Enables direct position/color and selects GX_PNMTX0. No local argument validation or restoration occurs.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L76-L86

### mkVBillBoardMtx

Preserves source Y and translation and rebuilds X/Z with their source column magnitudes. PBILLBOARD chooses position crossed with Y; otherwise uses Y crossed with fixed +Z. Normalization divides by computed norms without zero, parallel-axis or finite-value guards. No JObj or persistent renderer state is mutated.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L92-L123

### mkHBillBoardMtx

Preserves source X and translation and rebuilds Y/Z with their source column magnitudes. PBILLBOARD constructs its reference using the XZ radius of position; otherwise uses fixed +Y. Both the position-radius division and basis normalization lack zero or finite-value guards. No persistent state is mutated.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L125-L160

### mkBillBoardMtx

PBILLBOARD scales eye-space position with a negative source-Z-magnitude/norm factor toward the camera; ordinary mode uses fixed +Z. Rebuilds X/Y and preserves translation and positive source column magnitudes for nondegenerate input. No zero-norm or finite-value checks occur; preservation of shear or reflection is not established.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L162-L201

### HSD_JObjMakePositionMtx

Requires valid JObj and matrix storage and an already prepared jobj->mtx; it does not call SetupMatrix. Zero billboard field writes vmtx*jobj->mtx directly. Four recognized billboard modes rebuild a temporary product; unknown nonzero modes panic. PBILLBOARD affects full/vertical/horizontal modes but not rotation-only mode. Degenerate inputs are not validated.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L218-L243

### _HSD_mkEnvelopeModelNodeMtx

Requires non-NULL m. A SKELETON_ROOT input returns NULL without writing mtx. Otherwise finds the first self/ancestor skeleton flag and asserts it exists. Self selection calls MTXInverse on envelopemtx and ignores success. Ancestor paths use HSD_MtxInverseConcat; for near-zero determinant that helper copies m->mtx instead of computing an inverse product. Returns output storage on every non-root normal path, which does not guarantee an invertible result.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L256-L276

### HSD_JObjDispSub

Requires valid jobj and DObj payload; has no NULL or joint-hidden guard. Sets current JObj, initializes specular only when requested and not shadow, then clears PObj matrix marks. Skips hidden or pass-ineligible DObjs and calls each virtual disp with current DObj installed. Clears both current pointers on normal exit without restoring prior context.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L278-L307

### HSD_JObjDispDObj

Requires non-NULL jobj; hidden or no selected transparency flags is a no-op. Sets up joint matrix; NULL vmtx falls back to current camera. Builds position matrix once. Opaque draws immediately; with listing disabled, texture-edge then translucent draw immediately. Conditional collection allocates one shared record for selected edge/XLU chains, copies matrices and borrows jobj without ref counting. Static zsort_listing is initialized zero and has no assignment enabling it in this owned source, so this review does not establish active deferred collection.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L309-L367

### zlist_sort

Counted split/merge rewires only the next pointer selected by byte offset, sorting ascending pmtx[2][3]. Equal finite keys choose the earlier half via <= and remain stable; NaN is outside that ordering claim. nb<=1 truncates the selected next of a non-NULL head, including zero/negative counts. Count, chain length and offset consistency are caller preconditions; no allocation or validation occurs.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L369-L414

### _HSD_ZListSort

zsort_sorting false is a no-op. True sorts edge then XLU, updating only their heads; counts, ownership links and append-tail pointers are unchanged. Appending after sorting is not maintained by this wrapper and requires a batching invariant. Static control starts zero and no enabling assignment exists in the owned source. CObjEndCurrent calls Sort then Disp.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L416-L425

### _HSD_ZListDisp

Obtains current camera and its direct viewing matrix before checking whether either list is empty. Dispatches edge then XLU using each borrowed JObj, stored position/mode and stored view or camera fallback. Does not sort or recheck joint hidden flags. Calls Clear after normal traversal. Queued objects must remain live and list mutation/reentrancy is not guarded.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L427-L453

### _HSD_ZListClear

Traverses ownership.next once, freeing non-NULL view copies and each record, even when records participate in both class chains. Resets all heads/tails/counts; never frees or unreferences borrowed JObjs. Leaves collection/sort controls, callback and erase color unchanged. Empty and repeated clears reset bookkeeping without deallocation.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L455-L477

### HSD_JObjDisp

NULL jobj is a no-op. DObj union branch takes precedence. Particle list is processed only with an installed callback: bit 0x80000000 triggers callback(0,data&0x3F,(data>>6)&0xFFFFFF,jobj), then every traversed data value is masked with 0x7FFFFFFF, clearing that trigger bit. Without callback it neither dispatches nor rewrites the list.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L479-L498

### HSD_JObjSetSPtclCallback

Stores the supplied callback pointer, including NULL, without invoking it. Dispatch uses the exact void(s32,s32,s32,HSD_JObj*) interface. efLib initialization installs efLib_Cb_SPtcl, whose body forwards particle requests based on bank.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L500-L503

### HSD_SetEraseColor

Configures the RGBA value that HSD_EraseRect applies when clearing color and alpha within a render-target region.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L505-L511

### HSD_EraseRect

All output flags false returns without GX writes. Enabled depth installs a 4x4 all-FF Z8 replacement texture; disabled depth uses zero texgens and no TEV texture source. Both branches still configure direct TEX0 and emit UVs for all four vertices. Sets unconditional compares, copy logic and independent write masks; uses identity position matrix but leaves projection/viewport/scissor supplied by caller. z supplies geometry depth, not the replacement Z-texture value. Disables Z texture and invalidates all HSD cached state afterward; does not restore prior GX state.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L513-L597

### _HSD_DispForgetMemory

Ignores lo/hi and resets all ownership/class heads, append pointers and counts without traversal or free. Prior records/view copies become unreachable through these globals. Leaves controls, callback and erase color unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L599-L611

## Additional source and header inventory

HSD_ZListAlloc allocates from the pool then zeroes only the portion after pmtx; it has no NULL check. HSD_ZListFree returns the record. mkRBillBoardMtx constructs z rotation times positive source scale magnitudes and copies translation; it does not consult PBILLBOARD. HSD_JObjFindSkeleton asserts its initial node and walks self/parents for the first skeleton or skeleton-root flag, returning NULL if none.

HSD_ZList separates ownership next from two class next fields; deferred records borrow the JObj while owning a view-matrix copy. Sort updates heads but leaves append tails unchanged. The control globals are static zero with no setter in this source, so conditional queue and sorting paths are described without asserting runtime activation.

The header defines transparency shifts and JObj pass constants and declares the public interface. All 18 function targets preserve canonical names. All 46 parameter entities have exact source roles; callback parameter has no entity and is documented on its target. Mixed float/int parameter labels are not register-allocation evidence.

Billboard normalization requires nondegenerate inputs. Full reconstruction preserves positive column magnitudes, not arbitrary shear/reflection. Envelope inverse formulas are conditional: HSD_MtxInverseConcat copies the source near singularity; the direct inverse result is ignored.

EraseRect leaves projection, viewport and scissor to caller state. Both branches emit texture coordinates even though depth-disabled TEV uses no texture. Geometry z is distinct from the replacement depth texture. Particle dispatch clears only trigger bit 31 after each traversed descriptor using mask 0x7FFFFFFF.

All fact IDs and updated_at versions receive explicit dispositions. Every outgoing link preserves the exact baseline record with per-link evidence and disposition. Source object names do not resolve compiled section claims. No shared KB/source mutation, compilation, matching, server or publication actions.

{"subjects": 70, "targets": 23, "function_targets": 18, "section_targets": 5, "facts": 110, "retained": 50, "superseded": 37, "unresolved": 23, "proposed_facts": 84, "links": 24, "links_retained": 16, "links_unresolved": 8}

Dry-run valid: 84 proposed facts, zero rejected/skipped. Exact fact/link identity coverage and supersede/proposal consistency passed. Proposal SHA256 `efeede14cf44007adff5dc1d1139710c43387f7fe9046832a1dad63026e91ac8`.


## TU independent review

Pool helpers initialize only the record suffix after pmtx; allocation failure is unchecked. Listing and sorting controls are static zero with no enabling writes in owned source. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L20-L74`.

Direct rendering augments render mode by 0x28000000; normalization paths lack zero guards. Axis reference globals are writable declarations. Rotation-only rebuilding uses source column magnitudes and joint rotate.z. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L76-L243`.

Skeleton-root input skips output; self inverse status is ignored. Ancestor inverse concat falls back to source for near-singular determinant, independently checked in mtx.c60-157. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L245-L276`.

DObj current scopes clear rather than restore; opaque renders before conditional edge/XLU collection. Deferred records borrow joint pointers and own copied view storage. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L278-L367`.

Merge sort rewires selected links and is stable for equal finite keys. Wrapper updates heads without append tails; replay traverses edge then XLU and clears ownership chain once. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L369-L477`.

Particle callback receives decoded bank/offset and the high trigger is cleared on every descriptor only when callback installed. efLib callback registration and bank dispatch independently read. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L479-L503`.

EraseRect emits texture coordinates in both depth branches; leaves projection/viewport/scissor to caller and invalidates HSD state after the draw. Forget ignores address bounds and abandons lists without freeing nodes. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L505-L611`.

All 70 subjects and 110 exact frozen fact values/types/timestamps reviewed; 84 operations reviewed. Parameter labels are positional and do not establish register allocation. Compiled sections remain deferred; 24 original outgoing link records reviewed. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.h#L1-L46`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
