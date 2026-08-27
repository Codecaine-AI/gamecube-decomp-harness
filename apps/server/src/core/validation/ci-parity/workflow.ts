export interface CiBuildMatrix {
  baseArgs: string[];
  modes: Record<string, string[]>;
}

const CONFIG_ARGS_BLOCK = /config_args=\$\(printf[ \t]+'%s '[ \t]*\\\r?\n([\s\S]*?)\)/;

function parseArgs(block: string): string[] {
  const args: string[] = [];
  for (const match of block.matchAll(/'([^']*)'/g)) {
    const token = match[1]
      .replace(/\$\{\{\s*matrix\.version\s*\}\}/g, "GALE01")
      .trim();
    if (!token.startsWith("--")) continue;
    args.push(...token.split(/\s+/));
  }
  return args;
}

export function parseCiBuildMatrix(workflowYamlText: string): CiBuildMatrix {
  const baseBlock = workflowYamlText.match(CONFIG_ARGS_BLOCK);
  if (!baseBlock) {
    throw new Error("CI workflow base config_args printf block was not found");
  }

  const modes: Record<string, string[]> = {};
  let linkArmFound = false;
  for (const arm of workflowYamlText.matchAll(/'(link|test)'\)/g)) {
    const mode = arm[1];
    if (mode === "link") linkArmFound = true;

    const armStart = (arm.index ?? 0) + arm[0].length;
    const armEnd = workflowYamlText.indexOf(";;", armStart);
    const armBody = workflowYamlText.slice(armStart, armEnd < 0 ? workflowYamlText.length : armEnd);
    const extrasBlock = armBody.match(CONFIG_ARGS_BLOCK);
    modes[mode] = extrasBlock ? parseArgs(extrasBlock[1]) : [];
  }

  if (!linkArmFound) {
    throw new Error("CI workflow link mode case arm was not found");
  }

  return {
    baseArgs: parseArgs(baseBlock[1]),
    modes,
  };
}

export function localizeConfigureArgs(
  args: string[],
  opts: { wrapperPath?: string | null },
): string[] {
  const localized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--compilers") {
      index += 1;
      continue;
    }
    if (args[index] === "--verbose") continue;
    localized.push(args[index]);
  }

  if (opts.wrapperPath != null) localized.push("--wrapper", opts.wrapperPath);
  return localized;
}
