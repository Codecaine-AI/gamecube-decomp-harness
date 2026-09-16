import { expect, test } from 'bun:test';
import { backfillLibrarianPrompt } from '../../agent-catalog/agents/knowledge/backfill-librarian';
test('backfill context carries the selected game, revision, citation grammar and write scope', () => {
 const prompt=backfillLibrarianPrompt({task:{game_id:'sms',head_revision:'72a4b712'},fillOutSubjects:[],supportingSubjects:[],decompStandards:[]});
 const text=JSON.stringify(prompt);
 expect(text).toContain('sms');
 expect(text).toContain('72a4b712');
 expect(text).toContain('task.head_revision');
 expect(text).toContain('code://<revision>/<path>#L<start>-L<end>');
 expect(text).toContain('not permission to write facts about every member');
 expect(text).not.toContain("Melee decompilation's knowledge library");
 expect(text).not.toContain('mirrored SmashWiki');
});
