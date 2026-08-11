# Menu, Game, Interface, Toy, And Video Path Fact Slice

Use this slice for `src/melee/gm/**`, `mn/**`, `if/**`, `ty/**`, and `vi/**`.
These systems share scene setup, text, camera, archive, and state-table
patterns. The notes are hints only; local evidence wins.

## gm Game Mode

Common patterns:

- Game-mode work often needs `MinorScene`, `MajorScene`, and callback-table
  evidence from `gm/forward.h`, `gm/types.h`, `gmscdata.c`, and module
  `*.static.h` files.
- Scene functions frequently follow OnLoad, OnEnter, OnFrame, and OnLeave
  callback roles even when symbols are still address-style.
- Result, tournament, stock, player, and StartMelee data are often arrays or
  typed records, not independent scalar offsets.

Useful checks:

- Inspect `gm_*.static.h` before adding BSS/static declarations.
- Check `config/GALE01/splits.txt` and symbols when gm files were split out of
  older monolithic units.
- Check mn/if/ty/vi headers when gm scene data references menu, UI, toy, or
  video callbacks.

Corpus anchors:

- Typed `StartMeleeData` and scene helper prototypes:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:8399`.
- `MatchPlayerData` array recovery:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:8539`.
- Scene descriptor typing:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:8919`.
- Scene data tables:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:9769`.

## mn Menus

Common patterns:

- Menus use `HSD_GObj` user data, `HSD_JObj` animation, `HSD_SisLib`/
  `HSD_Text`, cursor state, and archive public symbol names.
- Many menu files have `*.static.h` data that matters for `.data`/`.bss`
  layout. Search the static header before adding new statics.
- Menu implementations commonly prove header prototypes for `HSD_GObj*`,
  `HSD_Text*`, `Vec3*`, `bool`, `u8*`, or concrete enum values.

Useful source examples:

```c
HSD_Text* text = HSD_SisLib_803A5ACC(...);
HSD_SisLib_803A6368(text, page);
GObj_InitUserData(child_gobj, 0, HSD_Free, cursor_user_data);
```

Repeated traps:

- Archive strings such as MenMain, stage-select, gallery, and cursor asset names
  are split/data evidence. Do not flatten them into anonymous lookup calls.
- Parent/child GObj relationships and volatile-looking unlink patterns can be
  matching-sensitive.
- Menu helper signatures often affect gm and if callers.

## if Interface

Common patterns:

- Interface files cover HUD/status, prize, name tag, stock, timer, text, and
  scene-transition glue.
- `if/types.h` and the target `if*.h` header should own state structs and
  concrete prototypes.
- `HSD_GObjPLink`, `HSD_Text`, and `HSD_SisLib` appear frequently; use typed
  state instead of generic `void*`.

Repeated traps:

- Some near-matches use direct control-flow traversal rather than a nicer helper.
  Preserve the source shape that objdiff proves.
- Interface signatures often ripple into gm and mn scene setup.
- Do not leave `UNK_RET`/`UNK_PARAMS` after a body proves the callback type.

## ty Toy Trophy

Common patterns:

- Toy/trophy GObj user data should use `GET_TOY(gobj)` when the object really
  owns a `Toy`.
- `toy.h`, `types.h`, `tydisplay.c`, `tyfigupon.c`, and `tylist.c` expose
  trophy data, panel state, archive symbols, and animation state.
- Trophy display files use many archive public symbol strings such as
  `ToyDsp..._joint` and `ToyDsp..._matanim_joint`; those strings are data and
  setup evidence.

Repeated traps:

- Do not move pad helpers or controller accessors into a different source file
  without checking whether that shifts existing matches.
- Do not invent semantic trophy names unless archive strings, caller roles, or
  data evidence support them.

## vi Video Scenes

Common patterns:

- VI scene files repeatedly create `HSD_CObj`, add camera animations, call
  `lb_80013B14` on camera descriptors, and use `Camera_80028B9C`.
- `vi.h` has `vi_RunCamera`, an inline helper for the usual
  `HSD_CObjSetCurrent` / `HSD_CObjEraseScreen` / `HSD_CObjEndCurrent` pattern.
- Character file-name tables and scene camera descriptors are data ownership
  evidence when linking vi objects.

Useful source example:

```c
inline void vi_RunCamera(HSD_GObj* gobj, u8 erase_colors[4], u64 prio)
{
    if (HSD_CObjSetCurrent(GET_COBJ(gobj))) {
        HSD_CObjEraseScreen(GET_COBJ(gobj), 1, 0, 1);
        HSD_CObjEndCurrent();
    }
}
```

Repeated traps:

- Do not hand-expand every CObj callback if `vi_RunCamera` is the evidenced
  source form.
- VI prototypes often need gm/cm/lb caller checks.
- CObj animation descriptor setup is shared across many vi files; sibling files
  are strong analogs.

