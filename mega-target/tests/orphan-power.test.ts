import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { FakeSandboxProvider, type SandboxHandle } from "../../apps/server/src/core/job-queue/sandbox.js";
import { pauseAbandonedSandboxes } from "../scripts/sandbox.js";
import { locked, now, readJson, sessionFile, workerFile, writeJson, type Session } from "../scripts/ledger.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const dir = await mkdtemp(resolve(tmpdir(), "mega-orphan-power-"));
  roots.push(dir);
  const provider = new FakeSandboxProvider();
  const session: Session = {
    version: 1,
    id: "orphan-power-test",
    gameId: "melee",
    repo: dir,
    worktree: dir,
    branch: "test",
    target: { unit: "unit", symbol: "Func", source_path: "src/unit.c" },
    baseRev: "base",
    headRev: "base",
    score: null,
    workers: 16,
    model: "gpt-5.6-sol",
    reasoning: "xhigh",
    createdAt: now(),
    deadline: new Date(Date.now() + 60_000).toISOString(),
    status: "running",
  };
  await writeJson(sessionFile(dir), session);
  await writeJson(workerFile(dir, "w1"), {
    id: "w1",
    baseRev: "base",
    hypothesis: "test",
    startedAt: now(),
    heartbeat: now(),
    status: "running",
  });
  const createOwned = (owner: string): Promise<SandboxHandle> => provider.create({
    snapshot: "test",
    labels: { mega_session: session.id, mega_game: session.gameId, workflow: "mega-target", mega_worker: owner },
    resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
    ttlMinutes: 60,
  });
  return { dir, provider, createOwned };
}

test("label inventory stops an unrecorded worker sandbox once", async () => {
  const f = await fixture();
  const handle = await f.createOwned("w1");

  await pauseAbandonedSandboxes(f.dir, f.provider);
  expect(f.provider.sandboxState(handle.sandboxId)).toBe("stopped");
  expect(f.provider.stopCalls).toHaveLength(1);

  await pauseAbandonedSandboxes(f.dir, f.provider);
  expect(f.provider.stopCalls).toHaveLength(1);
  const recovery = resolve(f.dir, "power-recovery", (await readdir(resolve(f.dir, "power-recovery")))[0]);
  expect((await readJson<{ sandboxId: string; state: string }>(resolve(recovery, "power.json")))).toEqual(expect.objectContaining({
    sandboxId: handle.sandboxId,
    state: "stopped",
  }));
});

test("label inventory leaves worker and verifier sandboxes alone while their owners hold locks", async () => {
  const f = await fixture();
  const worker = await f.createOwned("w1");
  const verifier = await f.createOwned("verifier");

  await locked(f.dir, "w1", async () => {
    await locked(f.dir, "session", async () => {
      await pauseAbandonedSandboxes(f.dir, f.provider);
    });
  });
  expect(f.provider.sandboxState(worker.sandboxId)).toBe("started");
  expect(f.provider.sandboxState(verifier.sandboxId)).toBe("started");

  await pauseAbandonedSandboxes(f.dir, f.provider);
  expect(f.provider.sandboxState(worker.sandboxId)).toBe("stopped");
  expect(f.provider.sandboxState(verifier.sandboxId)).toBe("stopped");
});

test("label recovery rechecks power records after acquiring the owner lock", async () => {
  const f = await fixture();
  const handle = await f.createOwned("w1");
  const list = f.provider.listByLabels.bind(f.provider);
  f.provider.listByLabels = async labels => {
    const result = await list(labels);
    await writeJson(resolve(f.dir, "workers/w1/power.json"), {
      sandboxId: handle.sandboxId,
      state: "started",
      pid: process.pid,
    });
    return result;
  };

  await pauseAbandonedSandboxes(f.dir, f.provider);
  expect(f.provider.sandboxState(handle.sandboxId)).toBe("started");
  expect(f.provider.stopCalls).toHaveLength(0);
});

test("watchdog retries its own failed orphan stop on the next sweep", async () => {
  const f = await fixture(); const handle = await f.createOwned("w1");
  f.provider.scriptStop(new Error("stop failed"), new Error("stop failed again"));
  await expect(pauseAbandonedSandboxes(f.dir, f.provider)).rejects.toThrow("could not stop");
  expect(f.provider.sandboxState(handle.sandboxId)).toBe("started");
  await pauseAbandonedSandboxes(f.dir, f.provider);
  expect(f.provider.sandboxState(handle.sandboxId)).toBe("stopped");
});
