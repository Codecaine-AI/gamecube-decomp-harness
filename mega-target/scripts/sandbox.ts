/** Worker-owned Daytona sandboxes, checkpoint artifacts, and independent acceptance validation. */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { DaytonaSandboxProvider, type SandboxHandle, type SandboxProvider } from "../../apps/server/src/core/job-queue/sandbox.js";
import { ensureSandboxToolpack } from "../../apps/server/src/core/job-queue/provisioning.js";
import { resolveGame, sandboxRuntimeOptions } from "../../apps/server/src/core/game-registry/resolver.js";
import { loadLocalEnv } from "../../apps/server/src/infrastructure/env/local.js";
import { sandboxWorkspaceExec } from "../../apps/server/src/infrastructure/shell/workspace-exec.js";
import { captureWorkerChangeBaseline, validateWorkerChange, type WorkerChangeBaseline } from "../../apps/server/src/core/agent-catalog/agents/running/worker/change-validation.js";
import { lintWorkerReviewDiff } from "../../apps/server/src/core/agent-catalog/agents/running/worker/review-lint.js";
import { assertRunning, candidateFile, digest, event, getSession, getWorker, locked, unlockDead, now, readJson, sessionFile, workerDir, workerFile, writeJson, type Candidate, type Evidence, type Session } from "./ledger.js";
import { git } from "./git.js";
import { stopAbandonedSandbox, withAwakeSandbox } from "./power.js";

export const root = resolve(import.meta.dir, "../..");
export function providerFor(s: Session): SandboxProvider {
  const game = resolveGame({ gameId: s.gameId, orchestratorRoot: root });
  loadLocalEnv({ root }); loadLocalEnv({ filenames: [game.localEnvPath] });
  return new DaytonaSandboxProvider();
}
function config(s: Session) { return sandboxRuntimeOptions(resolveGame({ gameId: s.gameId, orchestratorRoot: root }), s.sandboxProfile); }
function remaining(s: Session): number { return Math.max(1000, Date.parse(s.deadline) - Date.now()); }
const labels = (s: Session) => ({ mega_session: s.id, mega_game: s.gameId, workflow: "mega-target" });

