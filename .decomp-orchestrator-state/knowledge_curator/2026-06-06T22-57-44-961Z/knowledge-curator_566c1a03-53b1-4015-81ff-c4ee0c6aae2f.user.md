<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 1,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:10:ef7a932970c14353",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.88,
      "title": "Curated PR 10 lesson",
      "text": "Initial types includes, update .gitignore Added the first shared Dolphin-style type headers and global include scaffold, including fixed-width aliases like s8/u8/f32, volatile aliases, BOOL/TRUE/FALSE/NULL, and matrix/vector typedefs for Vec, Quaternion, Mtx, MtxPtr, Mtx44, and Mtx44Ptr. The Makefile include path was expanded so compiler searches include/dolphin and include/dolphin/mtx directly, and .vscode/ was added to .gitignore. Decomp lessons: Foundational typedef headers are useful decomp infrastructure: they allow later matched functions and structs to share consistent SDK-like primitive names.; Matrix and vector typedefs should be centralized rather than duplicated across gameplay or engine files, especially for common Dolphin SDK types like Vec and Mtx.; When adding nested include directories, update build include paths in the same PR so follow-up decomp work can use either local or subsystem-style includes.; Keep repo hygiene changes small and scoped; this PR only added .vscode/ to .gitignore alongside the header/bootstrap changes. Matching tactics: No assembly-specific matching tactics were discussed in the PR context.; The practical matching aid was type normalization: adding SDK-like typedefs makes future C signatures, structs, and arrays closer to expected decompiled source form. Naming: Primitive integer typedefs use lowercase Dolphin-style names: s8, s16, s32, s64, u8, u16, u32, u64.; Volatile primitive typedefs prefix the base type with v: vu8, vu16, vu32, vu64, vs8, vs16, vs32, vs64, vf32, vf64.; Floating-point typedefs use f32 and f64.; Boolean compatibility uses uppercase BOOL with TRUE and FALSE macros.; Geometry typedefs use Dolphin/MTX-style capitalization: Vec, Quaternion, Mtx, MtxPtr, Mtx44, Mtx44Ptr.; Header guards in the added files were mixed style: __TYPES_H__ in types.h, _global_h_ in global.h, and _mtxtypes_h_ / _mtxtype_h_ in mtxtypes.h. The mtxtypes.h guard macro names differ between #ifndef and #define in the diff excerpt, so this PR is not strong evidence for a clean guard convention. Review: No issue comments or review comments were present in the provided PR context.; One review is counted, but no review body or actionable feedback was included in the excerpt. Terms: PR10; Initial types includes; PsiLupan; include/dolphin/types.h; include/dolphin/mtx/mtxtypes.h; include/global.h; Makefile INCLUDES; .gitignore .vscode; u8; u16; u32; u64; s8; s16; s32; s64; vu8; vu16; vu32; vu64; vs8; vs16; vs32; vs64; f32; f64; vf32; vf64; BOOL; TRUE; FALSE; NULL; Vec; Quaternion; Mtx; MtxPtr; Mtx44; Mtx44Ptr; Dolphin types; MTX types; global.h; functions.h; variables.h",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-10/postmortem.json",
      "created_at": "2020-07-02T20:49:05Z",
      "payload": {
        "pr": 10,
        "title": "Initial types includes, update .gitignore",
        "url": "https://github.com/doldecomp/melee/pull/10",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Added the first shared Dolphin-style type headers and global include scaffold, including fixed-width aliases like s8/u8/f32, volatile aliases, BOOL/TRUE/FALSE/NULL, and matrix/vector typedefs for Vec, Quaternion, Mtx, MtxPtr, Mtx44, and Mtx44Ptr. The Makefile include path was expanded so compiler searches include/dolphin and include/dolphin/mtx directly, and .vscode/ was added to .gitignore.",
        "decomp_lessons": [
          "Foundational typedef headers are useful decomp infrastructure: they allow later matched functions and structs to share consistent SDK-like primitive names.",
          "Matrix and vector typedefs should be centralized rather than duplicated across gameplay or engine files, especially for common Dolphin SDK types like Vec and Mtx.",
          "When adding nested include directories, update build include paths in the same PR so follow-up decomp work can use either local or subsystem-style includes.",
          "Keep repo hygiene changes small and scoped; this PR only added .vscode/ to .gitignore alongside the header/bootstrap changes."
        ],
        "assembly_or_matching_tactics": [
          "No assembly-specific matching tactics were discussed in the PR context.",
          "The practical matching aid was type normalization: adding SDK-like typedefs makes future C signatures, structs, and arrays closer to expected decompiled source form."
        ],
        "naming_conventions": [
          "Primitive integer typedefs use lowercase Dolphin-style names: s8, s16, s32, s64, u8, u16, u32, u64.",
          "Volatile primitive typedefs prefix the base type with v: vu8, vu16, vu32, vu64, vs8, vs16, vs32, vs64, vf32, vf64.",
          "Floating-point typedefs use f32 and f64.",
          "Boolean compatibility uses uppercase BOOL with TRUE and FALSE macros.",
          "Geometry typedefs use Dolphin/MTX-style capitalization: Vec, Quaternion, Mtx, MtxPtr, Mtx44, Mtx44Ptr.",
          "Header guards in the added files were mixed style: __TYPES_H__ in types.h, _global_h_ in global.h, and _mtxtypes_h_ / _mtxtype_h_ in mtxtypes.h. The mtxtypes.h guard macro names differ between #ifndef and #define in the diff excerpt, so this PR is not strong evidence for a clean guard convention."
        ],
        "review_feedback": [
          "No issue comments or review comments were present in the provided PR context.",
          "One review is counted, but no review body or actionable feedback was included in the excerpt."
        ],
        "searchable_terms": [
          "PR10",
          "Initial types includes",
          "PsiLupan",
          "include/dolphin/types.h",
          "include/dolphin/mtx/mtxtypes.h",
          "include/global.h",
          "Makefile INCLUDES",
          ".gitignore .vscode",
          "u8",
          "u16",
          "u32",
          "u64",
          "s8",
          "s16",
          "s32",
          "s64",
          "vu8",
          "vu16",
          "vu32",
          "vu64",
          "vs8",
          "vs16",
          "vs32",
          "vs64",
          "f32",
          "f64",
          "vf32",
          "vf64",
          "BOOL",
          "TRUE",
          "FALSE",
          "NULL",
          "Vec",
          "Quaternion",
          "Mtx",
          "MtxPtr",
          "Mtx44",
          "Mtx44Ptr",
          "Dolphin types",
          "MTX types",
          "global.h",
          "functions.h",
          "variables.h"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.