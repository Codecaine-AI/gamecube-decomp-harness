import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge/paths.js";
import type { TargetCandidate } from "@server/core/shared/types/index.js";

export type PredictorScores = Record<string, { p_win: number; p_match: number }>;
export type ModelRerankMode = "model_win_95" | "model_win_90" | "model_match_focus";
export type PredictorScorer = (candidates: TargetCandidate[], mode: ModelRerankMode) => PredictorScores | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function oneLine(value: unknown): string {
  return String(value).replace(/\s+/g, " ").trim();
}

function errorDetail(stdout: string, stderr: string): string {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (isPlainObject(parsed) && parsed.ok === false && typeof parsed.error === "string") {
      return oneLine(parsed.error).slice(0, 500);
    }
  } catch {
    // Fall through to stderr when stdout is not the CLI's structured error response.
  }
  return oneLine(stderr).slice(0, 500) || "no error detail";
}

export function spawnPredictorScorer(params: { dbPath?: string; sessionId?: string; timeoutMs?: number }): PredictorScorer {
  return (candidates) => {
    try {
      const root = packageRoot();
      const scriptPath = resolve(root, "analysis/scripts/predict-admission-score-candidates.py");
      const modelsPath = resolve(root, "analysis/models/admission-predictor-2026-07-13");
      const dbPath = params.dbPath ?? resolve(root, "projects/melee/state/orchestrator.sqlite");

      if (!existsSync(scriptPath)) {
        console.error(`[board] model rerank scorer script missing: ${scriptPath}`);
        return null;
      }
      if (!existsSync(modelsPath)) {
        console.error(`[board] model rerank scorer models missing: ${modelsPath}`);
        return null;
      }
      if (!existsSync(dbPath)) {
        console.error(`[board] model rerank scorer database missing: ${dbPath}`);
        return null;
      }

      const payload = {
        candidates: candidates.map((candidate, windowIndex) => ({
          target_key: `${candidate.unit}::${candidate.symbol}`,
          unit: candidate.unit,
          symbol: candidate.symbol,
          source_path: candidate.sourcePath,
          size: candidate.size,
          fuzzy: candidate.fuzzy,
          priority: candidate.priority,
          window_index: windowIndex,
          rank: {
            total_priority: candidate.rank?.total_priority ?? 0,
            information_priority_score: candidate.rank?.information_priority_score ?? 0,
            high_accuracy_bonus: candidate.rank?.high_accuracy_bonus ?? 0,
            accuracy_readiness_bonus: candidate.rank?.accuracy_readiness_bonus ?? 0,
            closeness_fallback_score: candidate.rank?.closeness_fallback_score ?? 0,
            opseq_rerank_bonus: candidate.rank?.opseq_rerank_bonus ?? 0,
            closeness_score: candidate.rank?.closeness_score ?? 0,
            information_gain_score: candidate.rank?.information_gain_score ?? 0,
            unlock_score: candidate.rank?.unlock_score ?? 0,
            completion_readiness_score: candidate.rank?.completion_readiness_score ?? 0,
            context_quality_score: candidate.rank?.context_quality_score ?? 0,
            risk_penalty: candidate.rank?.risk_penalty ?? 0,
            opseq_analog_count: candidate.rank?.opseq_analog_count ?? 0,
            opseq_best_analog_score: candidate.rank?.opseq_best_analog_score ?? 0,
            opseq_best_matched_analog_score: candidate.rank?.opseq_best_matched_analog_score ?? 0,
          },
        })),
      };
      const result = spawnSync(
        "python3",
        [scriptPath, "--db", dbPath, ...(params.sessionId ? ["--session", params.sessionId] : []), "--models", modelsPath],
        {
          encoding: "utf8",
          input: JSON.stringify(payload),
          timeout: params.timeoutMs ?? 60_000,
          maxBuffer: 128 * 1024 * 1024,
        },
      );

      if (result.error) {
        console.error(`[board] model rerank scorer spawn failed: ${oneLine(result.error.message)}`);
        return null;
      }
      if (result.status !== 0) {
        console.error(`[board] model rerank scorer exited with status ${String(result.status)}: ${errorDetail(result.stdout ?? "", result.stderr ?? "")}`);
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.stdout ?? "");
      } catch (error) {
        console.error(`[board] model rerank scorer returned invalid JSON: ${oneLine(error)}`);
        return null;
      }
      if (!isPlainObject(parsed) || parsed.ok !== true) {
        const detail = isPlainObject(parsed) && typeof parsed.error === "string" ? `: ${oneLine(parsed.error).slice(0, 500)}` : "";
        console.error(`[board] model rerank scorer returned an unsuccessful response${detail}`);
        return null;
      }
      if (!isPlainObject(parsed.scores)) {
        console.error("[board] model rerank scorer returned invalid scores");
        return null;
      }

      const scores: PredictorScores = {};
      for (const [targetKey, rawScore] of Object.entries(parsed.scores)) {
        if (!isPlainObject(rawScore)) continue;
        const pWin = Number(rawScore.p_win);
        const pMatch = Number(rawScore.p_match);
        if (!Number.isFinite(pWin) || !Number.isFinite(pMatch)) continue;
        scores[targetKey] = { p_win: pWin, p_match: pMatch };
      }
      return scores;
    } catch (error) {
      console.error(`[board] model rerank scorer failed: ${oneLine(error)}`);
      return null;
    }
  };
}
