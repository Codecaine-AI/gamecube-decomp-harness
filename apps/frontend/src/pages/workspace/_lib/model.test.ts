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
        ],
      },
    } as unknown as Dashboard;

    const state = projectStateReadModel(dashboard);

    expect(state?.active_workflow?.requested_handoff?.target_kind).toBe("sync");
    expect(state?.session?.timeline.map((entry) => entry.entry_id)).toEqual(["save-14", "epoch-1"]);
    expect(state?.session?.save_point_stale).toBe(true);
    expect(projectStateAction(state, "session.save_point")?.confirmation_required).toBe(false);
    expect(projectStateAction(state, "session.close")).toMatchObject({
      enabled: false,
      confirmation_required: true,
      blocked_by: [{ code: "dispatch_lease_held" }],
    });
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
