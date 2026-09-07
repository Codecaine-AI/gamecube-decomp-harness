#!/usr/bin/env bun
/** Thin commands used by the Astra skill. Agent spawning remains with the coordinator's native collaboration tools. */
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assign, assertRunning, candidates, closeWorker, event, getSession, getWorker, locked, note, now, sessionFile, unlockDead, workerDir, workers, writeJson } from "./ledger.js";
import { acceptCandidate, fetchPr, git, initSession, inspectPr, recoverIntegration } from "./git.js";
import { cleanupSandboxes, execSandbox, providerFor, root, startSandbox, submitCandidate, uploadSource, validateForAcceptance } from "./sandbox.js";
import { processWorkerKnowledge } from "./knowledge.js";
import { resolveGame } from "../../apps/server/src/core/game-registry/resolver.js";
import { loadV2TargetCard } from "../../apps/server/src/core/knowledge-v2/card.js";
import type { SandboxProvider } from "../../apps/server/src/core/job-queue/sandbox.js";

const HELP = `Mega target workflow. Run from the repository root with bun mega-target/scripts/cli.ts.

init --unit UNIT --symbol SYMBOL [--source src/...c] [--pr URL|NUMBER]
     [--ref REF] [--repo PATH] [--workers 4] [--minutes 60] [--game melee]
     [--session PATH] [--sandbox-profile 2-core] [--no-watch]
inspect-pr --pr URL|NUMBER [--game melee] [--repo PATH]
status --session PATH
prompt --session PATH [--worker ID]
assign --session PATH --worker ID --hypothesis TEXT
note --session PATH --worker ID --message TEXT [--agent-id ID]
start --session PATH --worker ID
exec --session PATH --worker ID -- COMMAND ARG...
upload --session PATH --worker ID --file LOCAL_SOURCE
submit --session PATH --worker ID [--hypothesis TEXT]
accept --session PATH --candidate ID
close --session PATH --worker ID --outcome finished|error|cancelled --summary TEXT
knowledge --session PATH --worker ID
cleanup --session PATH [--worker ID]
finish --session PATH
watch --session PATH
recover --session PATH
unlock --session PATH --resource session|WORKER_ID|knowledge-WORKER_ID

init starts a detached timeout watchdog unless --no-watch is supplied.
finish stops intake, closes attempts, deletes owned sandboxes, then runs knowledge import.
Source patches are limited to the target .c file. Branches and evidence are retained.
No command opens a PR, pushes a game branch, or starts the dashboard.
`;

