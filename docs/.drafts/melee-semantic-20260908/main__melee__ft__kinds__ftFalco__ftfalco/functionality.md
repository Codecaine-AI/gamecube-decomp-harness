## Falco initialization and lifecycle

This unit defines Falco's character-specific motion dispatch, resource descriptors, and nine lifecycle callbacks. The header exposes those callbacks and the shared data declarations. Canonical and rendered views were read completely; rendered substitutions were treated as hypotheses rather than evidence.

### Motion dispatch and resources

`ftFc_Init_MotionStateTable` contains 35 initializers annotated as motion states 341–375: six neutral-special, six side-special, seven up-special, ten down-special, and six directional AppealS records. They reuse Fox-family animation, IASA, physics, and collision callbacks; every entry uses `ftCamera_UpdateCameraBox`. Motion-state annotations must not be confused with submotion values: SpecialAirHi uses `ftFx_SM_SpecialHi`, and the grounded/aerial down-special turn records reuse their corresponding loop submotions. This table describes dispatch, not the complete behavior of the external callbacks. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFalco/ftfalco.c#L23-L409)

The source declares four costume records, fighter-data and animation archive names, four demo-motion names, and an uninitialized four-element costume list. These declarations do not establish compiled section ordering, record widths, or padding. [Resources](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFalco/ftfalco.c#L411-L439)

### Loading and object lifetimes

OnLoad obtains the Fighter and its existing article list, enables wall jumping, invokes `ftFx_Init_OnLoadForFalco`, then reads the installed attributes as `s32*`. It registers items[0] and items[1] using attribute indices 7 and 8, and items[3] using `It_Kind_Falco_Phantasm`; items[2] is not registered here. The Fox helper uses `PUSH_ATTRS(fp, ftFox_DatAttrs)`, and Fox's corresponding registrations identify the shot/gun fields. `it_8026B3F8` stores the supplied article pointer in a global table indexed by kind minus `It_Kind_Kuriboh`; it neither spawns an item nor copies the article. The callback supplies no local null/bounds checks or ownership teardown. LoadSpecialAttrs forwards its object unchanged to Fox's loader. [Falco](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFalco/ftfalco.c#L468-L489) · [Fox](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfox.c#L481-L506) · [Registry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L204-L208)

OnDeath unconditionally clears `x222C_blasterGObj` before calling `ftParts_80074A4C(gobj, 0, 0)`. Clearing this reference does not demonstrate destruction of the gun object. The parts helper writes model slot 0's `prev` selection and sets a dirty flag; applying pending selections is a separate operation. This independently supports the rendered helper hypothesis only at the pending-state level. [Death](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFalco/ftfalco.c#L441-L446) · [Parts](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L577)

### Held-item exceptional paths

Pickup/drop forward the incoming flag and two constant true options; invisible/visible forward one true option. Shared pickup skips heavy items. Otherwise hold kinds 1, 2, 3, and 4 select values 1, 0, 2, and 3 respectively; the default performs no selection call. The catch flag independently controls the subsequent presentation call within the non-heavy path. Invisible and visible also skip heavy items. Drop has no such heavy guard: it always requests selection -1, then conditionally invokes the hide helper when its incoming flag is true. Thus straight-line Falco wrappers must not be mistaken for unconditional downstream presentation updates. [Wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFalco/ftfalco.c#L448-L466) · [Shared branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L142-L193)

### Knockback presentation

Entry and exit first invoke their common hook with selector 1, then apply part animations to parts 3 and 4 at 0.0f, using selection 3 on entry and 2 on exit. These are presentation boundary hooks, not knockback-magnitude calculations; anatomical meanings and the prior selection are not established. The common inline hooks additionally call `ftAnim_800704F0` for selectors 1 and 0, using 3.0f on entry and 0.0f on exit. Consequently the baseline inference that the small-data footprint contains only zero plus padding is not justified by the visible literals. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFalco/ftfalco.c#L491-L503) · [Inline hooks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L195-L205)

### Review result

All 51 baseline facts and 22 links were enumerated. Forty-five facts and all links are explicitly retained in checkpoint groups; six section/address/layout-dependent facts remain unresolved. Historical duplicate links retain their individual identities. No compiled artifacts were supplied, and no source or knowledge-base writes were performed.

Status: synthesized; independent review and live promotion pending.
