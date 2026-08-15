import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { immediateTransaction, now as currentTime, type StateStore } from "@server/core/orchestrator-state";
import { newSpanId } from "@server/core/harness-state/events.js";
import {
  getHarnessState,
  requireActiveLease,
  type Blocker,
  type DispatchLease,
} from "@server/core/harness-state";
import {
  getPrCampaign,
  getPrSeries,
  listPrSeriesForCampaign,
  transitionPrCampaign,
  transitionPrSeries,
} from "./state.js";
import type { PrCampaignState, PrSeriesState } from "./types.js";

export interface PublishPrBatchInput {
  campaignId: string;
  commandId: string;
  confirmed: boolean;
  correlationId: string;
  leaseId: string;
  occurredAt?: string;
  gameId: string;
  publishSeries: (
    series: PrSeriesState,
    revalidateLease: () => DispatchLease,
  ) => Promise<{ upstreamPrNumber: number }>;
  spanId?: string;
  store: StateStore;
}

export interface PublishPrBatchResult {
  batch_index: number;
  campaign: PrCampaignState;
  idempotency_key: string;
  series: PrSeriesState[];
}

type BatchPublicationStatus = "reserved" | "publishing" | "completed";
type BatchSeriesPublicationStatus = "pending" | "publishing" | "published";

interface BatchPublicationRow {
  publication_id: string;
  campaign_id: string;
  batch_index: number;
  series_ids_json: string;
  idempotency_key: string;
  revision: number;
  status: BatchPublicationStatus;
  owner_token: string | null;
  batch_event_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface BatchSeriesPublicationRow {
  publication_id: string;
  series_id: string;
  ordinal: number;
  revision: number;
  status: BatchSeriesPublicationStatus;
  owner_token: string | null;
  reserved_series_revision: number | null;
  validation_timestamp: string | null;
  invalidation_watermark: string | null;
  upstream_pr_number: number | null;
  updated_at: string;
}

interface BatchPublicationReservation {
  batchIndex: number;
  batchEventId: string | null;
  campaignId: string;
  idempotencyKey: string;
  ownerToken: string | null;
  publicationId: string;
  revision: number;
  seriesIds: string[];
  status: BatchPublicationStatus;
}

interface SeriesPublicationGate {
  alreadyPublished: boolean;
  progressRevision: number;
  series: PrSeriesState;
}

interface InvalidationWatermark {
  createdAt: string;
  id: string;
  reason: string;
}

function blocker(code: string, message: string, sourceKind: string, sourceId: string): Blocker {
  return { code, message, source_kind: sourceKind, source_id: sourceId, recoverable: true };
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

function parseSeriesIds(value: string, publicationId: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`PR batch reservation ${publicationId} has invalid series_ids_json`, { cause: error });
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((entry) => typeof entry !== "string" || !entry.trim()) ||
    new Set(parsed).size !== parsed.length
  ) {
    throw new Error(`PR batch reservation ${publicationId} must name unique nonblank series ids`);
  }
  return parsed as string[];
}

function rowToReservation(row: BatchPublicationRow): BatchPublicationReservation {
  return {
    batchIndex: Number(row.batch_index),
    batchEventId: row.batch_event_id,
    campaignId: row.campaign_id,
    idempotencyKey: row.idempotency_key,
    ownerToken: row.owner_token,
    publicationId: row.publication_id,
    revision: Number(row.revision),
    seriesIds: parseSeriesIds(row.series_ids_json, row.publication_id),
    status: row.status,
  };
}

function reservationSchemaExists(db: Database): boolean {
  return Boolean(db.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pr_batch_publications'",
  ).get());
}

function requireReservationSchema(db: Database): void {
  if (!reservationSchemaExists(db)) {
    throw new Error(
      "PR batch publication reservation schema is missing; wire the unregistered pr_batch_publication_reservations migration",
    );
  }
}

function getReservationByPublicationId(db: Database, publicationId: string): BatchPublicationReservation | null {
  const row = db.query("SELECT * FROM pr_batch_publications WHERE publication_id = ?").get(publicationId) as
    | BatchPublicationRow
    | null;
  return row ? rowToReservation(row) : null;
}

