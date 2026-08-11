import {
  writeSetIntegrationFlags as runtimeWriteSetIntegrationFlags,
  type WriteSetIntegrationFlags,
} from "@server/core/project-registry/runtime-options.js";

export type {
  WriteSetIntegrationFlags,
  WriteSetWideningMode,
} from "@server/core/project-registry/runtime-options.js";

type RuntimeArgs = Map<string, string | true> | readonly string[];

function argvMap(args: readonly string[]): Map<string, string | true> {
  const parsed = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index] ?? "";
    if (!raw.startsWith("--")) continue;
    const equals = raw.indexOf("=");
    if (equals >= 0) {
      parsed.set(raw.slice(0, equals), raw.slice(equals + 1));
      continue;
    }
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      parsed.set(raw, next);
      index += 1;
    } else {
      parsed.set(raw, true);
    }
  }
  return parsed;
}

function normalizedArgs(args: RuntimeArgs): Map<string, string | true> {
  return args instanceof Map ? args : argvMap(args);
}

/**
 * Array argv support stays beside integration for direct-process fallbacks;
 * canonical validation and defaults live in project-registry/runtime-options.
 */
export function writeSetIntegrationFlags(args: RuntimeArgs): WriteSetIntegrationFlags {
  return runtimeWriteSetIntegrationFlags(normalizedArgs(args));
}

export function processWriteSetIntegrationFlags(argv: readonly string[] = process.argv.slice(2)): WriteSetIntegrationFlags {
  return writeSetIntegrationFlags(argv);
}
