import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { claimNextJob, completeJob, enqueueJob } from "@server/core/job-queue/kernel.js";
import { packageRoot } from "@server/core/knowledge";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  recordWorkerSteeringObservations,
  trustedBaselineCertifiesTarget,
} from "@server/core/agent-catalog/agents/running/worker/steering-validation.js";
import { publishSiteBoundApprovals, readSiteBoundApprovals } from "@server/core/validation/steering/approvals.js";
import {
  parseSteeringDecision,
  steeringCertificateContext,
  steeringRejectionReason,
  type WorkerSteeringResult,
} from "@server/core/validation/steering/steering-check.js";
import {
  APPROVING_CLAIM_STALE_MS,
  approvalsForRequest,
  decideEvidenceReview,
  getEvidenceReview,
  listEvidenceReviews,
  openEvidenceReviewsForTarget,
  recordEvidenceReviewRequest,
  requeueReviewedTarget,
} from "./evidence-reviews.js";

const TOOLS = resolve(packageRoot(), "toolpacks/gamecube-decomp/_impl/gamecube/tools");

/**
 * The real gate (`reduce` + `decide`) on the toy construct of
 * test_steering_approvals.py: `f` gains `v = foo->getX()` (a weak inline the
 * map lists) at site A, read with the approvals in `approvalsPath`.
 */
const GATE_SCRIPT = `
import json, sys
from pathlib import Path
sys.path.insert(0, ".")
import evidence_search, steering_check as sc, test_steering_check as t, test_steering_approvals as ta
sc.classify = t.fake_classify
evidence_search.map_unit = lambda repo, unit, version=None: {"functions": [{"name": "TFoo::getX(void)", "mangled": "getX__4TFooFv", "kind": "weak"}]}
base_rev, approvals_path = sys.argv[1], sys.argv[2]
approvals = sc.read_jsonl(Path(approvals_path)) if approvals_path else []
m = t.manifest({"src/a.c": (ta.A_BASE, ta.A_CAND)})
m["base_rev"] = base_rev
red = t.reduce(m, evidence_repo=Path("/nonexistent"), approvals=approvals, game="sms")
dec = sc.decide(red, ta.toy_mw(red), approvals=approvals, probes=False)
print(json.dumps({"reduce": red, "decision": dec}))
`;

/** The gate against `baseRev` (the toy construct is the edit), reading the approvals in `approvalsPath`. */
function runGate(approvalsPath = "", baseRev = "rev"): WorkerSteeringResult {
  const out = spawnSync("python3", ["-c", GATE_SCRIPT, baseRev, approvalsPath], { cwd: TOOLS, encoding: "utf8" });
  if (out.status !== 0) throw new Error(`gate script failed: ${out.stderr}`);
  const { reduce, decision: raw } = JSON.parse(out.stdout) as { reduce: unknown; decision: unknown };
  const decision = parseSteeringDecision(raw);
  return {
    mode: "enforce",
    decision,
    error: null,
    artifactPath: null,
    durationMs: 0,
    certificate: steeringCertificateContext({ decision, reduce, sourceChanged: true }),
  };
}

/** The request's current revision: what the dashboard shows the operator. */
function rev(store: StateStore, id: string): number {
  return getEvidenceReview(store, id)!.revision;
}

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function withStore(run: (store: StateStore, dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "evidence-reviews-"));
  dirs.push(dir);
  const store = openState(dir);
  return Promise.resolve(run(store, dir)).finally(() => store.db.close());
}

const TARGET = { gameId: "sms", unit: "u1", symbol: "f__Fv" };
const NOTE = { summary: "map-backed weak inline", evidence: "TP JSystem: v = foo->getX(); at the same site" };

