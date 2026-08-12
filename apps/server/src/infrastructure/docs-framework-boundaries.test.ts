import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type RootPackage = {
  scripts?: Record<string, string>;
  workspaces?: string[];
};

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const frameworkRoot = join(repoRoot, "packages", "docs-framework");
const frameworkSkill = join(frameworkRoot, "packages", "framework");
const projectSkill = join(repoRoot, ".codex", "skills", "docs-framework");

describe("docs-framework package boundaries", () => {
  test("keeps one pinned package source and exposes its maintained skill", () => {
    const gitmodules = readFileSync(join(repoRoot, ".gitmodules"), "utf8");
    expect(gitmodules).toContain('[submodule "packages/docs-framework"]');
    expect(gitmodules).toContain("path = packages/docs-framework");

    expect(existsSync(join(frameworkRoot, "packages", "docs-cli", "src", "index.ts"))).toBe(true);
    expect(existsSync(join(frameworkSkill, "SKILL.md"))).toBe(true);
    expect(lstatSync(projectSkill).isSymbolicLink()).toBe(true);
    expect(realpathSync(projectSkill)).toBe(realpathSync(frameworkSkill));

    const rootPackage = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as RootPackage;
    expect(rootPackage.workspaces).not.toContain("packages/*");
    expect(rootPackage.scripts?.docs).toContain(
      "packages/docs-framework/packages/docs-cli/src/index.ts",
    );
    expect(rootPackage.scripts?.["docs:check"]).toBe("bun run docs:audit && bun run docs:links");
    expect(rootPackage.scripts?.check).toStartWith("bun run docs:check && ");
  });
});
