# GObj Process and Render Dispatch

Reviewed semantic record at `c302741689bd67c361cd7faadb221df3193992c3`. This module runs registered GObj process callbacks, dispatches render passes across selected GX links, adapts HSD scene objects to rendering, and registers object cleanup callback groups. Independent review and live promotion are complete.

## Object and Global State

The owned header defines HSD_GObj fields for classifier, process/GX links, priorities, process head, render callback, GX-link mask, HSD object and user data. Four inline accessors return user_data, hsd_obj, classifier or next unchanged, without null checks. The header labels HSD_GObjList as a provisional view of an array indexed by p_link; its commented effect fields remain hypotheses. [GObj layout](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.h#L28-L63), [list caveat and accessors](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.h#L104-L170).

File globals hold process-list arrays, current process and object pointers, render-context pointers, object-kind IDs, allocation metadata and library settings. Source declarations establish storage and use, not complete compiled .data/.bss/.sbss attribution. [Globals and callback table](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L12-L44), [allocation/configuration storage](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L271-L274).

## Process Dispatch

The flag wrappers walk gobj->proc through child links. They set flags_1, clear flags_1, clear flags_2, or copy the current generation marker into flags_3. Clearing one inhibit flag does not guarantee invocation while another inhibit flag or the p_link mask remains set. [Flag wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L46-L85).

HSD_GObj_80390CFC snapshots the optional 64-bit process-link exclusion mask, advances a generation marker through 0, 1 and 2, and traverses priorities from zero through the configured maximum inclusively. A process already marked with the current generation is skipped. Otherwise it is marked before checking link exclusion and flags_1/flags_2. Eligible callbacks receive their owning GObj while global current pointers identify the running process and object. [Process traversal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L87-L115).

After invocation, the routine re-reads the process next pointer, handles deferred flags with object operation b1 taking precedence over relink b3 and process removal b2, clears deferred flags and resets current pointers. Its saved-next global drives traversal. Exact deletion/relink ownership and mutation rules require the gobjproc/gobjplink family. The routine is not evidence that arbitrary callback mutation or recursion is safe. [Deferred processing](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L116-L141).

## Render Dispatch and Adapters

HSD_GObj_80390ED0 iterates set bits in a u32 pass mask. For each pass it scans the supplied GObj's 64-bit GX-link mask and invokes non-null render callbacks on each selected linked list, passing the pass bit index. A local helper saves/restores HSD_GObj_804D7814 around each callback. HSD_GObj_80390FC0 instead visits GX link gx_link_max+1, passes zero and saves/restores HSD_GObj_804D7818. [Render traversal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L149-L199).

The light adapter forwards its HSD object to the light-list helper and initializes lights for the current CObj. The joint adapter maps its pass index through the unchecked table {1,4,2,0} before HSD_JObjDispAll. Fog delegates to HSD_FogSet. The camera adapter calls HSD_CObjSetCurrent and only on success dispatches mask 7 and calls HSD_CObjEndCurrent. Its own second argument is unused. CObj setup can change current before reporting failure, as established by the separately reviewed camera TU. [Adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L201-L234), [table lookup](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L143-L147), [camera activation](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L485-L519).

## Cleanup Registration

HSD_GObj_80391120 passes a non-null HSD_Obj through ref_DEC and calls hsdDelete only when the predicate succeeds. HSD_GObj_803911C0 delegates to it. The foreign predicate accepts HSD_OBJ_NOREF unchanged; otherwise it postdecrements and tests the old count against zero. This differs from saying that deletion occurs when the decremented value reaches zero. [Cleanup adapters](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L236-L246), [reference predicate](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L81).

HSD_GObj_803912A8 appends a supplied GObjFuncs block, clears its next pointer and returns prior sizes accumulated as u8. No overflow, duplicate registration or cycle guard exists. HSD_GObj_80391260 appends the built-in four-callback block and assigns consecutive camera/light/joint/fog kind IDs from the returned byte base. [Registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L248-L269).

## Naming and Coverage

All 275 C lines and 173 header lines were read in canonical and rendered views. There are zero parse errors. Rendered GObj_RunProcs and GObj_RunGXLinkMaxCallbacks names collide with their own source-comment tokens under the renderer's raw word scan; this is recorded separately from a semantic target-name collision. The two similar ResumeProcs aliases obscure which inhibit flag is cleared, and SetTextureCamera obscures render-pass traversal. Narrower aliases are proposed with direct canonical evidence.

All owned targets, entities and prior facts have explicit dispositions. Section attribution and broad game-category mappings remain unresolved; generic shared types remain family-owned. The librarian folder contains detailed function, source-only helper, header declaration and prior-fact inventories. Independent root review must accept changes before application.

## Verified Live Promotion

35 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobj/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobj/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/84b97e985d9d78fe1ed6150f19567421bd601abfd0d52448e47169d9afeae1bb/2026-09-08T14-47-54.057Z-35cad424-ffc9-4a68-b325-a9fed04afd2e.receipt.json>).