function getReservationByIdempotencyKey(db: Database, idempotencyKey: string): BatchPublicationReservation | null {
  const row = db.query("SELECT * FROM pr_batch_publications WHERE idempotency_key = ?").get(idempotencyKey) as
    | BatchPublicationRow
    | null;
  return row ? rowToReservation(row) : null;
}

function getIncompleteReservation(db: Database, campaignId: string): BatchPublicationReservation | null {
  const rows = db.query(
    `SELECT * FROM pr_batch_publications
     WHERE campaign_id = ? AND status != 'completed'
     ORDER BY created_at, publication_id LIMIT 2`,
  ).all(campaignId) as BatchPublicationRow[];
  if (rows.length > 1) throw new Error(`PR campaign ${campaignId} has multiple incomplete batch reservations`);
  return rows[0] ? rowToReservation(rows[0]) : null;
}

function getSeriesProgress(
  db: Database,
  publicationId: string,
  seriesId: string,
): BatchSeriesPublicationRow | null {
  return (db.query(
    `SELECT * FROM pr_batch_publication_series
     WHERE publication_id = ? AND series_id = ?`,
  ).get(publicationId, seriesId) as BatchSeriesPublicationRow | null) ?? null;
}

function assertReservationShape(db: Database, reservation: BatchPublicationReservation): void {
  const rows = db.query(
    `SELECT series_id, ordinal FROM pr_batch_publication_series
     WHERE publication_id = ? ORDER BY ordinal`,
  ).all(reservation.publicationId) as Array<{ ordinal: number; series_id: string }>;
  const ordered = rows.map((row, ordinal) => {
    if (Number(row.ordinal) !== ordinal) {
      throw new Error(`PR batch reservation ${reservation.publicationId} has a non-contiguous series order`);
    }
    return row.series_id;
  });
  if (JSON.stringify(ordered) !== JSON.stringify(reservation.seriesIds)) {
    throw new Error(`PR batch reservation ${reservation.publicationId} series rows disagree with its frozen series ids`);
  }
}

function validationFacts(series: PrSeriesState): {
  clean: boolean;
  sourceRevision: string;
  validatedAt: string;
} {
  const value = series.last_validation ?? {};
  const result = typeof value.result === "string" ? value.result.toLowerCase() : "";
  const status = typeof value.status === "string" ? value.status.toLowerCase() : "";
  const sourceRevision = typeof value.source_revision === "string"
    ? value.source_revision
    : typeof value.sourceRevision === "string"
      ? value.sourceRevision
      : "";
  const validatedAt = typeof value.validated_at === "string"
    ? value.validated_at
    : typeof value.checkedAt === "string"
      ? value.checkedAt
      : "";
  return { clean: result === "clean" || status === "passed", sourceRevision, validatedAt };
}

function nextPreparedBatch(campaign: PrCampaignState, series: PrSeriesState[]): PrSeriesState[] {
  const prepared = series.filter((entry) => entry.status === "prepared");
  if (prepared.length === 0) return [];
  const batchIndex = Math.min(...prepared.map((entry) => entry.batch_index));
  return prepared
    .filter((entry) => entry.batch_index === batchIndex)
    .sort((left, right) => left.series_id.localeCompare(right.series_id))
    .slice(0, campaign.publication_policy.batch_size);
}

function invalidationWatermark(
  db: Database,
  campaign: PrCampaignState,
  series: PrSeriesState,
): InvalidationWatermark | null {
  const row = db.query(
    `SELECT invalidation_id, created_at, reason FROM sync_invalidations
     WHERE game_id = ? AND subject_kind = 'pr_snapshot'
       AND subject_id IN (?, ?)
     ORDER BY created_at DESC, invalidation_id DESC LIMIT 1`,
  ).get(campaign.game_id, series.series_id, series.branch) as
    | { created_at: string; invalidation_id: string; reason: string }
    | null;
  return row
    ? { createdAt: row.created_at, id: row.invalidation_id, reason: row.reason }
    : null;
}

