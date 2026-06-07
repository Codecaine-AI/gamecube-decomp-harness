<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 5,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1002:7312c04c623be859",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.95,
      "title": "Curated PR 1002 lesson",
      "text": "Fix typo in dump readme Corrected a typo in the generated dump README template: the GALE01.map bullet now calls it a CodeWarrior map file instead of a MetroWorks map file. This was a one-line documentation/tooling fix under .github/packages/dump-asm with no code behavior changes. Decomp lessons: For project-facing dump documentation, prefer precise toolchain terminology: GALE01.map should be described as a CodeWarrior map file.; Small wording fixes in generator templates are preferable to patching generated output, because they prevent the typo from recurring. Naming: [object Object]; [object Object] Terms: pr-1002; Fix typo in dump readme; ribbanya; .github/packages/dump-asm/readme.py; dump-asm; README; readme.py; GALE01.map; CodeWarrior; MetroWorks; Dolphin; map file; ctx.c; asm; src",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1002/postmortem.json",
      "created_at": "2023-11-11T21:12:16Z",
      "payload": {
        "pr": 1002,
        "title": "Fix typo in dump readme",
        "url": "https://github.com/doldecomp/melee/pull/1002",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Corrected a typo in the generated dump README template: the GALE01.map bullet now calls it a CodeWarrior map file instead of a MetroWorks map file. This was a one-line documentation/tooling fix under .github/packages/dump-asm with no code behavior changes.",
        "decomp_lessons": [
          "For project-facing dump documentation, prefer precise toolchain terminology: GALE01.map should be described as a CodeWarrior map file.",
          "Small wording fixes in generator templates are preferable to patching generated output, because they prevent the typo from recurring."
        ],
        "assembly_or_matching_tactics": [],
        "naming_conventions": [
          {
            "term": "CodeWarrior map file",
            "lesson": "Use this wording for GALE01.map in dump README text rather than \"MetroWorks map file\"."
          },
          {
            "term": "GALE01.map",
            "lesson": "Continue referring to the map file by its established project filename."
          }
        ],
        "review_feedback": [],
        "searchable_terms": [
          "pr-1002",
          "Fix typo in dump readme",
          "ribbanya",
          ".github/packages/dump-asm/readme.py",
          "dump-asm",
          "README",
          "readme.py",
          "GALE01.map",
          "CodeWarrior",
          "MetroWorks",
          "Dolphin",
          "map file",
          "ctx.c",
          "asm",
          "src"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.