<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 6,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1003:3f3a849551455ee5",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.86,
      "title": "Curated PR 1003 lesson",
      "text": "Run Linux docker containers as current user Updated GitHub Docker package workflows so Linux containers run as the host GitHub Actions user/group via `--user \"$(id -u):$(id -g)\"`, with outputs written under `${{ github.workspace }}/output` instead of `/tmp/output`. The Dockerfile was reorganized around a shared `linux-rw` stage for targets needing read/write volumes, and shell entrypoints/setup scripts were tightened to bash with `set -euo pipefail` while removing xtrace. The PR had no body or review comments in the provided slice, so rationale is inferred from the title and diff: avoid root-owned build artifacts and make CI/package outputs writable/uploadable by the runner user. Decomp lessons: For decomp CI that generates maps, dumps asm, or builds artifacts inside Docker, run containers as the host CI user to prevent root-owned files from breaking follow-up upload, cleanup, or local developer workflows.; Prefer output directories inside the GitHub Actions workspace over ad hoc `/tmp` mount points when later steps need to consume generated artifacts.; When a Docker image has multiple CI targets, factor shared volume and environment setup into an intermediate stage, but keep target-specific tools in the target that needs them.; Documentation for local Docker use should match CI invocation patterns, especially for user IDs and bind-mounted output directories.; Entry scripts used by CI packages should use a consistent shell and strict mode so failures are caught early and behavior does not depend on `/bin/sh` implementation details. Matching tactics: The PR does not change decompilation logic or matching code directly.; For assembly dump automation, the `dump-asm` workflow now runs the Docker container as the current user and writes `/output` to a workspace-owned directory, reducing permissions issues for generated asm/readme artifacts.; The `dump-asm` image keeps `dadosod` as a target-specific dependency, which is useful for future assembly-dump tooling separation.; Package tests still exercise `GENERATE_MAP=1` and `NON_MATCHING=1` builds, preserving CI coverage for map generation and non-matching build paths while adjusting mount/user behavior. Naming: Intermediate Docker stage name `linux-rw` indicates a Linux base intended for read/write input-output volume workflows.; Workflow-local output variables are named `output` and point to `${{ github.workspace }}/output` or subdirectories such as `output/generate_map` and `output/non_matching`.; Existing package target names remain descriptive and task-oriented: `build-linux`, `gen-pages`, `dump-asm`, and `check-issues`.; Environment names continue to use uppercase CI-style names such as `MAKE_FLAGS`, `SHORT_SHA`, and `TREE_URL`. Review: No PR body, issue comments, review comments, or review records were present in the provided slice.; No explicit reviewer rationale or requested changes are available; conclusions are based on the title and diff only. Terms: PR1003; run docker as current user; docker --user id -u id -g; GitHub Actions Docker permissions; root-owned output artifacts; github workspace output; /tmp/output; build-linux Dockerfile; linux-rw; dump-asm; gen-pages; check-issues; publish-packages.yml; publish-pages.yml; build-melee.yml; dump-asm.yml; MAKE_FLAGS; GENERATE_MAP; NON_MATCHING; dadosod; tools/dadosod; set -euo pipefail; entrypoint.sh",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1003/postmortem.json",
      "created_at": "2023-11-11T23:51:55Z",
      "payload": {
        "pr": 1003,
        "title": "Run Linux docker containers as current user",
        "url": "https://github.com/doldecomp/melee/pull/1003",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Updated GitHub Docker package workflows so Linux containers run as the host GitHub Actions user/group via `--user \"$(id -u):$(id -g)\"`, with outputs written under `${{ github.workspace }}/output` instead of `/tmp/output`. The Dockerfile was reorganized around a shared `linux-rw` stage for targets needing read/write volumes, and shell entrypoints/setup scripts were tightened to bash with `set -euo pipefail` while removing xtrace. The PR had no body or review comments in the provided slice, so rationale is inferred from the title and diff: avoid root-owned build artifacts and make CI/package outputs writable/uploadable by the runner user.",
        "decomp_lessons": [
          "For decomp CI that generates maps, dumps asm, or builds artifacts inside Docker, run containers as the host CI user to prevent root-owned files from breaking follow-up upload, cleanup, or local developer workflows.",
          "Prefer output directories inside the GitHub Actions workspace over ad hoc `/tmp` mount points when later steps need to consume generated artifacts.",
          "When a Docker image has multiple CI targets, factor shared volume and environment setup into an intermediate stage, but keep target-specific tools in the target that needs them.",
          "Documentation for local Docker use should match CI invocation patterns, especially for user IDs and bind-mounted output directories.",
          "Entry scripts used by CI packages should use a consistent shell and strict mode so failures are caught early and behavior does not depend on `/bin/sh` implementation details."
        ],
        "assembly_or_matching_tactics": [
          "The PR does not change decompilation logic or matching code directly.",
          "For assembly dump automation, the `dump-asm` workflow now runs the Docker container as the current user and writes `/output` to a workspace-owned directory, reducing permissions issues for generated asm/readme artifacts.",
          "The `dump-asm` image keeps `dadosod` as a target-specific dependency, which is useful for future assembly-dump tooling separation.",
          "Package tests still exercise `GENERATE_MAP=1` and `NON_MATCHING=1` builds, preserving CI coverage for map generation and non-matching build paths while adjusting mount/user behavior."
        ],
        "naming_conventions": [
          "Intermediate Docker stage name `linux-rw` indicates a Linux base intended for read/write input-output volume workflows.",
          "Workflow-local output variables are named `output` and point to `${{ github.workspace }}/output` or subdirectories such as `output/generate_map` and `output/non_matching`.",
          "Existing package target names remain descriptive and task-oriented: `build-linux`, `gen-pages`, `dump-asm`, and `check-issues`.",
          "Environment names continue to use uppercase CI-style names such as `MAKE_FLAGS`, `SHORT_SHA`, and `TREE_URL`."
        ],
        "review_feedback": [
          "No PR body, issue comments, review comments, or review records were present in the provided slice.",
          "No explicit reviewer rationale or requested changes are available; conclusions are based on the title and diff only."
        ],
        "searchable_terms": [
          "PR1003",
          "run docker as current user",
          "docker --user id -u id -g",
          "GitHub Actions Docker permissions",
          "root-owned output artifacts",
          "github workspace output",
          "/tmp/output",
          "build-linux Dockerfile",
          "linux-rw",
          "dump-asm",
          "gen-pages",
          "check-issues",
          "publish-packages.yml",
          "publish-pages.yml",
          "build-melee.yml",
          "dump-asm.yml",
          "MAKE_FLAGS",
          "GENERATE_MAP",
          "NON_MATCHING",
          "dadosod",
          "tools/dadosod",
          "set -euo pipefail",
          "entrypoint.sh"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.