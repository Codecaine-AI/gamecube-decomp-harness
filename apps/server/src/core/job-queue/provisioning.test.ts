import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { listGameEvents } from "@server/core/harness-state/events.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  ensureSandboxCompilerSourceLink,
  ensureSandboxQaAssets,
  ensureSandboxToolData,
  ensureSandboxToolpack,
  provisionSandboxWorkspace,
  SANDBOX_QA_ROOT,
  SANDBOX_QA_STAMP_PATH,
  SANDBOX_TOOLPACK_TAR_TTL_ENV,
  sandboxQaAssetsStamp,
  sharedQaAssetTarCount,
  sharedToolpackTarCount,
  type ProvisionCommandResult,
  type ProvisionCommandRunner,
  type SandboxProvisionLabels,
  uploadSeedBundle,
} from "./provisioning.js";
import { FakeSandboxProvider } from "./sandbox.js";

const roots: string[] = [];

/** The one sandbox exec that lists which wanted revisions the image already holds (followed by the revisions). */
const SEED_PROBE = ["sh", "-c", 'for r; do git cat-file -e "$r^{commit}" 2>/dev/null && echo "$r"; done; exit 0', "--"];

/** `git -c pack.threads=1 bundle create <path> ...` */
const isBundleCreate = (command: string[]) => command[0] === "git" && command.includes("bundle") && command.includes("create");
const stores: StateStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) store.db.close();
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const sandboxLabels: SandboxProvisionLabels = {
  game_id: "melee",
  run_id: "run-1",
  claim_id: "claim-1",
  job_id: "job-1",
  job_lease_id: "job-lease-1",
  dispatch_lease_id: "dispatch-lease-1",
  worker_state_id: "worker-state-1",
  trace_id: "trace-worker-1",
};

async function sandboxFixture(prefix: string) {
  const root = await mkdtemp(resolve(tmpdir(), prefix));
  roots.push(root);
  const stateDir = resolve(root, "state");
  const store = openState(stateDir);
  stores.push(store);
  const sourceRepoRoot = resolve(root, "source");
  await mkdir(sourceRepoRoot, { recursive: true });
  return { root, store, sourceRepoRoot };
}

function sandboxEvent(store: StateStore) {
  return {
    store,
    context: {
      gameId: "melee",
      correlationId: "job-1",
      causationId: "job-claimed-1",
      traceId: "trace-worker-1",
      jobId: "job-1",
      claimId: "claim-1",
      workerStateId: "worker-state-1",
    },
  };
}

/** Runs `mutate` on the host while the sandbox's remote stamp is being read (the probe), then answers the probe. */
function mutateDuringProbe<T extends { readFile(path: string): Promise<string> }>(sandbox: T, stampPath: string, mutate: () => Promise<void>): T {
  const original = sandbox.readFile.bind(sandbox);
  let pending = true;
  sandbox.readFile = async (path: string) => {
    if (pending && path === stampPath) {
      pending = false;
      await mutate();
    }
    return original(path);
  };
  return sandbox;
}