function seriesPublicationBlockers(
  db: Database,
  campaign: PrCampaignState,
  series: PrSeriesState,
): { blockers: Blocker[]; invalidation: InvalidationWatermark | null; validatedAt: string } {
  const blockers = [...series.blockers];
  const validation = validationFacts(series);
  if (
    !validation.clean ||
    validation.sourceRevision !== campaign.source_anchor.source_revision ||
    !Number.isFinite(Date.parse(validation.validatedAt))
  ) {
    blockers.push(blocker(
      "pr_series_not_validated",
      `PR series ${series.series_id} lacks clean validation at campaign source ${campaign.source_anchor.source_revision}.`,
      "pr_series",
      series.series_id,
    ));
  }
  const invalidation = invalidationWatermark(db, campaign, series);
  if (
    invalidation &&
    Number.isFinite(Date.parse(validation.validatedAt)) &&
    invalidation.createdAt > validation.validatedAt
  ) {
    blockers.push(blocker(
      "pr_series_sync_invalidated",
      `PR series ${series.series_id} was invalidated after validation: ${invalidation.reason}`,
      "sync_invalidation",
      invalidation.id,
    ));
  }
  return { blockers, invalidation, validatedAt: validation.validatedAt };
}

function selectedSeriesForBlockers(
  store: StateStore,
  campaign: PrCampaignState,
): { reservation: BatchPublicationReservation | null; series: PrSeriesState[] } {
  const reservation = reservationSchemaExists(store.db)
    ? getIncompleteReservation(store.db, campaign.campaign_id)
    : null;
  if (!reservation) {
    return {
      reservation: null,
      series: nextPreparedBatch(campaign, listPrSeriesForCampaign(store, campaign.campaign_id)),
    };
  }
  assertReservationShape(store.db, reservation);
  return {
    reservation,
    series: reservation.seriesIds.map((seriesId) => {
      const series = getPrSeries(store, seriesId);
      if (!series) throw new Error(`PR batch reservation ${reservation.publicationId} names missing series ${seriesId}`);
      return series;
    }),
  };
}

export function prPublishBatchBlockers(
  store: StateStore,
  campaign: PrCampaignState,
  activeLease: DispatchLease | null = getHarnessState(store, campaign.game_id)?.active_workflow ?? null,
): Blocker[] {
  const blockers: Blocker[] = [...campaign.blockers];
  if (campaign.status !== "working") {
    blockers.push(blocker(
      "pr_campaign_not_working",
      `PR campaign ${campaign.campaign_id} is ${campaign.status}; publishing requires working.`,
      "pr_campaign",
      campaign.campaign_id,
    ));
  }
  if (!activeLease || activeLease.status !== "active" || activeLease.kind !== "pr" || activeLease.workflow_id !== campaign.campaign_id) {
    blockers.push(blocker(
      "pr_does_not_own_dispatch_lease",
      `PR campaign ${campaign.campaign_id} does not own the active dispatch lease.`,
      "pr_campaign",
      campaign.campaign_id,
    ));
  }
  const selected = selectedSeriesForBlockers(store, campaign);
  if (selected.reservation?.ownerToken) {
    blockers.push(blocker(
      "pr_batch_publication_in_progress",
      `PR batch ${selected.reservation.batchIndex} is already being published.`,
      "pr_campaign",
      campaign.campaign_id,
    ));
  }
  if (selected.series.length === 0) {
    blockers.push(blocker(
      "pr_batch_not_available",
      "No prepared PR series remain for publication.",
      "pr_campaign",
      campaign.campaign_id,
    ));
    return blockers;
  }
  for (const series of selected.series) {
    if (series.status === "published") continue;
    if (series.status !== "prepared") {
      blockers.push(blocker(
        "pr_reserved_series_not_prepared",
        `Reserved PR series ${series.series_id} changed to ${series.status}.`,
        "pr_series",
        series.series_id,
      ));
      continue;
    }
    blockers.push(...seriesPublicationBlockers(store.db, campaign, series).blockers);
  }
  return blockers;
}

