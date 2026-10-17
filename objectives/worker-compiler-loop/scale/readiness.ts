#!/usr/bin/env bun
/**
 * Readiness-checklist probe on ONE provisioned SMS sandbox (readiness-checklist.md
 * items 1-5 and 8; items 6, 7 and 9 come from load-test.ts).
 *
 * Provisions through the harness's own `provisionSandboxWorkspace` the way a
 * worker claim on an unverified target is provisioned (thin or full bundle, the
 * trusted base as a required revision, the target's full gate report at its
 * `full_report_locator`), runs the checks with `sandbox.exec`, writes
 * readiness.json, and deletes the sandbox (it carries the scale run label, so
 * `load-test.ts --kill <run-id>` also removes it).
 *
 *   bun objectives/worker-compiler-loop/scale/readiness.ts            # dry run against the fake
 *   bun objectives/worker-compiler-loop/scale/readiness.ts --live --confirm-live <run-id> --run-id <run-id>
 *
 * Dry-run output only proves the plumbing: the fake models no image contents,
 * so image checks fail there by design.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileEventSink, errorText } from "./lib/events.js";
import { CostGuard } from "./lib/guard.js";
import { httpFakeClient, instrumentClient, liveSdkClient, type ClientShape } from "./lib/daytona.js";
import { loadOrBuildFixtures, SMS_TRUSTED_BASE } from "./fixtures.js";
import { FakeWorld, serveFakeDaytona } from "./fake-daytona-server.js";
import { HARNESS_ROOT, SCALE_DIR, killSwitch } from "./load-test.js";

interface Check { item: number; name: string; argv: string[]; expect?: (stdout: string) => string | null; timeoutMs?: number }

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const live = argv.includes("--live");
  const runId = arg(argv, "--run-id") ?? `readiness-${Date.now().toString(36)}`;
  if (live && arg(argv, "--confirm-live") === runId && !process.env.DAYTONA_API_KEY) {
    const { loadCodecaineEnv } = await import("@server/infrastructure/env/codecaine-env");
    loadCodecaineEnv();
  }
  if (live && (arg(argv, "--confirm-live") !== runId || !process.env.DAYTONA_API_KEY)) {
    console.error("[readiness] refused: --live needs --confirm-live <run-id> equal to --run-id and DAYTONA_API_KEY");
    return 2;
  }
  if (!live) delete process.env.DAYTONA_API_KEY;
  const smsCheckout = arg(argv, "--sms-checkout") ?? "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/checkout";
  const profileName = arg(argv, "--profile") ?? "1-core";
  const outDir = arg(argv, "--out") ?? resolve(SCALE_DIR, "results", runId);
  const workDir = resolve(tmpdir(), "scale-load-test", runId);
  mkdirSync(workDir, { recursive: true });
  const sink = fileEventSink(workDir, "readiness", { runId });

  const sandboxModule = await import("@server/core/job-queue/sandbox.js");
  const provisioning = await import("@server/core/job-queue/provisioning.js");
  const store = await import("@server/core/orchestrator-state/index.js");
  const resolver = await import("@server/core/game-registry/resolver.js");
  const provenance = await import("@server/core/game-registry/sandbox-provenance.js");
  const report = await import("@server/core/harness-runtime/run-state/unverified-report.js");

  const cacheDir = resolve(tmpdir(), "scale-load-test", "cache");
  const scratch = resolve(cacheDir, "sms-scratch");
  const fixtures = loadOrBuildFixtures({ smsCheckout, scratch, cacheFile: resolve(cacheDir, "fixtures.json"), count: 4, backfillReportPath: resolve(HARNESS_ROOT, "objectives/sms-real-codegen/backfill/backfill-report-runs-v2.json") });
  const target = fixtures.targets.find((t) => t.kind === "unverified_repair")!;
  const plainUnit = fixtures.targets.find((t) => t.kind === "clean_fix")!;
  const game = resolver.resolveGame({ gameId: "sms", orchestratorRoot: HARNESS_ROOT, explicitOverrides: { repoRoot: scratch } as never });
  const profile = provenance.captureSandboxProvenance(game, profileName);
  const guard = new CostGuard({ maxAlive: 2, maxSandboxMinutes: 120, allowBuildSandboxes: false }, sink);

  let base: () => Promise<ClientShape>;
  let stopFake = () => {};
  if (live) {
    base = () => liveSdkClient(process.env.DAYTONA_API_KEY!);
  } else {
    const world = new FakeWorld({ seedRoot: scratch, workspaceRoot: profile.workspace_root, targets: fixtures.targets, timeScale: 0, quota: 10, rateLimitRps: 0, inject429: 0, inject502: 0 });
    const served = serveFakeDaytona(world);
    stopFake = served.stop;
    base = async () => httpFakeClient(`http://127.0.0.1:${served.port}`);
  }
  const client = base().then((value) => instrumentClient(value, { sink, scaleRunId: runId, admission: guard, defaultPurpose: "readiness" }));
  (sandboxModule.DaytonaSandboxProvider.prototype as unknown as { client: () => Promise<unknown> }).client = () => client;
  const provider = new sandboxModule.DaytonaSandboxProvider({ readApiKey: () => "scale" });

  const record = { gameId: "sms", unit: target.unit, symbol: target.symbol, analyzedRev: fixtures.baseRev, baseRev: SMS_TRUSTED_BASE, sourcePath: target.sourcePath, functionSourceSha: null, match: { base: 100, candidate: 100, real_only: target.afterScore }, reasons: ["readiness probe"], report: { provenance: target.provenance }, recordedAt: new Date().toISOString(), clearedAt: null, clearedBy: null, clearedRev: null };
  const reportFile = await report.unverifiedReportSandboxFile(record as never, { hostRepoRoot: scratch });
  const capabilities = JSON.parse(readFileSync(resolve(HARNESS_ROOT, "toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/CAPABILITIES.json"), "utf8")) as { versions: Record<string, { traced_sha1?: string }> };
  const workerImage = JSON.parse(readFileSync(resolve(HARNESS_ROOT, "games/sms/config/worker-image.json"), "utf8")) as { verification_commands: string[][]; traced_compilers: { required: string[]; stock_exclusions: Record<string, string[]> } };
  const objectOf = (sourcePath: string) => `build/GMSJ01/${sourcePath.replace(/\.(c|cpp|cp)$/, ".o")}`;
  const excluded = workerImage.traced_compilers.stock_exclusions["1.2.5"]?.[0] ?? "build/GMSJ01/src/Enemy/chuuhana.o";
  const unusedFunction = "TChuuHana::rolling";
  const checks: Check[] = [
    ...workerImage.traced_compilers.required.map((version) => ({
      item: 1, name: `traced ${version} sha1 equals the committed CAPABILITIES (macOS build)`,
      argv: ["sha1sum", `build/compilers-traced/GC/${version}/mwcceppc.exe`],
      expect: (stdout: string) => (stdout.split(/\s+/)[0] === capabilities.versions[version]?.traced_sha1 ? null : `expected ${capabilities.versions[version]?.traced_sha1}`),
    })),
    { item: 1, name: "image CAPABILITIES.json lists the required versions", argv: ["cat", "build/compilers-traced/CAPABILITIES.json"], expect: (stdout) => workerImage.traced_compilers.required.every((v) => stdout.includes(`"${v}"`)) ? null : "a required version is missing" },
    ...workerImage.verification_commands.map((command) => ({ item: 2, name: `worker-image.json: ${command.join(" ").slice(0, 80)}`, argv: command })),
    { item: 3, name: "validation build of one unit", argv: ["ninja", objectOf(plainUnit.sourcePath)], timeoutMs: 20 * 60_000 },
    { item: 3, name: "SMS.mch has recorded deps", argv: ["ninja", "-t", "deps", "build/GMSJ01/include/SMS.mch"], expect: (stdout) => /#deps [1-9]/.test(stdout) ? null : "no recorded deps" },
    { item: 3, name: "the built unit has recorded deps", argv: ["ninja", "-t", "deps", objectOf(plainUnit.sourcePath)], expect: (stdout) => /#deps [1-9]/.test(stdout) ? null : "no recorded deps" },
    { item: 3, name: "no-op rebuild after the validation build", argv: ["ninja", "-n", objectOf(plainUnit.sourcePath)], expect: (stdout) => stdout.includes("no work to do") ? null : "ninja -n would rebuild" },
    { item: 4, name: "unused_stub_test builds the candidate", argv: ["python3", "/opt/toolpacks/gamecube-decomp/validation/steering_check/api/unused_test.py", "--repo", profile.workspace_root, "--file", "src/Enemy/chuuhana.cpp", "--function", unusedFunction, "--jobs", "1", "--timeout-seconds", "360", "--json"], timeoutMs: 10 * 60_000, expect: (stdout) => /RAD_TO_DEG|redefined/.test(stdout) ? "macro redefinition still breaks the candidate compile" : null },
    { item: 4, name: `stock compile of an excluded unit (${excluded})`, argv: ["ninja", excluded], timeoutMs: 20 * 60_000 },
    { item: 8, name: "full_report_locator is readable", argv: ["test", "-s", reportFile.relativePath] },
    { item: 8, name: "trusted-base source is readable", argv: ["git", "show", `${SMS_TRUSTED_BASE}:${target.sourcePath}`], expect: (stdout) => stdout.length > 0 ? null : "empty" },
  ];

  const results: Array<Record<string, unknown>> = [];
  let sandboxId: string | null = null;
  const stateDir = resolve(workDir, "state");
  const db = store.openState(stateDir);
  try {
    for (const rel of ["build/GMSJ01/report.json", "objdiff.json"]) {
      mkdirSync(resolve(scratch, rel, ".."), { recursive: true });
      copyFileSync(resolve(smsCheckout, rel), resolve(scratch, rel));
    }
    const started = performance.now();
    const provisioned = await provisioning.provisionSandboxWorkspace({
      provider, sourceRepoRoot: scratch, baseRev: fixtures.baseRev, snapshotBakedRev: profile.snapshot_baked_rev, workspaceRoot: profile.workspace_root,
      snapshot: profile.snapshot_name, resources: { cpu: profile.resource_class.cpu, memoryGiB: profile.resource_class.memory_gib, diskGiB: profile.resource_class.disk_gib },
      ttlSeconds: 3600, labels: { game_id: "sms", run_id: runId, claim_id: runId, job_id: runId, job_lease_id: runId, dispatch_lease_id: runId, worker_state_id: runId, trace_id: runId },
      reportArtifactSources: [], requiredRevs: [SMS_TRUSTED_BASE], sandboxFiles: [reportFile],
      event: { store: db, context: { gameId: "sms", correlationId: runId, causationId: runId, traceId: runId, jobId: runId, claimId: runId, workerStateId: runId } as never },
    });
    sandboxId = provisioned.sandboxId;
    results.push({ item: 7, name: "provisioning (seed kind for an unverified target)", ok: true, seed: provisioned.seed ?? null, ms: Math.round(performance.now() - started) });
    const sandbox = (await provider.get(provisioned.sandboxId))!;
    for (const check of checks) {
      const t0 = performance.now();
      try {
        const out = await sandbox.exec(check.argv, { cwd: profile.workspace_root, timeoutMs: check.timeoutMs ?? 120_000 });
        const problem = out.exitCode !== 0 ? `exit ${out.exitCode}` : check.expect?.(out.stdout) ?? null;
        results.push({ item: check.item, name: check.name, ok: problem === null, problem, ms: Math.round(performance.now() - t0), stdout: out.stdout.slice(-1500), stderr: out.stderr.slice(-1500) });
      } catch (error) {
        results.push({ item: check.item, name: check.name, ok: false, problem: errorText(error), ms: Math.round(performance.now() - t0) });
      }
    }
  } finally {
    db.db.close();
    if (sandboxId) await provider.delete(sandboxId, "settlement").catch((error) => console.error(`[readiness] delete failed: ${errorText(error)}`));
    const leftover = await killSwitch(provider, runId, sink);
    stopFake();
    mkdirSync(outDir, { recursive: true });
    const out = { run_id: runId, mode: live ? "live" : "dry-run (fake Daytona models no image contents: provisioning, exec and cleanup plumbing only; check failures are expected)", profile, base_rev: fixtures.baseRev, target: { unit: target.unit, symbol: target.symbol, source_path: target.sourcePath, trusted_base: SMS_TRUSTED_BASE }, results, leftover, manual: { 5: "clang-21 verdict parity: rerun the 137-group comparison of evidence/ir-oracle-clang21.md inside this snapshot (see LIVE-RUNBOOK.md step 4)" } };
    writeFileSync(resolve(outDir, "readiness.json"), `${JSON.stringify(out, null, 2)}\n`);
    const failed = results.filter((r) => !r.ok);
    console.error(`[readiness] ${results.length - failed.length}/${results.length} checks passed; ${resolve(outDir, "readiness.json")}`);
    for (const row of failed) console.error(`[readiness] FAIL item ${row.item}: ${row.name}: ${row.problem}`);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

if (import.meta.main) main().then((code) => process.exit(code), (error) => { console.error(error); process.exit(1); });