describe("provisionSandboxWorkspace", () => {
  test("creates, seeds, verifies, and emits with the complete provisioning contract", async () => {
    const { root, store, sourceRepoRoot } = await sandboxFixture("provision-sandbox-");
    const provider = new FakeSandboxProvider();
    const reportArtifactSources = await Promise.all([
      "build/GALE01/report.json",
      "build/GALE01/report_changes.json",
      "build/GALE01/baseline.json",
    ].map(async (relativePath) => {
      const sourcePath = resolve(root, "reports", relativePath.split("/").at(-1)!);
      await mkdir(resolve(root, "reports"), { recursive: true });
      await writeFile(sourcePath, relativePath);
      return { relativePath, sourcePath };
    }));
    const hostCalls: Array<{ cwd: string; command: string[]; timeoutMs?: number }> = [];
    const commandRunner: ProvisionCommandRunner = async (cwd, command, options) => {
      hostCalls.push({ cwd, command, timeoutMs: options?.timeoutMs });
      if (isBundleCreate(command)) await writeFile(command[command.indexOf("create") + 1]!, "bundle");
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const result = await provisionSandboxWorkspace({
      provider,
      sourceRepoRoot,
      baseRev: "base-rev",
      snapshotBakedRev: "baked-rev",
      workspaceRoot: "/opt/melee",
      snapshot: "melee-worker-v1",
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlSeconds: 61,
      labels: sandboxLabels,
      reportArtifactSources,
      event: sandboxEvent(store),
      commandRunner,
    });

    expect(result).toEqual({ sandboxId: "sandbox-1", workspaceRoot: "/opt/melee", seed: { kind: "thin", requiredRevs: [] } });
    expect(provider.createdSandboxes[0]?.params).toEqual({
      snapshot: "melee-worker-v1",
      labels: sandboxLabels,
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlMinutes: 32,
    });
    expect(hostCalls).toHaveLength(4);
    expect(hostCalls.every((call) => call.cwd === sourceRepoRoot && call.timeoutMs === 1_200_000)).toBeTrue();
    expect(hostCalls[0]?.command).toEqual(["git", "merge-base", "--is-ancestor", "baked-rev", "base-rev"]);
    const bundleRef = hostCalls[1]?.command[2];
    expect(bundleRef).toStartWith("refs/decomp-orchestrator/sandbox-seeds/");
    expect(hostCalls[1]?.command).toEqual(["git", "update-ref", bundleRef!, "base-rev"]);
    expect(hostCalls[2]?.command).toEqual(["git", "-c", "pack.threads=1", "bundle", "create", expect.any(String), bundleRef!, "^baked-rev"]);
    expect(hostCalls[3]?.command).toEqual(["git", "update-ref", "-d", bundleRef!]);
    expect(provider.execCalls.slice(0, 5).map(({ command, opts }) => ({ command, opts }))).toEqual([
      { command: [...SEED_PROBE, "base-rev"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      { command: ["git", "bundle", "verify", "/tmp/melee-claim-seed.bundle"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      { command: ["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      { command: ["git", "checkout", "--force", "--detach", "base-rev"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      {
        command: ["bash", "-lc", expect.stringContaining("ln -sfn"), "--", "/opt/mwcc", "/opt/mwcc"],
        opts: { timeoutMs: 180_000, env: undefined },
      },
    ]);
    expect(provider.execCalls.at(-1)).toEqual({
      sandboxId: "sandbox-1",
      command: ["/bin/sh", "-c", "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk"],
      opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined },
    });
    expect(provider.uploadCalls.map(({ remotePath }) => remotePath)).toEqual([
      "/tmp/melee-claim-seed.bundle",
      "/tmp/toolpack-gamecube-decomp.tar",
      "/tmp/qa-assets-melee.tar",
      "/opt/melee/build/GALE01/report.json",
      "/opt/melee/build/GALE01/report_changes.json",
      "/opt/melee/build/GALE01/baseline.json",
    ]);
    expect(listGameEvents(store.db).map((event) => ({ eventType: event.eventType, payload: event.payload }))).toEqual([{
      eventType: "sandbox.created",
      payload: {
        sandbox_id: "sandbox-1",
        snapshot: "melee-worker-v1",
        cpu: 2,
        memory_gib: 4,
        disk_gib: 5,
        job_id: "job-1",
        claim_id: "claim-1",
        worker_state_id: "worker-state-1",
      },
    }]);
  });

  test("skips an empty bundle range and verifies the baked revision exists", async () => {
    const { store, sourceRepoRoot } = await sandboxFixture("provision-sandbox-equal-");
    const provider = new FakeSandboxProvider();
    let hostCalled = false;

    await provisionSandboxWorkspace({
      provider,
      sourceRepoRoot,
      baseRev: "same-rev",
      snapshotBakedRev: "same-rev",
      workspaceRoot: "/workspace/game",
      snapshot: "snapshot",
      resources: { cpu: 4, memoryGiB: 8, diskGiB: 10 },
      ttlSeconds: 60,
      labels: sandboxLabels,
      reportArtifactSources: [],
      event: sandboxEvent(store),
      commandRunner: async () => { hostCalled = true; return { exitCode: 0, stdout: "", stderr: "" }; },
    });

    expect(hostCalled).toBe(false);
    expect(provider.uploadCalls.map((call) => call.remotePath)).toEqual(["/tmp/toolpack-gamecube-decomp.tar", "/tmp/qa-assets-melee.tar"]);
    expect(provider.execCalls.slice(0, 2).map((call) => call.command)).toEqual([
      ["git", "rev-parse", "--verify", "same-rev^{commit}"],
      ["git", "checkout", "--force", "--detach", "same-rev"],
    ]);
    expect(provider.execCalls.at(-1)?.command).toEqual([
      "/bin/sh", "-c", "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk",
    ]);
    expect(provider.createdSandboxes[0]?.params.ttlMinutes).toBe(31);
  });

  test("deletes a partially provisioned sandbox and rethrows the original failure", async () => {
    const { store, sourceRepoRoot } = await sandboxFixture("provision-sandbox-failure-");
    const provider = new FakeSandboxProvider().scriptExec(new Error("remote verify failed"));

    await expect(provisionSandboxWorkspace({
      provider,
      sourceRepoRoot,
      baseRev: "same-rev",
      snapshotBakedRev: "same-rev",
      workspaceRoot: "/opt/melee",
      snapshot: "snapshot",
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlSeconds: 300,
      labels: sandboxLabels,
      reportArtifactSources: [],
      event: sandboxEvent(store),
    })).rejects.toThrow("remote verify failed");

    expect(provider.deletedSandboxes).toHaveLength(1);
    expect(provider.deletedSandboxes[0]).toMatchObject({ sandboxId: "sandbox-1", reason: "provision_failure" });
    expect(listGameEvents(store.db).map((event) => event.eventType)).toEqual([
      "sandbox.created",
      "sandbox.deleted",
    ]);
    expect(listGameEvents(store.db)[1]?.payload).toMatchObject({
      sandbox_id: "sandbox-1",
      reason: "provision_failure",
      job_id: "job-1",
      claim_id: "claim-1",
    });
  });
});

/** Host git double: `merge-base --is-ancestor` and `rev-parse` answers come from the given maps. */
function gitRunner(options: { ancestors?: Record<string, number>; hostRevs?: Record<string, number> } = {}) {
  const calls: string[][] = [];
  const runner: ProvisionCommandRunner = async (_cwd, command): Promise<ProvisionCommandResult> => {
    calls.push([...command]);
    if (isBundleCreate(command)) await writeFile(command[command.indexOf("create") + 1]!, "bundle");
    if (command[1] === "merge-base") return { exitCode: options.ancestors?.[`${command[3]}..${command[4]}`] ?? 0, stdout: "", stderr: "" };
    if (command[1] === "rev-parse") return { exitCode: options.hostRevs?.[command.at(-1)!.replace("^{commit}", "")] ?? 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  return { calls, runner };
}

async function provision(
  provider: FakeSandboxProvider,
  runner: ProvisionCommandRunner,
  overrides: Partial<Parameters<typeof provisionSandboxWorkspace>[0]> = {},
) {
  const { store, sourceRepoRoot } = await sandboxFixture("provision-seed-");
  return provisionSandboxWorkspace({
    provider,
    sourceRepoRoot,
    baseRev: "base-rev",
    snapshotBakedRev: "baked-rev",
    workspaceRoot: "/workspace/sms/checkout",
    snapshot: "snapshot",
    resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
    ttlSeconds: 60,
    labels: sandboxLabels,
    reportArtifactSources: [],
    event: sandboxEvent(store),
    commandRunner: runner,
    ...overrides,
  });
}

const bundleCreates = (calls: string[][]) => calls.filter(isBundleCreate);
const sandboxCommands = (provider: FakeSandboxProvider) => provider.execCalls.map((call) => call.command);

describe("sandbox seed bundle", () => {
  test.each([
    ["not an ancestor", 1],
    ["missing on the host", 128],
  ])("falls back to a full bundle when the baked revision is %s", async (_label, exitCode) => {
    const provider = new FakeSandboxProvider();
    const { calls, runner } = gitRunner({ ancestors: { "baked-rev..base-rev": exitCode } });
    const result = await provision(provider, runner);

    expect(result.seed).toEqual({ kind: "full", requiredRevs: [] });
    expect(bundleCreates(calls)).toEqual([["git", "-c", "pack.threads=1", "bundle", "create", expect.any(String), expect.stringMatching(/^refs\/decomp-orchestrator\/sandbox-seeds\//)]]);
    expect(sandboxCommands(provider)).toContainEqual(["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev"]);
  });

  test("a required revision descending from the baked one stays thin, travels as its own ref and is verified", async () => {
    const provider = new FakeSandboxProvider();
    const { calls, runner } = gitRunner();
    const result = await provision(provider, runner, { requiredRevs: ["trusted-base", "", "base-rev"] });

    expect(result.seed).toEqual({ kind: "thin", requiredRevs: ["trusted-base"] });
    expect(calls.filter((command) => command[1] === "merge-base")).toEqual([
      ["git", "merge-base", "--is-ancestor", "baked-rev", "base-rev"],
      ["git", "merge-base", "--is-ancestor", "baked-rev", "trusted-base"],
    ]);
    const updates = calls.filter((command) => command[1] === "update-ref" && command[2] !== "-d");
    expect(updates.map((command) => command[3])).toEqual(["base-rev", "trusted-base"]);
    expect(bundleCreates(calls)[0]?.slice(6)).toEqual([updates[0]![2], updates[1]![2], "^baked-rev"]);
    expect(calls.filter((command) => command[2] === "-d").map((command) => command[3])).toEqual(updates.map((command) => command[2]));
    const commands = sandboxCommands(provider);
    expect(commands).toContainEqual(["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev", "trusted-base"]);
    expect(commands.map((command) => command.join(" "))).toContain("git rev-parse --verify trusted-base^{commit}");
  });

  test("a required revision older than the baked one forces a full bundle with every revision", async () => {
    const provider = new FakeSandboxProvider();
    const { calls, runner } = gitRunner({ ancestors: { "baked-rev..trusted-base": 1 } });
    const result = await provision(provider, runner, { requiredRevs: ["trusted-base"] });

    expect(result.seed).toEqual({ kind: "full", requiredRevs: ["trusted-base"] });
    expect(bundleCreates(calls)[0]).toHaveLength(8);
    expect(bundleCreates(calls)[0]?.some((arg) => arg.startsWith("^"))).toBeFalse();
    expect(sandboxCommands(provider)).toContainEqual(["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev", "trusted-base"]);
  });

  test("a baked base with an older required revision still bundles that revision", async () => {
    const provider = new FakeSandboxProvider();
    const { calls, runner } = gitRunner({ ancestors: { "baked-rev..trusted-base": 1 } });
    const result = await provision(provider, runner, { baseRev: "baked-rev", requiredRevs: ["trusted-base"] });

    expect(result.seed).toEqual({ kind: "full", requiredRevs: ["trusted-base"] });
    expect(sandboxCommands(provider)).toContainEqual(["git", "fetch", "/tmp/melee-claim-seed.bundle", "baked-rev", "trusted-base"]);
    expect(calls.some(isBundleCreate)).toBeTrue();
  });

  test("fails closed, naming the revision, when the host lacks a required revision", async () => {
    const provider = new FakeSandboxProvider();
    const { calls, runner } = gitRunner({ hostRevs: { "gone-rev": 1 } });
    await expect(provision(provider, runner, { baseRev: "baked-rev", requiredRevs: ["gone-rev"] }))
      .rejects.toThrow("sandbox required revision gone-rev is not a commit in the host checkout");
    expect(bundleCreates(calls)).toEqual([]);
    expect(provider.deletedSandboxes.map((deletion) => deletion.reason)).toEqual(["provision_failure"]);
  });

  test("retries once with a full bundle when the sandbox cannot verify the thin one", async () => {
    const provider = new FakeSandboxProvider().scriptExec(
      { exitCode: 0, stdout: "", stderr: "" },
      { exitCode: 1, stdout: "", stderr: "error: Repository lacks these prerequisite commits" },
    );
    const { calls, runner } = gitRunner();
    const result = await provision(provider, runner);

    expect(result.seed).toEqual({ kind: "full", thinFallback: true, requiredRevs: [] });
    expect(bundleCreates(calls).map((command) => command.at(-1)?.startsWith("^"))).toEqual([true, false]);
    expect(provider.uploadCalls.filter((call) => call.remotePath === "/tmp/melee-claim-seed.bundle")).toHaveLength(2);
    expect(sandboxCommands(provider).slice(0, 4)).toEqual([
      [...SEED_PROBE, "base-rev"],
      ["git", "bundle", "verify", "/tmp/melee-claim-seed.bundle"],
      ["git", "bundle", "verify", "/tmp/melee-claim-seed.bundle"],
      ["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev"],
    ]);
  });

  test("fails provisioning when a required revision is absent from the sandbox after fetch", async () => {
    const provider = new FakeSandboxProvider();
    for (let index = 0; index < 5; index += 1) {
      provider.scriptExec(async (call) => ({
        exitCode: call.command.join(" ") === "git rev-parse --verify trusted-base^{commit}" ? 128 : 0,
        stdout: "",
        stderr: "fatal: needed a single revision",
      }));
    }
    const { runner } = gitRunner();
    await expect(provision(provider, runner, { requiredRevs: ["trusted-base"] })).rejects.toThrow("sandbox required revision verification failed (128)");
    expect(provider.deletedSandboxes).toHaveLength(1);
  });

  test("a trusted base the image baked beside HEAD is neither bundled nor fetched, so the base stays thin", async () => {
    const provider = new FakeSandboxProvider().scriptExec({ exitCode: 0, stdout: "trusted-base\n", stderr: "" });
    // trusted-base is older than the baked commit: without the baked extra this would be a full bundle.
    const { calls, runner } = gitRunner({ ancestors: { "baked-rev..trusted-base": 1 } });
    const result = await provision(provider, runner, { requiredRevs: ["trusted-base"] });

    expect(result.seed).toEqual({ kind: "thin", requiredRevs: ["trusted-base"], bakedExtra: ["trusted-base"] });
    expect(calls.filter((command) => command[1] === "merge-base")).toEqual([["git", "merge-base", "--is-ancestor", "baked-rev", "base-rev"]]);
    expect(calls.filter((command) => command[1] === "update-ref" && command[2] !== "-d").map((command) => command[3])).toEqual(["base-rev"]);
    const commands = sandboxCommands(provider);
    expect(commands[0]).toEqual([...SEED_PROBE, "base-rev", "trusted-base"]);
    expect(commands).toContainEqual(["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev"]);
    expect(commands.map((command) => command.join(" "))).toContain("git rev-parse --verify trusted-base^{commit}");
  });

  test("when the image already holds every wanted revision nothing is packed or uploaded and each one is verified", async () => {
    const provider = new FakeSandboxProvider().scriptExec({ exitCode: 0, stdout: "base-rev\ntrusted-base\n", stderr: "" });
    const { calls, runner } = gitRunner();
    const result = await provision(provider, runner, { requiredRevs: ["trusted-base"] });

    expect(result.seed).toEqual({ kind: "baked", requiredRevs: ["trusted-base"], bakedExtra: ["base-rev", "trusted-base"] });
    // Only the fail-closed host presence check ran on the host.
    expect(calls).toEqual([["git", "rev-parse", "--verify", "--quiet", "trusted-base^{commit}"]]);
    expect(provider.uploadCalls.map((call) => call.remotePath)).not.toContain("/tmp/melee-claim-seed.bundle");
    expect(sandboxCommands(provider).slice(0, 4)).toEqual([
      [...SEED_PROBE, "base-rev", "trusted-base"],
      ["git", "rev-parse", "--verify", "base-rev^{commit}"],
      ["git", "rev-parse", "--verify", "trusted-base^{commit}"],
      ["git", "checkout", "--force", "--detach", "base-rev"],
    ]);
  });

  test("a failed probe bundles every revision as before", async () => {
    const provider = new FakeSandboxProvider().scriptExec({ exitCode: 127, stdout: "", stderr: "sh: not found" });
    const { calls, runner } = gitRunner({ ancestors: { "baked-rev..trusted-base": 1 } });
    const result = await provision(provider, runner, { requiredRevs: ["trusted-base"] });

    expect(result.seed).toEqual({ kind: "full", requiredRevs: ["trusted-base"] });
    expect(bundleCreates(calls)).toHaveLength(1);
    expect(sandboxCommands(provider)).toContainEqual(["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev", "trusted-base"]);
  });

  test("writes sandbox files after checkout and links the compiler source", async () => {
    const provider = new FakeSandboxProvider();
    const { runner } = gitRunner();
    const result = await provision(provider, runner, {
      baseRev: "baked-rev",
      sandboxFiles: [{ relativePath: "build/steering/unverified-matches.json", content: "{\"unverified\":[]}\n" }],
    });
    const handle = (await provider.get(result.sandboxId))!;

    expect(await handle.readFile("/workspace/sms/checkout/build/steering/unverified-matches.json")).toBe("{\"unverified\":[]}\n");
    const commands = sandboxCommands(provider);
    const checkout = commands.findIndex((command) => command[1] === "checkout");
    const mkdir = commands.findIndex((command) => command[0] === "mkdir" && command[2] === "/workspace/sms/checkout/build/steering");
    const link = commands.findIndex((command) => command.at(-2) === "/opt/mwcc" && command.at(-1) === "/workspace/sms/mwcc");
    expect(checkout).toBeGreaterThanOrEqual(0);
    expect(mkdir).toBeGreaterThan(checkout);
    expect(link).toBeGreaterThan(checkout);
    expect(provider.operationCalls.map((call) => call.operation)).toContain("writeFile");

    await expect(provision(new FakeSandboxProvider(), runner, {
      baseRev: "baked-rev",
      sandboxFiles: [{ relativePath: "../escape.json", content: "" }],
    })).rejects.toThrow("non-escaping workspace-relative");
  });

  test("the compiler source link is a guarded no-op on images without /opt/mwcc", async () => {
    const provider = new FakeSandboxProvider();
    const handle = await provider.create({ snapshot: "s", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    await ensureSandboxCompilerSourceLink(handle, "/workspace/sms/checkout");
    const [command] = sandboxCommands(provider);
    expect(command?.slice(3)).toEqual(["--", "/opt/mwcc", "/workspace/sms/mwcc"]);
    expect(command?.[2]).toBe('if [ -d "$1" ] && { [ -L "$2" ] || [ ! -e "$2" ]; }; then ln -sfn "$1" "$2"; fi');
  });
});

describe("ensureSandboxToolpack", () => {
  test("uploads an absent toolpack and skips it when the remote content stamp matches", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-toolpack-"));
    roots.push(root);
    const hostToolpackRoot = resolve(root, "fixture-pack");
    await mkdir(resolve(hostToolpackRoot, "api"), { recursive: true });
    await writeFile(resolve(hostToolpackRoot, "api", "run.py"), "print('fixture')\n");
    await mkdir(resolve(hostToolpackRoot, "tests"), { recursive: true });
    await writeFile(resolve(hostToolpackRoot, "tests", "excluded.py"), "excluded\n");

    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create({
      snapshot: "fixture",
      labels: {},
      resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
      ttlMinutes: 1,
    });
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "fixture-pack" });

    expect(provider.uploadCalls.map((call) => call.remotePath)).toEqual(["/tmp/toolpack-fixture-pack.tar"]);
    expect(provider.execCalls).toHaveLength(1);
    expect(provider.execCalls.every((call) => call.opts.timeoutMs === 180_000)).toBeTrue();
    expect(provider.execCalls[0]?.command).toEqual([
      "bash",
      "-lc",
      'rm -rf "$1" && mkdir -p /opt/toolpacks && tar -xf "$2" -C /opt && rm -f "$2"',
      "--",
      "/opt/toolpacks/fixture-pack",
      "/tmp/toolpack-fixture-pack.tar",
    ]);
    const ready = await sandbox.readFile("/opt/toolpacks/fixture-pack/.ready");
    expect(ready).toMatch(/^[0-9a-f]{64}\n$/);

    provider.uploadCalls.splice(0);
    provider.execCalls.splice(0);
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "fixture-pack" });

    expect(provider.uploadCalls).toEqual([]);
    expect(provider.execCalls).toEqual([]);
    expect(await sandbox.readFile("/opt/toolpacks/fixture-pack/.ready")).toBe(ready);
  });
});

describe("ensureSandboxToolpack shared tar", () => {
  test("packs one tar per content stamp for every drifted sandbox, and drops it after its TTL", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-toolpack-shared-"));
    roots.push(root);
    const hostToolpackRoot = resolve(root, "shared-pack");
    const file = resolve(hostToolpackRoot, "api", "run.py");
    await mkdir(resolve(hostToolpackRoot, "api"), { recursive: true });
    await writeFile(file, "print('shared')\n");
    const before = sharedToolpackTarCount();
    const provider = new FakeSandboxProvider();
    const sandboxes = await Promise.all([1, 2, 3].map(() => provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 })));
    process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "60000";
    try {
      await Promise.all(sandboxes.map((sandbox) => ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "shared-pack" })));
      // Three uploads of one packed tar (same host file), each sandbox stamped.
      expect(provider.uploadCalls).toHaveLength(3);
      expect(new Set(provider.uploadCalls.map((call) => call.localPath)).size).toBe(1);
      const tarPath = provider.uploadCalls[0]!.localPath;
      expect(existsSync(tarPath)).toBeTrue();
      // Bounded: earlier tests' idle tars are evicted beyond two.
      expect(sharedToolpackTarCount()).toBeLessThanOrEqual(Math.max(2, before));
      const stamps = await Promise.all(sandboxes.map((sandbox) => sandbox.readFile("/opt/toolpacks/shared-pack/.ready")));
      expect(new Set(stamps).size).toBe(1);

      // New content is a new stamp and a new tar; the idle old one is kept (bounded) until its TTL.
      await writeFile(file, "print('changed')\n");
      await utimes(file, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"));
      const late = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
      process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "0";
      await ensureSandboxToolpack(late, { hostToolpackRoot, toolpackId: "shared-pack" });
      const newTar = provider.uploadCalls.at(-1)!.localPath;
      expect(newTar).not.toBe(tarPath);
      // TTL 0: a tar is deleted as soon as its last user is done.
      expect(existsSync(newTar)).toBeFalse();
      expect(await late.readFile("/opt/toolpacks/shared-pack/.ready")).not.toBe(stamps[0]);
    } finally {
      delete process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV];
    }
  });
});

describe("ensureSandboxToolpack shared tar integrity and bound", () => {
  async function pack(root: string, name: string, text: string, at: Date) {
    const hostToolpackRoot = resolve(root, name);
    const file = resolve(hostToolpackRoot, "api", "run.py");
    await mkdir(resolve(hostToolpackRoot, "api"), { recursive: true });
    const write = async (value: string) => {
      await writeFile(file, value);
      await utimes(file, at, at);
    };
    await write(text);
    return { hostToolpackRoot, write };
  }

  test("a tree that changes during the remote stamp probe is never cached under the probed stamp", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-toolpack-race-"));
    roots.push(root);
    const { hostToolpackRoot, write } = await pack(root, "race-pack", "print('A')\n", new Date("2026-04-01T00:00:00Z"));
    const provider = new FakeSandboxProvider();
    const sandbox = () => provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    const params = { hostToolpackRoot, toolpackId: "race-pack" };
    const tarText = async (index: number) => {
      const localTar = resolve(root, `upload-${index}.tar`);
      const remote = provider.uploadCalls[index]!;
      const target = await provider.get(remote.sandboxId);
      await target!.downloadFile(remote.remotePath, localTar);
      return execFileSync("tar", ["-xOf", localTar, "toolpacks/race-pack/api/run.py"]).toString();
    };
    process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "60000";
    try {
      const first = await sandbox();
      process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "0";
      await ensureSandboxToolpack(first, params);
      const stampA = (await first.readFile("/opt/toolpacks/race-pack/.ready")).trim();
      process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "60000";

      // The probe computed stamp A; the tree becomes B while the remote stamp is read: the sandbox
      // gets B with B's own stamp, and nothing is cached under A.
      const second = mutateDuringProbe(await sandbox(), "/opt/toolpacks/race-pack/.ready", () => write("print('B')\n"));
      await ensureSandboxToolpack(second, params);
      expect(await tarText(1)).toBe("print('B')\n");
      const stampB = (await second.readFile("/opt/toolpacks/race-pack/.ready")).trim();
      expect(stampB).not.toBe(stampA);

      // A restored within the TTL: a fresh pack of A, never the B tar.
      await write("print('A')\n");
      const third = await sandbox();
      await ensureSandboxToolpack(third, params);
      expect(await tarText(2)).toBe("print('A')\n");
      expect((await third.readFile("/opt/toolpacks/race-pack/.ready")).trim()).toBe(stampA);
      expect(provider.uploadCalls[2]!.localPath).not.toBe(provider.uploadCalls[1]!.localPath);
      expect(existsSync(provider.uploadCalls[1]!.localPath)).toBeFalse();
    } finally {
      delete process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV];
    }
  });

  test("concurrent packs of distinct trees still leave at most two idle tars once released", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-toolpack-bound-"));
    roots.push(root);
    const at = new Date("2026-05-01T00:00:00Z");
    const packs = await Promise.all(["one", "two", "three"].map((name) => pack(root, `bound-${name}`, `print('${name}')\n`, at)));
    const provider = new FakeSandboxProvider();
    process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "60000";
    try {
      await Promise.all(packs.map(async ({ hostToolpackRoot }, index) => {
        const sandbox = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
        await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: `bound-${["one", "two", "three"][index]}` });
      }));
      expect(provider.uploadCalls).toHaveLength(3);
      expect(sharedToolpackTarCount()).toBeLessThanOrEqual(2);
      await Bun.sleep(20);
      expect(provider.uploadCalls.filter((call) => existsSync(call.localPath)).length).toBeLessThanOrEqual(2);
    } finally {
      delete process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV];
    }
  });
});

