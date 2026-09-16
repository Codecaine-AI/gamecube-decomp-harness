import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getHarnessState, getHarnessTimeline, initializeHarnessState, transitionHarnessState } from "@server/core/harness-state";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { addSavePoint, ensureCampaign } from "../state";
import { captureHarnessSavePoint, recordHarnessSavePointFailure, type HarnessSavePointInput } from "./harness-save-point.js";
const cleanup: string[] = [];
const stores: StateStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.db.close(); for (const root of cleanup.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, args: string[]) { const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" }); if (result.exitCode !== 0) throw new Error(result.stderr.toString()); return result.stdout.toString().trim(); }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "harness-save-point-")); cleanup.push(root);
  const repo = join(root, "checkout"); mkdirSync(repo); git(repo, ["init", "-q"]); git(repo, ["config", "user.email", "fixture@example.com"]); git(repo, ["config", "user.name", "Fixture"]);
  writeFileSync(join(repo, ".gitignore"), "generated/\n"); writeFileSync(join(repo, "source.c"), "int value = 1;\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "baseline"]);
  const head = git(repo, ["rev-parse", "HEAD"]); mkdirSync(join(repo, "generated"));
  const report = JSON.stringify({ measures: { matched_code_percent: 67.5 } }); writeFileSync(join(repo, "generated", "score.json"), report);
  const store = openState(join(root, "state")); stores.push(store);
  initializeHarnessState(store.db, { gameId: "example", worktree: repo, configurationRevision: "config", commandId: "initialize" });
  const campaign = ensureCampaign(store, { gameId: "example", baseRef: "HEAD" });
  const archived = join(root, "validated-report.json"); writeFileSync(archived, report);
  addSavePoint(store, { id: "validated", campaignId: campaign.id, triggerKind: "epoch_finish", commitSha: head, reportPath: archived });
  transitionHarnessState(store.db, { gameId: "example", expectedRevision: 0, commandId: "accept", patch: { source: { head }, readiness: { build: "ready", evidence: "ready", sources: "blocked", sandbox: "pending" }, history: { save_point_id: "validated" } }, boundary: { eventId: "validated", kind: "save_point", outcome: "recorded", evidence: { save_point_id: "validated", freshness: "valid" } } });
  const input: HarnessSavePointInput = { gameId: "example", commandId: "manual-capture", triggerKind: "manual", label: "checkpoint", reportPath: "generated/score.json", reportChangesPath: "generated/changes.json", baseRef: "HEAD" };
  return { root, repo, store, head, input };
}
test("pins existing commit with configured report, preserves unrelated gates, and replays without another save point", async () => {
  const f = fixture();
  const result = await captureHarnessSavePoint(f.store, f.input);
  expect(result.freshness).toBe("valid"); expect(result.savePoint.commitSha).toBe(f.head); expect(result.savePoint.committed).toBe(false); expect(result.savePoint.matchedCodePercent).toBe(67.5);
  expect(readFileSync(result.savePoint.reportPath, "utf8")).toContain("67.5");
  expect(await captureHarnessSavePoint(f.store, f.input)).toEqual(result);
  expect(getHarnessTimeline(f.store.db, "example")).toHaveLength(2);
  expect(git(f.repo, ["rev-parse", "HEAD"])).toBe(f.head);
  expect(git(f.repo, ["rev-list", "--count", "HEAD"])).toBe("1");
  expect(getHarnessState(f.store.db, "example")!.readiness).toEqual({ build: "ready", evidence: "ready", sources: "blocked", sandbox: "pending" });
});
for (const scenario of ["dirty", "missing", "stale"] as const) test(`${scenario} evidence remains unknown`, async () => {
  const f = fixture();
  if (scenario === "dirty") writeFileSync(join(f.repo, "source.c"), "int value = 2;\n");
  if (scenario === "missing") rmSync(join(f.repo, "generated", "score.json"));
  if (scenario === "stale") writeFileSync(join(f.repo, "generated", "score.json"), JSON.stringify({ measures: { matched_code_percent: 99 } }));
  const result = await captureHarnessSavePoint(f.store, f.input);
  expect(result.freshness).toBe("unknown"); expect(result.savePoint.matchedCodePercent).toBeNull(); expect(result.savePoint.payload.measures).toEqual({}); expect(result.blockerRaised).toBe(true);
  expect(getHarnessState(f.store.db, "example")!.readiness).toEqual({ build: "ready", evidence: "blocked", sources: "blocked", sandbox: "pending" });
});
test("wrong accepted head records one durable failure and does not create a save point", async () => {
  const f = fixture(); writeFileSync(join(f.repo, "source.c"), "int value = 3;\n"); git(f.repo, ["add", "."]); git(f.repo, ["commit", "-qm", "unaccepted"]);
  await expect(captureHarnessSavePoint(f.store, f.input)).rejects.toThrow("accepted harness head");
  await expect(captureHarnessSavePoint(f.store, f.input)).rejects.toThrow("accepted harness head");
  expect(getHarnessTimeline(f.store.db, "example").filter(entry => entry.kind === "failed")).toHaveLength(1);
  expect(f.store.db.query("SELECT count(*) AS n FROM save_points").get()).toEqual({ n: 1 });
  expect(getHarnessState(f.store.db, "example")!.execution.blockers[0]?.code).toBe("save_point_capture_failed");
});


test("save-point CLI uses harness ownership without --cycle-uuid", async () => {
  const { savePoint } = await import("./save-point.js");
  const f = fixture();
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    await savePoint({ stateDir: f.store.stateDir, repoRoot: "/not-the-owner", gameId: "example", game: { gameId: "example", baseRef: "HEAD", validation: { reportPath: "generated/score.json", reportChangesPath: "generated/changes.json" } } } as never,
      new Map([["--command-id", "cli-capture"], ["--label", "CLI save point"]]));
    const result = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
    expect(result.savePoint.commitSha).toBe(f.head);
    expect(result.freshness).toBe("valid");
    expect(result.savePoint.matchedCodePercent).toBe(67.5);
    expect(git(f.repo, ["rev-list", "--count", "HEAD"])).toBe("1");
  } finally { output.mockRestore(); }
});

test("concurrent identical command records only one boundary", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([captureHarnessSavePoint(f.store, f.input), captureHarnessSavePoint(f.store, f.input)]);
  expect(first).toEqual(second);
  expect(getHarnessTimeline(f.store.db, "example")).toHaveLength(2);
  expect(getHarnessState(f.store.db, "example")!.execution.blockers).toEqual([]);
});

for (const unrelated of [false, true]) test(`successful retry restores only its own evidence failure, unrelated=${unrelated}`, async () => {
  const f = fixture();
  recordHarnessSavePointFailure(f.store, { gameId: "example", commandId: f.input.commandId, message: "temporary capture failure" });
  if (unrelated) {
    const current = getHarnessState(f.store.db, "example")!;
    transitionHarnessState(f.store.db, { gameId: "example", expectedRevision: current.identity.revision, commandId: "unrelated-failure", patch: { execution: { blockers: [...current.execution.blockers, { code: "other_evidence_failed", source_kind: "sync", source_id: "sync", message: "unrelated", recoverable: true }] } } });
  }
  const result = await captureHarnessSavePoint(f.store, f.input);
  expect(result.freshness).toBe("valid");
  const current = getHarnessState(f.store.db, "example")!;
  expect(current.readiness.evidence).toBe(unrelated ? "blocked" : "ready");
  expect(current.execution.blockers.some(item => item.code === "save_point_capture_failed")).toBe(false);
  expect(current.readiness.sources).toBe("blocked");
});
