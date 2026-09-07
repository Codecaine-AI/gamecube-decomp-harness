/** Import external attempts into existing V2 run records, then invoke the existing librarian by task ID. */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { candidates, digest, getSession, getWorker, locked, readJson, workerDir, writeJson, type Candidate, type Session, type Worker } from "./ledger.js";
import { root } from "./sandbox.js";
import { parse, gameMetadata } from "../../apps/server/src/core/game-registry/runtime-options.js";
import { workerSummarizerPrompt } from "../../apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/prompt.js";
import { validateNarrative, narrativeSubmissionsById, type WorkerSummaryNarrative } from "../../apps/server/src/core/knowledge-v2/summarizer-job/index.js";
import { condenseTranscriptContent } from "../../apps/server/src/core/knowledge-v2/summarizer-job/transcript.js";
import { insertWorkerRun, insertRunNarrative, enqueueIndexTask, type KnowledgeStoreHandle, type SubmissionInput, type WorkerRunInput } from "../../apps/server/src/core/knowledge-v2/records/index.js";
import { openKnowledgeStore } from "../../apps/server/src/core/knowledge-v2/storage/store.js";
import { immediateTransaction } from "../../apps/server/src/core/knowledge-v2/storage/transaction.js";
import { runMeleeKernelPiAgent } from "../../apps/server/src/infrastructure/agent-runtime/kernel-pi-runner.js";
import { createMeleeKernelSpawnContext } from "../../apps/server/src/infrastructure/kernel/bridge/spawn-context.js";
import { parseJsonObject } from "../../apps/server/src/infrastructure/agent-runtime/runtime/output-json.js";
import { runLibrarianConsumer } from "../../apps/server/src/core/knowledge-v2/librarian/consumer.js";

