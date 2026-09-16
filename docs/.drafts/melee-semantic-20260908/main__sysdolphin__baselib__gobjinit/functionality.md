Status: Reviewed and promoted to the live knowledge base.

# GObj Initialization Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 94 owned source lines read in canonical and rendered form. The manifest assigns no header. Renderer status is ok, with zero parse errors and two hypothesis substitutions. Hash and UTC timings are in coverage.json.

## Defined Functions and Data

| Canonical Symbol | Type and Behavior | Evidence |
|---|---|---|
| HSD_GObj_80408620 | Static HSD_GObjLibInitDataType defaults: p-link 63, GX-link 63, process priority 2; remaining members zero. | [src/sysdolphin/baselib/gobjinit.c:6–15](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjinit.c#L6-L15) |
| HSD_GObj_803912E0 | void(HSD_GObjLibInitDataType* arg0), required writable output; whole default descriptor copy. | [12–15](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjinit.c#L12-L15) |
| HSD_GObj_80391304 | void(HSD_GObjLibInitDataType* arg0), mutable initialization input/output; appends callback configuration and builds global runtime state. | [20–93](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjinit.c#L20-L93) |

These are all source-defined functions. The named static descriptor is confirmed. Associating the complete .data target with it requires compiled attribution; all four section-target facts remain unresolved.

## Runtime Behavior

Initialization copies the augmented descriptor globally. It allocates two p-link arrays with p_link_max+1 slots, two GX-link arrays with gx_link_max+2 slots, one priority array with gproc_pri_max+1 slots and one priority-by-p-link array. All entries are zeroed. It passes sizeof(HSD_GObj) and sizeof(HSD_GObjProc), each with alignment argument 4, to HSD_ObjAllocInit. It concatenates GObjFunc entries in list order and resets the explicit globals at lines 87–92. It does not reset HSD_GObj_804D7830 or HSD_GObj_804D7834 here.

Foreign canonical gobj.c lines 248–268 show the input callback list being modified before allocation. The built-in group has four entries at lines 33–44. This makes the local nfuncs==0 branch normally unreachable for a valid finite list. The routine has no already-initialized check and no local release of prior arrays. Safe repeated calls and allocation-failure behavior are not established.

The scene caller copies defaults, sets priority maximum to 0x18, registers SObj callbacks and sets unk_2 before full initialization. The scene dispatcher runs this setup before the selected scene handler's on_enter. Foreign files were read as canonical context only; no shared-header ownership is claimed.

## Naming and Dispositions

Retain HSD_GObjGetDefaultInitData and HSD_GObjLibInit as inferred hypotheses supported by behavior, not attested original names. Propose out_init_data and init_data for the two arg0 parameter entities, with explicit data-flow facts. Supersede the full initializer's state-behavior fact to distinguish a syntactic branch from normal reachable execution.

All six subjects and 19 facts are covered: 13 retained, two superseded and four unresolved section-attribution facts. Six proposal operations were reviewed and promoted. Research made no source changes; the independent root workflow later promoted the reviewed knowledge proposals.

## Verified Live Promotion

6 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjinit/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjinit/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/befcaa99bb0da6deb4fd4b489425bde28e434548d5c50d052b1d9fd0abb79b06/2026-09-08T14-54-26.585Z-c21ec158-c047-454e-b17e-56610c9329e8.receipt.json>).
