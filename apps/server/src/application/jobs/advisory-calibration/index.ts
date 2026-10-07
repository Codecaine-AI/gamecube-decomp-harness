// `bun run server:job -- advisory-calibration <command> …` (plan §5 M12, §6.9):
// grouped held-out calibration of the llm_review advisory decision, the
// frozen replay fixture, and the offline replay of the shadow handler's code
// path. Command modules load on first use, so job-runner stays cheap to start.
//
//   build-dataset --source-root <dir> [--game <g>] [--dir <out>]
//   shadow-export --source-root <dir> [--game <g>] [--dir <out>]
//   extract --engine live|replay|fake [--dir <d>] [--limit <n>] [--db <path>]
//   bootstrap-labels --engine live|replay|fake [--dir <d>] [--limit <n>] [--synthesize <n>] [--db <path>]
//   review [--dir <d>] [--reviewer <name>]
//   split [--dir <d>] [--salt <s>]
//   calibrate --engine live|replay|fake [--dir <d>] [--dry-run] [--write] [--config <file>] [--model <ref>] [--run <file>]
//             [--limit <n>] [--db <path>] [--max-false-accept-upper <x>]
//   freeze-replay --source-root <dir> --run <id> --worker-state <id> --attempt <n> --out <dir> [--game <g>] [--probability <p>]
//   replay --fixture <dir> --engine live|replay|fake [--db <path>]
import { parseCalibrationArgs } from "./args.js";

export const ADVISORY_CALIBRATION_COMMANDS = [
  "build-dataset",
  "shadow-export",
  "extract",
  "bootstrap-labels",
  "review",
  "split",
  "calibrate",
  "freeze-replay",
  "replay",
] as const;

export async function advisoryCalibration(argv: readonly string[]): Promise<void> {
  const args = parseCalibrationArgs(argv);
  switch (args.command) {
    case "build-dataset":
      await (await import("./build-dataset.js")).buildDatasetCommand(args);
      return;
    case "shadow-export":
      await (await import("./shadow-export.js")).shadowExportCommand(args);
      return;
    case "extract":
      await (await import("./extract.js")).extractCommand(args);
      return;
    case "bootstrap-labels":
      await (await import("./bootstrap-labels.js")).bootstrapLabelsCommand(args);
      return;
    case "review":
      await (await import("./review.js")).reviewCommand(args);
      return;
    case "split":
      await (await import("./split.js")).splitCommand(args);
      return;
    case "calibrate":
      await (await import("./calibrate.js")).calibrateCommand(args);
      return;
    case "freeze-replay":
      await (await import("./freeze-replay.js")).freezeReplayCommand(args);
      return;
    case "replay":
      await (await import("./replay.js")).replayCommand(args);
      return;
    default:
      throw new Error(`advisory-calibration: unknown command ${args.command} (${ADVISORY_CALIBRATION_COMMANDS.join(", ")})`);
  }
}
