<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 16,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1006:ba3db40b348c25b5",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.88,
      "source_path": "src/melee/ft/chara/ftCommon/ftCo_Bury.c",
      "title": "Curated PR 1006 lesson for src/melee/ft/chara/ftCommon/ftCo_Bury.c",
      "text": "Partially match `ftCo_Bury` Added a new C translation unit for the common fighter bury action and removed most of the corresponding assembly from asm/melee/ft/ft_0C08.s. The PR only partially matched the file: the report shows src/melee/ft/chara/ftCommon/ftCo_Bury.c at 95.29%, with many functions fully matching and several larger functions kept behind ASM/MUST_MATCH fallbacks. The work also typed bury-related fighter/common-data fields, added ftCommon_BuryType and lb_UnkAnimStruct, fixed helper prototypes needed by the translation, and adjusted many ground/stage callback signatures and header placements to support bury logic that queries ground animation data. src/melee/ft/chara/ftCommon/ftCo_Bury.c Decomp lessons: When a new action relies on many cross-system helpers, matching the action often requires typing adjacent APIs first; here bury needed ftcoll, lbcollision, Ground_801C5700, stage callbacks, plbonuslib, and fighter common data.; Stage callback return types can be inferred from a consumer: ftCo_Bury expects a pointer with an `x4_size` field, so callback5 and Ground_801C5700 were better modeled as returning `lb_UnkAnimStruct*` than bool.; A partially matched file can still remove a large assembly island if unmatched functions keep inline assembly fallbacks under MUST_MATCH and C code is available under WIP/non-MUST_MATCH.; Naming fields at known offsets enables downstream matches: fp+2324/fp+2328/fp+232C became bury_stage_kind/bury_timer_1/bury_timer_2 and then replaced generic uses such as dst->x232C copies.; Keep public headers narrow: internal stage static declarations belong in the .c file, especially when signatures are still evolving for decomp.; For motion-state-specific storage, adding a named `mv.co.bury` struct is preferable to spreading raw offsets across the action implementation.; Use offset comments in struct definitions when adding fields around fragile packed layouts; this PR kept comments such as `/* +5DC */` and `/* fp+2324 */` to verify alignment. Matching tactics: Used `ASM void` functions with C implementations under `#if !defined(MUST_MATCH) || defined(WIP)` and assembly bodies in the else branch for partial matches.; Used `#pragma peephole on` around assembly-fallback sections to preserve CodeWarrior behavior.; Used `#ifdef WIP #pragma force_active on` to keep literals/assert strings active when building WIP C paths.; Kept explicit extern literal declarations such as ftCo_804D8C28, ftCo_804D8C30, ftCo_804D8C38, ftCo_804D8C3C and assert string symbols for rodata/sdata stability.; Used a MUST_MATCH-only unused stack array in ftCo_800C0D0C (`u8 _[8] = { 0 };`) to address stack layout differences, according to the inline todo.; Matched small switch functions in C directly, such as ftCo_800C0874, ftCo_800C09B4, ftCo_800C0A28, ftCo_800C0A98, ftCo_800C0C88, and ftCo_800C0CB8.; Left larger functions such as ftCo_800C08A0, ftCo_800C0B20, ftCo_800C0D0C, ftCo_800C0FCC, and ftCo_Bury_Phys partially matched with assembly fallbacks as indicated by the PR report. Naming: Common fighter action files use `ftCo_<Action>.c` and `ftCo_<Action>.h`; this PR added `ftCo_Bury.c` and `ftCo_Bury.h`.; Action callbacks use the standard suffixes `_Anim`, `_IASA`, `_Phys`, and `_Coll` for `ftCo_Bury_*` functions.; Unidentified bury types were named with an enum rather than raw integers: `ftCommon_BuryType` and `BuryType_Unk0` through `BuryType_Unk3`.; Bury-related Fighter fields were named semantically but conservatively: `bury_stage_kind`, `bury_timer_1`, and `bury_timer_2`.; Unidentified common-data bury timers were named `bury_timer_unk1`, `bury_timer_unk2`, and `bury_timer_unk3`, preserving uncertainty while documenting purpose.; Library animation data was normalized as `lb_UnkAnimStruct` with fields `x0_data` and `x4_size` instead of the prior `_UnkAnimStruct`/`UnkAnimStruct` naming.; Header guards for address-range split headers used GALE01-style guards, e.g. `GALE01_0C12D8` for the remaining ft_0C08.h range. Review:...",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1006/postmortem.json",
      "created_at": "2023-11-16T22:20:24Z",
      "payload": {
        "pr": 1006,
        "title": "Partially match `ftCo_Bury`",
        "url": "https://github.com/doldecomp/melee/pull/1006",
        "agent_status": "agent_completed",
        "source_path": "src/melee/ft/chara/ftCommon/ftCo_Bury.c",
        "key_file_role": "New partial C implementation of ftCo_Bury; report shows 95.29% file match with several 100% functions and larger partial functions.",
        "summary": "Added a new C translation unit for the common fighter bury action and removed most of the corresponding assembly from asm/melee/ft/ft_0C08.s. The PR only partially matched the file: the report shows src/melee/ft/chara/ftCommon/ftCo_Bury.c at 95.29%, with many functions fully matching and several larger functions kept behind ASM/MUST_MATCH fallbacks. The work also typed bury-related fighter/common-data fields, added ftCommon_BuryType and lb_UnkAnimStruct, fixed helper prototypes needed by the translation, and adjusted many ground/stage callback signatures and header placements to support bury logic that queries ground animation data.",
        "decomp_lessons": [
          "When a new action relies on many cross-system helpers, matching the action often requires typing adjacent APIs first; here bury needed ftcoll, lbcollision, Ground_801C5700, stage callbacks, plbonuslib, and fighter common data.",
          "Stage callback return types can be inferred from a consumer: ftCo_Bury expects a pointer with an `x4_size` field, so callback5 and Ground_801C5700 were better modeled as returning `lb_UnkAnimStruct*` than bool.",
          "A partially matched file can still remove a large assembly island if unmatched functions keep inline assembly fallbacks under MUST_MATCH and C code is available under WIP/non-MUST_MATCH.",
          "Naming fields at known offsets enables downstream matches: fp+2324/fp+2328/fp+232C became bury_stage_kind/bury_timer_1/bury_timer_2 and then replaced generic uses such as dst->x232C copies.",
          "Keep public headers narrow: internal stage static declarations belong in the .c file, especially when signatures are still evolving for decomp.",
          "For motion-state-specific storage, adding a named `mv.co.bury` struct is preferable to spreading raw offsets across the action implementation.",
          "Use offset comments in struct definitions when adding fields around fragile packed layouts; this PR kept comments such as `/* +5DC */` and `/* fp+2324 */` to verify alignment."
        ],
        "assembly_or_matching_tactics": [
          "Used `ASM void` functions with C implementations under `#if !defined(MUST_MATCH) || defined(WIP)` and assembly bodies in the else branch for partial matches.",
          "Used `#pragma peephole on` around assembly-fallback sections to preserve CodeWarrior behavior.",
          "Used `#ifdef WIP #pragma force_active on` to keep literals/assert strings active when building WIP C paths.",
          "Kept explicit extern literal declarations such as ftCo_804D8C28, ftCo_804D8C30, ftCo_804D8C38, ftCo_804D8C3C and assert string symbols for rodata/sdata stability.",
          "Used a MUST_MATCH-only unused stack array in ftCo_800C0D0C (`u8 _[8] = { 0 };`) to address stack layout differences, according to the inline todo.",
          "Matched small switch functions in C directly, such as ftCo_800C0874, ftCo_800C09B4, ftCo_800C0A28, ftCo_800C0A98, ftCo_800C0C88, and ftCo_800C0CB8.",
          "Left larger functions such as ftCo_800C08A0, ftCo_800C0B20, ftCo_800C0D0C, ftCo_800C0FCC, and ftCo_Bury_Phys partially matched with assembly fallbacks as indicated by the PR report."
        ],
        "naming_conventions": [
          "Common fighter action files use `ftCo_<Action>.c` and `ftCo_<Action>.h`; this PR added `ftCo_Bury.c` and `ftCo_Bury.h`.",
          "Action callbacks use the standard suffixes `_Anim`, `_IASA`, `_Phys`, and `_Coll` for `ftCo_Bury_*` functions.",
          "Unidentified bury types were named with an enum rather than raw integers: `ftCommon_BuryType` and `BuryType_Unk0` through `BuryType_Unk3`.",
          "Bury-related Fighter fields were named semantically but conservatively: `bury_stage_kind`, `bury_timer_1`, and `bury_timer_2`.",
          "Unidentified common-data bury timers were named `bury_timer_unk1`, `bury_timer_unk2`, and `bury_timer_unk3`, preserving uncertainty while documenting purpose.",
          "Library animation data was normalized as `lb_UnkAnimStruct` with fields `x0_data` and `x4_size` instead of the prior `_UnkAnimStruct`/`UnkAnimStruct` naming.",
          "Header guards for address-range split headers used GALE01-style guards, e.g. `GALE01_0C12D8` for the remaining ft_0C08.h range."
        ],
        "review_feedback": [
          "No issue comments, review comments, or reviews were present in the provided PR slice.",
          "The only human text evidence is the match report for ftCo_Bury.c; no explicit reviewer rationale or requested changes are available."
        ],
        "searchable_terms": [
          "pr-1006",
          "ftCo_Bury",
          "ftCo_Bury.c",
          "ftCo_Bury.h",
          "ft_0C08.s",
          "ftCo_800C0874",
          "ftCo_800C08A0",
          "ftCo_800C09B4",
          "ftCo_800C0A28",
          "ftCo_800C0A98",
          "ftCo_800C0B20",
          "ftCo_800C0C88",
          "ftCo_800C0CB8",
          "ftCo_800C0D0C",
          "ftCo_800C0FCC",
          "ftCo_800C124C",
          "ftCo_Bury_Anim",
          "ftCo_Bury_IASA",
          "ftCo_Bury_Phys",
          "ftCo_Bury_Coll",
          "ftCommon_BuryType",
          "BuryType_Unk1",
          "BuryType_Unk2",
          "BuryType_Unk3",
          "bury_stage_kind",
          "bury_timer_1",
          "bury_timer_2",
          "bury_timer_unk1",
          "bury_timer_unk2",
          "bury_timer_unk3",
          "mv.co.bury",
          "lb_UnkAnimStruct",
          "Ground_801C5700",
          "grBattle_8021A610",
          "ftColl_80076640",
          "ftColl_80076764",
          "ftColl_80078384",
          "lbColl_80008D30",
          "pl_8003EC30",
          "FIGHTERVARS_SIZE",
          "MUST_MATCH",
          "WIP",
          "pragma force_active",
          "pragma peephole"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.