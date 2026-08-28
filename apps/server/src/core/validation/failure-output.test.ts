import { describe, expect, test } from "bun:test";
import { actionableFailureOutput } from "./failure-output.js";

describe("actionableFailureOutput", () => {
  test("keeps ninja and MWCC diagnostics while dropping MoltenVK noise", () => {
    const output = actionableFailureOutput({
      stdout: [
        "[12/20] Compiling mnnamenew.c",
        "FAILED: build/GALE01/src/melee/mn/mnnamenew.o",
        "### mwcceppc.exe Compiler:",
        "#    File: mnnamenew.c",
        "# -----------------------",
        "#      42: static int null_char;",
        "#   Error: object 'null_char' redefined",
        "#",
        "# Error: compiler returned 1",
        "ninja: build stopped: subcommand failed.",
      ].join("\n"),
      stderr: "[mvk-info] MoltenVK version noise\n  VK_EXT_load_store_op_none v1\n",
    });

    expect(output).toContain("FAILED: build/GALE01/src/melee/mn/mnnamenew.o");
    expect(output).toContain("### mwcceppc.exe Compiler:");
    expect(output).toContain("object 'null_char' redefined");
    expect(output).not.toContain("mvk-info");
    expect(output).not.toContain("VK_EXT");
  });

  test("uses a filtered tail when no compiler diagnostic is present", () => {
    expect(actionableFailureOutput("ordinary failure\n[mvk-error] noise\n")).toBe("ordinary failure");
  });
});
