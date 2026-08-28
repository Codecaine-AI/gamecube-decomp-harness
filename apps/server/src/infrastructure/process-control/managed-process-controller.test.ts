import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedProcessController } from "./managed-process-controller.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ManagedProcessController", () => {
  test("matches only a live process carrying the requested lease argv", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "managed-process-controller-"));
    tempDirs.push(stateDir);
    const controller = createManagedProcessController({
      gameToSummary: (game) => ({ ...game }),
      mirrorProcessState: () => {},
      packageRoot: stateDir,
    });
    const managed = controller.spawn({
      command: ["bun", "-e", "setInterval(() => {}, 1000)", "--lease-id", "lease-live"],
      game: null,
      name: "test-run-loop",
      stateDir,
    });

    try {
      expect(controller.hasActiveLeaseProcess(stateDir, "lease-live").active).toBeTrue();
      expect(controller.hasActiveLeaseProcess(stateDir, "lease-other").active).toBeFalse();
    } finally {
      process.kill(-managed.pid, "SIGTERM");
      await new Promise<void>((resolveExit) => managed.child.once("exit", () => resolveExit()));
    }
  });

  test("writes detached process stdout and stderr to durable state files", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "managed-process-controller-"));
    tempDirs.push(stateDir);
    const controller = createManagedProcessController({
      gameToSummary: (game) => ({ ...game }),
      mirrorProcessState: () => {},
      packageRoot: stateDir,
    });

    const process = controller.spawn({
      command: ["bun", "-e", "console.log('durable stdout'); console.error('durable stderr')"],
      game: null,
      name: "test-run-loop",
      stateDir,
    });
    await new Promise<void>((resolveExit) => process.child.once("exit", () => resolveExit()));

    expect(existsSync(process.stdoutPath)).toBeTrue();
    expect(existsSync(process.stderrPath)).toBeTrue();
    expect(readFileSync(process.stdoutPath, "utf8")).toContain("durable stdout");
    expect(readFileSync(process.stderrPath, "utf8")).toContain("durable stderr");
    expect(controller.status({ freshRunActive: false, operation: null, game: null, gameSyncActive: false, stateDir })).toMatchObject({
      stdoutPath: process.stdoutPath,
      stderrPath: process.stderrPath,
    });
  });
});
