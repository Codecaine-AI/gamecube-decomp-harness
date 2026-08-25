/**
 * kg-librarian-corroborate — one-time post-backfill corroboration pass.
 *
 * The parallel backfill ran ~2,000 batches that could not see each other's
 * output, so subjects accumulated overlapping learnings. This job feeds each
 * multi-learning subject group back through the librarian's curation door —
 * anchored against the CURRENT checkout (symbol existence / file existence) —
 * and applies its verdicts: corroborate consistent learnings, refute
 * contradicted or stale ones, accept merged replacements. Live intake
 * self-corroborates via ledger_search; this pass never needs to run again.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { librarianPrompt } from "@server/core/agent-catalog/agents/knowledge/librarian";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";

import { appendLearnings, defaultLedgerPath, type LearningRecord } from "../ledger";
import { validateLibrarianReport, learningRecord } from "./librarian";
import { mapLimit } from "./kg";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options";
import { knowledgeCycleSessionId } from "./cycle-session.js";

interface SubjectGroup {
  subject_key: string;
  scope: string;
  anchor: string;
  anchor_status: { kind: string; exists: boolean };
  learnings: LearningRecord[];
}

interface CorroborationBatch {
  batch_id: string;
  groups: SubjectGroup[];
}

interface ManifestRow {
  batch_id: string;
  status: "done" | "failed";
  attempts: number;
  updated_at: string;
  verdicts_applied: number;
  merged_learnings: number;
  error?: string | null;
}

function latestLearnings(ledgerPath: string): Map<string, LearningRecord> {
  const latest = new Map<string, LearningRecord>();
  if (!existsSync(ledgerPath)) return latest;
  for (const line of readFileSync(ledgerPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as LearningRecord;
      if (record?.id) latest.set(record.id, record);
    } catch {
      // skip malformed lines; append-only ledger tolerates them
    }
  }
  return latest;
}

function subjectKey(record: LearningRecord): string {
  const subject = (record.subject ?? {}) as unknown as Record<string, unknown>;
  const scope = String(subject.scope ?? "general");
  const anchor = String(subject.symbol ?? subject.file ?? subject.area ?? "general");
  return `${scope}::${anchor}`;
}

/** Anchor check against the current checkout: symbols via the functions index, files on disk. */
function buildAnchorChecker(repoRoot: string): (scope: string, anchor: string) => { kind: string; exists: boolean } {
  const symbols = new Set<string>();
  const functionsIndex = resolve(
    repoRoot,
    "games/melee/knowledge/sources/code_context/code_graph/indexes/functions.jsonl",
  );
  if (existsSync(functionsIndex)) {
    for (const line of readFileSync(functionsIndex, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { symbol?: string };
        if (row.symbol) symbols.add(row.symbol);
      } catch {
        // ignore
      }
    }
  }
  const checkoutRoot = resolve(repoRoot, "games/melee/checkout");
  return (scope, anchor) => {
    if (scope === "symbol") return { kind: "symbol", exists: symbols.has(anchor) };
    if (scope === "file") return { kind: "file", exists: existsSync(resolve(checkoutRoot, anchor)) || existsSync(resolve(repoRoot, anchor)) };
    return { kind: scope, exists: true };
  };
}

export function planCorroborationBatches(ledgerPath: string, repoRoot: string, groupsPerBatch = 8): CorroborationBatch[] {
  const anchorCheck = buildAnchorChecker(repoRoot);
  const groups = new Map<string, LearningRecord[]>();
  for (const record of latestLearnings(ledgerPath).values()) {
    if (record.status === "refuted") continue;
    const key = subjectKey(record);
    const bucket = groups.get(key) ?? [];
    bucket.push(record);
    groups.set(key, bucket);
  }
  const multi: SubjectGroup[] = [];
  for (const [key, learnings] of groups) {
    if (learnings.length < 2) continue;
    const [scope, anchor] = key.split("::", 2);
    multi.push({
      subject_key: key,
      scope,
      anchor,
      anchor_status: anchorCheck(scope, anchor),
      learnings,
    });
  }
  multi.sort((a, b) => a.subject_key.localeCompare(b.subject_key));
  const batches: CorroborationBatch[] = [];
  for (let index = 0; index < multi.length; index += groupsPerBatch) {
    const chunk = multi.slice(index, index + groupsPerBatch);
    const idHash = createHash("sha256")
      .update(chunk.flatMap((group) => group.learnings.map((l) => l.id)).sort().join("|"))
      .digest("hex")
      .slice(0, 16);
    batches.push({ batch_id: idHash, groups: chunk });
  }
  return batches;
}