describe("evidence-review requests", () => {
  test("one rejected construct is one request; approval then the exact resubmission certifies", async () => {
    await withStore(async (store, dir) => {
      const rejected = runGate();
      expect(steeringRejectionReason(rejected)).not.toBeNull();
      expect(rejected.decision?.evidence_reviews).toHaveLength(1);

      recordWorkerSteeringObservations(store, { result: rejected, ...TARGET, runId: "run-1", attemptRef: "cp-1", baseRev: "rev", workerNote: NOTE });
      recordWorkerSteeringObservations(store, { result: rejected, ...TARGET, runId: "run-1", attemptRef: "cp-2", baseRev: "rev", workerNote: NOTE });
      const [request, ...more] = listEvidenceReviews(store, { gameId: "sms" });
      expect(more).toEqual([]);
      expect(request).toMatchObject({
        game: "sms", unit: "u1", symbol: "f__Fv", base_rev: "rev", site_file: "src/a.c", site_lines: [4, 4],
        callee: "getX", callee_symbol: "getX__4TFooFv", status: "open", occurrences: 2, attempt_ref: "cp-2",
      });
      expect(request!.patch).toContain("+    v = foo->getX() NEUTRAL ACCESSOR;");
      expect(request!.evidence).toMatchObject({ gate: { callee: "getX", symbol: "getX__4TFooFv" }, worker: NOTE });
      expect(openEvidenceReviewsForTarget(store, TARGET).map((row) => row.id)).toEqual([request!.id]);

      const approvalsPath = join(dir, "games/sms/knowledge/sources/injectable/steering_lessons/evidence_approvals.jsonl");
      const decided = await decideEvidenceReview(store, {
        gameId: "sms", id: request!.id, revision: rev(store, request!.id), decision: "approved", note: "TP has the same inline here", decidedBy: "ford", approvalsPath, requeueAllowed: true,
      });
      expect(decided.review).toMatchObject({ status: "approved", decided_by: "ford", note: "TP has the same inline here" });
      expect(decided.requeue.status).toBe("none");
      const { approvals, legacy } = await readSiteBoundApprovals(approvalsPath);
      expect(legacy).toBe(0);
      expect(approvals).toEqual([decided.approval!]);
      expect(decided.approval).toMatchObject({ game: "sms", unit: "u1", target: "f__Fv", site_lines: [4, 4], group_digest: request!.group_digest });
      expect(openEvidenceReviewsForTarget(store, TARGET)).toEqual([]);

      // The approval accepts nothing itself: a fresh gate run certifies the exact resubmission.
      const resubmitted = runGate(approvalsPath);
      expect(resubmitted.decision?.attempt).toBe("pass");
      expect(steeringRejectionReason(resubmitted)).toBeNull();
      recordWorkerSteeringObservations(store, { result: resubmitted, ...TARGET, baseRev: "rev", workerNote: NOTE });
      expect(listEvidenceReviews(store, { gameId: "sms" }).map((row) => [row.status, row.occurrences])).toEqual([["approved", 2]]);

      await expect(decideEvidenceReview(store, {
        gameId: "sms", id: request!.id, revision: rev(store, request!.id), decision: "rejected", note: "again", approvalsPath, requeueAllowed: true,
      })).rejects.toThrow("already approved");
    });
  });

  const UNVERIFIED = { unit: "u1", symbol: "f__Fv" };
  const BASES = { trustedBaseline: { result: null, trustedBaseRev: "trusted-rev" } };

  /** One approval covers both certifying runs of an unverified target; a third base stays uncertified. */
  async function expectSingleRound(store: StateStore, approvalsPath: string, id: string): Promise<void> {
    const decided = await decideEvidenceReview(store, { gameId: "sms", id, revision: rev(store, id), decision: "approved", note: "TP has it", approvalsPath, requeueAllowed: true });
    expect(decided.approvals.map((row) => row.base_rev).sort()).toEqual(["claim-rev", "trusted-rev"]);
    expect(decided.approvals.every((row) => row.site_file === "src/a.c" && row.site_lines.join() === "4,4" && row.group_digest === decided.review.group_digest)).toBe(true);
    expect((await readSiteBoundApprovals(approvalsPath)).approvals).toHaveLength(2);

    const claimRerun = runGate(approvalsPath, "claim-rev");
    const trustedRerun = runGate(approvalsPath, "trusted-rev");
    expect(steeringRejectionReason(claimRerun)).toBeNull();
    expect(trustedBaselineCertifiesTarget(trustedRerun, UNVERIFIED)).toBe(true);
    recordWorkerSteeringObservations(store, {
      result: claimRerun, ...TARGET, baseRev: "claim-rev", workerNote: NOTE,
      trustedBaseline: { result: trustedRerun, trustedBaseRev: "trusted-rev" },
    });
    const [after] = listEvidenceReviews(store, { gameId: "sms" });
    expect(after).toMatchObject({ status: "approved", occurrences: decided.review.occurrences });
    // Fail closed: neither row certifies a third base.
    expect(steeringRejectionReason(runGate(approvalsPath, "other-rev"))).not.toBeNull();
  }

  test("an unverified target rejected at the claim base: one request, one approval, both gate runs certify", async () => {
    await withStore(async (store, dir) => {
      // The worker adds the construct: the claim-base run rejects it, so the trusted-base run never runs.
      const claimRejected = runGate("", "claim-rev");
      recordWorkerSteeringObservations(store, { result: claimRejected, ...TARGET, baseRev: "claim-rev", workerNote: NOTE, ...BASES });
      const [request, ...more] = listEvidenceReviews(store, { gameId: "sms" });
      expect(more).toEqual([]);
      expect(request).toMatchObject({ base_rev: "claim-rev", claim_base_rev: "claim-rev", trusted_base_rev: "trusted-rev", status: "open" });
      await expectSingleRound(store, join(dir, "evidence_approvals.jsonl"), request!.id);
    });
  });

  test("an unverified target rejected at the trusted base: the request binds the trusted run, one approval covers both runs", async () => {
    await withStore(async (store, dir) => {
      // The construct is already in the claim base (part of the unexplained code), so the claim-base run passes;
      // stand-in for that pass: a result the claim-base gate does not reject (shadow), so it queues nothing.
      const claimPass: WorkerSteeringResult = { ...runGate("", "claim-rev"), mode: "shadow" };
      const trusted = runGate("", "trusted-rev");
      expect(trusted.decision?.evidence_reviews?.map((row) => row.base_rev)).toEqual(["trusted-rev"]);
      expect(trustedBaselineCertifiesTarget(trusted, UNVERIFIED)).toBe(false);
      for (const attemptRef of ["cp-1", "cp-2"]) {
        recordWorkerSteeringObservations(store, {
          result: claimPass, ...TARGET, attemptRef, baseRev: "claim-rev", workerNote: NOTE,
          trustedBaseline: { result: trusted, trustedBaseRev: "trusted-rev" },
        });
      }
      const [request, ...more] = listEvidenceReviews(store, { gameId: "sms" });
      expect(more).toEqual([]);
      expect(request).toMatchObject({
        base_rev: "trusted-rev", claim_base_rev: "claim-rev", trusted_base_rev: "trusted-rev", occurrences: 2, status: "open",
        evidence: { gate: { run: "trusted_base" } },
      });
      expect(request!.base_sites.map((site) => site.base_rev)).toEqual(["trusted-rev"]);
      await expectSingleRound(store, join(dir, "evidence_approvals.jsonl"), request!.id);
    });
  });

  test("per-base sites: a site the other base's run observed differently gets its own row", async () => {
    await withStore(async (store, dir) => {
      const base = {
        ...TARGET, siteFile: "src/a.c", groupDigest: "d1", callee: "getX", calleeSymbol: "getX__4TFooFv", patch: "+x",
        evidence: { gate: {} }, claimBaseRev: "claim-rev", trustedBaseRev: "trusted-rev",
      };
      const { id } = recordEvidenceReviewRequest(store, { ...base, baseRev: "claim-rev", siteLines: [4, 4] })!;
      recordEvidenceReviewRequest(store, { ...base, baseRev: "trusted-rev", siteLines: [9, 9] });
      const approvalsPath = join(dir, "approvals.jsonl");
      const { approvals } = await decideEvidenceReview(store, { gameId: "sms", id, revision: rev(store, id), decision: "approved", note: "ok", approvalsPath, requeueAllowed: true });
      expect(approvals.map((row) => [row.base_rev, row.site_lines])).toEqual([["trusted-rev", [9, 9]], ["claim-rev", [4, 4]]]);
    });
  });

  test("an approval that no longer covers the construct reopens it; a rejection stays rejected", async () => {
    await withStore(async (store, dir) => {
      const base = {
        ...TARGET, baseRev: "rev-1", siteFile: "src/a.c", siteLines: [4, 4] as [number, number], groupDigest: "d1",
        callee: "getX", calleeSymbol: "getX__4TFooFv", patch: "+x", evidence: { gate: {} },
      };
      const first = recordEvidenceReviewRequest(store, base)!;
      expect(first.outcome).toBe("created");
      const approvalsPath = join(dir, "approvals.jsonl");
      await decideEvidenceReview(store, { gameId: "sms", id: first.id, revision: rev(store, first.id), decision: "approved", note: "ok", approvalsPath, requeueAllowed: true });
      // The construct comes back at another base: the approval does not cover it.
      expect(recordEvidenceReviewRequest(store, { ...base, baseRev: "rev-2" })).toEqual({ id: first.id, outcome: "reopened" });
      const [reopened] = listEvidenceReviews(store, { gameId: "sms", status: "open" });
      expect(reopened).toMatchObject({ base_rev: "rev-2", status: "open", decided_by: null, approval: null, occurrences: 2 });
      expect((reopened!.evidence.previous_decisions as unknown[])[0]).toMatchObject({ status: "approved", base_rev: "rev-1", note: "ok" });

      const other = recordEvidenceReviewRequest(store, { ...base, groupDigest: "d2" })!;
      await decideEvidenceReview(store, { gameId: "sms", id: other.id, revision: rev(store, other.id), decision: "rejected", note: "not in the original", approvalsPath, requeueAllowed: true });
      expect(recordEvidenceReviewRequest(store, { ...base, groupDigest: "d2" })).toEqual({ id: other.id, outcome: "repeated" });
      expect(listEvidenceReviews(store, { gameId: "sms", status: "rejected" }).map((row) => row.occurrences)).toEqual([2]);
      expect(readFileSync(approvalsPath, "utf8").trim().split("\n")).toHaveLength(1);
      await expect(decideEvidenceReview(store, { gameId: "sms", id: reopened!.id, revision: rev(store, reopened!.id), decision: "approved", note: "  ", approvalsPath, requeueAllowed: true }))
        .rejects.toThrow("needs a note");
    });
  });

  const SITE_A = {
    ...TARGET, baseRev: "rev-1", siteFile: "src/a.c", siteLines: [4, 4] as [number, number], groupDigest: "d1",
    callee: "getX", calleeSymbol: "getX__4TFooFv", patch: "+x", evidence: { gate: {} },
  };

  test("a decision on a stale view of the request is refused: approving by id never covers an unseen site", async () => {
    await withStore(async (store, dir) => {
      const { id } = recordEvidenceReviewRequest(store, SITE_A)!;
      const shown = getEvidenceReview(store, id)!; // the dashboard displays site A
      // A same-digest resubmission moves the construct to site B (and another base) before the operator decides.
      recordEvidenceReviewRequest(store, { ...SITE_A, baseRev: "rev-2", siteLines: [9, 9] });
      const approvalsPath = join(dir, "approvals.jsonl");
      for (const decision of ["approved", "rejected"] as const) {
        await expect(decideEvidenceReview(store, { gameId: "sms", id, revision: shown.revision, decision, note: "saw site A", approvalsPath, requeueAllowed: true }))
          .rejects.toThrow(`changed since revision ${shown.revision}`);
      }
      expect(existsSync(approvalsPath)).toBe(false);
      expect(getEvidenceReview(store, id)).toMatchObject({ status: "open", site_lines: [9, 9], base_rev: "rev-2" });
      // Reloaded: the operator now decides on site B.
      const { approvals } = await decideEvidenceReview(store, { gameId: "sms", id, revision: rev(store, id), decision: "approved", note: "saw site B", approvalsPath, requeueAllowed: true });
      expect(approvals.map((row) => [row.base_rev, row.site_lines])).toEqual([["rev-2", [9, 9]]]);
    });
  });

  test("concurrent approve and reject: the first claim wins and a rejection never leaves a live approval", async () => {
    await withStore(async (store, dir) => {
      const approvalsPath = join(dir, "approvals.jsonl");
      // Approve first: it claims before publishing, so the rejection racing its publication loses.
      const first = recordEvidenceReviewRequest(store, SITE_A)!.id;
      const revision = rev(store, first);
      const approving = decideEvidenceReview(store, { gameId: "sms", id: first, revision, decision: "approved", note: "ok", approvalsPath, requeueAllowed: true });
      expect(getEvidenceReview(store, first)!.status).toBe("approving");
      await expect(decideEvidenceReview(store, { gameId: "sms", id: first, revision, decision: "rejected", note: "no", approvalsPath, requeueAllowed: true }))
        .rejects.toThrow(`changed since revision ${revision}`);
      await approving;
      expect(getEvidenceReview(store, first)!.status).toBe("approved");
      expect((await readSiteBoundApprovals(approvalsPath)).approvals.map((row) => row.review_id)).toEqual([first]);

      // Reject first: the approval racing it loses before publishing anything.
      const second = recordEvidenceReviewRequest(store, { ...SITE_A, groupDigest: "d2" })!.id;
      const secondRevision = rev(store, second);
      const [rejected, approved] = await Promise.allSettled([
        decideEvidenceReview(store, { gameId: "sms", id: second, revision: secondRevision, decision: "rejected", note: "no", approvalsPath, requeueAllowed: true }),
        decideEvidenceReview(store, { gameId: "sms", id: second, revision: secondRevision, decision: "approved", note: "ok", approvalsPath, requeueAllowed: true }),
      ]);
      expect(rejected.status).toBe("fulfilled");
      expect(approved.status).toBe("rejected");
      expect(getEvidenceReview(store, second)!.status).toBe("rejected");
      expect((await readSiteBoundApprovals(approvalsPath)).approvals.map((row) => row.review_id)).toEqual([first]);
    });
  });

  test("a failed publication puts the request back to open with nothing published", async () => {
    await withStore(async (store, dir) => {
      const { id } = recordEvidenceReviewRequest(store, SITE_A)!;
      const blocker = join(dir, "not-a-dir");
      writeFileSync(blocker, "");
      const revision = rev(store, id);
      await expect(decideEvidenceReview(store, {
        gameId: "sms", id, revision, decision: "approved", note: "ok", approvalsPath: join(blocker, "approvals.jsonl"), requeueAllowed: true,
      })).rejects.toThrow("so it is open again");
      expect(getEvidenceReview(store, id)).toMatchObject({ status: "open", decided_by: null, note: null, approvals: [] });
      expect(rev(store, id)).toBeGreaterThan(revision);
    });
  });

  test("a crash after publication: a rejection cannot take over, a resumed approval finishes", async () => {
    await withStore(async (store, dir) => {
      const approvalsPath = join(dir, "approvals.jsonl");
      const { id } = recordEvidenceReviewRequest(store, SITE_A)!;
      // The approver claimed, published its rows, then crashed before finalizing.
      const claimedAt = rev(store, id) + 1;
      await publishSiteBoundApprovals(approvalsPath, approvalsForRequest(getEvidenceReview(store, id)!, { approvedBy: "ford", note: "ok", at: "then" }));
      store.db.query("UPDATE steering_evidence_reviews SET status = 'approving', decided_by = 'ford', note = 'ok', decided_at = ?, revision = ? WHERE id = ?")
        .run(new Date(Date.now() - APPROVING_CLAIM_STALE_MS - 60_000).toISOString(), claimedAt, id);

      await expect(decideEvidenceReview(store, { gameId: "sms", id, revision: claimedAt, decision: "rejected", note: "no", approvalsPath, requeueAllowed: true }))
        .rejects.toThrow("already approving");
      expect(getEvidenceReview(store, id)!.status).toBe("approving");

      const resumed = await decideEvidenceReview(store, { gameId: "sms", id, revision: claimedAt, decision: "approved", note: "ok", approvalsPath, requeueAllowed: true });
      expect(resumed.review.status).toBe("approved");
      expect((await readSiteBoundApprovals(approvalsPath)).approvals.map((row) => row.review_id)).toEqual([id]);
    });
  });

  test("a live approving claim is not taken over", async () => {
    await withStore(async (store, dir) => {
      const { id } = recordEvidenceReviewRequest(store, SITE_A)!;
      const claimedAt = rev(store, id) + 1;
      store.db.query("UPDATE steering_evidence_reviews SET status = 'approving', decided_at = ?, revision = ? WHERE id = ?").run(new Date().toISOString(), claimedAt, id);
      await expect(decideEvidenceReview(store, { gameId: "sms", id, revision: claimedAt, decision: "approved", note: "ok", approvalsPath: join(dir, "a.jsonl"), requeueAllowed: true }))
        .rejects.toThrow("already approving");
    });
  });

  test("approval publication is serialized, all or none, and idempotent", async () => {
    await withStore(async (store, dir) => {
      const approvalsPath = join(dir, "approvals.jsonl");
      const ids = [1, 2, 3, 4, 5].map((n) => recordEvidenceReviewRequest(store, { ...SITE_A, groupDigest: `d${n}`, trustedBaseRev: "t", claimBaseRev: "rev-1" })!.id);
      const rows = ids.map((id) => approvalsForRequest(getEvidenceReview(store, id)!, { approvedBy: "ford", note: "ok", at: "now" }));
      await Promise.all(rows.map((pair) => publishSiteBoundApprovals(approvalsPath, pair)));
      await publishSiteBoundApprovals(approvalsPath, rows[0]!); // a retried publication adds nothing
      const { approvals, legacy } = await readSiteBoundApprovals(approvalsPath);
      expect(legacy).toBe(0);
      expect(approvals).toHaveLength(10);
      expect(new Set(approvals.map((row) => `${row.review_id}@${row.base_rev}`)).size).toBe(10);
      expect(existsSync(`${approvalsPath}.lock`)).toBe(false);
    });
  });

  test("approval puts a finished target back on the board, or defers to the next admission", async () => {
    await withStore((store) => {
      store.db.query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id) VALUES ('run-1', 'matched_percent', 100, 1, 'active', 'then', 'sms')").run();
      store.db.query("INSERT INTO epochs (id, run_id, ordinal, worker_pool_size, status, created_at) VALUES ('epoch-1', 'run-1', 1, 1, 'active', 'then')").run();
      store.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at, finished_at)
        VALUES ('target-1', 'epoch-1', 'run-1', 'u1::f__Fv', 'u1', 'f__Fv', 'src/a.c', 16, 90, 1, 0, 'finished', 'then', 'then')`).run();
      enqueueJob(store, { kind: "worker", dedupeKey: "target-1", gameId: "sms", runId: "run-1", payload: { epoch_target_id: "target-1" } });
      completeJob(store, claimNextJob(store, { kind: "worker", concurrencyLimit: 1, leaseMs: 60_000 })!.token, {});
      expect(requeueReviewedTarget(store, { ...TARGET, requeueAllowed: false }).status).toBe("deferred");
      const requeued = requeueReviewedTarget(store, { ...TARGET, requeueAllowed: true });
      expect(requeued).toMatchObject({ status: "requeued", epochTargetIds: ["target-1"] });
      expect(store.db.query("SELECT status FROM epoch_targets WHERE id = 'target-1'").get()).toEqual({ status: "admitted" });
      expect(requeueReviewedTarget(store, { ...TARGET, requeueAllowed: true }).status).toBe("none");
    });
  });

  test("SMS unit names: a report-named request is stored with the gate's unit, read either way, and requeues the prefixed epoch target", async () => {
    await withStore((store) => {
      const request = { baseRev: "r", siteFile: "a", siteLines: [1, 1] as [number, number], groupDigest: "d", callee: "c", calleeSymbol: "c__Fv", patch: "", evidence: {} };
      const report = { gameId: "sms", unit: "mario/Animal/AnimalBase", symbol: "f__Fv" };
      const gate = { ...report, unit: "Animal/AnimalBase" };
      const first = recordEvidenceReviewRequest(store, { ...report, ...request })!;
      expect(recordEvidenceReviewRequest(store, { ...gate, ...request })).toEqual({ id: first.id, outcome: "repeated" });
      expect(getEvidenceReview(store, first.id)).toMatchObject({ unit: gate.unit, occurrences: 2 });
      expect(openEvidenceReviewsForTarget(store, report).map((row) => row.id)).toEqual([first.id]);
      expect(openEvidenceReviewsForTarget(store, gate).map((row) => row.id)).toEqual([first.id]);
      expect(approvalsForRequest(getEvidenceReview(store, first.id)!, { approvedBy: "op", note: "ok", at: "now" })[0]).toMatchObject({ unit: gate.unit });

      store.db.query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id) VALUES ('run-1', 'matched_percent', 100, 1, 'active', 'then', 'sms')").run();
      store.db.query("INSERT INTO epochs (id, run_id, ordinal, worker_pool_size, status, created_at) VALUES ('epoch-1', 'run-1', 1, 1, 'active', 'then')").run();
      store.db.query(`INSERT INTO epoch_targets (id, epoch_id, run_id, target_key, unit, symbol, source_path, size, baseline_score, priority, admission_index, status, admitted_at, finished_at)
        VALUES ('target-1', 'epoch-1', 'run-1', 'mario/Animal/AnimalBase::f__Fv', 'mario/Animal/AnimalBase', 'f__Fv', 'src/a.c', 16, 90, 1, 0, 'finished', 'then', 'then')`).run();
      expect(requeueReviewedTarget(store, { ...gate, requeueAllowed: false })).toMatchObject({ status: "deferred" });
      expect(requeueReviewedTarget(store, { ...gate, unit: "Animal/Other", requeueAllowed: false })).toMatchObject({ status: "none" });
      // Melee keeps exact units: the short name is another unit.
      expect(openEvidenceReviewsForTarget(store, { ...gate, gameId: "melee" })).toEqual([]);
    });
  });

  test("a store behind migration 017 records and lists nothing", async () => {
    await withStore((store) => {
      store.db.exec("DROP TABLE steering_evidence_reviews");
      expect(recordEvidenceReviewRequest(store, {
        ...TARGET, baseRev: "r", siteFile: "a", siteLines: [1, 1], groupDigest: "d", callee: null, calleeSymbol: null, patch: "", evidence: {},
      })).toBeNull();
      expect(listEvidenceReviews(store, { gameId: "sms" })).toEqual([]);
      expect(openEvidenceReviewsForTarget(store, TARGET)).toEqual([]);
    });
  });
});
