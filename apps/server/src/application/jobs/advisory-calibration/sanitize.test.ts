import { describe, expect, test } from "bun:test";

import { assertNoShortSecrets, createSanitizer, sanitizeDeep, sanitizeNoteText } from "./sanitize";

const ROOT = "/srv/harness";

describe("history sanitizer", () => {
  test("numeric- and boolean-looking credentials are secrets: scrubbed at 8+ characters, otherwise writing refuses", () => {
    const sanitize = createSanitizer({
      sourceRoot: ROOT,
      home: "/home/u",
      env: {
        PASSWORD: "1",
        DB_TOKEN: "true",
        PIN_KEY: "123",
        FLAG_AUTH: "on",
        NUMERIC_SECRET_KEY: "12345678",
        BOOLEAN_TOKEN: "yesyesyes",
        // Not secret-looking names, or allowlisted by name: never sensitive, whatever the value.
        MODEL_NODES_LIVE: "1",
        SSH_AUTH_SOCK: "on",
        GIT_AUTHOR_NAME: "u",
        EMPTY_TOKEN: "",
      },
    });
    expect(sanitize("pin 12345678, flag yesyesyes")).toBe("pin <redacted:env:NUMERIC_SECRET_KEY>, flag <redacted:env:BOOLEAN_TOKEN>");
    expect(sanitize.shortSecretsSeen()).toEqual([]);
    sanitize("enabled: true, retries: 123, mode on, count 1");
    expect(sanitize.shortSecretsSeen()).toEqual(["DB_TOKEN", "FLAG_AUTH", "PASSWORD", "PIN_KEY"]);
    let refusal = "";
    try {
      assertNoShortSecrets(sanitize, "freeze-replay");
    } catch (error) {
      refusal = (error as Error).message;
    }
    expect(refusal).toContain("DB_TOKEN, FLAG_AUTH, PASSWORD, PIN_KEY");
    for (const value of ["true", "123"]) expect(refusal).not.toContain(` ${value} `);

    // MODEL_NODES_LIVE=1 and the allowlisted names are not sensitive in the first place.
    const harmless = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { MODEL_NODES_LIVE: "1", SSH_AUTH_SOCK: "on", GIT_AUTHOR_NAME: "u" } });
    expect(harmless("1 on u")).toBe("1 on u");
    expect(harmless.shortSecretsSeen()).toEqual([]);
  });

  test("a short value that occurs only inside a generated marker is not a refusal", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh", SHORT_TOKEN: "env", HOME_KEY: "home" } });
    expect(sanitize("only abcdefgh and /home/u/x and Bearer zzz")).toBe("only <redacted:env:LONG_TOKEN> and <home>/x and <redacted:token>");
    expect(sanitize.shortSecretsSeen()).toEqual([]);
    sanitize("the env file");
    expect(sanitize.shortSecretsSeen()).toEqual(["SHORT_TOKEN"]);
  });

  test("marker-shaped text in the input is input: a short secret inside it still refuses", () => {
    const prose = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { PASSWORD: "p4s" } });
    expect(prose("see <redacted:env:p4s> and <home>")).toBe("see <redacted:env:p4s> and <home>");
    expect(prose.shortSecretsSeen()).toEqual(["PASSWORD"]);

    const keyed = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { PASSWORD: "p4s" } });
    sanitizeDeep({ "<redacted:env:p4s>": "safe" }, keyed);
    expect(keyed.shortSecretsSeen()).toEqual(["PASSWORD"]);
    const valued = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { PASSWORD: "p4s" } });
    sanitizeDeep({ note: ["<redacted:token> <redacted:env:p4s>"] }, valued);
    expect(valued.shortSecretsSeen()).toEqual(["PASSWORD"]);
    expect(() => assertNoShortSecrets(valued, "freeze-replay")).toThrow("PASSWORD");

    // Replacements the sanitizer wrote stay exempt, and are never rewritten by a later pattern.
    const generated = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh", SHORT_TOKEN: "Bear" } });
    expect(generated("Bearer abcdefgh")).toBe("Bearer <redacted:env:LONG_TOKEN>");
    expect(generated.shortSecretsSeen()).toEqual(["SHORT_TOKEN"]);
    const generatedOnly = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh", SHORT_TOKEN: "red" } });
    expect(generatedOnly("x abcdefgh y")).toBe("x <redacted:env:LONG_TOKEN> y");
    expect(generatedOnly.shortSecretsSeen()).toEqual([]);
  });

  test("keys are scrubbed like values, and keys that scrub to one name are kept apart", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { SECRET_TOKEN: "abcdefgh" } });
    const scrubbed = sanitizeDeep(
      {
        abcdefgh: "safe",
        nested: [{ "sk-aaaaaaaaaa": 1, "sk-bbbbbbbbbb": 2, "<redacted:token>#2": 3 }],
        [`${ROOT}/games/x`]: "path key",
      },
      sanitize,
    );
    expect(scrubbed as unknown).toEqual({
      "<redacted:env:SECRET_TOKEN>": "safe",
      nested: [{ "<redacted:token>": 1, "<redacted:token>#2": 2, "<redacted:token>#2#2": 3 }],
      "<source-root>/games/x": "path key",
    });
    expect(JSON.stringify(scrubbed)).not.toContain("abcdefgh");
    // A "__proto__" key stays a plain key.
    const proto = sanitizeDeep(JSON.parse('{"__proto__": {"abcdefgh": 1}}') as Record<string, unknown>, sanitize);
    expect(Object.keys(proto)).toEqual(["__proto__"]);
    expect(JSON.stringify(proto)).toBe('{"__proto__":{"<redacted:env:SECRET_TOKEN>":1}}');
    // A JSON note is re-serialized when a key changed, and kept byte for byte when nothing did.
    expect(JSON.parse(sanitizeNoteText('{"abcdefgh": "x"}\n', sanitize)) as unknown).toEqual({ "<redacted:env:SECRET_TOKEN>": "x" });
    expect(sanitizeNoteText('{ "kept":   "as is" }\n', sanitize)).toBe('{ "kept":   "as is" }\n');
  });
});
