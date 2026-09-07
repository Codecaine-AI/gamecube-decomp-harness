import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { librarianSourceContext, librarianSourcePaths } from "./source-context.js";
import { buildLibrarianV2KernelContext } from "../agent-catalog/agents/knowledge/librarian-v2/context.js";
import { buildBackfillLibrarianKernelContext } from "../agent-catalog/agents/knowledge/backfill-librarian/context.js";

const names = [{ symbol: "fn_80000000", value: "UpdateState", source_path: "src/test.c", stable_key: "test:fn_80000000", confidence: 0.8, fact_id: "name1", updated_at: "2026-09-05" }];
const subjects = [
  { kind: "entity", entity_kind: "translation_unit", entity_locator: "src/test.c", record: { subject: { id: "unit1" } } },
  { kind: "target", detail: { symbol: "fn_80000000", unit_entity_id: "unit1" }, material: { source: { locator: "code://abc123/src/test.c#L1-L1", text: "void fn_80000000(void) {}" } } },
];
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true }); });

test("identifies source files through mechanical identities and deduplicates while retaining target focus", () => {
  expect(librarianSourcePaths(subjects)).toEqual([{ path: "src/test.c", symbol: "fn_80000000" }]);
  expect(librarianSourcePaths([{ kind: "target", detail: subjects[1]!.detail }, subjects[0]])).toEqual([{ path: "src/test.c", symbol: "fn_80000000" }]);
  expect(librarianSourcePaths([{ kind: "target", record: { facts: { inferred_name: { value: "src/guessed.c" } } } }])).toEqual([]);
});

test("both librarian context builders inject readable code alongside unchanged canonical evidence", () => {
  const common = { task: {}, supportingSubjects: [], decompStandards: [], sourceFiles: [{ path: "src/test.c", source: "void fn_80000000(void) {}" }], sourceNames: names };
  const contexts = [
    buildLibrarianV2KernelContext({ ...common, object: {}, touchedSubjects: subjects }),
    buildBackfillLibrarianKernelContext({ ...common, fillOutSubjects: subjects }),
  ];
  for (const context of contexts) {
    const text = context.renderedContext!;
    expect(text).toContain('<proposed_name_files read_only="true">');
    expect(text).toContain("void UpdateState(void) {}");
    expect(text).toContain('"text": "void fn_80000000(void) {}"');
    expect(text).toContain("fn_80000000 -> UpdateState");
    expect(text).toContain("A guessed name is not evidence for its own meaning");
    expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(context.inputs[0]?.content).toBe(text);
  }
});

test("reads fresh checkout files without modifying them and contains missing or escaping paths", () => {
  const root = mkdtempSync(join(tmpdir(), "librarian-source-")); roots.push(root);
  mkdirSync(join(root, "src"));
  const path = join(root, "src/test.c");
  writeFileSync(path, "void fn_80000000(void) { first(); }");
  const options = { checkoutRoot: root, sourceNames: names };
  const first = librarianSourceContext(subjects, options);
  expect(first).toContain("void UpdateState(void) { first(); }");
  expect(readFileSync(path, "utf8")).toBe("void fn_80000000(void) { first(); }");
  writeFileSync(path, "void fn_80000000(void) { second(); }");
  expect(librarianSourceContext(subjects, options)).toContain("second();");
  expect(librarianSourceContext(subjects, options)).not.toBe(first);
  symlinkSync("/etc/hosts", join(root, "src/escape.c"));
  for (const path of ["src/missing.c", "src/escape.c", "../outside.c"]) {
    expect(librarianSourceContext([{ entity_kind: "translation_unit", entity_locator: path }], options)).toContain("File reading view unavailable for");
  }
});

test("caps librarian file count and per-file output and escapes CDATA terminators", () => {
  const files = Array.from({ length: 6 }, (_, i) => ({ path: `src/file${i}.c`, source: "void fn_80000000(void) {}\n".repeat(2000) + "/* ]]> */" }));
  const rendered = librarianSourceContext([], { sourceFiles: files, sourceNames: [] });
  expect(rendered.length).toBeLessThan(32_200);
  expect(rendered.match(/Proposed-name reading view:/g)).toHaveLength(4);
  expect(rendered).toContain("2 additional files omitted");
  const context = buildBackfillLibrarianKernelContext({ task: {}, fillOutSubjects: [], supportingSubjects: [], decompStandards: [], sourceFiles: [{ path: "x.c", source: "/* ]]> */" }], sourceNames: [] });
  expect(context.renderedContext).toContain("]]]]><![CDATA[>");
});