describe("ensureSandboxToolpack stamp memo", () => {
  test("a matching remote stamp skips the copy and the hashing; any content write (ctime) or file replacement rehashes", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-toolpack-memo-"));
    roots.push(root);
    const hostToolpackRoot = resolve(root, "memo-pack");
    const file = resolve(hostToolpackRoot, "api", "run.py");
    await mkdir(resolve(hostToolpackRoot, "api"), { recursive: true });
    await writeFile(file, "print('one')\n");
    const fixedTime = new Date("2026-01-01T00:00:00Z");
    await utimes(file, fixedTime, fixedTime);

    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "memo-pack" });
    const ready = await sandbox.readFile("/opt/toolpacks/memo-pack/.ready");
    expect(provider.uploadCalls).toHaveLength(1);

    // Nothing changed: the memoized stamp answers, so nothing is hashed or uploaded.
    provider.operationCalls.splice(0);
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "memo-pack" });
    expect(provider.uploadCalls).toHaveLength(1);
    expect(provider.operationCalls.map((call) => call.operation)).toEqual(["readFile"]);

    // Same path, size and mtime but new bytes: the write moved the ctime, so it rehashes and resyncs.
    await writeFile(file, "print('two')\n");
    await utimes(file, fixedTime, fixedTime);
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "memo-pack" });
    expect(provider.uploadCalls).toHaveLength(2);
    const two = await sandbox.readFile("/opt/toolpacks/memo-pack/.ready");
    expect(two).not.toBe(ready);

    // A file replaced by a copy with the same bytes, size and mtime is a new inode: rehashed, same stamp, no upload.
    await writeFile(`${file}.new`, "print('two')\n");
    await utimes(`${file}.new`, fixedTime, fixedTime);
    await rename(`${file}.new`, file);
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "memo-pack" });
    expect(provider.uploadCalls).toHaveLength(2);
    expect(await sandbox.readFile("/opt/toolpacks/memo-pack/.ready")).toBe(two);
  });

  test("skips the upload when the baked image already carries the host stamp", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "provision-toolpack-baked-"));
    roots.push(root);
    const hostToolpackRoot = resolve(root, "baked-pack");
    await mkdir(resolve(hostToolpackRoot, "api"), { recursive: true });
    await writeFile(resolve(hostToolpackRoot, "api", "run.py"), "print('baked')\n");
    await mkdir(resolve(hostToolpackRoot, "api", "__pycache__"), { recursive: true });
    await writeFile(resolve(hostToolpackRoot, "api", "__pycache__", "run.cpython-312.pyc"), "bytecode");
    // The stamp build_image_bundle.sh writes: sha256 of "<sha256>  ./<path>" lines.
    const digest = execFileSync("shasum", ["-a", "256", resolve(hostToolpackRoot, "api", "run.py")]).toString().split(" ")[0];
    const listing = `${digest}  ./api/run.py\n`;
    const stamp = execFileSync("shasum", ["-a", "256"], { input: listing }).toString().split(" ")[0];

    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    await sandbox.writeFile("/opt/toolpacks/baked-pack/.ready", `${stamp}\n`);
    provider.operationCalls.splice(0);
    await ensureSandboxToolpack(sandbox, { hostToolpackRoot, toolpackId: "baked-pack" });
    expect(provider.uploadCalls).toEqual([]);
    expect(provider.execCalls).toEqual([]);
  });
});

