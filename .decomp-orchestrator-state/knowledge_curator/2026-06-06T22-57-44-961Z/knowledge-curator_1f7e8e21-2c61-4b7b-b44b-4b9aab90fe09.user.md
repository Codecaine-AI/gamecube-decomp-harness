<run>
Inspect this curator context and return the required JSON object.
Focus on whether the deterministic records are safe to promote, and which source-specific updates should remain proposals.
</run>

<curator_context>
{
  "enrichment_path": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl",
  "deterministic_record_count": 9019,
  "batch_index": 8,
  "batch_count": 16,
  "sampled_records": [
    {
      "schema_version": "knowledge_curator_enrichment_v1",
      "id": "pr_lesson:1005:a7987b52b8a164d4",
      "kind": "pr_lesson",
      "status": "accepted",
      "trust_tier": "historical",
      "confidence": 0.88,
      "title": "Curated PR 1005 lesson",
      "text": "Partially match `ftdevice` Started the C decompilation of `ftdevice` by adding `src/melee/ft/ftdevice.c`, moving several small `ftCo_800C06xx` routines out of `asm/melee/ft/ftdevice.s`, and leaving harder routines as inline `ASM`/`NOT_IMPLEMENTED` fallbacks. The PR also introduced temporary `ftDeviceUnk1`/`ftDeviceUnk2` struct types to replace raw Fighter offset fields, exposed literal/data labels needed by the new C file, and wired the new C object into `obj_files.mk`. The included match report shows a partial file match: 540 bytes, score 7315/13100, 44.16%, with small helpers fully matched and larger registration/assert routines still weak or asm-backed. Decomp lessons: Partial file decomp can be productive when the old asm file is split: remove matched `.text` while leaving unmatched code or data in assembly until each section is ready.; When repeated raw Fighter offset blocks appear, create temporary unknown structs with exact size/offset comments; this reduces prototype noise and gives later PRs a safer place to refine field names.; Accessor functions are good early targets because they reveal struct grouping and pointer types with low matching risk.; If a function reads a GObj then immediately calls a Fighter helper, type it as `Fighter_GObj*` and route through `GET_FIGHTER` rather than duplicating the raw `lwz 0x2c` pattern.; Literal strings used by `OSReport`/`__assert` may need globally named data labels before inline asm or C can reference them cleanly.; It is acceptable to expose only the globals that the new C needs, while leaving other nearby globals as `UNK_T` until their semantics are known.; Use offset-preserving temporary names like `x408`, `x488`, `x28`, and `x7B` when behavior is not yet understood; do not invent semantic names prematurely. Matching tactics: Used `ASM UNK_RET ...` / `ASM void ...` declarations with inline PowerPC assembly under `#else` for `MUST_MATCH`.; Wrapped fallback bodies in `#if !defined(MUST_MATCH) || defined(WIP)` so non-matching builds can compile without exact codegen.; Used `NOT_IMPLEMENTED` for routines whose C bodies were not yet reliable, while preserving exact `nofralloc` assembly bodies for matching configurations.; Applied `/* clang-format off */` around inline assembly and `#pragma peephole on` after asm blocks.; Used `#ifdef WIP #pragma force_active on #endif` in the new source file.; Used `M2C_FIELD(ft_80459A68, u32*, 0x24)` in the approximate C for `ftCo_800C07F8` to express a hard offset access into a typed global array.; Replaced local branch labels from `.L_800C0730` style in the asm file with `lbl_800C0730` style labels inside inline assembly.; Retained data/BSS in `ftdevice.s` while compiling C text, a common incremental migration tactic for decomp files with unmigrated globals. Naming: Unidentified structs introduced as `ftDeviceUnk1` and `ftDeviceUnk2`, following subsystem prefix plus `Unk` numbering.; Fighter fields retained offset-style names such as `x408`, `x488`, `x530`, and struct members such as `x28` and `x7B`.; Functions kept address-based `ftCo_800Cxxxx` names, e.g. `ftCo_800C0658`, `ftCo_800C06C0`, and `ftCo_800C07F8`.; Former local string labels `.L_803C6B18`, `.L_803C6B40`, `.L_803C6B4C`, and `.L_803C6B78` became subsystem-prefixed globals `ftDevice_803C6B18`, `ftDevice_803C6B40`, `ftDevice_803C6B4C`, and `ftDevice_803C6B78`.; The assert expression string in sdata used the existing function-family prefix as `ftCo_804D3C18`.; Global data names remained address-based, including `ft_80459A68`, `ft_804D6570`, `ft_804D6574`, and `ft_804D6578`. Terms: pr-1005; ftdevice; Partially match ftdevice; ribbanya; ftCo_800C0658; ftCo_800C0674; ftCo_800C0694; ftCo_800C06B4; ftCo_800C06C0; ftCo_800C06E8; ftCo_800C0764; ftCo_800C07F8; ftDeviceUnk1; ftDeviceUnk2; ft_80459A68; ft_804D6570; ft_804D6574; ft_804D6578; ftDevice_803C6B18; ftDevice_803C6B40; ftDevice_803C6B4C; ftDevice_803C6B78; ftCo_804D3C18; GET_FIGHTER; Fighter_GObj; IntVec3; M2C_FIELD; OSReport; __asse...",
      "evidence_ref": "/Users/Ford/Github Repos/oss/melee/decomp-orchestrator/knowledge/sources/past_prs/data/prs/pr-1005/postmortem.json",
      "created_at": "2023-11-14T20:36:43Z",
      "payload": {
        "pr": 1005,
        "title": "Partially match `ftdevice`",
        "url": "https://github.com/doldecomp/melee/pull/1005",
        "agent_status": "agent_completed",
        "source_path": null,
        "key_file_role": null,
        "summary": "Started the C decompilation of `ftdevice` by adding `src/melee/ft/ftdevice.c`, moving several small `ftCo_800C06xx` routines out of `asm/melee/ft/ftdevice.s`, and leaving harder routines as inline `ASM`/`NOT_IMPLEMENTED` fallbacks. The PR also introduced temporary `ftDeviceUnk1`/`ftDeviceUnk2` struct types to replace raw Fighter offset fields, exposed literal/data labels needed by the new C file, and wired the new C object into `obj_files.mk`. The included match report shows a partial file match: 540 bytes, score 7315/13100, 44.16%, with small helpers fully matched and larger registration/assert routines still weak or asm-backed.",
        "decomp_lessons": [
          "Partial file decomp can be productive when the old asm file is split: remove matched `.text` while leaving unmatched code or data in assembly until each section is ready.",
          "When repeated raw Fighter offset blocks appear, create temporary unknown structs with exact size/offset comments; this reduces prototype noise and gives later PRs a safer place to refine field names.",
          "Accessor functions are good early targets because they reveal struct grouping and pointer types with low matching risk.",
          "If a function reads a GObj then immediately calls a Fighter helper, type it as `Fighter_GObj*` and route through `GET_FIGHTER` rather than duplicating the raw `lwz 0x2c` pattern.",
          "Literal strings used by `OSReport`/`__assert` may need globally named data labels before inline asm or C can reference them cleanly.",
          "It is acceptable to expose only the globals that the new C needs, while leaving other nearby globals as `UNK_T` until their semantics are known.",
          "Use offset-preserving temporary names like `x408`, `x488`, `x28`, and `x7B` when behavior is not yet understood; do not invent semantic names prematurely."
        ],
        "assembly_or_matching_tactics": [
          "Used `ASM UNK_RET ...` / `ASM void ...` declarations with inline PowerPC assembly under `#else` for `MUST_MATCH`.",
          "Wrapped fallback bodies in `#if !defined(MUST_MATCH) || defined(WIP)` so non-matching builds can compile without exact codegen.",
          "Used `NOT_IMPLEMENTED` for routines whose C bodies were not yet reliable, while preserving exact `nofralloc` assembly bodies for matching configurations.",
          "Applied `/* clang-format off */` around inline assembly and `#pragma peephole on` after asm blocks.",
          "Used `#ifdef WIP #pragma force_active on #endif` in the new source file.",
          "Used `M2C_FIELD(ft_80459A68, u32*, 0x24)` in the approximate C for `ftCo_800C07F8` to express a hard offset access into a typed global array.",
          "Replaced local branch labels from `.L_800C0730` style in the asm file with `lbl_800C0730` style labels inside inline assembly.",
          "Retained data/BSS in `ftdevice.s` while compiling C text, a common incremental migration tactic for decomp files with unmigrated globals."
        ],
        "naming_conventions": [
          "Unidentified structs introduced as `ftDeviceUnk1` and `ftDeviceUnk2`, following subsystem prefix plus `Unk` numbering.",
          "Fighter fields retained offset-style names such as `x408`, `x488`, `x530`, and struct members such as `x28` and `x7B`.",
          "Functions kept address-based `ftCo_800Cxxxx` names, e.g. `ftCo_800C0658`, `ftCo_800C06C0`, and `ftCo_800C07F8`.",
          "Former local string labels `.L_803C6B18`, `.L_803C6B40`, `.L_803C6B4C`, and `.L_803C6B78` became subsystem-prefixed globals `ftDevice_803C6B18`, `ftDevice_803C6B40`, `ftDevice_803C6B4C`, and `ftDevice_803C6B78`.",
          "The assert expression string in sdata used the existing function-family prefix as `ftCo_804D3C18`.",
          "Global data names remained address-based, including `ft_80459A68`, `ft_804D6570`, `ft_804D6574`, and `ft_804D6578`."
        ],
        "review_feedback": [],
        "searchable_terms": [
          "pr-1005",
          "ftdevice",
          "Partially match ftdevice",
          "ribbanya",
          "ftCo_800C0658",
          "ftCo_800C0674",
          "ftCo_800C0694",
          "ftCo_800C06B4",
          "ftCo_800C06C0",
          "ftCo_800C06E8",
          "ftCo_800C0764",
          "ftCo_800C07F8",
          "ftDeviceUnk1",
          "ftDeviceUnk2",
          "ft_80459A68",
          "ft_804D6570",
          "ft_804D6574",
          "ft_804D6578",
          "ftDevice_803C6B18",
          "ftDevice_803C6B40",
          "ftDevice_803C6B4C",
          "ftDevice_803C6B78",
          "ftCo_804D3C18",
          "GET_FIGHTER",
          "Fighter_GObj",
          "IntVec3",
          "M2C_FIELD",
          "OSReport",
          "__assert",
          "NOT_IMPLEMENTED",
          "MUST_MATCH",
          "WIP",
          "nofralloc",
          "pragma peephole",
          "obj_files.mk",
          "src/melee/ft/ftdevice.c",
          "asm/melee/ft/ftdevice.s"
        ]
      }
    }
  ]
}
</curator_context>

Return exactly one JSON object.