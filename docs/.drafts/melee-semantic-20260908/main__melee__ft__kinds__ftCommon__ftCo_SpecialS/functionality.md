# Side-special recognition and dispatch

HasInput receives Fighter*, tests pressed B and ABS(lstick[0].x)>=x218, and makes no writes. Equality qualifies; vertical input is not tested. The fighter input-update caller sets x688=0 on recognition and otherwise increments it toward 255.

CheckInput receives Fighter_GObj*, rejects a missing ftData_SpecialS callback or nonzero x688, and may update facing when stickX*facing < -x220. Equality does not trigger facing update. The facing helper assigns +1 for nonnegative stickX and -1 otherwise. Accepted control calls static doEnter and returns true; no recognizer or ground-state check runs locally.

## Entry and caller

doEnter changes gr_vel by subtracting gr_vel*(1-retention)*friction, then calls the selected fighter's SpecialS entry. It does not itself select a motion ID. Popo and Nana get friction multiplier 1; others delegate to the terrain multiplier. Exact attenuation depends on external attribute values. Wait IASA calls CheckInput first, supporting grounded-side-special context without inventing a local ground guard. True reports dispatch, not a guarantee of what every fighter callback does.

## Object discrepancy

Original split .sdata2: eight bytes, flags2 ALLOC, float zero@0 and one@4. Existing source object: 16 bytes, flags3 WRITE|ALLOC, zero@0, an eight-byte zero object@4, one@12. The frozen report attributes 8 bytes. Thus the old unity-plus-padding description is false, and source and split artifacts must remain distinguished. The additional source zero object's precise origin is not independently established. No build or report regeneration ran.

## Coverage and decisions

All 50 C and 10 H lines read canonical and rendered; 84 dependency lines read. Four targets, source entity and three empty parameter entities accounted. All 22 baseline facts have IDs and updated_at dispositions: 17 retain, five supersede. Six exact outgoing links retained individually. Public names are canonical; the descriptive SpecialS_Enter hypothesis for static doEnter is retained.

## Evidence

- ftCo_SpecialS_HasInput: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c#L14-L23, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1735-L1739
- ftCo_SpecialS_CheckInput: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c#L25-L39, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L621-L630, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1735-L1739
- doEnter: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c#L41-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1235-L1241, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1735-L1739
- .sdata2: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c#L15-L23, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c#L41-L49
- src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_SpecialS.c#L14-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Wait.c#L44-L49, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1735-L1739