function reserveFrozenBatch(
  input: PublishPrBatchInput,
  revalidateLease: () => DispatchLease,
): BatchPublicationReservation {
  return immediateTransaction(input.store.db, () => {
    revalidateLease();
    const campaign = getPrCampaign(input.store, input.campaignId);
    if (!campaign) throw new Error(`PR campaign not found: ${input.campaignId}`);

    const byKey = getReservationByIdempotencyKey(input.store.db, input.commandId);
    if (byKey) {
      if (byKey.campaignId !== campaign.campaign_id) {
        throw new Error(`Idempotency key ${input.commandId} belongs to PR campaign ${byKey.campaignId}`);
      }
      assertReservationShape(input.store.db, byKey);
      return byKey;
    }

    const incomplete = getIncompleteReservation(input.store.db, campaign.campaign_id);
    if (incomplete) {
      assertReservationShape(input.store.db, incomplete);
      return incomplete;
    }

    const blockers = prPublishBatchBlockers(input.store, campaign, revalidateLease());
    if (blockers.length > 0) {
      throw new Error(`pr.publish_batch is blocked: ${blockers.map((entry) => entry.message).join("; ")}`);
    }
    const selected = nextPreparedBatch(campaign, listPrSeriesForCampaign(input.store, campaign.campaign_id));
    if (selected.length === 0) throw new Error("No prepared PR series remain for publication");
    const batchIndex = selected[0]!.batch_index;
    const seriesIds = selected.map((series) => series.series_id);
    const publicationId = stableId("pr-batch-publication", campaign.campaign_id, String(batchIndex), JSON.stringify(seriesIds));
    const at = currentTime();
    input.store.db.query(
      `INSERT INTO pr_batch_publications (
         publication_id, campaign_id, batch_index, series_ids_json, idempotency_key,
         revision, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 0, 'reserved', ?, ?)`,
    ).run(
      publicationId,
      campaign.campaign_id,
      batchIndex,
      JSON.stringify(seriesIds),
      requiredText(input.commandId, "commandId"),
      at,
      at,
    );
    const insertSeries = input.store.db.query(
      `INSERT INTO pr_batch_publication_series (
         publication_id, series_id, ordinal, revision, status, updated_at
       ) VALUES (?, ?, ?, 0, 'pending', ?)`,
    );
    for (const [ordinal, seriesId] of seriesIds.entries()) {
      insertSeries.run(publicationId, seriesId, ordinal, at);
    }
    const saved = getReservationByPublicationId(input.store.db, publicationId);
    if (!saved) throw new Error(`PR batch reservation disappeared after creation: ${publicationId}`);
    assertReservationShape(input.store.db, saved);
    return saved;
  });
}

function claimBatchReservation(
  db: Database,
  reservation: BatchPublicationReservation,
  ownerToken: string,
): BatchPublicationReservation {
  return immediateTransaction(db, () => {
    const current = getReservationByPublicationId(db, reservation.publicationId);
    if (!current) throw new Error(`PR batch reservation disappeared: ${reservation.publicationId}`);
    if (current.status === "completed") return current;
    if (current.ownerToken) {
      throw new Error(`PR batch ${current.batchIndex} publication is already in progress`);
    }
    const at = currentTime();
    const claimed = db.query(
      `UPDATE pr_batch_publications
       SET revision = revision + 1, status = 'publishing', owner_token = ?, updated_at = ?
       WHERE publication_id = ? AND revision = ? AND owner_token IS NULL
         AND status IN ('reserved', 'publishing')`,
    ).run(ownerToken, at, current.publicationId, current.revision);
    if (claimed.changes !== 1) {
      throw new Error(`PR batch ${current.batchIndex} reservation CAS failed`);
    }
    return getReservationByPublicationId(db, current.publicationId)!;
  });
}

function releaseBatchReservation(db: Database, publicationId: string, ownerToken: string): void {
  immediateTransaction(db, () => {
    const at = currentTime();
    db.query(
      `UPDATE pr_batch_publication_series
       SET revision = revision + 1, status = 'pending', owner_token = NULL, updated_at = ?
       WHERE publication_id = ? AND status = 'publishing' AND owner_token = ?`,
    ).run(at, publicationId, ownerToken);
    db.query(
      `UPDATE pr_batch_publications
       SET revision = revision + 1, status = 'reserved', owner_token = NULL, updated_at = ?
       WHERE publication_id = ? AND status = 'publishing' AND owner_token = ?`,
    ).run(at, publicationId, ownerToken);
  });
}

