# Animated Background Flashes

Draft review at `c302741689bd67c361cd7faadb221df3193992c3`. The unit plays color animation data from `LbBf.dat` through the background-flash subsystem. Both owned files have complete canonical and rendered coverage, 139 C lines and 22 header lines.

## Creation and State

`lbBgFlash_80021A18` initializes an allocator for 0x84-byte records with alignment four, creates a GObj, then allocates its user data. It installs `fn_800219E4` as the user-data destructor, stores the manager pointer, sets RGB scale to one, narrows the input integer to the alpha coefficient byte, loads `lbBgFlashColAnimData`, initializes the lower flash subsystem with argument six, resets the overlay and installs the update procedure. Failed user-data allocation destroys the newly created GObj. Failed allocation paths do not publish the manager pointer.

Evidence: [allocation and setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0219.c#L25-L69).

The globals hold the object allocator, manager pointer, loaded animation-table pointer and RGB scale. `BgFlashGlobal` is a partial local view with a pointer at offset 0x2C. The code stores a GObj through this cast. It does not prove a separate runtime object type. User data consists of the coefficient byte, padding, and `ColorOverlay` at offset four. Shared `ColorOverlay` and HSD layouts remain outside this TU's ownership.

## Updates and Output

`fn_80021B04` saves whether color was enabled, advances the overlay, and examines the new enable flag. An enabled color multiplies RGB by the global float scale; alpha uses integer multiplication by the stored byte divided by 255. RGB scaling has no clamp in this code. It submits the result through `lbBgFlash_InitState`. A transition from enabled to disabled invokes `fn_800208B0(0)`; a previously disabled overlay produces no submission.

Evidence: [per-update output](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0219.c#L81-L105).

`fn_80021C80` calls `lb_80014258` with an empty callback and resets the overlay while that call returns true. The empty callback ignores its three arguments. `fn_80021C1C` resets the retained manager overlay, while `lbBgFlash_80021C48` forwards two unsigned arguments and the loaded table to `lb_800144C8`. Naming those arguments as animation ID or timing requires review of the external interpreter; local code only proves their forwarding.

Evidence: [reset, start and interpreter loop](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0219.c#L110-L137).

## Ownership and Uncertainty

All eight functions, ten parameter entities, four data targets and the file entity are included. The `.bss` allocator and `.sbss` globals have direct declarations and uses. `.data` and `.sdata2` have no complete source-to-section mapping here. Asset strings and numeric literals do not independently establish their emitted section layout, so those targets remain unresolved rather than receiving invented object names.

The lower overlay's priority, disabling behavior, the ColorOverlay command format and repeated initialization/destruction lifecycle require their family owners. This review does not claim that global pointers are cleared on teardown or that starting an animation is safe before successful initialization.

Canonical and rendered snapshots are retained in the campaign `units/main__melee__lb__lb_0219/pages/` directory. `functions.findings.json` and `lead.findings.json` retain source hashes, reads, current facts and dispositions. `proposal.json` is for independent review and staged application only.

## Live application status

Root confirmed live promotion. Evidence: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0219/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_0219/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/319fb4fd953aae6c3a33f7957d34d0cf64b36253066a9097272610e79650a5c5/2026-09-08T14-38-02.919Z-e29ec222-7cbe-46e8-9712-6b687deaae1d.receipt.json). Unresolved inherited claims remain unresolved; promotion does not validate them. Proposal and review hashes are preserved.
