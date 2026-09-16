import { describe, expect, test } from "bun:test";
import { MELEE_REQUIRE_PROTOS_PROBE, baseConfigureCommand, configureCommandWithWrapper } from "./configure-command.js";

describe("baseConfigureCommand", () => {
  test("probes the Melee checkout for --require-protos support", () => {
    expect(baseConfigureCommand({ kind: "doldecomp-melee" })).toBe(`python3 configure.py ${MELEE_REQUIRE_PROTOS_PROBE}`);
    expect(MELEE_REQUIRE_PROTOS_PROBE).toContain("configure.py --help");
    // `--no-require-protos` (post-#3471) must not match the probe.
    expect(MELEE_REQUIRE_PROTOS_PROBE).toContain("[[:space:]]--require-protos");
  });

  test("omits Melee-only flags for SMS", () => {
    expect(baseConfigureCommand({ kind: "doldecomp-sms" })).toBe("python3 configure.py");
  });

  test("preserves the legacy command when the game kind is missing", () => {
    expect(baseConfigureCommand()).toBe(`python3 configure.py ${MELEE_REQUIRE_PROTOS_PROBE}`);
    expect(baseConfigureCommand({})).toBe(`python3 configure.py ${MELEE_REQUIRE_PROTOS_PROBE}`);
  });
});

describe("configureCommandWithWrapper", () => {
  test("appends a shell-quoted wrapper path", () => {
    expect(configureCommandWithWrapper("python3 configure.py --require-protos", "build/tools/wibo"))
      .toBe("python3 configure.py --require-protos --wrapper build/tools/wibo");
  });

  test("replaces an existing wrapper", () => {
    expect(configureCommandWithWrapper("python3 configure.py --wrapper old-wibo", "new wibo"))
      .toBe("python3 configure.py --wrapper 'new wibo'");
  });
});
