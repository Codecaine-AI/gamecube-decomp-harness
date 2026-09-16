import { describe, expect, test } from "bun:test";
import { baseConfigureCommand, configureCommandWithWrapper } from "./configure-command.js";

describe("baseConfigureCommand", () => {
  test("keeps the Melee configure command", () => {
    expect(baseConfigureCommand({ kind: "doldecomp-melee" })).toBe("python3 configure.py --require-protos");
  });

  test("omits Melee-only flags for SMS", () => {
    expect(baseConfigureCommand({ kind: "doldecomp-sms" })).toBe("python3 configure.py");
  });

  test("preserves the legacy command when the game kind is missing", () => {
    expect(baseConfigureCommand()).toBe("python3 configure.py --require-protos");
    expect(baseConfigureCommand({})).toBe("python3 configure.py --require-protos");
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
