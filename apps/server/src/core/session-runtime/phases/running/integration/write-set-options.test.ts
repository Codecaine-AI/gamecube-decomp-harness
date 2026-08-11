import { describe, expect, test } from "bun:test";
import { writeSetIntegrationFlags } from "./write-set-options.js";

describe("write-set integration flags", () => {
  test("default is entirely off", () => {
    expect(writeSetIntegrationFlags(new Map())).toEqual({
      mergeOnFinish: false,
      writeSetWidening: "off",
      confirmationPass: false,
    });
  });

  test("confirmation requires merge-on-finish and widening together", () => {
    expect(
      writeSetIntegrationFlags(
        new Map<string, string | true>([
          ["--merge-on-finish", true],
          ["--write-set-widening", "header"],
        ]),
      ),
    ).toEqual({ mergeOnFinish: true, writeSetWidening: "header", confirmationPass: true });
    expect(writeSetIntegrationFlags(["--merge-on-finish", "--write-set-widening=off"]).confirmationPass).toBe(false);
  });

  test("uses the canonical widening parser", () => {
    expect(writeSetIntegrationFlags(["--write-set-widening"]).writeSetWidening).toBe("shadow");
    expect(() => writeSetIntegrationFlags(["--write-set-widening=foreign"])).toThrow("off, shadow, config, header");
  });
});
