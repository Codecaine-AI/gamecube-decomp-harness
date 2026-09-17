import { afterEach, describe, expect, test, setDefaultTimeout } from "bun:test";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { forceReportRun } from "../report/run.js";
import { runCiParityGate, runPreCommitGate, runPreCommitAutofix } from "../ci-parity/run.js";
import { buildObjectForSource, captureUnitMatchSnapshot } from "../qa/repair-checks.js";
import { runQaScanDiff } from "../qa/scan-diff.js";
import { buildSourceIdentity, executeDaytonaBuild } from "./daytona.js";
import { isGameBuildCommand, remoteBuildsEnabled, runBuildCommand } from "./execution.js";
import { resolveGame } from "@server/core/game-registry/resolver.js";
import type { SandboxHandle, SandboxProvider } from "@server/core/job-queue/sandbox.js";

setDefaultTimeout(30_000);
const roots: string[] = [];
const previousMode = process.env.ORCH_BUILD_EXECUTION;
afterEach(async () => {
  if (previousMode === undefined) delete process.env.ORCH_BUILD_EXECUTION;
  else process.env.ORCH_BUILD_EXECUTION = previousMode;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "remote-build-test-")); roots.push(root);
  const repo = resolve(root, "repo"); await mkdir(repo);
  const git = (args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  git(["init", "-q"]); git(["config", "user.email", "test@example.com"]); git(["config", "user.name", "Build Test"]);
  await writeFile(resolve(repo, ".gitignore"), "build/\nbuild.ninja\nobjdiff.json\n");
  await writeFile(resolve(repo, "source.c"), "original\n");
  git(["add", "."]); git(["commit", "-qm", "fixture"]);
  const source = await buildSourceIdentity(repo);
  const game = { ...resolveGame({ gameId: "sms" }), repoRoot: repo, stateDir: resolve(root, "state") };
  const report = resolve(repo, "build/GMSJ01/report.json");
  await mkdir(resolve(report, ".."), { recursive: true }); await writeFile(report, "accepted");
  let response: Record<string, unknown> = { value: { ok: true }, artifacts: ["/work/sms/build/GMSJ01/report.json", "/tmp/build-task-logs/task.log"] };
  let onRun = async () => {};
  let deleted = 0;
  const uploads = new Map<string, string>();
  const commands: string[][] = [];
  const handle: SandboxHandle = {
    sandboxId: "test-build", stop: async () => {}, start: async () => {},
    exec: async (command) => {
      commands.push(command);
      if (command[0] === "timeout") await onRun();
      return { exitCode: 0, stderr: "", stdout: command.join(" ") === "git write-tree" ? (await buildSourceIdentity(repo)).tree : "" };
    },
    uploadFile: async (local, remote) => { if (remote.endsWith(".bundle")) await copyFile(local, resolve(root, "source.bundle")); uploads.set(remote, await readFile(local, "utf8")); },
    downloadFile: async (remote, local) => { await writeFile(local, remote.endsWith(".log") ? "diagnostic" : "fresh"); },
    readFile: async () => JSON.stringify(response),
    writeFile: async (remote, content) => { uploads.set(remote, content); },
  };
  const provider: SandboxProvider = { create: async params => { expect(params.ephemeral).toBe(true); expect(params.ttlMinutes).toBe(90); return handle; }, get: async () => handle, listByLabels: async () => [], delete: async () => { deleted++; } };
  return { repo, root, source, report, git, uploads, commands, game, provider, get deleted() { return deleted; }, set response(value: Record<string, unknown>) { response = value; }, set onRun(value: () => Promise<void>) { onRun = value; }, run: (kind: "report" | "command" | "autofix" | "format-apply" = "report") => executeDaytonaBuild(repo, { kind, input: {} }, { game, provider, bundleWorker: async path => { await writeFile(path, "// fixture worker"); } }) };
}