function reserveSeriesBeforeExternalSideEffect(
  input: PublishPrBatchInput,
  reservation: BatchPublicationReservation,
  seriesId: string,
  ownerToken: string,
  revalidateLease: () => DispatchLease,
): SeriesPublicationGate {
  return immediateTransaction(input.store.db, () => {
    revalidateLease();
    const batch = getReservationByPublicationId(input.store.db, reservation.publicationId);
    if (!batch || batch.status !== "publishing" || batch.ownerToken !== ownerToken) {
      throw new Error(`PR batch ${reservation.batchIndex} publication ownership changed`);
    }
    const campaign = getPrCampaign(input.store, input.campaignId);
    if (!campaign) throw new Error(`PR campaign not found: ${input.campaignId}`);
    if (campaign.status !== "working") {
      throw new Error(`PR campaign ${campaign.campaign_id} changed to ${campaign.status} during publication`);
    }
    if (campaign.blockers.length > 0) {
      throw new Error(
        `PR campaign ${campaign.campaign_id} became blocked: ${campaign.blockers.map((entry) => entry.message).join("; ")}`,
      );
    }
    const series = getPrSeries(input.store, seriesId);
    if (!series) throw new Error(`PR series disappeared before publication: ${seriesId}`);
    const progress = getSeriesProgress(input.store.db, reservation.publicationId, seriesId);
    if (!progress) throw new Error(`PR batch reservation lost series progress for ${seriesId}`);
    if (progress.status === "published") {
      if (series.status !== "published" || series.upstream_pr_number !== progress.upstream_pr_number) {
        throw new Error(`Published reservation state for ${seriesId} disagrees with the durable PR series`);
      }
      return { alreadyPublished: true, progressRevision: progress.revision, series };
    }
    if (series.status === "published" && series.upstream_pr_number) {
      const reconciled = input.store.db.query(
        `UPDATE pr_batch_publication_series
         SET revision = revision + 1, status = 'published', owner_token = NULL,
             upstream_pr_number = ?, updated_at = ?
         WHERE publication_id = ? AND series_id = ? AND revision = ?
           AND status IN ('pending', 'publishing')`,
      ).run(
        series.upstream_pr_number,
        currentTime(),
        reservation.publicationId,
        seriesId,
        progress.revision,
      );
      if (reconciled.changes !== 1) throw new Error(`PR batch series ${seriesId} reconciliation CAS failed`);
      return { alreadyPublished: true, progressRevision: progress.revision + 1, series };
    }
    if (series.status !== "prepared") {
      throw new Error(`PR series ${series.series_id} changed to ${series.status} during publication`);
    }
    if (progress.status !== "pending" || progress.owner_token !== null) {
      throw new Error(`PR batch series ${seriesId} is already reserved for external publication`);
    }
    const gate = seriesPublicationBlockers(input.store.db, campaign, series);
    if (gate.blockers.length > 0) {
      throw new Error(`pr.publish_batch is blocked: ${gate.blockers.map((entry) => entry.message).join("; ")}`);
    }
    const invalidationMark = gate.invalidation
      ? `${gate.invalidation.createdAt}\0${gate.invalidation.id}`
      : "";
    const claimed = input.store.db.query(
      `UPDATE pr_batch_publication_series
       SET revision = revision + 1, status = 'publishing', owner_token = ?,
           reserved_series_revision = ?, validation_timestamp = ?,
           invalidation_watermark = ?, updated_at = ?
       WHERE publication_id = ? AND series_id = ? AND revision = ?
         AND status = 'pending' AND owner_token IS NULL`,
    ).run(
      ownerToken,
      series.revision,
      gate.validatedAt,
      invalidationMark,
      currentTime(),
      reservation.publicationId,
      seriesId,
      progress.revision,
    );
    if (claimed.changes !== 1) throw new Error(`PR batch series ${seriesId} reservation CAS failed`);
    return { alreadyPublished: false, progressRevision: progress.revision + 1, series };
  });
}

