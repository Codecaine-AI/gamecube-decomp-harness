// Markdown rendering of a calibration report (`reports/<iso>.md`); the JSON
// beside it is the record.
import type { CalibrationReport } from "./calibrate.js";
import type { LabelledMatrix } from "./evaluate.js";

function matrixTable(matrix: LabelledMatrix | null): string[] {
  if (!matrix) return ["(no thresholds: nothing evaluated)"];
  return [
    "| label | accept | abstain | reject |",
    "| --- | --- | --- | --- |",
    `| justified | ${matrix.justified.accept} | ${matrix.justified.abstain} | ${matrix.justified.reject} |`,
    `| unjustified | ${matrix.unjustified.accept} | ${matrix.unjustified.abstain} | ${matrix.unjustified.reject} |`,
  ];
}

export function renderCalibrationReport(report: CalibrationReport, stamp: string): string {
  const { selection, heldout, items } = report;
  const thresholds = selection.thresholds ? `passAt ${selection.thresholds.passAt}, failAt ${selection.thresholds.failAt}` : "none";
  const excluded = Object.entries(items.excluded)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");
  return [
    `# Advisory calibration ${stamp}`,
    "",
    `- Model: \`${report.model}\` (engine \`${report.engine}\`)`,
    `- Qualification: **${report.qualification}**${report.qualificationReasons.length ? ` (${report.qualificationReasons.join("; ")})` : ""}`,
    `- Thresholds: ${thresholds}`,
    `- Held-out: ${heldout.negativeGroups} negative and ${heldout.positiveGroups} positive groups; false accepts ${heldout.falseAccepts ?? "n/a"}; Clopper–Pearson one-sided 95 % upper bound ${heldout.upper95 ?? "n/a"} (max ${report.maxFalseAcceptUpper})`,
    `- Items: ${items.evaluated} evaluated of ${items.total}${excluded ? `; excluded: ${excluded}` : ""}`,
    `- labelSetHash \`${report.labelSetHash ?? "none"}\`, splitHash \`${report.splitHash ?? "none"}\``,
    "",
    "## Held-out, one unit per group",
    "",
    ...matrixTable(heldout.groupMatrix),
    "",
    `Accept rate ${heldout.acceptRate ?? "n/a"}, abstain rate ${heldout.abstainRate ?? "n/a"}.${heldout.conflictingGroups.length ? ` Excluded groups with conflicting labels: ${heldout.conflictingGroups.join(", ")}.` : ""}`,
    "",
    "## Held-out items (reference)",
    "",
    ...matrixTable(heldout.itemMatrix),
    "",
    `## Selection (${selection.items} items, ${selection.synthetic} synthetic)`,
    "",
    ...matrixTable(selection.thresholds ? selection.matrix : null),
    "",
    "### Synthetic items only",
    "",
    ...matrixTable(selection.thresholds ? selection.syntheticMatrix : null),
    "",
  ].join("\n");
}