describe("ensureSandboxQaAssets", () => {
  async function qaFixture() {
    const root = await mkdtemp(resolve(tmpdir(), "provision-qa-"));
    roots.push(root);
    const orchestratorRoot = resolve(root, "orchestrator");
    const put = async (path: string, text: string) => {
      await mkdir(resolve(orchestratorRoot, path, ".."), { recursive: true });
      await writeFile(resolve(orchestratorRoot, path), text);
    };
    await put("knowledge/global/sources/injectable/decomp_standards/standards/order.json", "[]");
    await put("games/sms/game.json", "{\"gameId\":\"sms\"}");
    await put("games/sms/config/tools/checkdiff.json", "{}");
    await put("games/sms/config/local.env", "SECRET=1");
    await put("games/sms/config/extra.env", "SECRET=2");
    await put("games/sms/knowledge/sources/injectable/decomp_standards/standards/sms/standards.jsonl", "{}\n");
    await put("games/sms/knowledge/sources/injectable/decomp_standards/standards/__pycache__/x.pyc", "bytecode");
    await put("games/melee/game.json", "{\"gameId\":\"melee\"}");
    await put("games/melee/knowledge/sources/injectable/banned_patterns/data/patterns.json", "[]");
    await put("shared/linked.json", "{\"linked\":true}");
    await symlink(resolve(orchestratorRoot, "shared/linked.json"), resolve(orchestratorRoot, "games/sms/config/linked.json"));
    return { root, orchestratorRoot };
  }

  test("syncs the QA layout as one stamped tar and skips it when the remote stamp matches", async () => {
    const { root, orchestratorRoot } = await qaFixture();
    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });

    await ensureSandboxQaAssets(sandbox, { orchestratorRoot, gameId: "sms" });

    expect(provider.uploadCalls.map((call) => call.remotePath)).toEqual(["/tmp/qa-assets-sms.tar"]);
    // The stamp is written last, and it is the toolpack scheme over the synced files.
    expect(provider.operationCalls.at(-1)?.operation).toBe("writeFile");
    expect((await sandbox.readFile(SANDBOX_QA_STAMP_PATH)).trim()).toBe(await sandboxQaAssetsStamp({ orchestratorRoot, gameId: "sms" }));
    const localTar = resolve(root, "qa.tar");
    await sandbox.downloadFile("/tmp/qa-assets-sms.tar", localTar);
    const entries = execFileSync("tar", ["-tf", localTar]).toString().split("\n").filter((entry) => entry && !entry.endsWith("/"));
    expect(entries.sort()).toEqual([
      "games/melee/game.json",
      "games/melee/knowledge/sources/injectable/banned_patterns/data/patterns.json",
      "games/sms/config/linked.json",
      "games/sms/config/tools/checkdiff.json",
      "games/sms/game.json",
      "games/sms/knowledge/sources/injectable/decomp_standards/standards/sms/standards.jsonl",
      "knowledge/global/sources/injectable/decomp_standards/standards/order.json",
    ]);
    expect(execFileSync("tar", ["-xOf", localTar, "games/sms/config/linked.json"]).toString()).toBe("{\"linked\":true}");
    // The image bundle's shell scheme over the extracted tree yields the same stamp.
    const extracted = resolve(root, "extracted");
    await mkdir(extracted, { recursive: true });
    execFileSync("tar", ["-xf", localTar, "-C", extracted]);
    const shellStamp = execFileSync("bash", ["-c", `cd "$1" && find . -type f ! -path './.qa-ready' | LC_ALL=C sort | while IFS= read -r f; do printf '%s  %s\\n' "$(shasum -a 256 "$f" | awk '{print $1}')" "$f"; done | shasum -a 256 | awk '{print $1}'`, "--", extracted]).toString().trim();
    expect((await sandbox.readFile(SANDBOX_QA_STAMP_PATH)).trim()).toBe(shellStamp);
    const [extract] = provider.execCalls;
    expect(extract?.command.slice(3, 6)).toEqual(["--", SANDBOX_QA_ROOT, "/tmp/qa-assets-sms.tar"]);
    expect(extract?.command.slice(6)).toContain("games/sms/config");
    expect(extract?.command.slice(6)).toContain("games/sms/knowledge/sources/injectable/banned_patterns/data");
    expect(await sandbox.readFile(SANDBOX_QA_STAMP_PATH)).toMatch(/^[0-9a-f]{64}\n$/);

    provider.uploadCalls.splice(0);
    provider.execCalls.splice(0);
    await ensureSandboxQaAssets(sandbox, { orchestratorRoot, gameId: "sms" });
    expect(provider.uploadCalls).toEqual([]);
    expect(provider.execCalls).toEqual([]);
  });

  test("drifted sandboxes share one packed tar per QA content stamp; new content packs a new one", async () => {
    const { orchestratorRoot } = await qaFixture();
    const provider = new FakeSandboxProvider();
    const sandboxes = await Promise.all([1, 2, 3].map(() => provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 })));
    process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "60000";
    try {
      await Promise.all(sandboxes.map((sandbox) => ensureSandboxQaAssets(sandbox, { orchestratorRoot, gameId: "sms" })));
      expect(provider.uploadCalls).toHaveLength(3);
      expect(new Set(provider.uploadCalls.map((call) => call.localPath)).size).toBe(1);
      const tarPath = provider.uploadCalls[0]!.localPath;
      expect(existsSync(tarPath)).toBeTrue();
      expect(sharedQaAssetTarCount()).toBeGreaterThanOrEqual(1);
      expect(sharedQaAssetTarCount()).toBeLessThanOrEqual(2);
      const stamp = await sandboxQaAssetsStamp({ orchestratorRoot, gameId: "sms" });
      for (const sandbox of sandboxes) expect((await sandbox.readFile(SANDBOX_QA_STAMP_PATH)).trim()).toBe(stamp);

      // A later drifted sandbox within the TTL reuses the packed tar.
      const late = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
      await ensureSandboxQaAssets(late, { orchestratorRoot, gameId: "sms" });
      expect(provider.uploadCalls.at(-1)!.localPath).toBe(tarPath);

      // New content is a new stamp and a new tar; TTL 0 deletes it after its last user.
      const changed = resolve(orchestratorRoot, "games/sms/config/tools/checkdiff.json");
      await writeFile(changed, "{\"changed\":true}");
      await utimes(changed, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"));
      const fresh = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
      process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "0";
      await ensureSandboxQaAssets(fresh, { orchestratorRoot, gameId: "sms" });
      const newTar = provider.uploadCalls.at(-1)!.localPath;
      expect(newTar).not.toBe(tarPath);
      expect(existsSync(newTar)).toBeFalse();
      expect((await fresh.readFile(SANDBOX_QA_STAMP_PATH)).trim()).toBe(await sandboxQaAssetsStamp({ orchestratorRoot, gameId: "sms" }));
      expect((await fresh.readFile(SANDBOX_QA_STAMP_PATH)).trim()).not.toBe(stamp);
    } finally {
      delete process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV];
    }
  });

  test("refuses a symlink that leaves the orchestrator root", async () => {
    const { root, orchestratorRoot } = await qaFixture();
    await writeFile(resolve(root, "outside.json"), "{}");
    await symlink(resolve(root, "outside.json"), resolve(orchestratorRoot, "games/sms/config/outside.json"));
    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    await expect(ensureSandboxQaAssets(sandbox, { orchestratorRoot, gameId: "sms" })).rejects.toThrow("Unsupported QA asset symlink");
  });
});

