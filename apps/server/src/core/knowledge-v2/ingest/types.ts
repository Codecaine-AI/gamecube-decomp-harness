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
  renames: {
    applied: number;
    ambiguous: Array<{
      unit: string;
      address: string;
      unresolved: string[];
      inserted: string[];
    }>;
    pairs: Array<{
      from_stable_key: string;
      to_stable_key: string;
      address: string;
      moved_rows: {
        fact: number;
        link: number;
        worker_run: number;
        pull_request: number;
        event: number;
        subject_index_state: number;
      };
      fact_collisions: number;
    }>;
  };
}

export interface EntityExtractResult {
  structs: number;
  fields: number;
  parameters: number;
  skippedParameters: number;
  skippedConstructs: number;
  inserted: number;
}
