import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { globalStandardsContext, globalStandardsPromptXml } from './decomp-context';
import { buildWorkerKernelContext } from '../agent-catalog/agents/running/worker/context';
const dirs: string[]=[];
const previous=process.env.ORCH_GAME_KNOWLEDGE_ROOT;
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});if(previous===undefined)delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;else process.env.ORCH_GAME_KNOWLEDGE_ROOT=previous;delete process.env.REVIEW_LINT_GLOBAL_STANDARDS_DIR;});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'sms-standards-'));dirs.push(root);
 const slice=join(root,'sources/owned/standards/sms');mkdirSync(slice,{recursive:true});
 writeFileSync(join(root,'sources/registry.json'),JSON.stringify({sources:[{id:'decomp_standards',path:'owned'}]}));
 writeFileSync(join(slice,'standards.jsonl'),[{id:'global_standard:sms-required',title:'SMS scope',status:'accepted',summary:['SMS game code only'],do:['Use original names'],do_not:['Edit SDK']},{id:'global_standard:pending',title:'Pending',status:'proposed',summary:['Unreviewed proposal']}].map(x=>JSON.stringify(x)).join('\n'));
 return root;
}
test('explicit standards selection resolves its registry and never falls back to Melee',()=>{
 const root=fixture();const selection={knowledgeRoot:root,gameId:'sms'};process.env.REVIEW_LINT_GLOBAL_STANDARDS_DIR=join(root,'no-global-standards');
 const context=globalStandardsContext(selection);expect(context.standard_count).toBe(2);
 const xml=globalStandardsPromptXml(selection);expect(xml).toContain('SMS game code only');expect(xml).not.toContain('Unreviewed proposal');expect(xml).not.toContain('HSD_JObj');
 expect(globalStandardsContext({knowledgeRoot:join(root,'missing'),gameId:'sms'}).standard_count).toBe(0);
});
test('SMS restrictions survive full, compact and minimal worker budgets',()=>{
 const root=fixture();process.env.ORCH_GAME_KNOWLEDGE_ROOT=root;process.env.REVIEW_LINT_GLOBAL_STANDARDS_DIR=join(root,'no-global-standards');
 for(const contextBudget of ['full','compact','minimal'] as const){
  const rendered=JSON.stringify(buildWorkerKernelContext({packet:{},repoRoot:root,stateDir:root,initialBoardPath:'',workerLogDir:root,contextBudget,game:{gameId:'sms',gameKind:'doldecomp-sms',repoRoot:root,stateDir:root,graphDbPath:join(root,'graph.sqlite')}}));
  expect(rendered).toContain('SMS game code only');expect(rendered).not.toContain('HSD_JObj');expect(rendered).not.toContain('Unreviewed proposal');
 }
});

test('SMS selection composes the game root with the global standards root',()=>{
 delete process.env.REVIEW_LINT_GLOBAL_STANDARDS_DIR;
 const selection={gameId:'sms',knowledgeRoot:join(import.meta.dir,'../../../../../games/sms/knowledge')};
 const context=globalStandardsContext(selection) as {standards:{id:string;scope:string;status:string}[]};
 const game=context.standards.filter(s=>s.scope==='game');const global=context.standards.filter(s=>s.scope==='global');
 expect(game.length).toBeGreaterThanOrEqual(8);expect(global.length).toBeGreaterThanOrEqual(12);
 expect(context.standards.findIndex(s=>s.scope==='global')).toBeGreaterThan(context.standards.findIndex(s=>s.scope==='game'));
 const xml=globalStandardsPromptXml(selection);
 for(const id of ['sms-fabricated-marker','sms-pch-string-convention','no-symbol-forgery','no-inert-emission','matching-tactics-need-evidence','avoid-pragmas-register-asm'])expect(xml).toContain(id);
 expect(xml).toContain('scope="game"');expect(xml).toContain('scope="global"');
});

test('accepted SMS maintainer requirements are present in the real game baseline',()=>{
 const xml=globalStandardsPromptXml({gameId:'sms',knowledgeRoot:join(import.meta.dir,'../../../../../games/sms/knowledge')});
 for(const id of ['sms-name-review','sms-map-symbols','sms-temporary-tactics','sms-fabricated-marker'])expect(xml).toContain(id);
 expect(xml).toContain('evidence alone is not naming approval');
 expect(xml).toContain('sms_symbol_map_validation');
 expect(xml).toContain('(void)0');
});
