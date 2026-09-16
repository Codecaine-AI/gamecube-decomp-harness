## Crowd manager startup

`un_80321900` creates an HSD GObj with arguments `(0x16, 0x17, 0)`, registers `fn_803219AC` at process priority `0x13`, publishes `&un_804A2F08` through `un_804D7050`, and initializes that shared state. Registration precedes state initialization. The function does not return the object, check creation failure, guard against repeated startup, or clean up an existing manager.

`un_80321950` unconditionally initializes all twelve declared fields through its pointer argument. It clears `x0`, `x8`, `xC`, `x1C`, `x20`, and `x24`; sets `x4 = 0x10000`; copies `cheer_limit` into `x10` and `max_gasp_count` into `x18`; sets `x14 = 0x83D60`; and writes `-1` to `x2C` and then `x28`. Both the argument and `gCrowdConfig` must be valid. This is field initialization, not audio-handle teardown.

The backing object and pointer are defined in `crowdsfx.c`. Its recurring callback reads the shared pointer, increments `x4` only below `0x10000`, and runs sound sequencing and fighter scanning. The initialized count limits represent completed sequencing states. Fighter scanning filters eligible fighters and triggers a reaction when their count below the configured lower-blast-zone threshold crosses the configured count limit, rather than continuously reacting to every nearby fighter. Later qualifying hit processing resets `x4`, stores an event participant in `x0`, and overwrites `x8` with knockback magnitude. Both `x28` and `x2C` are subsequently used as audio handles.

The rendered names `CrowdSFXManager_Init` and `CrowdSFXManager_InitData` accurately distinguish subsystem startup from state-only initialization. Their exact suffixes remain hypotheses; the canonical header documents support for the naming family, not those exact original names. Rendering covers function names only and has no reported parsing issues.

Source establishes the floating zero assignment but does not establish the contents, size, or load association of the compiled `.sdata2` target.

Status: synthesized; independent review and live promotion pending.
