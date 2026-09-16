/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test";
import type { DispatchStateActionProjection, HarnessStateViewModel } from "@/pages/workspace/_lib/types";
import { defaultWorkflowSubTab } from "./workflow-subtabs";

function state(overrides: Partial<HarnessStateViewModel>): HarnessStateViewModel {
  return {
    available_actions: [],
    compatibility_actions: [],
    repo_sync: null,
    run: null,
    sync: null,
    ...overrides,
  } as HarnessStateViewModel;
}

function action(overrides: Partial<DispatchStateActionProjection> = {}): DispatchStateActionProjection {
  return {
    action_id: "run.cancel",
    subject_kind: "run",
    subject_id: "run-1",
    enabled: true,
    blocked_by: [],
    expected_transition: "Run cancels",
    confirmation_required: true,
    ...overrides,
  };
}

describe("defaultWorkflowSubTab", () => {
  test("defaults to config when neither workflow needs a decision", () => {
    expect(defaultWorkflowSubTab("sync", state({}))).toBe("config");
    expect(defaultWorkflowSubTab("run", state({}))).toBe("config");
  });

  test("opens sync actions for blocked syncs, conflicts, or a pending repo sync", () => {
    expect(defaultWorkflowSubTab("sync", state({ sync: { status: "blocked" } as HarnessStateViewModel["sync"] }))).toBe("actions");
    expect(defaultWorkflowSubTab("sync", state({ sync: { status: "ingesting", staging: { conflicts_awaiting_operator: 2 } } as HarnessStateViewModel["sync"] }))).toBe("actions");
    expect(defaultWorkflowSubTab("sync", state({ repo_sync: { needs_sync: true } as HarnessStateViewModel["repo_sync"] }))).toBe("actions");
  });

  test("opens run actions for failed or blocked runs", () => {
    expect(defaultWorkflowSubTab("run", state({ run: { status: "failed" } as HarnessStateViewModel["run"] }))).toBe("actions");
    expect(defaultWorkflowSubTab("run", state({ run: { status: "blocked" } as unknown as HarnessStateViewModel["run"] }))).toBe("actions");
  });

  test("opens run actions only for enabled actions that require confirmation", () => {
    expect(defaultWorkflowSubTab("run", state({ available_actions: [action()] }))).toBe("actions");
    expect(defaultWorkflowSubTab("run", state({ available_actions: [action({ enabled: false })] }))).toBe("config");
    expect(defaultWorkflowSubTab("run", state({ available_actions: [action({ confirmation_required: false })] }))).toBe("config");
  });
});
