/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import type { Dashboard, FormState } from "@/lib/format";
import { activeCycleFocus } from "@/pages/workspace/cycles/_lib/cycleRoute";
import { deriveCycleView, harnessStateAction, harnessStateCompatibilityAction, harnessStateReadModel } from "./model";

const form = {
  gameId: "melee",
  processName: "melee-live",
  usePathOverrides: false,
} as unknown as FormState;

const canonicalActionIds = [
  "run.start", "run.resume", "run.hard_stop", "run.cancel", "run.recover",
  "sync.start", "sync.resolve_conflict", "sync.publish", "sync.cancel", "sync.recover",
  "cycle.save_point", "cycle.close", "knowledge.process",
] as const;

describe("canonical HarnessState DTO", () => {
  test("preserves canonical summaries, all 13 actions, and compatibility separation", () => {
    const action = (action_id: string) => ({
      action_id,
      subject_kind: action_id.split(".")[0],
      subject_id: `${action_id}-subject`,
      enabled: action_id === "knowledge.process",
      blocked_by: action_id === "knowledge.process" ? [] : [{
        code: "fixture_blocker", message: "Fixture blocker", source_kind: "game",
        source_id: "melee", recoverable: true,
      }],
      expected_transition: `${action_id} transition`,
      confirmation_required: action_id === "cycle.close",
    });
    const dashboard = {
      harnessState: {
        game_id: "melee",
        harness_revision: 1842,
        cycle: null,
        active_workflow: {
          kind: "run", workflow_id: "run-1", lease_id: "lease-1", status: "blocked",
          acquired_at: "2026-08-14T10:00:00Z", heartbeat_at: "2026-08-14T10:01:00Z",
          headline: "Run waits for claims", blockers: [action("run.start").blocked_by[0]],
        },
        queued_dispatch_requests: [{
          kind: "sync", workflow_id: "sync-1", reason: "upstream moved",
          requested_at: "2026-08-14T10:02:00Z", requested_by: "operator",
        }],
        run: null,
        knowledge: {
          published_revision: "knowledge-381", queued: 6, processing: 1, waiting: 2, failed: 1,
          oldest_pending_at: "2026-08-14T09:00:00Z",
          active_lease: { id: "knowledge-lease-1", expires_at: "2026-08-14T10:05:00Z", fence: 7 },
          retry: { next_attempt_at: "2026-08-14T10:03:00Z", attempts: 2 },
          recent_failures: [{ job_id: "job-9", worker_state_id: "worker-9", error: "materializer failed", updated_at: "2026-08-14T09:59:00Z", attempts: 3 }],
        },
        sync: null,
        active_operations: [{ operation_id: "operation-1", status: "running", trace_id: "trace-1" }],
        recent_events: [{ event_type: "game.dispatch_requested", sequence: 92811, event_id: "event-1" }],
        available_actions: canonicalActionIds.map(action),
        compatibility_actions: [action("pr.adopt_legacy")],
      },
    } as unknown as Dashboard;

    const state = harnessStateReadModel(dashboard);
    expect(state?.game_id).toBe("melee");
    expect(state?.harness_revision).toBe(1842);
    expect(state?.active_workflow?.headline).toBe("Run waits for claims");
    expect(state?.queued_dispatch_requests[0]?.requested_by).toBe("operator");
    expect(state?.knowledge.active_lease?.fence).toBe(7);
    expect(state?.knowledge.retry?.next_attempt_at).toBe("2026-08-14T10:03:00Z");
    expect(state?.knowledge.recent_failures[0]?.attempts).toBe(3);
    expect(state?.active_operations[0]?.trace_id).toBe("trace-1");
    expect(state?.recent_events[0]?.event_id).toBe("event-1");
    expect(state?.available_actions.map(({ action_id }) => action_id)).toEqual([...canonicalActionIds]);
    expect(harnessStateAction(state, "pr.adopt_legacy")).toBeNull();
    expect(harnessStateCompatibilityAction(state, "pr.adopt_legacy")?.subject_kind).toBe("pr");
  });
});

