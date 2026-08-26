import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, relative, resolve } from "node:path";
import { defaultToolpackId, toolpackRoot } from "@server/core/knowledge/paths.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { runCommand } from "@server/infrastructure/shell";
import {
  emitSandboxCreatedEvent,
  emitSandboxDeletedEvent,
  type SandboxCreatedEventInput,
} from "./sandbox-events.js";
import type { SandboxHandle, SandboxProvider, SandboxResourceClass } from "./sandbox.js";

export interface WorkerReportArtifactSource { relativePath: string; sourcePath: string }
export interface ProvisionCommandResult { exitCode: number; stdout: string; stderr: string }
export type ProvisionCommandRunner = (cwd: string, command: string[], options?: { timeoutMs?: number }) => Promise<ProvisionCommandResult>;

const SETUP_TIMEOUT_MS = 20 * 60 * 1000;
const TOOLPACK_SETUP_TIMEOUT_MS = 180_000;
const SANDBOX_BUNDLE_PATH = "/tmp/melee-claim-seed.bundle";

const defaultRunner: ProvisionCommandRunner = async (cwd, command, options) => runCommand(cwd, command, options);
const outputTail = (text: string, maxChars = 2000) => text.length <= maxChars ? text : text.slice(-maxChars);

function excludedToolpackPath(path: string): boolean {
  const normalized = path.split(posix.sep).join("/");
  const segments = normalized.split("/");
  return normalized === "_impl/gamecube/mwcc_debug"
    || normalized.startsWith("_impl/gamecube/mwcc_debug/")
    || normalized === "_impl/gamecube/sandbox-image"
    || normalized.startsWith("_impl/gamecube/sandbox-image/")
    || segments.includes("tests")
    || segments.includes("__pycache__")
    || normalized.endsWith(".pyc");
}

async function payloadFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await payloadFiles(root, path));
    else if (entry.isFile()) files.push(`./${relative(root, path).split(posix.sep).join("/")}`);
  }
  return files;
}

async function toolpackContentStamp(payloadRoot: string): Promise<string> {
  const files = (await payloadFiles(payloadRoot)).filter((file) => file !== "./.ready");
  files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  let listing = "";
  for (const file of files) {
    const digest = createHash("sha256").update(await readFile(resolve(payloadRoot, file.slice(2)))).digest("hex");
    listing += `${digest}  ${file}\n`;
  }
  return createHash("sha256").update(listing).digest("hex");
}

