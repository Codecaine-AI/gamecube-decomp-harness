import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { globalStandardsContext, globalStandardsPromptXml } from "@server/core/knowledge/decomp-context";
import { knowledgeSourcesRoot, projectKnowledgeRoot, resourceGraphRoot, sourceDataRoot } from "@server/core/knowledge/paths";
import type { ProjectSummary, ResolvedProject } from "@server/core/project-registry";

export type JsonObject = Record<string, unknown>;

export interface StandardsFileRecord {
  schema_version: string;
  id: string;
  kind: string;
  status: string;
  title: string;
  summary: string[] | string;
  do: string[];
  do_not: string[];
  evidence_refs: string[];
  family?: string;
  disposition?: string;
  severity?: string;
  qa_enforcement?: string;
  worker_facing?: boolean;
  retired_into?: string;
  qa_rule_ids?: string[];
  example_policy?: string;
  preferred_repairs?: string[];
  superseded_by?: string[];
  curator_update_policy?: JsonObject;
  [key: string]: unknown;
}

export interface StandardExampleFileRecord {
  schema_version: string;
  id: string;
  standard_id: string;
  qa_rule_id?: string | null;
  severity: string;
  bad_pattern: string;
  preferred_shape: string;
  description?: string[];
  why?: string;
  evidence_ref?: string;
  [key: string]: unknown;
}

export interface StandardEdit {
  id: string;
  title?: unknown;
  summary?: unknown;
  status?: unknown;
  family?: unknown;
  disposition?: unknown;
  severity?: unknown;
  qaEnforcement?: unknown;
  workerFacing?: unknown;
  retiredInto?: unknown;
  qaRuleIds?: unknown;
  examplePolicy?: unknown;
  preferredRepairs?: unknown;
  do?: unknown;
  doNot?: unknown;
  evidenceRefs?: unknown;
}

export interface StandardsService {
  applyStandardEdit: (edit: unknown, project?: ResolvedProject | null) => JsonObject;
  loadStandardsPayload: (project: ResolvedProject | null) => JsonObject;
  safeStandardsContext: (warnings: string[]) => JsonObject;
  safeStandardsXml: (warnings: string[]) => string;
  standardsInventory: (project: ResolvedProject | null) => JsonObject;
}

export interface StandardsServiceDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  projectDefaults: (project: ResolvedProject | null) => JsonObject | null;
  projectToSummary: (project: ResolvedProject) => ProjectSummary;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function boolValue(value: unknown): boolean {
  return value === true || value === "true";
}

function xmlText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function xmlAttribute(value: unknown): string {
  return xmlText(value).replaceAll('"', "&quot;");
}

function optionalXmlAttribute(name: string, value: unknown): string | null {
  const text = stringValue(value).trim();
  return text ? `${name}="${xmlAttribute(text)}"` : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter((item) => item);
  const text = stringValue(value).trim();
  return text ? [text] : [];
}

function optionalStringValue(value: unknown): string | undefined {
  const text = stringValue(value).trim();
  return text ? text : undefined;
}

function knowledgeRootForProject(project: ResolvedProject | null | undefined): string {
  return project ? resolve(project.projectDir, "knowledge") : projectKnowledgeRoot();
}

function sourceRegistryPathForProject(project: ResolvedProject | null | undefined, sourceId: string): string {
  const knowledgeRoot = knowledgeRootForProject(project);
  const registryPath = resolve(knowledgeRoot, "sources/registry.json");
  if (!existsSync(registryPath)) return sourceId;
  const registry = asObject(JSON.parse(readFileSync(registryPath, "utf8")));
  for (const item of asArray(registry.sources)) {
    const entry = typeof item === "string" ? { id: item, path: item } : asObject(item);
    if (stringValue(entry.id) === sourceId) return stringValue(entry.path, sourceId);
  }
  return sourceId;
}

function sourceDataRootForProject(project: ResolvedProject | null | undefined, sourceId: string): string {
  return resolve(knowledgeRootForProject(project), "sources", sourceRegistryPathForProject(project, sourceId), "data");
}

function standardsPaths(project: ResolvedProject | null | undefined): {
  examplesPath: string;
  standardsPath: string;
} {
  const standardsDataRoot = project ? sourceDataRootForProject(project, "decomp_standards") : sourceDataRoot("decomp_standards");
  return {
    standardsPath: resolve(standardsDataRoot, "standards.jsonl"),
    examplesPath: resolve(standardsDataRoot, "examples.jsonl"),
  };
}

