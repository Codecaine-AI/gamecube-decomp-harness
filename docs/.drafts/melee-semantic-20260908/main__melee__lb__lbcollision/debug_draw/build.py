import json,pathlib,hashlib,collections
D=pathlib.Path(__file__).parent; M=json.load(open('games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json')); R=M['head_revision'];P='src/melee/lb/lbcollision.c'; x=json.load(open(D/'baseline-facts.json'))
def cite(p,a,b):return f'code://{R}/{p}#L{a}-L{b}'
ranges=[(225,256),(1987,2039),(2050,2175),(2177,2304),(2306,2350),(2352,2388),(2403,2426),(2428,2443),(2445,2460),(2462,2506),(2508,2527),(2529,2580),(2622,2630),(2632,2640),(2642,2650),(2652,2665)]
desc=[
'Guards nullable joint setup with the combined non-user-defined and matrix-dirty predicate before delegating to HSD_JObjSetupMatrixSub. Canonical inline name retained.',
'Configures TEV, blending, depth and channel state from primary and ambient colors. Alpha below 255 enables blending and disables depth writes and channel lighting.',
'Draws world-space endpoint geometry with two end display lists and an optional cylinder. Uses camera view and inverse-transpose normal matrices. Near-zero distance skips the cylinder.',
'Draws the same capsule with an extra caller matrix before camera view composition. Endpoints are local to that matrix and radius scales the geometry.',
'Draws a quad using opposite XY corners, always v0.z; v1.z is unused. No culling; no gameplay mutation.',
'Draws enabled unsuppressed HitCapsule geometry with catch, inert or default palette. Pass 0 is opaque, pass 2 otherwise; x43_b1 bypasses owner scaling.',
'Draws the thrownHitbox supplied by fighter draw code, using fixed palette and the same HitCapsule state and scale guards.',
'Draws the It_Kind_Unk4 item collision record using x14/x8 endpoints and x0 multiplied by item scale. Caller validates special item flags.',
'Draws fighter x1614 record endpoints with x0 multiplied by scale_y. Exact gameplay category remains unresolved.',
'Draws HurtCapsule using state palette; lazily refreshes endpoint cache, optionally replaces refreshed Z values and concatenates display/bone matrix.',
'Draws fighter x1670 joint marker as coincident capsule endpoints. Calls HSD_JObjSetupMatrix only on the selected alpha pass.',
'Draws HurtCapsule with caller palette index except intangible state forces index 2. Cache refresh and optional display transform match ordinary hurt drawing.',
'Draws shield_hit via shared cached-center sphere helper and shield palette; caller guard is x221B_b0.',
'Draws reflect_hit via shared cached-center sphere helper and reflector palette; caller guard is reflecting.',
'Draws absorb_hit via shared cached-center sphere helper and absorber palette; caller guard is x2218_b6.',
'Read-only pointer membership predicate over victims_1. Stops at first match, otherwise returns false. Null is not special-cased.'
]
O={
('HSD_JObjSetupMatrix','purpose'):'Skips null joints and joints with JOBJ_USER_DEF_MTX set or JOBJ_MTX_DIRTY clear. Otherwise delegates transform setup to HSD_JObjSetupMatrixSub.',
('HSD_JObjSetupMatrix','data_flow'):'Reads a nullable HSD_JObj pointer and its flags. Only a non-null, non-user-defined joint with JOBJ_MTX_DIRTY reaches HSD_JObjSetupMatrixSub; the callee invokes make_mtx, clears dirty state and dispatches joint or RObj post-processing.',
('HSD_JObjSetupMatrix','state_behavior'):'The wrapper performs no setup for null, user-defined-matrix, or clean joints. Eligible dirty joints enter HSD_JObjSetupMatrixSub, which builds and clears the matrix dirty flag, resolves joint-kind-specific processing, and may rebuild after RObj processing dirties the matrix again.',
('HSD_JObjSetupMatrix','inferred_type'):'Canonical inline signature void HSD_JObjSetupMatrix(HSD_JObj* jobj), with nullable mutable joint pointer. The definition adds static outside __MWERKS__. The manifest assigns a retained target identity to lbcollision; this source review does not establish the linker selection or deduplication mechanism.',
('lbColl_8000A1A8','game_mapping'):'Visualizes one fighter-owned x1614 capsule with a fixed palette. The caller supplies fighter scale_y and aggregates whether drawing occurred. Its precise gameplay collision category is unresolved; color alone does not identify hurtbox behavior.',
('lbColl_8000A1A8','purpose'):desc[8],
('lbColl_8000A1A8','state_behavior'):'Primary alpha 255 selects pass 0; every other alpha selects pass 2. Matching pass submits x14/x8 endpoints and x0 times scale_y and returns true. A mismatching pass returns false.',
('lbColl_8000A460','state_behavior'):'Primary alpha 255 selects pass 0; every other alpha selects pass 2. A mismatch returns false without joint setup. A match sets up the joint matrix, submits coincident endpoints and returns true. Submission does not guarantee visible pixels, especially for zero-alpha palettes.',
('lbColl_8000A95C','state_behavior'):'A pass mismatch returns false without cache updates or drawing. On a matching pass, a clear skip_update_pos triggers bone-offset transformation, optional pos_z replacement only during this refresh, and setting skip_update_pos. Cached positions are otherwise reused unchanged. A non-null display matrix is concatenated with the bone matrix regardless of cache state before drawing; successful submission returns true.',
('lbColl_8000A244','inferred_type'):'bool(HurtCapsule* hurt, u32 draw_pass, MtxPtr display_mtx, float display_z). The optional matrix is concatenated with the bone matrix. display_z replaces endpoint depth only when their cache is refreshed with a non-null display_mtx. Return reports submission.',
('lbColl_8000A95C','inferred_type'):'bool(HitResult* reflect_hit, u32 draw_pass, MtxPtr display_mtx, f32 pos_z). Optional display matrix composes with the bone matrix; pos_z is used only during a cache refresh with a non-null matrix. Return reports submission.',
('lbColl_8000AB2C','inferred_type'):'bool(HitResult* absorb_hit, u32 draw_pass, MtxPtr display_mtx, f32 display_z). Optional display matrix composes with the bone matrix; display_z is used only during a cache refresh with a non-null matrix. Return reports submission.',
('lbColl_8000AB2C','game_mapping'):'Visualizes the fighter absorb_hit region as diagnostic sphere geometry. The draw caller gates it with x2218_b6. This function does not perform absorption collision tests.',
('lbColl_8000ACFC','data_flow'):'Compares the opaque victim identity to victims_1 slots, stopping at the first match and returning true; returns false after exhausting the array. It does not dereference victim or mutate any record.',
('lbColl_8000ACFC','purpose'):'Tests whether a supplied identity is present in a HitCapsule primary victims_1 array.',
('lbColl_8000ACFC','state_behavior'):'Returns true on the first pointer match and false after exhausting victims_1, without mutation. A null candidate can match a null slot; there is no null rejection.'
}
pro=[]; disp=[]; cov=[]
for i,s in enumerate(x):
 key=next(iter(s['subject'].values()));sym=key.split(':')[-1].split('#')[0]
 if i>=16:
  cov.append({'subject':s['subject'],'status':'reviewed_no_existing_facts','facts':0,'semantic_accounting':'Parameter entity belongs to reviewed function '+sym+'. Source-level roles are documented in the target findings; register-to-source mapping is unresolved, so no ABI-derived name/type is promoted.'});continue
 a,b=ranges[i];ev=[cite('src/sysdolphin/baselib/jobj.h' if i==0 else P,a,b)]
 if i==0:ev+=[cite('src/sysdolphin/baselib/jobj.c',1385,1443)]
 if i in [9,11,12,13,14]:ev+=[cite(P,2390,2401),cite(P,2582,2620)]
 if i in [6,8,10,12,13,14]:ev+=[cite('src/melee/ft/ftdrawcommon.c',120,227)]
 if i in [5,7,9,11]:ev+=[cite('src/melee/it/itdraw.c',74,127)]
 if i==4:ev+=[cite('src/melee/ft/kinds/ftCommon/ftCo_0A01.c',8705,8777)]
 cov.append({'subject':s['subject'],'status':'reviewed','source_range':[a,b],'behavior':desc[i],'evidence':ev,'fact_count':len(s['facts'])})
 for f in s['facts']:
  value=O.get((sym,f['type']));status='supersede' if value else 'retain';reason=desc[i]
  if i==15 and f['type']=='game_mapping':status='unresolved';reason='Local history lookup confirmed, but broader collision eligibility and reset policy requires victim-history/caller owner review.'
  if i==4 and f['type'] in ['data_flow','game_mapping']:status='unresolved';reason='Read caller rectangle construction and flashing state, but CPU-only guard and sole-caller exclusivity not fully established in this bounded review.'
  disp.append({'subject':s['subject'],'fact_id':f['id'],'version':f['updated_at'],'type':f['type'],'old_value':f['value'],'disposition':status,'reason':reason,'evidence':ev,'replacement':value})
  if value or f['type']=='inferred_name':
   pro.append({'subject':s['subject'],'type':f['type'],'op':'write','value':value or f['value'],'rationale':reason+' Canonical source supports behavior; any inferred name remains a hypothesis.','confidence':min(f['confidence'],0.96),'evidence':[{'kind':'code','locator':e,'why':reason} for e in ev]})
