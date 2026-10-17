/**
 * Real `STEERING_CLANG_PROBE_PY` outputs (2026-10-17): this Mac's Xcode clang,
 * and Debian bookworm amd64 containers with apt.llvm.org clang 21.1.8 and
 * 18.1.8 (`ORCH_IR_ORACLE_CLANG` set to each).
 */
export const APPLE_CLANG_21_PROBE = {
  clang: "/usr/bin/clang", executable: true, version: "Apple clang version 21.0.0 (clang-2100.1.1.101)",
  macros: { __apple_build_version__: "21000101", __clang_major__: "21" }, demangler: "/usr/bin/c++filt",
};
export const LLVM_CLANG_21_PROBE = {
  clang: "/usr/bin/clang-21", executable: true, version: "Debian clang version 21.1.8 (++20251221032947+2078da43e25a-1~exp1~20251221153113.67)",
  macros: { __clang_major__: "21" }, demangler: "/usr/local/bin/llvm-cxxfilt",
};
export const LLVM_CLANG_18_PROBE = {
  clang: "/usr/bin/clang-18", executable: true, version: "Debian clang version 18.1.8 (++20240731024826+3b5b5c1ec4a3-1~exp1~20240731144843.145)",
  macros: { __clang_major__: "18" }, demangler: "/usr/bin/c++filt",
};
/** Today's worker snapshots: no `ORCH_IR_ORACLE_CLANG` in the image. */
export const NO_CLANG_PROBE = { clang: null, executable: false, version: null, macros: {}, demangler: null };
