import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SERVER_DIR = resolve(import.meta.dir, "../../../..");
const BAML_SRC = join(SERVER_DIR, "baml_src");
const GENERATED = join(SERVER_DIR, "src/generated/baml_client");
const PINNED = "0.226.2";

const tempDirs: string[] = [];
// Imported dynamically: a static import of the generated client stalls bun:test (see node-kernel.ts).
let generatedVersion: string;
let inlinedGenerators: string;

beforeAll(async () => {
  generatedVersion = (await import("@server/generated/baml_client")).version;
  inlinedGenerators = (await import("@server/generated/baml_client/inlinedbaml")).getBamlFiles()["generators.baml"] ?? "";
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function bamlPackageDir(): string {
  return dirname(Bun.resolveSync("@boundaryml/baml", SERVER_DIR));
}

function generatorVersion(source: string): string | undefined {
  return /^\s*version\s+"([^"]+)"/m.exec(source)?.[1];
}

describe("generated BAML client", () => {
  test("generated BAML client is fresh", () => {
    // Same relative layout as apps/server, so output_dir "../src/generated" lands inside the temp dir.
    const root = mkdtempSync(join(tmpdir(), "mn-baml-fresh-"));
    tempDirs.push(root);
    const src = join(root, "apps/server/baml_src");
    cpSync(BAML_SRC, src, { recursive: true });

    const result = Bun.spawnSync(
      [process.execPath, "--bun", join(bamlPackageDir(), "cli.js"), "generate", "--from", src],
      { cwd: SERVER_DIR, stdout: "pipe", stderr: "pipe", env: { ...process.env, BAML_LOG: "error" } },
    );
    expect(result.exitCode, result.stderr.toString()).toBe(0);

    const fresh = join(root, "apps/server/src/generated/baml_client");
    const committedFiles = readdirSync(GENERATED).sort();
    expect(readdirSync(fresh).sort()).toEqual(committedFiles);
    for (const file of committedFiles) {
      const committed = readFileSync(join(GENERATED, file), "utf8");
      const regenerated = readFileSync(join(fresh, file), "utf8");
      expect(regenerated === committed, `${file} is stale: run \`bun run baml:generate\` in apps/server`).toBe(true);
    }
  });

  test("BAML versions agree at 0.226.2", () => {
    const serverPackage = JSON.parse(readFileSync(join(SERVER_DIR, "package.json"), "utf8"));
    const installedPackage = JSON.parse(readFileSync(join(bamlPackageDir(), "package.json"), "utf8"));

    expect(serverPackage.dependencies["@boundaryml/baml"]).toBe(PINNED);
    expect(installedPackage.version).toBe(PINNED);
    expect(generatorVersion(readFileSync(join(BAML_SRC, "generators.baml"), "utf8"))).toBe(PINNED);
    expect(generatorVersion(inlinedGenerators)).toBe(PINNED);
    expect(generatedVersion).toBe(PINNED);
  });
});
