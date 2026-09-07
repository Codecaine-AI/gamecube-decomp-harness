import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { FakeSandboxProvider } from "../../apps/server/src/core/job-queue/sandbox.js";
import { stopAbandonedSandbox, withAwakeSandbox } from "../scripts/power.js";
import { startSandbox, execSandbox, uploadSource, withWorkerSandbox, pauseSandbox } from "../scripts/sandbox.js";
import { now, readJson, sessionFile, workerFile, writeJson, type Session } from "../scripts/ledger.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const dir = await mkdtemp(resolve(tmpdir(), "mega-power-")); roots.push(dir);
  const provider = new FakeSandboxProvider();
  const handle = await provider.create({ snapshot: "test", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 60 });
  const session: Session = { version: 1, id: "power-test", gameId: "melee", repo: dir, worktree: dir, branch: "test",
    target: { unit: "unit", symbol: "Func", source_path: "src/unit.c" }, baseRev: "base", headRev: "base", score: null,
    workers: 16, model: "gpt-5.6-sol", reasoning: "xhigh", createdAt: now(), deadline: new Date(Date.now()+60000).toISOString(), status: "running" };
  await writeJson(sessionFile(dir), session);
  await writeJson(workerFile(dir, "w1"), { id: "w1", baseRev: "base", hypothesis: "test", startedAt: now(), heartbeat: now(), status: "running", sandboxId: handle.sandboxId });
  return { dir, provider, handle, output: resolve(dir, "workers/w1") };
}
test("remote exec wakes a stopped sandbox and stops it before returning, across calls", async () => {
  const f = await fixture(); await f.handle.stop();
  await execSandbox(f.dir, "w1", ["true"], f.provider);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
  await execSandbox(f.dir, "w1", ["true"], f.provider);
  expect(f.provider.startCalls).toHaveLength(2);
  expect(f.provider.operationCalls.slice(-3).map(x => x.operation)).toEqual(["start", "exec", "stop"]);
  expect((await readJson<{state: string}>(resolve(f.output, "power.json"))).state).toBe("stopped");
});
test("upload resumes automatically and preserves the uploaded file while stopped", async () => {
  const f = await fixture(); await f.handle.stop();
  const source = resolve(f.dir, "source.c"); await writeFile(source, "int Func(void) { return 1; }\n");
  await uploadSource(f.dir, "w1", source, f.provider);
  expect(f.provider.operationCalls.slice(-3).map(x => x.operation)).toEqual(["start", "uploadFile", "stop"]);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
});
test("operation failure still stops, and a later command can resume", async () => {
  const f = await fixture(); const failure = new Error("remote failure"); f.provider.scriptExec(failure);
  await expect(execSandbox(f.dir, "w1", ["false"], f.provider)).rejects.toThrow("remote failure");
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
  await execSandbox(f.dir, "w1", ["true"], f.provider);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
});
test("start failure does not execute work and still attempts stop", async () => {
  const f = await fixture(); f.provider.scriptStart(new Error("wake failed"));
  await expect(execSandbox(f.dir, "w1", ["true"], f.provider)).rejects.toThrow("wake failed");
  expect(f.provider.execCalls).toHaveLength(0);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
});
test("failed stop retries, then surfaces a durable failure without reporting success", async () => {
  const f = await fixture(); f.provider.scriptStop(new Error("stop1"), new Error("stop2"));
  await expect(execSandbox(f.dir, "w1", ["true"], f.provider)).rejects.toThrow("could not stop");
  expect((await readJson<{state: string}>(resolve(f.output, "power.json"))).state).toBe("stop_failed");
  await pauseSandbox(f.dir, "w1", f.provider);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
});
test("worker lock covers multi-command validation through stop", async () => {
  const f = await fixture(); let release!: () => void; let entered!: () => void;
  const enteredPromise = new Promise<void>(r => { entered = r; });
  const wait = new Promise<void>(r => { release = r; });
  const run = withWorkerSandbox(f.dir, "w1", async (_s, h) => {
    await h.exec(["compile"], { timeoutMs: 1000 }); entered(); await wait;
    await h.exec(["validate"], { timeoutMs: 1000 });
  }, f.provider);
  await enteredPromise;
  await expect(execSandbox(f.dir, "w1", ["competing"], f.provider)).rejects.toThrow("Busy");
  await expect(pauseSandbox(f.dir, "w1", f.provider)).rejects.toThrow("Busy");
  expect(f.provider.stopCalls).toHaveLength(0);
  release(); await run;
  expect(f.provider.operationCalls.map(x => x.operation)).toEqual(["start", "exec", "exec", "stop"]);
});
test("new sandbox setup stops without an unnecessary start", async () => {
  const f = await fixture();
  await withAwakeSandbox(f.handle, f.output, () => f.handle.exec(["setup"], { timeoutMs: 1000 }), true);
  expect(f.provider.startCalls).toHaveLength(0);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
});
test("deadline expiring during wake stops without executing remote work", async () => {
  const f = await fixture();
  f.provider.scriptStart(async () => {
    const s = await readJson<Session>(sessionFile(f.dir));
    await writeJson(sessionFile(f.dir), { ...s, deadline: "2000-01-01T00:00:00Z" });
  });
  await expect(execSandbox(f.dir, "w1", ["true"], f.provider)).rejects.toThrow("deadline");
  expect(f.provider.execCalls).toHaveLength(0);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
});

test("watchdog pauses dead command owners but leaves live operations alone", async () => {
  const f = await fixture();
  await writeJson(resolve(f.output, "power.json"), { sandboxId: f.handle.sandboxId, state: "started", pid: 123 });
  expect(await stopAbandonedSandbox(f.handle, f.output, () => true)).toBe(false);
  expect(f.provider.stopCalls).toHaveLength(0);
  expect(await stopAbandonedSandbox(f.handle, f.output, () => false)).toBe(true);
  expect(f.provider.sandboxState(f.handle.sandboxId)).toBe("stopped");
  expect(await stopAbandonedSandbox(f.handle, f.output, () => false)).toBe(false);
});

test("post-create deadline failure stops a new sandbox even when deletion fails", async () => {
  const f = await fixture();
  await writeJson(workerFile(f.dir, "w2"), { id: "w2", baseRev: "base", hypothesis: "setup", startedAt: now(), heartbeat: now(), status: "assigned" });
  const create = f.provider.create.bind(f.provider);
  f.provider.create = async params => {
    const handle = await create(params);
    const s = await readJson<Session>(sessionFile(f.dir));
    await writeJson(sessionFile(f.dir), { ...s, deadline: "2000-01-01T00:00:00Z" });
    return handle;
  };
  f.provider.delete = async () => { throw new Error("delete unavailable"); };
  await expect(startSandbox(f.dir, "w2", f.provider)).rejects.toThrow("deletion needs retry");
  const id = f.provider.createdSandboxes.at(-1)!.sandboxId;
  expect(f.provider.sandboxState(id)).toBe("stopped");
  expect((await readJson<{ state: string }>(resolve(f.dir, "workers/w2/power.json"))).state).toBe("stopped");
});
