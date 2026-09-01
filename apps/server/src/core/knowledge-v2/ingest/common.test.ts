import { describe, expect, test } from "bun:test";

import { formatAddress, shortHash, slugify, taskId } from "./common.js";

describe("knowledge-v2 ingest common helpers", () => {
  test("shortHash returns a deterministic SHA-256 prefix", () => {
    expect(shortHash("hello")).toBe("2cf24dba5fb0");
    expect(shortHash("hello")).toBe(shortHash("hello"));
  });

  test("taskId combines the pathway with the payload hash", () => {
    expect(taskId("pr_imported", "hello")).toBe(
      "task:pr_imported:2cf24dba5fb0",
    );
    expect(taskId("pr_imported", "hello")).toBe(
      taskId("pr_imported", "hello"),
    );
  });

  test("formatAddress emits uppercase, zero-padded hexadecimal", () => {
    expect(formatAddress("15")).toBe("0x0000000F");
    expect(formatAddress("2147507212")).toBe("0x80005C0C");
  });

  test("slugify normalizes and collapses separators deterministically", () => {
    expect(slugify("  Hello, WORLD!  ")).toBe("hello-world");
    expect(slugify("Hello___WORLD")).toBe("hello-world");
    expect(slugify("  Hello, WORLD!  ")).toBe(
      slugify("  Hello, WORLD!  "),
    );
  });
});