function standardExampleDescription(example: StandardExampleFileRecord): string[] {
  const description = asStringArray(example.description);
  if (description.length > 0) return description;
  const legacyWhy = stringValue(example.why).trim();
  return legacyWhy ? [legacyWhy] : [];
}

function promptStandardId(id: string): string {
  return id.replace(/^global_standard:/, "");
}

function examplesByStandardId(examples: StandardExampleFileRecord[]): Map<string, StandardExampleFileRecord[]> {
  const grouped = new Map<string, StandardExampleFileRecord[]>();
  for (const example of examples) {
    const items = grouped.get(example.standard_id) ?? [];
    items.push(example);
    grouped.set(example.standard_id, items);
  }
  return grouped;
}

function formatStandardExamplePayload(example: StandardExampleFileRecord): JsonObject {
  return {
    id: example.id,
    standardId: example.standard_id,
    qaRuleId: typeof example.qa_rule_id === "string" ? example.qa_rule_id : null,
    severity: example.severity,
    badPattern: example.bad_pattern,
    preferredShape: example.preferred_shape,
    description: standardExampleDescription(example),
  };
}

function formatStandardExampleContext(example: StandardExampleFileRecord | undefined): JsonObject | null {
  if (!example) return null;
  return {
    id: example.id,
    qa_rule_id: example.qa_rule_id,
    severity: example.severity,
    bad_code: example.bad_pattern,
    preferred_code: example.preferred_shape,
    why: standardExampleDescription(example),
  };
}

function standardsContextFromRecords(records: StandardsFileRecord[], examples: StandardExampleFileRecord[]): JsonObject {
  const examplesByStandard = examplesByStandardId(examples);
  return {
    source: "decomp_standards",
    status: records.length ? "ready" : "missing_records",
    standard_count: records.length,
    accepted_standard_count: records.filter((record) => record.status === "accepted").length,
    trust_rule: "Current source, headers, symbols, splits, assembly, objdiff, and regression output outrank global standards and path facts.",
    mutation_policy: "proposal_only_until_validated",
    standards: records.map((record) => ({
      id: record.id,
      status: record.status,
      family: record.family,
      disposition: record.disposition,
      severity: record.severity,
      qa_enforcement: record.qa_enforcement,
      worker_facing: record.worker_facing,
      retired_into: record.retired_into,
      title: record.title,
      summary: asStringArray(record.summary),
      qa_rule_ids: asStringArray(record.qa_rule_ids),
      example_count: examplesByStandard.get(record.id)?.length ?? 0,
      canonical_example: formatStandardExampleContext(examplesByStandard.get(record.id)?.[0]),
      prompt_signals: {
        preferred: asStringArray(record.do),
        rejected: asStringArray(record.do_not),
      },
    })),
  };
}

function standardsPromptXmlFromRecords(records: StandardsFileRecord[], examples: StandardExampleFileRecord[]): string {
  const accepted = records.filter((record) => record.status === "accepted" && record.worker_facing !== false);
  const examplesByStandard = examplesByStandardId(examples);
  const lines = [
    "<decomp_standards>",
    "    <instruction>Use each standard as an example-backed source-quality pattern: read the description, compare the bad/preferred code pair, and apply the same transformation only when local evidence supports it.</instruction>",
    "    <authority>Current source, headers, symbols, splits, assembly, objdiff, and regression output outrank global standards and path facts.</authority>",
  ];
  for (const record of accepted) {
    const attrs = [
      `id="${xmlAttribute(promptStandardId(record.id))}"`,
      optionalXmlAttribute("family", record.family),
      optionalXmlAttribute("severity", record.severity),
      optionalXmlAttribute("qa_enforcement", record.qa_enforcement),
    ].filter(Boolean);
    lines.push(`    <standard ${attrs.join(" ")}>`);
    lines.push("        <description>");
    for (const item of asStringArray(record.summary)) lines.push(`            - ${xmlText(item)}`);
    lines.push("        </description>");
    const example = examplesByStandard.get(record.id)?.[0];
    if (example) {
      const exampleAttrs = [
        optionalXmlAttribute("id", example.id),
        optionalXmlAttribute("qa_rule_id", example.qa_rule_id),
        optionalXmlAttribute("severity", example.severity),
      ].filter(Boolean);
      lines.push(`        <canonical_example ${exampleAttrs.join(" ")}>`);
      lines.push(`            <bad_code>${xmlText(example.bad_pattern)}</bad_code>`);
      lines.push(`            <preferred_code>${xmlText(example.preferred_shape)}</preferred_code>`);
      lines.push("            <why>");
      for (const item of standardExampleDescription(example)) lines.push(`                - ${xmlText(item)}`);
      lines.push("            </why>");
      lines.push("        </canonical_example>");
    }
    const qaRuleIds = asStringArray(record.qa_rule_ids);
    if (qaRuleIds.length > 0) {
      lines.push("        <qa_rules>");
      for (const item of qaRuleIds) lines.push(`            - ${xmlText(item)}`);
      lines.push("        </qa_rules>");
    }
    lines.push("    </standard>");
  }
  lines.push("</decomp_standards>");
  return lines.join("\n");
}

