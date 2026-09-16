## Camera forward declarations

`src/melee/cm/forward.h` is an include-guarded declaration header, not an implementation. It defines `CameraType` values 0–8 for standard, pause, training menu, clear, fixed, free, boss intro, debug follow, and debug free modes. Mode-use descriptions are source comments rather than independently verified runtime behavior ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/forward.h#L1-L19)).

Bounds constants encode inside as zero and outside top/bottom/left/right as bits 0/1/2/3. Ten opaque struct typedefs provide camera-related type names without defining layouts or ownership ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/forward.h#L21-L36)).

`CmSnapStatus` enumerates Sleep=0 and unknown states 1–5. The header attributes Sleep's name to an assert in `cmSnap_800315C8`; it supplies no transition or lifetime logic, so the unknown names remain appropriate. `CmSubjectState` assigns Active=0, Inactive=1, Auto=2, with comments describing unconditional, absent, and bounds-dependent framing respectively. `CmQuakeKind` assigns None=0, Loop=1, Small=2, Medium=3, Large=4, and Count=5; these declarations alone do not establish shake amplitudes or durations ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/forward.h#L38-L64)).

All 67 canonical and rendered lines were reviewed. The rendered view has zero substitutions and zero parse errors; it supplies no independent naming evidence. Subject and link enumeration are both empty, with no baseline facts to retain or correct. No supported semantic correction or writable-subject knowledge addition is identified. No compiled layout, runtime exceptional-branch, or cross-file lifetime claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
