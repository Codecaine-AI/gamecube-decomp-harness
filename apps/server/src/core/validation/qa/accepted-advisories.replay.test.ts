import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boundaryDeferredFindings, epochQaGateSummary, type RegressionRepairPlan } from "@server/core/harness-runtime/phases/running/epochs/settlement.js";
import { evaluateQaGate } from "@server/core/validation/jobs/qa-gate.js";
import {
  NO_RUN_SELECTED_RUN_ID,
  captureQaScanGuard,
  gitHeadRev,
  l2AcceptedAdvisoryOptions,
  resolveAcceptedAdvisories,
} from "./accepted-advisories.js";
import type { AdjudicationHarness } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/__fixtures__/adjudication.js";
import { advisoryFingerprint, normalizeAdvisoryCode } from "./advisory-fingerprint.js";
import {
  ACCEPTED_ADVISORY_SOURCE,
  ADVISORY_FILE,
  ADVISORY_PREPARE_LINE,
  KEPT_ADVISORY_NOTE,
  LONG_CAST_LINE,
  UPSTREAM_ADVISORY_SOURCE,
  createAcceptedAdvisoryScenario,
  type AcceptedAdvisoryScenario,
  type AdvisoryRepo,
  type WorkerChangeResult,
} from "./__fixtures__/advisory-repo.js";
import type { QaScanFinding } from "./scan-diff.js";

// Plan §6.10 S13: an advisory accepted at L1 travels through integration to
// L2 and the epoch scan, and is honoured only while the same physical line,
// unchanged, still blames to the accepted integration commit.

const PREPARE_LINE = ADVISORY_PREPARE_LINE;
const ACCEPTED_SOURCE = ACCEPTED_ADVISORY_SOURCE;
/** Seven new lines above the accepted line. */
const SHIFT_BLOCK = [
  "void gmAdvisory_Reset(HSD_GObj* gobj)",
  "{",
  "    gmAdvisory_Prepare(gobj, 0);",
  "    gmAdvisory_Clear(gobj);",
  "    gmAdvisory_Finish(gobj);",
  "}",
  "",
  "",
].join("\n");
const COPY_FUNCTION = ["", "void gmAdvisory_Reload(HSD_GObj* gobj, s32 slot)", "{", "    u8* data = NULL;", "", LONG_CAST_LINE, "    gmAdvisory_Store(gobj, data, 0, 0);", "}", ""].join("\n");
const NO_REGRESSIONS: RegressionRepairPlan = {
  paused: false,
  reasons: [],
  repairCandidates: [],
  summary: { brokenMatches: 0, fuzzyRegressions: 0, metricRegressions: 0, regressedFunctions: 0, regressedSections: 0 },
};

const KEPT_NOTE = KEPT_ADVISORY_NOTE;

/** Set once setup completes; teardown tolerates a partial setup. */
let scenario: AcceptedAdvisoryScenario | undefined;
let repo: AdvisoryRepo;
let adjudicator: AdjudicationHarness;
let epoch1: WorkerChangeResult;
/** The af2 fingerprint L1 recorded for the accepted line. */
let acceptedFingerprint: string;
/** HEAD after epoch 2: the accepted line shifted by 7 with an edit elsewhere in its hunk. */
let step2Rev: string;
let acceptedLine: number;

function lineOf(text: string, wanted: string): number {
  const index = text.split("\n").indexOf(wanted);
  if (index < 0) throw new Error(`line not found: ${wanted.slice(0, 40)}`);
  return index + 1;
}

/** The scan's type_erasing_cast warnings in line order. */
function castWarnings(findings: QaScanFinding[]): QaScanFinding[] {
  return findings.filter((finding) => finding.rule_id === "type_erasing_cast" && finding.severity === "warning").sort((left, right) => left.line - right.line);
}

/**
 * The scan guard refuses a file written within 1 s of the scan, so a step
 * that just wrote the advisory file waits until the tree is quiet, as an
 * operator's L2 run long after integration would find it.
 */
async function quietTree(): Promise<void> {
  try {
    const stats = lstatSync(join(repo.repoRoot, ADVISORY_FILE));
    const wait = Math.max(stats.ctimeMs, stats.mtimeMs) + 1_100 - Date.now();
    if (wait > 0) await Bun.sleep(wait);
  } catch {
    // A missing file has nothing to settle.
  }
}

