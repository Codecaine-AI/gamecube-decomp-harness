export interface PhaseProgressEvent {
  phase: string;
  status: string;
  [key: string]: unknown;
}

export type PhaseProgressEmitter<T extends PhaseProgressEvent = PhaseProgressEvent> = (event: T) => void;

const TERMINAL_PHASE_STATUSES = new Set(["failed", "finished", "propagated", "reverted", "skipped", "warning"]);

/** Tracks the most recently started phase that has not emitted a terminal status. */
export class PhaseTracker<T extends PhaseProgressEvent = PhaseProgressEvent> {
  readonly #activePhases: string[] = [];
  readonly #emitProgress: PhaseProgressEmitter<T>;

  constructor(emitProgress: PhaseProgressEmitter<T>) {
    this.#emitProgress = emitProgress;
  }

  progress(event: T): void {
    this.#emitProgress(event);
    if (event.status === "started") {
      this.#remove(event.phase);
      this.#activePhases.push(event.phase);
    } else if (TERMINAL_PHASE_STATUSES.has(event.status)) {
      this.#remove(event.phase);
    }
  }

  current(): string | null {
    return this.#activePhases.at(-1) ?? null;
  }

  #remove(phase: string): void {
    for (let index = this.#activePhases.length - 1; index >= 0; index -= 1) {
      if (this.#activePhases[index] === phase) this.#activePhases.splice(index, 1);
    }
  }
}

export interface BoundaryStepFailureMetadata {
  phase: string;
  exitCode?: number;
  stdoutTail?: string;
  stderrTail?: string;
  logPaths?: string[];
  artifactDir?: string;
}

export interface BoundaryStepErrorLike extends Error, BoundaryStepFailureMetadata {}

export class BoundaryStepError extends Error implements BoundaryStepFailureMetadata {
  override readonly name = "BoundaryStepError";
  readonly phase: string;
  readonly exitCode?: number;
  readonly stdoutTail?: string;
  readonly stderrTail?: string;
  readonly logPaths?: string[];
  readonly artifactDir?: string;

  constructor(message: string, metadata: BoundaryStepFailureMetadata, options?: ErrorOptions) {
    super(message, options);
    this.phase = metadata.phase;
    this.exitCode = metadata.exitCode;
    this.stdoutTail = metadata.stdoutTail;
    this.stderrTail = metadata.stderrTail;
    this.logPaths = metadata.logPaths;
    this.artifactDir = metadata.artifactDir;
  }
}

function objectValue(error: unknown): Record<string, unknown> | null {
  return error !== null && typeof error === "object" ? error as Record<string, unknown> : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function compatibleMetadata(error: unknown): Omit<BoundaryStepFailureMetadata, "phase"> & { phase?: string } {
  const value = objectValue(error);
  if (!value) return {};
  return {
    phase: optionalString(value.phase),
    exitCode: optionalNumber(value.exitCode),
    stdoutTail: optionalString(value.stdoutTail),
    stderrTail: optionalString(value.stderrTail),
    logPaths: optionalStringArray(value.logPaths),
    artifactDir: optionalString(value.artifactDir),
  };
}

export function isBoundaryStepError(error: unknown): error is BoundaryStepErrorLike {
  return error instanceof Error && typeof (error as { phase?: unknown }).phase === "string";
}

/** Attaches phase evidence while retaining the exact Error and its command-output metadata. */
export function asBoundaryStepError(
  error: unknown,
  metadata: Pick<BoundaryStepFailureMetadata, "phase"> & Partial<Pick<BoundaryStepFailureMetadata, "artifactDir">>,
): BoundaryStepErrorLike {
  const compatible = compatibleMetadata(error);
  if (error instanceof Error) {
    Object.assign(error, {
      phase: metadata.phase,
      ...(metadata.artifactDir ?? compatible.artifactDir
        ? { artifactDir: metadata.artifactDir ?? compatible.artifactDir }
        : {}),
    });
    return error as BoundaryStepErrorLike;
  }
  return new BoundaryStepError(errorMessage(error), {
    phase: metadata.phase,
    exitCode: compatible.exitCode,
    stdoutTail: compatible.stdoutTail,
    stderrTail: compatible.stderrTail,
    logPaths: compatible.logPaths,
    artifactDir: metadata.artifactDir ?? compatible.artifactDir,
  });
}

export interface StepFailureCheckpoint {
  message: string;
  error: string;
  exit_code?: number;
  stdout_tail?: string;
  stderr_tail?: string;
  log_paths?: string[];
  artifact_dir?: string;
}

/** Builds the fixed projection payload for a failed epoch or boundary step. */
export function stepFailureCheckpoint(error: unknown, artifactDir?: string): StepFailureCheckpoint {
  const message = errorMessage(error);
  const metadata = compatibleMetadata(error);
  const resolvedArtifactDir = artifactDir ?? metadata.artifactDir;
  return {
    message: (message.split(/\r?\n/, 1)[0] ?? "").slice(0, 300),
    error: message.slice(0, 8_000),
    ...(metadata.exitCode !== undefined ? { exit_code: metadata.exitCode } : {}),
    ...(metadata.stdoutTail !== undefined ? { stdout_tail: metadata.stdoutTail.slice(-4_000) } : {}),
    ...(metadata.stderrTail !== undefined ? { stderr_tail: metadata.stderrTail.slice(-4_000) } : {}),
    ...(metadata.logPaths !== undefined
      ? { log_paths: metadata.logPaths.slice(0, 20).map((path) => path.slice(0, 1_000)) }
      : {}),
    ...(resolvedArtifactDir !== undefined ? { artifact_dir: resolvedArtifactDir } : {}),
  };
}
