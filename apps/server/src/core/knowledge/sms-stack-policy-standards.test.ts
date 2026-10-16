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
  'The one tolerated ordering anchor is the isolated, @todo-marked order_sdata2 helper',
  'The only tolerated form is an isolated, `@todo`-marked `order_sdata2`-style helper',
  'Keep an unavoidable .sdata2 ordering helper isolated',
  '/// @todo .sdata2 order hack\nstatic void order_sdata2(void)\n{\n    (void) -1.0f;\n    (void) S32_TO_F32;',
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
  expect(xml).toContain('id="no-inert-emission" scope="game"');
  expect(xml).toContain('id="literals-and-data-ownership" scope="game"');
  expect(xml).toContain('Do not add data-ordering helpers');
});

test('SMS example pool replaces the leaking global examples', () => {
  const examples = loadStandardExamples(SMS);
  const text = JSON.stringify(examples);
  for (const leak of LEAKS) expect(text).not.toContain(leak);
  const ids = examples.map((example) => String(example.id));
  for (const id of ['matching-helper-replaces-dummy-local', 'codegen-pragma-todo-exception', 'fidelity-single-use-wrapper', 'fidelity-layout-cue-local', 'sdata2-order-helper']) {
    expect(ids.filter((item) => item === id)).toHaveLength(1);
  }
  expect(JSON.stringify(globalStandardsContext(SMS))).not.toContain('nonmatching with a TODO');
});

test('Melee still renders the global advice', () => {
  const xml = globalStandardsPromptXml(MELEE);
  expect(xml).toContain('A pragma carrying a TODO or fabricated marker on an adjacent line is a warning');
  expect(xml).toContain('Mark a temporary fabricated helper per the game');
  expect(xml).toContain('PAD_STACK(N) is the only accepted stack-padding form');
  expect(xml).toContain('The one tolerated ordering anchor is the isolated, @todo-marked order_sdata2 helper');
  expect(xml).toContain('The only tolerated form is an isolated, `@todo`-marked `order_sdata2`-style helper');
  expect(xml).not.toContain('sms-no-agent-comments');
});

test('SMS workers are told to drop invented helpers and odd-looking code (D1/D2)', () => {
  const xml = globalStandardsPromptXml(SMS);
  expect(xml).toContain('Do not invent helpers');
  expect(xml).toContain('planeDistance');
  expect(xml).toContain('id="sms-plain-code"');
  expect(xml).toContain('point != 0 || point != 0');
  const ids = loadStandardExamples(SMS).map((example) => String(example.id));
  for (const id of ['sms-invented-helper-plane-distance', 'sms-invented-helper-water-hit-count', 'sms-plain-code-repeated-test', 'sms-plain-code-double-negation', 'sms-plain-code-dead-store', 'sms-plain-code-empty-branch']) {
    expect(ids).toContain(id);
  }
  expect(globalStandardsPromptXml(MELEE)).not.toContain('sms-plain-code');
});

test('SMS workers are told steering is a probe, never the fix', () => {
  const xml = globalStandardsPromptXml(SMS);
  expect(xml).toContain('id="sms-no-steering"');
  expect(xml).toContain('steering_check.py check');
  expect(xml).toContain('real_code_evidence');
  const ids = loadStandardExamples(SMS).map((example) => String(example.id));
  for (const id of ['example:sms-no-steering-temp', 'example:sms-no-steering-inline-hop', 'example:sms-no-steering-real-control-flow']) {
    expect(ids).toContain(id);
  }
  expect(globalStandardsPromptXml(MELEE)).not.toContain('sms-no-steering');
});
