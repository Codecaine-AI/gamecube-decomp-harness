import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "@server/infrastructure/shell";
import { captureModifiedHeaderSnapshot, revertModifiedHeadersSince } from "./qa-repair.js";

describe("QA repair authorized header preservation", () => {
  test("leaves authorized header edits intact and reverts only unauthorized headers", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "qa-repair-authorized-"));
    await mkdir(join(repoRoot, "include/melee"), { recursive: true });
    await writeFile(join(repoRoot, "include/melee/authorized.h"), "int authorized(void);\n");
    await writeFile(join(repoRoot, "include/melee/unauthorized.h"), "int unauthorized(void);\n");
    for (const command of [
      ["git", "init", "-q"],
      ["git", "add", "-A"],
      ["git", "-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-q", "-m", "base"],
    ]) {
      const result = await runCommand(repoRoot, command);
      if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed: ${result.stderr}`);
    }

    const before = await captureModifiedHeaderSnapshot(repoRoot);
    await writeFile(join(repoRoot, "include/melee/authorized.h"), "int authorized(int value);\n");
    await writeFile(join(repoRoot, "include/melee/unauthorized.h"), "int unauthorized(int value);\n");

    const result = await revertModifiedHeadersSince(repoRoot, before, ["include/melee/authorized.h"]);

    expect(result.authorizedPaths).toEqual(["include/melee/authorized.h"]);
    expect(result.changedPaths).toEqual(["include/melee/unauthorized.h"]);
    expect(result.revertedPaths).toEqual(["include/melee/unauthorized.h"]);
    expect(result.failedPaths).toEqual([]);
    expect(await readFile(join(repoRoot, "include/melee/authorized.h"), "utf8")).toBe("int authorized(int value);\n");
    expect(await readFile(join(repoRoot, "include/melee/unauthorized.h"), "utf8")).toBe("int unauthorized(void);\n");
  });
});