function commitPublishedSeries(
  input: PublishPrBatchInput,
  reservation: BatchPublicationReservation,
  gate: SeriesPublicationGate,
  ownerToken: string,
  upstreamPrNumber: number,
): PrSeriesState {
  return immediateTransaction(input.store.db, () => {
    const progress = getSeriesProgress(input.store.db, reservation.publicationId, gate.series.series_id);
    if (
      !progress ||
      progress.revision !== gate.progressRevision ||
      progress.status !== "publishing" ||
      progress.owner_token !== ownerToken ||
      progress.reserved_series_revision !== gate.series.revision
    ) {
      throw new Error(`PR batch series ${gate.series.series_id} publication reservation changed`);
    }
    const published = transitionPrSeries(input.store, gate.series.series_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: input.correlationId,
      eventType: "pr.series_published",
      expectedRevision: gate.series.revision,
      occurredAt: input.occurredAt,
      patch: { status: "published", upstreamPrNumber },
      payload: {
        upstream_pr_number: upstreamPrNumber,
        branch: gate.series.branch,
        batch_index: gate.series.batch_index,
      },
      spanId: input.spanId,
    });
    const saved = input.store.db.query(
      `UPDATE pr_batch_publication_series
       SET revision = revision + 1, status = 'published', owner_token = NULL,
           upstream_pr_number = ?, updated_at = ?
       WHERE publication_id = ? AND series_id = ? AND revision = ?
         AND status = 'publishing' AND owner_token = ?`,
    ).run(
      upstreamPrNumber,
      currentTime(),
      reservation.publicationId,
      gate.series.series_id,
      gate.progressRevision,
      ownerToken,
    );
    if (saved.changes !== 1) throw new Error(`PR batch series ${gate.series.series_id} completion CAS failed`);
    return published;
  });
}

function resultForReservation(
  store: StateStore,
  reservation: BatchPublicationReservation,
): PublishPrBatchResult {
  const campaign = getPrCampaign(store, reservation.campaignId);
  if (!campaign) throw new Error(`PR campaign not found: ${reservation.campaignId}`);
  const series = reservation.seriesIds.map((seriesId) => {
    const current = getPrSeries(store, seriesId);
    if (!current) throw new Error(`PR batch reservation ${reservation.publicationId} names missing series ${seriesId}`);
    return current;
  });
  return {
    batch_index: reservation.batchIndex,
    campaign,
    idempotency_key: reservation.idempotencyKey,
    series,
  };
}

function completeBatchReservation(
  input: PublishPrBatchInput,
  reservation: BatchPublicationReservation,
  ownerToken: string,
): PublishPrBatchResult {
  return immediateTransaction(input.store.db, () => {
    const current = getReservationByPublicationId(input.store.db, reservation.publicationId);
    if (!current) throw new Error(`PR batch reservation disappeared: ${reservation.publicationId}`);
    if (current.status === "completed") return resultForReservation(input.store, current);
    if (current.status !== "publishing" || current.ownerToken !== ownerToken) {
      throw new Error(`PR batch ${current.batchIndex} publication ownership changed before completion`);
    }
    const progress = input.store.db.query(
      `SELECT series_id, status, upstream_pr_number FROM pr_batch_publication_series
       WHERE publication_id = ? ORDER BY ordinal`,
    ).all(current.publicationId) as Array<{
      series_id: string;
      status: BatchSeriesPublicationStatus;
      upstream_pr_number: number | null;
    }>;
    if (
      progress.length !== current.seriesIds.length ||
      progress.some((entry, index) => entry.series_id !== current.seriesIds[index] || entry.status !== "published")
    ) {
      throw new Error(`PR batch ${current.batchIndex} cannot complete before every frozen series is published`);
    }
    let campaign = getPrCampaign(input.store, current.campaignId);
    if (!campaign) throw new Error(`PR campaign not found: ${current.campaignId}`);
    campaign = transitionPrCampaign(input.store, campaign.campaign_id, {
      actor: "operator",
      commandId: input.commandId,
      correlationId: input.correlationId,
      eventType: "pr.batch_published",
      expectedRevision: campaign.revision,
      occurredAt: input.occurredAt,
      patch: { status: "working" },
      payload: {
        batch_index: current.batchIndex,
        series_ids: current.seriesIds,
        operator: "operator",
      },
      spanId: input.spanId,
    });
    const at = currentTime();
    const completed = input.store.db.query(
      `UPDATE pr_batch_publications
       SET revision = revision + 1, status = 'completed', owner_token = NULL,
           batch_event_id = ?, updated_at = ?, completed_at = ?
       WHERE publication_id = ? AND revision = ?
         AND status = 'publishing' AND owner_token = ? AND batch_event_id IS NULL`,
    ).run(
      campaign.caused_by_event_id,
      at,
      at,
      current.publicationId,
      current.revision,
      ownerToken,
    );
    if (completed.changes !== 1) throw new Error(`PR batch ${current.batchIndex} completion CAS failed`);
    return resultForReservation(input.store, getReservationByPublicationId(input.store.db, current.publicationId)!);
  });
}

