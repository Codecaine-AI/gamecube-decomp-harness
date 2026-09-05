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
