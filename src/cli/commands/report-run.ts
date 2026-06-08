import { forceReportRun } from "../../report/run.js";
import { booleanArg, type GlobalArgs } from "../args.js";

export async function reportRun(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const result = await forceReportRun(globals.repoRoot, {
    resetBaseline: booleanArg(args, "--reset-baseline"),
  });
  console.log(
    JSON.stringify(
      {
        ...result,
        steps: result.steps.map((step) => ({
          name: step.name,
          command: step.command,
          exitCode: step.exitCode,
        })),
      },
      null,
      2,
    ),
  );
}
