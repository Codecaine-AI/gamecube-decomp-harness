import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * One JSON line per measured event. Every process of a run (orchestrator,
 * worker children, fake Daytona) appends to its own file under
 * `<out>/events/`, so no process ever shares a file handle; `report.ts`
 * merges them.
 */
export type ScaleEvent =
  /** One Daytona API call (control plane or toolbox), fake or live. */
  | { kind: "api"; op: string; ms: number; ok: boolean; status?: number | null; error?: string; sandboxId?: string }
  /** One sandbox exec, classified into a validation/provisioning step. */
  | { kind: "exec"; step: string; ms: number; exitCode: number | null; sandboxId: string; argv0: string }
  /** One host subprocess spawned by a harness process (placement evidence). */
  | { kind: "host_spawn"; step: string; ms: number; exitCode: number | null; argv: string[]; cpuMs?: number | null }
  /** A sandbox created or deleted (cost guard and create/delete latency). */
  | { kind: "sandbox"; action: "create" | "delete"; sandboxId: string; ms: number; ok: boolean; purpose: string; error?: string }
  /** Time spent waiting for the SQLite write lock (BEGIN IMMEDIATE). */
  | { kind: "sqlite_lock"; ms: number; busyError: boolean }
  /** One worker phase (provision, agent turn, validation, settle). */
  | { kind: "phase"; phase: string; ms: number; ok: boolean; workerId?: string; error?: string }
  /** One worker attempt's outcome. */
  | { kind: "attempt"; workerId: string; targetKind: string; unit: string; symbol: string; ok: boolean; ms: number; status?: string; failure?: string; verdict?: string | null }
  /** Host resource sample of one process. */
  | { kind: "proc_sample"; pid: number; role: string; rssKb: number; cpuSeconds: number }
  /** Integration queue drain. */
  | { kind: "integration"; ms: number; processed: number; applied: number; failed: number }
  /** Cost guard / kill switch / ramp control. */
  | { kind: "control"; action: string; detail?: Record<string, unknown> }
  | { kind: "failure"; failureKind: string; detail: string; workerId?: string; step?: string };

export interface EventSink {
  emit(event: ScaleEvent): void;
  readonly path: string | null;
}

const noop: EventSink = { emit() {}, path: null };

export function fileEventSink(outDir: string, role: string, context: Record<string, unknown> = {}): EventSink {
  const dir = resolve(outDir, "events");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${role}-${process.pid}.jsonl`);
  return {
    path,
    emit(event) {
      appendFileSync(path, `${JSON.stringify({ t: Date.now(), role, pid: process.pid, ...context, ...event })}\n`);
    },
  };
}

/** The sink named by `SCALE_EVENTS_DIR` (worker children and the fake server inherit it), else a no-op. */
export function envEventSink(role: string, context: Record<string, unknown> = {}): EventSink {
  const dir = process.env.SCALE_EVENTS_DIR;
  return dir ? fileEventSink(dir, role, context) : noop;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** HTTP-ish status of a thrown SDK/fake error (429 detection), when it carries one. */
export function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const candidate of [value.status, value.statusCode, value.response?.status]) {
    if (typeof candidate === "number") return candidate;
  }
  const match = /status code (\d{3})/.exec(errorText(error));
  return match ? Number(match[1]) : null;
}
