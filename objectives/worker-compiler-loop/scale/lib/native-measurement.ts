/**
 * Whether a native-capture tool call measured anything (readiness item 6).
 *
 * The worker tools return an envelope (`commandToolPayload`: `exit_code`,
 * `tool_error`, `parsed`) around the script's own JSON. A clean envelope says
 * only that the script ran: `snapshot.py --capture decisions` and
 * `compare_sources.py` report `status: "unavailable"` (or
 * `unit_build_failed`, `trace_invalid`, ...) with exit code 0.
 *
 * What a successful run prints differs per operation (mwcc_alloc/api):
 * - `snapshot.py --capture decisions` prints a capture envelope
 *   (`format: "mwcc-alloc-native-capture-v1"`) whose `files` name the
 *   artifacts it wrote; the decisions document itself is the `kind:
 *   "decisions"` file (`decisions.json`, schema `mwcc-decisions-v1`). It is
 *   loaded and validated: a measurement counts only when it exists, parses and
 *   is the decisions document of the captured function.
 * - `compare_sources.py` prints the diff itself (schema
 *   `mwcc-decision-diff-v1`, `changes`, possibly truncated) and saves the
 *   whole diff at `full_report`, which is loaded and validated too.
 */

export type NativeOperation = "native_decisions" | "compare_sources";

/** The schema each operation's measured document must carry (mwcc_alloc/api/decisions.py). */
export const NATIVE_SCHEMAS: Record<NativeOperation, string> = {
  native_decisions: "mwcc-decisions-v1",
  compare_sources: "mwcc-decision-diff-v1",
};

/** snapshot.py's capture envelope format. */
export const NATIVE_CAPTURE_FORMAT = "mwcc-alloc-native-capture-v1";

/** Reads a checkout-relative artifact the tool wrote in the sandbox. */
export type NativeArtifactReader = (repoRelativePath: string) => Promise<string>;

export type NativeMeasurement =
  | { ok: true; schema: string }
  | { ok: false; reason: "tool_failed" | "unavailable" | "not_ok" | "malformed"; detail: string };

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const malformed = (detail: string): NativeMeasurement => ({ ok: false, reason: "malformed", detail });

async function loadArtifact(readArtifact: NativeArtifactReader | undefined, path: string, what: string): Promise<Record<string, unknown> | string> {
  if (!readArtifact) return `${what} ${path} cannot be read here`;
  let text: string;
  try {
    text = await readArtifact(path);
  } catch (error) {
    return `${what} ${path} is unreadable: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200);
  }
  try {
    return record(JSON.parse(text)) ?? `${what} ${path} is not a JSON object`;
  } catch {
    return `${what} ${path} is not JSON`;
  }
}

async function classifyDecisions(inner: Record<string, unknown>, readArtifact?: NativeArtifactReader): Promise<NativeMeasurement> {
  const schema = NATIVE_SCHEMAS.native_decisions;
  if (inner.format !== NATIVE_CAPTURE_FORMAT) return malformed(`format ${JSON.stringify(inner.format)}, expected ${NATIVE_CAPTURE_FORMAT}`);
  if (typeof inner.function !== "string" || !inner.function) return malformed("capture without its function");
  const files = Array.isArray(inner.files) ? inner.files.map(record) : [];
  const decisionsPath = files.find((file) => file?.kind === "decisions")?.path;
  if (typeof decisionsPath !== "string" || !decisionsPath) return malformed("capture without a decisions artifact");
  const doc = await loadArtifact(readArtifact, decisionsPath, "decisions artifact");
  if (typeof doc === "string") return malformed(doc);
  if (doc.schema !== schema) return malformed(`decisions artifact schema ${JSON.stringify(doc.schema)}, expected ${schema}`);
  if (doc.function !== inner.function) return malformed(`decisions artifact is for ${JSON.stringify(doc.function)}, not ${inner.function}`);
  if (!Array.isArray(doc.vregs) || !record(doc.coloring)) return malformed("decisions artifact without its vregs/coloring");
  return { ok: true, schema };
}

async function classifyCompare(inner: Record<string, unknown>, readArtifact?: NativeArtifactReader): Promise<NativeMeasurement> {
  const schema = NATIVE_SCHEMAS.compare_sources;
  if (inner.schema !== schema) return malformed(`schema ${JSON.stringify(inner.schema)}, expected ${schema}`);
  if (!Array.isArray(inner.changes)) return malformed(`${schema} without its changes`);
  if (inner.full_report !== undefined) {
    if (typeof inner.full_report !== "string" || !inner.full_report) return malformed("full_report is not a path");
    const full = await loadArtifact(readArtifact, inner.full_report, "full report");
    if (typeof full === "string") return malformed(full);
    if (full.schema !== schema || full.status !== "ok" || !Array.isArray(full.changes)) return malformed(`full report ${inner.full_report} is not an ok ${schema}`);
    if (full.function !== inner.function) return malformed(`full report is for ${JSON.stringify(full.function)}, not ${JSON.stringify(inner.function)}`);
  }
  return { ok: true, schema };
}

export async function classifyNativeResult(operation: NativeOperation, envelope: unknown, readArtifact?: NativeArtifactReader): Promise<NativeMeasurement> {
  const outer = record(envelope);
  if (!outer) return malformed("no JSON tool result");
  if (outer.tool_error || outer.status === "sandbox_required" || (outer.exit_code !== undefined && outer.exit_code !== 0)) {
    return { ok: false, reason: "tool_failed", detail: String(outer.error_summary ?? outer.status ?? `exit ${String(outer.exit_code)}`).slice(0, 200) };
  }
  const inner = record(outer.parsed);
  if (!inner) return malformed("no parsed result");
  if (inner.status === "unavailable") return { ok: false, reason: "unavailable", detail: String(inner.unavailable ?? "unavailable").slice(0, 200) };
  if (inner.status !== "ok") return { ok: false, reason: "not_ok", detail: `status ${JSON.stringify(inner.status)}` };
  return operation === "native_decisions" ? classifyDecisions(inner, readArtifact) : classifyCompare(inner, readArtifact);
}
