import type { BoardSnapshot, TargetCandidate } from "../../types/index.js";
import { extractCompleteObjectsFromArray, numberField, parseJsonObject } from "../runtime/index.js";

export function directorQueuedTargets(
  rawText: string,
  snapshot: BoardSnapshot,
): { candidates: TargetCandidate[]; skipped: number; error?: string } {
  const parsed = parseJsonObject(rawText);
  const packets = parsed.object
    ? Array.isArray(parsed.object.target_packets)
      ? parsed.object.target_packets
      : []
    : extractCompleteObjectsFromArray(rawText, "target_packets");
  if (!parsed.object && packets.length === 0) return { candidates: [], skipped: 0, error: parsed.error };
  const baselineByKey = new Map(snapshot.candidates.map((candidate) => [`${candidate.unit}::${candidate.symbol}`, candidate]));
  const candidates: TargetCandidate[] = [];
  let skipped = 0;

  for (const [index, value] of packets.entries()) {
    const packet = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const unit = typeof packet.unit === "string" ? packet.unit : "";
    const symbol = typeof packet.symbol === "string" ? packet.symbol : "";
    const baseline = baselineByKey.get(`${unit}::${symbol}`);
    const sourcePath = typeof packet.source_path === "string" && packet.source_path ? packet.source_path : baseline?.sourcePath;
    const size = numberField(packet.size) ?? baseline?.size;
    const fuzzy = numberField(packet.fuzzy_match_percent) ?? baseline?.fuzzy;
    if (!unit || !symbol || !sourcePath || size == null || fuzzy == null) {
      skipped += 1;
      continue;
    }

    const whyNow = typeof packet.why_now === "string" && packet.why_now ? packet.why_now : "director-selected target";
    candidates.push({
      unit,
      symbol,
      sourcePath,
      size,
      fuzzy,
      priority: 1_000_000_000 - index,
      reason: `director: ${whyNow}`,
    });
  }

  return {
    candidates,
    skipped,
    error: parsed.object ? undefined : `partial director output salvaged ${candidates.length} target packet(s): ${parsed.error}`,
  };
}
