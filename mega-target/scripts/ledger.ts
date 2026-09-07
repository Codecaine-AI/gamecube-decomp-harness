/** File-backed session ledger. Worker files have independent locks; branch changes use the session lock. */
import { randomUUID, createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

export interface Target { unit: string; symbol: string; source_path: string }
export interface Session {
  version: 1; id: string; gameId: string; repo: string; worktree: string; branch: string;
  target: Target; baseRev: string; headRev: string; score: number | null; baselineScore?: number;
  workers: number; model: "gpt-5.6-sol"; reasoning: "xhigh";
  createdAt: string; deadline: string; status: "running" | "stopped" | "exact";
  sandboxProfile?: string;
  pending?: { candidateId: string; oldRev: string; newRev: string; score: number; exact: boolean };
}
export interface Worker {
  id: string; baseRev: string; hypothesis: string; startedAt: string; heartbeat: string;
  status: "assigned" | "running" | "closed"; agentId?: string; sandboxId?: string;
  baselineScore?: number; endedAt?: string; outcome?: "finished" | "error" | "cancelled";
  summary?: string; cleanedAt?: string;
}
export interface Evidence {
  before: number; after: number | null; exact: boolean; passed: boolean;
  reasons: string[]; artifacts: string;
}
export interface Candidate {
  id: string; workerId: string; baseRev: string; createdAt: string; hypothesis: string;
  patchPath: string; patchHash: string; evidence: Evidence;
  acceptedRev?: string; acceptanceEvidence?: Evidence;
}
export const now = () => new Date().toISOString();
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(id)) throw new Error(`Invalid record ID: ${id}`);
  return id;
}
export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(temp, path);
}
export const sessionFile = (dir: string) => resolve(dir, "session.json");
export const workerDir = (dir: string, id: string) => resolve(dir, "workers", safeId(id));
export const workerFile = (dir: string, id: string) => resolve(workerDir(dir, id), "worker.json");
export const candidateFile = (dir: string, id: string) => resolve(dir, "candidates", `${safeId(id)}.json`);
export const getSession = (dir: string) => readJson<Session>(sessionFile(dir));
export const getWorker = (dir: string, id: string) => readJson<Worker>(workerFile(dir, id));
export async function workers(dir: string): Promise<Worker[]> {
  const entries = await readdir(resolve(dir, "workers"));
  return Promise.all(entries.filter(x => !x.startsWith(".")).map(id => getWorker(dir, id)));
}
export async function candidates(dir: string): Promise<Candidate[]> {
  const files = await readdir(resolve(dir, "candidates"));
  return (await Promise.all(files.filter(x => x.endsWith(".json")).map(x => readJson<Candidate>(resolve(dir, "candidates", x)))))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function assertRunning(session: Session): void {
  if (session.status !== "running") throw new Error(`Session is ${session.status}`);
  if (Date.now() >= Date.parse(session.deadline)) throw new Error("Session deadline reached; close workers and clean up");
}
export async function event(dir: string, actor: string, kind: string, detail: unknown): Promise<void> {
  const path = actor === "coordinator" ? resolve(dir, "events.jsonl") : resolve(workerDir(dir, actor), "events.jsonl");
  await appendFile(path, `${JSON.stringify({ at: now(), actor, kind, detail })}\n`);
}
/** Locks deliberately survive crashes. unlockDead only removes a lock after its owning local process exits. */
export async function locked<T>(dir: string, resource: string, fn: () => Promise<T>): Promise<T> {
  const lock = resolve(dir, `.lock-${safeId(resource)}`);
  await mkdir(lock).catch(() => { throw new Error(`Busy: ${resource}. Use unlock only after its command has exited.`); });
  try {
    await writeJson(resolve(lock, "owner.json"), { pid: process.pid, at: now() });
    return await fn();
  } finally { await rm(lock, { recursive: true }); }
}
export async function unlockDead(dir: string, resource: string): Promise<void> {
  const lock = resolve(dir, `.lock-${safeId(resource)}`);
  const owner = await readJson<{ pid: number }>(resolve(lock, "owner.json"));
  if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error("Invalid lock owner");
  try { process.kill(owner.pid, 0); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    await rm(lock, { recursive: true });
    return;
  }
  throw new Error(`Lock owner ${owner.pid} is still running`);
}
export async function assign(dir: string, id: string, hypothesis: string): Promise<Worker> {
  return locked(dir, "session", async () => {
    const session = await getSession(dir); assertRunning(session);
    if (session.pending) throw new Error("Recover pending integration before assigning workers");
    if (!hypothesis.trim()) throw new Error("A concrete hypothesis is required");
    const existing = await workers(dir);
    if (existing.some(w => w.id === id)) throw new Error("Worker IDs are never reused; choose a new ID");
    if (existing.filter(w => w.status !== "closed" || (w.sandboxId && !w.cleanedAt)).length >= session.workers)
      throw new Error("Worker limit reached; close and clean up an existing worker first");
    const worker: Worker = { id: safeId(id), baseRev: session.headRev, hypothesis, status: "assigned", startedAt: now(), heartbeat: now() };
    await writeJson(workerFile(dir, id), worker);
    await event(dir, "coordinator", "assigned", worker);
    return worker;
  });
}
export async function note(dir: string, id: string, message: string, agentId?: string): Promise<void> {
  await locked(dir, id, async () => {
    const worker = await getWorker(dir, id);
    if (worker.status === "closed") throw new Error("Worker already closed");
    worker.heartbeat = now();
    if (agentId) worker.agentId = agentId;
    await event(dir, id, "note", message);
    await writeJson(workerFile(dir, id), worker);
  });
}
export async function closeWorker(dir: string, id: string, outcome: Worker["outcome"], summary: string): Promise<void> {
  await locked(dir, id, async () => {
    const worker = await getWorker(dir, id);
    if (worker.status === "closed") return;
    if (!summary.trim()) throw new Error("A closing summary is required");
    Object.assign(worker, { status: "closed", endedAt: now(), heartbeat: now(), outcome, summary });
    await event(dir, id, "closed", { outcome, summary });
    await writeJson(workerFile(dir, id), worker);
  });
}
