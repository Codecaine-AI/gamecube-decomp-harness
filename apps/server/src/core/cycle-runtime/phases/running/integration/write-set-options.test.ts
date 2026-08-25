import { describe, expect, test } from "bun:test";
import { writeSetIntegrationFlags } from "./write-set-options.js";

describe("write-set integration flags", () => {
  test("default is entirely off", () => {
    expect(writeSetIntegrationFlags(new Map())).toEqual({
      writeSetWidening: "off",
    });
  });

  test("widening flag selects the requested rung", () => {
    expect(
      writeSetIntegrationFlags(
        new Map<string, string | true>([["--write-set-widening", "header"]]),
      ),
    ).toEqual({ writeSetWidening: "header" });
  });

  test("uses the canonical widening parser", () => {
    expect(writeSetIntegrationFlags(["--write-set-widening"]).writeSetWidening).toBe("shadow");
    expect(() => writeSetIntegrationFlags(["--write-set-widening=foreign"])).toThrow("off, shadow, config, header");
  });
});
