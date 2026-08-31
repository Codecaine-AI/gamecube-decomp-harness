const MOLTENVK_NOISE = /mvk-|^\s*VK_/i;
const ACTIONABLE_LINE = /FAILED:|error:|Error:|# Error/;
const MWCC_COMPILER_BLOCK = /###\s+mwcceppc\.exe Compiler:/i;

/** Pull useful compiler diagnostics out of noisy build output. */
export function actionableFailureOutput(
  result: { stdout?: string; stderr?: string } | string,
  maxLines = 40,
): string {
  const combined = typeof result === "string"
    ? result
    : [result.stdout ?? "", result.stderr ?? ""].filter(Boolean).join("\n");
  const lines = combined.split(/\r?\n/);
  const selected = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (ACTIONABLE_LINE.test(line)) selected.add(index);
    if (MWCC_COMPILER_BLOCK.test(line)) {
      for (let blockIndex = index; blockIndex <= Math.min(lines.length - 1, index + 8); blockIndex += 1) {
        selected.add(blockIndex);
      }
    }
  }

  const actionable = [...selected]
    .sort((left, right) => left - right)
    .map((index) => lines[index] ?? "")
    .filter((line) => line.trim() && !MOLTENVK_NOISE.test(line))
    .slice(0, maxLines);
  if (actionable.length > 0) return actionable.join("\n");

  const fallback = lines
    .filter((line) => line.trim() && !MOLTENVK_NOISE.test(line))
    .slice(-maxLines);
  return fallback.join("\n") || "no output";
}

/** Full compiler diagnostics retained on report-build errors for one-shot repair prompts. */
export function buildFixerFailureOutput(failure: unknown): string {
  if (failure && typeof failure === "object" && "buildFixerDiagnostics" in failure) {
    const diagnostics = (failure as { buildFixerDiagnostics?: unknown }).buildFixerDiagnostics;
    if (typeof diagnostics === "string" && diagnostics.trim()) return diagnostics;
  }
  return actionableFailureOutput(failure instanceof Error ? failure.message : String(failure), Number.POSITIVE_INFINITY);
}
