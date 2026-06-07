<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9023,
  "batch_index": 3,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1000:e7f35c75528a0075",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.92,
      "title": "Curated PR 1000 lesson",
      "text": "Dump asm to a separate branch Added a dedicated CI/container path for generating assembly dumps and publishing them to a separate dump branch, instead of bundling dump generation into the documentation/pages generation flow. The PR introduced a dump-asm Docker target, a dump-asm GitHub Actions workflow, package publishing support for the new image target, and root-anchored ignore rules for generated dump-related paths. Decomp lessons: For large generated decompilation artifacts such as disassembly dumps, prefer a separate generated branch or artifact workflow rather than committing outputs into the source branch.; Keep documentation generation and assembly dump generation as separate CI responsibilities; both may require a build context, but their outputs and failure modes are different.; A dump pipeline can be automated from a normal build by enabling map generation, parsing the map, and feeding the DOL plus map CSV into the dump tool.; When CI needs the CodeWarrior compiler in a containerized build, this PR used `ln -s /opt/mwcc_compiler tools/` before invoking `make`.; Root-anchor `.gitignore` rules for generated top-level directories when the intent is only to ignore repository-root outputs, not similarly named paths elsewhere. Matching tactics: Builds with `GENERATE_MAP=1` to produce `build/ssbm.us.1.2/GALE01.map`.; Uses `MAX_ERRORS=1` during the dump build, likely to stop quickly on compilation errors while still exercising map generation; the diff does not include rationale beyond the command itself.; Runs `python tools/parse_map.py` to generate `build/map.csv` from the build map.; Runs `dadosod dol build/ssbm.us.1.2/main.dol -m build/map.csv -o /output` to produce the assembly dump.; Publishes the raw `GALE01.map` alongside the dump output by copying it into `/output`. Naming: The new workflow and package target consistently use the name `dump-asm`.; The generated assembly output branch is named `dump`.; The workflow artifact containing generated output is named `dump`.; The container entrypoint uses `/input` for the source repository and `/output` for generated dump files.; The commit message for generated dump branch updates follows `Dump of ${{ github.sha }}`. Terms: dump-asm; assembly dump; dump branch; dadosod; GALE01.map; parse_map.py; build/map.csv; GENERATE_MAP; MAX_ERRORS; mwcc_compiler; GitHub Actions; publish-packages; Dockerfile; linux-base; gen-pages; rsync --delete; upload-artifact; download-artifact; .gitignore root anchored; ribbanya",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1000/postmortem.json",
      "created_at": "2023-11-03T06:11:16Z",
      "payload": {
        "pr": 1000,
        "title": "Dump asm to a separate branch",
        "url": "https://github.com/doldecomp/melee/pull/1000",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Added a dedicated CI/container path for generating assembly dumps and publishing them to a separate dump branch, instead of bundling dump generation into the documentation/pages generation flow. The PR introduced a dump-asm Docker target, a dump-asm GitHub Actions workflow, package publishing support for the new image target, and root-anchored ignore rules for generated dump-related paths.",
        "decomp_lessons": [
          "For large generated decompilation artifacts such as disassembly dumps, prefer a separate generated branch or artifact workflow rather than committing outputs into the source branch.",
          "Keep documentation generation and assembly dump generation as separate CI responsibilities; both may require a build context, but their outputs and failure modes are different.",
          "A dump pipeline can be automated from a normal build by enabling map generation, parsing the map, and feeding the DOL plus map CSV into the dump tool.",
          "When CI needs the CodeWarrior compiler in a containerized build, this PR used `ln -s /opt/mwcc_compiler tools/` before invoking `make`.",
          "Root-anchor `.gitignore` rules for generated top-level directories when the intent is only to ignore repository-root outputs, not similarly named paths elsewhere."
        ],
        "assembly_or_matching_tactics": [
          "Builds with `GENERATE_MAP=1` to produce `build/ssbm.us.1.2/GALE01.map`.",
          "Uses `MAX_ERRORS=1` during the dump build, likely to stop quickly on compilation errors while still exercising map generation; the diff does not include rationale beyond the command itself.",
          "Runs `python tools/parse_map.py` to generate `build/map.csv` from the build map.",
          "Runs `dadosod dol build/ssbm.us.1.2/main.dol -m build/map.csv -o /output` to produce the assembly dump.",
          "Publishes the raw `GALE01.map` alongside the dump output by copying it into `/output`."
        ],
        "naming_conventions": [
          "The new workflow and package target consistently use the name `dump-asm`.",
          "The generated assembly output branch is named `dump`.",
          "The workflow artifact containing generated output is named `dump`.",
          "The container entrypoint uses `/input` for the source repository and `/output` for generated dump files.",
          "The commit message for generated dump branch updates follows `Dump of ${{ github.sha }}`."
        ],
        "review_feedback": [],
        "searchable_terms": [
          "dump-asm",
          "assembly dump",
          "dump branch",
          "dadosod",
          "GALE01.map",
          "parse_map.py",
          "build/map.csv",
          "GENERATE_MAP",
          "MAX_ERRORS",
          "mwcc_compiler",
          "GitHub Actions",
          "publish-packages",
          "Dockerfile",
          "linux-base",
          "gen-pages",
          "rsync --delete",
          "upload-artifact",
          "download-artifact",
          ".gitignore root anchored",
          "ribbanya"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.