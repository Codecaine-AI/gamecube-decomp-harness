// Opt-in live librarian-feed smoke (plan §5 M11-C, §5 M13 step 4, §7.3; owner
// O10): MODEL_NODES_LIVE=1 proves the checkpoint_confirmed feed end to end on
// isolated stores. One confirmed-good checkpoint built from the committed
// replay fixture goes through the real `checkpoint_knowledge` handler (real
// node kernel, real ExtractConfirmedCheckpointKnowledge through codex-lb), and
// the librarian consumer lane runs enabled in-process with the real
// librarian-v2 Pi agent through codex-lb until it has claimed, built the
// checkpoint_confirmed context for and applied that task. The production
// `--librarian-consumer` default stays off; this test never changes it.
//
// Nothing real is touched: the orchestrator store and git repo come from
// advisory-repo.ts, the knowledge store is a temp game knowledge root (also
// set as ORCH_GAME_KNOWLEDGE_ROOT so the librarian's tools read it), and the
// kernel database and Pi sessions live in the temp state directory. Never part
// of verify; skipped with a printed reason when codex-lb or the Pi route is
// missing.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { runTraceDoctor } from "@agent-kernel/kernel/doctor";

import { DEFAULT_PI_MODEL, DEFAULT_PI_PROVIDER, DEFAULT_PI_THINKING_LEVEL } from "@server/core/game-registry/runtime-defaults.js";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { getJobByDedupeKey } from "@server/core/job-queue/kernel.js";
import { catchUpKnowledge } from "@server/core/model-node-work/catch-up.js";
import { startModelNodeLanes, type ModelNodeLanes } from "@server/core/model-node-work/index.js";
import { createAdvisoryRepo, type AdvisoryRepo } from "@server/core/validation/qa/__fixtures__/advisory-repo.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";
import { runMeleeKernelPiAgent } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import { loadCodecaineEnv } from "@server/infrastructure/env/codecaine-env";
import { closeDefaultMeleeKernelRuntime, getDefaultMeleeKernelRuntime } from "@server/infrastructure/kernel/bridge/runtime.js";
import {
  closeNodeKernel,
  getNodeKernel,
  type WorkerNodeKernel,
} from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { librarianRunDirectory, runLibrarianConsumer, type LibrarianSummary } from "../librarian/consumer.js";
import { startLibrarianConsumerLane } from "../librarian/lane.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { enableKnowledgeLane, metrics, seedCheckpoint, seedSettledEpoch, writeJson, type FeedFixture } from "./__fixtures__/feed-fixture.js";
import { sha256Hex } from "./confirmed-good.js";
import { CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS, createCheckpointKnowledgeHandler } from "./handler.js";
import type { CheckpointConfirmedPayload } from "./payload.js";

const LIVE = process.env.MODEL_NODES_LIVE === "1";
const CODEX_LB = { hostname: "127.0.0.1", port: 2455 };
/**
 * Diagnostic only: MODEL_NODES_LIVE_CALL_TIMEOUT_MS gives the extraction a
 * per-call timeout other than the extraction's production default
 * (CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS). Unset, the handler runs on the production config.
 */
const CALL_TIMEOUT_OVERRIDE_MS = Number(process.env.MODEL_NODES_LIVE_CALL_TIMEOUT_MS) > 0
  ? Number(process.env.MODEL_NODES_LIVE_CALL_TIMEOUT_MS)
  : null;
const EXTRACTION_WAIT_MS = 2 * (CALL_TIMEOUT_OVERRIDE_MS ?? CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS) + 60_000;
/** Plan M11-C step 4: claimed and finished, or five minutes pass. */
const LIBRARIAN_WAIT_MS = 300_000;
const DB_ENV = ["ORCH_AGENT_KERNEL_DB_PATH", "AGENT_KERNEL_DB_PATH", "ORCH_AGENT_KERNEL_DATABASE_URL", "AGENT_KERNEL_DATABASE_URL"];
const KNOWLEDGE_ROOT_ENV = ["ORCH_GAME_KNOWLEDGE_ROOT", "ORCHESTRATOR_GAME_KNOWLEDGE_ROOT"];

