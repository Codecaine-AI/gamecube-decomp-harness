#!/usr/bin/env bun
/**
 * Build an objdiff report for an arbitrary worktree of a registered game's
 * checkout, in Daytona, through the harness's own build path
 * (executeDaytonaBuild, the same call `report-run` reaches via forceReportRun).
 *
 * Difference from `bun apps/server/src/job-runner.ts report-run`: the job's
 * executeDaytonaBuild resolves the game from the checkout's git common dir and
 * writes build evidence to the LIVE state dir (<game stateDir>/builds/<id>),
 * ignoring --state-dir. Here the game is resolved with the scratch state dir
 * and injected, so evidence lands under --state-dir instead.
 *
 * Usage (from the harness repo root, after `set -a; . config/local.env; set +a`):
 *   bun /tmp/sms-merge/tools/daytona-report.ts --game sms --repo-root <worktree> --state-dir <scratch> [--out <copy-report-to>] [--generate-changes]
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HARNESS = "/Users/Ford/workspace/harnesses/gamecube-decomp-harness/apps/server/src/core";
const { resolveGame } = await import(`${HARNESS}/game-registry/resolver.ts`);
const { remoteBuildsEnabled } = await import(`${HARNESS}/validation/build/execution.ts`);
const { executeDaytonaBuild } = await import(`${HARNESS}/validation/build/daytona.ts`);
const { reportRunOptionsForGame } = await import(`${HARNESS}/validation/report/run.ts`);
const { DaytonaSandboxProvider } = await import(`${HARNESS}/job-queue/sandbox.ts`);

// Workaround (2026-10-11): synchronous session exec over ~60 s now dies with
// "socket hang up" at the Daytona proxy. Run every exec async and poll.
const q = (v: string) => `'${v.replaceAll("'", `'\\''`)}'`;
class AsyncExecProvider {
  inner = new DaytonaSandboxProvider();
  async create(params: unknown) {
    const handle: any = await this.inner.create(params as never);
    const sb = handle.sandbox;
    handle.exec = async (command: string[], opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number }) => {
      const env = Object.entries(opts.env ?? {}).map(([k, v]) => q(`${k}=${v}`));
      const inv = [env.length ? "env" : "", ...env, ...command.map(q)].filter(Boolean).join(" ");
      const cmd = opts.cwd ? `cd ${q(opts.cwd)} && ${inv}` : inv;
      const sid = `orch-aexec-${crypto.randomUUID()}`;
      await sb.process.createSession(sid);
      try {
        const started = await sb.process.executeSessionCommand(sid, { command: cmd, runAsync: true, suppressInputEcho: true });
        const cid = started.cmdId;
        const deadline = Date.now() + opts.timeoutMs;
        for (;;) {
          let c: any;
          try { c = await sb.process.getSessionCommand(sid, cid); } catch (e) { console.error(`[aexec] poll error ${e}`); }
          if (c && typeof c.exitCode === "number") {
            let logs: any = { stdout: "", stderr: "" };
            for (let i = 0; i < 5; i++) { try { logs = await sb.process.getSessionCommandLogs(sid, cid); break; } catch (e) { await Bun.sleep(2000); } }
            return { exitCode: c.exitCode, stdout: logs.stdout ?? "", stderr: logs.stderr ?? "" };
          }
          if (Date.now() > deadline) throw new Error(`async exec timed out: ${cmd.slice(0, 200)}`);
          await Bun.sleep(3000);
        }
      } finally { await sb.process.deleteSession(sid).catch(() => undefined); }
    };
    return handle;
  }
  get(...a: unknown[]) { return (this.inner as any).get(...a); }
  delete(...a: unknown[]) { return (this.inner as any).delete(...a); }
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const gameId = flag("--game") ?? "sms";
const repoRoot = resolve(flag("--repo-root") ?? "");
const stateDir = resolve(flag("--state-dir") ?? "");
const out = flag("--out");
if (!flag("--repo-root") || !flag("--state-dir")) throw new Error("--repo-root and --state-dir are required");
if (!remoteBuildsEnabled()) throw new Error("ORCH_BUILD_EXECUTION must be unset or 'daytona'; refusing a local build");

const live = resolveGame({ gameId });
if (resolve(stateDir) === resolve(live.stateDir)) throw new Error(`Refusing the live state dir ${live.stateDir}`);
const game = resolveGame({ gameId, explicitOverrides: { repoRoot, stateDir }, explicitOverrideBaseDir: process.cwd() });
await mkdir(stateDir, { recursive: true });

// Same guard executeDaytonaBuild applies when it resolves the game itself.
const commonDir = async (cwd: string) => (await Bun.$`git -C ${cwd} rev-parse --path-format=absolute --git-common-dir`.text()).trim();
if ((await commonDir(repoRoot)) !== (await commonDir(live.repoRoot))) throw new Error(`${repoRoot} is not a worktree of ${live.repoRoot}`);

const input = { ...reportRunOptionsForGame(game), resetBaseline: false, generateChanges: process.argv.includes("--generate-changes") };
const startedAt = Date.now();
console.error(`[daytona-report] ${gameId} ${repoRoot} -> evidence ${stateDir}/builds; input ${JSON.stringify(input)}`);
const result = await executeDaytonaBuild(repoRoot, { kind: "report", input }, { game, provider: new AsyncExecProvider() as never });
const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
const summary = { elapsedSeconds, ...result, steps: result.steps?.map((s: { name: string; command: string[]; exitCode: number; durationMs: number }) => ({ name: s.name, command: s.command, exitCode: s.exitCode, durationMs: s.durationMs })) };
await writeFile(resolve(stateDir, "report-run-result.json"), JSON.stringify(summary, null, 2) + "\n");
if (out) await copyFile(result.reportPath, out);
console.log(JSON.stringify(summary, null, 2));
// Daytona SDK handles otherwise keep the process alive ~3.5 minutes after the
// result is written (job-runner exits explicitly for the same reason).
process.exit(0);