export async function publishPrBatch(input: PublishPrBatchInput): Promise<PublishPrBatchResult> {
  if (!input.confirmed) throw new Error("pr.publish_batch requires explicit confirmation");
  const commandId = requiredText(input.commandId, "commandId");
  const correlationId = requiredText(input.correlationId, "correlationId");
  const actionInput: PublishPrBatchInput = {
    ...input,
    commandId,
    correlationId,
    spanId: input.spanId ?? newSpanId(),
  };
  let campaign = getPrCampaign(input.store, input.campaignId);
  if (!campaign) throw new Error(`PR campaign not found: ${input.campaignId}`);
  if (campaign.game_id !== input.gameId) {
    throw new Error(`PR campaign ${campaign.campaign_id} belongs to ${campaign.game_id}, not ${input.gameId}`);
  }
  if (correlationId !== campaign.campaign_id) {
    throw new Error(`PR event correlation_id must equal campaign id ${campaign.campaign_id}`);
  }
  requireReservationSchema(input.store.db);

  const completedRetry = getReservationByIdempotencyKey(input.store.db, commandId);
  if (completedRetry?.status === "completed") {
    if (completedRetry.campaignId !== campaign.campaign_id) {
      throw new Error(`Idempotency key ${commandId} belongs to PR campaign ${completedRetry.campaignId}`);
    }
    return resultForReservation(input.store, completedRetry);
  }

  const revalidateLease = (): DispatchLease => {
    const lease = requireActiveLease(input.store, input.leaseId, input.gameId);
    if (lease.kind !== "pr" || lease.workflow_id !== input.campaignId) {
      throw new Error(
        `Dispatch lease ${lease.lease_id} belongs to ${lease.kind}:${lease.workflow_id}, not pr:${input.campaignId}`,
      );
    }
    return lease;
  };
  revalidateLease();
  const reservation = reserveFrozenBatch(actionInput, revalidateLease);
  if (reservation.status === "completed") return resultForReservation(input.store, reservation);

  const ownerToken = `pr-batch-owner-${randomUUID()}`;
  const claimed = claimBatchReservation(input.store.db, reservation, ownerToken);
  if (claimed.status === "completed") return resultForReservation(input.store, claimed);
  try {
    for (const seriesId of claimed.seriesIds) {
      const gate = reserveSeriesBeforeExternalSideEffect(
        actionInput,
        claimed,
        seriesId,
        ownerToken,
        revalidateLease,
      );
      if (gate.alreadyPublished) continue;
      const external = await actionInput.publishSeries(gate.series, revalidateLease);
      if (!Number.isInteger(external.upstreamPrNumber) || external.upstreamPrNumber < 1) {
        throw new Error(`Publishing ${gate.series.series_id} did not return a positive upstream PR number`);
      }
      revalidateLease();
      commitPublishedSeries(actionInput, claimed, gate, ownerToken, external.upstreamPrNumber);
    }
    revalidateLease();
    return completeBatchReservation(actionInput, claimed, ownerToken);
  } catch (error) {
    releaseBatchReservation(input.store.db, claimed.publicationId, ownerToken);
    throw error;
  }
}