// The committed replay fixture (plan §6.9): the worker's real final note, patch and advisories.
const REPLAY_DIR = resolve(import.meta.dir, "../../../../../../analysis/advisory-adjudication/replay/4a45af8a-attempt-2");
const UNIT = "main/melee/gm/gmtoulib";
const SYMBOL = "fn_8018F00C";
const SOURCE_PATH = "src/melee/gm/gmtoulib.c";
const EPOCH_ID = "epoch-1";
const SUBMISSION_SEQ = 2;

function piAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (!configured) return join(homedir(), ".pi", "agent");
  return configured.startsWith("~/") ? join(homedir(), configured.slice(2)) : configured;
}

/** Credential values the stores must never hold. Read here, never printed. */
function credentialValues(): string[] {
  const values = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.length >= 8 && !/^[A-Z][A-Z0-9_]*$/.test(value)) values.add(value);
  };
  for (const file of ["models.json", "auth.json"]) {
    const path = join(piAgentDir(), file);
    if (!existsSync(path)) continue;
    const visit = (node: unknown, key = ""): void => {
      if (Array.isArray(node)) node.forEach((item) => visit(item, key));
      else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) visit(v, k);
      else if (/api[-_]?key|token|secret|authorization|access|refresh/i.test(key)) add(node);
    };
    visit(JSON.parse(readFileSync(path, "utf8")));
  }
  for (const name of ["TYPESAFE_API_KEY", "CODEX_LB_API_KEY", "OPENAI_API_KEY"]) add(process.env[name]);
  return [...values];
}

