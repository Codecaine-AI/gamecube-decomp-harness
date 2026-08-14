import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StateStore } from "@server/core/orchestrator-state";
import { immediateTransaction, openState } from "@server/core/orchestrator-state";
import { PROJECT_EVENT_REGISTRY, projectEventContract } from "./event-registry.js";
import {
  appendProjectEvent,
  eventSpan,
  eventsForSubject,
  latestSequence,
  listProjectEvents,
  newSpanId,
  type JsonObject,
  type ProjectEventEnvelope,
} from "./events.js";

const tempDirs: string[] = [];

function openTestStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "project-events-"));
  tempDirs.push(dir);
  return openState(dir);
}

function envelope(
  eventType = "project.dispatch_requested",
  subjectKind = "project",
  payload: JsonObject = {
    requested_kind: "sync",
    workflow_id: "sync-1",
    current_lease_holder: null,
    reason: "operator request",
  },
): ProjectEventEnvelope {
  return {
    eventType,
    projectId: "melee",
    subjectKind,
    subjectId: subjectKind === "project" ? "melee" : `${subjectKind}-1`,
    correlationId: "workflow-1",
    causationId: "command-1",
    traceId: "trace-1",
    ...eventSpan(newSpanId()),
    actor: "operator",
    occurredAt: "2026-08-12T16:00:00.000Z",
    payload,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("project event registry", () => {
  test("rejects unknown event types, subject mismatches, and schema-version drift", () => {
    const store = openTestStore();
    try {
      expect(() => appendProjectEvent(store.db, envelope("unknown.accepted"))).toThrow("Unknown project event type");
      expect(() => appendProjectEvent(store.db, envelope("project.dispatch_requested", "run"))).toThrow(
        "does not accept subject kind run",
      );
      expect(() => appendProjectEvent(store.db, { ...envelope(), schemaVersion: 2 })).toThrow(
        "does not match registry version 1",
      );
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test.each([
    ["project", "project.dispatch_requested", "project"],
    ["run", "run.drafted", "run"],
    ["sync", "sync.requested", "sync_workflow"],
    ["session", "session.opened", "session"],
    ["pr", "pr.campaign_opened", "pr_campaign"],
    ["knowledge", "knowledge.job_enqueued", "knowledge_job"],
  ] as const)("rejects missing required payload facts for the %s domain", (_domain, eventType, subjectKind) => {
    const store = openTestStore();
    try {
      expect(() => appendProjectEvent(store.db, envelope(eventType, subjectKind, {}))).toThrow(
        `Project event ${eventType} is missing required payload facts`,
      );
    } finally {
      store.db.close();
    }
  });

  test("rejects wrong payload types, null required facts, unregistered extras, and disallowed actors", () => {
    const store = openTestStore();
    try {
      expect(() => appendProjectEvent(store.db, envelope(
        "project.dispatch_requested",
        "project",
        {
          requested_kind: 42,
          workflow_id: "sync-1",
          current_lease_holder: null,
          reason: "operator request",
        },
      ))).toThrow("payload fact requested_kind must be string");
      expect(() => appendProjectEvent(store.db, envelope(
        "project.dispatch_requested",
        "project",
        {
          requested_kind: "sync",
          workflow_id: "sync-1",
          current_lease_holder: null,
          reason: null,
        },
      ))).toThrow("payload fact reason must not be null");
      expect(() => appendProjectEvent(store.db, {
        ...envelope(),
        actor: "external_observer",
      })).toThrow("does not allow actor external_observer");
      expect(() => appendProjectEvent(store.db, envelope(
        "project.dispatch_requested",
        "project",
        {
          requested_kind: "sync",
          workflow_id: "sync-1",
          current_lease_holder: null,
          reason: "operator request",
          undocumented: true,
        },
      ))).toThrow("payload contains unregistered facts: undocumented");
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("keeps every v1 registry contract deeply immutable, closed, and structurally complete", () => {
    const classifications = new Set([
      "status_transition",
      "progress",
      "lifecycle",
      "recovery",
      "coordination",
    ]);
    expect(Object.isFrozen(PROJECT_EVENT_REGISTRY)).toBe(true);
    for (const [eventType, contract] of Object.entries(PROJECT_EVENT_REGISTRY)) {
      expect(eventType.trim().length).toBeGreaterThan(0);
      expect(contract.schemaVersion).toBe(1);
      expect(contract.subjectKinds.length).toBeGreaterThan(0);
      expect(contract.subjectKinds.every((kind) => kind.trim().length > 0)).toBe(true);
      expect(classifications.has(contract.classification)).toBe(true);
      expect(contract.allowedActors.length).toBeGreaterThan(0);
      expect(contract.extras).toBe("forbid");
      expect(Object.isFrozen(contract)).toBe(true);
      expect(Object.isFrozen(contract.subjectKinds)).toBe(true);
      expect(Object.isFrozen(contract.allowedActors)).toBe(true);
      expect(Object.isFrozen(contract.payloadFields)).toBe(true);
      for (const field of Object.values(contract.payloadFields)) {
        expect(typeof field.required).toBe("boolean");
        expect(typeof field.nullable).toBe("boolean");
        expect(Object.isFrozen(field)).toBe(true);
      }
    }
    const contract = projectEventContract("project.dispatch_requested");
    expect(() => {
      (contract as { schemaVersion: number }).schemaVersion = 2;
    }).toThrow();
    expect(() => {
      (contract.payloadFields.reason as { nullable: boolean }).nullable = true;
    }).toThrow();
  });

  test("enforces required nonnullable from/to facts on every status transition", () => {
    for (const [eventType, contract] of Object.entries(PROJECT_EVENT_REGISTRY)) {
      if (contract.classification !== "status_transition") continue;
      expect(contract.payloadFields.from_status).toEqual({ type: "string", required: true, nullable: false });
      expect(contract.payloadFields.to_status).toEqual({ type: "string", required: true, nullable: false });
      expect(contract.payloadFields).not.toHaveProperty("previous_status");
      expect(contract.payloadFields).not.toHaveProperty("status");
      expect(eventType.trim().length).toBeGreaterThan(0);
    }

    const store = openTestStore();
    const transition = { from_status: "ready", to_status: "active", lease_id: "lease-1" } satisfies JsonObject;
    try {
      const invalidTransitions: JsonObject[] = [
        { previous_status: "ready", status: "active", lease_id: "lease-1" },
        { ...transition, from_status: null },
        { ...transition, to_status: null },
        { ...transition, to_status: "ready" },
      ];
      for (const payload of invalidTransitions) {
        expect(() => appendProjectEvent(store.db, envelope("run.activated", "run", payload))).toThrow();
      }
      expect(listProjectEvents(store.db)).toEqual([]);
      appendProjectEvent(store.db, envelope("run.activated", "run", transition));
      expect(listProjectEvents(store.db)).toHaveLength(1);
    } finally {
      store.db.close();
    }
  });

  test("enforces the frozen sync integer and object-array payload shapes", () => {
    const store = openTestStore();
    const staging = {
      staging_workspace_id: "staging-1",
      durable_stage: "session_rebased",
      epochs_total: 3,
      epochs_applied: 2,
      minor_conflicts_resolved: 1,
      conflicts_awaiting_operator: 0,
      pr_series_reconciliation_summary: { series_total: 1, clean: 1 },
      state_revision: 8,
      progress_kind: "session_rebased",
    } satisfies JsonObject;
    const blocked = {
      from_status: "validating",
      to_status: "blocked",
      blocker_codes: ["validation_failed"],
      source_identities: [{ source_kind: "sync", source_id: "sync-1" }],
      recovery_choices: ["recover_sync"],
    } satisfies JsonObject;
    const reconciliation = {
      from_status: "reconciling",
      to_status: "blocked",
      conflict_identities: ["branch:path/to/file.c"],
      conflicts_awaiting_operator: 1,
    } satisfies JsonObject;
    const cancelled = {
      from_status: "blocked",
      to_status: "cancelled",
      discarded_staging_workspace_id: null,
      untouched_session_head: "head-1",
      untouched_submodule_heads: [{ path: "vendor", gitlink_head: "a", checked_out_head: "a" }],
    } satisfies JsonObject;
    try {
      appendProjectEvent(store.db, envelope("sync.staging_progressed", "sync_workflow", staging));
      appendProjectEvent(store.db, {
        ...envelope("sync.blocked", "sync_workflow", blocked),
        actor: "runner",
      });
      appendProjectEvent(store.db, {
        ...envelope("sync.reconciliation_blocked", "sync_workflow", reconciliation),
        actor: "runner",
      });
      appendProjectEvent(store.db, envelope("sync.cancelled", "sync_workflow", cancelled));

      expect(() => appendProjectEvent(
        store.db,
        envelope("sync.staging_progressed", "sync_workflow", { ...staging, minor_conflicts_resolved: [] }),
      )).toThrow("payload fact minor_conflicts_resolved must be integer");
      expect(() => appendProjectEvent(
        store.db,
        envelope("sync.reconciliation_blocked", "sync_workflow", {
          ...reconciliation,
          conflicts_awaiting_operator: [],
        }),
      )).toThrow("payload fact conflicts_awaiting_operator must be integer");
      expect(() => appendProjectEvent(
        store.db,
        envelope("sync.cancelled", "sync_workflow", { ...cancelled, untouched_submodule_heads: {} }),
      )).toThrow("payload fact untouched_submodule_heads must be object[]");
      expect(() => appendProjectEvent(
        store.db,
        envelope("sync.blocked", "sync_workflow", { ...blocked, source_identities: {} }),
      )).toThrow("payload fact source_identities must be object[]");
      expect(listProjectEvents(store.db)).toHaveLength(4);

      expect(Object.keys(projectEventContract("sync.boundary_published").payloadFields)).toEqual([
        "upstream_revision",
        "knowledge_revision",
        "invalidations",
        "validation_evidence",
      ]);
      expect(projectEventContract("sync.pr_push_started").allowedActors).toEqual(["operator", "runner"]);
    } finally {
      store.db.close();
    }
  });

  test("keeps all PR contracts on campaign/series subjects and from/to facts", () => {
    const campaignEvents = new Set([
      "pr.campaign_opened",
      "pr.campaign_in_review",
      "pr.campaign_working",
      "pr.batch_published",
      "pr.campaign_recovered",
      "pr.campaign_closed",
    ]);
    for (const [eventType, contract] of Object.entries(PROJECT_EVENT_REGISTRY)) {
      if (!eventType.startsWith("pr.")) continue;
      expect(contract.subjectKinds).toEqual([campaignEvents.has(eventType) ? "pr_campaign" : "pr_series"]);
      expect(contract.payloadFields).toHaveProperty("from_status");
      expect(contract.payloadFields).toHaveProperty("to_status");
      expect(contract.payloadFields).not.toHaveProperty("previous_status");
      expect(contract.payloadFields).not.toHaveProperty("status");
    }
    expect(projectEventContract("pr.series_approved").payloadFields).toMatchObject({
      approval_source_identity: { type: "string", required: true, nullable: false },
      approved_revision: { type: "string", required: true, nullable: false },
      approving_actor: { type: "string", required: true, nullable: false },
    });
    expect(projectEventContract("pr.series_revised").classification).toBe("status_transition");
    const store = openTestStore();
    try {
      expect(() => appendProjectEvent(store.db, {
        ...envelope("pr.feedback_ingested", "pr_series", {
          from_status: "published",
          to_status: "changes_requested",
          work_item_ids: ["work-1"],
          review_source_identities: ["review:1"],
          ingesting_actor: "external_observer",
        }),
        actor: "external_observer",
      })).toThrow("pr.feedback_ingested progress must preserve status");
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("registers exact approval and session-blocker payloads with their semantic classifications", () => {
    const store = openTestStore();
    try {
      const approvalPayload = {
        from_status: "published",
        to_status: "approved",
        approval_source_identity: "github-review:PRR_1",
        approved_revision: "head-sha-1",
        approving_actor: "octocat",
      } satisfies JsonObject;
      const blockedPayload = {
        from_status: "active",
        to_status: "blocked",
        prior_status: "active",
        blocker_codes: ["dispatch_lease_held"],
        source_identities: [{ source_kind: "project", source_id: "melee" }],
        recovery_choices: ["release_dispatch"],
        state_revision: 4,
      } satisfies JsonObject;
      const blockersUpdatedPayload = {
        added_blocker_codes: ["unshipped_work"],
        removed_blocker_codes: ["dispatch_lease_held"],
        blocker_codes: ["unshipped_work"],
        source_identities: [{ source_kind: "session", source_id: "session-1" }],
        recovery_choices: ["record_save_point"],
        state_revision: 5,
      } satisfies JsonObject;

      appendProjectEvent(store.db, {
        ...envelope("pr.series_approved", "pr_series", approvalPayload),
        actor: "external_observer",
      });
      appendProjectEvent(store.db, envelope("session.blocked", "session", blockedPayload));
      appendProjectEvent(store.db, {
        ...envelope("session.blockers_updated", "session", blockersUpdatedPayload),
        actor: "runner",
      });

      expect(projectEventContract("pr.series_approved").classification).toBe("status_transition");
      expect(projectEventContract("session.blocked").classification).toBe("status_transition");
      expect(projectEventContract("session.blockers_updated").classification).toBe("progress");
      expect(listProjectEvents(store.db).map((event) => event.payload)).toEqual([
        approvalPayload,
        blockedPayload,
        blockersUpdatedPayload,
      ]);

      expect(() => appendProjectEvent(store.db, {
        ...envelope("pr.series_approved", "pr_series", approvalPayload),
        actor: "runner",
      })).toThrow("does not allow actor runner");
      expect(() => appendProjectEvent(
        store.db,
        envelope("session.blockers_updated", "session", blockedPayload),
      )).toThrow("is missing required payload facts: added_blocker_codes");
      expect(() => appendProjectEvent(
        store.db,
        envelope("session.blocked", "session", { ...blockedPayload, prior_status: "closing" }),
      )).toThrow("session.blocked prior_status must equal from_status");
      expect(() => appendProjectEvent(store.db, envelope(
        "sync.requested",
        "sync",
        { upstream_from: "a", upstream_to: "b", merged_pr_ids: [], corpus_batch_ids: [] },
      ))).toThrow("does not accept subject kind sync");
    } finally {
      store.db.close();
    }
  });

  test("registers both sync observation paths with exact semantics and all adjudicated actors", () => {
    const store = openTestStore();
    const payloads = {
      "sync.requested": {
        upstream_from: "upstream-a",
        upstream_to: "upstream-b",
        merged_pr_ids: ["pr-1"],
        corpus_batch_ids: ["batch-1"],
        knowledge_only: false,
      },
      "sync.observation_refreshed": {
        prior_upstream_revision: "upstream-a",
        observed_upstream_revision: "upstream-b",
        merged_pr_ids: ["pr-1", "pr-2"],
        corpus_batch_ids: ["batch-1", "batch-2"],
        knowledge_only: false,
        observation_source_identity: "github:melee-upstream",
        state_revision: 7,
      },
    } satisfies Record<"sync.requested" | "sync.observation_refreshed", JsonObject>;
    try {
      expect(projectEventContract("sync.requested")).toMatchObject({
        classification: "lifecycle",
        subjectKinds: ["sync_workflow"],
        allowedActors: ["operator", "runner", "external_observer"],
        extras: "forbid",
      });
      expect(projectEventContract("sync.observation_refreshed")).toMatchObject({
        classification: "progress",
        subjectKinds: ["sync_workflow"],
        allowedActors: ["operator", "runner", "external_observer"],
        extras: "forbid",
      });

      for (const eventType of ["sync.requested", "sync.observation_refreshed"] as const) {
        for (const actor of ["operator", "runner", "external_observer"] as const) {
          appendProjectEvent(store.db, {
            ...envelope(eventType, "sync_workflow", payloads[eventType]),
            actor,
            subjectId: `${eventType}-${actor}`,
          });
        }
      }

      expect(listProjectEvents(store.db).map(({ eventType, actor }) => ({ eventType, actor }))).toEqual([
        { eventType: "sync.requested", actor: "operator" },
        { eventType: "sync.requested", actor: "runner" },
        { eventType: "sync.requested", actor: "external_observer" },
        { eventType: "sync.observation_refreshed", actor: "operator" },
        { eventType: "sync.observation_refreshed", actor: "runner" },
        { eventType: "sync.observation_refreshed", actor: "external_observer" },
      ]);
    } finally {
      store.db.close();
    }
  });

  test("rejects wrong subjects and actors for both sync observation paths", () => {
    const store = openTestStore();
    const payloads = {
      "sync.requested": {
        upstream_from: "upstream-a",
        upstream_to: "upstream-b",
        merged_pr_ids: ["pr-1"],
        corpus_batch_ids: ["batch-1"],
        knowledge_only: false,
      },
      "sync.observation_refreshed": {
        prior_upstream_revision: "upstream-a",
        observed_upstream_revision: "upstream-b",
        merged_pr_ids: ["pr-1", "pr-2"],
        corpus_batch_ids: ["batch-1", "batch-2"],
        knowledge_only: false,
        observation_source_identity: "github:melee-upstream",
        state_revision: 7,
      },
    } satisfies Record<"sync.requested" | "sync.observation_refreshed", JsonObject>;
    try {
      for (const eventType of ["sync.requested", "sync.observation_refreshed"] as const) {
        expect(() => appendProjectEvent(store.db, envelope(eventType, "sync", payloads[eventType]))).toThrow(
          `Project event ${eventType} does not accept subject kind sync`,
        );
        expect(() => appendProjectEvent(store.db, {
          ...envelope(eventType, "sync_workflow", payloads[eventType]),
          actor: "guardian",
        })).toThrow(`Project event ${eventType} does not allow actor guardian`);
      }
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("requires the exact closed seven-field sync observation refresh payload", () => {
    const store = openTestStore();
    const payload = {
      prior_upstream_revision: "upstream-a",
      observed_upstream_revision: "upstream-b",
      merged_pr_ids: ["pr-1", "pr-2"],
      corpus_batch_ids: ["batch-1", "batch-2"],
      knowledge_only: false,
      observation_source_identity: "github:melee-upstream",
      state_revision: 7,
    } satisfies JsonObject;
    const expectedTypes = {
      prior_upstream_revision: "string",
      observed_upstream_revision: "string",
      merged_pr_ids: "string[]",
      corpus_batch_ids: "string[]",
      knowledge_only: "boolean",
      observation_source_identity: "string",
      state_revision: "integer",
    } as const;
    const wrongTypes = {
      prior_upstream_revision: 1,
      observed_upstream_revision: 1,
      merged_pr_ids: "pr-1",
      corpus_batch_ids: "batch-1",
      knowledge_only: "false",
      observation_source_identity: 1,
      state_revision: 7.5,
    } satisfies JsonObject;
    const fields = Object.keys(expectedTypes) as Array<keyof typeof expectedTypes>;
    try {
      const contract = projectEventContract("sync.observation_refreshed");
      expect(Object.keys(contract.payloadFields)).toEqual(fields);
      for (const field of fields) {
        const type = expectedTypes[field];
        expect(contract.payloadFields[field]).toEqual({ type, required: true, nullable: false });

        const missing: JsonObject = { ...payload };
        delete missing[field];
        expect(() => appendProjectEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", missing),
        )).toThrow(`Project event sync.observation_refreshed is missing required payload facts: ${field}`);
        expect(() => appendProjectEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", { ...payload, [field]: null }),
        )).toThrow(`Project event sync.observation_refreshed payload fact ${field} must not be null`);
        expect(() => appendProjectEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", { ...payload, [field]: wrongTypes[field] }),
        )).toThrow(`Project event sync.observation_refreshed payload fact ${field} must be ${type}`);
      }
      for (const extra of ["upstream_from", "upstream_to", "observed_at", "undocumented"] as const) {
        expect(() => appendProjectEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", { ...payload, [extra]: "forbidden" }),
        )).toThrow(`Project event sync.observation_refreshed payload contains unregistered facts: ${extra}`);
      }
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test.each([
    ["knowledge.job_processing", {}],
    ["knowledge.job_waiting", { reason: "dependency pending" }],
    ["knowledge.job_succeeded", { staged_digest: "sha256:staged" }],
    ["knowledge.job_failed", { error: "materialization failed" }],
    ["knowledge.job_cancelled", { reason: "operator cancelled" }],
  ] as const)("accepts both adjudicated execution classes for %s", (eventType, eventFacts) => {
    const store = openTestStore();
    try {
      const commonFacts = {
        from_status: "queued",
        to_status: eventType.slice("knowledge.job_".length),
        source_class: "corpus_import",
        provenance: { source: "fixture" },
        source_kind: "corpus_batch",
        source_id: "batch-1",
        ...eventFacts,
      } satisfies JsonObject;
      const syncStage = {
        ...commonFacts,
        execution_class: "sync_stage",
        sync_id: "sync-1",
      } satisfies JsonObject;
      const backgroundSafe = {
        ...commonFacts,
        execution_class: "background_safe",
        sync_id: null,
      } satisfies JsonObject;

      for (const actor of ["operator", "runner"] as const) {
        appendProjectEvent(store.db, {
          ...envelope(eventType, "knowledge_job", syncStage),
          actor,
          subjectId: `knowledge-sync-stage-${actor}`,
        });
        appendProjectEvent(store.db, {
          ...envelope(eventType, "knowledge_job", backgroundSafe),
          actor,
          subjectId: `knowledge-background-safe-${actor}`,
        });
      }

      expect(listProjectEvents(store.db).map((event) => event.payload)).toEqual([
        syncStage,
        backgroundSafe,
        syncStage,
        backgroundSafe,
      ]);
      expect(projectEventContract(eventType).payloadFields.sync_id).toEqual({
        type: "string",
        required: true,
        nullable: true,
      });
      for (const fact of ["execution_class", "source_class", "provenance"] as const) {
        expect(projectEventContract(eventType).payloadFields[fact]?.required).toBe(true);
      }
    } finally {
      store.db.close();
    }
  });

  test.each([
    ["knowledge.job_processing", {}],
    ["knowledge.job_waiting", { reason: "dependency pending" }],
    ["knowledge.job_succeeded", { staged_digest: "sha256:staged" }],
    ["knowledge.job_failed", { error: "materialization failed" }],
    ["knowledge.job_cancelled", { reason: "operator cancelled" }],
  ] as const)("rejects invalid execution-class facts for %s", (eventType, eventFacts) => {
    const store = openTestStore();
    try {
      const facts = {
        from_status: "queued",
        to_status: eventType.slice("knowledge.job_".length),
        source_class: "corpus_import",
        provenance: { source: "fixture" },
        source_kind: "corpus_batch",
        source_id: "batch-1",
        ...eventFacts,
      } satisfies JsonObject;
      const append = (executionClass: string, syncId: string | null) => appendProjectEvent(store.db, {
        ...envelope(eventType, "knowledge_job", {
          ...facts,
          execution_class: executionClass,
          sync_id: syncId,
        }),
        actor: "runner",
      });

      expect(() => append("sync_stage", null)).toThrow(
        "requires a nonblank sync_id when execution_class is sync_stage",
      );
      expect(() => append("sync_stage", "   ")).toThrow(
        "requires a nonblank sync_id when execution_class is sync_stage",
      );
      expect(() => append("background_safe", "sync-1")).toThrow(
        "requires sync_id null when execution_class is background_safe",
      );
      expect(() => append("foreground", null)).toThrow(
        "execution_class must be sync_stage or background_safe",
      );
      const { source_class: _sourceClass, ...missingSourceClass } = facts;
      expect(() => appendProjectEvent(store.db, {
        ...envelope(eventType, "knowledge_job", {
          ...missingSourceClass,
          execution_class: "background_safe",
          sync_id: null,
        }),
        actor: "runner",
      })).toThrow("is missing required payload facts: source_class");
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("documents every accepted extra event rationale and rejects proven-dead event types", () => {
    for (const eventType of [
      "project.dispatch_request_cancelled",
      "run.desired_workers_changed",
      "sync.pr_push_started",
      "sync.pr_push_succeeded",
      "sync.pr_push_failed",
      "pr.work_items_claimed",
      "pr.work_items_resolved",
      "pr.work_items_declined",
    ] as const) {
      expect(PROJECT_EVENT_REGISTRY[eventType].rationale?.trim()).toBeTruthy();
    }
    expect(PROJECT_EVENT_REGISTRY).not.toHaveProperty("run.lease_reconciled");
    expect(PROJECT_EVENT_REGISTRY).not.toHaveProperty("session.running_blocked");
    expect(() => projectEventContract("run.lease_reconciled")).toThrow("Unknown project event type");
    expect(() => projectEventContract("session.running_blocked")).toThrow("Unknown project event type");
    for (const eventType of [
      "session.preparing_subphase_updated",
      "session.preparing_completed",
      "session.running_started",
      "session.running_subphase_updated",
      "session.running_stopped",
      "session.running_unblocked",
      "session.pr_entered",
      "session.pr_final_build_completed",
      "session.pr_subphase_updated",
      "session.pr_completed",
    ] as const) {
      expect(PROJECT_EVENT_REGISTRY[eventType]).toBeDefined();
    }
  });
});

describe("project event log", () => {
  test("reads historical dead or malformed rows without reopening them for insertion", () => {
    const store = openTestStore();
    try {
      const insert = store.db.query(
        `INSERT INTO project_events (
           event_id, event_type, schema_version, project_id,
           subject_kind, subject_id, correlation_id, causation_id,
           trace_id, span_id, parent_span_id, actor, occurred_at, payload_json
         ) VALUES (?, ?, 1, 'melee', ?, ?, 'historical-workflow', 'historical-cause',
                   'historical-trace', 'historical-span', NULL, ?, '2026-08-01T00:00:00.000Z', ?)`,
      );
      insert.run(
        "event-historical-dead",
        "run.lease_reconciled",
        "run",
        "run-historical",
        "guardian",
        JSON.stringify({ reason: "legacy crash repair" }),
      );
      insert.run(
        "event-historical-malformed",
        "historical.malformed",
        "project",
        "melee",
        "external_observer",
        "not-json",
      );

      expect(listProjectEvents(store.db).map((event) => ({
        eventType: event.eventType,
        parentSpanId: event.parentSpanId,
        payload: event.payload,
      }))).toEqual([
        {
          eventType: "run.lease_reconciled",
          parentSpanId: null,
          payload: { reason: "legacy crash repair" },
        },
        { eventType: "historical.malformed", parentSpanId: null, payload: {} },
      ]);
      expect(() => appendProjectEvent(
        store.db,
        envelope("run.lease_reconciled", "run", { reason: "new repair" }),
      )).toThrow("Unknown project event type");
    } finally {
      store.db.close();
    }
  });

  test("requires explicit nonblank correlation and UUID-shaped leaf/root spans", () => {
    const store = openTestStore();
    try {
      expect(() => appendProjectEvent(store.db, { ...envelope(), correlationId: "   " })).toThrow(
        "correlationId must be a nonblank string",
      );
      expect(() => appendProjectEvent(store.db, { ...envelope(), correlationId: undefined } as unknown as ProjectEventEnvelope)).toThrow(
        "correlationId must be a nonblank string",
      );
      expect(() => appendProjectEvent(store.db, { ...envelope(), spanId: "span-composite" })).toThrow(
        "spanId must use the span-<uuid> scheme",
      );
      const same = newSpanId();
      expect(() => appendProjectEvent(store.db, { ...envelope(), spanId: same, parentSpanId: same })).toThrow(
        "leaf spanId must differ from parentSpanId",
      );
      appendProjectEvent(store.db, { ...envelope(), ...eventSpan(null) });
      expect(listProjectEvents(store.db)[0]?.parentSpanId).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("appends registered envelopes in order with parent-span linkage", () => {
    const store = openTestStore();
    try {
      const actionRoot = newSpanId();
      const appended = immediateTransaction(store.db, () => [
        appendProjectEvent(store.db, { ...envelope(), ...eventSpan(actionRoot) }),
        appendProjectEvent(store.db, {
          ...envelope(
            "project.dispatch_acquired",
            "project",
            { kind: "sync", workflow_id: "sync-1", lease_id: "lease-1", state_revision: 2 },
          ),
          ...eventSpan(actionRoot),
          causationId: "event-prior",
          occurredAt: "2026-08-12T16:00:01.000Z",
        }),
      ]);
      const events = listProjectEvents(store.db);
      expect(appended[1]!.sequence).toBe(appended[0]!.sequence + 1);
      expect(latestSequence(store.db)).toBe(appended[1]!.sequence);
      expect(events.map((event) => event.schemaVersion)).toEqual([1, 1]);
      expect(events.map((event) => event.parentSpanId)).toEqual([actionRoot, actionRoot]);
      expect(events[0]!.spanId).not.toBe(events[1]!.spanId);
      expect(events[0]!.spanId).not.toBe(actionRoot);
    } finally {
      store.db.close();
    }
  });

  test("filters the ordered stream by project, cursor, and subject", () => {
    const store = openTestStore();
    try {
      const sequences = immediateTransaction(store.db, () => [
        appendProjectEvent(store.db, {
          ...envelope("run.drafted", "run", { desired_workers: 2, goal_kind: "score", goal_value: 100 }),
          subjectId: "run-a",
        }).sequence,
        appendProjectEvent(store.db, {
          ...envelope("sync.requested", "sync_workflow", {
            upstream_from: "a",
            upstream_to: "b",
            merged_pr_ids: [],
            corpus_batch_ids: [],
            knowledge_only: false,
          }),
          subjectId: "sync-a",
        }).sequence,
        appendProjectEvent(store.db, {
          ...envelope("run.desired_workers_changed", "run", { previous_desired_workers: 2, desired_workers: 3 }),
          subjectId: "run-a",
        }).sequence,
      ]);
      expect(listProjectEvents(store.db, { projectId: "melee", afterSequence: sequences[0], limit: 1 }).map((event) => event.sequence)).toEqual([sequences[1]]);
      expect(eventsForSubject(store.db, "run", "run-a", { projectId: "melee" }).map((event) => event.sequence)).toEqual([sequences[0], sequences[2]]);
    } finally {
      store.db.close();
    }
  });

  test("rolls an appended event back with its caller-owned transaction", () => {
    const store = openTestStore();
    try {
      expect(() => immediateTransaction(store.db, () => {
        appendProjectEvent(store.db, envelope());
        throw new Error("reject transition");
      })).toThrow("reject transition");
      expect(listProjectEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });
});
