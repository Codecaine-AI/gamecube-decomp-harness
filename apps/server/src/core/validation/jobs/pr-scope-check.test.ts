import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { EditScopeRunner } from "@server/core/validation/edit-scope/edit-scope.js";
import { unitInputsSha256 } from "@server/core/validation/edit-scope/unused-evidence.js";
import { openState } from "@server/core/orchestrator-state";
import { prScopeCheckJob } from "./pr-scope-check.js";

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const BASE = "1".repeat(40);
const HEAD = "2".repeat(40);

function globals(mode: "off" | "shadow" | "enforce" | null): GlobalArgs {
  return {
    repoRoot: "/repo", stateDir: "/state", dryRunAgents: false, provider: "p", model: "m", thinkingLevel: "low", gameId: "sms",
    game: { gameId: "sms", matching: {}, ...(mode ? { ordering: { mode, gatedPaths: ["src/*"] } } : {}) } as never,
  };
}

function args(...argv: string[]): Map<string, string | true> {
  return parse(["pr-scope-check", ...argv]).args;
}

function report(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    identity: { base_rev: BASE, patch_sha256: "p", readiness: {}, head_rev: HEAD },
    verdict: "pass", hunks: [], warnings: ["w1"], limits: {},
    pr_size: { units: 1, files: 2, changed_lines: 10, warnings: ["big"] },
    same_pr_prerequisites: ["TBar"],
    ...overrides,
  });
}

const REJECT = report({ verdict: "reject", hunks: [{ file: "src/a.cpp", line: 1, class: "TFoo", verdict: "order_gated", reason: "" }] });

function fakes(stdout: string, exitCode = 0) {
  const calls: string[][] = [];
  const lines: string[] = [];
  const runner: EditScopeRunner = async (argv) => {
    calls.push(argv);
    return { exitCode, stdout, stderr: exitCode ? "boom" : "" };
  };
  const resolveRev = (_repo: string, ref: string) => (ref === "origin/master" ? BASE : ref === "HEAD" || ref === "feature" ? HEAD : ref);
  return { calls, lines, deps: { runner, resolveRev, log: (line: string) => lines.push(line) } };
}