describe("Daytona build execution", () => {
  test("remote is default; local is explicit; invalid modes fail", () => {
    delete process.env.ORCH_BUILD_EXECUTION; expect(remoteBuildsEnabled()).toBe(true);
    process.env.ORCH_BUILD_EXECUTION = "local"; expect(remoteBuildsEnabled()).toBe(false);
    process.env.ORCH_BUILD_EXECUTION = "auto"; expect(remoteBuildsEnabled).toThrow("Invalid");
  });
  test("build command detection does not treat Git messages as commands", () => {
    for (const cmd of [["ninja", "report"], ["/bin/sh", "-c", "python3 configure.py && ninja"], ["python3", "configure.py"], ["/x/objdiff-cli", "report"]]) expect(isGameBuildCommand(cmd)).toBe(true);
    expect(isGameBuildCommand(["git", "commit", "-m", "fix ninja and configure.py"])).toBe(false);
    expect(isGameBuildCommand(["git", "diff", "--", "configure.py"])).toBe(false);
  });
  test("unregistered checkout refuses remote execution without running local command", async () => {
    delete process.env.ORCH_BUILD_EXECUTION;
    const f = await fixture(); await expect(runBuildCommand(f.repo, ["ninja"])).rejects.toThrow("No registered");
  });
  test("every host validation entry point requires Daytona by default", async () => {
    delete process.env.ORCH_BUILD_EXECUTION;
    const f = await fixture();
    const calls = [
      () => forceReportRun(f.repo),
      () => runCiParityGate({ worktreeDir: f.repo, sha: f.source.head }),
      () => runPreCommitGate({ worktreeDir: f.repo, cacheDir: f.root }),
      () => runPreCommitAutofix({ worktreeDir: f.repo, cacheDir: f.root }),
      () => buildObjectForSource({ repoRoot: f.repo, sourcePath: "source.c" }),
      () => captureUnitMatchSnapshot({ repoRoot: f.repo, sourcePath: "source.c" }),
      () => runQaScanDiff({ repoRoot: f.repo, orchestratorRoot: f.root, game: { gameId: "sms" } }),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow("No registered");
  });
  test("captures dirty, staged and executable untracked input without changing host index", async () => {
    const f = await fixture();
    await writeFile(resolve(f.repo, "source.c"), "staged\n"); f.git(["add", "source.c"]);
    await writeFile(resolve(f.repo, "source.c"), "dirty\n");
    await writeFile(resolve(f.repo, "script.sh"), "true\n"); await chmod(resolve(f.repo, "script.sh"), 0o755);
    const index = f.git(["write-tree"]);
    const source = await buildSourceIdentity(f.repo); expect(source.tree).not.toBe(index); expect(source.files[0]?.executable).toBe(true);
    await f.run();
    expect(f.git(["write-tree"])).toBe(index);
    expect(f.uploads.get("/work/sms/script.sh")).toBe("true\n");
    expect(f.uploads.get("/tmp/build-input.patch")).toContain("+dirty");
    expect(await readFile(f.report, "utf8")).toBe("fresh"); expect(f.deleted).toBe(1);
  });
  test("failed build retains accepted report and deletes sandbox", async () => {
    const f = await fixture(); f.response = { failure: { message: "compiler failed" }, artifacts: ["/work/sms/build/GMSJ01/report.json", "/tmp/build-task-logs/task.log"] };
    await expect(f.run()).rejects.toThrow("compiler failed"); expect(await readFile(f.report, "utf8")).toBe("accepted"); expect(f.deleted).toBe(1);
  });
  test("source changing during execution cannot publish stale reports", async () => {
    const f = await fixture(); f.onRun = async () => { await writeFile(resolve(f.repo, "source.c"), "concurrent\n"); };
    await expect(f.run()).rejects.toThrow("Checkout changed"); expect(await readFile(f.report, "utf8")).toBe("accepted"); expect(f.deleted).toBe(1);
  });
  test("nonzero command result cannot replace reports", async () => {
    const f = await fixture(); f.response = { value: { exitCode: 1, stdout: "", stderr: "failed" }, artifacts: ["/work/sms/build/GMSJ01/report.json"] };
    expect(await f.run("command")).toMatchObject({ exitCode: 1 }); expect(await readFile(f.report, "utf8")).toBe("accepted");
  });
  test("unexpected source edits are rejected before report publication", async () => {
    const f = await fixture(); f.response = { value: {}, sourcePatch: "changed", artifacts: ["/work/sms/build/GMSJ01/report.json"] };
    await expect(f.run()).rejects.toThrow("changed source"); expect(await readFile(f.report, "utf8")).toBe("accepted");
  });
  test("only explicit autofix applies a verified source diff", async () => {
    const f = await fixture(); await writeFile(resolve(f.repo, "source.c"), "formatted\n"); const patch = f.git(["diff"]); f.git(["checkout", "--", "source.c"]);
    f.response = { value: { changed: true }, sourcePatch: patch + "\n", artifacts: [] };
    await f.run("autofix"); expect(await readFile(resolve(f.repo, "source.c"), "utf8")).toBe("formatted\n");
  });
  test("format-apply returns its diff for the host to apply instead of rejecting the sandbox edit", async () => {
    const f = await fixture(); await writeFile(resolve(f.repo, "source.c"), "formatted\n"); const patch = f.git(["diff"]); f.git(["checkout", "--", "source.c"]);
    f.response = { value: { status: "changed", version: "21.1.8", files: ["source.c"], changedFiles: ["source.c"], diff: patch + "\n", toolError: null }, sourcePatch: patch + "\n", artifacts: [] };
    expect(await f.run("format-apply")).toMatchObject({ status: "changed", version: "21.1.8", changedFiles: ["source.c"] });
    expect(await readFile(resolve(f.repo, "source.c"), "utf8")).toBe("original\n");
    expect(f.deleted).toBe(1);
  });
  test("symbol-check ships the baseline revision in the bundle so a shallow image clone can build it", async () => {
    const f = await fixture();
    const base = f.git(["rev-parse", "HEAD"]);
    await writeFile(resolve(f.repo, "source.c"), "changed\n"); f.git(["commit", "-qam", "head"]);
    f.response = { value: { status: "clean", files: [], units: [], mapPath: "m", validator: { script: "s", revision: null }, baseline: { revision: base, dir: null, source: null }, driverExitCode: 0, toolError: null, output: "" }, artifacts: [] };
    const result = await executeDaytonaBuild(f.repo, { kind: "symbol-check", input: { paths: ["src/a.cpp"], baselineRevision: base, script: "s", map: "m", version: "GMSJ01" } }, { game: f.game, provider: f.provider, bundleWorker: async path => { await writeFile(path, "// fixture worker"); } });
    expect(result).toMatchObject({ status: "clean" });
    const fetches = f.commands.filter(command => command[0] === "git" && command[1] === "fetch");
    expect(fetches).toHaveLength(2);
    expect(fetches[1]![2]).toBe("/tmp/build-source.bundle");
    expect(fetches[1]![3]).toMatch(/^refs\/decomp-orchestrator\/symbol-baseline\/build-[^:]+:refs\/decomp-orchestrator\/symbol-baseline\/build-/);
    const heads = Bun.spawnSync(["git", "bundle", "list-heads", resolve(f.root, "source.bundle")], { cwd: f.repo }).stdout.toString();
    expect(heads).toContain(`${base} refs/decomp-orchestrator/symbol-baseline/`);
    expect(f.git(["for-each-ref", "refs/decomp-orchestrator/"])).toBe("");
    expect(f.deleted).toBe(1);
  });
  test("artifact traversal cannot write outside allowed outputs", async () => {
    const f = await fixture(); f.response = { value: {}, artifacts: ["/work/sms/build/../../../escape/report.json"] };
    await expect(f.run()).rejects.toThrow("Invalid build artifact"); expect(f.deleted).toBe(1);
  });
  test("task worker prepares compilers before building and captures staged plus new tool edits", async () => {
    const f = await fixture();
    const worker = resolve(f.root, "worker.mjs");
    const bundled = await Bun.build({ entrypoints: [resolve(import.meta.dir, "task-worker.ts")], target: "bun", format: "esm" });
    expect(bundled.success).toBe(true);
    await writeFile(worker, new Uint8Array(await bundled.outputs[0]!.arrayBuffer()));
    const bin = resolve(f.root, "bin"); await mkdir(bin);
    await writeFile(resolve(bin, "ninja"), '#!/bin/sh\necho "$@" >> "$BUILD_TEST_CALLS"\n');
    await chmod(resolve(bin, "ninja"), 0o755);
    const requestPath = resolve(f.root, "request.json");
    const resultPath = resolve(f.root, "response.json");
    const request = { repoRoot: f.repo, sourceTree: f.source.tree, gameKind: "doldecomp-sms", reportOptions: {}, logDir: resolve(f.root, "logs"), resultPath, artifactRoots: [], extraArtifacts: [], task: { kind: "command", input: { configureCommand: "true", command: ["ninja", "fixture-target"] } } };
    const run = async () => {
      await writeFile(requestPath, JSON.stringify(request));
      const proc = Bun.spawn([process.execPath, worker, requestPath], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUILD_TEST_CALLS: resolve(f.root, "calls") }, stdout: "pipe", stderr: "pipe" });
      const stderr = await new Response(proc.stderr).text();
      expect(await proc.exited, stderr).toBe(0);
      return JSON.parse(await readFile(resultPath, "utf8"));
    };
    expect((await run()).failure).toBeUndefined();
    expect(await readFile(resolve(f.root, "calls"), "utf8")).toBe("build/compilers\nfixture-target\n");
    request.task = { kind: "command", input: { configureCommand: "true", command: ["sh", "-c", "printf changed > source.c; git add source.c; printf new > new.c"] } };
    const changed = await run();
    expect(changed.sourcePatch).toContain("+changed");
    expect(changed.sourcePatch).toContain("new file mode");
    expect(changed.sourcePatch).toContain("+new");
    f.git(["reset", "-q"]); f.git(["checkout", "--", "source.c"]); await rm(resolve(f.repo, "new.c"), { force: true });
    await writeFile(resolve(bin, "clang-format"), '#!/bin/sh\ncase "$1" in --version) echo "clang-format version 21.1.8"; exit 0;; --dry-run) echo "source.c:1:1: error: code should be clang-formatted [-Wclang-format-violations]" >&2; exit 1;; esac\n');
    await chmod(resolve(bin, "clang-format"), 0o755);
    request.task = { kind: "format-check", input: { paths: ["source.c", "notes.md"] } } as unknown as typeof request.task;
    const formatCheck = await run();
    expect(formatCheck.failure).toBeUndefined();
    expect(formatCheck.value).toMatchObject({ status: "violations", version: "21.1.8", files: ["source.c"], violations: [{ file: "source.c", line: 1 }] });
    expect(formatCheck.sourcePatch).toBe("");

    // symbol-check: the worker builds HEAD objects, builds the baseline in a
    // detached worktree (the fixture is not baked), and runs the checkout's
    // CI driver with NM pointed at the sandbox binutils.
    const objdiff = JSON.stringify({ units: [{ name: "mario/Enemy/x", base_path: "build/GMSJ01/src/Enemy/x.o", metadata: { source_path: "src/Enemy/x.cpp" } }] });
    for (const [path, content] of [["orig/GMSJ01/files/mario.MAP", "map"], ["tools/check-changed-symbol-order.py", "#driver"], ["tools/validate-symbol-order.py", "#validator"], ["build/binutils/powerpc-eabi-nm", "#nm"], ["objdiff.json", objdiff]] as const) {
      await mkdir(resolve(f.repo, path, ".."), { recursive: true }); await writeFile(resolve(f.repo, path), content);
    }
    await writeFile(resolve(f.repo, ".gitignore"), "build/\nbuild.ninja\nobjdiff.json\norig/\n");
    const driverOutput = ["=".repeat(72), "src/Enemy/x.cpp  ->  mario/Enemy/x", "=".repeat(72), "Symbol regressions: 1 new, 0 inherited, 0 resolved.", "[NEW] missing | SMS_isGetShine__FUlUlb", "RESULT: FAIL (new symbol-validation errors)"].join("\n");
    await writeFile(resolve(bin, "python3"), `#!/bin/sh\ncase "$1" in\n  configure.py) printf '%s' '${objdiff}' > objdiff.json; exit 0;;\n  tools/check-changed-symbol-order.py) echo "python3 $* NM=$NM" >> "$BUILD_TEST_CALLS"; cat <<'EOF'\n${driverOutput}\nEOF\nexit 1;;\nesac\nexit 0\n`);
    await chmod(resolve(bin, "python3"), 0o755);
    await rm(resolve(f.root, "calls"), { force: true });
    request.task = { kind: "symbol-check", input: { configureCommand: "true", paths: ["src/Enemy/x.cpp", "include/x.hpp"], baselineRevision: f.source.head, script: "tools/check-changed-symbol-order.py", map: "orig/GMSJ01/files/mario.MAP", version: "GMSJ01" } } as unknown as typeof request.task;
    const symbolCheck = await run();
    Bun.spawnSync(["git", "worktree", "remove", "--force", "/tmp/symbol-baseline-src"], { cwd: f.repo });
    expect(symbolCheck.failure).toBeUndefined();
    expect(symbolCheck.value).toMatchObject({
      status: "regressions", files: ["src/Enemy/x.cpp"], mapPath: "orig/GMSJ01/files/mario.MAP",
      baseline: { revision: f.source.head, dir: "/tmp/symbol-baseline-src", source: "worktree_build" }, driverExitCode: 1,
      units: [{ source: "src/Enemy/x.cpp", unit: "mario/Enemy/x", status: "failed", newErrors: 1, newLines: ["missing | SMS_isGetShine__FUlUlb"] }],
    });
    const calls = await readFile(resolve(f.root, "calls"), "utf8");
    expect(calls).toContain("build/GMSJ01/src/Enemy/x.o\n");
    expect(calls).toContain(`python3 tools/check-changed-symbol-order.py --baseline-dir /tmp/symbol-baseline-src src/Enemy/x.cpp NM=${f.repo}/build/binutils/powerpc-eabi-nm`);

    // Without an explicit configureCommand the worker reconfigures with the image's own configure_args.
    const imageTools = resolve(f.root, "image-tools"); await mkdir(imageTools);
    await writeFile(resolve(imageTools, "worker-image.json"), JSON.stringify({ configure_args: ["--map", "--version", "GMSJ01", "--dtk", "build/tools/dtk", "--objdiff", "build/tools/objdiff-cli"] }));
    await writeFile(resolve(bin, "python3"), '#!/bin/sh\necho "python3 $*" >> "$BUILD_TEST_CALLS"\nexit 0\n');
    await rm(resolve(f.root, "calls"), { force: true });
    request.task = { kind: "command", input: { command: ["ninja", "fixture-target"] } } as unknown as typeof request.task;
    await writeFile(requestPath, JSON.stringify(request));
    const proc = Bun.spawn([process.execPath, worker, requestPath], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUILD_TEST_CALLS: resolve(f.root, "calls"), ORCH_IMAGE_TOOLS_DIR: imageTools }, stdout: "pipe", stderr: "pipe" });
    expect(await proc.exited).toBe(0);
    expect(await readFile(resolve(f.root, "calls"), "utf8")).toContain("python3 configure.py --map --version GMSJ01 --dtk build/tools/dtk --objdiff build/tools/objdiff-cli --wrapper build/tools/wibo\n");
  });

});
