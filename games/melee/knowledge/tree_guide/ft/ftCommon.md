# ftCommon — Shared Action States (`ftCo_`)

Every action state all characters share, one file per state (~120 files).
When you open an `ftCo_*.c` file, the name is the in-game situation:

## Movement & stance
`Wait` (idle) · `Walk`/`Turn` · `Dash`/`Run`/`RunBrake`/`TurnRun` ·
`KneeBend` (**jumpsquat** — the frames before a jump) · `Jump`/`JumpAerial`
(double jump) · `Fall`/`FallAerial`/`FallSpecial` (helpless) ·
`Landing`/`LandingAir` (L-cancel window lives around these) ·
`Squat`/`SquatWait`/`SquatRv` (crouch) · `Pass` (drop through platform) ·
`Ottotto` (teetering at an edge) · `MissFoot` (slipping off) `(?)`

## Defense & damage
`Guard` (shield) · `Escape`/`EscapeAir` (rolls, spotdodge, airdodge — the
wavedash source) · `Rebound` (clank) · `Damage*` (hit reactions), `DamageFall`
(tumble) · `DamageIce` (frozen), `DamageSong` (asleep), `DamageBind`,
`DamageScrew` · `Down*` (knocked down: bounce, getups, `DownAttack` getup
attack) · `Passive*` (**techs**: in place, wall, ceiling) ·
`ShieldBreak*` (shield-break launch + dizzy) · `Furafura` (dizzy wobble) ·
`FlyReflect` (wall bounce) · `StopWall`/`StopCeil` · `Bury*` (planted in the
ground — DK Headbutt)

## Offense
`Attack1` (jab) `Attack100` (rapid jab) · `AttackDash` · `AttackS3/Hi3/Lw3`
(tilts) · `AttackS4/Hi4/Lw4` (smashes) · `AttackAir` (all aerials) ·
`Throw`/`Thrown` · `AirCatch` (grabbing in air `(?)`) · `SpecialS`/
`SpecialAir` (generic special glue) · `AppealS` (taunt)

## Situational / mode
`Cliff*` (ledge: catch, hang, climb, attack, roll, jump) · `Cargo*` +
`Shouldered` + `Lift` (DK carrying you) · `Capture*` + `Thrown<Char>`
(victim side of command grabs: Kirby swallow, Koopa Klaw, Yoshi egg,
Mewtwo, Falcon Dive, Master/Crazy Hand squeeze) · `Barrel*` (inside a barrel
cannon) · `HammerFall/Jump/…` (holding the Hammer item) · `ItemParasol*`
(Parasol float) · `KinokoGiant*/KinokoSmall*` (Super/Poison Mushroom) ·
`WarpStar` (riding one) · `ItemThrow`/`ftpickupitem.c` · `DemoCallback0`
(intro/demo hooks) · hex `ftCo_XXXX.c` = unidentified.
