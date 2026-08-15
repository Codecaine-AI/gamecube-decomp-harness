import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

type RootPackage = {
  scripts?: Record<string, string>;
  workspaces?: string[];
};

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
const vendoredFrameworkRoot = join(repoRoot, "packages", "docs-framework");
const docsCliPath = "../Core/docs-system/packages/docs-cli/src/index.ts";
const liveDocsCli = join(repoRoot, docsCliPath);

function repoRelative(path: string): string {
  const rel = relative(repoRoot, path);
  return rel.split(sep).join("/") || ".";
}

function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function collectDocsSystemSourceImports(): string[] {
  const failures: string[] = [];
  const importPattern =
    /(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']*(?:docs-system\/packages\/|packages\/docs-framework\/|@codecaine-ai\/docs-(?:cli|index|kernel|model|server|viewer|workbench))[^"']*)["']/g;

  function walk(path: string): void {
    if (!existsSync(path) || path === selfPath) return;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      const name = path.slice(path.lastIndexOf(sep) + 1);
      if (name === "node_modules" || name === ".git" || name === "dist") return;
      for (const entry of readdirSync(path)) walk(join(path, entry));
      return;
    }
    if (!stat.isFile() || !/\.(?:ts|tsx|mts|cts)$/.test(path)) return;

    const text = readFileSync(path, "utf8");
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(text))) {
      failures.push(`${repoRelative(path)} imports docs-system internals via ${match[1]}`);
    }
  }

  walk(join(repoRoot, "apps"));
  return failures;
}

describe("docs-system package boundaries", () => {
  test("uses the live sibling docs CLI without vendoring docs-system source", () => {
    expect(entryExists(vendoredFrameworkRoot)).toBe(false);
    expect(existsSync(liveDocsCli)).toBe(true);

    const gitmodulesPath = join(repoRoot, ".gitmodules");
    if (existsSync(gitmodulesPath)) {
      expect(readFileSync(gitmodulesPath, "utf8")).not.toContain("packages/docs-framework");
    }

    const rootPackage = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as RootPackage;
    expect(rootPackage.workspaces).not.toContain("packages/*");
    expect(rootPackage.scripts?.docs).toContain(`bun ${docsCliPath} serve`);
    expect(rootPackage.scripts?.["docs:audit"]).toContain(`bun ${docsCliPath} audit`);
    expect(rootPackage.scripts?.["docs:links"]).toContain(`bun ${docsCliPath} links check`);
    expect(rootPackage.scripts?.["docs:check"]).toBe("bun run docs:audit && bun run docs:links");
    expect(rootPackage.scripts?.check).toStartWith("bun run docs:check && ");
  });

  test("keeps harness source behind the docs CLI boundary", () => {
    expect(collectDocsSystemSourceImports()).toEqual([]);
  });
});
