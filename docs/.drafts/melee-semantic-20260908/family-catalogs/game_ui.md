# Game and UI Family Naming and File Patterns

Draft catalog at `c302741689bd67c361cd7faadb221df3193992c3`. Canonical symbols remain identities; inferred names remain hypotheses. No source, database or scheduler changes.

## Coverage and Review State

Inventory: 207 tasks. Matching accepted review/current proposal pairs: 168. Review states: `{'accepted_for_staged_apply': 168, 'missing': 39}`. Scheduler states are recorded separately in [game_ui.json](game_ui.json).

All existing inventory functionality, review, proposal and unresolved artifacts hashed; family followups indexed. Eight functionality/review sets read closely and selected canonical ranges inspected with git show at the pinned revision. Existing render receipts indexed without invoking a renderer. Renderer observations below come from existing reviewed artifacts; no fresh renderer coverage or full canonical rereview of 207 TUs is claimed. Functionality excerpts are attributed draft summaries. Keyword clusters overlap and are discovery aids.

The family includes lb, cm, pl, mp, ef, gm, db, mn, if, ty, vi and sfx units. This is a campaign grouping, not a claim that collision, statistics or audio code is UI code. Every task has source paths, artifact hashes, a draft functionality excerpt and original family followups in the JSON.

## Canonical Conventions and Functionality

### Mode tables and scene helpers have separate responsibilities

gmvsmode.c binds CSS, SSS, ordinary match, Sudden Death and Results callbacks and payloads. gmvsmelee.c implements shared preparation. Ordinary and Sudden Death reuse the start buffer but have different exit records. EnterVs invokes its whole-match callback before copying players, then invokes per-player callbacks after all copies. File prefixes locate related code; the actual table establishes ownership and sharing.

Classification: `canonical_convention`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmode.c#L28-L85) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmvsmelee.c#L171-L205).

### ifAll coordinates separately owned HUD components

ifAll initialization creates the common camera/light and calls component initializers. Component visibility dispatchers are separate operations. The two consecutive un_802FF1B4 and un_802FF498 calls identify different initializers; un_802FF498 clears numeric-text state and constructs a SisLib context. A shared ifCoGet_Init alias must not collapse these symbols.

Classification: `canonical_convention`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L37-L57) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L205-L240) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/if_2FF2.c#L143-L184).

### Render-pass masks and GX-link masks are different domains

HSD_GObj_80390ED0 iterates bits of its mask as callback pass indices and bits of gobj->gxlink_prios as GX-link lists. It dispatches render callbacks. SetTextureCamera is a misleading foreign inferred name. vi_8031CA04 uses pass mask 7 with link masks 9, 8 and 8; 7 is not a GX-link index.

Classification: `canonical_behavior`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L158-L183) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/vi/vi.c#L35-L46).

### Free and exit names do not establish complete resource retirement

ifAll teardown calls un_802FE390 twice and requests camera/light destruction without clearing stored pointers. HSD_GObjPLink_80390228 defers destruction under a specific current-process guard; otherwise it removes userdata, object and processes. Developer-menu teardown frees buffers, panels and nodes but does not explicitly retire its root traversal pointer or controller process. Scene-wide ownership remains a separate question.

Classification: `canonical_behavior`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L243-L270) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L127) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib_1.c#L484-L514) · [4](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib_1.c#L593-L609) · [5](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textlib_1.c#L638-L673).

### SisLib constructor aliases must preserve distinct interfaces

The Event row renderer invokes HSD_SisLib_803A6754 with two arguments and HSD_SisLib_803A5ACC with position and extent arguments. Existing reviews report both mapped to HSD_SisLib_CreateText and suppressed as name collisions. Preserve canonical identities while the baselib owners choose distinct names; this caller proves distinct usage, not full constructor contracts.

Classification: `canonical_convention`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnevent.c#L264-L299).

### Numeric file and symbol suffixes do not prove gameplay state meanings

vi.c supplies shared animation-table lookup, guarded rumble forwarding, render dispatch and Start-triggered departure calls. vi_8031C9B4 forwards its two request arguments only when the selected port is not sentinel 4. A sibling call with arguments 1,0 cannot be described as entering video state 1 from the numeric spelling alone.

Classification: `canonical_convention`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/vi/vi.c#L22-L58).

### Player-stat reset is a bounded write set

plAttack_8003759C resets selected arrays, counters and four flags, but does not assign the declared x5B8[4]. Replace whole-record-zero claims with the explicit write set. Source member offsets and comments do not prove compiled layout.

Classification: `canonical_behavior`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plattack.c#L13-L63) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/types.h#L86-L96).

### Parallel attack-instance names describe separate counters

plAttack and plStale have separate u16 storage and analogous initialization/allocation code. Allocation returns the old value, increments, and replaces a resulting zero with one. A zero pre-state still returns zero; reset/wrap reuse identifiers. The plAttack_InitAttackInstance and plAttack_IncrementAttackInstance hypotheses fit this source algorithm without proving global uniqueness or shared storage.

Classification: `supported_inferred_name`. Evidence: [1](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plattack.c#L6-L11) · [2](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plattack.c#L65-L73) · [3](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/plstale.c#L11-L37).

## Concrete Owner Corrections

1. Review HSD_GObj_SetTextureCamera for a dispatcher-oriented alias. Correct vi links 41b575db-0044-4409-8ef5-2b0a62e60567 and 0a2aa4e2-e710-4611-9b33-10d16af71eac to say pass mask 7, not GX link 7. Owners: `main/sysdolphin/baselib/gobj`, `main/melee/vi/vi`, `main/melee/if/ifnametag`, `main/melee/ty/tylist`.

2. Assign distinct owner-reviewed names for the two CreateText hypotheses and the two ifCoGet_Init hypotheses. Keep canonical symbols until that review. Owners: `main/sysdolphin/baselib/sislib`, `main/sysdolphin/baselib/hsd_3A64`, `main/melee/if/ifcoget`, `main/melee/if/if_2FF2`.

3. Propagate the x5B8[4] omission and independent counter storage. Do not promise complete zeroing, lifetime-unique IDs or a player-facing Hit Percentage formula. Owners: `main/melee/pl/plattack`, `main/melee/pl/pltrick`, `main/melee/pl/plbonus`.

4. Document scene teardown and scheduler context for retained globals, separate input/display objects and developer-menu root retirement before claiming complete cleanup or a proven use-after-free. Owners: `main/melee/if/ifall`, `main/melee/if/textlib_1`, `main/melee/mn/mnmain`, `main/sysdolphin/baselib/gobjplink`.

5. Replace video-state-1 descriptions of vi_8031C9B4(1,0) with guarded rumble-request forwarding; retain numeric argument roles pending owner evidence. Owners: `main/melee/vi/vi`, `main/melee/vi/vi0401`.

## Remaining Evidence Boundaries

Existing reviews also flag split implementation ownership in gmregclear headers, Results camera return ABI, campaign storage layouts, random-stage eligibility, and trophy staging versus saved registration versus availability. Those remain indexed owner followups, not new settled conclusions. Compiled sections, padding, address identity and ABI return behavior need revision-matched compiled evidence.

Stale synthesized/pending sentences in functionality documents do not override later matching review receipts. A review receipt does not by itself prove scheduler acceptance, live promotion or final rendering. Existing renderer parse errors, shadowed bindings and name collisions remain tooling or owner issues. No fresh rendering was run.
