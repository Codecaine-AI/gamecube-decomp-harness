## Shared ground/stage type definitions

`src/melee/gr/types.h` declares stage camera and blast-zone records, stage-wide resources, callback tables and stage identifiers. `StageInfo` references collision, item, lighting, particle and parameter data; these declarations do not establish allocation ownership or resource lifetimes. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L22-L176)

Most of the header defines stage-specific ground-object state: hazards, platforms, vehicles, generators, camera/display objects, lighting and route data. `Ground` combines common callbacks, flags and color-overlay data with a union of these subtype views. Its documentation explicitly distinguishes callback-table entries: different entries may use different subtypes, while callbacks within one entry should agree. Consequently, a stage name alone is insufficient to choose a union interpretation. Legacy `carnull` spellings are explicitly preserved for assertion text. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L1799-L1960)

`StageParam` describes a row keyed by `StKind`; `GroundParam` contains a row pointer/count alongside other stage parameters and colors. Both contain explicitly declared `s16` arrays rather than padding. Archive records reference model/animation, camera, lighting, fog, spline and shadow data; route records conclude the header. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L1962-L2112)

## Semantic assessment

The baseline contains no subjects, facts or links, and the rendered view makes no name substitutions. No knowledge changes are proposed. Existing source uncertainties remain uncertainties: declarations and comments alone do not prove numeric state meanings, exceptional runtime paths, cross-file lifetimes or compiled layout. `ASSERT_SIZE` statements are source assertions, not evidence of a successful compiled build.

Status: synthesized; independent review and live promotion pending.
