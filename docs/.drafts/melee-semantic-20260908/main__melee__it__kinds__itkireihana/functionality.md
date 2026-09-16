# Bellossom / Kireihana semantic review

The canonical Pokémon registry explicitly assigns Bellossom this unit's five-entry state table, spawn callback and event adapter. Both owned files were read completely in canonical and rendered form, together with all 54 subjects and 40 links. Rendered views have no parse errors and substitute function names only. Existing role-based and numeric entry names remain useful hypotheses; no cosmetic renaming is proposed.

## Startup and cross-file initialization

Spawn sets neutral facing, clears item-command variable 0, loads the lifetime before initial air entry, invokes common setup and the spawn sound, then loads effect/audio timers and clears fall speed and motion history. The air-entry inline selects numeric state 0, installs effect hitlag callbacks and evaluates descriptor 0 at frame 0. The descriptor helper subsequently removes model animation and clears the script: the initial animation-update flag does not imply continued playback.

State-0 animation and physics delegate shared appearance processing. Physics discards its helper's boolean completion result. Shared parent-spawn setup supplies appearance motion and timer fields after successful object creation; these fields are not initialized solely by Bellossom's local spawn callback. Initial landing processing invokes the state-1 entry and then restores normal scale.

## Active states and numeric-state ambiguity

State 1 copies x8 to x70 before sampling dynamic bone 1. Only when the hierarchy activity query returns false does it predecrement lifetime: a nonpositive result enters state 3; a positive result restarts state 1 and resets velocity and fall speed.

State-1 physics triggers effect 0x470 only when the predecremented effect timer equals zero. The audio counter advances only on those effect events; at exactly zero it randomly selects 0x2726 or 0x2727 and reloads. The cues do not alternate deterministically. The effect helper receives bone 2 and divisor 2.6f, producing item scale divided by 2.6f.

State-1 collision enters state 2 only when the shared floor query is false, saved x70 is strictly negative and current x8 is strictly positive. Zero does not satisfy either side of the crossing.

State 2 samples bone 1 and gates lifetime handling on the same animation query, but tests the old lifetime via postdecrement. An old nonpositive value enters state 4; an old positive value explicitly selects numeric state 1 through the inline. This is not a hold or restart of state 2, and it does not require landing. That inline does not perform the velocity/fall-speed resets of the other state-1 entry paths. Numeric state 1 therefore must not be equated unconditionally with physical grounding.

## Motion, landing and ending

States 2 and 4 apply shared root-motion velocity, add configured gravity to persistent fall speed, impose an upper cap and overwrite vertical velocity with the accumulator's negative. Positive configured gravity is assumed by the usual descent description; there is no lower clamp. State-2 entry and both state-4 entries leave the fall accumulator intact. Only state 2 retains recurring effect emission; its physics does not advance the audio timer.

The shared root-motion sampler tolerates a null bone, scales translation, zeros components below a small threshold, computes deltas against persistent history and clears the bone translation. The velocity consumer uses delta.z times facing horizontally and delta.y vertically. Falling callbacks replace that vertical result.

States 3 and 4 return true when the hierarchy query finds no active animation; common item dispatch consumes that result as a destruction request. State 3 saves the previous motion sample and can enter state 4 under the same strict floor/sign conjunction used by state 1.

States 2 and 4 delegate landing to it_8026E248 with preserving state-1 and state-3 entries respectively. Those entries sample bone 1 and reset fall speed. Shared landing processing includes collision resolution, landing-count/destruction checks, velocity acceptance and entered_air handling. Suppression of the supplied callback does not guarantee that the previous item or state survives.

## Dispositions

All 151 baseline facts are explicitly accounted for: 138 retained, seven superseded and six unresolved. All 40 exact link IDs are retained once, including distinct historical records with equivalent relationships. The ancestor's duplicated link groups were not imported.

Corrections address the omitted numeric transition, exact HSD_GObj signature, random audio selection, effect-scale divisor and exceptional landing branches. Source supports five table entries and literal semantics, but not compiled section extents or constant-pool allocation. Bellossom/Sweet Scent labels remain established gameplay context at their existing inference level; delivered code does not establish fighter wakeup caused by Bellossom's disappearance.

Status: synthesized; independent review and live promotion pending.