async function codexLbReachable(): Promise<boolean> {
  try {
    const socket = await Bun.connect({ ...CODEX_LB, socket: { data() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

/** The Pi route the node kernel and the librarian resolve: a codex-lb provider with a key. Booleans only. */
function piRouteMissing(): string | null {
  const path = join(piAgentDir(), "models.json");
  if (!existsSync(path)) return `no Pi models.json at ${path}`;
  try {
    const provider = (JSON.parse(readFileSync(path, "utf8")) as { providers?: Record<string, { apiKey?: unknown; models?: unknown }> })
      .providers?.["codex-lb"];
    if (!provider) return `Pi models.json has no codex-lb provider`;
    if (typeof provider.apiKey !== "string" || provider.apiKey === "") return "Pi codex-lb provider has no apiKey";
    return null;
  } catch {
    return "Pi models.json is not valid JSON";
  }
}

async function liveSkipReason(): Promise<string | null> {
  if (!LIVE) return "MODEL_NODES_LIVE is not 1";
  if (!(await codexLbReachable())) return `codex-lb is not reachable at ${CODEX_LB.hostname}:${CODEX_LB.port}`;
  return piRouteMissing();
}

const skipReason = await liveSkipReason();
if (skipReason !== null) console.log(`[checkpoint-feed live.smoke] skipped: ${skipReason}`);

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
async function waitFor(condition: () => boolean, timeoutMs: number, what: string, pollMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`${what} not reached within ${timeoutMs} ms`);
    await sleep(pollMs);
  }
}

/** gmtoulib.c before the worker's attempt: fn_8018F00C at its real lines, so the replayed patch applies unchanged. */
function upstreamGmtoulib(): string {
  const head = [
    "#include \"gm/gmtoulib.h\"",
    "",
    "#include \"lb/lblanguage.h\"",
    "",
    "/* Fixture copy: only fn_8018F00C is real; the blank lines keep it at its upstream line numbers. */",
    "char* const lbl_804DA6C4 = NULL;",
    "char* const lbl_804DA6C8 = NULL;",
    "char* const lbl_804DA6CC = NULL;",
    "char* const lbl_804DA6D0 = \"%d\";",
  ];
  const fn = [
    "void fn_8018F00C(char* dest, s32 slot_id)",
    "{",
    "    char* templates_800[2];",
    "    char* templates_900[2];",
    "    char buf[16];",
    "    s32 len;",
    "    char* tmpl_800;",
    "    char* tmpl_900;",
    "",
    "    templates_800[0] = lbl_804DA6C4;",
    "    templates_900[0] = lbl_804DA6CC;",
    "    templates_800[1] = lbl_804DA6C8;",
    "    templates_900[1] = lbl_804DA6D0;",
    "",
    "    tmpl_800 = templates_800[!!lbLang_IsSavedLanguageUS()];",
    "    tmpl_900 = templates_900[!!lbLang_IsSavedLanguageUS()];",
    "    len = sprintf(buf, slot_id < 0x100 ? tmpl_800 : tmpl_900, slot_id);",
    "    strncpy(dest, buf, len);",
    "}",
  ];
  // `char* tmpl_800;` is fn[6]: it lands on line 1866, where the replayed hunk expects it.
  const padding = Array.from({ length: 1866 - 6 - 1 - head.length }, () => "");
  return `${[...head, ...padding, ...fn].join("\n")}\n`;
}

/** A frozen report in real Objdiff shape (string byte counts): the target's unit improved, nothing lower. */
function frozenReport(): Record<string, unknown> {
  return {
    from: { fuzzy_match_percent: 71.4, matched_code: "2861120", matched_code_percent: 70.2 },
    to: { fuzzy_match_percent: 71.4, matched_code: "2861272", matched_code_percent: 70.2 },
    units: [{
      name: UNIT,
      from: metrics(97.1, 11872, 12416),
      to: metrics(98.3, 12024, 12416),
      sections: [
        { name: ".text", from: { fuzzy_match_percent: 97.1, size: "12416" }, to: { fuzzy_match_percent: 98.3, size: "12416" } },
        { name: ".sdata2", from: { fuzzy_match_percent: 100, matched_data: "96", size: "96" }, to: { fuzzy_match_percent: 100, matched_data: "96", size: "96" } },
      ],
      functions: [{ name: SYMBOL, from: { fuzzy_match_percent: 88.12381, size: "152" }, to: { fuzzy_match_percent: 100, size: "152" } }],
    }],
  };
}

/** The knowledge store's view of the worker run: target, translation unit, worker run, and the submission whose runtime_ref is the checkpoint. */
function seedSubmission(knowledge: KnowledgeStore, input: { checkpointId: string; workerStateId: string; runId: string; summary: string }) {
  const targetId = `target:function:${UNIT}:${SYMBOL}`;
  const unitEntityId = `entity:translation_unit:${SOURCE_PATH}`;
  knowledge.db.query(`INSERT OR IGNORE INTO entity (id, kind, locator, parent_entity_id, identity_status, merged_into_id)
    VALUES (?, 'translation_unit', ?, NULL, 'active', NULL)`).run(unitEntityId, SOURCE_PATH);
  knowledge.db.query(`INSERT OR IGNORE INTO target (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
    VALUES (?, 'function', ?, ?, ?, ?, '0x8018F00C', 'current', 'smoke-rev')`).run(targetId, UNIT, unitEntityId, SYMBOL, `${UNIT}:${SYMBOL}`);
  knowledge.db.query(`INSERT OR IGNORE INTO target_status (target_id, match_pct, linked, size, content_hash, report_revision, updated_at)
    VALUES (?, 100, 1, 152, 'sha256:smoke', 'smoke-rev', ?)`).run(targetId, new Date().toISOString());
  const workerRunId = `run:${input.workerStateId}`;
  const submissionId = `${workerRunId}:sub:${SUBMISSION_SEQ}`;
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  knowledge.db.query(`INSERT INTO worker_run (id, target_id, goal, baseline, run_id, worker_state_id, final_outcome, error_type,
      integration, started_at, ended_at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'match', NULL, 'integrated', ?, ?, ?)`).run(
    workerRunId, targetId, `Match ${SYMBOL} in ${SOURCE_PATH}`, JSON.stringify({ match_pct: 88.12381 }),
    input.runId, input.workerStateId, at(40), at(12), at(11),
  );
  knowledge.db.query(`INSERT INTO submission (id, worker_run_id, seq, description, hypothesis, score, submitted_at, runtime_ref)
    VALUES (?, ?, ?, ?, ?, 100, ?, ?)`).run(
    submissionId, workerRunId, SUBMISSION_SEQ, "checkpoint scored 100 (exact)", input.summary, at(13), input.checkpointId,
  );
  return { workerRunId, submissionId };
}

interface LiveFixture {
  repo: AdvisoryRepo;
  feed: FeedFixture;
  checkpointId: string;
  workerStateId: string;
  integratedRev: string;
  savePointCommit: string;
  paths: { note: string; patch: string; runnerSummary: string; report: string };
  submission: { workerRunId: string; submissionId: string };
}

/** One settled epoch with one applied integration of the replay checkpoint, its evidence files, and its ingested submission. */
function seedLiveFixture(repo: AdvisoryRepo): LiveFixture {
  const knowledgeRoot = join(repo.root, "knowledge");
  const globals: GlobalArgs = {
    repoRoot: repo.repoRoot,
    stateDir: repo.stateDir,
    gameId: "melee",
    dryRunAgents: false,
    provider: DEFAULT_PI_PROVIDER,
    model: DEFAULT_PI_MODEL,
    thinkingLevel: DEFAULT_PI_THINKING_LEVEL,
    agentTimeoutSeconds: 240,
  };
  const feed: FeedFixture = {
    root: repo.root,
    stateDir: repo.stateDir,
    repoRoot: repo.repoRoot,
    knowledgeRoot,
    store: repo.store,
    globals,
    openKnowledge: () => openKnowledgeStore({ knowledgeRoot }),
    cleanup: () => repo.close(),
  };

  const replay = JSON.parse(readFileSync(join(REPLAY_DIR, "checkpoint.json"), "utf8")) as {
    id: string; old_score: number; new_score: number; delta: number; agent_note: Record<string, unknown>;
  };
  const findings = JSON.parse(readFileSync(join(REPLAY_DIR, "findings.json"), "utf8")) as QaScanFinding[];

  // The temp repo: upstream file, the worker's patch integrated as one commit, then the epoch's save point commit.
  repo.write(SOURCE_PATH, upstreamGmtoulib());
  repo.commit("upstream gmtoulib");
  repo.git("apply", "--whitespace=nowarn", join(REPLAY_DIR, "qa_diff.patch"));
  const integratedRev = repo.commit(`integrate ${replay.id}`);
  repo.write("build/epoch-save-point.txt", `${EPOCH_ID}\n`);
  const savePointCommit = repo.commit(`${EPOCH_ID} save point`);

  // The evidence files, as the worker and the epoch boundary leave them.
  const attemptDir = join(repo.root, "runs", repo.runId, "worker_state", replay.id);
  const note = join(attemptDir, "worker_final.txt");
  const patch = join(attemptDir, "attempt-2.qa_diff.patch");
  writeJson(attemptDir, "worker_final.txt", readFileSync(join(REPLAY_DIR, "note.txt"), "utf8"));
  copyFileSync(join(REPLAY_DIR, "qa_diff.patch"), patch);
  const { reportChangesPath } = seedSettledEpoch(feed, {
    id: EPOCH_ID,
    runId: repo.runId,
    commitSha: savePointCommit,
    reportChangesPath: writeJson(join(repo.root, "epochs", EPOCH_ID), "report_changes.json", frozenReport()),
  });
  const seeded = seedCheckpoint(feed, {
    id: replay.id,
    epochId: EPOCH_ID,
    runId: repo.runId,
    unit: UNIT,
    symbol: SYMBOL,
    sourcePath: SOURCE_PATH,
    integratedRev,
    exact: true,
    findings,
    metadata: { agent_note: replay.agent_note },
    notePath: note,
    patchPath: patch,
  });
  repo.store.db.query("UPDATE worker_checkpoints SET old_score = ?, new_score = ?, delta = ?, attempt_index = 2 WHERE id = ?")
    .run(replay.old_score, replay.new_score, replay.delta, replay.id);

  const knowledge = feed.openKnowledge();
  let submission: { workerRunId: string; submissionId: string };
  try {
    submission = seedSubmission(knowledge, {
      checkpointId: replay.id,
      workerStateId: seeded.workerStateId,
      runId: repo.runId,
      summary: String(replay.agent_note.summary ?? ""),
    });
  } finally {
    knowledge.close();
  }
  return {
    repo,
    feed,
    checkpointId: replay.id,
    workerStateId: seeded.workerStateId,
    integratedRev,
    savePointCommit,
    paths: { note, patch, runnerSummary: seeded.runnerSummaryPath!, report: reportChangesPath! },
    submission,
  };
}

/** The node kernel with the MODEL_NODES_LIVE_CALL_TIMEOUT_MS per-call timeout, which overrides the handler's own. */
function withCallTimeout(kernel: WorkerNodeKernel | null, timeoutMs: number): WorkerNodeKernel | null {
  if (!kernel) return null;
  const call = ((name, args, options) => kernel.call(name, args, { ...options, timeoutMs })) as WorkerNodeKernel["call"];
  return {
    call,
    decide: kernel.decide.bind(kernel),
    step: kernel.step.bind(kernel),
    gate: kernel.gate.bind(kernel),
  };
}

function recordedOutcome(store: FeedFixture["store"], checkpointId: string): Record<string, unknown> | null {
  const row = store.db.query<{ outcome: string | null }, [string]>(
    "SELECT json_extract(metadata_json, '$.checkpoint_knowledge') AS outcome FROM worker_checkpoints WHERE id = ?",
  ).get(checkpointId);
  return row?.outcome ? JSON.parse(row.outcome) as Record<string, unknown> : null;
}

interface TaskRow {
  id: string;
  pathway: string;
  payload: string;
  started_at: string | null;
  done_at: string | null;
}

function indexTask(feed: FeedFixture, id: string): TaskRow | null {
  const knowledge = feed.openKnowledge();
  try {
    return knowledge.db.query<TaskRow, [string]>("SELECT id, pathway, payload, started_at, done_at FROM index_task WHERE id = ?").get(id);
  } finally {
    knowledge.close();
  }
}

function readJsonLines(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

let repo: AdvisoryRepo | null = null;
let modelLanes: ModelNodeLanes | null = null;
let stopLibrarian: ((options?: { maxWaitMs?: number }) => Promise<void>) | null = null;
const savedEnv = new Map<string, string | undefined>();

beforeAll(() => {
  if (skipReason !== null) return;
  const before = new Set(Object.keys(process.env));
  // TYPESAFE_API_KEY and friends, in-process only; never printed. Keys the file added are removed afterwards.
  loadCodecaineEnv();
  for (const name of Object.keys(process.env)) if (!before.has(name)) savedEnv.set(name, undefined);
  // Isolated stores: the kernel DB follows the temp state dir, the knowledge root is the temp one.
  for (const name of [...DB_ENV, ...KNOWLEDGE_ROOT_ENV]) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  repo = createAdvisoryRepo();
  process.env.ORCH_GAME_KNOWLEDGE_ROOT = join(repo.root, "knowledge");
});

afterAll(async () => {
  if (skipReason !== null) return;
  await modelLanes?.stop({ maxWaitMs: 5_000 }).catch(() => undefined);
  await stopLibrarian?.({ maxWaitMs: 15_000 }).catch(() => undefined);
  await closeNodeKernel();
  await closeDefaultMeleeKernelRuntime();
  repo?.close();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe.skipIf(skipReason !== null)("checkpoint feed live smoke", () => {
  test(
    "confirmed-good checkpoint → real extraction → checkpoint_confirmed index_task → librarian consumer lane claims, builds the context and applies",
    async () => {
      const live = seedLiveFixture(repo!);
      const { feed, checkpointId } = live;
      const taskId = `task:checkpoint_confirmed:${checkpointId}`;
      const locator = `attempt://run/${live.submission.workerRunId}/submission/${SUBMISSION_SEQ}`;

      // The process's kernel runtime, pinned to the temp state dir and temp Pi sessions before anything else opens it.
      const runtime = await getDefaultMeleeKernelRuntime({
        config: { workingDir: feed.repoRoot, piSessionsDir: join(feed.root, "pi-sessions") },
        database: { stateDir: feed.stateDir },
      });
      expect(runtime).not.toBeNull();
      expect(runtime!.databasePath).toBe(join(feed.stateDir, "agent-kernel.sqlite"));

      // 1–2. Catch-up finds the settled epoch; the lane runs the real handler (real node kernel, real git ancestry).
      enableKnowledgeLane(feed.store);
      expect(catchUpKnowledge(feed.store)).toBe(1);
      const handler = createCheckpointKnowledgeHandler(feed.globals, {
        openKnowledgeStore: () => feed.openKnowledge(),
        ...(CALL_TIMEOUT_OVERRIDE_MS === null
          ? {}
          : { nodeKernel: async () => withCallTimeout(await getNodeKernel({ stateDir: feed.stateDir }), CALL_TIMEOUT_OVERRIDE_MS) }),
      });
      console.log(`[checkpoint-feed live.smoke] extraction call timeout: ${CALL_TIMEOUT_OVERRIDE_MS ?? CHECKPOINT_KNOWLEDGE_CALL_TIMEOUT_MS} ms (${CALL_TIMEOUT_OVERRIDE_MS === null ? "production default" : "MODEL_NODES_LIVE_CALL_TIMEOUT_MS override"})`);
      const extractionStarted = Date.now();
      modelLanes = startModelNodeLanes({
        store: feed.store,
        config: { adjudication: false, knowledge: true },
        handlers: { checkpoint_adjudication: null, checkpoint_knowledge: handler },
        lane: { intervalMs: 200 },
        log: (message) => console.log(`[checkpoint-feed live.smoke] ${message}`),
      });
      const job = () => getJobByDedupeKey(feed.store, "checkpoint_knowledge", checkpointId);
      try {
        await waitFor(() => job()?.status === "succeeded" || job()?.status === "failed", EXTRACTION_WAIT_MS, "checkpoint_knowledge job terminal");
      } finally {
        await modelLanes.stop({ maxWaitMs: 5_000 });
        modelLanes = null;
      }
      const extractionMs = Date.now() - extractionStarted;
      const outcome = recordedOutcome(feed.store, checkpointId);
      console.log(`[checkpoint-feed live.smoke] extraction: job ${job()?.status} in ${extractionMs} ms; outcome ${JSON.stringify({
        status: outcome?.status, reason: outcome?.reason, error_kind: outcome?.error_kind, facts: outcome?.facts,
        kept_advisories: outcome?.kept_advisories, advisories: outcome?.advisories, dropped_facts: outcome?.dropped_facts,
      })}`);
      if (typeof outcome?.kernel_run_id === "string") {
        await runtime!.traceWriter.flush();
        const traceDb = new Database(runtime!.databasePath!, { readonly: true });
        try {
          const run = traceDb.query<{ status: string; started_at: string; ended_at: string | null }, [string]>(
            "SELECT status, started_at, ended_at FROM agent_runs WHERE id = ?",
          ).get(outcome.kernel_run_id);
          console.log(`[checkpoint-feed live.smoke] extraction kernel run: ${run?.status}, ${run?.ended_at ? Date.parse(run.ended_at) - Date.parse(run.started_at) : "?"} ms`);
        } finally {
          traceDb.close();
        }
      }
      expect(job()?.error ?? null).toBeNull();
      expect(job()?.status).toBe("succeeded");
      expect(outcome).toMatchObject({ status: "enqueued", task_id: taskId, confirmation: "epoch-settled", advisories: 4 });

      // 3. The index_task row: pathway, payload schema, digests of the exact evidence bytes.
      const task = indexTask(feed, taskId);
      expect(task).not.toBeNull();
      expect(task!.pathway).toBe("checkpoint_confirmed");
      expect(task!.started_at).toBeNull();
      const payload = JSON.parse(task!.payload) as CheckpointConfirmedPayload;
      expect(payload).toMatchObject({
        schema: "checkpoint_confirmed_v1",
        checkpoint_id: checkpointId,
        worker_run_id: live.submission.workerRunId,
        submission_id: live.submission.submissionId,
        submission_seq: SUBMISSION_SEQ,
        epoch_id: EPOCH_ID,
        integration_id: `integration-${checkpointId}`,
        integrated_rev: live.integratedRev,
        save_point_commit: live.savePointCommit,
        confirmation: "epoch-settled",
        target: { key: `${UNIT}::${SYMBOL}`, knowledge_key: `${UNIT}:${SYMBOL}`, unit: UNIT, function: SYMBOL },
      });
      expect(payload.sources).toMatchObject({
        note_sha256: sha256Hex(readFileSync(live.paths.note)),
        patch_sha256: sha256Hex(readFileSync(live.paths.patch)),
        runner_summary_sha256: sha256Hex(readFileSync(live.paths.runnerSummary)),
        report_changes_sha256: sha256Hex(readFileSync(live.paths.report)),
        adjudication_sha256: null,
      });
      expect(payload.facts.length).toBeGreaterThan(0);
      for (const fact of payload.facts) expect(fact.key.startsWith(`${fact.kind}|${UNIT}|${SYMBOL}|`)).toBe(true);
      expect(payload.kept_advisories.every((advisory) => advisory.fingerprint?.startsWith("af2:"))).toBe(true);
      const extractionRunId = payload.extraction.kernel_run_id;
      expect(typeof extractionRunId).toBe("string");

      // 4. The consumer lane, enabled in-process on the temp knowledge store, concurrency 1, the real librarian-v2 agent.
      const contexts: string[] = [];
      const summaries: LibrarianSummary[] = [];
      const librarianRunId = `live-smoke-librarian-${randomUUID()}`;
      const librarianStarted = Date.now();
      stopLibrarian = startLibrarianConsumerLane({
        runId: librarianRunId,
        globals: feed.globals,
        gameId: "melee",
        concurrency: 1,
        intervalMs: 1_000,
        openKnowledgeStore: () => feed.openKnowledge(),
        runConsumer: async (store, options) => {
          const summary = await runLibrarianConsumer(store, {
            ...options,
            runPiAgent: (agentOptions) => {
              contexts.push(agentOptions.prompt.kernelContext?.renderedContext ?? "");
              return runMeleeKernelPiAgent(agentOptions);
            },
          });
          summaries.push(summary);
          return summary;
        },
        log: (message) => console.log(`[checkpoint-feed live.smoke] ${message}`),
      });
      const runLog = join(librarianRunDirectory(feed.stateDir, librarianRunId), "run-log.jsonl");
      try {
        await waitFor(
          () => indexTask(feed, taskId)?.done_at != null || summaries.some((summary) => summary.failedTaskIds.includes(taskId)),
          LIBRARIAN_WAIT_MS,
          "checkpoint_confirmed task done",
          1_000,
        );
      } finally {
        await stopLibrarian({ maxWaitMs: 15_000 });
        stopLibrarian = null;
      }
      const librarianMs = Date.now() - librarianStarted;
      const entries = readJsonLines(runLog).filter((entry) => entry.task_id === taskId);
      console.log(`[checkpoint-feed live.smoke] librarian: ${librarianMs} ms; passes ${JSON.stringify(entries.map((entry) => ({
        status: entry.status, claim: entry.claim, validation_gate: entry.validation_gate, drift_gate: entry.drift_gate,
        counts: (entry.apply_report as { counts?: unknown } | undefined)?.counts, error: entry.error, timings: entry.timings,
      })))}`);

      // Claimed and finished.
      const finished = indexTask(feed, taskId)!;
      expect(finished.started_at).not.toBeNull();
      expect(finished.done_at).not.toBeNull();

      // 5. The context handed to the agent is the checkpoint_confirmed one, citing the submission locator.
      expect(contexts.length).toBeGreaterThan(0);
      expect(contexts[0]).toContain("checkpoint_confirmed");
      expect(contexts[0]).toContain(locator);
      const completed = entries.find((entry) => entry.status === "completed" && entry.claim === "completed");
      expect(completed).toBeDefined();
      const artifact = JSON.parse(readFileSync(String(completed!.artifact_path), "utf8")) as {
        context: { task: { pathway: string }; object: { schema?: string; submission?: { locator?: string } } };
        validation_gate: string;
        apply_report: { counts: { applied: number; rejected: number; skipped: number } };
      };
      expect(artifact.context.task.pathway).toBe("checkpoint_confirmed");
      expect(artifact.context.object.schema).toBe("checkpoint_confirmed_v1");
      expect(artifact.context.object.submission?.locator).toBe(locator);
      // The apply step ran.
      expect(["clean", "retried", "warned"]).toContain(artifact.validation_gate);
      expect(typeof artifact.apply_report.counts.applied).toBe("number");

      // Served models, from the kernel trace.
      await runtime!.traceWriter.flush();
      const traceDb = new Database(runtime!.databasePath!, { readonly: true });
      try {
        const served = traceDb.query<{ agent_name: string; model: string | null; turns: number }, []>(`
          SELECT r.agent_name, json_extract(e.event_data, '$.usage.model') AS model, COUNT(*) AS turns
          FROM trace_events e JOIN agent_runs r ON r.id = e.run_id
          WHERE e.type = 'pi_turn_end'
          GROUP BY r.agent_name, model ORDER BY r.agent_name`).all();
        console.log(`[checkpoint-feed live.smoke] served models: ${JSON.stringify(served)}`);

        expect(traceDb.query("SELECT status FROM agent_runs WHERE id = ?").get(extractionRunId!)).toEqual({ status: "done" });
      } finally {
        traceDb.close();
      }

      // The kernel trace is consistent.
      const doctor = await runTraceDoctor(runtime!.db as Parameters<typeof runTraceDoctor>[0]);
      if (!doctor.ok) console.log(`[checkpoint-feed live.smoke] doctor violations: ${JSON.stringify(doctor.violations.map((violation) => (violation as { code?: unknown }).code ?? "unknown"))}`);
      expect(doctor.ok).toBe(true);

      // No credential value in the kernel DB (or the knowledge store). Boolean assertions only.
      const databasePath = runtime!.databasePath!;
      await closeNodeKernel();
      await closeDefaultMeleeKernelRuntime();
      const secrets = credentialValues();
      const scanned = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].filter(existsSync).map((file) => readFileSync(file));
      const leaked = secrets.filter((secret) => scanned.some((bytes) => bytes.includes(Buffer.from(secret)))).length;
      const knowledgeStore = feed.openKnowledge();
      const knowledgePath = knowledgeStore.path;
      knowledgeStore.close();
      const knowledgeBytes = [knowledgePath, `${knowledgePath}-wal`].filter(existsSync).map((file) => readFileSync(file));
      const leakedKnowledge = secrets.filter((secret) => knowledgeBytes.some((bytes) => bytes.includes(Buffer.from(secret)))).length;
      console.log(`[checkpoint-feed live.smoke] credential scan: ${secrets.length} values, kernel DB hits ${leaked}, knowledge store hits ${leakedKnowledge}`);
      expect(secrets.length).toBeGreaterThan(0);
      expect(leaked).toBe(0);
      expect(leakedKnowledge).toBe(0);
    },
    900_000,
  );
});