describe("pr-scope-check job", () => {
  test("prints the summary for the resolved base and head and passes --unused-checks and the policy", async () => {
    const { calls, lines, deps } = fakes(report());
    const output = await prScopeCheckJob(globals("shadow"), args("--base", "origin/master", "--head", "feature", "--unused-checks", "/tmp/u.json"), deps);
    expect(calls[0]).toEqual([
      "pr", "--repo", "/repo", "--base", BASE, "--head", HEAD, "--unused-checks", "/tmp/u.json",
      "--policy-json", JSON.stringify({ gatedPaths: ["src/*"] }), "--json",
    ]);
    const printed = JSON.parse(lines[0]!);
    expect(printed).toMatchObject({
      game_id: "sms", repo: "/repo", mode: "shadow", base: "origin/master", base_rev: BASE, head: HEAD, verdict: "pass",
      rejected_hunks: [], warnings: ["w1", "big", "split suggested: TBar"], pr_size: { units: 1, files: 2, changed_lines: 10 },
      same_pr_prerequisites: ["TBar"],
    });
    expect(output.verdict).toBe("pass");
  });

  test("enforce: a rejected range prints the report, then fails", async () => {
    const { lines, deps } = fakes(REJECT);
    await expect(prScopeCheckJob(globals("enforce"), args("--base", "origin/master"), deps)).rejects.toThrow(/refused origin\/master\.\.\..*TFoo \(order_gated\)/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ verdict: "reject", rejected_hunks: [{ class: "TFoo", verdict: "order_gated" }] });
  });

  test("shadow: a rejected range is reported without failing", async () => {
    const { deps } = fakes(REJECT);
    const output = await prScopeCheckJob(globals("shadow"), args("--base", "origin/master"), deps);
    expect(output.verdict).toBe("reject");
    expect(output.problem).toContain("TFoo");
  });

  test("a checker failure fails in every mode", async () => {
    for (const mode of ["shadow", "enforce"] as const) {
      const { deps } = fakes("", 2);
      await expect(prScopeCheckJob(globals(mode), args("--base", "origin/master"), deps)).rejects.toThrow(/could not run/);
    }
  });

  test("ordering off needs --force (runs as shadow) or an explicit --mode", async () => {
    await expect(prScopeCheckJob(globals("off"), args("--base", "origin/master"), fakes(report()).deps)).rejects.toThrow(/--force/);
    await expect(prScopeCheckJob(globals(null), args("--base", "origin/master"), fakes(report()).deps)).rejects.toThrow(/sms is off/);
    expect((await prScopeCheckJob(globals("off"), args("--base", "origin/master", "--force"), fakes(REJECT).deps)).mode).toBe("shadow");
    await expect(prScopeCheckJob(globals("off"), args("--base", "origin/master", "--mode", "enforce"), fakes(REJECT).deps)).rejects.toThrow(/refused/);
    await expect(prScopeCheckJob(globals("shadow"), args("--base", "origin/master", "--mode", "warn"), fakes(report()).deps)).rejects.toThrow(/--mode must be/);
  });

  test("requires --base", async () => {
    await expect(prScopeCheckJob(globals("shadow"), args(), fakes(report()).deps)).rejects.toThrow(/--base/);
  });

  test("--run collects the run's integrated certificates on base..head, fresh at the head", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-scope-check-run-"));
    tempDirs.push(dir);
    const repo = join(dir, "repo");
    const stateDir = join(dir, "state");
    const run = (...argv: string[]) => {
      const result = Bun.spawnSync(["git", "-C", repo, ...argv], { stdout: "pipe", stderr: "pipe" });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    Bun.spawnSync(["git", "init", "-q", repo]);
    run("config", "user.email", "t@example.invalid");
    run("config", "user.name", "t");
    run("commit", "-q", "--allow-empty", "-m", "base");
    const base = run("rev-parse", "HEAD");
    mkdirSync(join(repo, "src"));
    writeFileSync(join(repo, "src/a.cpp"), "a\n");
    run("add", "src/a.cpp");
    run("commit", "-q", "-m", "a");
    const head = run("rev-parse", "HEAD");
    const store = openState(stateDir);
    const now = new Date().toISOString();
    for (const [id, runId] of [["cp-1", "run-1"], ["cp-2", "run-2"]] as const) {
      const check = { unit: "u", file: "src/a.cpp", function: `F${id}`, status: "inlined", changed: [], unit_inputs: ["src/a.cpp"],
        unit_inputs_sha256: unitInputsSha256([{ path: "src/a.cpp", text: "a\n" }]) };
      store.db.query(`INSERT INTO worker_checkpoints (id, worker_state_id, run_id, epoch_id, epoch_target_id, target_claim_id, attempt_index, validation_time, validation_status, metadata_json)
        VALUES (?, ?, ?, 'e', 't', ?, 1, ?, 'passed', ?)`).run(id, `ws-${id}`, runId, `c-${id}`, now, JSON.stringify({ unused_checks: [check] }));
      store.db.query(`INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id, status, metadata_json, created_at, updated_at)
        VALUES (?, ?, 'e', 't', ?, ?, ?, 'applied', ?, ?, ?)`).run(`io-${id}`, runId, `c-${id}`, `ws-${id}`, id, JSON.stringify({ integrated_rev: head }), now, now);
    }
    store.db.close();
    const { calls, deps } = fakes(report({ identity: { head_rev: head } }));
    const output = await prScopeCheckJob({ ...globals("shadow"), repoRoot: repo, stateDir },
      args("--base", base, "--run", "run-2"), { ...deps, resolveRev: undefined });
    const path = calls[0]![calls[0]!.indexOf("--unused-checks") + 1]!;
    expect(output.unused_checks).toMatchObject({ path, count: 1, stale: [] });
    expect(JSON.parse(readFileSync(path, "utf8")).unused_checks.map((check: { function: string }) => check.function)).toEqual(["Fcp-2"]);
    expect(calls[0]).toContain("--policy-json");
    await expect(prScopeCheckJob({ ...globals("shadow"), repoRoot: repo, stateDir }, args("--base", base, "--run", "run-2", "--unused-checks", "/x.json"), deps))
      .rejects.toThrow(/not both/);
  });

  test("--script runs a host script against a real repository", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pr-scope-check-"));
    tempDirs.push(dir);
    const repo = join(dir, "repo");
    const git = (...argv: string[]) => {
      const result = Bun.spawnSync(["git", "-C", repo, ...argv], { stdout: "pipe", stderr: "pipe" });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    Bun.spawnSync(["git", "init", "-q", repo]);
    git("config", "user.email", "t@example.invalid");
    git("config", "user.name", "t");
    git("commit", "-q", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD");
    git("commit", "-q", "--allow-empty", "-m", "head");
    const head = git("rev-parse", "HEAD");
    const script = join(dir, "stub_edit_scope.py");
    writeFileSync(script, [
      "import json, os, sys",
      "a = sys.argv[1:]",
      "head = a[a.index('--head') + 1]",
      "verdict = 'reject' if os.environ.get('ORCH_ORDERING_MODE') == 'enforce' else 'pass'",
      "hunks = [{'file': 'src/a.cpp', 'line': 1, 'class': 'TFoo', 'verdict': 'not_ready', 'reason': ''}] if verdict == 'reject' else []",
      "print(json.dumps({'identity': {'head_rev': head}, 'verdict': verdict, 'hunks': hunks, 'warnings': [], 'limits': {}}))",
      "",
    ].join("\n"));
    const lines: string[] = [];
    const output = await prScopeCheckJob(globals("shadow"), args("--repo", repo, "--base", base, "--script", script), { log: (line) => lines.push(line) });
    expect(output).toMatchObject({ verdict: "pass", base_rev: base, head });
    await expect(prScopeCheckJob(globals("enforce"), args("--repo", repo, "--base", base, "--script", script), { log: () => {} })).rejects.toThrow(/TFoo/);
    await expect(prScopeCheckJob(globals("shadow"), args("--repo", repo, "--base", base, "--script", join(dir, "missing.py")), { log: () => {} }))
      .rejects.toThrow(/edit_scope\.py not found/);
  });
});
