import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBackfillConfig } from './backfill-config';
import { parse } from './runtime-options';

test('SMS backfill defaults are isolated from librarian and other jobs', () => {
 const backfill=parse(['kg2-backfill','--game','sms']);
 expect(backfill.globals.model).toBe('gpt-5.6-terra');
 expect(backfill.globals.thinkingLevel).toBe('medium');
 expect(backfill.args.get('--concurrency')).toBe('16');
 expect(backfill.args.get('--limit')).toBe('32');
 expect(parse(['kg2-librarian','--game','sms']).globals.model).toBe('gpt-5.6-sol');
});
test('explicit CLI arguments override SMS backfill defaults', () => {
 const result=parse(['kg2-backfill','--game','sms','--model','gpt-5.6-sol','--thinking-level','high','--concurrency','64','--limit','128','--agent-timeout-seconds','120']);
 expect(result.globals.model).toBe('gpt-5.6-sol');
 expect(result.globals.thinkingLevel).toBe('high');
 expect(result.globals.agentTimeoutSeconds).toBe(120);
 expect(result.args.get('--concurrency')).toBe('64');
 expect(result.args.get('--limit')).toBe('128');
});
test('missing profile preserves defaults and invalid concurrency fails before launch', () => {
 const dir=mkdtempSync(join(tmpdir(),'backfill-config-'));
 try {
  const globals=parse(['status']).globals;const original={...globals};const args=new Map<string,string|true>();
  applyBackfillConfig(dir,globals,args,[]);expect(globals).toEqual(original);
  mkdirSync(join(dir,'config'));writeFileSync(join(dir,'config/backfill.json'),JSON.stringify({schemaVersion:1,concurrency:0}));
  expect(()=>applyBackfillConfig(dir,globals,args,[])).toThrow('Invalid backfill concurrency');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