describe("sandbox seed bundle against real git", () => {
  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" }).toString().trim();
  }

  /** Host repo with one commit per label (in order), each changing src/a.c; returns label -> sha. */
  async function hostHistory(root: string, labels: string[]): Promise<{ host: string; revs: Record<string, string> }> {
    const host = resolve(root, "host");
    await mkdir(resolve(host, "src"), { recursive: true });
    git(host, "init", "-q");
    const revs: Record<string, string> = {};
    for (const label of labels) {
      await writeFile(resolve(host, "src/a.c"), `// ${label}\n`);
      git(host, "add", "-A");
      git(host, "commit", "-qm", label);
      revs[label] = git(host, "rev-parse", "HEAD");
    }
    return { host, revs };
  }

  /** The image: a depth-1 clone at the baked commit. */
  function bakedClone(root: string, host: string, bakedRev: string): string {
    git(host, "branch", "-f", "baked", bakedRev);
    const workspace = resolve(root, "sandbox", "checkout");
    execFileSync("git", ["clone", "-q", "--depth", "1", "--branch", "baked", `file://${host}`, workspace], { stdio: "pipe" });
    return workspace;
  }

  /** Runs the sandbox's git (and `sh` probe) commands in the local clone (the uploaded bundle is materialised first); everything else succeeds. */
  function gitBackedSandbox(provider: FakeSandboxProvider, root: string) {
    const localBundle = resolve(root, "sandbox-seed.bundle");
    for (let index = 0; index < 60; index += 1) {
      provider.scriptExec(async (call) => {
        if (call.command[0] !== "git" && call.command[0] !== "sh") return { exitCode: 0, stdout: "", stderr: "" };
        if (call.command.includes("/tmp/melee-claim-seed.bundle")) {
          await (await provider.get(call.sandboxId))!.downloadFile("/tmp/melee-claim-seed.bundle", localBundle);
        }
        const args = call.command.slice(1).map((arg) => arg === "/tmp/melee-claim-seed.bundle" ? localBundle : arg);
        try {
          return { exitCode: 0, stdout: execFileSync(call.command[0]!, args, { cwd: call.opts.cwd, stdio: "pipe" }).toString(), stderr: "" };
        } catch (error) {
          const failure = error as { status?: number; stderr?: Buffer };
          return { exitCode: failure.status ?? 1, stdout: "", stderr: failure.stderr?.toString() ?? "" };
        }
      });
    }
  }

  test.each([
    ["newer than the baked commit: thin bundle", ["baked", "trusted", "base"], "thin" as const],
    ["older than the baked commit: full bundle", ["trusted", "baked", "base"], "full" as const],
  ])("the trusted base is readable in the sandbox when it is %s", async (_label, order, kind) => {
    const { store, root } = await sandboxFixture("provision-real-git-");
    const { host, revs } = await hostHistory(root, order);
    const workspaceRoot = bakedClone(root, host, revs.baked!);
    const provider = new FakeSandboxProvider();
    gitBackedSandbox(provider, root);

    const result = await provisionSandboxWorkspace({
      provider,
      sourceRepoRoot: host,
      baseRev: revs.base!,
      snapshotBakedRev: revs.baked!,
      workspaceRoot,
      snapshot: "snapshot",
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlSeconds: 60,
      labels: sandboxLabels,
      reportArtifactSources: [],
      event: sandboxEvent(store),
      requiredRevs: [revs.trusted!],
    });

    expect(result.seed).toEqual({ kind, requiredRevs: [revs.trusted] });
    const bundle = execFileSync("git", ["bundle", "list-heads", resolve(root, "sandbox-seed.bundle")], { cwd: host }).toString();
    expect(bundle.split("\n").filter(Boolean)).toHaveLength(2);
    // A thin bundle's only prerequisite is the baked commit; a full one has none.
    const header = readFileSync(resolve(root, "sandbox-seed.bundle")).toString("latin1").split("\n\n")[0]!;
    expect(header.split("\n").filter((line) => line.startsWith("-")).map((line) => line.slice(1, 41))).toEqual(kind === "thin" ? [revs.baked!] : []);
    expect(git(workspaceRoot, "rev-parse", "HEAD")).toBe(revs.base);
    expect(git(workspaceRoot, "show", `${revs.trusted}:src/a.c`)).toBe("// trusted");
    // The temporary seed refs are gone from the host.
    expect(git(host, "for-each-ref", "refs/decomp-orchestrator/")).toBe("");
  }, 30_000);

  test("a trusted base older than the baked commit, baked beside it by the image bundle, keeps the seed thin", async () => {
    const { store, root } = await sandboxFixture("provision-real-git-extra-");
    const { host, revs } = await hostHistory(root, ["trusted", "baked", "base"]);
    const workspaceRoot = bakedClone(root, host, revs.baked!);
    // The bundle script's extra-revision stage, run against the image clone.
    const revsFile = resolve(root, "extra-revs.txt");
    await writeFile(revsFile, `# from extra-baked-revs.ts\n${revs.trusted!.slice(0, 10)}\n`);
    const bakeScript = resolve(import.meta.dir, "../../../../../toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/bake_extra_revs.sh");
    execFileSync("bash", [bakeScript, host, workspaceRoot, revsFile, resolve(root, "baked-extra-revs.txt")], { stdio: "pipe" });
    const provider = new FakeSandboxProvider();
    gitBackedSandbox(provider, root);

    const result = await provisionSandboxWorkspace({
      provider,
      sourceRepoRoot: host,
      baseRev: revs.base!,
      snapshotBakedRev: revs.baked!,
      workspaceRoot,
      snapshot: "snapshot",
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlSeconds: 60,
      labels: sandboxLabels,
      reportArtifactSources: [],
      event: sandboxEvent(store),
      requiredRevs: [revs.trusted!],
    });

    expect(result.seed).toEqual({ kind: "thin", requiredRevs: [revs.trusted], bakedExtra: [revs.trusted] });
    // Only the base travelled, as a thin bundle whose one prerequisite is the baked commit.
    const bundle = execFileSync("git", ["bundle", "list-heads", resolve(root, "sandbox-seed.bundle")], { cwd: host }).toString();
    expect(bundle.split("\n").filter(Boolean)).toHaveLength(1);
    const header = readFileSync(resolve(root, "sandbox-seed.bundle")).toString("latin1").split("\n\n")[0]!;
    expect(header.split("\n").filter((line) => line.startsWith("-")).map((line) => line.slice(1, 41))).toEqual([revs.baked!]);
    expect(git(workspaceRoot, "rev-parse", "HEAD")).toBe(revs.base);
    expect(git(workspaceRoot, "show", `${revs.trusted}:src/a.c`)).toBe("// trusted");
  }, 30_000);
});

