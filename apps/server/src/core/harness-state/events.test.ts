import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StateStore } from "@server/core/orchestrator-state";
import { immediateTransaction, openState } from "@server/core/orchestrator-state";
import { GAME_EVENT_REGISTRY, gameEventContract } from "./event-registry.js";
import {
  appendGameEvent,
  eventSpan,
  eventsForSubject,
  latestSequence,
  listGameEvents,
  newSpanId,
  type JsonObject,
  type GameEventEnvelope,
} from "./events.js";

const tempDirs: string[] = [];

function openTestStore(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "game-events-"));
  tempDirs.push(dir);
  return openState(dir);
}

function envelope(
  eventType = "game.dispatch_requested",
  subjectKind = "game",
  payload: JsonObject = {
    requested_kind: "sync",
    workflow_id: "sync-1",
    current_lease_holder: null,
    reason: "operator request",
  },
): GameEventEnvelope {
  return {
    eventType,
    gameId: "melee",
    subjectKind,
    subjectId: subjectKind === "game" ? "melee" : `${subjectKind}-1`,
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

describe("game event registry", () => {
  test("validates Discord sync intake facts strictly", () => {
    const store = openTestStore();
    try {
      const base = envelope("sync.discord_refresh_completed", "sync_workflow", {
        ok: true,
        detail: "pulled",
        duration_ms: 42,
        messages_pulled: null,
      });
      expect(() => appendGameEvent(store.db, base)).not.toThrow();
      expect(() => appendGameEvent(store.db, {
        ...base,
        payload: { ...base.payload, ok: "yes" },
      })).toThrow("payload fact ok must be boolean");
      expect(() => appendGameEvent(store.db, envelope(
        "sync.discord_staged",
        "sync_workflow",
        {
          batches: 1,
          messages: 10,
          days: 2,
          channels: 1,
          first_message_at: null,
          last_message_at: "2026-08-02T00:00:00.000Z",
        },
      ))).not.toThrow();
      expect(() => appendGameEvent(store.db, envelope(
        "sync.discord_refresh_requested",
        "sync_workflow",
        { unexpected: true },
      ))).toThrow("unregistered facts");
    } finally {
      store.db.close();
    }
  });

  test("rejects unknown event types, subject mismatches, and schema-version drift", () => {
    const store = openTestStore();
    try {
      expect(() => appendGameEvent(store.db, envelope("unknown.accepted"))).toThrow("Unknown game event type");
      expect(() => appendGameEvent(store.db, envelope("game.dispatch_requested", "run"))).toThrow(
        "does not accept subject kind run",
      );
      expect(() => appendGameEvent(store.db, { ...envelope(), schemaVersion: 2 })).toThrow(
        "does not match registry version 1",
      );
      expect(listGameEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test.each([
    ["game", "game.dispatch_requested", "game"],
    ["run", "run.drafted", "run"],
    ["sync", "sync.requested", "sync_workflow"],
    ["cycle", "cycle.opened", "cycle"],
    ["pr", "pr.campaign_opened", "pr_campaign"],
    ["knowledge", "knowledge.job_enqueued", "knowledge_job"],
  ] as const)("rejects missing required payload facts for the %s domain", (_domain, eventType, subjectKind) => {
    const store = openTestStore();
    try {
      expect(() => appendGameEvent(store.db, envelope(eventType, subjectKind, {}))).toThrow(
        `Game event ${eventType} is missing required payload facts`,
      );
    } finally {
      store.db.close();
    }
  });

  test("rejects wrong payload types, null required facts, unregistered extras, and disallowed actors", () => {
    const store = openTestStore();
    try {
      expect(() => appendGameEvent(store.db, envelope(
        "game.dispatch_requested",
        "game",
        {
          requested_kind: 42,
          workflow_id: "sync-1",
          current_lease_holder: null,
          reason: "operator request",
        },
      ))).toThrow("payload fact requested_kind must be string");
      expect(() => appendGameEvent(store.db, envelope(
        "game.dispatch_requested",
        "game",
        {
          requested_kind: "sync",
          workflow_id: "sync-1",
          current_lease_holder: null,
          reason: null,
        },
      ))).toThrow("payload fact reason must not be null");
      expect(() => appendGameEvent(store.db, {
        ...envelope(),
        actor: "external_observer",
      })).toThrow("does not allow actor external_observer");
      expect(() => appendGameEvent(store.db, envelope(
        "game.dispatch_requested",
        "game",
        {
          requested_kind: "sync",
          workflow_id: "sync-1",
          current_lease_holder: null,
          reason: "operator request",
          undocumented: true,
        },
      ))).toThrow("payload contains unregistered facts: undocumented");
      expect(listGameEvents(store.db)).toEqual([]);
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
    expect(Object.isFrozen(GAME_EVENT_REGISTRY)).toBe(true);
    for (const [eventType, contract] of Object.entries(GAME_EVENT_REGISTRY)) {
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
    const contract = gameEventContract("game.dispatch_requested");
    expect(() => {
      (contract as { schemaVersion: number }).schemaVersion = 2;
    }).toThrow();
    expect(() => {
      (contract.payloadFields.reason as { nullable: boolean }).nullable = true;
    }).toThrow();
  });

  test("enforces required nonnullable from/to facts on every status transition", () => {
    for (const [eventType, contract] of Object.entries(GAME_EVENT_REGISTRY)) {
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
        expect(() => appendGameEvent(store.db, envelope("run.activated", "run", payload))).toThrow();
      }
      expect(listGameEvents(store.db)).toEqual([]);
      appendGameEvent(store.db, envelope("run.activated", "run", transition));
      expect(listGameEvents(store.db)).toHaveLength(1);
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
      untouched_cycle_head: "head-1",
      untouched_submodule_heads: [{ path: "vendor", gitlink_head: "a", checked_out_head: "a" }],
    } satisfies JsonObject;
    try {
      appendGameEvent(store.db, envelope("sync.staging_progressed", "sync_workflow", staging));
      appendGameEvent(store.db, {
        ...envelope("sync.blocked", "sync_workflow", blocked),
        actor: "runner",
      });
      appendGameEvent(store.db, {
        ...envelope("sync.reconciliation_blocked", "sync_workflow", reconciliation),
        actor: "runner",
      });
      appendGameEvent(store.db, envelope("sync.cancelled", "sync_workflow", cancelled));

      expect(() => appendGameEvent(
        store.db,
        envelope("sync.staging_progressed", "sync_workflow", { ...staging, minor_conflicts_resolved: [] }),
      )).toThrow("payload fact minor_conflicts_resolved must be integer");
      expect(() => appendGameEvent(
        store.db,
        envelope("sync.reconciliation_blocked", "sync_workflow", {
          ...reconciliation,
          conflicts_awaiting_operator: [],
        }),
      )).toThrow("payload fact conflicts_awaiting_operator must be integer");
      expect(() => appendGameEvent(
        store.db,
        envelope("sync.cancelled", "sync_workflow", { ...cancelled, untouched_submodule_heads: {} }),
      )).toThrow("payload fact untouched_submodule_heads must be object[]");
      expect(() => appendGameEvent(
        store.db,
        envelope("sync.blocked", "sync_workflow", { ...blocked, source_identities: {} }),
      )).toThrow("payload fact source_identities must be object[]");
      expect(listGameEvents(store.db)).toHaveLength(4);

      expect(Object.keys(gameEventContract("sync.boundary_published").payloadFields)).toEqual([
        "upstream_revision",
        "knowledge_revision",
        "invalidations",
        "validation_evidence",
      ]);
      expect(gameEventContract("sync.pr_push_started").allowedActors).toEqual(["operator", "runner"]);
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
    for (const [eventType, contract] of Object.entries(GAME_EVENT_REGISTRY)) {
      if (!eventType.startsWith("pr.")) continue;
      expect(contract.subjectKinds).toEqual([campaignEvents.has(eventType) ? "pr_campaign" : "pr_series"]);
      expect(contract.payloadFields).toHaveProperty("from_status");
      expect(contract.payloadFields).toHaveProperty("to_status");
      expect(contract.payloadFields).not.toHaveProperty("previous_status");
      expect(contract.payloadFields).not.toHaveProperty("status");
    }
    expect(gameEventContract("pr.series_approved").payloadFields).toMatchObject({
      approval_source_identity: { type: "string", required: true, nullable: false },
      approved_revision: { type: "string", required: true, nullable: false },
      approving_actor: { type: "string", required: true, nullable: false },
    });
    expect(gameEventContract("pr.series_revised").classification).toBe("status_transition");
    const store = openTestStore();
    try {
      expect(() => appendGameEvent(store.db, {
        ...envelope("pr.feedback_ingested", "pr_series", {
          from_status: "published",
          to_status: "changes_requested",
          work_item_ids: ["work-1"],
          review_source_identities: ["review:1"],
          ingesting_actor: "external_observer",
        }),
        actor: "external_observer",
      })).toThrow("pr.feedback_ingested progress must preserve status");
      expect(listGameEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("registers exact approval and cycle-blocker payloads with their semantic classifications", () => {
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
        source_identities: [{ source_kind: "game", source_id: "melee" }],
        recovery_choices: ["release_dispatch"],
        state_revision: 4,
      } satisfies JsonObject;
      const blockersUpdatedPayload = {
        added_blocker_codes: ["unshipped_work"],
        removed_blocker_codes: ["dispatch_lease_held"],
        blocker_codes: ["unshipped_work"],
        source_identities: [{ source_kind: "cycle", source_id: "cycle-1" }],
        recovery_choices: ["record_save_point"],
        state_revision: 5,
      } satisfies JsonObject;

      appendGameEvent(store.db, {
        ...envelope("pr.series_approved", "pr_series", approvalPayload),
        actor: "external_observer",
      });
      appendGameEvent(store.db, envelope("cycle.blocked", "cycle", blockedPayload));
      appendGameEvent(store.db, {
        ...envelope("cycle.blockers_updated", "cycle", blockersUpdatedPayload),
        actor: "runner",
      });

      expect(gameEventContract("pr.series_approved").classification).toBe("status_transition");
      expect(gameEventContract("cycle.blocked").classification).toBe("status_transition");
      expect(gameEventContract("cycle.blockers_updated").classification).toBe("progress");
      expect(listGameEvents(store.db).map((event) => event.payload)).toEqual([
        approvalPayload,
        blockedPayload,
        blockersUpdatedPayload,
      ]);

      expect(() => appendGameEvent(store.db, {
        ...envelope("pr.series_approved", "pr_series", approvalPayload),
        actor: "runner",
      })).toThrow("does not allow actor runner");
      expect(() => appendGameEvent(
        store.db,
        envelope("cycle.blockers_updated", "cycle", blockedPayload),
      )).toThrow("is missing required payload facts: added_blocker_codes");
      expect(() => appendGameEvent(
        store.db,
        envelope("cycle.blocked", "cycle", { ...blockedPayload, prior_status: "closing" }),
      )).toThrow("cycle.blocked prior_status must equal from_status");
      expect(() => appendGameEvent(store.db, envelope(
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
      expect(gameEventContract("sync.requested")).toMatchObject({
        classification: "lifecycle",
        subjectKinds: ["sync_workflow"],
        allowedActors: ["operator", "runner", "external_observer"],
        extras: "forbid",
      });
      expect(gameEventContract("sync.observation_refreshed")).toMatchObject({
        classification: "progress",
        subjectKinds: ["sync_workflow"],
        allowedActors: ["operator", "runner", "external_observer"],
        extras: "forbid",
      });

      for (const eventType of ["sync.requested", "sync.observation_refreshed"] as const) {
        for (const actor of ["operator", "runner", "external_observer"] as const) {
          appendGameEvent(store.db, {
            ...envelope(eventType, "sync_workflow", payloads[eventType]),
            actor,
            subjectId: `${eventType}-${actor}`,
          });
        }
      }

      expect(listGameEvents(store.db).map(({ eventType, actor }) => ({ eventType, actor }))).toEqual([
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
        expect(() => appendGameEvent(store.db, envelope(eventType, "sync", payloads[eventType]))).toThrow(
          `Game event ${eventType} does not accept subject kind sync`,
        );
        expect(() => appendGameEvent(store.db, {
          ...envelope(eventType, "sync_workflow", payloads[eventType]),
          actor: "guardian",
        })).toThrow(`Game event ${eventType} does not allow actor guardian`);
      }
      expect(listGameEvents(store.db)).toEqual([]);
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
      const contract = gameEventContract("sync.observation_refreshed");
      expect(Object.keys(contract.payloadFields)).toEqual(fields);
      for (const field of fields) {
        const type = expectedTypes[field];
        expect(contract.payloadFields[field]).toEqual({ type, required: true, nullable: false });

        const missing: JsonObject = { ...payload };
        delete missing[field];
        expect(() => appendGameEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", missing),
        )).toThrow(`Game event sync.observation_refreshed is missing required payload facts: ${field}`);
        expect(() => appendGameEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", { ...payload, [field]: null }),
        )).toThrow(`Game event sync.observation_refreshed payload fact ${field} must not be null`);
        expect(() => appendGameEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", { ...payload, [field]: wrongTypes[field] }),
        )).toThrow(`Game event sync.observation_refreshed payload fact ${field} must be ${type}`);
      }
      for (const extra of ["upstream_from", "upstream_to", "observed_at", "undocumented"] as const) {
        expect(() => appendGameEvent(
          store.db,
          envelope("sync.observation_refreshed", "sync_workflow", { ...payload, [extra]: "forbidden" }),
        )).toThrow(`Game event sync.observation_refreshed payload contains unregistered facts: ${extra}`);
      }
      expect(listGameEvents(store.db)).toEqual([]);
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
        appendGameEvent(store.db, {
          ...envelope(eventType, "knowledge_job", syncStage),
          actor,
          subjectId: `knowledge-sync-stage-${actor}`,
        });
        appendGameEvent(store.db, {
          ...envelope(eventType, "knowledge_job", backgroundSafe),
          actor,
          subjectId: `knowledge-background-safe-${actor}`,
        });
      }

      expect(listGameEvents(store.db).map((event) => event.payload)).toEqual([
        syncStage,
        backgroundSafe,
        syncStage,
        backgroundSafe,
      ]);
      expect(gameEventContract(eventType).payloadFields.sync_id).toEqual({
        type: "string",
        required: true,
        nullable: true,
      });
      for (const fact of ["execution_class", "source_class", "provenance"] as const) {
        expect(gameEventContract(eventType).payloadFields[fact]?.required).toBe(true);
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
      const append = (executionClass: string, syncId: string | null) => appendGameEvent(store.db, {
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
      expect(() => appendGameEvent(store.db, {
        ...envelope(eventType, "knowledge_job", {
          ...missingSourceClass,
          execution_class: "background_safe",
          sync_id: null,
        }),
        actor: "runner",
      })).toThrow("is missing required payload facts: source_class");
      expect(listGameEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });

  test("documents every accepted extra event rationale and rejects proven-dead event types", () => {
    for (const eventType of [
      "game.dispatch_request_cancelled",
      "run.desired_workers_changed",
      "sync.pr_push_started",
      "sync.pr_push_succeeded",
      "sync.pr_push_failed",
      "pr.work_items_claimed",
      "pr.work_items_resolved",
      "pr.work_items_declined",
    ] as const) {
      expect(GAME_EVENT_REGISTRY[eventType].rationale?.trim()).toBeTruthy();
    }
    expect(GAME_EVENT_REGISTRY).not.toHaveProperty("run.lease_reconciled");
    expect(GAME_EVENT_REGISTRY).not.toHaveProperty("cycle.running_blocked");
    expect(() => gameEventContract("run.lease_reconciled")).toThrow("Unknown game event type");
    expect(() => gameEventContract("cycle.running_blocked")).toThrow("Unknown game event type");
    for (const eventType of [
      "cycle.preparing_subphase_updated",
      "cycle.preparing_completed",
      "cycle.running_started",
      "cycle.running_subphase_updated",
      "cycle.running_stopped",
      "cycle.running_unblocked",
      "cycle.pr_entered",
      "cycle.pr_final_build_completed",
      "cycle.pr_subphase_updated",
      "cycle.pr_completed",
    ] as const) {
      expect(GAME_EVENT_REGISTRY[eventType]).toBeDefined();
    }
  });
});

describe("game event log", () => {
  test("reads historical dead or malformed rows without reopening them for insertion", () => {
    const store = openTestStore();
    try {
      const insert = store.db.query(
        `INSERT INTO game_events (
           event_id, event_type, schema_version, game_id,
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
        "game",
        "melee",
        "external_observer",
        "not-json",
      );

      expect(listGameEvents(store.db).map((event) => ({
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
      expect(() => appendGameEvent(
        store.db,
        envelope("run.lease_reconciled", "run", { reason: "new repair" }),
      )).toThrow("Unknown game event type");
    } finally {
      store.db.close();
    }
  });

  test("requires explicit nonblank correlation and UUID-shaped leaf/root spans", () => {
    const store = openTestStore();
    try {
      expect(() => appendGameEvent(store.db, { ...envelope(), correlationId: "   " })).toThrow(
        "correlationId must be a nonblank string",
      );
      expect(() => appendGameEvent(store.db, { ...envelope(), correlationId: undefined } as unknown as GameEventEnvelope)).toThrow(
        "correlationId must be a nonblank string",
      );
      expect(() => appendGameEvent(store.db, { ...envelope(), spanId: "span-composite" })).toThrow(
        "spanId must use the span-<uuid> scheme",
      );
      const same = newSpanId();
      expect(() => appendGameEvent(store.db, { ...envelope(), spanId: same, parentSpanId: same })).toThrow(
        "leaf spanId must differ from parentSpanId",
      );
      appendGameEvent(store.db, { ...envelope(), ...eventSpan(null) });
      expect(listGameEvents(store.db)[0]?.parentSpanId).toBeNull();
    } finally {
      store.db.close();
    }
  });

  test("appends registered envelopes in order with parent-span linkage", () => {
    const store = openTestStore();
    try {
      const actionRoot = newSpanId();
      const appended = immediateTransaction(store.db, () => [
        appendGameEvent(store.db, { ...envelope(), ...eventSpan(actionRoot) }),
        appendGameEvent(store.db, {
          ...envelope(
            "game.dispatch_acquired",
            "game",
            { kind: "sync", workflow_id: "sync-1", lease_id: "lease-1", state_revision: 2 },
          ),
          ...eventSpan(actionRoot),
          causationId: "event-prior",
          occurredAt: "2026-08-12T16:00:01.000Z",
        }),
      ]);
      const events = listGameEvents(store.db);
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

  test("filters the ordered stream by game, cursor, and subject", () => {
    const store = openTestStore();
    try {
      const sequences = immediateTransaction(store.db, () => [
        appendGameEvent(store.db, {
          ...envelope("run.drafted", "run", { desired_workers: 2, goal_kind: "score", goal_value: 100 }),
          subjectId: "run-a",
        }).sequence,
        appendGameEvent(store.db, {
          ...envelope("sync.requested", "sync_workflow", {
            upstream_from: "a",
            upstream_to: "b",
            merged_pr_ids: [],
            corpus_batch_ids: [],
            knowledge_only: false,
          }),
          subjectId: "sync-a",
        }).sequence,
        appendGameEvent(store.db, {
          ...envelope("run.desired_workers_changed", "run", { previous_desired_workers: 2, desired_workers: 3 }),
          subjectId: "run-a",
        }).sequence,
      ]);
      expect(listGameEvents(store.db, { gameId: "melee", afterSequence: sequences[0], limit: 1 }).map((event) => event.sequence)).toEqual([sequences[1]]);
      expect(eventsForSubject(store.db, "run", "run-a", { gameId: "melee" }).map((event) => event.sequence)).toEqual([sequences[0], sequences[2]]);
    } finally {
      store.db.close();
    }
  });

  test("rolls an appended event back with its caller-owned transaction", () => {
    const store = openTestStore();
    try {
      expect(() => immediateTransaction(store.db, () => {
        appendGameEvent(store.db, envelope());
        throw new Error("reject transition");
      })).toThrow("reject transition");
      expect(listGameEvents(store.db)).toEqual([]);
    } finally {
      store.db.close();
    }
  });
});
