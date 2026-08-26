import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { runMeleeTranscriptBackfill } from "./bridge/transcript-backfill.js";

type PackageJson = {
  name?: string;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  exports?: Record<string, string> | string;
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};

const repoRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
const vendoredKernelRoot = join(repoRoot, "packages", "agent-kernel");
const coreRoot = join(repoRoot, "..", "Core");
const chosenKernelRoot = join(coreRoot, "agent-kernel");
const installedKernelRoot = fileURLToPath(new URL("../../../../../node_modules/@agent-kernel/kernel", import.meta.url));
const docsKernelRoot = join(repoRoot, "ai_docs", "agent-kernel");

const expectedKernelPackages = [
  "@agent-kernel/db",
  "@agent-kernel/kernel",
  "@agent-kernel/protocol",
  "@agent-kernel/viewer-core",
  "@agent-kernel/viewer-shell",
  "@agent-kernel/viewer-ui",
] as const;

const expectedLinkedDependencies = {
  "apps/server/package.json": {
    "@agent-kernel/db": "link:@agent-kernel/db",
    "@agent-kernel/kernel": "link:@agent-kernel/kernel",
    "@agent-kernel/protocol": "link:@agent-kernel/protocol",
    "@agent-kernel/viewer-core": "link:@agent-kernel/viewer-core",
    "@codecaine-ai/prompt-kit": "link:@codecaine-ai/prompt-kit",
  },
  "apps/frontend/package.json": {
    "@agent-kernel/viewer-core": "link:@agent-kernel/viewer-core",
    "@agent-kernel/viewer-shell": "link:@agent-kernel/viewer-shell",
    "@agent-kernel/viewer-ui": "link:@agent-kernel/viewer-ui",
    "@codecaine-ai/prompt-kit": "link:@codecaine-ai/prompt-kit",
  },
} as const;

function repoRelative(path: string): string {
  const rel = relative(repoRoot, path);
  return rel || ".";
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isIgnoredDir(path: string): boolean {
  const rel = repoRelative(path);
  const parts = rel.split(sep);
  if (parts.includes("node_modules") || parts.includes(".git") || parts.includes("dist")) return true;
  if (parts.includes("references") && parts.includes("gc-decomp-harness")) return true;
  if (parts[0] === "games" && parts.includes("checkout")) return true;
  if (parts[0] === ".decomp-orchestrator-state" || parts[0] === ".pi-sessions" || parts[0] === ".pi-agent") return true;
  return false;
}

function walkSourceFiles(start: string, results: string[] = [], seenRealDirs = new Set<string>()): string[] {
  if (!existsSync(start) || isIgnoredDir(start) || start === selfPath) return results;

  const lst = lstatSync(start);
  if (lst.isSymbolicLink()) {
    const followed = statSync(start);
    if (followed.isFile()) {
      if (/\.(?:ts|tsx|mts|cts)$/.test(start)) results.push(start);
      return results;
    }
    if (!followed.isDirectory()) return results;
    const real = realpathSync(start);
    if (seenRealDirs.has(real)) return results;
    seenRealDirs.add(real);
    for (const entry of readdirSync(start)) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      walkSourceFiles(join(start, entry), results, seenRealDirs);
    }
    return results;
  }

  if (lst.isFile()) {
    if (/\.(?:ts|tsx|mts|cts)$/.test(start)) results.push(start);
    return results;
  }

  if (!lst.isDirectory()) return results;
  const real = realpathSync(start);
  if (seenRealDirs.has(real)) return results;
  seenRealDirs.add(real);
  for (const entry of readdirSync(start)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    walkSourceFiles(join(start, entry), results, seenRealDirs);
  }
  return results;
}

function exportedSpecifiers(packageJsonPath: string): Set<string> {
  const pkg = readJson(packageJsonPath);
  const specifiers = new Set<string>();
  if (!pkg.name?.startsWith("@agent-kernel/")) return specifiers;

  if (!pkg.exports || typeof pkg.exports === "string") {
    specifiers.add(pkg.name);
    return specifiers;
  }

  for (const key of Object.keys(pkg.exports)) {
    if (key === ".") {
      specifiers.add(pkg.name);
    } else if (key.startsWith("./")) {
      specifiers.add(`${pkg.name}/${key.slice(2)}`);
    }
  }
  return specifiers;
}

