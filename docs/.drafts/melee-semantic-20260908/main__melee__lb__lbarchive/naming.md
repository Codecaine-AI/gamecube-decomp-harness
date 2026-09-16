# Naming Decisions

Canonical symbols stay authoritative. Two inherited hypotheses remain supported and three additional hypotheses are proposed for independent review. No source rename is made.

| Canonical | Existing Alias | Proposed Alias | Disposition |
|---|---|---|---|
| `lbArchiveRelocate` | None | None | retain canonical name; no alias needed |
| `lbArchive_80016DBC` | None | `lbArchive_LoadSymbolsNonfatal` | new hypothesis pending review |
| `lbArchive_80016EFC` | `lbArchive_FreeArchive` | `lbArchive_FreeArchive` | retain inherited hypothesis |
| `lbArchive_80016F80` | None | `lbArchive_LoadArchiveOrPreloaded` | new hypothesis pending review |
| `lbArchive_80017040` | `lbArchive_LoadSymbolsOrPreloadedFatal` | `lbArchive_LoadSymbolsOrPreloadedFatal` | retain inherited hypothesis |
| `lbArchive_800171CC` | None | `lbArchive_LoadSymbolsOrPreloadedNonfatal` | new hypothesis pending review |
| `lbArchive_InitializeDAT` | None | None | retain canonical name; no alias needed |
| `lbArchive_LoadArchive` | None | None | retain canonical name; no alias needed |
| `lbArchive_LoadSections` | None | None | retain canonical name; no alias needed |
| `lbArchive_LoadSymbols` | None | None | retain canonical name; no alias needed |

`FreeArchive` remains conditional on the release preconditions, not a promise that arbitrary cached descriptors may be freed. `LoadSymbolsOrPreloadedFatal` remains accurate because both acquisition branches converge on the fatal helper. The three new names distinguish direct/nonfatal, preload-aware acquisition, and preload-aware/nonfatal binding. None uses Try or Success, which would obscure the Boolean provenance contract.

Pinned canonical src/include and frozen current target/inferred-name inventory contained no collision for the three new aliases. Existing aliases were already rendered for this TU. Function evidence is in `naming.json`, `proposal.json`, and the entry-point table. Parent review must approve all promoted naming changes before application.
