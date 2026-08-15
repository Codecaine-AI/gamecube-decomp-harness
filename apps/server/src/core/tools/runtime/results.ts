/**
 * Utility helpers for Pi custom tools that return bounded, structured text.
 *
 * Tool API responses are part of the model context. These helpers keep responses
 * JSON-shaped for provenance while preventing a lookup command from flooding a
 * worker cycle.
 */
import type { PiToolResult } from "../types.js";

export const maxToolOutputCharacters = 24000;

/** Clamp user-provided limits so lookup tools stay bounded. */
export function boundedLimit(value: unknown, fallback = 10, max = 25): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

/** Normalize an untrusted registry id before using it in a filesystem path. */
export function safeRegistryId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!/^[a-z0-9_][a-z0-9_-]*$/i.test(id)) return "";
  return id;
}

/** Convert a payload to a single text tool result with truncation metadata. */
export function jsonToolResult(tool: string, payload: Record<string, unknown>, maxChars = maxToolOutputCharacters): PiToolResult {
  const text = JSON.stringify({ tool, ...payload }, null, 2);
  if (text.length <= maxChars) {
    return {
      content: [{ type: "text", text }],
      details: { truncated: false, characters: text.length },
    };
  }
  const truncatedText = `${text.slice(0, maxChars - 160).trimEnd()}\n...<truncated ${text.length - maxChars} characters; narrow the query or lower the limit>...\n}`;
  return {
    content: [{ type: "text", text: truncatedText }],
    details: { truncated: true, original_characters: text.length, emitted_characters: truncatedText.length },
  };
}

/** Render a command result as JSON while preserving stderr and exit status. */
function commandErrorKind(params: { exitCode: number; stderr: string; stdout: string }, parseError: string | null): string | null {
  const text = `${params.stderr}\n${params.stdout}`.toLowerCase();
  if (params.exitCode !== 0 && /\b(timed out|timeout)\b/.test(text)) return "timed_out";
  if (params.exitCode !== 0 && /\b(no such file|not found|missing|enoent)\b/.test(text)) return "missing_executable_or_path";
  if (params.exitCode !== 0 && /\b(compile|compiler|mwcc|wibo|wine|ninja|build)\b/.test(text)) return "compile_or_build_failed";
  if (params.exitCode !== 0) return "command_failed";
  if (parseError) return "tool_output_parse_error";
  return null;
}

export function commandToolPayload(params: {
  operation: string;
  command: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}): Record<string, unknown> {
  let parsed: unknown = null;
  let parse_error: string | null = null;
  if (params.stdout.trim()) {
    try {
      parsed = JSON.parse(params.stdout);
    } catch (error) {
      parse_error = error instanceof Error ? error.message : String(error);
    }
  }
  const errorKind = commandErrorKind(params, parse_error);
  return {
    operation: params.operation,
    cwd: params.cwd,
    command: params.command,
    exit_code: params.exitCode,
    tool_error: errorKind ? true : undefined,
    error_kind: errorKind ?? undefined,
    error_summary: errorKind ? parse_error ?? (params.stderr.trim() || `command exited ${params.exitCode}`) : undefined,
    parsed,
    parse_error,
    stdout: parsed == null ? params.stdout : undefined,
    stderr: params.stderr || undefined,
  };
}
