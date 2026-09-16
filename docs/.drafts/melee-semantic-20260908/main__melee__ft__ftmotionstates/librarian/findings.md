# Ftmotionstates librarian review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Source SHA `8785cfcb7091ce29268a8c2172aecd97a60bc6352c545a472aa77e4cbd66141a`. All4029canonical/rendered lines reviewed through EOF; all355rows have exact fields, bodies and bounded evidence in coverage.json. No function bodies or parameters owned.

## Two table domains

Normal construction sets boundary341 and installs ftData_MotionStateList. Demo construction resets boundary14, installs ftData_803C52A0 and different per-kind tables/resources. Generic motion entry compares against the current boundary, then copies metadata and five callbacks, includingNULL. The same numeric ID therefore has a different meaning in the demo domain. This table does not itself implement transitions or define successor states.

Main341rows contain animation ID, x4_flags, packed metadata and Anim/Input/Phys/Coll/Cam pointers. Source declarations are non-const. Source record definition is enum_t,enum_t,u32union plus five void(HSD_GObj*) pointers; no compiled section-size/order claim accepted. Four section semantic claims and exact11360-byte inferred_type remain unresolved at section identity level.

## Row families and exceptions

The complete ordered inventory includes every expression and callback, with per-family interpretation and exception notes. Main row33/34 reuse ordinary Fall Anim/Phys/Coll but FallAerial IASA; row32 uses full FallAerial suite. Attack12/13 reuse Attack11 Phys/Coll. Rapid-jab start/end input slotsNULL. Weapon families120..143 share four callbacks per weapon across different motion/move IDs. Gun/scope empty variants share ordinary handlers; their names alone do not mean no callback.

CaptureNeck/Foot231/232 and Mewtwo capture301/302 have camera only; ReboundStop237 has animation only. ThrownHi241 uses specialized camera while ThrownFHi273 reuses its four other callbacks but generic camera. Cliff252..259 use Cliff_Cam; cliff jumps260..263 use normal camera. Size-change314..321 have animation/collision/camera but NULLinput/physics. These are slot facts; global engine processing may still occur. Packed uses of ftCo_MF_Rebirth in landing/hammer rows are bitmask expressions, not transition destinations.

Demo14rows all carry Ft_MF_None and default move metadata. Only animation slots0/2/5 are nonNULL, pointing at800BED84/800BEF00/800BEFD0; canonical bodies at ft_0BEC.c48/97/117 are empty. All other slotsNULL. The renderer substitutes only800BEFD0 to DeadUpStarIce_Cam: that hypothesis does not establish a camera callback or camera effect. Record foreign-owner followup, no out-of-scope change.

## Review accounting

9facts:4supersede,5section-attribution unresolved;5draft TUoperations include new state_behavior.4exact links preserved:2TUrelationships retained against current selection/install code,2section links unresolved. All17render pages parse0/statusok; exactly1substitution. Original fact fields and link records preserved. No source/shared KB/Git/UI changes.

Dry-run valid:5operations,0rejected/skipped. Proposal SHA `dc077d629d4a7096af4e9e5fab792606b381bd869967fb17e046c394be24a783`.