/**
 * regression-check's L2 QA gate as the command runs it: the scan guard and
 * HEAD before the scan, the scan (worktree included), run selection with the
 * guard, the verdict. The command itself is covered in regression-check.test.ts.
 */
async function l2(runIdArg: string) {
  const requestedRunId = runIdArg === NO_RUN_SELECTED_RUN_ID ? null : runIdArg;
  if (requestedRunId !== null) await quietTree();
  const scanGuard = requestedRunId === null ? undefined : await captureQaScanGuard(repo.repoRoot);
  const headRev = requestedRunId === null ? null : await gitHeadRev(repo.repoRoot);
  const invocation = await repo.scanL2();
  const findings = invocation.result?.findings ?? [];
  const opts = await l2AcceptedAdvisoryOptions({ stateDir: repo.stateDir, requestedRunId, repoRoot: repo.repoRoot, headRev, findings, scanGuard });
  return { invocation, findings, opts, resolution: opts?.acceptedAdvisories, gate: evaluateQaGate(invocation, false, opts) };
}

function commitFile(text: string, message: string): string {
  repo.write(ADVISORY_FILE, text);
  return repo.commit(message);
}

beforeAll(async () => {
  // Epoch 1: the worker keeps the long cast line; enforce accepts it at L1
  // (the extraction finds the note's justification, the judge decides
  // p = 0.93, passAt 0.85); apply-on-accept commits it as R.
  scenario = await createAcceptedAdvisoryScenario();
  ({ repo, adjudicator, accepted: epoch1 } = scenario);
  acceptedFingerprint = epoch1.acceptedFingerprints[0]!;
  // Epoch 2: seven lines above the accepted line and an edit elsewhere in its hunk.
  step2Rev = commitFile(`${SHIFT_BLOCK}${ACCEPTED_SOURCE.replace("(HSD_GObj* gobj, s32 slot)", "(HSD_GObj* gobj, s32 slot, s32 mode)")}`, "epoch 2: shift and nearby edit");
  acceptedLine = lineOf(repo.read(ADVISORY_FILE), LONG_CAST_LINE);
}, 30_000);

afterEach(() => {
  if (scenario === undefined) return;
  repo.git("reset", "-q", "--hard");
  repo.git("clean", "-fdq");
  repo.git("stash", "clear");
  repo.git("checkout", "-q", "--detach", step2Rev);
  repo.store.db.query("DELETE FROM accepted_advisory WHERE checkpoint_id <> ?").run(epoch1.checkpointId);
  repo.store.db.query("DELETE FROM integration_outcomes WHERE worker_checkpoint_id <> ?").run(epoch1.checkpointId);
});

afterAll(() => {
  scenario?.teardown();
});

