import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// One Pi copy per process: ModelRegistry has private fields, so a second physical
// copy is nominally incompatible with the kernel's. Harness code loads Pi only
// through the kernel's `@agent-kernel/kernel/pi-sdk` re-export.

const repoRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
const installedKernelRoot = join(repoRoot, "node_modules", "@agent-kernel", "kernel");
const policyRoots = ["apps", "toolpacks"];
const sourceFile = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const piSpecifier = /["'`](@earendil-works\/[^"'`\s]*)["'`]/g;

function walkSources(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSources(path, results);
    else if (entry.isFile() && sourceFile.test(entry.name) && path !== selfPath) results.push(path);
  }
  return results;
}

describe("Pi single copy", () => {
  test("harness sources name no @earendil-works specifier", () => {
    const offenders: string[] = [];
    for (const root of policyRoots) {
      for (const file of walkSources(join(repoRoot, root))) {
        for (const match of readFileSync(file, "utf8").matchAll(piSpecifier)) {
          offenders.push(`${relative(repoRoot, file)}: ${match[1]} (use @agent-kernel/kernel/pi-sdk)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("@agent-kernel/kernel/pi-sdk resolves into the live kernel checkout", () => {
    const piSdk = realpathSync(Bun.resolveSync("@agent-kernel/kernel/pi-sdk", import.meta.dir));
    expect(piSdk).toContain("/codecaine/core/agent-kernel/");
  });

  test("the kernel loads Pi from the codecaine/core workspace, and pi-sdk is that copy", async () => {
    const kernelDir = realpathSync(installedKernelRoot);
    const kernelPi = realpathSync(Bun.resolveSync("@earendil-works/pi-coding-agent", kernelDir));
    expect(kernelPi).toContain("/codecaine/core/node_modules/");

    const viaSdk = await import("@agent-kernel/kernel/pi-sdk");
    const direct = await import(kernelPi);
    expect(viaSdk.ModelRegistry).toBe(direct.ModelRegistry);
    expect(viaSdk.createAgentSession).toBe(direct.createAgentSession);
  });
});
