# ftKirby — Kirby (`ftKb_`, legacy lowercase filenames)

The pink puffball: featherweight, six jumps, very floaty, tiny crouch. In
Melee he's famously weak competitively (bottom tier — slow air speed, poor
range) but his code is some of the most interesting in `ft` because of
**copy abilities**: swallowing a victim grants Kirby *their* neutral special,
which is why this folder has a file per copied character.

## Own moves

| File | Move | Behavior |
|------|------|----------|
| `ftkirbyspecialn.c` | Swallow (neutral B) | Command-grab inhale; spit victim out as a star, or swallow to copy their neutral B (lost on taunt or big hits). |
| `ftkirbyspecialhi.c` | Final Cutter (up B) | Leaps up blade-first, flips at the apex, plunges straight down, and fires a shockwave along the ground on landing (the wave is `it/items/itkirbycutterbeam.c`). Main recovery. |
| — side B: Hammer | (not yet split into this folder) | Big single-hit hammer swing; aerial version somersaults with multi-hits. Hammer prop: `it/items/itkirbyhammer.c`. |
| — down B: Stone | (not yet split) | Transforms into a heavy object, plunges, invulnerable while stone but can be grabbed. |
| `ftkirbyattackdash.c` | Dash attack | The tumbling "Break Spin" dash attack, unique enough to get its own file. |

## Copy abilities (one file per swallowed character's neutral B)

`ftkirbyspecialfox.c` (Blaster), `...link.c` (Bow), `...samus.c` (Charge
Shot), `...ness.c` (PK Flash), `...pikachu.c` (Thunder Jolt), `...purin.c`
(Rollout), `...mewtwo.c` (Shadow Ball), `...peach.c` (Toad), `...koopa.c`
(Fire Breath), `...donkey.c` (Giant Punch), `...mars.c` (Shield Breaker),
`...zelda.c` (Nayru's Love), `...seak.c` (Needle Storm), `...gamewatch.c`
(Chef — pan prop is `it/items/itkirbygamewatchchefpan.c`), `...iceclimber.c`
(Ice Shot), `...yoshi.c` (Egg Lay — with `ftkirbycaptureyoshi.c` /
`ftkirbyyoshiegg.c` for the victim-in-egg states). Clone characters reuse
their parent's copy module (Falco→fox, Dr. Mario→? etc.); missing ones
(Mario/Luigi fireballs, Falcon Punch…) aren't split yet `(?)`.

Victim-side states for *being* swallowed are in ftCommon
(`ftCo_CaptureKirby.c`, `ftCo_ThrownKirby.c`).
