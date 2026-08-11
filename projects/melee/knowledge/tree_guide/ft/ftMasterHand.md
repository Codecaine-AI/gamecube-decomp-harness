# ftMasterHand — Master Hand (`ftMh_`)

The right-hand final boss of Classic mode. Implemented as a fighter with an
HP bar and a bespoke move table — every attack is its own file, named for
the gesture: `Slap`, `Poke`, `Drill`, `Sweep`, `Squeeze` (grab), `Slam`,
`RockCrush`, `FingerBeam`, `FingerGun`, `BackAirplane1-3` (the fly-away
jet dives), `Walk`, `Wait1_*`, plus `Tag*` states for the co-op gestures
with [Crazy Hand](ftCrazyHand.md) (`TagApplaud`, `TagRockPaper`, `TagCrush`).
`Capture*`/`Thrown*` cover grabbing fighters. Shared hand-boss plumbing:
`ft/ftbosslib.c`; projectiles `itmasterhandbullet.c` / `itmasterhandlaser.c`.

Also playable via the famous debug-mode "Master Hand glitch".
