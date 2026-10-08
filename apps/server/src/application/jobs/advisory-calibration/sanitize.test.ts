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

    // Replacements the sanitizer wrote stay exempt.
    const generatedOnly = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh", SHORT_TOKEN: "red" } });
    expect(generatedOnly("x abcdefgh y")).toBe("x <redacted:env:LONG_TOKEN> y");
    expect(generatedOnly.shortSecretsSeen()).toEqual([]);
  });

  test("a token holding a secret is removed whole, suffix included, in prose, keys and values", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh", OVERLAP_KEY: "cdefBear" } });
    for (const token of ["Bearer abcdefgh-tail-private", "sk-abcdefgh-tail-private", "Bearer x-abcdefgh-tail-private"]) {
      expect(sanitize(`auth ${token} end`)).toBe("auth <redacted:token> end");
      const scrubbed = JSON.stringify(sanitizeDeep({ [token]: { value: `Authorization: ${token} sent`, list: [token] } }, sanitize));
      expect(scrubbed).toBe('{"<redacted:token>":{"value":"Authorization: <redacted:token> sent","list":["<redacted:token>"]}}');
      expect(scrubbed).not.toContain("tail-private");
      expect(scrubbed).not.toContain("abcdefgh");
    }
    // A secret that overlaps the start of a token: the union is one redaction.
    expect(sanitize("abcdefBearer qq zz")).toBe("ab<redacted:token> zz");
    // A secret next to a token, not overlapping it: two redactions.
    expect(sanitize("abcdefghBearer qq")).toBe("<redacted:env:LONG_TOKEN><redacted:token>");
    expect(sanitize.shortSecretsSeen()).toEqual([]);
  });

  test("escaped JSON notes are scrubbed after decoding (F12)", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh", PASSWORD: "p4s" } });
    // A JSON string note and an object note whose secret is spelled with escapes.
    expect(sanitizeNoteText('"\\u0061bcdefgh"', sanitize)).toBe('"<redacted:env:LONG_TOKEN>"');
    expect(JSON.parse(sanitizeNoteText('{"k\\u0065y": "x \\u0061bcdefgh y"}\n', sanitize))).toEqual({ key: "x <redacted:env:LONG_TOKEN> y" });
    // A duplicated key: the raw text holds a value JSON.parse dropped, so the decoded value is what is written.
    const duplicated = sanitizeNoteText('{"a": "abcdefgh", "a": "x"}', sanitize);
    expect(duplicated).not.toContain("abcdefgh");
    expect(sanitize.shortSecretsSeen()).toEqual([]);
    sanitizeNoteText('{"note": "\\u00704s"}', sanitize);
    expect(sanitize.shortSecretsSeen()).toEqual(["PASSWORD"]);
  });

  test("numbers, booleans and null are checked by their text form (F13)", () => {
    const long = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { PASSWORD: "12345678" } });
    expect(JSON.stringify(sanitizeDeep({ credential: 12345678, line: 42, list: [12345678] }, long))).toBe(
      '{"credential":"<redacted:env:PASSWORD>","line":42,"list":["<redacted:env:PASSWORD>"]}',
    );
    expect(JSON.parse(sanitizeNoteText('{"credential": 12345678}', long))).toEqual({ credential: "<redacted:env:PASSWORD>" });
    expect(long.shortSecretsSeen()).toEqual([]);
    for (const [value, scalar] of [["true", true], ["null", null], ["7", 7]] as const) {
      const short = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { PASSWORD: value } });
      sanitizeDeep({ credential: scalar }, short);
      expect(short.shortSecretsSeen()).toEqual(["PASSWORD"]);
    }
  });

  test("token schemes match in any case and remove the whole token (F15)", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { LONG_TOKEN: "abcdefgh" } });
    for (const token of ["bearer abcdefgh-tail-private", "BEARER abcdefgh-tail-private", "BeArEr x-tail-private", "SK-abcdefgh-tail-private"]) {
      expect(sanitize(`auth ${token} end`)).toBe("auth <redacted:token> end");
      const scrubbed = JSON.stringify(sanitizeDeep({ [token]: { value: `Authorization: ${token} sent`, list: [token] } }, sanitize));
      expect(scrubbed).toBe('{"<redacted:token>":{"value":"Authorization: <redacted:token> sent","list":["<redacted:token>"]}}');
      expect(scrubbed).not.toContain("tail-private");
    }
  });

  test("URL-encoded and base64 forms of a secret are scrubbed (F16)", () => {
    const secret = "abc/def+ghi";
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { SERVICE_PASSWORD: secret } });
    const forms = [
      encodeURIComponent(secret),
      Buffer.from(secret).toString("base64"),
      Buffer.from(secret).toString("base64").replace(/=+$/, ""),
      Buffer.from(secret).toString("base64url"),
    ];
    expect(forms).toContain("abc%2Fdef%2Bghi");
    expect(forms).toContain("YWJjL2RlZitnaGk=");
    for (const form of forms) {
      expect(sanitize(`https://svc:${form}@host/x?p=${form}`)).toBe("https://svc:<redacted:env:SERVICE_PASSWORD>@host/x?p=<redacted:env:SERVICE_PASSWORD>");
      const scrubbed = JSON.stringify(sanitizeDeep({ [form]: form, list: [`basic ${form}`] }, sanitize));
      expect(scrubbed).toBe('{"<redacted:env:SERVICE_PASSWORD>":"<redacted:env:SERVICE_PASSWORD>","list":["basic <redacted:env:SERVICE_PASSWORD>"]}');
    }
  });

  test("non-canonical percent and base64 encodings are matched by their decoded bytes (F18)", () => {
    const secret = "abc/def+ghi";
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { SERVICE_PASSWORD: secret } });
    const marker = "<redacted:env:SERVICE_PASSWORD>";
    for (const form of ["abc%2fdef%2bghi", "%61bc%2Fdef%2Bghi", "abc/def%2bghi", "YWJjL2Rl ZitnaGk=", "YWJj\nL2RlZitn aGk"]) {
      const text = sanitize(`https://svc:${form}@host/x and ${form}.`);
      expect(text).toBe(`https://svc:${marker}@host/x and ${marker}.`);
      const scrubbed = JSON.stringify(sanitizeDeep({ [form]: form, list: [`basic ${form}`] }, sanitize));
      expect(scrubbed).toBe(`{"${marker}":"${marker}","list":["basic ${marker}"]}`);
    }
    // At any alignment inside a longer base64 blob (HTTP basic auth "svc:<secret>"), only the groups that carry it go.
    const basic = Buffer.from(`svc:${secret}`).toString("base64");
    const scrubbed = sanitize(`Authorization: Basic ${basic}`);
    expect(scrubbed).toContain(marker);
    expect(Buffer.from(scrubbed.replace(/.*Basic /, "").replace(marker, ""), "base64").toString("latin1")).not.toContain("def+ghi");
    // Ordinary prose and paths around an encoded secret are kept.
    expect(sanitize("see %2Fusr%2Fbin and the YWJjL2RlZitnaGk= value")).toBe(`see %2Fusr%2Fbin and the ${marker} value`);
  });

  test("decoded matching is linear: 256 KiB without escapes or with invalid escapes stays fast (F19)", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { SERVICE_PASSWORD: "abc/def+ghi" } });
    const size = 256 * 1024;
    const inputs = [
      "x".repeat(size),
      "%zz".repeat(size / 3),
      `${"x".repeat(size)}%2`,
      "word ".repeat(size / 5),
      `${"y".repeat(size)}%41`,
    ];
    for (const input of inputs) {
      const started = performance.now();
      expect(sanitize(input)).toBe(input);
      // Quadratic scanning took seconds here; a generous bound keeps the test stable.
      expect(performance.now() - started).toBeLessThan(250);
    }
  });

  test("a base64 match removes exactly its own characters: neighbours in prose, paths and URLs stay (F20)", () => {
    const sanitize = createSanitizer({ sourceRoot: ROOT, home: "/home/u", env: { SERVICE_PASSWORD: "abc/def+ghi" } });
    const marker = "<redacted:env:SERVICE_PASSWORD>";
    for (const [input, expected] of [
      ["the YWJjL2RlZitnaGk value", `the ${marker} value`],
      ["https://example.test/YWJjL2RlZitnaGk/next", `https://example.test/${marker}/next`],
      ["/srv/data/YWJjL2RlZitnaGk", `/srv/data/${marker}`],
      ["key=YWJjL2RlZitnaGk;", `key=${marker};`],
      ["abYWJjL2RlZitnaGk", `ab${marker}`],
      ["x YWJjL2RlZitnaGk_url", `x ${marker}_url`],
      // Unicode spaces are whitespace everywhere (F21): the run regex and the stripping agree.
      ["wo\u2003rd YWJjL2RlZitnaGk value", `wo\u2003rd ${marker} value`],
      ["the YWJjL2Rl\u3000ZitnaGk= value", `the ${marker} value`],
      ["the YWJjL2Rl\u202fZitnaGk\u1680value", `the ${marker}\u1680value`],
      ["x\u2009abc%2fdef%2bghi\u2009y", `x\u2009${marker}\u2009y`],
      ["\u205fpre%61bc%2Fdef%2Bghi\u3000post", `\u205fpre${marker}\u3000post`],
    ] as const) {
      expect(sanitize(input)).toBe(expected);
      expect(JSON.stringify(sanitizeDeep({ [input]: [input] }, sanitize))).toBe(JSON.stringify({ [expected]: [expected] }));
    }
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
    const plain = `${JSON.stringify({ kept: "as is" }, null, 2)}\n`;
    expect(sanitizeNoteText(plain, sanitize)).toBe(plain);
    // Any other spelling of the same JSON is re-serialized from what it decodes to.
    expect(sanitizeNoteText('{ "kept":   "as is" }\n', sanitize)).toBe(plain);
  });
});
