export interface BoundaryStepDetailEvent {
  id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface BoundaryStepDetailArtifact {
  name: string;
  sizeBytes: number;
  text: string | null;
  truncated: boolean;
}

export interface BoundaryStepDetail {
  runId: string;
  epochId: string;
  ordinal: number | null;
  attempt: number;
  step: string;
  window: {
    from: string | null;
    to: string | null;
  };
  stepWindow: {
    from: string | null;
    to: string | null;
  };
  events: BoundaryStepDetailEvent[];
  error: string | null;
  artifactDir: string | null;
  artifacts: BoundaryStepDetailArtifact[];
  stderrLog: {
    path: string;
    from: string;
    to: string;
    lines: string[];
    truncated: boolean;
  } | null;
}
