# TSeak stage controller

The source registers `Gr_Kind_TSeak`, `/GrTSk.dat`, three populated ground-object callback records and a trailing zero record. The header exports `grTSk_StageData`; it does not establish compiled section layout. Existing historical documentation identifying this as Sheik's unused Target Test is preserved, but source alone does not prove its visible geometry or target count.

## Initialization and lifetime

`grTSeak_OnInit` delegates to `Ground_InitTargetStage`. That inline helper clears `stage_info.unk8C.b4`, sets `b5`, requests objects 0, 1 and 2 in order, then calls four common Ground setup routines. The factory uses the same integer for callback-table selection and `Ground_GetStageGObj`. It has no local bounds check. A null object produces an OSReport diagnostic and is returned without callback setup; initialization does not test these returned values.

`Ground_SetupStageCallbacks` clears two Ground callback fields, registers rendering, conditionally stores callback3, invokes initialization and schedules the process callback. It does not consume callback1 or the table flags. Thus table membership does not prove a runtime dispatch path for the three false-returning callback1 functions. [Factory](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtseak.c#L94-L108), [inline setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L33-L62).

The start hook calls `grZakoGenerator_801CAE04(NULL)` and ignores its result. This creates a shared Zako/generated-item manager, not demonstrably the course's targets. Success schedules a process and publishes descriptor/data pointers globally. GObj creation failure reports, frees the newly allocated data and returns NULL; the wrapper has no retry or recovery. The manager therefore outlives the wrapper through shared subsystem state and scheduled processing. [Manager](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grzakogenerator.c#L303-L329).

## Object callbacks

- Object 0 initializes animation set 0 using its Ground map ID. Its process and callback3 are empty.
- Objects 1 and 2 initialize through `Ground_JObjInline1`, which performs joint setup before animation setup.
- Object 1's process calls `Ground_801C2FE0`.
- Object 2's process calls `lb_800115F4` and then `Ground_801C2FE0`. Only its table record sets the two high flag bits; this file does not establish their effect.
- All three callback1 bodies ignore their argument and return false. All callback3 bodies are empty.

Animation setup uses the existing child when present, conditionally applies the archived joint resource, removes prior animations, selects optional channel arrays at index 0, requests frame zero and evaluates the hierarchy once. Archive flag data conditionally enables a fixed animation-object flag; it is not an arbitrary copied flag mask. The helper's `bool` parameter is also compared against zero and used as an index, so its broader numeric domain should not be normalized from this zero-valued call. [Animation helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/granime.c#L988-L1048).

## Stage hooks and rendered review

Demo initialization and loading are empty. The parameterless stage predicate returns false, touch-line lookup returns NULL, and the shadow check returns true regardless of its inputs. These are local callback results, not proof that every downstream rendering or collision operation succeeds.

The rendered positional names fit the canonical callback records and are retained without cosmetic renaming. Its external helper names remain hypotheses rather than evidence for wind or collision semantics. The renderer reports no parse errors, but leaves the factory and touch-line function unchanged because of shadowed bindings. Fields and parameters are outside its substitution coverage. No parameter facts are manufactured for the 18 empty parameter subjects.

Status: researched; no-change lead bypass; independent review and live promotion pending.
