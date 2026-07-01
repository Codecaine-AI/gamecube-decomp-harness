export type JsonObject = Record<string, unknown>;

export type GraphStatus = "accepted" | "proposal" | "rejected" | "stale" | string;

export type KnownGraphEntityType =
  | "address_reference"
  | "data_sheet_row"
  | "decomp_standard"
  | "discord_knowledge_chunk"
  | "external_document_chunk"
  | "external_header_symbol"
  | "external_map_symbol"
  | "external_source_file"
  | "function"
  | "historical_tool_issue"
  | "legacy_function"
  | "mismatch_pattern"
  | "mismatch_pattern_evidence"
  | "object_unit"
  | "path_fact"
  | "powerpc_doc_page"
  | "pull_request"
  | "source_file";

export type GraphEntityType = KnownGraphEntityType | `curated_${string}` | (string & {});

export type KnownGraphFactType =
  | "data_sheet_reference"
  | "decomp_standard"
  | "document_reference"
  | "editability"
  | "external_mirror_reference"
  | "file_match_status"
  | "function_status"
  | "historical_function_hint"
  | "historical_tool_issue"
  | "mismatch_pattern"
  | "mismatch_pattern_evidence"
  | "opseq_analog_profile"
  | "past_pr_file_rollup"
  | "past_pr_key_file"
  | "path_scoped_hint"
  | "powerpc_reference";

export type GraphFactType = KnownGraphFactType | `curated_${string}` | (string & {});

export type KnownGraphEdgeType =
  | "ANALOGOUS_TO"
  | "COMPILES_TO"
  | "CONTAINS"
  | "EVIDENCED_BY_PR"
  | "FUNCTION_HAS_MISMATCH_PATTERN"
  | "HAS_CURATED_KNOWLEDGE"
  | "HAS_CURATED_PR_LESSON"
  | "HAS_CURATED_WORKER_LESSON"
  | "HAS_DATA_SHEET_REFERENCE"
  | "HAS_DECOMP_STANDARD"
  | "HAS_DOCUMENT_REFERENCE"
  | "HAS_EXTERNAL_MIRROR_REFERENCE"
  | "HAS_HISTORICAL_FUNCTION_HINT"
  | "HAS_HISTORICAL_TOOL_LESSON"
  | "HAS_MISMATCH_PATTERN"
  | "HAS_MISMATCH_PATTERN_EVIDENCE"
  | "HAS_PATH_FACT"
  | "HAS_POWERPC_REFERENCE"
  | "HAS_RESOURCE_EVIDENCE"
  | "HAS_SOURCE_UPDATE_PROPOSAL"
  | "MENTIONED_IN_HISTORICAL_TOOL_ISSUE"
  | "TOUCHED_BY_PR";

export type GraphEdgeType = KnownGraphEdgeType | (string & {});

export interface EditabilityPayload extends JsonObject {
  mode?: "editable" | "read_only_complete" | "locked" | "blocked" | "unknown";
  reason?: string;
}

export interface FunctionStatusPayload extends JsonObject {
  unit?: string;
  sourcePath?: string;
  source_path?: string;
  symbol?: string;
  size?: number;
  fuzzy?: number;
  address?: string;
}

export interface FileMatchStatusPayload extends JsonObject {
  source_path?: string;
  units?: string[];
  function_count?: number;
  unmatched_function_count?: number;
  matched_function_count?: number;
  editability?: EditabilityPayload;
  functions?: JsonObject[];
  unmatched_functions?: JsonObject[];
}

export interface PastPrFileRollupPayload extends JsonObject {
  source_path?: string;
  touching_pr_count?: number;
  touching_prs?: JsonObject[];
  review_risks?: unknown[];
  tactics?: unknown[];
}

export interface SourceFilePayload extends JsonObject {
  source_path?: string;
  units?: string[];
  function_count?: number;
  unmatched_function_count?: number;
  matched_function_count?: number;
  editability?: EditabilityPayload;
}

export interface FunctionEntityPayload extends FunctionStatusPayload {}

export interface ObjectUnitPayload extends JsonObject {
  unit?: string;
  source_path?: string;
}

export interface PullRequestPayload extends JsonObject {
  pr?: number;
  title?: string;
  state?: string;
  author?: string;
  created_at?: string;
  merged_at?: string;
  url?: string;
  source_version_id?: string;
}

export interface MismatchPatternPayload extends JsonObject {
  id?: string;
  title?: string;
  category?: string;
  symptoms?: string[];
  tactics?: string[];
  evidence_count?: number;
  evidence_refs?: string[];
}

export interface MismatchPatternEvidencePayload extends JsonObject {
  pattern_id?: string;
  evidence_id?: string;
  kind?: string;
  title?: string;
  evidence_ref?: string;
  source_paths?: string[];
  unit?: string | null;
  symbol?: string | null;
  pr?: number | null;
  text?: string;
}

export interface OpseqAnalogProfilePayload extends JsonObject {
  source?: JsonObject;
  analog_count?: number;
  best_score?: number;
  exact_analog_count?: number;
  matched_analog_count?: number;
  top_analogs?: JsonObject[];
}

export type GraphEntityPayloadByType = {
  function: FunctionEntityPayload;
  mismatch_pattern: MismatchPatternPayload;
  mismatch_pattern_evidence: MismatchPatternEvidencePayload;
  object_unit: ObjectUnitPayload;
  pull_request: PullRequestPayload;
  source_file: SourceFilePayload;
};

export type GraphFactPayloadByType = {
  editability: EditabilityPayload;
  file_match_status: FileMatchStatusPayload;
  function_status: FunctionStatusPayload;
  mismatch_pattern: MismatchPatternPayload;
  mismatch_pattern_evidence: MismatchPatternEvidencePayload;
  opseq_analog_profile: OpseqAnalogProfilePayload;
  past_pr_file_rollup: PastPrFileRollupPayload;
};

export type GraphEntityPayload<TType extends string = string> = TType extends keyof GraphEntityPayloadByType
  ? GraphEntityPayloadByType[TType]
  : JsonObject;

export type GraphFactPayload<TType extends string = string> = TType extends keyof GraphFactPayloadByType ? GraphFactPayloadByType[TType] : JsonObject;

export type KnowledgeGraphPayload = JsonObject;

export function graphPayload(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

export function graphEntityPayload<TType extends string>(entityType: TType, value: unknown): GraphEntityPayload<TType> {
  void entityType;
  return graphPayload(value) as GraphEntityPayload<TType>;
}

export function graphFactPayload<TType extends string>(factType: TType, value: unknown): GraphFactPayload<TType> {
  void factType;
  return graphPayload(value) as GraphFactPayload<TType>;
}
