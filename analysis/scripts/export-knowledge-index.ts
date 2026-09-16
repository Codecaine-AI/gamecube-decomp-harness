/** Refresh browsable identity/name metadata. Record facts still load through the live API. */
import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root=resolve(import.meta.dir,"../..");
const db=new Database(resolve(root,"games/melee/knowledge/knowledge.sqlite"),{readonly:true});
const aliases=Object.fromEntries(db.query<{key:string;value:string},[]>(`SELECT coalesce(t.stable_key,e.locator) key,f.value FROM fact f LEFT JOIN target t ON t.id=f.target_id LEFT JOIN entity e ON e.id=f.entity_id WHERE f.type='inferred_name' AND (t.identity_status='current' OR e.identity_status='active')`).all().map(r=>[r.key,r.value]));
const confidence=Object.fromEntries(db.query<{key:string;confidence:number},[]>(`SELECT coalesce(t.stable_key,e.locator) key,f.confidence FROM fact f LEFT JOIN target t ON t.id=f.target_id LEFT JOIN entity e ON e.id=f.entity_id WHERE f.type='inferred_name' AND (t.identity_status='current' OR e.identity_status='active')`).all().map(r=>[r.key,r.confidence]));
const entities=db.query(`SELECT e.id,e.kind,e.locator,p.locator parent FROM entity e LEFT JOIN entity p ON p.id=e.parent_entity_id WHERE e.identity_status='active'`).all();
const output=resolve(root,"apps/frontend/public/knowledge-source/melee");mkdirSync(output,{recursive:true});writeFileSync(resolve(output,"knowledge-index.json"),JSON.stringify({generatedAt:new Date().toISOString(),aliases,confidence,entities}));db.close();
console.log(`Exported ${Object.keys(aliases).length} proposed names and ${entities.length} entities`);
