<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 2,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:100:787f089ac318d58c",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.95,
      "title": "Curated PR 100 lesson",
      "text": "Address pointer to _SDA2_BASE_ PR 100 replaced a hardcoded SDA2 base address in asm/init.s with the symbolic linker label _SDA2_BASE_. In func_80005340, r2 is still initialized to the same address via lis/ori, but now uses _SDA2_BASE_@h and _SDA2_BASE_@l instead of literal 0x804DF9E0 relocations. This is a small assembly-symbol hygiene fix that makes the startup code clearer and less dependent on magic addresses. Decomp lessons: When an assembly literal address is known to be a linker/runtime base symbol, prefer the named symbol over the raw address if it preserves matching output.; SDA-related register initialization is especially worth symbolizing because r2 has ABI meaning as the small data area 2 base.; A decompilation cleanup can be valuable even when it changes only labels in assembly source and not the machine code. Matching tactics: For PowerPC absolute address construction, replace numeric immediates with symbol@h and symbol@l while preserving the lis/ori instruction pair.; Verify that symbolic substitution does not change encoded bytes; the diff excerpt shows the same instruction comments for the r2 setup sequence.; Use symbolic linker labels to document ABI register setup without perturbing match-sensitive assembly. Naming: Use _SDA2_BASE_ as the symbolic name for the address loaded into r2 during initialization.; Use @h and @l suffixes for high/low halves of symbolic addresses in lis/ori address construction.; Retain existing labels such as _db_stack_end and lbl_804DB6A0 when no stronger symbol evidence is provided. Terms: pr-100; PsiLupan; Address pointer to _SDA2_BASE_; asm/init.s; func_80005340; lbl_8000532C; _SDA2_BASE_; SDA2; r2; _db_stack_end; lbl_804DB6A0; 0x804DF9E0; lis r2; ori r2; symbolic address; small data area",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-100/postmortem.json",
      "created_at": "2021-11-10T17:18:55Z",
      "payload": {
        "pr": 100,
        "title": "Address pointer to _SDA2_BASE_",
        "url": "https://github.com/doldecomp/melee/pull/100",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "PR 100 replaced a hardcoded SDA2 base address in asm/init.s with the symbolic linker label _SDA2_BASE_. In func_80005340, r2 is still initialized to the same address via lis/ori, but now uses _SDA2_BASE_@h and _SDA2_BASE_@l instead of literal 0x804DF9E0 relocations. This is a small assembly-symbol hygiene fix that makes the startup code clearer and less dependent on magic addresses.",
        "decomp_lessons": [
          "When an assembly literal address is known to be a linker/runtime base symbol, prefer the named symbol over the raw address if it preserves matching output.",
          "SDA-related register initialization is especially worth symbolizing because r2 has ABI meaning as the small data area 2 base.",
          "A decompilation cleanup can be valuable even when it changes only labels in assembly source and not the machine code."
        ],
        "assembly_or_matching_tactics": [
          "For PowerPC absolute address construction, replace numeric immediates with symbol@h and symbol@l while preserving the lis/ori instruction pair.",
          "Verify that symbolic substitution does not change encoded bytes; the diff excerpt shows the same instruction comments for the r2 setup sequence.",
          "Use symbolic linker labels to document ABI register setup without perturbing match-sensitive assembly."
        ],
        "naming_conventions": [
          "Use _SDA2_BASE_ as the symbolic name for the address loaded into r2 during initialization.",
          "Use @h and @l suffixes for high/low halves of symbolic addresses in lis/ori address construction.",
          "Retain existing labels such as _db_stack_end and lbl_804DB6A0 when no stronger symbol evidence is provided."
        ],
        "review_feedback": [],
        "searchable_terms": [
          "pr-100",
          "PsiLupan",
          "Address pointer to _SDA2_BASE_",
          "asm/init.s",
          "func_80005340",
          "lbl_8000532C",
          "_SDA2_BASE_",
          "SDA2",
          "r2",
          "_db_stack_end",
          "lbl_804DB6A0",
          "0x804DF9E0",
          "lis r2",
          "ori r2",
          "symbolic address",
          "small data area"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.