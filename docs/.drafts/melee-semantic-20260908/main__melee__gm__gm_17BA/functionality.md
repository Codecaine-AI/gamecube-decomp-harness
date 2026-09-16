## Result-player accessors

`gm_17BA.c` contains two scalar getters, two four-entry fallback-label tables, one shared inline label resolver and four fixed-target wrappers. The header declares all six exported functions consistently with their definitions.

### Scalar statistics

`fn_8017BACC(int)` reads `player_standings[arg0].x9C`; `fn_8017BB30(int)` reads `xA0`. Both obtain the shared result pointer through `fn_80174274()` and apply signed saturation to [-999999, 999999]. Neither validates the index or participation state. The captured fields are produced from `(u32) pl_80040CFC(i) / 60U` and `(u32) pl_80040D20(i) / 60U`; this conversion does not establish their narrower gameplay meaning. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_17BA.c#L25-L35; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/inlines.h#L7-L15; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_1601.c#L3017-L3025.

### Guarded target labels

`fn_8017BB94`, `fn_8017BC50`, `fn_8017BD0C` and `fn_8017BDC8` fix the target to slots 0, 1, 2 and 3 respectively. Their input selects the source standing. The shared resolver returns NULL for a self-pair, a target with `Gm_PKind_NA`, or a source-to-target `kills` value whose saturation to ±999999 equals -1. This is an exact sentinel test, not a positive-KO requirement: zero and other negative values pass. It does not check source participation, team opposition or source bounds.

For an applicable pair, the resolver obtains the result pointer again and reads the target's `x4`. Value `0x78` selects fallback text: saved-US language returns `Ｐ１`–`Ｐ４`, otherwise `１Ｐ`–`４Ｐ`. Other identifiers are passed directly to `GetPersistentNameData`, and `namedata` is returned without local validation or copying. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_17BA.c#L11-L88; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_17AD.c#L15-L27.

### Storage and lifetime

These accessors perform no local state mutation or allocation. `fn_80174274()` returns `lbl_8046DBE8.x94`, not a newly allocated snapshot. Persistent names are borrowed from save-data banks indexed by quotient and remainder with 19; fallback strings have static storage. Returning `const char*` neither freezes persistent save data nor establishes its lifetime across save-data replacement. Caller validity and result-context lifetime remain external preconditions. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmresult.c#L86-L89; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain_lib.c#L135-L140.

### Evidence boundaries

Canonical bodies support the rendered function-name hypotheses, but do not recover original names. Four fixed target wrappers do not establish a four-entry source-index domain; the inspected producer processes six KO targets. The source establishes two arrays of pointers to const characters, not const pointer arrays, and does not prove compiled `.data`/`.sdata` placement, section extent, adjacency or permissions. Those baseline section attributions remain unresolved rather than being silently retained.

Status: synthesized; independent review and live promotion pending.