describe("ensureSandboxToolData", () => {
  async function indexFixture() {
    const root = await mkdtemp(resolve(tmpdir(), "provision-tool-data-"));
    roots.push(root);
    const hostRoot = resolve(root, "tool-data", "asm_window_search");
    await mkdir(resolve(hostRoot, "indexes"), { recursive: true });
    const files = ["indexes/functions.jsonl", "indexes/windows.meta.jsonl", "indexes/windows.vec.bin", "indexes/manifest.json"];
    for (const file of files) await writeFile(resolve(hostRoot, file), `${file}\n`);
    await writeFile(resolve(hostRoot, "indexes", "unrelated.tmp"), "not synced");
    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    return { root, hostRoot, files, provider, sandbox };
  }

  test("syncs exactly the listed files under /opt/tool-data/<tool> and skips on a stamp match", async () => {
    const { root, hostRoot, files, provider, sandbox } = await indexFixture();
    expect(await ensureSandboxToolData(sandbox, { toolId: "asm_window_search", hostRoot, files })).toBeTrue();

    expect(provider.uploadCalls.map((call) => call.remotePath)).toEqual(["/tmp/tool-data-asm_window_search.tar.gz"]);
    const localTar = resolve(root, "data.tar.gz");
    await sandbox.downloadFile("/tmp/tool-data-asm_window_search.tar.gz", localTar);
    expect(execFileSync("tar", ["-tzf", localTar]).toString().split("\n").filter(Boolean).sort()).toEqual([...files].sort());
    expect(provider.execCalls[0]?.command.slice(3)).toEqual(["--", "/opt/tool-data/asm_window_search", "/tmp/tool-data-asm_window_search.tar.gz"]);
    expect(await sandbox.readFile("/opt/tool-data/asm_window_search/.ready")).toMatch(/^[0-9a-f]{64}\n$/);

    provider.uploadCalls.splice(0);
    provider.execCalls.splice(0);
    expect(await ensureSandboxToolData(sandbox, { toolId: "asm_window_search", hostRoot, files })).toBeTrue();
    expect(provider.uploadCalls).toEqual([]);
    expect(provider.execCalls).toEqual([]);
  });

  test("the uploaded data and its stamp come from one copy, even when the tree changes during the probe", async () => {
    const { root, hostRoot, files, provider } = await indexFixture();
    const tree = { toolId: "asm_window_search", hostRoot, files };
    const changed = resolve(hostRoot, "indexes/manifest.json");
    const stampPath = "/opt/tool-data/asm_window_search/.ready";
    const fresh = () => provider.create({ snapshot: "fixture", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 });
    process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV] = "0";
    try {
      const first = await fresh();
      await ensureSandboxToolData(first, tree);
      const stampA = await first.readFile(stampPath);

      // Probed as A, the manifest becomes B while the remote stamp is read: B travels with B's stamp.
      const second = mutateDuringProbe(await fresh(), stampPath, () => writeFile(changed, "B\n"));
      await ensureSandboxToolData(second, tree);
      const localTar = resolve(root, "probe.tar.gz");
      await second.downloadFile("/tmp/tool-data-asm_window_search.tar.gz", localTar);
      expect(execFileSync("tar", ["-xzOf", localTar, "indexes/manifest.json"]).toString()).toBe("B\n");
      expect(await second.readFile(stampPath)).not.toBe(stampA);

      // A restored: the sandbox holding B is not mistaken for A and resyncs.
      await writeFile(changed, "indexes/manifest.json\n");
      const uploads = provider.uploadCalls.length;
      await ensureSandboxToolData(second, tree);
      expect(provider.uploadCalls).toHaveLength(uploads + 1);
      expect(await second.readFile(stampPath)).toBe(stampA);
    } finally {
      delete process.env[SANDBOX_TOOLPACK_TAR_TTL_ENV];
    }
  });

  test("uploads nothing when the host lacks an index file", async () => {
    const { hostRoot, files, provider, sandbox } = await indexFixture();
    expect(await ensureSandboxToolData(sandbox, { toolId: "asm_window_search", hostRoot, files: [...files, "indexes/missing.bin"] })).toBeFalse();
    expect(provider.uploadCalls).toEqual([]);
    expect(provider.execCalls).toEqual([]);
  });
});