json.dump({'tu':'main/melee/lb/lbcollision','proposal':{'facts':pro,'links':[],'entities':[],'merges':[],'follow_ups':[]}},open(D/'proposal.json','w'),indent=2)
json.dump({'campaign':M['campaign_id'],'revision':R,'cluster':'debug_draw','dispositions':disp,'counts':dict(collections.Counter(d['disposition'] for d in disp))},open(D/'fact-dispositions.json','w'),indent=2)
receipts=[json.loads(l) for l in open('games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbcollision/reads.jsonl') if json.loads(l).get('reader')=='collision_debug_draw']
foreign=[('src/sysdolphin/baselib/jobj.h',225,267),('src/sysdolphin/baselib/jobj.c',1385,1443),('src/melee/ft/ftdrawcommon.c',120,240),('src/melee/it/itdraw.c',40,142),('src/melee/ft/kinds/ftCommon/ftCo_0A01.c',8680,8777),('src/melee/ft/kinds/ftCommon/ftCo_0A01.c',8550,8588)]
fr=[{'path':p,'start':a,'end':b,'sha256':hashlib.sha256((pathlib.Path(M['checkout_root'])/p).read_bytes()).hexdigest(),'ownership':'foreign_evidence_only','canonical_read':True,'rendered_read':p.endswith('jobj.h'),'rendered_range':[225,256] if p.endswith('jobj.h') else None} for p,a,b in foreign]
json.dump({'campaign':M['campaign_id'],'tu':'main/melee/lb/lbcollision','cluster':'debug_draw','revision':R,'owned_range':[1987,2666],'canonical_and_rendered_receipts':receipts,'foreign_reads':fr,'subjects':cov,'counts':{'owned_lines':680,'targets':16,'parameter_entities':53,'facts':92,'proposal_facts':len(pro)},'exceptions':['Initial context and broad fact output truncated; recovered assigned context from manifest and reread all fact values in four bounded batches.','Foreign JObj header rendered without hypothesis overlay; 3 parse errors, 0 substitutions; canonical lines 225-256 independently read.','Foreign files are evidence only, never counted as fully owned/reviewed files.','No source-to-register ABI mapping promoted for 53 empty parameter entities.']},open(D/'coverage.json','w'),indent=2)
md=f'# Debug Drawing Review\n\nDraft, pending independent review. Revision `{R}`. Campaign `{M["campaign_id"]}`.\n\nOwned canonical and separate rendered coverage is lbcollision.c lines 1987-2666, all 680 lines. The four immutable page receipts in coverage.json carry source hashes and render metadata. All pages return ok with zero parse errors; the final page reaches line 2666. 16 targets and 53 empty parameter entities are accounted for. All 92 baseline facts have ID/version dispositions.\n\n## Function Findings\n\n'
for c in cov[:16]:md+='- `'+next(iter(c['subject'].values())).split(':')[-1]+'`: '+c['behavior']+' Evidence: '+', '.join(c['evidence'])+'\n\n'
md+='## Helpers and Invariants\n\n`isSmall` uses a strict open interval (-0.00001, 0.00001). `lbColl_DrawHitResult` inverse-transforms world endpoints before the matrix-aware renderer. `lbColl_DrawHit` creates coincident endpoints for HitResult, updates cached position only after the pass guard, and applies Z override only on refresh. None installs persistent callbacks. The renderer invokes GX and HSD routines, including indirect make_mtx through the foreign joint helper.\n\nThe near-zero capsule branch leaves the cylinder matrix uninitialized but later concatenates it before skipping cylinder submission. This is an existing source observation, not a matching or runtime failure claim. Radius zero and singular matrices are not guarded here.\n\n## Dispositions and Limits\n\n'+str(dict(collections.Counter(d['disposition'] for d in disp)))+'. Proposed writes include supported inherited name evidence refresh and narrowed semantic corrections. No canonical source names change. No new type entities, links, merges, or follow-ups enter the proposal.\n\nHSD_JObjSetupMatrix is defined in foreign baselib/jobj.h, not in the owned C file. The canonical wrapper and predicate prove the missing USER_DEF_MTX exclusion. Its existing linker deduplication explanation is narrowed because this review does not inspect compiler/linker output. Foreign rendered header has three parser errors and no substitutions; canonical guard evidence takes precedence.\n\nThe shield, reflector, absorber, thrown-hitbox and item aliases have pinned caller support. Exact original spelling remains inferred. Fighter_x1614 gameplay identity, Fighter_x1670 gameplay collision role, and shared HitResult/HurtCapsule/JObj layouts are family followups. Parameter entities have no existing facts; register slot spelling alone does not establish source argument mapping.\n\nRemaining three unresolved facts concern CPU-only/exclusive rectangle caller claims and full victim-history game policy. Local drawing and membership behavior is established.\n'
(D/'findings.md').write_text(md)
print('Counts',len(cov),len(disp),len(pro),collections.Counter(d['disposition'] for d in disp))