describe("workspace cycle view", () => {
  test("projects canonical authority, cycle timeline, and action decisions without deriving client gates", () => {
    const dashboard = {
      harnessState: {
        revision: 14,
        active_workflow: {
          kind: "run",
          workflow_id: "run-14",
          lease_id: "lease-14",
          status: "active",
          acquired_at: "2026-08-12T12:00:00.000Z",
          heartbeat_at: "2026-08-12T12:01:00.000Z",
          requested_handoff: {
            target_kind: "sync",
            target_workflow_id: "sync-15",
            reason: "upstream moved",
            requested_at: "2026-08-12T12:02:00.000Z",
          },
          blockers: [],
        },
        queued_dispatch_requests: [],
        cycle: {
          cycle_uuid: "cycle-14",
          head_revision: "abc123",
          status: "active",
          latest_save_point: {
            id: "save-14",
            triggerKind: "manual",
            label: "before sync",
            commitSha: "abc123",
            matchedCodePercent: 93.2,
            createdAt: "2026-08-12T12:01:00.000Z",
          },
          save_point_stale: true,
          timeline: [
            {
              id: 2,
              cycle_uuid: "cycle-14",
              entry_kind: "save_point",
              entry_id: "save-14",
              occurred_at: "2026-08-12T12:01:00.000Z",
              payload: {},
              caused_by_event_id: "event-2",
            },
            {
              id: 1,
              cycle_uuid: "cycle-14",
              entry_kind: "epoch_completed",
              entry_id: "epoch-1",
              occurred_at: "2026-08-12T12:00:00.000Z",
              payload: {},
              caused_by_event_id: "event-1",
            },
          ],
        },
        sync: {
          workflow_id: "sync-15",
          status: "blocked",
          blockers: [{
            code: "upstream_moved_after_validation",
            message: "Validated upstream-15, but upstream is now upstream-16.",
            source_kind: "sync",
            source_id: "sync-15",
            recoverable: true,
          }],
          intake: {
            upstream_from: "upstream-14",
            upstream_to: "upstream-15",
            merged_pr_count: 3,
            corpus_batches: ["corpus-a", "corpus-b"],
            knowledge_only: false,
          },
          staging: {
            epochs_applied: 4,
            epochs_total: 6,
            minor_auto_resolved_count: 2,
            conflicts_awaiting_operator: 1,
            conflicts: ["src/melee/example.c"],
          },
          pr_reconciliation: {
            total: 2,
            clean: 1,
            auto_resolved: 1,
            needs_operator: 0,
            pushed: 0,
            pending_pushes: 2,
          },
          publish_preview: {
            prior_head: "abc123",
            new_head: "def456",
            series_pushes: 2,
          },
          publication: null,
          staleness: {
            stale: true,
            validated_upstream: "upstream-15",
            observed_upstream: "upstream-16",
            blocker: {
              code: "upstream_moved_after_validation",
              message: "Validated upstream-15, but upstream is now upstream-16.",
              source_kind: "sync",
              source_id: "sync-15",
              recoverable: true,
            },
            revalidate_action_id: "sync.cancel",
          },
        },
        latest_event_sequence: 2,
        available_actions: [
          {
            action_id: "cycle.save_point",
            subject_kind: "cycle",
            subject_id: "cycle-14",
            enabled: true,
            blocked_by: [],
            expected_transition: "evidence anchor recorded at the current commit",
            confirmation_required: false,
          },
          {
            action_id: "cycle.close",
            subject_kind: "cycle",
            subject_id: "cycle-14",
            enabled: false,
            blocked_by: [
              {
                code: "dispatch_lease_held",
                message: "A workflow still holds the dispatch lease.",
                source_kind: "game",
                source_id: "melee",
                recoverable: true,
              },
            ],
            expected_transition: "cycle becomes closed",
            confirmation_required: true,
          },
          {
            action_id: "sync.start",
            subject_kind: "sync",
            subject_id: "sync-15",
            enabled: false,
            blocked_by: [{
              code: "sync_staging_awaits_decision",
              message: "Staging awaits a decision.",
              source_kind: "sync",
              source_id: "sync-15",
              recoverable: true,
            }],
            expected_transition: "requested → ingesting after run stops",
            confirmation_required: false,
          },
          {
            action_id: "sync.resolve_conflict",
            subject_kind: "sync",
            subject_id: "sync-15",
            enabled: false,
            blocked_by: [{
              code: "sync_not_waiting_on_conflict",
              message: "Sync is not waiting on an operator conflict.",
              source_kind: "sync",
              source_id: "sync-15",
              recoverable: true,
            }],
            expected_transition: "blocked → reconciling",
            confirmation_required: false,
          },
          {
            action_id: "sync.publish",
            subject_kind: "sync",
            subject_id: "sync-15",
            enabled: false,
            blocked_by: [{
              code: "upstream_moved_after_validation",
              message: "Validated upstream-15, but upstream is now upstream-16.",
              source_kind: "sync",
              source_id: "sync-15",
              recoverable: true,
            }],
            expected_transition: "validated → publishing → published",
            confirmation_required: true,
          },
          {
            action_id: "sync.cancel",
            subject_kind: "sync",
            subject_id: "sync-15",
            enabled: true,
            blocked_by: [],
            expected_transition: "blocked → cancelled",
            confirmation_required: true,
          },
          {
            action_id: "sync.recover",
            subject_kind: "sync",
            subject_id: "sync-15",
            enabled: true,
            blocked_by: [],
            expected_transition: "blocked → last durable stage or cancelled",
            confirmation_required: true,
          },
        ],
      },
    } as unknown as Dashboard;

    const state = harnessStateReadModel(dashboard);

    expect(state?.active_workflow?.requested_handoff?.target_kind).toBe("sync");
    expect(state?.cycle?.timeline.map((entry) => entry.entry_id)).toEqual(["save-14", "epoch-1"]);
    expect(state?.cycle?.save_point_stale).toBe(true);
    expect(state?.sync).toEqual({
      workflow_id: "sync-15",
      status: "blocked",
      blockers: [{
        code: "upstream_moved_after_validation",
        message: "Validated upstream-15, but upstream is now upstream-16.",
        source_kind: "sync",
        source_id: "sync-15",
        recoverable: true,
      }],
      intake: {
        upstream_from: "upstream-14",
        upstream_to: "upstream-15",
        merged_pr_count: 3,
        corpus_batches: ["corpus-a", "corpus-b"],
        knowledge_only: false,
      },
      staging: {
        epochs_applied: 4,
        epochs_total: 6,
        minor_auto_resolved_count: 2,
        conflicts_awaiting_operator: 1,
        conflicts: ["src/melee/example.c"],
      },
      knowledge_jobs: null,
      discord: null,
      pr_reconciliation: {
        total: 2,
        clean: 1,
        auto_resolved: 1,
        needs_operator: 0,
        pushed: 0,
        pending_pushes: 2,
      },
      publish_preview: {
        prior_head: "abc123",
        new_head: "def456",
        series_pushes: 2,
      },
      publication: null,
      staleness: {
        stale: true,
        validated_upstream: "upstream-15",
        observed_upstream: "upstream-16",
        blocker: {
          code: "upstream_moved_after_validation",
          message: "Validated upstream-15, but upstream is now upstream-16.",
          source_kind: "sync",
          source_id: "sync-15",
          recoverable: true,
        },
        revalidate_action_id: "sync.cancel",
      },
    });
    expect(harnessStateAction(state, "cycle.save_point")?.confirmation_required).toBe(false);
    expect(harnessStateAction(state, "cycle.close")).toMatchObject({
      enabled: false,
      confirmation_required: true,
      blocked_by: [{ code: "dispatch_lease_held" }],
    });
    expect([
      "sync.start",
      "sync.resolve_conflict",
      "sync.publish",
      "sync.cancel",
      "sync.recover",
    ].map((actionId) => harnessStateAction(state, actionId)?.action_id)).toEqual([
      "sync.start",
      "sync.resolve_conflict",
      "sync.publish",
      "sync.cancel",
      "sync.recover",
    ]);
    expect(harnessStateAction(state, "sync.recover")).toMatchObject({
      enabled: true,
      confirmation_required: true,
      expected_transition: "blocked → last durable stage or cancelled",
    });
  });

  test("preserves the server publication record after sync publish", () => {
    const dashboard = {
      harnessState: {
        revision: 30,
        active_workflow: null,
        queued_dispatch_requests: [],
        cycle: null,
        run: null,
        sync: {
          workflow_id: "sync-30",
          status: "published",
          blockers: [],
          intake: {
            upstream_from: "old-head",
            upstream_to: "upstream-head",
            merged_pr_count: 1,
            corpus_batches: [],
            knowledge_only: false,
          },
          staging: null,
          pr_reconciliation: {
            total: 1,
            clean: 1,
            auto_resolved: 0,
            needs_operator: 0,
            pushed: 1,
            pending_pushes: 0,
          },
          publish_preview: {
            prior_head: "old-head",
            new_head: "new-head",
            series_pushes: 1,
          },
          publication: {
            remote_application_id: "remote-30",
            prior_head: "old-head",
            new_head: "new-head",
            knowledge_revision: "knowledge-30",
            invalidated_ids: ["target-30"],
          },
          staleness: {
            stale: false,
            validated_upstream: "upstream-head",
            observed_upstream: "upstream-head",
            blocker: null,
            revalidate_action_id: null,
          },
        },
        latest_event_sequence: 30,
        available_actions: [],
      },
    } as unknown as Dashboard;

    expect(harnessStateReadModel(dashboard)?.sync?.publication).toEqual({
      remote_application_id: "remote-30",
      prior_head: "old-head",
      new_head: "new-head",
      knowledge_revision: "knowledge-30",
      invalidated_ids: ["target-30"],
    });
  });

  test("projects the canonical run summary, six server-owned actions, and recovery points", () => {
    const action = (actionId: string, enabled: boolean, confirmationRequired: boolean) => ({
      action_id: actionId,
      subject_kind: "run",
      subject_id: "run-21",
      enabled,
      blocked_by: enabled ? [] : [{
        code: "dispatch_lease_held",
        message: "Sync holds the dispatch lease.",
        source_kind: "sync",
        source_id: "sync-8",
        recoverable: true,
      }],
      expected_transition: `${actionId} expected transition`,
      confirmation_required: confirmationRequired,
    });
    const dashboard = {
      harnessState: {
        revision: 21,
        active_workflow: null,
        queued_dispatch_requests: [],
        cycle: null,
        run: {
          workflow_id: "run-21",
          status: "paused",
          scheduler_condition: "waiting",
          active_epoch: { epoch_id: "epoch-4", ordinal: 4 },
          admitted: 8,
          claimed: 5,
          running: 2,
          progress: {
            baseline_score: 72.642,
            confirmed_score: 73.147,
            tentative_changes: 2,
            confirmed_changes: 31,
            regressed_changes: 1,
          },
          recovery_points: [{
            event_id: "event-recovered-20",
            sequence: 20,
            occurred_at: "2026-08-13T12:00:00.000Z",
            recovery_reason: "stale dispatch lease",
            cancelled_claim_ids: ["claim-2"],
            cancelled_operation_ids: ["operation-3"],
            resulting_status: "paused",
          }],
        },
        latest_event_sequence: 20,
        available_actions: [
          action("run.start", true, false),
          action("run.resume", false, false),
          action("run.hard_stop", true, true),
          action("run.cancel", true, true),
          action("run.recover", true, true),
        ],
      },
    } as unknown as Dashboard;

    const state = harnessStateReadModel(dashboard);

    expect(state?.run).toMatchObject({
      workflow_id: "run-21",
      status: "paused",
      scheduler_condition: "waiting",
      active_epoch: { epoch_id: "epoch-4", ordinal: 4 },
      admitted: 8,
      claimed: 5,
      running: 2,
      progress: {
        baseline_score: 72.642,
        confirmed_score: 73.147,
        tentative_changes: 2,
        confirmed_changes: 31,
        regressed_changes: 1,
      },
      recovery_points: [{
        event_id: "event-recovered-20",
        recovery_reason: "stale dispatch lease",
        cancelled_claim_ids: ["claim-2"],
        cancelled_operation_ids: ["operation-3"],
      }],
    });
    expect(state?.available_actions.map((candidate) => candidate.action_id)).toEqual([
      "run.start",
      "run.resume",
      "run.hard_stop",
      "run.cancel",
      "run.recover",
    ]);
    expect(harnessStateAction(state, "run.start")?.enabled).toBe(true);
    expect(harnessStateAction(state, "run.resume")).toMatchObject({
      enabled: false,
      blocked_by: [{ code: "dispatch_lease_held" }],
      confirmation_required: false,
    });
    expect(harnessStateAction(state, "run.recover")?.confirmation_required).toBe(true);
  });

  test("keeps canonical preparing cycles as concrete active cycle targets", () => {
    const dashboard = {
      cycle: {
        id: "cycle:c850",
        cycleUuid: "c850",
        status: "active",
        phase: "preparing",
        activeSubphase: "baseline",
        gates: {},
        blockers: [],
        phases: {
          preparing: { status: "active", subphase: "baseline" },
          running: {},
          pr: {},
          complete: {},
        },
      },
      status: { run: {} },
      process: {},
      campaign: { head: {} },
      handoff: {},
      prs: {},
    } as unknown as Dashboard;

    const view = deriveCycleView(dashboard, null, form);

    expect(view.mode).toBe("none");
    expect(view.activeCycleId).toBe("c850");
    expect(view.activeCycleLabel).toBe("Cycle c850");
    expect(view.recommendedSub).toBe("run");
    expect(view.newCycleBlocked).toBe(true);
    expect(view.newCycleReasons).toContain("canonical cycle is preparing / baseline");
    expect(activeCycleFocus(view)).toBe("c850");
  });

  test("uses the active route only when no concrete active cycle exists", () => {
    expect(activeCycleFocus({ activeCycleId: "", mode: "none" })).toBe("active");
  });

  test("treats migrated completed runs as terminal without accepting the retired complete status", () => {
    const dashboardFor = (status: string) => ({
      status: { run: { id: "run-legacy", status } },
      process: {},
      campaign: { head: {} },
      handoff: {},
      prs: {},
    }) as unknown as Dashboard;

    const completed = deriveCycleView(dashboardFor("completed"), null, form);
    expect(completed.mode).toBe("none");
    expect(completed.activeCycleId).toBe("");

    const retired = deriveCycleView(dashboardFor("complete"), null, form);
    expect(retired.mode).toBe("run");
    expect(retired.activeCycleId).toBe("run-legacy");
  });

  test("derives run-setup completion flags from the canonical preparing phase", () => {
    const dashboard = {
      cycle: {
        id: "cycle:c850",
        cycleUuid: "c850",
        status: "active",
        phase: "preparing",
        activeSubphase: "baseline",
        gates: {},
        blockers: [],
        phases: {
          preparing: {
            status: "active",
            subphase: "baseline",
            sync: { status: "complete" },
            intake: { status: "complete" },
            knowledge: { status: "complete" },
            baseline: { status: "complete", completedAt: "2026-08-19T00:00:00Z" },
          },
          running: {},
          pr: {},
          complete: {},
        },
      },
      status: { run: {} },
      process: {},
      campaign: { head: {} },
      handoff: {},
      prs: {},
    } as unknown as Dashboard;

    const view = deriveCycleView(dashboard, null, form);

    expect(view.prepareState.intakeDone).toBe(true);
    expect(view.prepareState.knowledgeDone).toBe(true);
    expect(view.prepareState.baselineDone).toBe(true);
    expect(view.prepareState.readyToStartRun).toBe(true);
    expect(view.recommendedSub).toBe("run");
    expect(view.modeLabel).toBe("Not started");
  });
});
