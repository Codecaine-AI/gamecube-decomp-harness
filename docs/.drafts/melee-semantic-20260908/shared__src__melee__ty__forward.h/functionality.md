## src/melee/ty/forward.h

This guarded header defines `TY_TROPHY_COUNT` as 293 and supplies incomplete structure declarations for the ty subsystem. The count is a preprocessor constant, not evidence of runtime indexing or allocation behavior ([lines 1–6](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ty/forward.h#L1-L6)).

`un_804D6EE0_t` is declared only as a structure tag; the remaining declarations introduce typedef names for corresponding structure tags, including Toy, TrophyData, TyDsp, TyFigupon, TyLight, and TyList names. These declarations do not establish fields, sizes, ownership, lifetimes, or runtime state meanings. Similar names such as `tyDispData` and `TyDisplayData` remain distinct declarations; no equivalence or rename is justified by this header ([lines 6–66](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ty/forward.h#L6-L66)).

All 69 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors and agrees with the canonical declarations. There are no function implementations or compiled-layout evidence here. The frozen subject and link enumerations are empty, so there are no baseline names, explanations, facts, or links to retain or correct. No knowledge changes are proposed.

Status: researched; no-change lead bypass; independent review and live promotion pending.
