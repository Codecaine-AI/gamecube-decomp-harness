# Deprecated Knowledge Sources

This directory stores source slices that remain available for manual lookup,
reproducibility, or one-off profile overrides, but are not active knowledge
sources and are not part of the default worker tool surface.

- `discord_knowledge`: Discord-derived compiler and workflow notes.
- `ssbm_data_sheet`: Legacy workbook/CSV rows and generated data-sheet facts.
- `external_mirrors`: Mirrored external hints, including external symbol lookup.
- `legacy_index_roots`: Unregistered generated index leftovers from the old
  top-level source layout.

Entries stay in `../registry.json` with `active: false` so stable source IDs can
still resolve to their archived scripts when explicitly enabled.
