import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureBuildFixerPatch } from "./build-fixer.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString();
}

describe("captureBuildFixerPatch", () => {
  test("preserves a hunk ending in blank context and round-trips through git apply --check", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-fixer-patch-"));
    cleanup.push(root);
    const repo = join(root, "repo");
    const patchPath = join(root, "artifacts", "boundary-build-fixer.patch");
    mkdirSync(repo);
    git(repo, ["init", "-b", "main"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    writeFileSync(join(repo, "sample.c"), "#include <a.h>\n#include <b.h>\n\n\n");
    git(repo, ["add", "sample.c"]);
    git(repo, ["commit", "-m", "initial"]);

    writeFileSync(join(repo, "sample.c"), "#include <a.h>\n#include <fixed.h>\n#include <b.h>\n\n\n");
    const result = await captureBuildFixerPatch({ worktreeDir: repo, patchPath });
    const patch = readFileSync(patchPath);

    expect(result.hunkCount).toBe(1);
    expect(result.patchSize).toBe(patch.byteLength);
    expect(patch.subarray(-2)).toEqual(Buffer.from(" \n"));

    git(repo, ["checkout", "--", "sample.c"]);
    git(repo, ["apply", "--check", patchPath]);
  });
});