function loadManifest(path: string): Map<string, ManifestRow> {
  const rows = new Map<string, ManifestRow>();
  if (!existsSync(path)) return rows;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as ManifestRow;
      rows.set(row.batch_id, row);
    } catch {
      // ignore
    }
  }
  return rows;
}

interface Verdict {
  learning_id: string;
  verdict: "confirm" | "refute";
  reason?: string;
}

function parseVerdicts(value: unknown): Verdict[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { verdicts?: unknown }).verdicts)) return [];
  const out: Verdict[] = [];
  for (const raw of (value as { verdicts: unknown[] }).verdicts) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { learning_id?: unknown; verdict?: unknown; reason?: unknown };
    if (typeof candidate.learning_id !== "string") continue;
    if (candidate.verdict !== "confirm" && candidate.verdict !== "refute") continue;
    out.push({
      learning_id: candidate.learning_id,
      verdict: candidate.verdict,
      reason: typeof candidate.reason === "string" ? candidate.reason : undefined,
    });
  }
  return out;
}

export async function kgLibrarianCorroborate(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const jobs = Number(args.get("--jobs") ?? 16) || 16;
  const limit = Number(args.get("--limit") ?? 0) || 0;
  const planOnly = args.get("--plan") === true;
  const ledgerPath = defaultLedgerPath(globals.game?.gameId ?? globals.gameId ?? "melee");
  const baseDir = join(globals.stateDir, "knowledge_librarian", "corroborate");
  const manifestPath = join(baseDir, "manifest.jsonl");
  mkdirSync(baseDir, { recursive: true });

  const batches = planCorroborationBatches(ledgerPath, globals.repoRoot);
  const manifest = loadManifest(manifestPath);
  let pending = batches.filter((batch) => manifest.get(batch.batch_id)?.status !== "done");
  if (limit > 0) pending = pending.slice(0, limit);

  const summary: Record<string, unknown> = {
    command: "kg-librarian-corroborate",
    plan: planOnly,
    batch_count: batches.length,
    pending_count: pending.length,
    manifest_path: manifestPath,
  };
  if (planOnly) {
    console.log(JSON.stringify(summary));
    return;
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = join(baseDir, "runs", runId);
  mkdirSync(outputDir, { recursive: true });

  const ledgerBefore = latestLearnings(ledgerPath);
  let verdictsApplied = 0;
  let merged = 0;
  let failed = 0;
  let executed = 0;

  const waves: CorroborationBatch[][] = [];
  for (let index = 0; index < pending.length; index += jobs * 4) waves.push(pending.slice(index, index + jobs * 4));

  for (const wave of waves) {
  const outcomes = await mapLimit(wave, Math.min(jobs, wave.length || 1), async (batch) => {
    try {
      const result = await runPiAgent({
        role: "librarian",
        cwd: globals.repoRoot,
        prompt: librarianPrompt({
          door: "curation",
          curatorContext: {
            kind: "corroboration_batch",
            instructions:
              "Corroborate each subject group against the current checkout. For each group: confirm learnings whose statements are consistent with each other and with the anchor status; refute duplicates (keep the strongest phrasing), contradictions (later/better-evidenced wins), and anything whose anchor no longer exists (anchor_status.exists=false for symbol/file scopes). If several learnings say the same thing, confirm ONE and refute the rest as duplicates. Optionally emit a merged replacement learning when a combination is strictly better; give it the same subject.",
            groups: batch.groups,
          },
          repoRoot: globals.repoRoot,
          stateDir: globals.stateDir,
          game: globals.game,
        }),
        outputDir,
        dryRun: globals.dryRunAgents,
        provider: globals.provider,
        model: globals.model,
        thinkingLevel: globals.thinkingLevel,
        timeoutMs: globals.agentTimeoutSeconds ? globals.agentTimeoutSeconds * 1000 : undefined,
        toolContext: { repoRoot: globals.repoRoot, stateDir: globals.stateDir, game: globals.game },
        kernelContext: createMeleeKernelSpawnContext({
          kind: "knowledge-curation",
          gameId: globals.game?.gameId ?? globals.gameId,
          sessionId: knowledgeCycleSessionId({ globals, fallback: `corroborate-${batch.batch_id}` }),
          runId: runId,
          jobId: `corroborate-${batch.batch_id}`,
          jobKind: "Corroborate",
          phase: "knowledge-curation",
          workingDir: globals.repoRoot,
          metadata: { source: "corroboration", batchId: batch.batch_id },
        }),
      });
      if (result.dryRun) return { batch, verdicts: [] as Verdict[], mergedRecords: [] as LearningRecord[], failed: false, error: null };

      let parsedObject: unknown = null;
      let parseError: string | null = null;
      if (result.failed) {
        parseError = result.error ?? "agent failed";
      } else {
        try {
          parsedObject = JSON.parse(result.rawText.slice(result.rawText.indexOf("{")));
        } catch (error) {
          parseError = error instanceof Error ? error.message : String(error);
        }
      }
      const verdicts = parseVerdicts(parsedObject);
      const validation = parsedObject ? validateLibrarianReport(parsedObject) : { ok: false, errors: [], learnings: [] };
      const mergedRecords = validation.learnings.map((learning) =>
        learningRecord(learning, `librarian corroboration batch:${batch.batch_id}`),
      );
      return {
        batch,
        verdicts,
        mergedRecords,
        failed: Boolean(parseError) || (verdicts.length === 0 && mergedRecords.length === 0),
        error: parseError ?? (verdicts.length === 0 && mergedRecords.length === 0 ? "no verdicts returned" : null),
      };
    } catch (error) {
      return { batch, verdicts: [] as Verdict[], mergedRecords: [] as LearningRecord[], failed: true, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const updates: LearningRecord[] = [];
  for (const outcome of outcomes) {
    const updatedAt = new Date().toISOString();
    if (!outcome.failed) {
      for (const verdict of outcome.verdicts) {
        const existing = ledgerBefore.get(verdict.learning_id);
        if (!existing) continue;
        updates.push({
          ...existing,
          status: verdict.verdict === "confirm" ? "corroborated" : "refuted",
          corroboration: {
            verdict: verdict.verdict,
            reason: verdict.reason ?? null,
            batch_id: outcome.batch.batch_id,
            at: updatedAt,
          },
        } as LearningRecord);
        verdictsApplied += 1;
      }
      updates.push(...outcome.mergedRecords);
      merged += outcome.mergedRecords.length;
    } else {
      failed += 1;
    }
    const row: ManifestRow = {
      batch_id: outcome.batch.batch_id,
      status: outcome.failed ? "failed" : "done",
      attempts: (manifest.get(outcome.batch.batch_id)?.attempts ?? 0) + 1,
      updated_at: updatedAt,
      verdicts_applied: outcome.verdicts.length,
      merged_learnings: outcome.mergedRecords.length,
      error: outcome.error ?? null,
    };
    appendFileSync(manifestPath, `${JSON.stringify(row)}\n`);
    manifest.set(row.batch_id, row);
  }

  if (updates.length > 0 && !globals.dryRunAgents) appendLearnings(ledgerPath, updates);
  executed += outcomes.length;
  }

  console.log(
    JSON.stringify({
      ...summary,
      executed,
      done: executed - failed,
      failed,
      verdicts_applied: verdictsApplied,
      merged_learnings: merged,
      output_dir: outputDir,
    }),
  );
}