describe("L1 to integration to L2 advisory replay (S13)", () => {
  test("1. epoch 1: enforce accepts the L1 checkpoint's long cast line by its full line; R integrates it", () => {
    const [finding] = castWarnings(epoch1.l1Findings);
    expect(castWarnings(epoch1.l1Findings)).toHaveLength(1);
    expect(LONG_CAST_LINE.trim().length).toBeGreaterThan(240);
    expect(finding!.excerpt).toBe(LONG_CAST_LINE.trim().slice(0, 240));
    expect(finding!.detail).toMatchObject({ llm_review: true });
    expect(epoch1.validation.advisoryGate).toBe("pending");
    expect(epoch1.adjudication).toMatchObject({ mode: "enforce", verdict: "pass", applied: true });
    expect(epoch1.adjudication.accepted_fingerprints).toEqual([advisoryFingerprint(finding!, LONG_CAST_LINE)]);

    const rows = repo.store.db.query("SELECT * FROM accepted_advisory").all() as Array<Record<string, unknown>>;
    expect(rows).toEqual([expect.objectContaining({
      fingerprint: advisoryFingerprint(finding!, LONG_CAST_LINE),
      checkpoint_id: epoch1.checkpointId,
      run_id: repo.runId,
      rule_id: "type_erasing_cast",
      file: ADVISORY_FILE,
      full_line: normalizeAdvisoryCode(LONG_CAST_LINE),
      occurrences: 1,
      probability: 0.93,
    })]);
    expect(rows[0]!.decision_run_id).toEqual(expect.any(String));
    const checkpoint = repo.store.db.query("SELECT run_id, qa_status FROM worker_checkpoints WHERE id = ?").get(epoch1.checkpointId);
    expect(checkpoint).toEqual({ run_id: repo.runId, qa_status: "warnings" });
    expect(repo.git("show", "-s", "--format=%s", epoch1.integratedRev)).toBe(`integrate ${epoch1.checkpointId}`);
  }, 30_000);

  test("2. epoch 2: RUN_ID L2 exempts the shifted line; raw counts still show 1 warning", async () => {
    const { findings, resolution, gate } = await l2(repo.runId);
    const [finding] = castWarnings(findings);
    expect(finding!.line).toBe(castWarnings(epoch1.l1Findings)[0]!.line + 7);
    expect(resolution?.exempt).toEqual([{
      fingerprint: acceptedFingerprint,
      finding: finding!,
      checkpointId: epoch1.checkpointId,
      blame: { commit: epoch1.integratedRev, origLine: castWarnings(epoch1.l1Findings)[0]!.line },
    }]);
    expect(resolution?.blocking).toEqual([]);
    expect(gate.qaCounts).toEqual({ errors: 0, warnings: 1 });
    expect(gate.qaGateExitCode).toBe(2);
    expect(gate.effective).toMatchObject({ exitCode: 0, counts: { errors: 0, warnings: 0 }, findings: [] });
    expect(gate.qaGatePassed).toBe(true);
  }, 30_000);

  test("3. the same L2 with no run id blocks and prints the operator message", async () => {
    for (const requested of [NO_RUN_SELECTED_RUN_ID, "unknown-run"]) {
      const { opts, gate } = await l2(requested);
      expect(opts?.acceptedAdvisories).toBeUndefined();
      expect(gate.qaGatePassed).toBe(false);
      expect(gate.qaCounts).toEqual({ errors: 0, warnings: 1 });
      expect(gate.operatorMessage).toBe(
        `1 accepted llm_review advisories exist (runs: ${repo.runId}). No harness run was selected, so they are not honoured. ` +
          "Rerun with RUN_ID=<run> make regression-check (or --run-id <run>).",
      );
    }
  }, 30_000);

  test("4. a second identical copy committed later blocks; the original stays exempt", async () => {
    commitFile(`${repo.read(ADVISORY_FILE)}${COPY_FUNCTION}`, "copy the accepted line");
    const { findings, resolution, gate } = await l2(repo.runId);
    const [original, copy] = castWarnings(findings);
    expect(copy!.line).toBeGreaterThan(original!.line);
    expect(resolution?.exempt.map((entry) => [entry.finding.line, entry.checkpointId])).toEqual([[acceptedLine, epoch1.checkpointId]]);
    expect(resolution?.blocking).toEqual([
      { fingerprint: acceptedFingerprint, finding: copy!, reason: "not-from-accepted-integration" },
    ]);
    expect(gate.effective?.counts).toEqual({ errors: 0, warnings: 1 });
    expect(gate.qaGatePassed).toBe(false);
  }, 30_000);

  test("5. a second checkpoint accepting the surviving line cannot double-credit it; the copy still blocks", async () => {
    commitFile(`${repo.read(ADVISORY_FILE)}${COPY_FUNCTION}`, "copy the accepted line");
    // Worker B started from upstream and kept the same line; its integration
    // was resolved onto a head that already had it, so R5 only changes `count`.
    const patchB = repo.workerPatch(ADVISORY_FILE, UPSTREAM_ADVISORY_SOURCE, ACCEPTED_SOURCE.replace("    s32 count = 0;", "    s32 count = 1;"));
    const b = await repo.adjudicateAtL1({ patchText: patchB, noteText: KEPT_NOTE, adjudicator });
    expect(b.acceptedFingerprints).toEqual([acceptedFingerprint]);
    expect(repo.store.db.query("SELECT occurrences FROM accepted_advisory WHERE checkpoint_id = ?").get(b.checkpointId)).toEqual({ occurrences: 1 });
    const preApply = repo.head();
    const r5 = commitFile(repo.read(ADVISORY_FILE).replace("    s32 count = 0;", "    s32 count = 1;"), "integrate checkpoint B");
    repo.recordIntegration(b.checkpointId, r5, preApply, "resolved");

    const { findings, resolution, gate } = await l2(repo.runId);
    const [, copy] = castWarnings(findings);
    expect(resolution?.exempt.map((entry) => [entry.finding.line, entry.checkpointId, entry.blame.commit])).toEqual([
      [acceptedLine, epoch1.checkpointId, epoch1.integratedRev],
    ]);
    expect(resolution?.blocking.map((entry) => [entry.finding.line, entry.reason])).toEqual([[copy!.line, "not-from-accepted-integration"]]);
    expect(gate.qaGatePassed).toBe(false);
  }, 30_000);

  test("6. a change after character 240 keeps the excerpt but blocks", async () => {
    const changeAt = LONG_CAST_LINE.trim().indexOf("GMADVISORY_TABLE_TAIL");
    expect(changeAt).toBeGreaterThanOrEqual(240);
    const before = castWarnings((await l2(repo.runId)).findings)[0]!;
    commitFile(repo.read(ADVISORY_FILE).replace("GMADVISORY_TABLE_TAIL)", "GMADVISORY_TABLE_TAIL_WIDE)"), "edit past the excerpt");
    const { findings, resolution, gate } = await l2(repo.runId);
    const [after] = castWarnings(findings);
    expect(after!.excerpt).toBe(before.excerpt);
    expect(after!.line).toBe(before.line);
    expect(resolution?.exempt).toEqual([]);
    expect(resolution?.blocking.map((entry) => entry.reason)).toEqual(["no-accepted-record"]);
    expect(gate.qaGatePassed).toBe(false);
  }, 30_000);

  test("7. after git revert R, identical text brought back by a revert or by hand blocks", async () => {
    repo.git("revert", "--no-edit", epoch1.integratedRev);
    const revertRev = repo.head();
    const reverted = await l2(repo.runId);
    expect(castWarnings(reverted.findings)).toEqual([]);
    expect(reverted.resolution?.exempt).toEqual([]);

    repo.git("revert", "--no-edit", revertRev);
    expect(repo.read(ADVISORY_FILE)).toContain(LONG_CAST_LINE);
    const reapplied = await l2(repo.runId);
    expect(reapplied.resolution?.exempt).toEqual([]);
    expect(reapplied.resolution?.blocking.map((entry) => [entry.fingerprint, entry.reason])).toEqual([
      [acceptedFingerprint, "not-from-accepted-integration"],
    ]);
    expect(reapplied.gate.qaGatePassed).toBe(false);

    repo.git("checkout", "-q", "--detach", revertRev);
    commitFile(repo.read(ADVISORY_FILE).replace(`${PREPARE_LINE}\n`, `${PREPARE_LINE}\n${LONG_CAST_LINE}\n`), "reintroduce the line");
    const reintroduced = await l2(repo.runId);
    expect(reintroduced.resolution?.exempt).toEqual([]);
    expect(reintroduced.resolution?.blocking.map((entry) => [entry.fingerprint, entry.reason])).toEqual([
      [acceptedFingerprint, "not-from-accepted-integration"],
    ]);
    expect(reintroduced.gate.qaGatePassed).toBe(false);
  }, 30_000);

  test("8. a deterministic error in the same scan blocks regardless; a scanner tool error fails closed", async () => {
    const exemptStep2 = (await l2(repo.runId)).resolution!;
    expect(exemptStep2.exempt).toHaveLength(1);
    commitFile(
      `${repo.read(ADVISORY_FILE)}\nvoid gmAdvisory_Peek(HSD_GObj* gobj)\n{\n    s32 value = M2C_FIELD(gobj, s32*, 0x10);\n    gmAdvisory_Store(gobj, NULL, value, 0);\n}\n`,
      "deterministic finding",
    );
    const withError = await l2(repo.runId);
    expect(withError.resolution?.exempt).toHaveLength(1);
    expect(withError.gate.effective?.counts).toEqual({ errors: 1, warnings: 0 });
    expect(withError.gate.effective?.exitCode).toBe(1);
    expect(withError.gate.qaGatePassed).toBe(false);

    const broken = await repo.scanL2({ baseRef: "refs/heads/no-such-upstream" });
    expect(broken.toolError).not.toBeNull();
    for (const opts of [
      await l2AcceptedAdvisoryOptions({ stateDir: repo.stateDir, requestedRunId: repo.runId, repoRoot: repo.repoRoot, headRev: repo.head(), findings: [] }),
      { acceptedAdvisories: exemptStep2 },
    ]) {
      const gate = evaluateQaGate(broken, false, opts);
      expect(gate.qaGatePassed).toBe(false);
      expect(gate.hint).toContain("QA gate could not run and fails closed");
    }
  }, 30_000);

  test("9. the epoch scan records the accepted line as adjudicated and the copy as deferred", async () => {
    const worktreeDir = join(repo.root, "epoch-worktree");
    repo.git("worktree", "add", "-q", "--detach", worktreeDir, step2Rev);
    try {
      const settle = async () => {
        const settledHead = repo.git("-C", worktreeDir, "rev-parse", "HEAD");
        const qaGate = await epochQaGateSummary({ store: repo.store, runId: repo.runId, worktreeDir, settledHead, invocation: await repo.scanEpoch(worktreeDir) });
        return { qaGate, findings: boundaryDeferredFindings(NO_REGRESSIONS, qaGate) };
      };
      const adjudication = {
        ruleId: "type_erasing_cast",
        file: ADVISORY_FILE,
        fingerprint: acceptedFingerprint,
        checkpointIds: [epoch1.checkpointId],
      };

      const clean = await settle();
      expect(clean.qaGate.warnings).toBe(1);
      expect(clean.findings).toEqual([
        { reason: "boundary_qa_adjudicated", sourcePath: ADVISORY_FILE, detail: JSON.stringify(clean.qaGate.findings[0]), adjudication },
      ]);

      commitFile(`${repo.read(ADVISORY_FILE)}${COPY_FUNCTION}`, "copy the accepted line");
      repo.git("-C", worktreeDir, "checkout", "-q", "--detach", repo.head());
      const copied = await settle();
      expect(copied.qaGate.warnings).toBe(2);
      const byLine = copied.findings.map((finding) => [JSON.parse(finding.detail).line as number, finding.reason, finding.adjudication] as const);
      expect(byLine.sort((left, right) => left[0] - right[0])).toEqual([
        [acceptedLine, "boundary_qa_adjudicated", adjudication],
        [castWarnings(copied.qaGate.findings)[1]!.line, "boundary_qa_deferred", undefined],
      ]);

      // A worktree that is not at the settled head honours nothing, even where the settled head would.
      const drifted = await epochQaGateSummary({
        store: repo.store, runId: repo.runId, worktreeDir, settledHead: step2Rev, invocation: await repo.scanEpoch(worktreeDir),
      });
      expect(drifted.adjudicated).toBeUndefined();
      expect(boundaryDeferredFindings(NO_REGRESSIONS, drifted).map((finding) => finding.reason)).toEqual(["boundary_qa_deferred", "boundary_qa_deferred"]);

      // HEAD moving, or an exempted file changing, while resolution runs discards the exemption it computed.
      repo.git("-C", worktreeDir, "checkout", "-q", "--detach", step2Rev);
      const stepTwoScan = await repo.scanEpoch(worktreeDir);
      const duringResolution = async (change: () => void) => {
        let resolvedExempt = 0;
        const qaGate = await epochQaGateSummary({
          store: repo.store, runId: repo.runId, worktreeDir, settledHead: step2Rev, invocation: stepTwoScan,
          resolveAdvisories: async (input) => {
            const resolution = await resolveAcceptedAdvisories(input);
            resolvedExempt = resolution.exempt.length;
            change();
            return resolution;
          },
        });
        expect(resolvedExempt).toBe(1);
        expect(qaGate.adjudicated).toBeUndefined();
        expect(boundaryDeferredFindings(NO_REGRESSIONS, qaGate).map((finding) => finding.reason)).toEqual(["boundary_qa_deferred"]);
        repo.git("-C", worktreeDir, "checkout", "-q", "--force", "--detach", step2Rev);
      };
      await duringResolution(() => repo.git("-C", worktreeDir, "checkout", "-q", "--detach", epoch1.integratedRev));
      await duringResolution(() => writeFileSync(join(worktreeDir, ADVISORY_FILE), `${readFileSync(join(worktreeDir, ADVISORY_FILE), "utf8")}// edited\n`));
    } finally {
      repo.git("worktree", "remove", "--force", worktreeDir);
    }
  }, 30_000);

  describe("10. dirty worktree with RUN_ID set", () => {
    async function expectDirtyThenStash(stashArgs: string[]) {
      const dirty = await l2(repo.runId);
      expect(castWarnings(dirty.findings).length).toBeGreaterThan(0);
      expect(dirty.resolution?.exempt).toEqual([]);
      expect(dirty.resolution?.blocking.map((entry) => entry.reason)).toEqual(castWarnings(dirty.findings).map(() => "dirty-file"));
      expect(dirty.gate.qaGatePassed).toBe(false);

      repo.git("stash", ...stashArgs);
      const restored = await l2(repo.runId);
      expect(restored.resolution?.exempt.map((entry) => [entry.finding.line, entry.checkpointId])).toEqual([[acceptedLine, epoch1.checkpointId]]);
      expect(restored.gate.qaGatePassed).toBe(true);
    }

    test("(a) an uncommitted edit after character 240 with the excerpt unchanged", async () => {
      repo.write(ADVISORY_FILE, repo.read(ADVISORY_FILE).replace("GMADVISORY_TABLE_TAIL)", "GMADVISORY_TABLE_TAIL_WIDE)"));
      await expectDirtyThenStash([]);
    }, 30_000);

    test("(b) an uncommitted edit that only shifts the accepted line", async () => {
      repo.write(ADVISORY_FILE, repo.read(ADVISORY_FILE).replace(`${PREPARE_LINE}\n`, `${PREPARE_LINE}\n\n`));
      expect(castWarnings((await repo.scanL2()).result!.findings)[0]!.line).toBe(acceptedLine + 1);
      await expectDirtyThenStash([]);
    }, 30_000);

    test("(c) an uncommitted duplicate of the line in the same file", async () => {
      repo.write(ADVISORY_FILE, `${repo.read(ADVISORY_FILE)}${COPY_FUNCTION}`);
      expect(castWarnings((await repo.scanL2()).result!.findings)).toHaveLength(2);
      await expectDirtyThenStash([]);
    }, 30_000);

    test("(d) an untracked new file holding a copy", async () => {
      const copyFile = "src/melee/gm/gmadvisory_copy.c";
      repo.write(copyFile, `void gmAdvisory_Copy(HSD_GObj* gobj, s32 slot)\n{\n${LONG_CAST_LINE}\n}\n`);
      // The scanner's ref diff never lists untracked files, so only the original is scanned and it stays exempt.
      const scanned = await l2(repo.runId);
      const [original] = castWarnings(scanned.findings);
      expect(castWarnings(scanned.findings)).toHaveLength(1);
      expect(scanned.resolution?.exempt.map((entry) => entry.finding)).toEqual([original!]);
      // A finding reported for the untracked copy is refused on the file's status alone.
      const copyFinding: QaScanFinding = { ...original!, file: copyFile, line: 3 };
      const resolution = await resolveAcceptedAdvisories({ store: repo.store, runId: repo.runId, repoRoot: repo.repoRoot, headRev: repo.head(), findings: [original!, copyFinding] });
      expect(resolution.exempt.map((entry) => entry.finding)).toEqual([original!]);
      expect(resolution.blocking).toEqual([{ fingerprint: null, finding: copyFinding, reason: "dirty-file" }]);

      repo.git("stash", "-u");
      expect(repo.git("status", "--porcelain", "--untracked-files=all")).toBe("");
      const restored = await l2(repo.runId);
      expect(restored.resolution?.exempt.map((entry) => [entry.finding.line, entry.checkpointId])).toEqual([[acceptedLine, epoch1.checkpointId]]);
    }, 30_000);
  });
});
