# sfx — Sound Effects (the Crowd)

Tiny module, and almost all of it is the **crowd**: the ambient audience that
cheers big hits, gasps near blastzones, and chants a player's name during
streaks.

| File | What it is |
|------|------------|
| `crowdsfx.c` | Crowd state machine: `gCrowdConfig` thresholds (cheer limits, gasp counts, knockback magnitude, blastzone proximity via `mp` boundaries) driving cheer/gasp/chant selection. |
| `sfx_unk.c` | Unidentified sound code. |

General SFX/BGM playback plumbing is `lb/lbaudio_ax.c` + sysdolphin; menu
sound test is `mn/mnsoundtest.c`.
