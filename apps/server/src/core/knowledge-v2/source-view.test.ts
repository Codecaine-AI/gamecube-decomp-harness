import { describe, expect, test } from "bun:test";
import { formatSourceView, renderSourceView, sourceViewStartLine, type SourceName } from "./source-view.js";

const name = (symbol = "fn_80000000", value = "DrawFrame", source_path = "src/test.c"): SourceName => ({
  symbol, value, source_path, stable_key: `${source_path}:${symbol}`, confidence: 0.7, fact_id: `fact:${symbol}`, updated_at: "2026-09-05T00:00:00Z",
});
const render = (source: string, names = [name()]) => renderSourceView({ path: "src/test.c", source, names });

describe("proposed-name source view", () => {
  test("renders declarations, calls, and function references without modifying original text", () => {
    const source = 'void fn_80000000(void) {}\nvoid test(void) { fn_80000000(); callback = &fn_80000000; }';
    const result = render(source);
    expect(result.substitutions).toBe(3);
    expect(result.content).toBe(source.replaceAll("fn_80000000", "DrawFrame"));
    expect(result.content.split("\n")).toHaveLength(source.split("\n").length);
    expect(result.symbols).toContainEqual(expect.objectContaining({ canonical: "fn_80000000", proposed: "DrawFrame", subject: "src/test.c:fn_80000000", fact_id: "fact:fn_80000000" }));
    expect(source).toContain("fn_80000000");
  });

  test("leaves comments, strings, member accesses, and preprocessor bodies intact", () => {
    const source = '#define TEXT "fn_80000000"\nvoid test(void) {\n/* fn_80000000 */\nputs("fn_80000000");\nobj.fn_80000000();\nfn_80000000();\n}';
    const result = render(source);
    expect(result.substitutions).toBe(1);
    expect(result.content).toContain('puts("fn_80000000")');
    expect(result.content).toContain('/* fn_80000000 */');
    expect(result.content).toContain('obj.fn_80000000()');
    expect(result.content).toContain('DrawFrame();');
    expect(result.content).toContain('#define TEXT "fn_80000000"');
  });

  test("does not rename parameter or local pointer bindings and their uses", () => {
    for (const source of [
      "void test(int fn_80000000) { fn_80000000++; }",
      "void test(void) { void (*fn_80000000)(void); fn_80000000(); }",
      "int fn_80000000; void test(void) { fn_80000000++; }",
    ]) {
      expect(render(source).content).toBe(source);
      expect(render(source).substitutions).toBe(0);
    }
  });

  test("chooses same-file identities and rejects ambiguous external names", () => {
    const source = "void fn_80000000(void) {}";
    const names = [name(), name("fn_80000000", "OtherFunction", "src/other.c")];
    expect(render(source, names).content).toBe("void DrawFrame(void) {}");
    const external = renderSourceView({ path: "src/caller.c", source: "void call(void) { fn_80000000(); }", names });
    expect(external.substitutions).toBe(0);
    expect(external.symbols[0]?.status).not.toBe("substituted");
  });

  test("does not bind a local definition to another file's KB identity", () => {
    const result = render("static void fn_80000000(void) {}", [name("fn_80000000", "OtherFunction", "src/other.c")]);
    expect(result.substitutions).toBe(0);
    expect(result.symbols[0]?.status).toBe("different_file_binding");
  });

  test("rejects existing and proposed spelling collisions", () => {
    const existing = "void DrawFrame(void) {}\nvoid fn_80000000(void) {}";
    expect(render(existing).content).toBe(existing);
    const source = "void fn_80000000(void) {}\nvoid fn_80000004(void) {}";
    expect(render(source, [name(), name("fn_80000004")]).content).toBe(source);
  });

  test("does not substitute macro aliases, unsupported names, or uncertain syntax", () => {
    const macro = "#define fn_80000000(x) call(x)\nvoid test(void) { fn_80000000(1); }";
    expect(render(macro).content).toBe(macro);
    expect(render("void fn_80000000(void) {}", [name("fn_80000000", "Likely DrawFrame.")]).substitutions).toBe(0);
    const malformed = "void test(void) { fn_80000000( ; }";
    const result = render(malformed);
    expect(result.parse_errors).toBeGreaterThan(0);
    expect(result.substitutions).toBe(0);
  });

  test("pages on original lines and keeps a map for each substituted symbol within the budget", () => {
    const source = Array.from({ length: 100 }, (_, i) => `void function_${i}(void) { fn_80000000(); }`).join("\n");
    const first = renderSourceView({ path: "src/test.c", source, names: [name()], maxChars: 3000 });
    expect(first.next_line).toBe(first.end_line + 1);
    expect(formatSourceView(first).length).toBeLessThanOrEqual(3000);
    expect(first.symbols.some((entry) => entry.canonical === "fn_80000000")).toBe(true);
    const second = renderSourceView({ path: "src/test.c", source, names: [name()], startLine: first.next_line!, maxLines: 1 });
    expect(second.content).toBe(source.split("\n")[first.end_line].replace("fn_80000000", "DrawFrame"));
    expect(second.source_sha256).toBe(first.source_sha256);
    expect(render(source + " ").source_sha256).not.toBe(first.source_sha256);
  });

  test("reports missing knowledge, unchanged functions, and unsupported field names", () => {
    const result = renderSourceView({ path: "src/test.c", source: "void call(void) { missing(); p->x14 = 0; }", names: [], knowledgeStatus: "knowledge_unavailable" });
    expect(result.substitutions).toBe(0);
    expect(result.symbols.some((entry) => entry.canonical === "missing" && entry.status === "no_kb_identity")).toBe(true);
    expect(formatSourceView(result)).toContain("function names only");
    expect(formatSourceView(result)).toContain("knowledge_unavailable");
  });

  test("finds the target definition for long-file context and handles invalid pages", () => {
    const source = "\n".repeat(1000) + "void fn_80000000(void) {}";
    expect(sourceViewStartLine(source, "fn_80000000", 1500)).toBe(989);
    expect(renderSourceView({ path: "x.c", source: "", names: [], startLine: 2 }).status).toBe("line_out_of_range");
  });

  test("does not apply global names inside C++ namespaces or qualified member references", () => {
    const source = "namespace A { void fn_80000000() {} }\nvoid test() { A::fn_80000000(); obj->fn_80000000(); }";
    expect(render(source).content).toBe(source);
    expect(render(source).substitutions).toBe(0);
  });

  test("reports a line too large without looping continuation and accounts for long path headers", () => {
    const result = renderSourceView({ path: "src/test.c", source: "a".repeat(4000), names: [], maxChars: 1500 });
    expect(result.status).toBe("line_too_long");
    expect(result.next_line).toBeNull();
    expect(formatSourceView(result)).toContain("Read the canonical file");
    const bounded = renderSourceView({ path: `src/${"directory/".repeat(30)}test.c`, source: "void test() {}\n".repeat(1000), names: [], maxChars: 1500 });
    expect(formatSourceView(bounded).length).toBeLessThanOrEqual(1500);
  });
});