export interface AttemptPacket {
  session: Session; worker: Worker; checkpoints: Candidate[]; transcript: string;
  submissions: SubmissionInput[]; run: WorkerRunInput;
}
async function transcripts(path: string): Promise<string> {
  const chunks: string[] = [];
  async function walk(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory() && entry.name === "commands") await walk(file);
      else if (entry.isFile() && (entry.name === "events.jsonl" || entry.name === "transcript.jsonl" || dir.endsWith("/commands") && entry.name.endsWith(".json")))
        chunks.push(JSON.stringify({ type: "custom_message", content: `${file}\n${await readFile(file, "utf8")}` }));
    }
  }
  await walk(path);
  return condenseTranscriptContent(chunks.join("\n"), { maxBytes: 250_000, unparseableLineLimit: 4000 });
}
export async function packetForWorker(dir: string, id: string, targetId: string): Promise<AttemptPacket> {
  const session = await getSession(dir), worker = await getWorker(dir, id);
  if (worker.status !== "closed" || !worker.endedAt) throw new Error("Close the worker before importing its attempt");
  const checkpoints = (await candidates(dir)).filter(c => c.workerId === id);
  for (const c of checkpoints) {
    if (digest(await readFile(c.patchPath, "utf8")) !== c.patchHash) throw new Error(`Checkpoint artifact changed: ${c.id}`);
  }
  const runId = `run:mega:${session.id}:${id}`;
  const baseline = worker.baselineScore ?? null;
  const valid = checkpoints.filter(c => c.evidence.passed && c.evidence.after !== null && Number.isFinite(c.evidence.after));
  const best = valid.sort((a, b) => b.evidence.after! - a.evidence.after!)[0];
  const finalOutcome = best?.evidence.exact ? "match" : best && baseline !== null && best.evidence.after! > baseline ? "improvement"
    : worker.outcome === "error" || baseline === null ? "error" : "no_change";
  const submissions = checkpoints.filter(c => c.evidence.after !== null && Number.isFinite(c.evidence.after)).map((c, index) => ({
    id: `${runId}:sub:${index + 1}`, seq: index + 1, description: `Validation ${c.evidence.passed ? "passed" : "failed"}: ${c.evidence.reasons.join("; ")}`,
    hypothesis: c.hypothesis, score: c.evidence.after!, submittedAt: c.createdAt, runtimeRef: c.id,
  }));
  return {
    session, worker, checkpoints, submissions, transcript: await transcripts(workerDir(dir, id)),
    run: {
      id: runId, targetId, goal: `Experimental target branch ${session.branch}: ${worker.hypothesis}`,
      baseline: JSON.stringify({ score: baseline, source: "mega-target", source_path: session.target.source_path, base_rev: worker.baseRev,
        branch: session.branch, artifact_dir: workerDir(dir, id), canonical_integration: false }),
      // No synthetic harness run, epoch, worker-state, or claim rows.
      runId: null, workerStateId: null, finalOutcome, errorType: finalOutcome === "error" ? "worker_crash" : null,
      integration: null, integrationDetail: { status: "experimental_branch", disposition: "not_canonical_integration", conflict_paths: [], failure_reasons: [], resolved_at: null },
      startedAt: worker.startedAt, endedAt: worker.endedAt, closedAt: worker.endedAt,
    },
  };
}
function globalsFor(s: Session, dir: string) {
  const globals = parse(["mega-target", "--game", s.gameId]).globals;
  globals.repoRoot = s.repo;
  globals.stateDir = resolve(dir, "knowledge-runtime");
  return globals;
}
async function summarize(packet: AttemptPacket, dir: string): Promise<WorkerSummaryNarrative> {
  const globals = globalsFor(packet.session, dir);
  const outputDir = resolve(workerDir(dir, packet.worker.id), "summarizer");
  const result = await runMeleeKernelPiAgent({
    role: "summarizer", catalogAgentId: "worker-summarizer", cwd: packet.session.repo,
    prompt: workerSummarizerPrompt({
      transcript: { coverage: "Recorded worker notes and sandbox commands; native transcript included when supplied", content: packet.transcript },
      checkpointSubmissionDigest: {
        checkpoints: packet.checkpoints, submissions: packet.submissions, baseline: JSON.parse(packet.run.baseline),
        integration: null, final_outcome: packet.run.finalOutcome,
        provenance: "Experimental branch evidence only. Failed gates do not establish a match. No canonical source integration is claimed.",
      },
      targetCardReference: { id: packet.run.targetId, stable_key: `${packet.session.target.unit}:${packet.session.target.symbol}` },
      repoRoot: globals.repoRoot, stateDir: globals.stateDir, game: gameMetadata(globals),
    }),
    outputDir, dryRun: false, provider: globals.provider, model: globals.model, thinkingLevel: globals.thinkingLevel, timeoutMs: 600_000,
    toolContext: { repoRoot: globals.repoRoot, stateDir: globals.stateDir, game: globals.game },
    kernelContext: createMeleeKernelSpawnContext({ kind: "knowledge-curation", gameId: packet.session.gameId,
      sessionId: packet.session.id, runId: packet.session.id, jobId: `mega-summary-${packet.worker.id}`, jobKind: "WorkerSummary",
      phase: "knowledge-curation", workingDir: packet.session.repo, metadata: { externalAttempt: packet.run.id } }),
  });
  if (result.failed || result.dryRun) throw new Error(result.error ?? "External attempt summary failed");
  return validateNarrative(parseJsonObject(result.rawText).object);
}
export async function importWorker(dir: string, id: string, deps: {
  store?: KnowledgeStoreHandle; summarize?: (packet: AttemptPacket, dir: string) => Promise<WorkerSummaryNarrative>;
} = {}): Promise<{ runId: string; taskId: string; existing: boolean }> {
  return locked(dir, `knowledge-${id}`, async () => {
    const s = await getSession(dir);
    const owned = deps.store ? null : openKnowledgeStore({ gameId: s.gameId });
    const store = deps.store ?? owned!;
    try {
      const target = store.db.query<{ id: string }, [string]>("SELECT id FROM target WHERE stable_key = ? AND identity_status = 'current'").get(`${s.target.unit}:${s.target.symbol}`);
      if (!target) throw new Error("Target is absent from current knowledge. Synchronize the game knowledge before importing.");
      const packet = await packetForWorker(dir, id, target.id);
      const taskId = `mega-run-closed-${digest(packet.run.id).slice(0, 32)}`;
      const existing = store.db.query("SELECT id FROM worker_run WHERE id = ?").get(packet.run.id);
      if (existing) return { runId: packet.run.id, taskId, existing: true };
      const cache = resolve(workerDir(dir, id), "narrative.json");
      let narrative: WorkerSummaryNarrative;
      try { narrative = validateNarrative(await readJson<Record<string, unknown>>(cache)); }
      catch { narrative = await (deps.summarize ?? summarize)(packet, dir); }
      const byId = narrativeSubmissionsById(packet.submissions.map(row => row.id), narrative);
      await writeJson(cache, narrative);
      await writeJson(resolve(workerDir(dir, id), "external-attempt.json"), packet);
      immediateTransaction(store.db, () => {
        // A second coordinator may have imported while the model was running.
        if (store.db.query("SELECT id FROM worker_run WHERE id = ?").get(packet.run.id)) return;
        insertWorkerRun(store, packet.run, packet.submissions.map(row => ({ ...row,
          description: `${byId.get(row.id)!.approach} ${byId.get(row.id)!.outcome_reasoning}` })));
        insertRunNarrative(store, { workerRunId: packet.run.id, summary: narrative.run.summary,
          notableObservations: narrative.notable_observations, narrative, producedBy: "live" });
        enqueueIndexTask(store, { id: taskId, pathway: "run_closed", payload: `attempt://run/${packet.run.id}` });
      });
      await writeJson(resolve(workerDir(dir, id), "knowledge-import.json"), { runId: packet.run.id, taskId });
      return { runId: packet.run.id, taskId, existing: false };
    } finally { owned?.close(); }
  });
}
export async function processWorkerKnowledge(dir: string, id: string): Promise<unknown> {
  const imported = await importWorker(dir, id);
  const s = await getSession(dir), store = openKnowledgeStore({ gameId: s.gameId });
  try {
    const result = await runLibrarianConsumer(store, { runId: s.id, globals: globalsFor(s, dir),
      taskId: imported.taskId, pathway: "run_closed", limit: 1, concurrency: 1,
      // Corroborate against canonical code, not the experimental branch.
      checkoutRoot: s.repo, quiet: true, timeoutMs: 600_000 });
    await writeJson(resolve(workerDir(dir, id), "librarian-result.json"), result);
    const task = store.db.query<{ done_at: string | null; started_at: string | null }, [string]>("SELECT done_at, started_at FROM index_task WHERE id = ?").get(imported.taskId);
    return { ...imported, completed: task?.done_at != null, inProgress: task?.started_at != null && task.done_at == null, librarian: result };
  } finally { store.close(); }
}
