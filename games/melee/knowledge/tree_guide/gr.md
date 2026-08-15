# gr — Ground / Stages

Stage **behavior**: one file per stage holding its setup, gimmicks, hazards,
and animation (wind on Whispy, the Great Fox flying through Corneria, acid on
Brinstar). Stage *collision geometry* is `mp/`; generic loading infra is at
the bottom of this page. Internal stage names are mostly Japanese.

## Shared infra

`ground.c` / `stage.c` (core `Ground` GObj + `StageData`/`StageCallbacks`
tables), `grlib.c`, `granime.c` (stage animation), `grdatfiles.c` (which
`Gr*.dat` archive each stage loads), `grdisplay.c`, `grmaterial.c`,
`grdynamicattr.c`, `grzakogenerator.c` (spawns the wireframe waves in
Multi-Man Melee).

## VS stages

| File | Stage |
|------|-------|
| `grcastle.c` | Princess Peach's Castle (Banzai Bill, switches) |
| `grrcruise.c` | Rainbow Cruise (scrolling tour loop) |
| `grkongo.c` | Kongo Jungle (barrel cannon, log) |
| `grgarden.c` | Jungle Japes (JP name "Jungle Garden"; Klaptraps, river) |
| `grgreatbay.c` | Great Bay (Tingle's balloon, turtle) |
| `grshrine.c` | Hyrule Temple ("shrine") |
| `grzebes.c` | Brinstar (rising acid, destructible tissue) |
| `grkraid.c` | Brinstar Depths (Kraid rotates the stage) |
| `gryorster.c` | Yoshi's Island ("Yoster Island"; Shy Guys, slopes) |
| `grstory.c` | Yoshi's Story (Randall the cloud, Shy Guy food flights) |
| `grizumi.c` | Fountain of Dreams ("izumi" = fountain; moving side platforms) |
| `grgreens.c` | Green Greens (Whispy's wind, star-block walls, bomb blocks) |
| `grcorneria.c` | Corneria (Great Fox, Arwing strafing runs) |
| `grvenom.c` | Venom (Great Fox underside) |
| `grpstadium.c` | Pokémon Stadium (fire/water/rock/grass transformations) |
| `grpura.c` | Poké Floats ("pura"; parade of balloon Pokémon) |
| `grmutecity.c` | Mute City (track sections, racer traffic) |
| `grbigblue.c` | Big Blue (ride the racers or fall) |
| `gronett.c` | Onett (drugstore awnings, cars) |
| `grfourside.c` | Fourside (rooftops, UFO) |
| `gricemt.c` | Icicle Mountain (vertical scrolling) |
| `grkinokoroute.c` | Mushroom Kingdom "route" `(?)` — see also `grinishie*` below |
| `grinishie1.c`, `grinishie2.c` | Mushroom Kingdom I & II ("inishie" = ancient kingdom, its JP name) |
| `grflatzone.c` | Flat Zone (Game & Watch frame, falling tools) |
| `groldpupupu.c` | Dream Land N64 ("Pupupu Land" = Dream Land's JP name) |
| `groldyoshi.c` | Yoshi's Island N64 |
| `groldkongo.c` | Kongo Jungle N64 |
| `grbattle.c` | Battlefield |
| `grlast.c` | Final Destination ("last") |

## 1-P / bonus stages

| File | What it is |
|------|------------|
| `grt<char>.c` (26 files) | Break the Targets — one Target Test stage per character (`grtcaptain`, `grtkirby`, …). Targets themselves are an item (`it/items/itmato.c`). |
| `grhomerun.c` | Home-Run Contest platform. |
| `grheal.c` | All-Star Rest Area ("heal"). |
| `grpushon.c` | Race to the Finish (Classic bonus; archive `GrNPo`). |
| `grfigure1/2/3.c`, `grfigureget.c` | Snag the Trophies bonus game ("figure" = trophy) — the three boards plus trophy-collect logic. |
| `grbigblueroute.c`, `grzebesroute.c`, `grshrineroute.c`, `grkinokoroute.c` | Adventure-mode side-scrolling variants / route data: F-Zero Grand Prix, Brinstar Escape Shaft, Underground Maze, Mushroom Kingdom field `(?)`. |
| `grfzerocar.c` | The F-Zero racers that scream across Mute City/Big Blue/Grand Prix. |
| `grtest.c` | Developer TEST stage. |
