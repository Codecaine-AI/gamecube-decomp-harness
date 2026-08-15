# ft — Fighters

The character system: the `Fighter` struct riding on a GObj
(`GET_FIGHTER(gobj)`), the action-state machine, physics, hitboxes, items
held, and one folder per character under `chara/`. ~415 `.c` files — the
biggest module in the game.

## Where behavior lives

- **`ft/*.c` (top level)** — cross-character machinery: `fighter.c` (core
  entity), `ftaction.c`/`ftmotionstates.c` (action-state tables), `ftanim.c`,
  `ftcoll.c` (hitbox/hurtbox collision), `ftdynamics.c` (bone jiggle physics),
  `ftparts.c` (body parts/bones), `ftcamera.c`, `ftdata.c` (loading `Pl*.dat`
  character archives), `ftlib.c`, `ftcliffcommon.c` (ledge-hang),
  `ftwalljump.c`, `ftmetal.c` (metal transform), `ftbosslib.c` (hand bosses),
  `ftcmdscript.c` (subaction/moveset script interpreter),
  `ftcolanim.c` (flash/color overlays), `ftswing.c` + `ftlipstickswing.c` +
  `ftstarrodswing.c` (held-item swing attacks), `ftafterimage.c`,
  `ftcpuattack.c` (CPU move selection). Hex `ft_XXXX.c` = unidentified.
- **`chara/ftCommon/` (`ftCo_*`)** — see [ftCommon.md](ftCommon.md) — every
  action state shared by all characters, one file each: `Wait` (idle), `Walk`/`Dash`/`Run`, `Jump`/
  `KneeBend` (jumpsquat!), `Guard` (shield), `Escape` (roll/spotdodge),
  `Damage*`, `Down*` (knocked down), `Cliff*` (ledge actions), `Attack1`/
  `AttackS3` (tilts)/`AttackS4` (smashes)/`AttackAir`, `Throw`/`Thrown`,
  plus flavor states: `Furafura` (dizzy stun), `Ottotto` (teetering on an
  edge — the "whoa-oa!"), `Pass` (dropping through platforms), `FallSpecial`
  (helpless freefall), `ShieldBreak*`, `DamageSong` (asleep from Sing),
  `DamageIce` (frozen), `KinokoGiant/Small*` (mushroom grow/shrink),
  `WarpStar`, `Barrel*` (barrel cannon), `Cargo*` (being carried by DK),
  `Capture*` (in a command grab — Kirby's mouth, Koopa Klaw, Yoshi egg).
- **`chara/ft<Char>/`** — only what's *unique* to that character: `Init`
  (spawn/load callbacks) and the special moves (`SpecialN` = neutral B,
  `SpecialS` = side B, `SpecialHi` = up B, `SpecialLw` = down B), plus any
  bespoke mechanics (Peach's Float, Yoshi's egg shield, DK's heavy carry).
- **Projectiles are NOT here** — anything a character spawns (lasers,
  turnips, PK Fire) is an item in [`it/items/`](../it.md).

## Character folder → who it is

| Folder | Prefix | Character |
|--------|--------|-----------|
| ftMario | `ftMr` | [Mario](ftMario.md) |
| ftDrMario | `ftDr` | [Dr. Mario](ftDrMario.md) |
| ftLuigi | `ftLg` | [Luigi](ftLuigi.md) |
| ftPeach | `ftPe` | [Peach](ftPeach.md) |
| ftKoopa | `ftKp` | [Bowser ("Koopa")](ftKoopa.md) |
| ftYoshi | `ftYs` | [Yoshi](ftYoshi.md) |
| ftDonkey | `ftDk` | [Donkey Kong](ftDonkey.md) |
| ftCaptain | `ftCa` | [Captain Falcon](ftCaptain.md) |
| ftGanon | `ftGn` | [Ganondorf](ftGanon.md) |
| ftFox | `ftFx` | [Fox](ftFox.md) |
| ftFalco | `ftFc` | [Falco](ftFalco.md) |
| ftNess | `ftNs` | [Ness](ftNess.md) |
| ftPopo / ftNana | `ftPp`/`ftNn` | [Ice Climbers](ftPopo.md) ([Nana](ftNana.md) = AI partner) |
| ftKirby | `ftKb` | [Kirby](ftKirby.md) |
| ftSamus | `ftSs` | [Samus](ftSamus.md) |
| ftZelda | `ftZd` | [Zelda](ftZelda.md) |
| ftSeak | `ftSk` | [Sheik ("Seak")](ftSeak.md) |
| ftLink | `ftLk` | [Link](ftLink.md) |
| ftCLink | `ftCl` | [Young Link ("Child Link")](ftCLink.md) |
| ftPikachu | `ftPk` | [Pikachu](ftPikachu.md) |
| ftPichu | `ftPc` | [Pichu](ftPichu.md) |
| ftPurin | `ftPr` | [Jigglypuff ("Purin")](ftPurin.md) |
| ftMewtwo | `ftMt` | [Mewtwo](ftMewtwo.md) |
| ftGameWatch | `ftGw` | [Mr. Game & Watch](ftGameWatch.md) |
| ftMars | `ftMs` | [Marth ("Mars")](ftMars.md) |
| ftEmblem | `ftFe` | [Roy ("Fire Emblem")](ftEmblem.md) |
| ftMasterHand | `ftMh` | [Master Hand](ftMasterHand.md) (boss) |
| ftCrazyHand | `ftCh` | [Crazy Hand](ftCrazyHand.md) (boss) |
| ftGigaKoopa | `ftGk` | [Giga Bowser](ftGigaKoopa.md) (boss) |
| ftSandbag | `ftSb` | [Sandbag](ftSandbag.md) (Home-Run Contest) |
| ftZakoBoy / ftZakoGirl | `ftBo`/`ftGl` | [Male](ftZakoBoy.md)/[Female](ftZakoGirl.md) Wireframes ("zako" = small fry) |

## Reading a sparse folder

Many folders hold only `Init` (Falco, Ganon, Pichu, Roy, Young Link…). That
does **not** mean the character has no code — their specials are either not
yet split out of unnamed `ft_XXXX.c` ranges, or shared with the character
they were cloned from. Clone pairs: Dr. Mario↔Mario, Falco↔Fox,
Ganon↔Captain Falcon, Pichu↔Pikachu, Y.Link↔Link, Roy↔Marth.
