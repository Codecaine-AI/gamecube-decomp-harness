import type { CommandResult } from "@server/infrastructure/shell/run-command.js";

// The IR-oracle clang check the steering gate runs before `reduce` may run
// anywhere (worker sandbox, build sandbox, host opt-in). Dependency-free so
// the bundled build-task worker can evaluate it in the sandbox.

/**
 * The LLVM major every IR-oracle clang must have, sandbox or host:
 * `ORCH_IR_ORACLE_CLANG=/usr/bin/clang-21` from apt.llvm.org in the image
 * (evidence/ir-oracle-clang21.md). Apple clang's numbering is not LLVM's.
 */
export const STEERING_SANDBOX_CLANG_MAJOR = 21;

/** The fail-closed reason when no placement has the pinned clang. */
export const STEERING_NO_CLANG_REASON = `snapshot lacks clang-${STEERING_SANDBOX_CLANG_MAJOR}; rebuild the image`;

/** What the probe found: the IR-oracle clang `ir_oracle.find_clang()` would use there. */
export interface SteeringSandboxProbe {
  ok: boolean;
  clang: string | null;
  clangVersion: string | null;
  /** The clang's LLVM major (`__clang_major__` of a non-Apple build), when known. */
  llvmMajor?: number | null;
  demangler?: string | null;
  reason: string;
}

/**
 * Prints `ORCH_IR_ORACLE_CLANG`, whether it is an executable file, its
 * `--version` line, the `__clang_major__` / `__apple_build_version__`
 * macros it predefines, and the demangler `ir_oracle.demangle` uses.
 */
export const STEERING_CLANG_PROBE_PY = [
  "import json,os,re,shutil,subprocess",
  "c=os.environ.get('ORCH_IR_ORACLE_CLANG') or ''",
  "o={'clang':c or None,'executable':bool(c) and os.path.isfile(c) and os.access(c,os.X_OK),'version':None,'macros':{},",
  "   'demangler':shutil.which('c++filt') or shutil.which('llvm-cxxfilt')}",
  "if o['executable']:",
  "  try:",
  "    r=subprocess.run([c,'--version'],capture_output=True,text=True,timeout=20)",
  "    o['version']=((r.stdout or '').splitlines() or [''])[0].strip() or None",
  "    m=subprocess.run([c,'-dM','-E','-x','c',os.devnull],capture_output=True,text=True,timeout=20)",
  "    o['macros']={k:v for k,v in re.findall(r'^#define (__clang_major__|__apple_build_version__) (\\S+)',m.stdout or '',re.M)}",
  "  except Exception as e:",
  "    o['error']=str(e)",
  "print(json.dumps(o))",
].join("\n");

/**
 * Judges the probe's output (`where` names the machine in reasons). `reduce`
 * runs only with an explicit, executable `ORCH_IR_ORACLE_CLANG` whose LLVM
 * major is `STEERING_SANDBOX_CLANG_MAJOR`: IR fingerprints and group
 * verdicts differ between clang versions (evidence/ir-oracle-clang21.md).
 * Apple clang is refused outright: `Apple clang version 21.0.0` and its
 * `__clang_major__ 21` are Apple's numbering, not LLVM 21. A demangler must be
 * on PATH under a name `ir_oracle.demangle` looks for, or IR function names
 * stay mangled and no longer attribute edit groups to functions.
 */
export function evaluateSandboxProbe(result: CommandResult, where: "sandbox" | "host" = "sandbox"): SteeringSandboxProbe {
  const none = (reason: string, clang: string | null = null, clangVersion: string | null = null) => ({ ok: false, clang, clangVersion, reason });
  if (result.exitCode !== 0) return none(`${where} clang probe exited ${result.exitCode}${result.stderr.trim() ? `: ${result.stderr.trim().slice(-200)}` : ""}`);
  const parsed = parseJsonLine(result.stdout.trim().split("\n").at(-1) ?? "");
  if (!isRecord(parsed)) return none(`${where} clang probe did not return JSON`);
  const clang = typeof parsed.clang === "string" && parsed.clang ? parsed.clang : null;
  const version = typeof parsed.version === "string" && parsed.version ? parsed.version : null;
  if (!clang) return none(`ORCH_IR_ORACLE_CLANG is not set on the ${where}`);
  if (parsed.executable !== true) return none(`ORCH_IR_ORACLE_CLANG ${clang} is not an executable file on the ${where}`, clang);
  if (!version) return none(`${clang} --version gave no version${typeof parsed.error === "string" ? ` (${parsed.error})` : ""}`, clang);
  const macros = isRecord(parsed.macros) ? parsed.macros : {};
  if (/^\s*Apple\b/.test(version) || macros.__apple_build_version__ !== undefined) {
    return none(`${clang} is Apple clang (${version}): its version is Apple's numbering, not LLVM's; use an LLVM ${STEERING_SANDBOX_CLANG_MAJOR} clang`, clang, version);
  }
  const lineMajor = Number(/\bclang version (\d+)\./.exec(version)?.[1]);
  const macroMajor = Number(macros.__clang_major__);
  if (!Number.isInteger(macroMajor) || macroMajor !== lineMajor) {
    return none(`${clang} gave no consistent LLVM version (--version "${version}", __clang_major__ ${String(macros.__clang_major__ ?? "missing")})`, clang, version);
  }
  if (macroMajor !== STEERING_SANDBOX_CLANG_MAJOR) {
    return { ...none(`${where} clang is LLVM ${macroMajor}, not ${STEERING_SANDBOX_CLANG_MAJOR} (${version})`, clang, version), llvmMajor: macroMajor };
  }
  const demangler = typeof parsed.demangler === "string" && parsed.demangler ? parsed.demangler : null;
  if (!demangler) return { ...none(`no c++filt or llvm-cxxfilt on the ${where} PATH (ir_oracle.demangle)`, clang, version), llvmMajor: macroMajor, demangler: null };
  return { ok: true, clang, clangVersion: version, llvmMajor: macroMajor, demangler, reason: `${where} has ${version} at ${clang}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonLine(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
