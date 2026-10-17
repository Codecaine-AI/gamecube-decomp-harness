import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import type { AgentToolRuntimeContext } from "../types.js";
import { maxToolOutputCharacters } from "../runtime/results.js";
import { realCodeEvidenceToolRegistration } from "./capabilities.js";

// real_code_evidence command compiler: file:line hits in the pinned MWCC source.
const PIN = "92f893fbcbb23d9833be5fc24ac9e069090f8729";
const SANDBOX_REPO = "/sandbox/workspace";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, path: string, text: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/** A host checkout and a state dir holding the host compiler ref (fetch_mwcc_ref.sh layout). */
function context(options: { withRef?: boolean } = {}): AgentToolRuntimeContext {
  const base = mkdtempSync(join(tmpdir(), "real-code-evidence-compiler-"));
  tempDirs.push(base);
  const hostRepo = join(base, "host", "checkout");
  const stateDir = join(base, "state");
  write(hostRepo, "config/GMSJ01/symbols.txt", "");
  if (options.withRef !== false) {
    const ref = join(stateDir, "refs", "mwcc");
    write(ref, ".mwcc-ref", JSON.stringify({ repo: "https://github.com/rayanht/mwcc", commit: PIN, paths: ["src", "include"] }));
    write(ref, "src/backend/Coloring.c", "static void simplify(void) {\n    if (node->degree < MaxDegree) {\n        push(node);\n    }\n}\n");
    write(ref, "include/compiler/Coloring.h", "extern int MaxDegree;\n");
  }
  return {
    role: "worker",
    cwd: SANDBOX_REPO,
    repoRoot: SANDBOX_REPO,
    hostRepoRoot: hostRepo,
    stateDir,
    game: { gameId: "sms", repoRoot: SANDBOX_REPO, stateDir, descriptorPath: resolve(packageRoot(), "games/sms/game.json") },
    worktreeId: "claim-1",
    claimId: "claim-1",
  };
}

async function run(ctx: AgentToolRuntimeContext, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await realCodeEvidenceToolRegistration.create(ctx).execute("call-1", params);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

describe("real_code_evidence compiler", () => {
  test("advertises the command and its optional path/context parameters", () => {
    const tool = realCodeEvidenceToolRegistration.create(context({ withRef: false }));
    const properties = (tool.parameters as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(properties.command?.enum).toContain("compiler");
    expect(properties).toHaveProperty("path");
    expect(properties).toHaveProperty("context");
    expect(tool.description).toContain("MWCC compiler source");
  });

  test("returns file:line hits from the pinned host ref", async () => {
    const result = await run(context(), { command: "compiler", query: "MaxDegree", path: "Coloring.c", context: 1 });
    expect(result.exit_code).toBe(0);
    const parsed = result.parsed as Record<string, unknown>;
    expect(parsed).toMatchObject({ status: "ok", command: "compiler", origin: "host_ref", commit: PIN, pinned: true, total: 1 });
    const hits = parsed.hits as Array<{ file: string; line: number; text: string; context: string }>;
    expect(hits.map((hit) => `${hit.file}:${hit.line}`)).toEqual(["src/backend/Coloring.c:2"]);
    expect(hits[0]?.context.split("\n")).toHaveLength(3);
    expect(result.command as string[]).toEqual(expect.arrayContaining(["compiler", "--query", "MaxDegree", "--path", "Coloring.c", "--context", "1"]));
  });

  test("clamps context, rejects a missing query, and reports a missing ref as unavailable", async () => {
    expect(await run(context(), { command: "compiler" })).toMatchObject({ status: "missing_query" });
    const clamped = await run(context(), { command: "compiler", query: "MaxDegree", context: 99 });
    expect(clamped.command as string[]).toEqual(expect.arrayContaining(["--context", "8"]));
    const missing = await run(context({ withRef: false }), { command: "compiler", query: "MaxDegree" });
    const parsed = missing.parsed as Record<string, unknown>;
    // A host with an image copy at /opt/mwcc would answer from it instead.
    if (parsed.origin !== "sandbox") {
      expect(parsed.status).toBe("unavailable");
      expect(String(parsed.fetch_hint)).toContain("fetch_mwcc_ref.sh");
    }
  });

  test("a map-unit result past the output cap stays valid JSON with truncation counts", async () => {
    const ctx = context({ withRef: false });
    const rows = Array.from({ length: 600 }, (_, i) =>
      `  0000${i.toString(16).padStart(4, "0")} 000294 802f${i.toString(16).padStart(4, "0")}  4 longMemberFunctionName${i}__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor> \tEnemy.a hanasambo.cpp`);
    write(String(ctx.hostRepoRoot), "orig/GMSJ01/files/mario.MAP", ["Link map of __start", "", ".text section layout", ...rows, ""].join("\n"));
    const response = await realCodeEvidenceToolRegistration.create(ctx).execute("call-1", { command: "map-unit", unit: "hanasambo" });
    const text = (response.content[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(maxToolOutputCharacters);
    const result = JSON.parse(text) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
    const lists = (result.truncation as { lists: Record<string, { shown: number; total: number }> }).lists;
    expect(lists["parsed.functions"]?.total).toBe(400);
    expect((result.parsed as { functions: unknown[] }).functions.length).toBe(lists["parsed.functions"]?.shown);
  });
});
