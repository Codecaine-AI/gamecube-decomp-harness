import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectBannedStackTactics, detectSteeringTactics } from '../knowledge-v2/stack-policy-filter';
import { globalStandardsContext, globalStandardsPromptXml } from './decomp-context';

// sms_compiler and a few evidence records carry upstream facts from
// doldecomp/sms@4641b450 (AGENTS.md, docs/AGENT_MATCHING_TIPS.md), restated as
// diagnosis. Only the essentials are injected; the full cited text is a
// workflow_only record that search finds but no prompt renders.
const SMS_KNOWLEDGE = join(import.meta.dir, '../../../../../games/sms/knowledge');
const SMS = { gameId: 'sms', knowledgeRoot: SMS_KNOWLEDGE };
const MELEE = { gameId: 'melee', knowledgeRoot: join(import.meta.dir, '../../../../../games/melee/knowledge') };
const STANDARDS = join(SMS_KNOWLEDGE, 'sources/injectable/decomp_standards/standards');

const UPSTREAM_CITATION = /\(doldecomp\/sms@4641b450 (?:docs\/AGENT_MATCHING_TIPS\.md|AGENTS\.md)/;
const UPSTREAM_URL = 'https://github.com/doldecomp/sms/blob/4641b45058c7ff0c7e1c313a9fc35b2c92850385/';
const FACTS_ID = 'sms-mwcc-codegen-facts';
const REFERENCE_ID = 'sms-mwcc-codegen-reference';
// Opening words of each upstream bullet appended to an existing record.
const APPENDED: Record<string, string[]> = {
  'sms-authored-evidence': ['Evidence, strongest first:', 'A high match percentage does not prove behaviour'],
  'sms-map-symbols': ["mario.MAP's closure `>>>` lines"],
  'matching-tactics-need-evidence': ['Prove every hunk'],
  'sms-temporary-tactics': ['Frame deficits are never evidence'],
  'sms-accessor-evidence': ['Test an unproven accessor at every site'],
  'sms-unused-functions': ['A map size is a check on a body from evidence'],
};

interface StandardRecord {
  id: string;
  family: string;
  status: string;
  worker_facing?: boolean;
  summary: string[];
  do?: string[];
  evidence_refs: string[];
}

function smsRecords(): Map<string, StandardRecord> {
  const records = new Map<string, StandardRecord>();
  for (const family of ['sms_baseline', 'sms_fidelity', 'sms_compiler']) {
    for (const line of readFileSync(join(STANDARDS, family, 'standards.jsonl'), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const record = JSON.parse(line) as StandardRecord;
      records.set(record.id.replace('global_standard:', ''), record);
    }
  }
  return records;
}

function expectNoTactic(bullet: string): void {
  expect(detectBannedStackTactics(bullet)).toEqual([]);
  expect(detectSteeringTactics(bullet)).toEqual([]);
}

test('the codegen facts render for SMS workers and not for Melee', () => {
  const xml = globalStandardsPromptXml(SMS);
  expect(xml).toContain(`id="${FACTS_ID}" scope="game"`);
  expect(xml).toContain('real_code_evidence compiler');
  expect(xml).toContain('never permission for a fakematch');
  const melee = globalStandardsPromptXml(MELEE);
  expect(melee).not.toContain(FACTS_ID);
  expect(melee).not.toContain('doldecomp/sms@4641b450');
});

test('the codegen facts cite upstream once and carry no banned tactic', () => {
  const record = smsRecords().get(FACTS_ID)!;
  expect(record.status).toBe('accepted');
  expect(record.summary.filter((bullet) => UPSTREAM_CITATION.test(bullet))).toHaveLength(1);
  expect(record.evidence_refs.filter((ref) => ref.startsWith(UPSTREAM_URL)).length).toBeGreaterThan(5);
  for (const bullet of [...record.summary, ...(record.do ?? [])]) expectNoTactic(bullet);
});

test('the full cited reference is searchable but never injected', () => {
  const record = smsRecords().get(REFERENCE_ID)!;
  expect(record.status).toBe('workflow_only');
  expect(record.worker_facing).toBe(false);
  for (const bullet of record.summary) {
    expect(bullet).toMatch(UPSTREAM_CITATION);
    expectNoTactic(bullet);
  }
  expect(globalStandardsPromptXml(SMS)).not.toContain(REFERENCE_ID);
  // The librarian view keeps accepted records only.
  const listed = globalStandardsContext(SMS).standards as Array<{ id: string; status: string }>;
  expect(listed.find((item) => item.id === `global_standard:${REFERENCE_ID}`)?.status).toBe('workflow_only');
});

test('appended upstream bullets render, cite upstream in evidence_refs and carry no banned tactic', () => {
  const records = smsRecords();
  const xml = globalStandardsPromptXml(SMS);
  for (const [id, openings] of Object.entries(APPENDED)) {
    const record = records.get(id)!;
    expect(record.evidence_refs.some((ref) => ref.startsWith(UPSTREAM_URL))).toBe(true);
    for (const opening of openings) {
      const bullet = record.summary.find((item) => item.startsWith(opening));
      expect(bullet).toBeDefined();
      expect(xml).toContain(opening.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      expectNoTactic(bullet!);
    }
  }
  // Upstream scaffolding the SMS policy bans is not carried as advice.
  for (const banned of ['volatile char trash', 'marker__', 'rogue includes', 'Introduce a local', 'Introducing a TU-local']) {
    expect(xml).not.toContain(banned);
  }
});
