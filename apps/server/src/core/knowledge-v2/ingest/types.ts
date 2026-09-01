export interface LaneOptions {
  dryRun?: boolean;
  now?: () => string;
}

export interface LaneCounts {
  inserted: number;
  skipped: number;
  tasksEnqueued: number;
}

export interface DiscordImportResult extends LaneCounts {
  channels: number;
  watermark: string | null;
}

export interface WikiImportResult extends LaneCounts {
  pagesChanged: number;
  watermark: string | null;
}

export interface PrImportResult extends LaneCounts {
  prsImported: number;
  prsArchiveSkipped: number;
  prsWithBotReport: number;
  targetRowsInserted: number;
  targetRowsSkippedUnresolved: number;
  targetRowsSkippedUnresolvedSample: Array<{ unit: string; symbol: string }>;
  watermark: string | null;
}

export interface AttemptsImportResult extends LaneCounts {
  runs: number;
  submissions: number;
  skippedNoTarget: number;
  skippedNoSignal: number;
  watermark: string | null;
}

export interface LedgerClassificationReport {
  total: number;
  counts: {
    semantic_candidate: number;
    attempt: number;
    operational: number;
    lineage: number;
    quarantine: number;
  };
}

export interface ReconcileResult {
  reportRevision: string;
  unitsInserted: number;
  functionsInserted: number;
  dataInserted: number;
  refreshed: number;
  unresolved: number;
  statusesUpserted: number;
  skippedMalformed: number;
  skippedMalformedSample: Array<{ unit: string; symbol: string | null; reason: string }>;
}

export interface EntityExtractResult {
  structs: number;
  fields: number;
  skippedConstructs: number;
  inserted: number;
}
