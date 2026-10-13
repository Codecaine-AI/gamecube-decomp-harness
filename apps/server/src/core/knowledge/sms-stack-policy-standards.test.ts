import { afterEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { globalStandardsContext, globalStandardsPromptXml, loadStandardExamples } from './decomp-context';

// SMS overrides leaking global advice by record id: an SMS record or example
// with the global id is read first and the global one is dropped for SMS only.
const SMS = { gameId: 'sms', knowledgeRoot: join(import.meta.dir, '../../../../../games/sms/knowledge') };
const MELEE = { gameId: 'melee', knowledgeRoot: join(import.meta.dir, '../../../../../games/melee/knowledge') };

// Global advice that contradicts the SMS stack policy (2026-10-13 ruling).
const LEAKS = [
  'leave the function nonmatching with a TODO',
  'A pragma carrying a TODO or fabricated marker on an adjacent line is a warning',
  'Mark a temporary fabricated helper per the game',
  '// fabricated: authored helper boundary, see objdiff',
  '/// @todo Find a solution without the pragma',
  'keep the wrapper only with `// fabricated`',
];

afterEach(() => {
  delete process.env.REVIEW_LINT_GLOBAL_STANDARDS_DIR;
});

test('SMS standards render drops global TODO, padding and fabricated-inline advice', () => {
  const xml = globalStandardsPromptXml(SMS);
  for (const text of LEAKS) expect(xml).not.toContain(text);
  expect(xml).not.toMatch(/nonmatching with a TODO/);
  // The overriding SMS records render under the same ids, scoped to the game.
  expect(xml).toContain('id="matching-tactics-need-evidence" scope="game"');
  expect(xml).toContain('id="avoid-pragmas-register-asm" scope="game"');
  for (const id of ['sms-no-agent-comments', 'sms-accessor-evidence', 'sms-temporary-tactics']) expect(xml).toContain(id);
  expect(xml).toContain('stops at the stack frame');
});

test('SMS example pool replaces the leaking global examples', () => {
  const examples = loadStandardExamples(SMS);
  const text = JSON.stringify(examples);
  for (const leak of LEAKS) expect(text).not.toContain(leak);
  const ids = examples.map((example) => String(example.id));
  for (const id of ['matching-helper-replaces-dummy-local', 'codegen-pragma-todo-exception', 'fidelity-single-use-wrapper', 'fidelity-layout-cue-local']) {
    expect(ids.filter((item) => item === id)).toHaveLength(1);
  }
  expect(JSON.stringify(globalStandardsContext(SMS))).not.toContain('nonmatching with a TODO');
});

test('Melee still renders the global advice', () => {
  const xml = globalStandardsPromptXml(MELEE);
  expect(xml).toContain('A pragma carrying a TODO or fabricated marker on an adjacent line is a warning');
  expect(xml).toContain('Mark a temporary fabricated helper per the game');
  expect(xml).toContain('PAD_STACK(N) is the only accepted stack-padding form');
  expect(xml).not.toContain('sms-no-agent-comments');
});
