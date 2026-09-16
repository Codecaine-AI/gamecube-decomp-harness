import { describe, expect, test } from "bun:test";
import type { Dashboard, FormState } from "@/lib/format";
import { deriveHarnessView, harnessStateAction, harnessStateReadModel } from "./model";
const form = { gameId: "melee", processName: "melee-live" } as FormState;
function dashboard(): Dashboard { return {
  status: { run: {}, activeClaims: 0 }, process: {},
  harnessState: { game_id: "melee", harness_revision: 1, state: {
    identity: { game_id: "melee", harness_id: "harness-1", revision: 4 },
    source: { head: "accepted", worktree: "/games/melee/workspace/checkout", upstream_revision: "upstream", configuration_revision: "config" },
    execution: { desired: "paused", workflow: "none", status: "paused", blockers: [] },
    readiness: { build: "ready", sandbox: "ready", sources: "ready", evidence: "ready" },
    history: { run_id: "run-1", epoch_id: null, sync_id: null, save_point_id: "save-1", timeline_cursor: 0 },
  }, repo_sync: { head: "accepted", upstream_ref: "origin/master", needs_sync: false },
  available_actions: [{ action_id: "run.resume", subject_kind: "run", subject_id: "run-1", enabled: true, blocked_by: [], expected_transition: "paused to active", confirmation_required: false }],
  run: { workflow_id: "run-1", status: "paused", scheduler_condition: "idle", admitted: 0, claimed: 0, running: 0, progress: {}, recovery_points: [] },
  knowledge: { queued: 2, processing: 1, waiting: 0, failed: 0 }, timeline: [] },
} as unknown as Dashboard; }
describe("canonical harness projection", () => {
  test("uses only harness ownership and server action authority", () => {
    const state = harnessStateReadModel(dashboard())!;
    expect(state.state?.identity.harness_id).toBe("harness-1");
    expect(state.repo_sync?.head).toBe("accepted");
    expect(harnessStateAction(state, "run.resume")?.enabled).toBe(true);
    expect(harnessStateAction(state, "run.start")).toBeNull();
    expect("cycle" in state).toBe(false);
    expect("compatibility_actions" in state).toBe(false);
  });
  test("ready paused harness enables the Run request", () => {
    const view = deriveHarnessView(dashboard(), null, form);
    expect(view.harnessId).toBe("harness-1");
    expect(view.prepareState.readyToStartRun).toBe(true);
    expect(view.recommendedSub).toBe("run");
    expect(view.harnessState?.state?.execution.desired).toBe("paused");
  });
  test("required readiness and active Sync block worker start", () => {
    const data = dashboard();
    const raw = data.harnessState as any;
    raw.state.readiness.sandbox = "pending";
    expect(deriveHarnessView(data, null, form).canStartWorkers).toBe(false);
    raw.state.readiness.sandbox = "ready";
    raw.state.execution.workflow = "sync";
    const view = deriveHarnessView(data, null, form);
    expect(view.prepareState.readyToStartRun).toBe(false);
    expect(view.recommendedSub).toBe("sync");
  });
  test("missing current evidence stays unknown", () => {
    const state = harnessStateReadModel(dashboard())!;
    expect(state.run?.progress.baseline_score).toBeNull();
    expect(state.run?.progress.confirmed_score).toBeNull();
  });
});