async function checkedToolpackExec(sandbox: SandboxHandle, command: string[], label: string): Promise<void> {
  const result = await sandbox.exec(command, { timeoutMs: TOOLPACK_SETUP_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
  }
}

export async function ensureSandboxToolpack(
  sandbox: SandboxHandle,
  params: { hostToolpackRoot: string; toolpackId: string },
): Promise<void> {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "sandbox-toolpack-"));
  try {
    const payloadRoot = resolve(tempRoot, "payload");
    const payloadToolpackRoot = resolve(payloadRoot, "toolpacks", params.toolpackId);
    await cp(params.hostToolpackRoot, payloadToolpackRoot, {
      recursive: true,
      filter: (source) => {
        const path = relative(params.hostToolpackRoot, source).split(posix.sep).join("/");
        return path === "" || !excludedToolpackPath(path);
      },
    });
    const stamp = await toolpackContentStamp(payloadToolpackRoot);
    const remoteToolpackRoot = `/opt/toolpacks/${params.toolpackId}`;
    const readyPath = `${remoteToolpackRoot}/.ready`;
    try {
      if ((await sandbox.readFile(readyPath)).trim() === stamp) return;
    } catch {}

    const tarPath = resolve(tempRoot, `toolpack-${params.toolpackId}.tar`);
    const tarResult = await runCommand(payloadRoot, [
      "tar",
      "-cf",
      tarPath,
      `--exclude=toolpacks/${params.toolpackId}/_impl/gamecube/mwcc_debug`,
      `--exclude=toolpacks/${params.toolpackId}/_impl/gamecube/sandbox-image`,
      "--exclude=*/tests",
      "--exclude=*/tests/*",
      "--exclude=*/__pycache__",
      "--exclude=*/__pycache__/*",
      "--exclude=*.pyc",
      "toolpacks",
    ], {
      timeoutMs: TOOLPACK_SETUP_TIMEOUT_MS,
    });
    if (tarResult.exitCode !== 0) {
      throw new Error(`sandbox toolpack archive creation failed (${tarResult.exitCode}): ${outputTail(tarResult.stderr || tarResult.stdout)}`);
    }
    const remoteTarPath = `/tmp/toolpack-${params.toolpackId}.tar`;
    await sandbox.uploadFile(tarPath, remoteTarPath);
    await checkedToolpackExec(
      sandbox,
      [
        "bash",
        "-lc",
        'rm -rf "$1" && mkdir -p /opt/toolpacks && tar -xf "$2" -C /opt',
        "--",
        remoteToolpackRoot,
        remoteTarPath,
      ],
      "sandbox toolpack extraction",
    );
    await sandbox.writeFile(readyPath, `${stamp}\n`);
    await checkedToolpackExec(
      sandbox,
      ["bash", "-lc", 'rm -f "$1"', "--", remoteTarPath],
      "sandbox toolpack archive cleanup",
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export interface SandboxProvisionLabels extends Record<string, string> {
  game_id: string;
  run_id: string;
  claim_id: string;
  job_id: string;
  job_lease_id: string;
  dispatch_lease_id: string;
  worker_state_id: string;
  trace_id: string;
}

export interface ProvisionSandboxWorkspaceResult {
  sandboxId: string;
  workspaceRoot: string;
}

export type SandboxCreatedEventContext = Omit<
  SandboxCreatedEventInput,
  "sandboxId" | "snapshot" | "cpu" | "memoryGiB" | "diskGiB"
>;

async function checkedSandboxExec(
  sandbox: SandboxHandle,
  command: string[],
  workspaceRoot: string,
  label: string,
): Promise<void> {
  const result = await sandbox.exec(command, { cwd: workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
  }
}

export async function provisionSandboxWorkspace(params: {
  provider: SandboxProvider;
  sourceRepoRoot: string;
  baseRev: string;
  snapshotBakedRev: string;
  workspaceRoot: string;
  snapshot: string;
  resources: SandboxResourceClass;
  ttlSeconds: number;
  labels: SandboxProvisionLabels;
  reportArtifactSources: WorkerReportArtifactSource[];
  event: { store: StateStore; context: SandboxCreatedEventContext };
  commandRunner?: ProvisionCommandRunner;
}): Promise<ProvisionSandboxWorkspaceResult> {
  const runner = params.commandRunner ?? defaultRunner;
  let sandbox: SandboxHandle | undefined;
  try {
    sandbox = await params.provider.create({
      snapshot: params.snapshot,
      labels: { ...params.labels },
      resources: { ...params.resources },
      ttlMinutes: Math.ceil(params.ttlSeconds / 60) + 30,
    });
    emitSandboxCreatedEvent(params.event.store, {
      ...params.event.context,
      sandboxId: sandbox.sandboxId,
      snapshot: params.snapshot,
      cpu: params.resources.cpu,
      memoryGiB: params.resources.memoryGiB,
      diskGiB: params.resources.diskGiB,
    });
    if (params.snapshotBakedRev === params.baseRev) {
      await checkedSandboxExec(
        sandbox,
        ["git", "rev-parse", "--verify", `${params.baseRev}^{commit}`],
        params.workspaceRoot,
        "sandbox baked revision verification",
      );
    } else {
      const bundleDir = await mkdtemp(resolve(tmpdir(), "melee-sandbox-bundle-"));
      const bundlePath = resolve(bundleDir, "claim.bundle");
      const bundleRef = `refs/decomp-orchestrator/sandbox-seeds/${randomUUID()}`;
      let bundleRefCreated = false;
      let seedError: unknown;
      try {
        const advertise = await runner(
          params.sourceRepoRoot,
          ["git", "update-ref", bundleRef, params.baseRev],
          { timeoutMs: SETUP_TIMEOUT_MS },
        );
        if (advertise.exitCode !== 0) {
          throw new Error(`sandbox git bundle ref creation failed (${advertise.exitCode}): ${outputTail(advertise.stderr || advertise.stdout)}`);
        }
        bundleRefCreated = true;
        const bundle = await runner(
          params.sourceRepoRoot,
          ["git", "bundle", "create", bundlePath, `${params.snapshotBakedRev}..${params.baseRev}`, bundleRef],
          { timeoutMs: SETUP_TIMEOUT_MS },
        );
        if (bundle.exitCode !== 0) {
          throw new Error(`sandbox git bundle creation failed (${bundle.exitCode}): ${outputTail(bundle.stderr || bundle.stdout)}`);
        }
        await sandbox.uploadFile(bundlePath, SANDBOX_BUNDLE_PATH);
      } catch (error) {
        seedError = error;
        throw error;
      } finally {
        let refCleanupError: Error | undefined;
        if (bundleRefCreated) {
          try {
            const cleanup = await runner(
              params.sourceRepoRoot,
              ["git", "update-ref", "-d", bundleRef],
              { timeoutMs: SETUP_TIMEOUT_MS },
            );
            if (cleanup.exitCode !== 0) {
              refCleanupError = new Error(`sandbox git bundle ref cleanup failed (${cleanup.exitCode}): ${outputTail(cleanup.stderr || cleanup.stdout)}`);
            }
          } catch (error) {
            refCleanupError = error instanceof Error ? error : new Error(String(error));
          }
        }
        await rm(bundleDir, { recursive: true, force: true });
        if (!seedError && refCleanupError) throw refCleanupError;
      }
      await checkedSandboxExec(
        sandbox,
        ["git", "bundle", "verify", SANDBOX_BUNDLE_PATH],
        params.workspaceRoot,
        "sandbox git bundle verification",
      );
      await checkedSandboxExec(
        sandbox,
        ["git", "fetch", SANDBOX_BUNDLE_PATH, params.baseRev],
        params.workspaceRoot,
        "sandbox git bundle fetch",
      );
    }

    // Baked workspaces may carry dirty tracked files; the claim's identity is baseRev.
    await checkedSandboxExec(
      sandbox,
      ["git", "checkout", "--force", "--detach", params.baseRev],
      params.workspaceRoot,
      "sandbox detached checkout",
    );
    const toolpackId = defaultToolpackId();
    await ensureSandboxToolpack(sandbox, {
      hostToolpackRoot: toolpackRoot(toolpackId),
      toolpackId,
    });
    for (const source of params.reportArtifactSources) {
      await sandbox.uploadFile(source.sourcePath, posix.resolve(params.workspaceRoot, source.relativePath));
    }
    await checkedSandboxExec(
      sandbox,
      [
        "/bin/sh",
        "-c",
        "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk",
      ],
      params.workspaceRoot,
      "sandbox canonical tool verification",
    );
    return { sandboxId: sandbox.sandboxId, workspaceRoot: params.workspaceRoot };
  } catch (error) {
    if (sandbox) {
      let deleted = false;
      try {
        await params.provider.delete(sandbox.sandboxId, "provision_failure");
        deleted = true;
      } catch {}
      if (deleted) {
        const eventContext = params.event.context;
        try {
          emitSandboxDeletedEvent(params.event.store, {
            gameId: eventContext.gameId,
            sandboxId: sandbox.sandboxId,
            correlationId: eventContext.correlationId,
            causationId: eventContext.causationId,
            traceId: eventContext.traceId,
            actor: eventContext.actor,
            occurredAt: eventContext.occurredAt,
            parentSpanId: eventContext.parentSpanId,
            reason: "provision_failure",
            jobId: eventContext.jobId,
            claimId: eventContext.claimId,
          });
        } catch {}
      }
    }
    throw error;
  }
}
