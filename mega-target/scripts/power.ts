/** CLI calls own one uninterrupted sandbox operation; idle sandboxes stay stopped. */
import type { SandboxHandle } from "../../apps/server/src/core/job-queue/sandbox.js";
import { resolve } from "node:path";
import { now, readJson, writeJson } from "./ledger.js";

export async function withAwakeSandbox<T>(handle: SandboxHandle, output: string, run: () => Promise<T>, alreadyStarted = false): Promise<T> {
  const record = (state: string, error?: unknown) => writeJson(resolve(output, "power.json"), {
    sandboxId: handle.sandboxId, state, at: now(), pid: process.pid,
    ...(error === undefined ? {} : { error: String(error) }),
  });
  let failed = false;
  let operationError: unknown;
  try {
    await record(alreadyStarted ? "started" : "starting");
    if (!alreadyStarted) await handle.start();
    await record("started");
    return await run();
  } catch (error) {
    failed = true; operationError = error;
    throw error;
  } finally {
    // A failed start can still leave remote compute running. Always attempt stop.
    let stopError: unknown;
    let stopped = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { await handle.stop(); stopped = true; break; }
      catch (error) { stopError = error; }
    }
    await record(stopped ? "stopped" : "stop_failed", stopped ? undefined : stopError);
    if (!stopped) {
      const message = `Sandbox ${handle.sandboxId} could not stop; retry pause before continuing`;
      throw new AggregateError(failed ? [operationError, stopError] : [stopError], message);
    }
  }
}

/** Watchdog repair after a host CLI is killed before its finally block runs. */
export async function stopAbandonedSandbox(handle: SandboxHandle, output: string, isAlive: (pid: number) => boolean = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
}): Promise<boolean> {
  const path = resolve(output, "power.json");
  let power: { sandboxId: string; state: string; pid: number };
  try { power = await readJson(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  if (power.state === "stopped" || power.sandboxId !== handle.sandboxId || !Number.isInteger(power.pid) || power.pid < 1 || isAlive(power.pid)) return false;
  await handle.stop();
  await writeJson(path, { sandboxId: handle.sandboxId, state: "stopped", at: now(), pid: process.pid, recoveredFromPid: power.pid });
  return true;
}
