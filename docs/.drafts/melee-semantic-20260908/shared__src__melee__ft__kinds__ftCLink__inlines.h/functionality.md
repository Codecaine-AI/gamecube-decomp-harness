### ftCLink/inlines.h
The header defines the static inline helper `checkFighter2244`. It returns immediately for a null `gobj`, otherwise reads `gobj->user_data` as a `Fighter*`. If both the fighter and `fp->u.lk.x18` are non-null, it passes that field to `it_802C8C34` and then clears the field to `NULL` (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/inlines.h#L13-L25). The called function's effects and any broader object lifetime are not established by this header alone. The final null test contains only an unused equality comparison, not an assignment; it adds no cleanup behavior (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCLink/inlines.h#L27-L29).

The rendered view matches canonical behavior and contains no name substitutions or parse errors. `checkFighter2244` is opaque, but no writable baseline subject or identity exists here; no unsupported name or callee-lifetime claim is proposed. There are no baseline facts or links to retain or correct.

Status: researched; no-change lead bypass; independent review and live promotion pending.
