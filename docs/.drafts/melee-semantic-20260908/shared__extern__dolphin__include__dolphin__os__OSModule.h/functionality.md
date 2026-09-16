## OSModule.h semantic review

Read all 116 canonical and rendered lines and exhausted both subject and link listings. The frozen baseline contains no subjects, facts, or links; there are no existing knowledge records to retain or correct. No proposals are warranted.

This header defines the module-format records and declares the Dolphin OS module interface. `OSModuleID` is `u32`; queue and link records hold module pointers, while `OSModuleInfo` describes identification, list membership, section/name metadata, and version. `OSModuleHeader` explicitly requires `info` as its first member and adds BSS, relocation/import, and entry-point metadata. `bssSection` is documented as set at runtime. [Canonical definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSModule.h#L10-L56)

`OS_MODULE_VERSION` is defined as 1. Alignment members are guarded by version >= 2; `fixSize` and `OSLinkFixed` by version >= 3. Those guarded declarations are therefore inactive under the header's current definition. This is a source-preprocessor observation, not a compiled-layout claim. [Version guards](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSModule.h#L58-L68) [API guard](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSModule.h#L98-L103)

`OSGetSectionInfo` directly casts `sectionInfoOffset` to a section-info pointer; it does not add the module base, despite the field's offset terminology. Section offsets reserve bit 0 for executable status, and `OS_SECTIONINFO_OFFSET` clears that bit. Import records identify an external module and an offset to relocation instructions. Relocation records contain a relative byte offset, type, section, and addend. The Dolphin-specific relocation constants are 201–204; comments explicitly describe offset advancement for NOP and section selection for SECTION, but do not explain MRKREF behavior. [Tables and relocation declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSModule.h#L70-L96)

The API declares string-table setup, linking with a supplied BSS pointer, unlinking, module lookup with section/offset pointer parameters, and debugger link/unlink notifications. The header does not establish error paths, ownership, relocation-time offset conversion, or cross-file resource lifetimes. [API declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSModule.h#L98-L109)

The rendered view contains zero name substitutions and agrees with the canonical declarations. Its reported single parse error remains an explicit renderer limitation rather than evidence of a source semantic defect.

Status: synthesized; independent review and live promotion pending.
