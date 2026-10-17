import { readFileSync } from "node:fs";

/**
 * The steering gate's game policy: the host `game.json` its sandbox steps get
 * through `ORCH_GAME_DIR`. Without it `game_policy.py` falls back to defaults
 * (`link_map_required()` false, `match_frame`), so `decide` would silently
 * stop requiring SMS map coverage. The gate therefore never runs without a
 * readable `game.json` that parses to an object naming this game (`id`) and
 * its `kind`.
 */
export function steeringGamePolicyProblem(descriptorPath: string | null | undefined, gameId: string): string | null {
  if (!descriptorPath) return `no game.json path for ${gameId}`;
  let text: string;
  try {
    text = readFileSync(descriptorPath, "utf8");
  } catch (error) {
    return `cannot read ${descriptorPath}: ${error instanceof Error ? error.message : String(error)}`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `${descriptorPath} is not valid JSON`;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return `${descriptorPath} is not a JSON object`;
  const record = parsed as Record<string, unknown>;
  if (record.id !== gameId) return `${descriptorPath} names game ${JSON.stringify(record.id ?? null)}, not ${gameId}`;
  if (typeof record.kind !== "string" || !record.kind.trim()) return `${descriptorPath} has no game kind`;
  return null;
}

/** The fail-closed error for a missing or invalid policy. */
export function steeringGamePolicyError(problem: string): string {
  return `steering gate needs the game's policy (game.json) to enforce its rules: ${problem}; refusing to run`;
}
