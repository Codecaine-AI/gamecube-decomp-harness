export interface WorkerCanonicalToolPath {
  id: string;
  label: string;
  command?: string;
  relativePath: string;
  purpose: string;
}

export const WORKER_CANONICAL_TOOL_PATHS = [
  {
    id: "powerpc-eabi-objdump",
    label: "PowerPC objdump",
    command: "powerpc-eabi-objdump",
    relativePath: "build/binutils/powerpc-eabi-objdump",
    purpose: "Disassemble and inspect PowerPC objects.",
  },
  {
    id: "powerpc-eabi-nm",
    label: "PowerPC nm",
    command: "powerpc-eabi-nm",
    relativePath: "build/binutils/powerpc-eabi-nm",
    purpose: "Inspect symbols in PowerPC objects.",
  },
  {
    id: "powerpc-eabi-readelf",
    label: "PowerPC readelf",
    command: "powerpc-eabi-readelf",
    relativePath: "build/binutils/powerpc-eabi-readelf",
    purpose: "Inspect ELF sections and metadata.",
  },
  {
    id: "dtk",
    label: "decomp-toolkit",
    command: "dtk",
    relativePath: "build/tools/dtk",
    purpose: "Game dtk binary used by configure/build helpers.",
  },
  {
    id: "objdiff-cli",
    label: "objdiff-cli",
    command: "objdiff-cli",
    relativePath: "build/tools/objdiff-cli",
    purpose: "Narrow object and function diffing.",
  },
  {
    id: "sjiswrap",
    label: "sjiswrap",
    relativePath: "build/tools/sjiswrap.exe",
    purpose: "Shift-JIS wrapper used by MWCC build rules.",
  },
  {
    id: "wibo",
    label: "wibo",
    command: "wibo",
    relativePath: "build/tools/wibo",
    purpose: "Preferred MWCC execution wrapper for this checkout.",
  },
  {
    id: "binutils-dir",
    label: "binutils directory",
    relativePath: "build/binutils",
    purpose: "Directory added to worker PATH for powerpc-eabi-* commands.",
  },
  {
    id: "tools-dir",
    label: "tools directory",
    relativePath: "build/tools",
    purpose: "Directory added to worker PATH for dtk, objdiff-cli, and wibo.",
  },
  {
    id: "compilers-dir",
    label: "MWCC compilers directory",
    relativePath: "build/compilers",
    purpose: "Seeded compiler bundle used by build rules; do not search for MWCC elsewhere.",
  },
] as const satisfies readonly WorkerCanonicalToolPath[];

function xmlAttribute(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function workerCanonicalToolPathsXml(
  existingRelativePaths: ReadonlySet<string>,
): string {
  const lines = ["    <canonical_tool_paths>"];
  lines.push(
    '        <policy>Use these worker-local paths or PATH commands instead of filesystem-wide search. build/binutils and build/tools are on PATH for worker shells. Broad find roots such as /, /Users, /opt, /Applications, and upward ../../ sweeps are blocked; use narrow find only inside this worker checkout when local source discovery is needed.</policy>',
  );
  for (const tool of WORKER_CANONICAL_TOOL_PATHS) {
    const command = "command" in tool ? tool.command : "";
    lines.push(
      `        <tool id="${xmlAttribute(tool.id)}" label="${xmlAttribute(tool.label)}" relative_path="${xmlAttribute(tool.relativePath)}" command="${xmlAttribute(command)}" exists="${existingRelativePaths.has(tool.relativePath) ? "true" : "false"}" purpose="${xmlAttribute(tool.purpose)}" />`,
    );
  }
  lines.push("    </canonical_tool_paths>");
  return lines.join("\n");
}
