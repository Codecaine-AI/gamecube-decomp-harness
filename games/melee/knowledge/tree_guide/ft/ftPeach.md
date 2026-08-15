# ftPeach — Peach (`ftPe_`)

Floaty royalty with a unique **Float** mechanic: hold jump in the air to
hover at fixed height and throw float-cancelled aerials — the core of her
top-tier Melee game plan, and it gets its own files here.

| File | Move | Behavior |
|------|------|----------|
| `ftPe_SpecialN.c` | Toad | Counter — Toad appears and sprays spores when hit (`it/items/itpeachtoad.c`, `itpeachtoadspore.c`). |
| `ftPe_SpecialS.c` | Peach Bomber | Hip-check lunge with an explosion on contact (`it/items/itpeachexplode.c`). |
| `ftPe_SpecialHi.c` | Peach Parasol | Rising umbrella, then open-parasol slow-fall; recovery (`it/items/itpeachparasol.c`). |
| `ftPe_SpecialLw.c` | Vegetable | Plucks a turnip to throw — random faces change damage (stitch-face is feared); can rarely pull a Bob-omb, Mr. Saturn, or Beam Sword (`it/items/itpeachturnip.c`). |
| `ftPe_Float.c`, `ftPe_FloatAttack.c`, `ftPe_FloatFall.c` | Float | The hover states + float-aerials. |
| `ftPe_AttackS4.c` | Forward smash | Unique: randomly swings frying pan / golf club / tennis racket with different properties. |
| `ftPe_Init.c` | — | Spawn/load callbacks. |