/** Each exec is archived on the host; sandbox deletion never deletes this evidence. */
function recording(handle: SandboxHandle, outputDir: string): SandboxHandle {
  return {
    sandboxId: handle.sandboxId,
    stop: () => handle.stop(), start: () => handle.start(),
    readFile: p => handle.readFile(p), writeFile: (p, text) => handle.writeFile(p, text),
    uploadFile: (a, b) => handle.uploadFile(a, b), downloadFile: (a, b) => handle.downloadFile(a, b),
    async exec(argv, options) {
      const at = now();
      const file = resolve(outputDir, "commands", `${at.replace(/[:.]/g, "-")}-${randomUUID()}.json`);
      // Write the start record first, preserving the command even if the process dies mid-exec.
      await writeJson(file, { at, argv, cwd: options.cwd, status: "running" });
      try {
        const result = await handle.exec(argv, options);
        await writeJson(file, { at, endedAt: now(), argv, cwd: options.cwd, ...result });
        return result;
      } catch (error) {
        await writeJson(file, { at, endedAt: now(), argv, cwd: options.cwd, error: String(error) });
        throw error;
      }
    },
  };
}
async function checked(handle: SandboxHandle, s: Session, argv: string[], allowOvertime = false): Promise<string> {
  const result = await handle.exec(argv, { cwd: config(s).workspace_root, timeoutMs: allowOvertime ? 20 * 60_000 : Math.min(20 * 60_000, remaining(s)) });
  if (result.exitCode !== 0) throw new Error(`${argv[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
async function seed(handle: SandboxHandle, s: Session, rev: string, output: string, allowOvertime = false): Promise<void> {
  const cfg = config(s);
  const bundle = resolve(output, "seed.bundle");
  const ref = `refs/mega-target/seeds/${randomUUID()}`;
  await git(s.repo, "update-ref", ref, rev);
  try {
    // A full bundle also works when a PR's history diverges from the baked snapshot.
    await git(s.repo, "bundle", "create", bundle, ref);
    await handle.uploadFile(bundle, "/tmp/mega-seed.bundle");
    await checked(handle, s, ["git", "fetch", "/tmp/mega-seed.bundle", ref], allowOvertime);
    // This sandbox was just created for this attempt. No user checkout is reset.
    await checked(handle, s, ["git", "checkout", "--force", "--detach", rev], allowOvertime);
    // The baked snapshot may retain files renamed/deleted since its own checkout.
    // Preserve those untracked sources outside the compiler include paths before configuring.
    await checked(handle, s, ["python3", "-c", [
      "import pathlib,subprocess,shutil,uuid",
      "root=pathlib.Path.cwd()",
      "dest=pathlib.Path('/tmp')/('mega-snapshot-sources-'+str(uuid.uuid4()))",
      "paths=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z','--','src','include','config']).decode().split('\\0')",
      "for name in filter(None,paths):",
      " p=root/name; target=dest/name",
      " target.parent.mkdir(parents=True,exist_ok=True)",
      " shutil.move(str(p),str(target))",
      "print(str(dest))",
    ].join("\n")], allowOvertime);
  } finally {
    await git(s.repo, "update-ref", "-d", ref);
    await rm(bundle, { force: true });
  }
  await ensureSandboxToolpack(handle, { hostToolpackRoot: resolve(root, "toolpacks/gamecube-decomp"), toolpackId: "gamecube-decomp" });
  await checked(handle, s, ["python3", "configure.py", "--require-protos", "--wrapper", "build/tools/wibo"], allowOvertime);
  const head = (await checked(handle, s, ["git", "rev-parse", "HEAD"], allowOvertime)).trim();
  if (head !== rev) throw new Error("Sandbox did not reach the requested revision");
  // Only tracked dirt matters here; compiler/cache files are expected in the snapshot.
  if ((await checked(handle, s, ["git", "diff", "HEAD", "--name-only"], allowOvertime)).trim()) throw new Error("Provisioning left tracked source changes");
  if ((await checked(handle, s, ["git", "ls-files", "--others", "--exclude-standard", "--", "src", "include", "config"], allowOvertime)).trim())
    throw new Error("Provisioning left untracked source/header/config files");
  await writeJson(resolve(output, "workspace.json"), { sandboxId: handle.sandboxId, root: cfg.workspace_root, baseRev: rev });
}
async function create(s: Session, workerId: string, provider: SandboxProvider, output: string, onCreated: (id: string) => Promise<void>): Promise<SandboxHandle> {
  await mkdir(output, { recursive: true });
  const cfg = config(s);
  const handle = await provider.create({
    snapshot: cfg.snapshot_name, labels: { ...labels(s), mega_worker: workerId },
    resources: { cpu: cfg.resource_class.cpu, memoryGiB: cfg.resource_class.memory_gib, diskGiB: cfg.resource_class.disk_gib },
    ttlMinutes: Math.ceil(remaining(s) / 60_000) + 30,
  });
  try {
    await writeJson(resolve(output, "sandbox.json"), { id: handle.sandboxId });
    await onCreated(handle.sandboxId);
  } catch (error) {
    let failure = error;
    try { await withAwakeSandbox(handle, output, async () => { throw error; }, true); }
    catch (cleanupError) { failure = cleanupError; }
    try { await provider.delete(handle.sandboxId, "provision_failure"); }
    catch (deleteError) {
      await writeJson(resolve(output, "cleanup-error.json"), { sandboxId: handle.sandboxId, error: String(deleteError) });
      throw new AggregateError([failure, deleteError], "Sandbox setup failed and deletion needs retry");
    }
    throw failure;
  }
  return recording(handle, output);
}
async function baseline(handle: SandboxHandle, s: Session, output: string, allowOvertime = false): Promise<WorkerChangeBaseline> {
  const result = await captureWorkerChangeBaseline({
    repoRoot: config(s).workspace_root, outputDir: output, target: { ...s.target },
    captureUndefinedSymbols: true, workspaceExec: sandboxWorkspaceExec(handle, config(s).workspace_root, { defaultTimeoutMs: allowOvertime ? 20 * 60_000 : Math.min(20 * 60_000, remaining(s)) }),
  });
  await writeJson(resolve(output, "baseline.json"), result);
  if (result.status !== "available" || result.snapshot?.targetScore == null) throw new Error(`Baseline unavailable: ${result.reasons.join("; ")}`);
  return result;
}
export async function startSandbox(dir: string, id: string, provider?: SandboxProvider): Promise<unknown> {
  return locked(dir, id, async () => {
    const s = await getSession(dir); assertRunning(s);
    const w = await getWorker(dir, id);
    if (w.status !== "assigned" || w.sandboxId) throw new Error("Attempt already started; close and clean up before assigning a new ID");
    provider ??= providerFor(s);
    const output = workerDir(dir, id);
    const handle = await create(s, id, provider, output, async sandboxId => {
      w.sandboxId = sandboxId; w.status = "running"; w.heartbeat = now();
      await writeJson(workerFile(dir, id), w);
      assertRunning(await getSession(dir));
    });
    try {
      return await withAwakeSandbox(handle, output, async () => {
        await seed(handle, s, w.baseRev, output);
        const b = await baseline(handle, s, output);
        w.baselineScore = b.snapshot!.targetScore!; w.heartbeat = now();
        await writeJson(workerFile(dir, id), w);
        await locked(dir, "session", async () => {
          const current = await getSession(dir);
          if (current.baseRev === w.baseRev && current.baselineScore === undefined) {
            current.baselineScore = w.baselineScore;
            if (current.headRev === w.baseRev && current.status === "running" && w.baselineScore === 100) {
              current.score = 100;
              current.status = "exact";
              await event(dir, "coordinator", "already_exact", { workerId: id, revision: w.baseRev, baselineArtifact: resolve(output, "baseline.json") });
            }
            await writeJson(sessionFile(dir), current);
          }
        });
        await event(dir, id, "sandbox_ready", { sandboxId: handle.sandboxId, score: w.baselineScore });
        return { sandboxId: handle.sandboxId, workspace: config(s).workspace_root, baseline: w.baselineScore, firstDiff: b.firstDiff };
      }, true);
    } catch (error) {
      await event(dir, id, "setup_failed", String(error));
      // Keep the ID in the ledger if deletion fails; cleanup can retry by labels.
      await provider.delete(handle.sandboxId, "provision_failure").then(async () => { w.cleanedAt = now(); await writeJson(workerFile(dir, id), w); }).catch(() => {});
      throw error;
    }
  });
}
async function workerHandle(dir: string, id: string, provider?: SandboxProvider): Promise<{ s: Session; handle: SandboxHandle }> {
  const s = await getSession(dir); assertRunning(s);
  const w = await getWorker(dir, id);
  if (w.status !== "running" || !w.sandboxId || w.cleanedAt) throw new Error("Worker has no running sandbox");
  const handle = await (provider ?? providerFor(s)).get(w.sandboxId);
  if (!handle) throw new Error("Sandbox no longer exists; retain evidence and close this attempt as error");
  w.heartbeat = now(); await writeJson(workerFile(dir, id), w);
  return { s, handle: recording(handle, workerDir(dir, id)) };
}
/** The worker lock covers wake, all remote work, and stop across separate CLI processes. */
export async function withWorkerSandbox<T>(dir: string, id: string, run: (s: Session, handle: SandboxHandle) => Promise<T>, provider?: SandboxProvider): Promise<T> {
  return locked(dir, id, async () => {
    const { s, handle } = await workerHandle(dir, id, provider);
    return withAwakeSandbox(handle, workerDir(dir, id), async () => {
      assertRunning(await getSession(dir));
      return run(s, handle);
    });
  });
}
export async function pauseSandbox(dir: string, id: string, provider?: SandboxProvider): Promise<void> {
  await locked(dir, id, async () => {
    const s = await getSession(dir), w = await getWorker(dir, id);
    if (!w.sandboxId || w.cleanedAt) return;
    const handle = await (provider ?? providerFor(s)).get(w.sandboxId);
    if (!handle) throw new Error("Sandbox no longer exists");
    await handle.stop();
    await writeJson(resolve(workerDir(dir, id), "power.json"), { sandboxId: handle.sandboxId, state: "stopped", at: now(), pid: process.pid });
    await event(dir, id, "sandbox_paused", { sandboxId: handle.sandboxId });
  });
}
export async function execSandbox(dir: string, id: string, argv: string[], provider?: SandboxProvider): Promise<unknown> {
  return withWorkerSandbox(dir, id, async (s, handle) => {
    const result = await handle.exec(argv, { cwd: config(s).workspace_root, timeoutMs: Math.min(60_000, remaining(s)) });
    await event(dir, id, "exec", { argv, exitCode: result.exitCode });
    // The coordinator can share confirmed findings without interrupting a running command.
    const coordinatorNotes = await readFile(resolve(dir, "coordinator-notes.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    return coordinatorNotes.trim() ? { ...result, coordinatorNotes } : result;
  }, provider);
}
export async function uploadSource(dir: string, id: string, localPath: string, provider?: SandboxProvider): Promise<void> {
  await withWorkerSandbox(dir, id, async (s, handle) => {
    await handle.uploadFile(resolve(localPath), `${config(s).workspace_root}/${s.target.source_path}`);
    await event(dir, id, "source_uploaded", { hash: digest(await readFile(localPath, "utf8")) });
  }, provider);
}
async function evaluate(handle: SandboxHandle, s: Session, b: WorkerChangeBaseline, patch: string, output: string, allowOvertime = false): Promise<Evidence> {
  const result = await validateWorkerChange({
    repoRoot: config(s).workspace_root, hostRepoRoot: s.repo, orchestratorRoot: root,
    outputDir: output, attemptIndex: 1, baseline: b, target: { ...s.target }, dryRun: false, shouldRun: true, claimedExact: true,
    postAttemptDiffText: patch, microGateFlags: { sectionParity: true, undefinedSymbols: true, bannedIdioms: true },
    workspaceExec: sandboxWorkspaceExec(handle, config(s).workspace_root, { defaultTimeoutMs: allowOvertime ? 20 * 60_000 : Math.min(20 * 60_000, remaining(s)) }),
  });
  const lint = lintWorkerReviewDiff(patch);
  const evidence: Evidence = {
    before: b.snapshot!.targetScore!, after: result.target?.after ?? null, exact: result.target?.exact === true,
    passed: result.status === "passed" && lint.status === "passed" && result.qaLint?.status !== "tool_unavailable",
    reasons: [...result.reasons, ...lint.reasons, ...(result.qaLint?.status === "tool_unavailable" ? ["QA scanner unavailable"] : [])], artifacts: output,
  };
  await writeJson(resolve(output, "validation.json"), { evidence, runner: result, reviewLint: lint });
  return evidence;
}
export async function submitCandidate(dir: string, id: string, hypothesis: string): Promise<Candidate> {
  return withWorkerSandbox(dir, id, async (s, handle) => {
    const w = await getWorker(dir, id);
    const cid = `candidate-${randomUUID()}`;
    const output = resolve(workerDir(dir, id), "checkpoints", cid);
    await mkdir(output, { recursive: true });
    if ((await checked(handle, s, ["git", "rev-parse", "HEAD"])).trim() !== w.baseRev) throw new Error("Worker changed its base commit; assign a fresh attempt instead");
    // Encode before crossing the sandbox transport, which normalizes NUL bytes.
    const changed = JSON.parse(await checked(handle, s, ["python3", "-c",
      "import json,subprocess; print(json.dumps(subprocess.check_output(['git','diff','HEAD','--name-only','-z']).decode().split('\\0')[:-1]))",
    ])) as string[];
    if (changed.length !== 1 || changed[0] !== s.target.source_path) throw new Error("Submission must change only the target source file");
    if ((await checked(handle, s, ["git", "diff", "--cached", "--name-only"])).trim()) throw new Error("Leave edits unstaged so validation sees the complete change");
    if ((await checked(handle, s, ["git", "ls-files", "--others", "--exclude-standard", "--", "src", "include", "config"])).trim()) throw new Error("Untracked source/header/config files would escape the submitted patch");
    const patch = await checked(handle, s, ["git", "diff", "--binary", "HEAD", "--", s.target.source_path]);
    const patchPath = resolve(output, "candidate.patch");
    await Bun.write(patchPath, patch);
    const b = await readJson<WorkerChangeBaseline>(resolve(workerDir(dir, id), "baseline.json"));
    const evidence = await evaluate(handle, s, b, patch, output);
    const c: Candidate = { id: cid, workerId: id, baseRev: w.baseRev, createdAt: now(), hypothesis: hypothesis || w.hypothesis, patchPath, patchHash: digest(patch), evidence };
    await writeJson(candidateFile(dir, cid), c);
    await event(dir, id, "checkpoint", c);
    return c;
  });
}
/** Verifier is independent of worker sandboxes and starts at the latest accepted branch revision. */
export async function validateForAcceptance(dir: string, s: Session, c: Candidate): Promise<Evidence> {
  const provider = providerFor(s);
  const output = resolve(dir, "verification", `${c.id}-${randomUUID()}`);
  const handle = await create(s, "verifier", provider, output, async () => {});
  try {
    return await withAwakeSandbox(handle, output, async () => {
      await seed(handle, s, s.headRev, output, true);
      const b = await baseline(handle, s, output, true);
      await handle.uploadFile(c.patchPath, "/tmp/mega-candidate.patch");
      await checked(handle, s, ["git", "apply", "--check", "/tmp/mega-candidate.patch"], true);
      await checked(handle, s, ["git", "apply", "/tmp/mega-candidate.patch"], true);
      return await evaluate(handle, s, b, await readFile(c.patchPath, "utf8"), output, true);
    }, true);
  } finally {
    await provider.delete(handle.sandboxId, "settlement").catch(async error => {
      await writeJson(resolve(output, "cleanup-error.json"), { error: String(error), sandboxId: handle.sandboxId });
    });
  }
}
/** Labels recover sandboxes even if creation completed just before the worker could write its ID. */
export async function cleanupSandboxes(dir: string, workerId?: string, provider?: SandboxProvider): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  const s = await getSession(dir); provider ??= providerFor(s);
  const owned = await provider.listByLabels({ ...labels(s), ...(workerId ? { mega_worker: workerId } : {}) });
  const result: { deleted: string[]; failed: Array<{ id: string; error: string }> } = { deleted: [], failed: [] };
  for (const sandbox of owned) {
    try { await provider.delete(sandbox.sandboxId, "settlement"); result.deleted.push(sandbox.sandboxId); }
    catch (error) { result.failed.push({ id: sandbox.sandboxId, error: String(error) }); }
  }
  if (workerId && result.failed.length === 0) {
    const w = await getWorker(dir, workerId); w.cleanedAt = now(); await writeJson(workerFile(dir, workerId), w);
  }
  await writeJson(resolve(dir, workerId ? `cleanup-${workerId}.json` : "cleanup.json"), { at: now(), ...result });
  return result;
}

/** Only dead command owners are paused; live compiles and validation keep running. */
export async function pauseAbandonedSandboxes(dir: string): Promise<void> {
  const s = await getSession(dir);
  for (const group of ["workers", "verification"]) {
    const parent = resolve(dir, group);
    const entries = await readdir(parent, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []; throw error;
    });
    for (const entry of entries.filter(e => e.isDirectory())) {
      const output = resolve(parent, entry.name);
      const power = await readJson<{ sandboxId: string; state: string; pid: number }>(resolve(output, "power.json")).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null; throw error;
      });
      if (!power || power.state === "stopped" || !Number.isInteger(power.pid) || power.pid < 1) continue;
      try { process.kill(power.pid, 0); continue; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      const resource = group === "workers" ? entry.name : "session";
      await unlockDead(dir, resource).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && !String(error).includes("still running")) throw error;
      });
      await locked(dir, resource, async () => {
        const handle = await providerFor(s).get(power.sandboxId);
        if (handle) await stopAbandonedSandbox(handle, output);
      }).catch(error => { if (!String(error).includes("Busy:")) throw error; });
    }
  }
}