describe("host git answers shared across provisions", () => {
  const sha = (char: string) => char.repeat(40);
  const BAKED = sha("b");
  const BASE = sha("c");
  const TRUSTED = sha("d");

  /** `gitRunner` whose answers take a moment, so concurrent provisions overlap on every host git question. */
  function slowGitRunner(hostRevs: Record<string, number> = {}) {
    const { calls, runner } = gitRunner({ hostRevs });
    const slow: ProvisionCommandRunner = async (cwd, command, options) => {
      if (command[1] === "merge-base" || command[1] === "rev-parse") await Bun.sleep(20);
      return runner(cwd, command, options);
    };
    const count = (verb: string, ...args: string[]) => calls.filter((command) => command[1] === verb && args.every((arg) => command.join(" ").includes(arg))).length;
    return { calls, runner: slow, count };
  }

  test("concurrent provisions ask merge-base and the presence check once per key; a changed key asks again", async () => {
    const { sourceRepoRoot } = await sandboxFixture("provision-host-git-");
    const { runner, count } = slowGitRunner();
    const provider = new FakeSandboxProvider();
    const shared = { sourceRepoRoot, baseRev: BASE, snapshotBakedRev: BAKED, requiredRevs: [TRUSTED] };
    const results = await Promise.all([provision(provider, runner, shared), provision(provider, runner, shared)]);

    expect(results.map((result) => result.seed?.kind)).toEqual(["thin", "thin"]);
    expect(count("merge-base", BAKED, BASE)).toBe(1);
    expect(count("merge-base", BAKED, TRUSTED)).toBe(1);
    expect(count("rev-parse", TRUSTED)).toBe(1);

    // A new trusted base and a different repository are new keys: each asks git again.
    const newTrusted = sha("e");
    await provision(provider, runner, { ...shared, requiredRevs: [newTrusted] });
    expect(count("rev-parse", newTrusted)).toBe(1);
    expect(count("merge-base", BAKED, newTrusted)).toBe(1);
    expect(count("merge-base", BAKED, BASE)).toBe(1);
    const { sourceRepoRoot: otherRepo } = await sandboxFixture("provision-host-git-other-");
    await provision(provider, runner, { ...shared, sourceRepoRoot: otherRepo });
    expect(count("rev-parse", TRUSTED)).toBe(2);
    expect(count("merge-base", BAKED, BASE)).toBe(2);
  });

  test("a revision the host lacks is asked again, so one fetched later provisions", async () => {
    const { sourceRepoRoot } = await sandboxFixture("provision-host-git-missing-");
    const hostRevs: Record<string, number> = { [TRUSTED]: 1 };
    const { runner, count } = slowGitRunner(hostRevs);
    const provider = new FakeSandboxProvider();
    const params = { sourceRepoRoot, baseRev: BASE, snapshotBakedRev: BAKED, requiredRevs: [TRUSTED] };
    await expect(provision(provider, runner, params)).rejects.toThrow(`sandbox required revision ${TRUSTED} is not a commit`);

    delete hostRevs[TRUSTED];
    const result = await provision(provider, runner, params);
    expect(result.seed?.kind).toBe("thin");
    expect(count("rev-parse", TRUSTED)).toBe(2);
  });
});

