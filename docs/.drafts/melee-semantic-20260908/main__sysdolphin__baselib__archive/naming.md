# Naming Review

Retain HSD_ArchiveParse, HSD_ArchiveGetPublicAddress, HSD_ArchiveGetExtern and HSD_ArchiveLocateExtern. No inherited inferred-name facts and no proposed names. Locate remains the private helper name. All five owned struct names and HSD_ARCHIVE_DONT_FREE remain canonical.

| Parameter Subject | Canonical Meaning | Disposition |
|---|---|---|
| HSD_ArchiveGetExtern#r3 | archive: parsed descriptor | No existing fact; reviewed |
| HSD_ArchiveGetExtern#r4 | offset: signed external-table index, not byte offset | No existing fact; reviewed |
| HSD_ArchiveGetPublicAddress#r3 | archive: descriptor with mapped public table and data | No existing fact; reviewed |
| HSD_ArchiveGetPublicAddress#r4 | symbols: exact public name to find | No existing fact; reviewed |
| HSD_ArchiveLocateExtern#r3 | archive: descriptor whose data slots may be patched | No existing fact; reviewed |
| HSD_ArchiveLocateExtern#r4 | symbols: exact external name to bind | No existing fact; reviewed |
| HSD_ArchiveLocateExtern#r5 | addr: runtime address written to slots | No existing fact; reviewed |
| HSD_ArchiveParse#r3 | archive: output descriptor; NULL returns -1 | No existing fact; reviewed |
| HSD_ArchiveParse#r4 | src: mutable image backing descriptor pointers | No existing fact; reviewed |
| HSD_ArchiveParse#r5 | file_size: supplied byte count compared with serialized total | No existing fact; reviewed |