function validateStandardEdit(edit: StandardEdit): string[] {
  const errors: string[] = [];
  if (!/^global_standard:[a-z0-9-]+$/.test(stringValue(edit.id))) errors.push("id must match global_standard:<slug>.");
  if (!stringValue(edit.title).trim()) errors.push("title is required.");
  if (asStringArray(edit.summary).length === 0) errors.push("summary is required.");
  if (!["accepted", "proposed", "superseded", "merged", "workflow_only"].includes(stringValue(edit.status, "accepted"))) {
    errors.push("status must be accepted, proposed, superseded, merged, or workflow_only.");
  }
  return errors;
}

export function createStandardsService(deps: StandardsServiceDeps): StandardsService {
  function readStandardsFile(path: string): StandardsFileRecord[] {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as StandardsFileRecord);
  }

  function readStandardExamplesFile(path: string): StandardExampleFileRecord[] {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as StandardExampleFileRecord);
  }

  function writeStandardsFile(path: string, records: StandardsFileRecord[]): void {
    const body = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }

  function standardsInventory(project: ResolvedProject | null): JsonObject {
    const defaults = asObject(deps.projectDefaults(project));
    const knowledge = asObject(defaults.knowledge);
    const ownedKnowledgeRoot = project ? resolve(project.projectDir, "knowledge") : projectKnowledgeRoot();
    return {
      globalSources: asArray(knowledge.globalSources).map((item) => stringValue(item)).filter(Boolean),
      projectSources: asArray(knowledge.projectSources).map((item) => stringValue(item)).filter(Boolean),
      roots: {
        projectKnowledgeRoot: ownedKnowledgeRoot,
        sourcesRoot: project ? resolve(ownedKnowledgeRoot, "sources") : knowledgeSourcesRoot(),
        resourceGraphRoot: project ? resolve(ownedKnowledgeRoot, "resource_graph") : resourceGraphRoot(),
        graphDbPath: project?.graphDbPath,
      },
      validation: asObject(defaults.validation),
      pr: asObject(defaults.pr),
    };
  }

  function safeStandardsXml(warnings: string[]): string {
    try {
      return globalStandardsPromptXml();
    } catch (error) {
      warnings.push(`Unable to render effective standards XML: ${error instanceof Error ? error.message : String(error)}`);
      return "";
    }
  }

  function safeStandardsContext(warnings: string[]): JsonObject {
    try {
      return globalStandardsContext() as JsonObject;
    } catch (error) {
      warnings.push(`Unable to load standards context: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  function loadStandardsPayload(project: ResolvedProject | null): JsonObject {
    const paths = standardsPaths(project);
    const records = readStandardsFile(paths.standardsPath);
    const examples = readStandardExamplesFile(paths.examplesPath);
    const examplesByStandard = examplesByStandardId(examples);
    const warnings: string[] = [];
    if (records.length === 0) warnings.push(`No standards found at ${paths.standardsPath}.`);
    if (examples.length === 0) warnings.push(`No standard examples found at ${paths.examplesPath}.`);
    return {
      project: project ? deps.projectToSummary(project) : null,
      sourcePath: paths.standardsPath,
      examplesPath: paths.examplesPath,
      records: records.map((record) => ({
        id: record.id,
        title: record.title,
        summary: asStringArray(record.summary),
        status: record.status,
        family: typeof record.family === "string" ? record.family : undefined,
        disposition: typeof record.disposition === "string" ? record.disposition : undefined,
        severity: typeof record.severity === "string" ? record.severity : undefined,
        qaEnforcement: typeof record.qa_enforcement === "string" ? record.qa_enforcement : undefined,
        workerFacing: typeof record.worker_facing === "boolean" ? record.worker_facing : undefined,
        retiredInto: typeof record.retired_into === "string" ? record.retired_into : undefined,
        qaRuleIds: Array.isArray(record.qa_rule_ids) ? record.qa_rule_ids.map((item) => String(item)) : undefined,
        examplePolicy: typeof record.example_policy === "string" ? record.example_policy : undefined,
        preferredRepairs: Array.isArray(record.preferred_repairs) ? record.preferred_repairs.map((item) => String(item)) : undefined,
        exampleCount: examplesByStandard.get(record.id)?.length ?? 0,
        canonicalExample: examplesByStandard.get(record.id)?.[0] ? formatStandardExamplePayload(examplesByStandard.get(record.id)![0]) : undefined,
        do: record.do ?? [],
        doNot: record.do_not ?? [],
        evidenceRefs: record.evidence_refs ?? [],
      })),
      examples: examples.map(formatStandardExamplePayload),
      effectiveXml: standardsPromptXmlFromRecords(records, examples),
      context: standardsContextFromRecords(records, examples),
      inventory: standardsInventory(project),
      warnings,
    };
  }

  function applyStandardEdit(rawEdit: unknown, project: ResolvedProject | null = null): JsonObject {
    const paths = standardsPaths(project);
    const edit = asObject(rawEdit) as unknown as StandardEdit;
    const errors = validateStandardEdit(edit);
    if (errors.length > 0) return { ok: false, errors };
    const records = readStandardsFile(paths.standardsPath);
    const index = records.findIndex((record) => record.id === edit.id);
    const existing = index >= 0 ? records[index] : null;
    const merged: StandardsFileRecord = existing
      ? {
          ...existing,
          title: stringValue(edit.title, existing.title),
          summary: "summary" in edit ? asStringArray(edit.summary) : asStringArray(existing.summary),
          status: stringValue(edit.status, existing.status || "accepted"),
          family: "family" in edit ? optionalStringValue(edit.family) : existing.family,
          disposition: "disposition" in edit ? optionalStringValue(edit.disposition) : existing.disposition,
          severity: "severity" in edit ? optionalStringValue(edit.severity) : existing.severity,
          qa_enforcement: "qaEnforcement" in edit ? optionalStringValue(edit.qaEnforcement) : existing.qa_enforcement,
          worker_facing: "workerFacing" in edit ? boolValue(edit.workerFacing) : existing.worker_facing,
          retired_into: "retiredInto" in edit ? optionalStringValue(edit.retiredInto) : existing.retired_into,
          qa_rule_ids: "qaRuleIds" in edit ? asStringArray(edit.qaRuleIds) : existing.qa_rule_ids,
          example_policy: "examplePolicy" in edit ? optionalStringValue(edit.examplePolicy) : existing.example_policy,
          preferred_repairs: "preferredRepairs" in edit ? asStringArray(edit.preferredRepairs) : existing.preferred_repairs,
          do: "do" in edit ? asStringArray(edit.do) : existing.do,
          do_not: "doNot" in edit ? asStringArray(edit.doNot) : existing.do_not,
          evidence_refs: "evidenceRefs" in edit ? asStringArray(edit.evidenceRefs) : existing.evidence_refs,
        }
      : {
          schema_version: "global_standard_v1",
          id: edit.id,
          kind: "global_standard",
          status: stringValue(edit.status, "accepted"),
          title: stringValue(edit.title),
          summary: asStringArray(edit.summary),
          family: optionalStringValue(edit.family),
          disposition: optionalStringValue(edit.disposition),
          severity: optionalStringValue(edit.severity),
          qa_enforcement: optionalStringValue(edit.qaEnforcement),
          worker_facing: "workerFacing" in edit ? boolValue(edit.workerFacing) : true,
          retired_into: optionalStringValue(edit.retiredInto),
          qa_rule_ids: asStringArray(edit.qaRuleIds),
          example_policy: optionalStringValue(edit.examplePolicy),
          preferred_repairs: asStringArray(edit.preferredRepairs),
          do: asStringArray(edit.do),
          do_not: asStringArray(edit.doNot),
          evidence_refs: asStringArray(edit.evidenceRefs),
          superseded_by: ["current source", "headers", "symbols", "splits", "assembly", "objdiff", "regression output"],
          curator_update_policy: {
            target_source_id: "decomp_standards",
            update_kind: "global_standard",
            mutation_policy: "proposal_only_until_validated",
          },
        };
    if (index >= 0) records[index] = merged;
    else records.push(merged);
    records.sort((a, b) => a.id.localeCompare(b.id));
    writeStandardsFile(paths.standardsPath, records);
    deps.appendLog("ui", `standards ${edit.id} ${existing ? "updated" : "created"} via Knowledge Base`);
    return { ok: true, savedId: edit.id, sourcePath: paths.standardsPath };
  }

  return {
    applyStandardEdit,
    loadStandardsPayload,
    safeStandardsContext,
    safeStandardsXml,
    standardsInventory,
  };
}

export const createKnowledgeStandardsService = createStandardsService;