describe("shared seed bundle packing", () => {
  async function withEnv<T>(env: Record<string, string>, body: () => Promise<T>): Promise<T> {
    const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
      return await body();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  /** A host git double whose `bundle create` takes `packMs` and records the peak number of packs in flight. */
  function packingRunner(options: { packMs?: number; failPack?: boolean } = {}) {
    const calls: string[][] = [];
    const bundlePaths: string[] = [];
    let inFlight = 0;
    let peak = 0;
    const runner: ProvisionCommandRunner = async (_cwd, command) => {
      calls.push([...command]);
      if (isBundleCreate(command)) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Bun.sleep(options.packMs ?? 20);
        inFlight -= 1;
        if (options.failPack) return { exitCode: 128, stdout: "", stderr: "fatal: pack failed" };
        const path = command[command.indexOf("create") + 1]!;
        bundlePaths.push(path);
        await writeFile(path, "bundle");
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    return { calls, bundlePaths, runner, peak: () => peak };
  }

  async function sandboxes(count: number) {
    const provider = new FakeSandboxProvider();
    const handles = [];
    for (let index = 0; index < count; index += 1) {
      handles.push(await provider.create({ snapshot: "s", labels: {}, resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 }, ttlMinutes: 1 }));
    }
    return { provider, handles };
  }

  async function sourceRepo(): Promise<string> {
    const root = await mkdtemp(resolve(tmpdir(), "provision-shared-bundle-"));
    roots.push(root);
    return root;
  }

  test("concurrent provisions with the same key share one single-threaded pack; uploads stay per sandbox", async () => {
    const sourceRepoRoot = await sourceRepo();
    const { calls, bundlePaths, runner } = packingRunner();
    const { provider, handles } = await sandboxes(5);
    await withEnv({ ORCH_SANDBOX_BUNDLE_TTL_MS: "0" }, () => Promise.all(handles.map((sandbox, index) => uploadSeedBundle({
      sandbox, runner, sourceRepoRoot, revs: index % 2 ? ["base-rev", "trusted"] : ["trusted", "base-rev"], exclude: "baked-rev",
    }))));

    expect(bundleCreates(calls)).toHaveLength(1);
    expect(bundleCreates(calls)[0]?.slice(0, 5)).toEqual(["git", "-c", "pack.threads=1", "bundle", "create"]);
    expect(provider.uploadCalls.map((call) => call.remotePath)).toEqual(Array(5).fill("/tmp/melee-claim-seed.bundle"));
    // Two refs advertised for the one pack, both removed; the temp bundle is gone after the last user.
    const created = calls.filter((command) => command[1] === "update-ref" && command[2] !== "-d").map((command) => command[2]);
    expect(created).toHaveLength(2);
    expect(calls.filter((command) => command[2] === "-d").map((command) => command[3])).toEqual(created);
    expect(existsSync(bundlePaths[0]!)).toBeFalse();
  });

  test("different keys pack separately, bounded by the host semaphore", async () => {
    const sourceRepoRoot = await sourceRepo();
    const { calls, runner, peak } = packingRunner({ packMs: 30 });
    const { handles } = await sandboxes(6);
    await withEnv({ ORCH_SANDBOX_BUNDLE_CONCURRENCY: "2", ORCH_SANDBOX_BUNDLE_TTL_MS: "0" }, () => Promise.all(handles.map((sandbox, index) => uploadSeedBundle({
      sandbox, runner, sourceRepoRoot, revs: [`base-${index}`], exclude: index % 2 ? "baked-rev" : null,
    }))));

    expect(bundleCreates(calls)).toHaveLength(6);
    expect(bundleCreates(calls).every((command) => command.slice(1, 3).join("=") === "-c=pack.threads=1")).toBeTrue();
    expect(peak()).toBe(2);
  });

  test("a finished bundle is reused within its TTL, then deleted", async () => {
    const sourceRepoRoot = await sourceRepo();
    const { calls, bundlePaths, runner } = packingRunner();
    const { handles } = await sandboxes(2);
    const upload = (sandbox: (typeof handles)[number]) => uploadSeedBundle({ sandbox, runner, sourceRepoRoot, revs: ["base-rev"], exclude: "baked-rev" });
    await withEnv({ ORCH_SANDBOX_BUNDLE_TTL_MS: "50" }, async () => {
      await upload(handles[0]!);
      expect(existsSync(bundlePaths[0]!)).toBeTrue();
      await upload(handles[1]!);
      expect(bundleCreates(calls)).toHaveLength(1);
      await Bun.sleep(150);
      expect(existsSync(bundlePaths[0]!)).toBeFalse();
    });
  });

  test("a failed pack rejects every waiter, cleans its refs, and is not cached", async () => {
    const sourceRepoRoot = await sourceRepo();
    const failing = packingRunner({ failPack: true });
    const { provider, handles } = await sandboxes(4);
    const results = await withEnv({ ORCH_SANDBOX_BUNDLE_TTL_MS: "60000" }, () => Promise.allSettled(handles.slice(0, 3).map((sandbox) => uploadSeedBundle({
      sandbox, runner: failing.runner, sourceRepoRoot, revs: ["base-rev"], exclude: null,
    }))));
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(results.every((result) => result.status === "rejected" && String(result.reason).includes("sandbox git bundle creation failed (128)"))).toBeTrue();
    expect(bundleCreates(failing.calls)).toHaveLength(1);
    expect(failing.calls.filter((command) => command[2] === "-d")).toHaveLength(1);
    expect(provider.uploadCalls).toEqual([]);

    const retry = packingRunner();
    await withEnv({ ORCH_SANDBOX_BUNDLE_TTL_MS: "0" }, () => uploadSeedBundle({ sandbox: handles[3]!, runner: retry.runner, sourceRepoRoot, revs: ["base-rev"], exclude: null }));
    expect(bundleCreates(retry.calls)).toHaveLength(1);
  });
});
