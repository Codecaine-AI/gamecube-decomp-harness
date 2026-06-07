<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 4,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1001:f198a5ee914046fc",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.92,
      "title": "Curated PR 1001 lesson",
      "text": "Add `ctx.c` and `README.md` to dump branch Updated the dump-asm GitHub/Docker pipeline so dump artifacts include a decomp.me context file, `ctx.c`, and a generated `README.md` documenting the dump contents, source commit, and progress output. The PR also hardened several package shell scripts by switching from `/bin/sh` with `set -e` to bash with `set -euox pipefail`, passed commit metadata into dump runs, and installed a new `readme.py` helper in the dump-asm image. Decomp lessons: Dump branches are more useful when they publish not only assembly/source output but also decomp.me context and a short artifact README explaining what each output path is for.; For reproducible artifact dumps, record the exact source commit in generated files; this PR used both a short SHA for display and a full tree URL for navigation.; Context generation can be integrated into CI artifact production with `tools/m2ctx/m2ctx.py -pn`, reducing setup friction for future matching work.; Generated documentation for decomp artifacts should reuse project tools such as `calcprogress.py` so the reported progress stays consistent with other project metrics.; CI scripts that orchestrate builds and artifact generation should prefer strict error handling because silent unset variables or pipe failures can create misleading dump outputs. Matching tactics: Run the dump build with `GENERATE_MAP=1` so the map file exists for both artifact upload and progress/context-related tooling.; Generate a decomp.me-compatible context file during dump production with `python tools/m2ctx/m2ctx.py -pn >/output/ctx.c`.; Compute dump progress from the built DOL and generated map using `tools/calcprogress/calcprogress.py --dol build/ssbm.us.1.2/main.dol --map build/ssbm.us.1.2/GALE01.map --asm-obj-ext .s.o --old-map true`.; Copy `build/ssbm.us.1.2/GALE01.map` into the dump output so consumers can load the MetroWorks map in Dolphin or use it for symbol reference. Naming: The dump artifact README refers to the context file as `ctx.c`, matching common decomp.me context-file expectations.; Commit metadata variables were named `SHORT_SHA` and `TREE_URL` in the container environment and `short_sha`/`tree_url` in shell/Python-local contexts.; The generated README title is `Super Smash Bros Melee Dump` and uses direct artifact path links such as `/asm`, `/src`, `/GALE01.map`, and `/ctx.c`.; The map artifact remains named `GALE01.map`, matching the build output path `build/ssbm.us.1.2/GALE01.map`. Review: No issue comments, review comments, or review records were present in the provided PR slice, so there is no direct reviewer feedback to extract. Terms: ctx.c; README.md; dump branch; dump-asm; decomp.me; m2ctx; m2ctx.py; calcprogress.py; GALE01.map; main.dol; SHORT_SHA; TREE_URL; build-linux Dockerfile; entrypoint.sh; publish-packages.yml; dump-asm.yml; GENERATE_MAP; MAX_ERRORS; WINE; bash pipefail; Super Smash Bros Melee Dump; artifact README",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1001/postmortem.json",
      "created_at": "2023-11-11T20:43:10Z",
      "payload": {
        "pr": 1001,
        "title": "Add `ctx.c` and `README.md` to dump branch",
        "url": "https://github.com/doldecomp/melee/pull/1001",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Updated the dump-asm GitHub/Docker pipeline so dump artifacts include a decomp.me context file, `ctx.c`, and a generated `README.md` documenting the dump contents, source commit, and progress output. The PR also hardened several package shell scripts by switching from `/bin/sh` with `set -e` to bash with `set -euox pipefail`, passed commit metadata into dump runs, and installed a new `readme.py` helper in the dump-asm image.",
        "decomp_lessons": [
          "Dump branches are more useful when they publish not only assembly/source output but also decomp.me context and a short artifact README explaining what each output path is for.",
          "For reproducible artifact dumps, record the exact source commit in generated files; this PR used both a short SHA for display and a full tree URL for navigation.",
          "Context generation can be integrated into CI artifact production with `tools/m2ctx/m2ctx.py -pn`, reducing setup friction for future matching work.",
          "Generated documentation for decomp artifacts should reuse project tools such as `calcprogress.py` so the reported progress stays consistent with other project metrics.",
          "CI scripts that orchestrate builds and artifact generation should prefer strict error handling because silent unset variables or pipe failures can create misleading dump outputs."
        ],
        "assembly_or_matching_tactics": [
          "Run the dump build with `GENERATE_MAP=1` so the map file exists for both artifact upload and progress/context-related tooling.",
          "Generate a decomp.me-compatible context file during dump production with `python tools/m2ctx/m2ctx.py -pn >/output/ctx.c`.",
          "Compute dump progress from the built DOL and generated map using `tools/calcprogress/calcprogress.py --dol build/ssbm.us.1.2/main.dol --map build/ssbm.us.1.2/GALE01.map --asm-obj-ext .s.o --old-map true`.",
          "Copy `build/ssbm.us.1.2/GALE01.map` into the dump output so consumers can load the MetroWorks map in Dolphin or use it for symbol reference."
        ],
        "naming_conventions": [
          "The dump artifact README refers to the context file as `ctx.c`, matching common decomp.me context-file expectations.",
          "Commit metadata variables were named `SHORT_SHA` and `TREE_URL` in the container environment and `short_sha`/`tree_url` in shell/Python-local contexts.",
          "The generated README title is `Super Smash Bros Melee Dump` and uses direct artifact path links such as `/asm`, `/src`, `/GALE01.map`, and `/ctx.c`.",
          "The map artifact remains named `GALE01.map`, matching the build output path `build/ssbm.us.1.2/GALE01.map`."
        ],
        "review_feedback": [
          "No issue comments, review comments, or review records were present in the provided PR slice, so there is no direct reviewer feedback to extract."
        ],
        "searchable_terms": [
          "ctx.c",
          "README.md",
          "dump branch",
          "dump-asm",
          "decomp.me",
          "m2ctx",
          "m2ctx.py",
          "calcprogress.py",
          "GALE01.map",
          "main.dol",
          "SHORT_SHA",
          "TREE_URL",
          "build-linux Dockerfile",
          "entrypoint.sh",
          "publish-packages.yml",
          "dump-asm.yml",
          "GENERATE_MAP",
          "MAX_ERRORS",
          "WINE",
          "bash pipefail",
          "Super Smash Bros Melee Dump",
          "artifact README"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.