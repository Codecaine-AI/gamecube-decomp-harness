/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import type { Dashboard, FormState } from "@/lib/format";
import { activeSessionFocus } from "@/pages/workspace/sessions/_lib/sessionRoute";
import { deriveSessionView, projectStateAction, projectStateReadModel } from "./model";

const form = {
  projectId: "melee",
  processName: "melee-live",
  usePathOverrides: false,
} as unknown as FormState;

describe("workspace session view", () => {
  test("projects canonical authority, session timeline, and action decisions without deriving client gates", () => {
    const dashboard = {
      projectState: {
        revision: 14,
        active_workflow: {
          kind: "run",
          workflow_id: "run-14",
          lease_id: "lease-14",
          status: "draining",
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
        session: {
          session_uuid: "session-14",
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
              session_uuid: "session-14",
              entry_kind: "save_point",
              entry_id: "save-14",
              occurred_at: "2026-08-12T12:01:00.000Z",
              payload: {},
              caused_by_event_id: "event-2",
            },
            {
              id: 1,
              session_uuid: "session-14",
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
            action_id: "session.save_point",
            subject_kind: "session",
            subject_id: "session-14",
            enabled: true,
            blocked_by: [],
            expected_transition: "evidence anchor recorded at the current commit",
            confirmation_required: false,
          },
          {
            action_id: "session.close",
            subject_kind: "session",
            subject_id: "session-14",
            enabled: false,
            blocked_by: [
              {
                code: "dispatch_lease_held",
                message: "A workflow still holds the dispatch lease.",
                source_kind: "project",
                source_id: "melee",
                recoverable: true,
              },
            ],
            expected_transition: "session becomes closed",
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
            expected_transition: "requested → ingesting after run drains",
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

    const state = projectStateReadModel(dashboard);

    expect(state?.active_workflow?.requested_handoff?.target_kind).toBe("sync");
    expect(state?.session?.timeline.map((entry) => entry.entry_id)).toEqual(["save-14", "epoch-1"]);
    expect(state?.session?.save_point_stale).toBe(true);
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
    expect(projectStateAction(state, "session.save_point")?.confirmation_required).toBe(false);
    expect(projectStateAction(state, "session.close")).toMatchObject({
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
    ].map((actionId) => projectStateAction(state, actionId)?.action_id)).toEqual([
      "sync.start",
      "sync.resolve_conflict",
      "sync.publish",
      "sync.cancel",
      "sync.recover",
    ]);
    expect(projectStateAction(state, "sync.recover")).toMatchObject({
      enabled: true,
      confirmation_required: true,
      expected_transition: "blocked → last durable stage or cancelled",
    });
  });

  test("preserves the server publication record after sync publish", () => {
    const dashboard = {
      projectState: {
        revision: 30,
        active_workflow: null,
        queued_dispatch_requests: [],
        session: null,
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

    expect(projectStateReadModel(dashboard)?.sync?.publication).toEqual({
      remote_application_id: "remote-30",
      prior_head: "old-head",
      new_head: "new-head",
      knowledge_revision: "knowledge-30",
      invalidated_ids: ["target-30"],
    });
  });

  test("projects the PR campaign, batches, pending work, activation, and campaign actions", () => {
    const series = {
      series_id: "series-1",
      batch_index: 0,
      status: "changes_requested",
      branch: "codex/split-01-player",
      upstream_pr_number: 1234,
      target_units: ["src/melee/player.c"],
      last_validation: { status: "passed" },
      blockers: [],
      work_items: [{
        item_id: "item-1",
        series_id: "series-1",
        source_kind: "github_review",
        source_id: "review-1",
        status: "pending",
        summary: "Address reviewer note",
        created_at: "2026-08-13T12:00:00.000Z",
        resolved_at: null,
      }],
    };
    const dashboard = {
      projectState: {
        revision: 31,
        active_workflow: null,
        queued_dispatch_requests: [],
        session: null,
        run: null,
        pr: {
          workflow_id: "campaign-31",
          status: "in_review",
          source_anchor: { save_point_id: "save-31", source_revision: "head-31" },
          publication_policy: { batch_size: 4 },
          blockers: [],
          series: [series],
          series_by_status: { changes_requested: [series] },
          next_batch: {
            batch_index: 1,
            series_ids: ["series-2"],
            validation_state: "blocked",
            blockers: [{
              code: "pr_series_unvalidated",
              message: "Series 2 is not validated.",
              source_kind: "pr_series",
              source_id: "series-2",
              recoverable: true,
            }],
            series: [{ ...series, series_id: "series-2", batch_index: 1, status: "prepared", upstream_pr_number: null }],
          },
          pending_work_items: {
            count: 1,
            items: [{ ...series.work_items[0], series_branch: series.branch }],
          },
          activation: {
            active: false,
            queued: false,
            lease_id: null,
            status: null,
            blockers: [],
          },
        },
        sync: null,
        latest_event_sequence: 31,
        available_actions: [{
          action_id: "pr.activate",
          subject_kind: "pr_campaign",
          subject_id: "campaign-31",
          enabled: true,
          blocked_by: [],
          expected_transition: "in_review → working",
          confirmation_required: false,
        }],
      },
    } as unknown as Dashboard;

    const state = projectStateReadModel(dashboard);

    expect(state?.pr).toMatchObject({
      workflow_id: "campaign-31",
      status: "in_review",
      source_anchor: { save_point_id: "save-31", source_revision: "head-31" },
      publication_policy: { batch_size: 4 },
      series: [{
        series_id: "series-1",
        upstream_pr_number: 1234,
        work_items: [{ item_id: "item-1", series_branch: "codex/split-01-player" }],
      }],
      next_batch: {
        batch_index: 1,
        validation_state: "blocked",
        series_ids: ["series-2"],
        blockers: [{ code: "pr_series_unvalidated" }],
      },
      pending_work_items: {
        count: 1,
        items: [{ item_id: "item-1", series_branch: "codex/split-01-player" }],
      },
      activation: { active: false, queued: false, lease_id: null, status: null },
    });
    expect(state?.pr?.series_by_status.changes_requested).toHaveLength(1);
    expect(state?.pr?.series_by_status.prepared).toEqual([]);
    expect(projectStateAction(state, "pr.activate")).toMatchObject({
      subject_kind: "pr_campaign",
      enabled: true,
      confirmation_required: false,
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
      projectState: {
        revision: 21,
        active_workflow: null,
        queued_dispatch_requests: [],
        session: null,
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
          action("run.pause", false, false),
          action("run.resume", false, false),
          action("run.hard_stop", true, true),
          action("run.cancel", true, true),
          action("run.recover", true, true),
        ],
      },
    } as unknown as Dashboard;

    const state = projectStateReadModel(dashboard);

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
      "run.pause",
      "run.resume",
      "run.hard_stop",
      "run.cancel",
      "run.recover",
    ]);
    expect(projectStateAction(state, "run.start")?.enabled).toBe(true);
    expect(projectStateAction(state, "run.resume")).toMatchObject({
      enabled: false,
      blocked_by: [{ code: "dispatch_lease_held" }],
      confirmation_required: false,
    });
    expect(projectStateAction(state, "run.recover")?.confirmation_required).toBe(true);
  });

  test("keeps canonical preparing sessions as concrete active session targets", () => {
    const dashboard = {
      projectSession: {
        id: "project-session:c850",
        sessionUuid: "c850",
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

    const view = deriveSessionView(dashboard, null, form);

    expect(view.mode).toBe("none");
    expect(view.activeSessionId).toBe("c850");
    expect(view.activeSessionLabel).toBe("Session c850");
    expect(view.recommendedSub).toBe("prepare");
    expect(view.newSessionBlocked).toBe(true);
    expect(view.newSessionReasons).toContain("canonical session is preparing / baseline");
    expect(activeSessionFocus(view)).toBe("c850");
  });

  test("uses the active route only when no concrete active session exists", () => {
    expect(activeSessionFocus({ activeSessionId: "", mode: "none" })).toBe("active");
  });

  test("treats migrated completed runs as terminal without accepting the retired complete status", () => {
    const dashboardFor = (status: string) => ({
      status: { run: { id: "run-legacy", status } },
      process: {},
      campaign: { head: {} },
      handoff: {},
      prs: {},
    }) as unknown as Dashboard;

    const completed = deriveSessionView(dashboardFor("completed"), null, form);
    expect(completed.mode).toBe("none");
    expect(completed.activeSessionId).toBe("");

    const retired = deriveSessionView(dashboardFor("complete"), null, form);
    expect(retired.mode).toBe("run");
    expect(retired.activeSessionId).toBe("run-legacy");
  });

  test("derives prepare sync summaries from canonical and legacy worktree fields", () => {
    const dashboard = {
      projectSession: {
        id: "project-session:c850",
        sessionUuid: "c850",
        status: "active",
        phase: "preparing",
        activeSubphase: "sync_intake",
        gates: {},
        blockers: [],
        phases: {
          preparing: {
            status: "active",
            subphase: "sync_intake",
            sync: {
              status: "complete",
              beforeRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              afterRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              mergedPrs: [2731, "2732"],
              mainWorktreePath: "/repo/projects/melee/worktrees/upstream-current",
              sessionWorktreePath: "/repo/projects/melee/worktrees/sessions/c850/current",
            },
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

    const view = deriveSessionView(dashboard, null, form);

    expect(view.prepareState.syncDone).toBe(true);
    expect(view.prepareState.headShortSha).toBe("bbbbbbbbbb");
    expect(view.prepareState.upstreamChanged).toBe(true);
    expect(view.prepareState.mergedPrs).toEqual([2731, 2732]);
    expect(view.prepareState.pendingIntakePrCount).toBe(2);
    expect(view.prepareState.upstreamWorktreePath).toBe("/repo/projects/melee/worktrees/upstream-current");
    expect(view.prepareState.sessionCurrentWorktreePath).toBe("/repo/projects/melee/worktrees/sessions/c850/current");
  });

  test("keeps PR index debt separate from git movement after resync", () => {
    const dashboard = {
      projectSession: {
        id: "project-session:c850",
        sessionUuid: "c850",
        status: "active",
        phase: "preparing",
        activeSubphase: "sync_intake",
        gates: {},
        blockers: [],
        phases: {
          preparing: {
            status: "active",
            subphase: "sync_intake",
            sync: {
              status: "complete",
              beforeRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              afterRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              mergedPrs: [],
              prIndexDebt: {
                status: "available",
                knownMergedPrs: 2518,
                agentIndexedMergedPrs: 2461,
                pendingMergedAgentPrs: 57,
                pendingAgentPrs: 63,
              },
            },
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

    const view = deriveSessionView(dashboard, null, form);

    expect(view.prepareState.syncDone).toBe(true);
    expect(view.prepareState.upstreamChanged).toBe(false);
    expect(view.prepareState.mergedPrs).toEqual([]);
    expect(view.prepareState.prIndexDebtKnown).toBe(true);
    expect(view.prepareState.pendingMergedPrIndexCount).toBe(57);
    expect(view.prepareState.pendingPrIndexCount).toBe(63);
    expect(view.prepareState.pendingIntakePrCount).toBe(63);
  });

  test("derives prepare intake item counts for retryable PR intake", () => {
    const dashboard = {
      projectSession: {
        id: "project-session:c850",
        sessionUuid: "c850",
        status: "active",
        phase: "preparing",
        activeSubphase: "processing_prs",
        gates: {},
        blockers: [],
        phases: {
          preparing: {
            status: "active",
            subphase: "processing_prs",
            sync: { status: "complete", mergedPrs: [] },
            intake: {
              status: "failed",
              itemCounts: {
                pending: 2,
                running: 1,
                complete: 4,
                failed: 3,
                retryable: 3,
                total: 10,
              },
            },
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

    const view = deriveSessionView(dashboard, null, form);

    expect(view.prepareState.pendingIntakePrCount).toBe(2);
    expect(view.prepareState.runningIntakeItemCount).toBe(1);
    expect(view.prepareState.completedIntakeItemCount).toBe(4);
    expect(view.prepareState.failedIntakeItemCount).toBe(3);
    expect(view.prepareState.retryableIntakeItemCount).toBe(3);
    expect(view.prepareState.totalIntakeItemCount).toBe(10);
  });
});
