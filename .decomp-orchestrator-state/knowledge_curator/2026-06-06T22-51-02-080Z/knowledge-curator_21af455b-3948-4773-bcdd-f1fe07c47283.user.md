<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 7,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1004:e3a23c0333863181",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.94,
      "title": "Curated PR 1004 lesson",
      "text": "Fix artifact output directories Fixed GitHub Actions artifact paths in the dump assembly and publish pages workflows by defining a shared OUTPUT environment variable pointing at `${{ github.workspace }}/output`, using it for Docker output volume mounts, directory creation, and artifact upload paths. This corrected the previous mismatch where workflows wrote to the workspace output directory but uploaded `/tmp/output`. Decomp lessons: CI artifacts used by decomp support tooling should upload the same host directory that is mounted into Docker as `/output`; otherwise generated files may exist but not be captured by GitHub Actions.; For workflow scripts, prefer a single named environment variable for paths shared across shell commands, Docker volume mounts, and `actions/upload-artifact` configuration.; When fixing infrastructure around generated assembly dumps or pages, verify the host path, container path, and artifact upload path as a three-part contract. Naming: Used uppercase `OUTPUT` for a job-level GitHub Actions environment variable, matching common CI env-var style.; Retained existing artifact names `dump` and `pages`.; Retained existing image-related env names `REGISTRY` and `IMAGE`. Terms: pr-1004; Fix artifact output directories; ribbanya; .github/workflows/dump-asm.yml; .github/workflows/publish-pages.yml; GitHub Actions; actions/upload-artifact; artifact path; OUTPUT; github.workspace; /tmp/output; /output; docker volume; dump assembly; publish pages; generated pages; GitHub Pages; ghcr.io; SHORT_SHA; TREE_URL",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1004/postmortem.json",
      "created_at": "2023-11-12T00:40:51Z",
      "payload": {
        "pr": 1004,
        "title": "Fix artifact output directories",
        "url": "https://github.com/doldecomp/melee/pull/1004",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Fixed GitHub Actions artifact paths in the dump assembly and publish pages workflows by defining a shared OUTPUT environment variable pointing at `${{ github.workspace }}/output`, using it for Docker output volume mounts, directory creation, and artifact upload paths. This corrected the previous mismatch where workflows wrote to the workspace output directory but uploaded `/tmp/output`.",
        "decomp_lessons": [
          "CI artifacts used by decomp support tooling should upload the same host directory that is mounted into Docker as `/output`; otherwise generated files may exist but not be captured by GitHub Actions.",
          "For workflow scripts, prefer a single named environment variable for paths shared across shell commands, Docker volume mounts, and `actions/upload-artifact` configuration.",
          "When fixing infrastructure around generated assembly dumps or pages, verify the host path, container path, and artifact upload path as a three-part contract."
        ],
        "assembly_or_matching_tactics": [],
        "naming_conventions": [
          "Used uppercase `OUTPUT` for a job-level GitHub Actions environment variable, matching common CI env-var style.",
          "Retained existing artifact names `dump` and `pages`.",
          "Retained existing image-related env names `REGISTRY` and `IMAGE`."
        ],
        "review_feedback": [],
        "searchable_terms": [
          "pr-1004",
          "Fix artifact output directories",
          "ribbanya",
          ".github/workflows/dump-asm.yml",
          ".github/workflows/publish-pages.yml",
          "GitHub Actions",
          "actions/upload-artifact",
          "artifact path",
          "OUTPUT",
          "github.workspace",
          "/tmp/output",
          "/output",
          "docker volume",
          "dump assembly",
          "publish pages",
          "generated pages",
          "GitHub Pages",
          "ghcr.io",
          "SHORT_SHA",
          "TREE_URL"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.