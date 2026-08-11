# Item And Fighter Path Fact Slice

Use this slice when a target is under `src/melee/it/**` or `src/melee/ft/**`.
It is a worker aid, not authority. Current source, headers, assembly, objdiff,
and regression output outrank every note here.

## it Items

Common patterns:

- Item functions usually take `Item_GObj* gobj` when the object is an item and
  the body immediately reads item user data.
- Prefer `Item* ip = GET_ITEM(gobj)` over a raw `gobj->user_data` temporary.
- The item-specific state lives in `ip->xDD4_itemVar.<arm>`. The arm must match
  the actual item, not the decompiler's default guess.
- Item special attributes come from
  `ip->xC4_article_data->x4_specialAttributes` and need the item-specific
  attribute type when source/header evidence supports it.
- Item state tables and callbacks often prove return types. Collision, damage,
  animation, and physics callbacks are not interchangeable; check `item.h`,
  `types.h`, and the target item's header.

Key structures and locations:

- `src/melee/it/item.h`: main item accessor and item helper surface.
- `src/melee/it/types.h`: `Item`, `Article`, and the `Item_ItemVars` union.
- `src/melee/it/itCharItems.h`: character-specific item vars/attribute types.
- `src/melee/it/itCommonItems.h`: common item vars/attribute types.
- `src/melee/it/items/*.h`: per-item prototypes and callback declarations.

Useful source examples:

```c
Item* ip = GET_ITEM(gobj);
ip->xDD4_itemVar.linkarrow.x18 = ip->pos;
itLinkArrowAttributes* attrs = ip->xC4_article_data->x4_specialAttributes;
```

Repeated known traps:

- `ItemVars` guesses are often wrong. Past item work repeatedly fixed generated
  code that used another item's union arm.
- Attribute structs should not be invented from one offset alone. Use sibling
  item source, header definitions, data layout, or objdiff evidence.
- Header prototypes frequently need cleanup from `UNK_RET`/`UNK_PARAMS` once a
  body proves `Item_GObj*`, `Fighter_GObj*`, `bool`, or `void`.
- Item work can affect fighter and ground code because owner, spawn, pickup,
  and stage item interactions cross those headers.

Corpus anchors:

- Large item-system split and type cleanup:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:559`.
- Dr. Mario pill item variables and attributes:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:8499`.
- Core item-system typing and tables:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:11019`.

## ft Fighters

Common patterns:

- Fighter-owned callbacks usually take `Fighter_GObj* gobj` and recover
  `Fighter* fp = GET_FIGHTER(gobj)`.
- Common action files are now split heavily under
  `src/melee/ft/chara/ftCommon/`. Prefer the action-specific header before
  adding source-local declarations.
- Character folders own per-character attributes and copied-move logic. Kirby
  copied specials often touch both fighter vars and item headers.
- Motion-variable fields, action-state variables, and `x222*` flags should be
  typed through `ft/types.h` or the target character's type header when
  evidence exists.

Key structures and locations:

- `src/melee/ft/forward.h`: `Fighter_GObj` and callback typedef surface.
- `src/melee/ft/types.h`: `Fighter`, common data, bitfields, and motion vars.
- `src/melee/ft/chara/ftCommon/*.h`: action-specific common fighter headers.
- `src/melee/ft/chara/<character>/types.h`: character attributes and variables.

Useful source examples:

```c
Fighter* fp = GET_FIGHTER(gobj);
fp->x294_itPickup = *fp->ft_data->x40;
```

Repeated known traps:

- Do not keep `M2C_FIELD` or raw flag masks when a typed bitfield already
  exists in `Fighter`.
- Do not use an unrelated motion-var arm to satisfy generated code. Check the
  action-state file and surrounding callbacks.
- Some split PRs intentionally moved symbols out of old monolithic files.
  Check `config/GALE01/splits.txt` and current headers before assuming old
  ownership.
- Fighter changes often require item, ground, player, and library callsite
  checks because those systems exchange `Fighter_GObj*`, item ownership, or
  collision state.

Corpus anchors:

- Common fighter action split:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:9269`.
- Fighter bitfield cleanup:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:8339`.
- Common movement/motion vars:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:9419`.
- Fighter collision typing:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:9999`.