function collectBoundaryFailures(): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  const assert = (condition: unknown, message: string) => {
    if (!condition) fail(message);
  };

  const rootPackage = readJson(join(repoRoot, "package.json"));
  assert(
    !rootPackage.workspaces?.some(
      (workspace) => workspace.startsWith("packages/agent-kernel") || workspace.startsWith("ai_docs/agent-kernel"),
    ),
    "the standalone harness must not make agent-kernel a nested workspace source",
  );

  const corePackage = readJson(join(coreRoot, "package.json"));
  assert(
    !corePackage.workspaces?.some((workspace) => workspace.includes("gamecube-decomp-harness")),
    "the standalone harness must not become a Core workspace member",
  );

  for (const tsconfigPath of ["tsconfig.base.json", "apps/frontend/tsconfig.json", "apps/server/tsconfig.json"]) {
    const absolutePath = join(repoRoot, tsconfigPath);
    if (!existsSync(absolutePath)) continue;
    const paths = readJson(absolutePath).compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries(paths)) {
      if (!alias.startsWith("@agent-kernel/")) continue;
      for (const target of targets) {
        const normalizedTarget = target.split("\\").join("/");
        assert(
          normalizedTarget.includes("Core/agent-kernel/packages/") &&
            !normalizedTarget.includes("packages/agent-kernel/packages/"),
          `${tsconfigPath} must resolve ${alias} through linked node_modules or ../Core/agent-kernel, got ${target}`,
        );
      }
    }
  }

  assert(!entryExists(vendoredKernelRoot), "vendored packages/agent-kernel must not exist, including as a symlink");
  assert(existsSync(chosenKernelRoot), "the live sibling ../Core/agent-kernel must exist");
  assert(existsSync(join(chosenKernelRoot, "packages")), "the live sibling ../Core/agent-kernel/packages must exist");

  const chosenRealRoot = existsSync(chosenKernelRoot) ? realpathSync(chosenKernelRoot) : "";
  assert(entryExists(installedKernelRoot), "node_modules/@agent-kernel/kernel must be installed");
  if (entryExists(installedKernelRoot) && chosenRealRoot) {
    assert(lstatSync(installedKernelRoot).isSymbolicLink(), "node_modules/@agent-kernel/kernel must be a symlink");
    assert(
      realpathSync(installedKernelRoot).startsWith(`${chosenRealRoot}${sep}`),
      "node_modules/@agent-kernel/kernel must resolve inside ../Core/agent-kernel",
    );
  }
  assert(existsSync(docsKernelRoot), "ai_docs/agent-kernel must resolve to the live sibling");
  if (existsSync(docsKernelRoot) && chosenRealRoot) {
    assert(lstatSync(docsKernelRoot).isSymbolicLink(), "ai_docs/agent-kernel must remain a reference symlink");
    assert(
      realpathSync(docsKernelRoot) === chosenRealRoot,
      "ai_docs/agent-kernel must point to the live sibling ../Core/agent-kernel",
    );
  }

  const chosenPackageDirs = new Map<string, string>();
  const packageRoot = join(chosenKernelRoot, "packages");

  for (const entry of existsSync(packageRoot) ? readdirSync(packageRoot) : []) {
    const manifest = join(packageRoot, entry, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = readJson(manifest);
    const packageName = pkg.name;
    if (!packageName || !expectedKernelPackages.includes(packageName as (typeof expectedKernelPackages)[number])) continue;
    const realDir = realpathSync(dirname(manifest));
    if (chosenRealRoot && !realDir.startsWith(`${chosenRealRoot}${sep}packages${sep}`)) {
      fail(`${packageName} is outside the chosen kernel source: ${repoRelative(manifest)} -> ${realDir}`);
      continue;
    }
    chosenPackageDirs.set(packageName, dirname(manifest));
  }

  for (const packageName of expectedKernelPackages) {
    assert(chosenPackageDirs.has(packageName), `${packageName} must be present under ../Core/agent-kernel/packages`);
  }

  for (const [manifestPath, expectedDependencies] of Object.entries(expectedLinkedDependencies)) {
    const appPackage = readJson(join(repoRoot, manifestPath));
    for (const [packageName, expectedLink] of Object.entries(expectedDependencies)) {
      assert(
        appPackage.dependencies?.[packageName] === expectedLink,
        `${manifestPath} must declare ${packageName} as ${expectedLink}`,
      );
    }
  }

  const harnessNeedles = ["@decomp-orchestrator/", "gamecube-decomp-harness", "apps/frontend", "apps/server"];
  for (const file of walkSourceFiles(join(chosenKernelRoot, "packages"))) {
    const text = readFileSync(file, "utf8");
    for (const needle of harnessNeedles) {
      if (text.includes(needle)) fail(`kernel source must not import or reference harness path ${needle}: ${repoRelative(file)}`);
    }
  }

  const allowedSpecifiers = new Set<string>();
  for (const manifestPath of chosenPackageDirs.values()) {
    for (const specifier of exportedSpecifiers(join(manifestPath, "package.json"))) {
      allowedSpecifiers.add(specifier);
    }
  }
  assert(
    allowedSpecifiers.has("@agent-kernel/kernel/transcript-recovery"),
    "the live kernel must export @agent-kernel/kernel/transcript-recovery",
  );

  const importPattern = /(?:from\s+|import\s*\(|require\s*\()\s*["'](@agent-kernel\/[^"']+)["']/g;
  const directPathImportPattern =
    /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*(?:ai_docs\/agent-kernel|vendor\/agent-kernel\/packages\/|packages\/agent-kernel\/packages\/|agent-kernel\/packages\/)[^"']*["']/;
  const appRoots = ["apps", "tests"].map((root) => join(repoRoot, root));
  const observedSpecifiers = new Set<string>();

  for (const root of appRoots) {
    for (const file of walkSourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      if (directPathImportPattern.test(text)) {
        fail(`app code must use @agent-kernel/* package exports instead of direct kernel paths: ${repoRelative(file)}`);
      }

      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(text))) {
        const specifier = match[1];
        observedSpecifiers.add(specifier);
        assert(specifier !== "@agent-kernel/tailer", `removed import @agent-kernel/tailer in ${repoRelative(file)}`);
        assert(allowedSpecifiers.has(specifier), `unknown or unexported @agent-kernel import ${specifier} in ${repoRelative(file)}`);
      }
    }
  }

  assert(
    observedSpecifiers.has("@agent-kernel/kernel/transcript-recovery"),
    "the bridge must use the compatible live @agent-kernel/kernel/transcript-recovery boundary",
  );

  return failures;
}

describe("agent-kernel package boundaries", () => {
  test("exports the Melee transcript backfill stub", () => expect(runMeleeTranscriptBackfill).toBeFunction());

  test("keeps the harness on package exports and the kernel source isolated", () => {
    expect(collectBoundaryFailures()).toEqual([]);
  });
});
