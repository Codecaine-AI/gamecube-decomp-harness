import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventActor } from "@server/core/project-state/events.js";

export interface SavePointFailureSpoolRecord {
  version: 1;
  event_type: "session.save_point_failed";
  occurred_at: string;
  project_id: string | null;
  session_uuid: string | null;
  trigger_kind: string;
  source_kind: string;
  source_id: string;
  message: string;
  command_id: string;
  correlation_id: string | null;
  span_id: string | null;
  actor: EventActor;
}

const SPOOL_DIR = "save_point_failures";

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isActor(value: unknown): value is EventActor {
  return value === "operator" || value === "runner" || value === "agent" || value === "guardian" || value === "external_observer";
}

function parseRecord(value: unknown): SavePointFailureSpoolRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.event_type !== "session.save_point_failed" ||
    !optionalText(record.occurred_at) ||
    !optionalText(record.trigger_kind) ||
    !optionalText(record.source_kind) ||
    !optionalText(record.source_id) ||
    !optionalText(record.message) ||
    !optionalText(record.command_id) ||
    !isActor(record.actor)
  ) {
    return null;
  }
  return {
    version: 1,
    event_type: "session.save_point_failed",
    occurred_at: String(record.occurred_at),
    project_id: optionalText(record.project_id),
    session_uuid: optionalText(record.session_uuid),
    trigger_kind: String(record.trigger_kind),
    source_kind: String(record.source_kind),
    source_id: String(record.source_id),
    message: String(record.message),
    command_id: String(record.command_id),
    correlation_id: optionalText(record.correlation_id),
    span_id: optionalText(record.span_id),
    actor: record.actor,
  };
}

export function spoolSavePointFailure(
  stateDir: string,
  input: Omit<SavePointFailureSpoolRecord, "version" | "event_type">,
): { path: string; record: SavePointFailureSpoolRecord } {
  const record: SavePointFailureSpoolRecord = {
    version: 1,
    event_type: "session.save_point_failed",
    ...input,
  };
  const dir = resolve(stateDir, SPOOL_DIR);
  mkdirSync(dir, { recursive: true });
  const timestamp = record.occurred_at.replaceAll(":", "-").replaceAll(".", "-");
  const path = resolve(dir, `${timestamp}-${randomUUID()}.json`);
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  renameSync(temporaryPath, path);
  return { path, record };
}

export function listSavePointFailureSpool(stateDir: string): SavePointFailureSpoolRecord[] {
  const dir = resolve(stateDir, SPOOL_DIR);
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const records: SavePointFailureSpoolRecord[] = [];
  for (const name of names) {
    try {
      const parsed = parseRecord(JSON.parse(readFileSync(resolve(dir, name), "utf8")));
      if (parsed) records.push(parsed);
    } catch {
      // A malformed or concurrently-written file cannot break the dashboard.
    }
  }
  return records;
}
