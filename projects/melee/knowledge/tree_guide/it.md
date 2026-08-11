# it — Items

Everything spawnable that isn't a fighter or the stage itself. Three big
families share one `Item` struct (`GET_ITEM(gobj)`, per-item state in
`ip->xDD4_itemVar.<arm>`): **carriable items**, **Poké Ball Pokémon** (JP
names), and **character articles** — projectiles and move props like Fox's
laser or Peach's turnip live *here*, not in the character's `ft` folder.

## Core (top level)

`item.c` (core item entity), `itspawn.c`, `itcoll.c` / `itgroundcoll.c`
(item↔fighter / item↔map collision), `ithitbox.c`, `itdraw.c`,
`itmaterial.c`, `iteffect.c`, `itdrop.c`, `itanimlist.c`, `itmaplib.c`,
`itzako.c` (wireframe-related item logic `(?)`). Types: `itCommonItems.h`,
`itCharItems.h`, plus a few move-specific headers (`itYoyo.h`, `itPKThunder.h`).

## items/ — carriable & stage items

| File | Item |
|------|------|
| `itbox`, `ittaru`, `itcapsule`, `itkusudama`, `itegg` | Crate, Barrel ("taru"), Capsule, Party Ball ("kusudama"), Egg |
| `itbat`, `itsword`, `itharisen`, `itstarrod`, `itlipstick`, `itparasol`, `ithammer`/`ithammerhead` | Home-Run Bat, Beam Sword, Fan ("harisen"), Star Rod, Lip's Stick, Parasol, Hammer (+ its detachable head) |
| `itlgun`(+`beam`,`ray`), `itsscope`(+`beam`), `itfire`* see Pokémon note | Ray Gun, Super Scope |
| `itbombhei`, `itmsbomb`, `itfreeze`, `itflipper` | Bob-omb ("Bombhei"), Motion-Sensor Bomb, Freezie, Flipper |
| `itgshell`/`itrshell` (+`itzgshell`/`itzrshell`) | Green/Red Shells (z-variants: 64-era versions `(?)`) |
| `itkinoko`, `itdkinoko` | Super Mushroom, Poison Mushroom ("doku kinoko") |
| `itmetalb`, `itrabbitc`, `itspycloak`, `itscball`, `itwstar`, `itstar` | Metal Box, Bunny Hood ("rabbit cap"), Cloaking Device, Screw Attack, Warp Star, Starman |
| `itfoods`, `ittomato`, `itheart` | Food, Maxim Tomato, Heart Container |
| `itdosei` | Mr. Saturn ("Dosei-san") |
| `itcoin` | Coins (Coin Battle / lottery) |
| `itmball` | Poké Ball ("Monster Ball") |
| `itfflower`/`itfflowerflame` | Fire Flower + its flame stream |
| `itmato` | Break the Targets targets ("mato" = target) |
| `ittools` | Flat Zone falling tools `(?)` |
| `itstarrodstar` | Star Rod's star projectile |

## items/ — Poké Ball Pokémon (JP → EN)

`itpippi` Clefairy, `ittosakinto` Goldeen, `ithitodeman` Staryu, `itlucky`
Chansey, `itmarumine` Electrode, `itmatadogas` Weezing, `itmetamon` Ditto,
`itkabigon` Snorlax, `itkamex` Blastoise, `itlizardon` Charizard,
`itfushigibana` Venusaur, `itkireihana` Bellossom, `itmaril` Marill,
`ithassam` Scizor, `ithinoarashi` Cyndaquil, `itchicorita` Chikorita,
`ittogepy` Togepi, `itsonans` Wobbuffet, `itporygon2` Porygon2, `itunknown`
Unown, `itfreezer` Articuno, `itthunder` Zapdos, `itfire` Moltres, `itraikou`
Raikou, `itentei` Entei, `itsuikun` Suicune, `itlugia` Lugia, `ithouou`
Ho-Oh, `itmew` Mew, `itcerebi` Celebi. (`itkyasarin`/`itkyasarinegg` =
"Catherine" = Birdo — appears to be an unused leftover `(?)`.)

## items/ — character articles (where each fighter's projectiles live)

- **Fox/Falco:** `itfoxblaster`, `itfoxlaser`, `itfoxillusion`
- **Link/Y.Link:** `itlinkbow`, `itlinkarrow`, `itlinkbomb`, `itlinkboomerang`, `itlinkhookshot`, `itclinkmilk` (Young Link's Lon Lon Milk taunt)
- **Samus:** `itsamuschargeshot`, `itsamusmissile`, `itsamusbomb`, `itsamusgrapple`
- **Ness:** `itnesspkfire`(+`pillar`), `itnesspkflash`(+`explode`), `itnesspkthunderball`(+`trail`), `itnessyoyo`, `itnessbat`
- **Sheik:** `itseakneedleheld`/`thrown`, `itseakchain`, `itseakvanish`
- **Peach:** `itpeachturnip`, `itpeachtoad`(+`spore`), `itpeachparasol`, `itpeachexplode` (Peach Bomber blast)
- **Mario family:** `itmariofireball`, `itmariocape`, `itluigifireball`, `itdrmariopill`
- **Pikachu/Pichu:** `itpikachuthunder`, `itpikachutjoltground`/`air`
- **Mewtwo:** `itmewtwoshadowball`, `itmewtwodisable`
- **Zelda:** `itzeldadinfire`(+`explode`)
- **Yoshi:** `ityoshiegglay`, `ityoshieggthrow`, `ityoshistar`, `ityoshitongue`
- **Ice Climbers:** `itclimbersice`, `itclimbersblizzard`, `itclimbersstring` (Belay rope)
- **Bowser:** `itkoopaflame`
- **Mr. G&W:** `itgamewatch*` — nearly his whole kit is items: `chef` (sausages), `judge`, `panic` (Oil Panic), `breath`/`fire`/`greenhouse`/`manhole`/`parachute`/`rescue`/`turtle` (his number-attack props)
- **Kirby copies:** `itkirbycutterbeam` (Final Cutter wave), `itkirbyhammer`, `itkirbygamewatchchefpan`, `itkirbyyoshispecialn`
- **Bosses:** `itmasterhandbullet`/`laser`, `itcrazyhandbomb`
- **Stage/adventure actors:** `itarwinglaser`, `itgreatfoxlaser`, `itfzerocar`→see gr, `itwhispyapple` (Whispy's apples), `itklap` (Klaptrap, Jungle Japes), `itheiho` (Shy Guy "Heihō", Yoshi stages), `itnokonoko`/`itpatapata` (Koopa Troopa/Paratroopa), `itoldkuri` (Goomba "Kuribō"), `itleadead` (ReDead), `itoctarock`(+`stone`) (Octorok), `itlikelike` (Like Like), `itottosea`→`itoldottosea` (Topi, the Ice Climber seal) `(?)`, `itwhitebea` (Polar Bear, JP "White Bear"), `ittarucann` (Barrel Cannon), `itevyoshiegg` (event-match Yoshi egg `(?)`)

Hex-named `it_XXXX.c` files at both levels are not-yet-identified item code.
