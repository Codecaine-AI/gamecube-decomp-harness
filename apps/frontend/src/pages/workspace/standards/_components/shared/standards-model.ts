import type { StandardRecord } from "@/lib/format";

export interface StandardsFamilyGroup {
  family: string;
  items: StandardRecord[];
}

export const STANDARD_STATUS_OPTIONS = ["accepted", "proposed", "superseded", "merged", "workflow_only"];
export const STANDARD_FAMILY_OPTIONS = [
  "",
  "authored_source_shape",
  "typed_access_and_pointer_math",
  "asserts_reports_and_header_inlines",
  "literals_data_and_externs",
  "codegen_tactics",
  "names_defines_headers_and_prototypes",
  "pipeline_owned_verification",
];
export const STANDARD_DISPOSITION_OPTIONS = ["", "active", "merged", "workflow_only"];
export const STANDARD_SEVERITY_OPTIONS = ["", "required", "workflow_context", "workflow_only"];
export const STANDARD_QA_OPTIONS = [
  "",
  "hard_lint",
  "hard_lint_plus_warning",
  "partial_hard_lint_plus_warning",
  "partial_hard_lint_plus_repair_hints",
  "partial_lint_plus_pre_ship_review",
  "pre_ship_review",
  "pipeline_owned",
  "pipeline_owned_plus_data_lint",
];

const FAMILY_ORDER = STANDARD_FAMILY_OPTIONS.filter(Boolean);
const FAMILY_LABELS: Record<string, string> = {
  authored_source_shape: "Authored Source",
  typed_access_and_pointer_math: "Typed Access",
  asserts_reports_and_header_inlines: "Asserts & Inlines",
  literals_data_and_externs: "Literals & Data",
  codegen_tactics: "Codegen Tactics",
  names_defines_headers_and_prototypes: "Names & Headers",
  pipeline_owned_verification: "Pipeline Verification",
};

export function statusTone(status: string): string {
  if (status === "accepted") return "text-up";
  if (status === "proposed") return "text-warn";
  if (status === "merged") return "text-cyan";
  if (status === "workflow_only") return "text-purple";
  return "text-dim";
}

export function statusDotClass(status: string): string {
  if (status === "accepted") return "bg-up";
  if (status === "proposed") return "bg-warn";
  if (status === "merged") return "bg-cyan";
  if (status === "workflow_only") return "bg-purple";
  return "bg-faint";
}

export function shortStandardId(id: string): string {
  return id.replace(/^global_standard:/, "");
}

export function prettySlug(id: string): string {
  const slug = shortStandardId(id);
  return (
    slug
      .split("-")
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(" ")
      .trim() ||
    slug ||
    id
  );
}

function labelize(value: string): string {
  return value
    .replace(/^global_standard:/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function familyLabel(family?: string): string {
  if (!family) return "Unassigned";
  return FAMILY_LABELS[family] ?? labelize(family);
}

export function createStandardDraft(): StandardRecord {
  const slug = `new-standard-${Date.now().toString(36)}`;
  return {
    id: `global_standard:${slug}`,
    title: "",
    summary: [],
    status: "accepted",
    family: "authored_source_shape",
    disposition: "active",
    severity: "required",
    qaEnforcement: "pre_ship_review",
    workerFacing: true,
    qaRuleIds: [],
    examplePolicy: "summary_in_worker_targeted_examples_for_repair_and_preship",
    preferredRepairs: [],
    do: [],
    doNot: [],
    evidenceRefs: [],
  };
}

export function validateStandardDraft(record: StandardRecord): string[] {
  const errors: string[] = [];
  if (!/^global_standard:[a-z0-9-]+$/.test(record.id)) errors.push("id must match global_standard:<slug> (lowercase, dashes).");
  if (!record.title.trim()) errors.push("title is required.");
  if (record.summary.map((item) => item.trim()).filter(Boolean).length === 0) errors.push("summary is required.");
  if (!STANDARD_STATUS_OPTIONS.includes(record.status)) errors.push("status must be accepted, proposed, superseded, merged, or workflow_only.");
  return errors;
}

export function standardSaveEdit(draft: StandardRecord): Record<string, unknown> {
  return {
    id: draft.id.trim(),
    title: draft.title.trim(),
    summary: draft.summary.map((item) => item.trim()).filter(Boolean),
    status: draft.status,
    family: draft.family?.trim() || undefined,
    disposition: draft.disposition?.trim() || undefined,
    severity: draft.severity?.trim() || undefined,
    qaEnforcement: draft.qaEnforcement?.trim() || undefined,
    workerFacing: draft.workerFacing !== false,
    retiredInto: draft.retiredInto?.trim() || undefined,
    qaRuleIds: (draft.qaRuleIds ?? []).map((item) => item.trim()).filter(Boolean),
    examplePolicy: draft.examplePolicy?.trim() || undefined,
    preferredRepairs: (draft.preferredRepairs ?? []).map((item) => item.trim()).filter(Boolean),
    do: draft.do.map((item) => item.trim()).filter(Boolean),
    doNot: draft.doNot.map((item) => item.trim()).filter(Boolean),
    evidenceRefs: draft.evidenceRefs.map((item) => item.trim()).filter(Boolean),
  };
}

export function filterStandards(records: StandardRecord[], query: string): StandardRecord[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return records;
  return records.filter((record) => standardSearchText(record).includes(normalizedQuery));
}

export function groupStandardsByFamily(records: StandardRecord[]): StandardsFamilyGroup[] {
  const seen = new Set<string>();
  const orderedFamilies: string[] = [];
  for (const family of FAMILY_ORDER) {
    seen.add(family);
    orderedFamilies.push(family);
  }
  for (const record of records) {
    const family = record.family ?? "unassigned";
    if (!seen.has(family)) {
      seen.add(family);
      orderedFamilies.push(family);
    }
  }
  return orderedFamilies
    .map((family) => ({ family, items: records.filter((record) => (record.family ?? "unassigned") === family) }))
    .filter((group) => group.items.length > 0);
}

function standardSearchText(record: StandardRecord): string {
  return `${record.id} ${record.title} ${record.summary.join(" ")} ${record.family ?? ""} ${record.disposition ?? ""} ${record.severity ?? ""} ${
    record.qaEnforcement ?? ""
  } ${(record.qaRuleIds ?? []).join(" ")}`.toLowerCase();
}
