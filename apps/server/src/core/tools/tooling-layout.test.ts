import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const selfPath = fileURLToPath(import.meta.url);

const retiredVendoredPaths = ["packages/agent-kernel", "packages/docs-framework"];

const retiredPaths = [
  "apps/server/resources",
  "apps/server/src/core/tools/agent-tools",
  "games/melee/knowledge/tools",
  "toolpacks/gamecube-decomp/_impl/melee",
];

const retiredStrings = [
  "@server/core/tools/agent-tools",
  "@server/core/tools/tool-runtime",
  "apps/server/src/core/tools/agent-tools",
  "apps/server/src/core/tools/tool-runtime",
  "src/core/tools/tool-runtime",
  "ORCH_LEGACY_PROJECT_TOOL_DATA_ROOT",
  "legacyProjectToolDataRoot",
  "legacy_project_tool_data_root",
  "looks_like_melee_root",
  "melee_tooling",
];

const scanRoots = ["package.json", "apps", "docs", "games/README.md", "games/melee/game.json", "toolpacks"];
const textExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const exactTextFiles = new Set(["Makefile", "package.json", "tsconfig.json"]);

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

function extension(path: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash ? path.slice(dot) : "";
}

function shouldSkipDirectory(path: string): boolean {
  const rel = repoRelative(path);
  if (retiredPaths.some((retiredPath) => rel === retiredPath || rel.startsWith(`${retiredPath}/`))) return true;
  const parts = rel.split("/");
  if (parts.includes(".git") || parts.includes("node_modules") || parts.includes("dist") || parts.includes("__pycache__")) return true;
  if (parts[0] === "objectives") return true;
  if (parts[0] === "games" && (parts.includes("checkout") || parts.includes("worktrees") || parts.includes("state"))) return true;
  if (parts[0] === "games" && (parts.includes("graph") || parts.includes("knowledge") || parts.includes("shared"))) return true;
  return false;
}

function isTextFile(path: string): boolean {
  const rel = repoRelative(path);
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return exactTextFiles.has(name) || textExtensions.has(extension(rel));
}

function collectRetiredToolingReferences(): string[] {
  const failures: string[] = [];

  function walk(path: string): void {
    if (!existsSync(path) || path === selfPath) return;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      if (shouldSkipDirectory(path)) return;
      for (const entry of readdirSync(path)) walk(join(path, entry));
      return;
    }
    if (!stat.isFile() || !isTextFile(path)) return;

    const text = readFileSync(path, "utf8");
    const hasRetiredPath = retiredPaths.some((retiredPath) => text.includes(retiredPath));
    const hasRetiredString = retiredStrings.some((retiredString) => text.includes(retiredString));
    if (!hasRetiredPath && !hasRetiredString) return;

    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (
        retiredPaths.some((retiredPath) => line.includes(retiredPath)) ||
        retiredStrings.some((retiredString) => line.includes(retiredString))
      ) {
        failures.push(`${repoRelative(path)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  for (const retiredPath of retiredPaths) {
    const retiredRoot = join(repoRoot, ...retiredPath.split("/"));
    if (existsSync(retiredRoot)) {
      failures.push(`${retiredPath} must not exist; resources live in games, toolpacks, or server source modules.`);
    }
  }

  for (const root of scanRoots) walk(join(repoRoot, root));
  return failures;
}

describe("tooling layout", () => {
  test("does not restore retired vendored package roots", () => {
    for (const retiredPath of retiredVendoredPaths) {
      expect(entryExists(join(repoRoot, ...retiredPath.split("/")))).toBe(false);
    }
  });

  test("keeps retired root scripts out of the repo contract", () => {
    expect(existsSync(join(repoRoot, "scripts"))).toBe(false);
  });

  test("does not reference retired game tooling paths", () => {
    expect(collectRetiredToolingReferences()).toEqual([]);
  });
});
