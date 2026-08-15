# ftDrMario — Dr. Mario (`ftDr_`)

Mario's clone in a lab coat: slightly stronger and slower, worse recovery,
famous back-air. Only `ftDr_Init.c` and `ftDr_AppealS.c` (his taunt —
tossing a pill) are split so far; his specials reuse/parallel
[Mario's](ftMario.md):

- Megavitamins (neutral B) — bouncing pill, `it/items/itdrmariopill.c`
- Super Sheet (side B) — like Cape but flips vertically, no aerial stall
- Super Jump Punch (up B) — single strong hit vs Mario's multi-hit
- Dr. Tornado (down B) — Mario Tornado, better damage