function argsFor(argv: string[]) {
  const flags = new Map<string, string>(); const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--") { rest.push(...argv.slice(i + 1)); break; }
    if (argv[i] === "--no-watch") { flags.set("no-watch", "true"); continue; }
    if (!argv[i].startsWith("--") || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Expected --name value, got ${argv[i]}`);
    flags.set(argv[i].slice(2), argv[++i]);
  }
  const need = (key: string) => { const value = flags.get(key); if (!value) throw new Error(`Missing --${key}`); return value; };
  return { flags, rest, need };
}
async function status(dir: string) {
  const s = await getSession(dir);
  const attempts = await workers(dir);
  return { session: s, secondsRemaining: Math.max(0, Math.ceil((Date.parse(s.deadline) - Date.now()) / 1000)),
    workers: attempts.map(w => ({ ...w, stale: w.status !== "closed" && Date.now() - Date.parse(w.heartbeat) > 5 * 60_000 })),
    candidates: await candidates(dir) };
}
async function renderPrompt(dir: string, workerId?: string) {
  const s = await getSession(dir), worker = workerId ? await getWorker(dir, workerId) : null;
  const name = workerId ? "worker" : "coordinator";
  const template = await readFile(resolve(root, "mega-target/prompts", `${name}.md`), "utf8");
  const context = { sessionDirectory: resolve(dir), session: s, worker,
    cli: resolve(root, "mega-target/scripts/cli.ts"),
    knowledge: loadV2TargetCard({ gameId: s.gameId, unit: s.target.unit, symbol: s.target.symbol, budget: "full" }) };
  return template.replace("{{CONTEXT_JSON}}", JSON.stringify(context, null, 2));
}
function launchWatch(dir: string): number | undefined {
  const fd = openSync(resolve(dir, "watchdog.log"), "a");
  try {
    const child = spawn(process.execPath, [resolve(import.meta.dir, "cli.ts"), "watch", "--session", dir], {
      cwd: root, detached: true, stdio: ["ignore", fd, fd], env: process.env,
    });
    child.unref(); return child.pid;
  } finally { closeSync(fd); }
}
/** Cleanup always precedes knowledge processing, so model failures cannot strand billable sandboxes. */
export async function finish(dir: string, deps: {
  cleanup?: typeof cleanupSandboxes; knowledge?: typeof processWorkerKnowledge;
} = {}): Promise<unknown> {
  return locked(dir, "finish", async () => {
    await locked(dir, "session", async () => {
      const s = await getSession(dir);
      if (s.pending) throw new Error("Recover the pending integration before finishing");
      if (s.status === "running") s.status = "stopped";
      await writeJson(sessionFile(dir), s);
    });
    const closeErrors: Array<{ worker: string; error: string }> = [];
    for (const w of await workers(dir)) {
      if (w.status === "closed") continue;
      try { await closeWorker(dir, w.id, "cancelled", "Session ended. Recorded checkpoints and command logs remain available."); }
      catch (error) { closeErrors.push({ worker: w.id, error: String(error) }); }
    }
    const cleanup = await (deps.cleanup ?? cleanupSandboxes)(dir);
    const knowledge: unknown[] = [];
    for (const w of await workers(dir)) {
      if (w.status !== "closed") continue;
      try { knowledge.push({ worker: w.id, result: await (deps.knowledge ?? processWorkerKnowledge)(dir, w.id) }); }
      catch (error) { knowledge.push({ worker: w.id, error: String(error) }); }
    }
    const result = { at: now(), closeErrors, cleanup, knowledge };
    await writeJson(resolve(dir, "finish.json"), result);
    return result;
  });
}
export async function watch(dir: string, deps: { provider?: SandboxProvider; finish?: typeof finish } = {}) {
  return locked(dir, "watch", async () => {
    await writeJson(resolve(dir, "watchdog.json"), { pid: process.pid, startedAt: now() });
    while (true) {
      const s = await getSession(dir);
      if (s.status !== "running" || Date.now() >= Date.parse(s.deadline)) break;
      await new Promise(resolveSleep => setTimeout(resolveSleep, Math.min(5000, Date.parse(s.deadline) - Date.now())));
    }
    // Retry boundedly: an in-flight worker command may hold its lock briefly at timeout.
    for (let retry = 0; retry < 12; retry++) {
      try {
        // Resource teardown must not wait for an acceptance/worker lock held by a long remote command.
        // If provisioning races this sweep, its post-create session/deadline check removes the new sandbox.
        await cleanupSandboxes(dir, undefined, deps.provider);
        for (const resource of ["session", ...(await workers(dir)).map(w => w.id)]) {
          await unlockDead(dir, resource).catch(() => {});
        }
        await recoverIntegration(dir);
        const result = await (deps.finish ?? finish)(dir);
        console.log(JSON.stringify(result));
        const remaining = await (deps.provider ?? providerFor(await getSession(dir))).listByLabels({ mega_session: (await getSession(dir)).id, workflow: "mega-target" });
        if (remaining.length === 0 && (await workers(dir)).every(w => w.status === "closed")) return;
      } catch (error) { console.error(String(error)); }
      await new Promise(resolveSleep => setTimeout(resolveSleep, 5000));
    }
    throw new Error("Watchdog cleanup needs attention. Retry finish; inspect watchdog.log and cleanup.json.");
  });
}
export async function main(argv: string[]): Promise<unknown> {
  const [cmd, ...values] = argv;
  if (!cmd || cmd === "help" || cmd === "--help") return HELP;
  const { flags, rest, need } = argsFor(values);
  if (cmd === "inspect-pr" || cmd === "init") {
    const game = resolveGame({ gameId: flags.get("game") ?? "melee", orchestratorRoot: root });
    const repo = resolve(flags.get("repo") ?? game.repoRoot);
    if (cmd === "inspect-pr") return inspectPr(repo, need("pr"));
    const unit = need("unit"), symbol = need("symbol");
    if (flags.has("pr") && flags.has("ref")) throw new Error("Use either --pr or --ref");
    const pr = flags.has("pr") ? await fetchPr(repo, need("pr")) : null;
    try {
      const ref = pr?.ref ?? flags.get("ref") ?? "HEAD";
      let source = flags.get("source");
      if (!source) {
        // objdiff.json is generated and may not exist in the requested Git revision.
        let configText: string;
        try { configText = await git(repo, "show", `${ref}:objdiff.json`); }
        catch { configText = await readFile(resolve(repo, "objdiff.json"), "utf8"); }
        const config = JSON.parse(configText) as { units: Array<{ name: string; metadata?: { source_path?: string } }> };
        source = config.units.find(u => u.name === unit)?.metadata?.source_path;
      }
      if (!source) throw new Error("Cannot resolve source from objdiff.json; supply --source");
      const dir = resolve(flags.get("session") ?? resolve(root, "mega-target/sessions", `${symbol.replace(/[^A-Za-z0-9_-]/g, "_")}-${Date.now()}`));
      await mkdir(resolve(dir, ".."), { recursive: true });
      const s = await initSession({ dir, repo, gameId: game.gameId, target: { unit, symbol, source_path: source },
        ref, workerCount: Number(flags.get("workers") ?? 4), minutes: Number(flags.get("minutes") ?? 60), sandboxProfile: flags.get("sandbox-profile") });
      if (pr) await writeJson(resolve(dir, "pr.json"), pr.pr);
      const watchdogPid = flags.has("no-watch") ? null : launchWatch(dir);
      return { sessionDirectory: dir, session: s, watchdogPid, next: `bun mega-target/scripts/cli.ts prompt --session ${JSON.stringify(dir)}` };
    } finally { if (pr) await git(repo, "update-ref", "-d", pr.ref); }
  }
  const dir = resolve(need("session"));
  switch (cmd) {
    case "status": return status(dir);
    case "prompt": return renderPrompt(dir, flags.get("worker"));
    case "assign": return assign(dir, need("worker"), need("hypothesis"));
    case "note": return note(dir, need("worker"), need("message"), flags.get("agent-id"));
    case "start": return startSandbox(dir, need("worker"));
    case "exec": if (!rest.length) throw new Error("Supply a command after --"); return execSandbox(dir, need("worker"), rest);
    case "upload": return uploadSource(dir, need("worker"), need("file"));
    case "submit": return submitCandidate(dir, need("worker"), flags.get("hypothesis") ?? "");
    case "accept": return acceptCandidate(dir, need("candidate"), (s, c) => validateForAcceptance(dir, s, c));
    case "close": {
      const outcome = need("outcome");
      if (outcome !== "finished" && outcome !== "error" && outcome !== "cancelled") throw new Error("Invalid outcome");
      return closeWorker(dir, need("worker"), outcome, need("summary"));
    }
    case "knowledge": return processWorkerKnowledge(dir, need("worker"));
    case "cleanup": {
      const s = await getSession(dir);
      if (!flags.has("worker") && s.status === "running") throw new Error("Use finish to stop intake before cleaning the whole session");
      if (flags.has("worker") && (await getWorker(dir, need("worker"))).status !== "closed") throw new Error("Close the worker before cleanup");
      return cleanupSandboxes(dir, flags.get("worker"));
    }
    case "finish": return finish(dir);
    case "watch": return watch(dir);
    case "recover": return recoverIntegration(dir);
    case "unlock": return unlockDead(dir, need("resource"));
    default: throw new Error(`Unknown command: ${cmd}\n${HELP}`);
  }
}
if (import.meta.main) {
  try {
    const result = await main(Bun.argv.slice(2));
    console.log(typeof result === "string" ? result : JSON.stringify(result ?? { ok: true }, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
