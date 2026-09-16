import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {renderSourceView,formatSourceView} from '../../../../../apps/server/src/core/knowledge-v2/source-view.ts';
const m=JSON.parse(readFileSync('games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json','utf8'));
const path='src/sysdolphin/baselib/jobj.h',source=readFileSync(resolve(m.checkout_root,path),'utf8');
const rendered=renderSourceView({path,source,names:[],startLine:225,maxLines:32,maxChars:32000,knowledgeStatus:'foreign_canonical_no_hypothesis_overlay'});
writeFileSync(resolve(import.meta.dir,'foreign-jobj-render.json'),JSON.stringify({path,head_revision:m.head_revision,sha256:createHash('sha256').update(source).digest('hex'),rendered},null,2));console.log(formatSourceView(rendered));
