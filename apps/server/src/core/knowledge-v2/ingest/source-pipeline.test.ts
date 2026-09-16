import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSourcePipeline, type SourceAdapter, type SourceDefinition } from "./source-pipeline.js";
import { runGameSourcePipeline } from "./game-sources.js";
import { sourceConfigPath } from "./source-config.js";
const roots: string[] = [];
const temp = () => { const root = mkdtempSync(join(tmpdir(), "source-pipeline-")); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const definition = (game = "other"): SourceDefinition => ({ identity: { game_id: game, source_id: "wiki", kind: "wiki", upstream: "https://example.org" }, configuration: { enabled: true, adapter: "fixture", adapter_version: "1", scope: {}, refresh: "explicit", required_stage: "search_index" } });
const capture = { manifest: "capture-1", content_hashes: { "page": "sha" }, revisions: ["r1"], cursor: { page: 1 } };
test("resumes acquisition cursor, retries failed import, never repeats complete stages", async () => {
  const root = temp(); let acquisitions = 0, imports = 0, indexes = 0;
  const adapter: SourceAdapter = {
    acquisition: async ctx => { acquisitions++; if (acquisitions === 1) { ctx.checkpoint(capture); throw new Error("connection closed"); } expect(ctx.capture).toEqual(capture); return { status: "complete", capture }; },
    import: async () => { imports++; if (imports === 1) throw new Error("database unavailable"); return { status: "complete" }; },
    search_index: async () => { indexes++; return { status: "complete" }; },
  };
  const input = { gameId: "other", stateRoot: root, operationId: "bootstrap-1", sources: [definition()], mode: "bootstrap" as const, adapters: { "fixture@1": adapter } };
  expect((await runSourcePipeline(input)).sources[0]!.readiness).toBe("blocked");
  expect((await runSourcePipeline(input)).sources[0]!.stages.import.status).toBe("failed");
  const ready = await runSourcePipeline(input); expect(ready.ready).toBe(true); expect(ready.sources[0]!.stages.curation.status).toBe("pending");
  await runSourcePipeline(input);
  expect([acquisitions, imports, indexes]).toEqual([2, 2, 1]);
  await runSourcePipeline({ ...input, mode: "sync", operationId: "epoch-1" });
  expect([acquisitions, imports, indexes]).toEqual([2, 2, 1]);
});
test("requires reasons, fails absent adapters, isolates game identities and state", async () => {
  const root = temp(); const source = definition();
  const input = { gameId: "other", stateRoot: root, operationId: "1", sources: [source], mode: "bootstrap" as const, adapters: {} };
  expect((await runSourcePipeline(input)).ready).toBe(false);
  await expect(runSourcePipeline({ ...input, gameId: "melee" })).rejects.toThrow("belongs to other");
  source.configuration.enabled = false;
  await expect(runSourcePipeline(input)).rejects.toThrow("requires a reason");
  source.configuration.reason = "No wiki for this game";
  expect((await runSourcePipeline(input)).ready).toBe(true);
  expect(() => sourceConfigPath(root, "../melee/knowledge")).toThrow("escapes");
});
test("local wiki bootstrap imports immutable capture and indexes without network", async () => {
  const root = temp(); const source = definition(); source.configuration.adapter = "local-mirror"; source.configuration.scope = { capture_root: "./mirror" };
  mkdirSync(join(root, "mirror/pages"), { recursive: true });
  writeFileSync(join(root, "game.json"), JSON.stringify({ id: "other", sources: [source] }));
  writeFileSync(join(root, "mirror/index.jsonl"), JSON.stringify({ title: "Fixture", path: "Fixture.txt", revid: 1 }) + "\n");
  writeFileSync(join(root, "mirror/pages/Fixture.txt"), "A local fixture.");
  const input = { gameId: "other", gameRoot: root, knowledgeRoot: join(root, "knowledge"), stateRoot: join(root, "state"), operationId: "initial", mode: "bootstrap" as const };
  const result = await runGameSourcePipeline(input); expect(result.ready).toBe(true);
  const manifest = result.sources[0]!.capture!.manifest;
  writeFileSync(join(root, "mirror/pages/Fixture.txt"), "Changed text");
  await runGameSourcePipeline(input);
  expect(readFileSync(join(root, "state/source-captures/other/wiki", manifest, "data/pages/Fixture.txt"), "utf8")).toBe("A local fixture.");
  const next = await runGameSourcePipeline({ ...input, operationId: "recapture" });
  expect(next.sources[0]!.capture!.manifest).not.toBe(manifest);
});
test("partial wiki mirror cannot pass import readiness", async () => {
  const root = temp(); const source = definition(); source.configuration.adapter = "local-mirror"; source.configuration.scope = { capture_root: "mirror" };
  mkdirSync(join(root, "mirror"));
  writeFileSync(join(root, "game.json"), JSON.stringify({ id: "other", sources: [source] }));
  writeFileSync(join(root, "mirror/index.jsonl"), JSON.stringify({ title: "Missing", path: "missing.txt", revid: 1 }));
  const result = await runGameSourcePipeline({ gameId: "other", gameRoot: root, knowledgeRoot: join(root, "knowledge"), stateRoot: join(root, "state"), operationId: "initial", mode: "bootstrap" });
  expect(result.ready).toBe(false); expect(result.sources[0]!.stages.import.reason).toContain("Missing wiki page");
});
test("optional curation unavailability does not block completed search readiness", async () => {
  const result = await runSourcePipeline({ gameId: "other", stateRoot: temp(), operationId: "1", mode: "bootstrap", sources: [definition()], runCuration: true,
    adapters: { "fixture@1": { acquisition: async () => ({ status: "complete", capture }), import: async () => ({ status: "complete" }), search_index: async () => ({ status: "complete" }) } } });
  expect(result.ready).toBe(true); expect(result.sources[0]!.stages.curation.status).toBe("unavailable");
});
test("lock recovery rejects live or changed owners and releases only a dead owner", async () => {
  const { recoverSourcePipelineLock } = await import("./source-pipeline.js");
  const root = temp(); const directory = join(root, "sources/other"); mkdirSync(directory, { recursive: true });
  const path = join(directory, ".lock");
  writeFileSync(path, JSON.stringify({ pid: process.pid, operationId: "1" }));
  expect(() => recoverSourcePipelineLock({ stateRoot: root, gameId: "other", expectedPid: process.pid, expectedOperationId: "2" })).toThrow("ownership changed");
  expect(() => recoverSourcePipelineLock({ stateRoot: root, gameId: "other", expectedPid: process.pid, expectedOperationId: "1" })).toThrow("still running");
  // Darwin PIDs are bounded far below this valid positive integer.
  writeFileSync(path, JSON.stringify({ pid: 2147483647, operationId: "1" }));
  recoverSourcePipelineLock({ stateRoot: root, gameId: "other", expectedPid: 2147483647, expectedOperationId: "1" });
  expect(() => readFileSync(path)).toThrow();
});
test("empty PR and Discord input requires authoritative empty export and store ownership", async () => {
  for (const kind of ["pr", "discord"] as const) {
    const root = temp(); const source = definition(); source.identity.kind = kind;
    source.configuration.adapter = "local-mirror";
    source.configuration.scope = { capture_root: "mirror", ...(kind === "discord" ? { channels_config: "channels.json" } : {}) };
    mkdirSync(join(root, "mirror")); writeFileSync(join(root, "channels.json"), JSON.stringify({ channels: [] }));
    writeFileSync(join(root, "game.json"), JSON.stringify({ id: "other", sources: [source] }));
    const options = { gameId: "other", gameRoot: root, knowledgeRoot: join(root, "knowledge"), stateRoot: join(root, "state"), operationId: "initial", mode: "bootstrap" as const };
    const missing = await runGameSourcePipeline(options); expect(missing.ready).toBe(false); expect(missing.sources[0]!.stages.acquisition.reason).toContain("authoritative empty manifest");
    writeFileSync(join(root, "mirror/capture-manifest.json"), JSON.stringify({ identity: source.identity, complete: true, item_count: 0 }));
    expect((await runGameSourcePipeline(options)).ready).toBe(true);
    writeFileSync(join(root, "knowledge/source-owner.json"), JSON.stringify({ game_id: "melee" }));
    await expect(runGameSourcePipeline(options)).rejects.toThrow("another game");
  }
});
test("versioned PR and Discord acquisition runs configured upstream commands before capture", async () => {
  for (const kind of ["pr", "discord"] as const) {
    const root = temp(); const source = definition(); source.identity.kind = kind; source.identity.upstream = kind === "pr" ? "example/other" : "guild-123";
    source.configuration.adapter = kind === "pr" ? "github-prs" : "discord-cli";
    source.configuration.scope = { capture_root: "mirror", acquisition_script: "commands/fetch.py", ...(kind === "discord" ? { channels_config: "channels.json" } : {}) };
    writeFileSync(join(root, "game.json"), JSON.stringify({ id: "other", sources: [source] }));
    const commands: string[][] = [];
    const result = await runGameSourcePipeline({ gameId: "other", gameRoot: root, knowledgeRoot: join(root, "knowledge"), stateRoot: join(root, "state"), operationId: "initial", mode: "bootstrap", runCommand: async (command) => {
      commands.push(command); mkdirSync(join(root, "mirror"));
      writeFileSync(join(root, "channels.json"), JSON.stringify({ channels: [{ id: "123", name: "general" }] }));
      if (kind === "discord") { mkdirSync(join(root, "mirror/123")); writeFileSync(join(root, "mirror/123/2026-09.jsonl"), JSON.stringify({ id: "1", channel_id: "123", author: "fixture", timestamp: "2026-09-11T00:00:00Z", content: "A captured message" }) + "\n"); }
      else { mkdirSync(join(root, "mirror/pr-1/raw"), { recursive: true }); writeFileSync(join(root, "mirror/pr-1/raw/pr.json"), JSON.stringify({ number: 1, title: "Fixture PR", state: "closed", merged: true, merged_at: "2026-09-11T00:00:00Z" })); }
    } });
    expect(result.ready).toBe(true); expect(commands).toHaveLength(1); expect(commands[0]).toContain(kind === "pr" ? "--all-prs" : "--bootstrap");
    if (kind === "pr") expect(commands[0]).toContain("example/other");
    expect(result.sources[0]!.capture!.upstream_refreshed).toBe(true);
  }
});
