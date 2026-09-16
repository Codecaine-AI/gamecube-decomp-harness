# Disjoint Librarian Research

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-000-retry180539
Reviewed canonical and rendered lines 1–480 only. This range contains declarations, a MUST_MATCH constant-order helper, a documented CPU item-priority array, and CPU input-command sequence helpers. The helpers supply neutral-stick settings, timed button presses/releases, termination commands, and an x1C-to-x18 state copy. ftCo_800A0148, ftCo_800A0384, and ftCo_800A05F4 condition their Y-button sequences on a top-boundary comparison and ftCo_800A1CA8; their other branches respectively select destination-directed, forward, or fighter-directed stick commands. ftCo_800A0798 uses shorter Y-button holds with fighter-directed horizontal input in one branch. ftCo_800A0508 sequences a Y tap, a delay, forward/up stick settings, and an R tap, then emits two Done commands. The visible beginning of ftCo_800A08F0 handles explicit squat motion states, a FTKIND_NANA branch, and level-dependent delays; its body continues beyond the assigned boundary.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-001-retry180539
Reviewed canonical and rendered lines 481–960 only. This range contains CPU input-command sequences, randomized updates, hurt-capsule extent calculation, CPU-state initialization, normalized controller accessors, and spatial/state predicates.

- `ftCo_800A0AF4` selects among an upward-stick sequence, R/A helper calls, and a Y release/press/release sequence using thresholds 0.6, 0.8, and 0.9. `ftCo_800A0C8C` passes literal 127 to the command helper.
- `ftCo_800A0CB0` updates `cpu.x56C` when `x7C % 600 == 0`, using a kind-dependent multiple of `1 - HSD_Randf()³`. `ftCo_800A0DA4` computes zero-inclusive horizontal and upper vertical extents from both endpoints of each hurt capsule, assigns facing-relative horizontal extents, and stores their mean.
- `ftCo_800A0F00` combines two external predicates with an `x7C % 240 > 120` condition. `ftCo_800A0FB0` initializes the output line ID to -1, performs a floor query, and rejects successful hits selected by `ftCo_800A1B38`.
- `ftCo_800A101C` initializes CPU configuration, positions, counters, command pointers, controller values, flags, and 30 history entries. The NANA branch uses a different configuration and copies position/facing from a helper-returned fighter. Its early `xF9_b2 = true` is subsequently overwritten with false. Initialization also computes `x558` from squared scaled jump velocity divided by twice gravity, with a near-zero-gravity fallback of 10, and assigns kind-dependent `x56C` defaults.
- Controller accessors normalize signed stick axes with positive divisor 127 and nonpositive divisor 128, clamp to [-1,1], divide triggers by 255 with an upper clamp, and return buttons directly.
- Remaining complete helpers calculate XY fighter distance, combine four stage predicates for line filtering, query a facing-selected wall between two fighters, and test explicit fighter fields. The final partial inline helper compares an island-query result and conditionally checks strict horizontal bounds.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-002-retry180539
### Assigned source: lines 961–1440
- CPU destination setters update `x54` and `x38` only when the relevant `x60` guard is zero. Stage-entry selection can preserve the previous destination in `x64`, replace it with an entry-selected coordinate pair, set `x60` to 300, and set `x38` to 5. Selection depends on grounded state, destination/island comparison, entry eligibility, angle thresholds, facing direction, and nonnegative entry fields.
- Auxiliary predicates check CPU player classification with an additional `xC != 5` restriction, update `xF8_b6` through a target-dependent threshold comparison, compare grounded fighters’ floor lookup results, and compare a destination-offset lookup against the current floor lookup.
- `ftCo_800A229C` produces stage-conditioned position/status results. Some branches copy the fighter position and return 2; others return 1 with a helper-provided or constructed position. Stage-specific tests use blast-zone margins and a vector supplied by `grLib_801C9E60`. The final camera test copies the position and returns -1 on zero; otherwise the function returns 0.
- `ftCo_800A2718` rejects null input, scans items passing two predicates for a matching floor lookup, then applies separate Story, Zebes, and Onett conditions. Zebes tests two stored heights against `ftCo_800A1F98`; Onett tests either height against 5 together with a ground-state query.
- Two grounded proximity predicates compare horizontal distance to a facing-selected endpoint or the nearer of two endpoints, using a strict `5 * arg1` threshold. The assigned range ends at the airborne early return of `ftCo_800A2A70`; its remaining behavior is not covered.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-003-retry180539
Reviewed canonical and rendered lines 1441–1920 only.

- The opening fragment calculates planar distance to one of two points returned through a floor-index lookup, returning -1 when that lookup fails. Facing predicates compare facing direction with CPU coordinate x54 or tracked fighter x44; the latter accepts a missing fighter or horizontal separation below 1.
- ftCo_800A2C80 implements a gated trajectory/surface-risk test. Grounded fighters use four stage-specific floor predicates. Airborne cases exclude flags, motion 0xF4, negligible movement, upward movement and an angle threshold; stage-height exceptions can return true. Otherwise a normalized 1000-unit movement projection checks floor and both walls, returning false for qualifying intersections inside blast-zone bounds inset by CPU half dimensions.
- State helpers classify DownBound versus DownWait, recognize specified common and character-specific grabbing motion ranges, and distinguish CliffCatch from CliffWait with return expressions 1 and 2.
- ftCo_800A3234 and ftCo_800A3498 are airborne/descent decision predicates involving CPU flags, wall contact, CPU coordinate height and character-specific exceptions. The former also tests a previous-to-current collision-bottom segment.
- ftCo_800A3554 tests proximity to CPU x54 under grounded and helper conditions. When x60 is set, arrival instead clears x60, restores x54.xy from x64.xy, invokes a stage-indexed helper, and returns false.
- ftCo_800A3710 validates a tracked item using an enable bit, grabbability, grounded status, absence of a held item, matching non-null floor-lookup objects, and a final pickup helper. A non-grabbable item clears the tracked pointer. The shard ends at the ftCo_IsAlly signature, without its body.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-004-retry180539
Reviewed canonical and rendered lines 1921–2400 only. The opening predicate rejects null fighters, accepts matching player IDs, and otherwise uses mode predicates and team equality. Two directional CPU destination searches traverse island records, filter candidate coordinates against fighter-size-inset blast bounds and a stage predicate, and probe nearby floors. The leftward search uses x14 and an x−5 offset; the rightward search uses x8 and an x+5 offset. With arg1 set, a vertical estimate plus x558 gates selection, and a successful selection returns 1. Without arg1, valid candidates closer than x5C trigger target-setting calls, but the functions still return 0. A separate search chooses candidates by squared planar distance and writes an offset position, always returning 0. ftCo_800A49B4 stores planar distance from the fighter to cpu.x54 in cpu.x5C. The range also contains square-root, floor-probe, and inset-bound helpers.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-005-retry180539
Reviewed canonical and rendered lines 2401–2880 only. This region implements filtered fighter selection and small item/motion predicates. `ftCo_800A4A40` selects the eligible non-self fighter minimizing `ftCo_800A1AB4`; it has no explicit ally exclusion. `ftCo_800A4BEC` either returns an eligible cached fighter or, when its cache flag is clear, selects a minimum-score candidate and stores the pointer, flag, and randomized x30 value. A stale flagged target produces NULL and clears the flag rather than selecting a replacement during that call. `ftCo_800A4E8C` minimizes explicit three-dimensional distance from a supplied point. `ftCo_800A50D4` requires the ally predicate to be true, contrary to its comments. `ftCo_800A5294` returns the first eligible matching player ID. `ftCo_800A53DC` minimizes the value returned by `gm_8016C6C0`, breaking ties with `ftCo_800A1AB4`; its optional first pass additionally excludes fighters satisfying `ftCo_800A2040`, then falls back if none qualify. `ftCo_800A589C` examines the first other fighter sharing the player ID, returning NULL immediately if that fighter's x221F_b3 is set. The remaining complete functions test explicit item-kind sets, a fighter motion-ID range plus four individual states, or whether an item attribute equals 3.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-006-retry180539
Reviewed canonical and rendered lines 2881–3360 only.

- The opening predicate tail recognizes two inclusive motion-ID ranges. `ftCo_800A5ACC` gates a boolean on `cpu.xF9_b6`, level, and `x7C % 120`: levels 0–1 fail, levels 2–8 use progressively lower strict thresholds, and level 9 succeeds.
- `ftCo_800A5CE0` scans other fighters, applies several eligibility filters and an ally exclusion, and keeps the candidate with the smallest `ftCo_800A1AB4` result.
- Item selection uses planar Euclidean distance. `ftCo_800A5F4C` supports a kind filter with `It_Kind_L_Gun_Ray` as wildcard, while `ftCo_800A61D8` adds an `ftCo_800A5908` predicate. Both require grabbability, additional eligibility, an allowed kind range, and a table-value threshold. Replacement requires both a nonlower table value and strictly shorter distance; this is order-dependent selection, not unconditional highest-priority selection.
- `ftCo_800A648C` finds the nearest eligible item in an explicitly enumerated kind subset and returns its pointer cast to `int`.
- `ftCo_800A6700` selects the farthest qualifying inset island endpoint from an input position, using squared planar distance, a successful vertical query, and blast-zone bounds reduced by CPU half extents. It writes the selected endpoint coordinates, not the query's floor position.
- `ftCo_800A6A98` probes island midpoints, excludes lines accepted by four stage-specific predicates, requires `LINE_FLAG_PLATFORM`, a floor height at least `cur_pos.y + cpu.x568`, and the same bounds test, then writes the nearest qualifying floor position with z zero. Both navigation searches return zero without writing a result when no candidate qualifies.
- The final fragment contains a floor-query wrapper and only declarations from `ftCo_800A6D2C`; its full behavior is not established here.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-007-retry180539
Reviewed canonical and rendered lines 3361–3840 only.

- The opening function tail searches other islands, applies island and floor-line rejection predicates, and selects the closest accepted midpoint floor position below `cur_pos.y - cpu.x558`, writing an XY result with Z zero.
- `ftCo_800A6FC4` normalizes the supplied direction in place and searches other islands for floor samples within approximately 45 degrees. It considers a midpoint followed conditionally by samples five units inward from each endpoint, minimizing squared XY distance after rejection checks. Endpoint samples can only improve an already initialized best distance; earlier `continue` branches skip later samples on that island. It returns whether a result was selected.
- `ftCo_800A75DC_CheckFloor` wraps a floor query and rejects successful hits when any of four stage-specific predicates succeeds.
- `ftCo_800A75DC` derives coordinate-setting calls from another fighter. Airborne targets are projected onto accepted floors, with endpoint-inset adjustments and a fallback helper when the floor query fails. Grounded targets supply their current coordinates, with additional inset targeting when approaching a higher, different island from outside its horizontal extent. Calls pass `cpu.x56C + target.cpu.x564` as the final argument.
- The visible prefix of `ftCo_800A7AAC` obtains another fighter through `ftCo_800A589C`, returns on null, and performs similar airborne floor projection and endpoint adjustments. Its grounded branch begins a short vertical floor query; the assigned range ends before that branch completes.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-008-retry180539
Reviewed canonical and rendered lines 3841–4320 only. This region contains CPU navigation adjustments and recovery-input sequences.

- The opening continuation adjusts a partner-related destination toward island endpoints when the fighters do not share a grounded island, excluding two numeric motion IDs. `ftCo_800A80E4` uses a nearby referenced fighter's position to query a point and pass it to `ftCo_800A1F3C`.
- `ftCo_800A8210` selects point-query helpers by stage kind. Airborne fighters immediately return true. Successful queries conditionally write CPU destination coordinates and a 5-unit parameter only when `x60 == 0`; therefore a true return does not guarantee a destination write. The RCruise and BigBlue branches first query toward the blast-zone center, then against a returned stage vector.
- `ftCo_800A866C` operates on a grounded referenced item and grounded fighter, probes beneath the item, rejects lines accepted by any of four stage predicates, and may redirect toward an island endpoint.
- `ftCo_800A8940` totals island widths, performs a random cumulative-width selection, samples a point, probes for floor, applies line and point rejection tests, and passes the result to `ftCo_800A1F3C`. Its two selection passes do not have identical eligibility predicates.
- `ftCo_800A8DE4` initializes state once under `xFA_b2`, sets `x5C` to 10000, and orders helper attempts according to facing direction.
- Input helpers express stick angles as integer-scaled sine/cosine components and construct an upward-stick B sequence. The source-commented Ness routine terminates immediately below CPU level 9; otherwise it emits four directional waits, mirroring the horizontal directions according to destination side. The visible beginning of the source-commented Pikachu/Pichu routine selects a diagonal-then-horizontal sequence when horizontal destination distance exceeds 60; its other branch continues beyond this shard.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-009-retry180539
Reviewed canonical and rendered lines 4321–4800 only. This range builds CPU recovery input sequences and selects destination-directed movement. `ftCo_800A96B8` dispatches by explicit fighter-kind cases: Zelda selects diagonal versus vertical input at a horizontal-distance threshold of 30; Samus and the default diagonal helper press B briefly and then increase destination-directed horizontal input; Fox/Falco and Luigi use distinct sequences with a 40-unit wait; Yoshi immediately finishes; Ness delegates only after a vertical-position test. `ftCo_800A9904` chooses an available jump or this special-input dispatcher when its predicate succeeds; otherwise it selects horizontal input using a trajectory estimate or a ceiling intersection test. `ftCo_800A9CB4` combines predicate-gated jumps, stage-specific R-input sequences, special-input dispatch, a flag-specific override, and estimated destination-height steering with a capped clamp parameter. Both trajectory calculations explicitly use square-root approximation macros, not time-squared gravity terms. The final partial function selects stick/clamp parameters by CPU level, with a Nana override.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-010
Reviewed canonical and rendered lines 4801–5280 only. This range implements CPU stick-command sequences and destination-oriented movement decisions. `ftCo_800AA42C` handles the two explicitly tested motion states, corrects facing relative to `cpu.x54.x`, and chooses neutral, clamped, or full horizontal input using distance and CPU flags. Its interpolation helper uses the horizontal deadzone, an 80-unit floor, and an upper clamp. `ftCo_800AA844`, `ftCo_800AABC8`, and `ftCo_800AACD0` select forward-input sequences or delegate to other routines based on platform flags, destination coordinates, geometry predicates, and stage checks. `ftCo_800AAF48` conditionally replaces destination XY with a collision-tested list-node position while saving the old XY. The opening portion of `ftCo_800AB224` handles flag-driven overrides, target-dependent checks, a level-scaled random gate, island-pointer comparisons, and destination-angle/ceiling branches that dispatch to these helpers. This is bounded-range coverage, not complete TU or complete `ftCo_800AB224` coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-011
Reviewed canonical and rendered lines 5281–5760 only.

- `ftCo_800ABA34` dispatches CPU behavior using mode, item possession, periodic counters, a Zelda/Sheik flag, RebirthWait, and ground/air status.
- `ftCo_800ABBA8` requires CPU level at least 5 and motion ID 0x26; otherwise it restores `x18` from `x1C`, clears horizontal input, releases R, and finishes. Its active path can update destination coordinates, estimate time to a floor at levels above 7, issue destination-directed horizontal input with R when that estimate is below 10, react to a nearby lower fighter, and select horizontal input using a vertical-position estimate.
- `ftCo_800AC30C` alternates horizontal stick polarity every third counter tick with a level-dependent random gate, restricted to an explicit numeric motion set. Its noinline wrapper forwards directly to it.
- `ftCo_800AC434` handles the explicitly named BarrelWait and Barrel motions: the former taps A within a returned scalar interval, while the latter uses a level-dependent period and 50% random gate.
- `ftCo_800AC5A0` generates level-periodic stick input perpendicular to normalized knockback velocity, optionally presses R, and waits one frame. The near-zero knockback path can pass uninitialized stick variables, as the source also documents.
- `ftCo_800AC7D4` and `ftCo_800ACB44` branch on helper-returned state categories, CPU mode, another fighter, numeric proximity thresholds, and level-weighted randomness to select neutral input, directional input, or A/R retaps.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-012
Reviewed canonical and rendered lines 5761–6240 only.

- `ftCo_800ACD5C` selects CPU command sequences with early exits for flags, a non-training countdown, missing held items, helper predicates, and low CPU level. Character-specific branches invoke charging helpers for Donkey Kong, Samus, Mewtwo, and corresponding Kirby copies. Full Mewtwo charge invokes an R-tap helper; the native branch additionally emits `CpuCmd_Done`, unlike the Kirby branch.
- `ftCo_800AD42C` either restores the previous behavior, finishes with neutral input while airborne, or emits a grounded Y-release/press/release sequence with explicit waits. `ftCo_800AD54C` selects clamped forward-stick commands or turnaround/helper actions through airborne, predicate, random, and floor-query branches.
- `ftCo_800AD7FC` handles held-item behavior: absent items restore the previous behavior; otherwise target-relative vertical/horizontal offsets, helper predicates, item kind, and `xC` select numeric scripts. Completed selection generally restores `x18` from `x1C`; the special branch that only turns around does not.
- `ftCo_800ADC28` skips CPU state `0xA`; otherwise specified character charge-loop motion states invoke R-tap helpers, with waiting used for every listed case except native Donkey Kong.
- The reviewed prefix of `ftCo_800ADE48` validates `x54` using floor queries and inset blast-zone limits, replaces invalid coordinates with a downward floor hit or current position, and computes planar distance into `x5C`. It maintains a countdown and cached external value, periodically randomizes a flag, and begins priority-ordered numeric CPU-state transitions. Its body continues beyond this shard.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-013
Reviewed canonical and rendered lines 6241–6720 only. The opening fragment implements ordered CPU command selection: existing commands return early, while motion tests, CPU level, helper results, and held-item checks select new values of `cpu.x18`. Several transitions first call `ftCo_800B4A78`; others assign directly.

Shared helpers refresh `x4C` and `x50`, clear `x60` when the current command differs from both saved commands, and suppress subsequent work for command 4; otherwise they clear `xFA_b2`. `ftCo_800AE7AC` configures CPU flags and refreshes targets, then either forwards the supplied vector to `ftCo_800A8210` or, for a negative argument while not airborne, computes a direction toward the blast-zone rectangle center and chooses between two helper paths. It finishes with `ftCo_800ADE48`.

`ftCo_800AEA8C` uses a different flag configuration and probes vertically from 10 units above the fighter to 1000 below. A nonzero floor result is forwarded to `ftCo_800A1F3C` only when `ftCo_800A1B38_noinline` returns zero. `ftCo_800AECF0` prioritizes a nonzero result from `ftCo_800A229C`, then a non-null fighter target, then fallback target refresh and item-versus-fighter helper dispatch. The ending fragment initializes no-target flags and begins the same command-based action gate.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-014
Reviewed canonical and rendered lines 6721–7200 only. This range coordinates CPU fighter/item target selection, mode-bit initialization, conditional action dispatch, and calls to the common downstream updater `ftCo_800ADE48`.

- `ftCo_800AEFB8` first handles a nonzero command from `ftCo_800A229C`, then prioritizes a target returned by `ftCo_800A5CE0`; otherwise it initializes and executes the no-target path.
- The local helpers update `xF8_b6` using eligibility, grounded state, and a per-kind threshold; filter held items explicitly against Heart, Tomato, and Foods; and dispatch item handling or a nearby-fighter position calculation with a 50-unit planar-distance limit.
- `ftCo_800AF290` and `ftCo_800AF78C` share command/target priority, redirection conditions, mode bits, and item-target helpers. Only the former additionally redirects through `ftCo_800AEA8C` when the target-distance result exceeds `x40`.
- `ftCo_800AFC40` chooses the result of `ftCo_800A50D4`, falling back to `x44`, for `ftCo_800A75DC`. `ftCo_800AFE3C` instead forwards its integer argument through `ftCo_CpuActOnPlayer`, which similarly falls back to `x44`.
- `ftCo_800B00F8` refreshes targets, conditionally resets `x60`, suppresses its action branch for `x18 == 4`, and otherwise prioritizes an item target. Without one, the `((x7C % 60) * 5) == 0` branch conditionally calls `ftCo_800A8940` and independently randomizes seven mode bits.
- The final fragment begins `ftCo_800B04DC` by initializing target modes and assigning `x44`; its remaining behavior lies outside this shard.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-015
Reviewed canonical and rendered lines 7201–7680 only. This range contains CPU target-update code and a two-fighter input-recording/synchronization state machine. `ftCo_800B0918` advances two wrapping history pointers and records the source fighter's sticks, buttons, trigger value, position and facing into the destination fighter's CPU history. `ftCo_800B0AF4` conditionally replays that history, optionally blends position toward the recorded position by 5%, and handles a paired SpecialLw transition. Compatibility predicates exclude specified motion/item states; synchronization entry additionally requires both fighters grounded, sufficiently similar position deltas, and separation strictly below 25 units. `ftCo_800B101C` records the other fighter, derives CPU level from that fighter's damage percent divided by 20 with an upper cap of 9, and manages synchronization entry/exit. Exit clears selected inputs and restores `x18` from `x1C`; grounding clears `xFB_b0`. The remaining code initializes CPU flags and item targets, performs conditional helper dispatch, and begins another target-selection routine whose body continues beyond this shard.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-016
Reviewed canonical and rendered lines 7681–8160 only. This interval contains CPU targeting-policy variants, an idle-command dispatcher, and the beginning of a mode dispatcher.

- `ftCo_800B17D0` and `ftCo_800B1AB8` share command-preemption and non-null-target fast paths. Otherwise they initialize flags, refresh fighter/item targets, conditionally select an item or fighter handling path, and call `ftCo_800ADE48`. Their explicit policy difference is `xF9_b5` true versus false.
- `ftCo_800B1DA0` initializes targeting and conditionally calls `ftCo_800A8940` when acting is permitted, `(x7C % 60) * 5 == 0`, and the random sample is below 0.5; it then calls `ftCo_800ADE48`.
- `ftCo_800B1EF0` and `ftCo_800B24B8` share the initial command/target paths but pass false and true respectively to `ftCo_CpuInitNoTarget`, then update both item-target categories and delegate to `ftCo_CpuActOnNoTarget`. `ftCo_800B21C8` instead disables `xF9_b7`, updates special-item targeting and target distance, and conditionally delegates with a selected fighter pointer.
- `ftCo_800B2790` runs only when `csP` is null and `command_duration` is zero. It increments `x80`, clears `xF8_b7`, performs setup, dispatches on `x18`, and ends with `ftCo_800B49F4`. Cases include floor-dependent handling, an item-presence branch, motion-ID-dependent handling, and a default `CpuCmd_Done` call.
- The visible beginning of `ftCo_800B2AFC` dispatches on `cpu.xC`. Case 0 clears targeting modes, conditionally resets `x60`, skips floor probing for `x18 == 4`, otherwise probes vertically from current position and passes a non-ignored floor result to `ftCo_800A1F3C_noinline2` with 5.0f. Case 1 begins analogous setup and probes from `cpu.x98`; its continuation lies outside this shard.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-017
Reviewed canonical and rendered lines 8161–8640 only. The dispatcher tail routes numeric cases to distinct helpers; its inline branches reset selected CPU flags/timers, optionally query a nonignored floor beneath the fighter or pass the stored fighter target to a helper, then call ftCo_800ADE48. No gameplay labels are assigned to numeric cases.

ftCo_800B33B0 maintains CPU environmental and timing state: it periodically randomizes xFA_b34 using CPU level, records whether a floor beneath the fighter lies within blast-zone bounds inset by CPU half-extents, counts consecutive near-stationary collision-position updates, advances countdowns, restores saved destination coordinates when x60 expires, and offsets destination x/y using floor velocity or a fallback vector. Its scale helper periodically computes x570 from level and randomness, then calls ftCo_800A0CB0. A separate flag is cleared when an upward ceiling query fails and set on qualifying grounded floor contact.

ftCo_800B3900 invokes five helpers in a fixed order and increments cpu.x7C afterward. The assigned beginning of ftCo_800B395C checks for a CPU player and initializes red RGB values for numeric states 2 and 3; the remainder is outside this shard.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-018
The assigned range (8641–8779) finishes `ftCo_800B395C`, a CPU-only visualization routine. It selects paired colors from `cpu.x18`, passes the `cpu.x54` position at z=0 to `lbColl_800096B4` with an identity matrix, identical endpoints, and size 5.0, then supplies facing-dependent position pairs to `lbColl_80009DD4`. The first pair uses fighter position and `x55C`, `x560`, and `x568`; its default translucent yellow changes to opaque yellow, transparent black, or opaque white according to `x7C % 3` when `xF8_b7` is set. When `x18 == 2`, an additional translucent-red pair uses `x6C` and `x74`, mirrored horizontally with facing. The routine returns true for the CPU branch and false otherwise. This review covers only the assigned tail, with the function entry read for context.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-019
Reviewed the complete assigned header, `ftCo_0A01.h:1–64`, in canonical and rendered form. This range defines an include-guarded declaration interface, not executable behavior. It declares seven CPU input accessors: six return `float`, and the button accessor returns `HSD_Pad`. Other declarations accept fighter, item, vector, and fighter-object pointers and return predicates, scalar values, fighter pointers, or no value. `ftCo_800A0FB0` exposes named vector, line-ID, flags, and normal pointer parameters alongside integer and float parameters. A decompiler-style stack structure contains explicit padding, an `f32`, and a `Vec3`. The final declaration, `ftCo_800B3958`, retains unknown return and parameter macros. Implementation semantics are not established by these declarations.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-020
The assigned functions append CPU controller scripts rather than directly changing movement. Three builders select neutral termination, delayed Y input, or directional Y input using adjusted height and x2168; their steering differs between destination, facing direction, and target fighter. A fourth emits a fixed Y/wait/up-forward/R sequence with two terminators. Item scans use a 35-integer priority table together with eligibility and distance filters. Source confirms these operations, but not the baseline's compiled section layout. The fighter-directed jump has an explicitly grounded caller, contradicting its recovery-only interpretation.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-021
Reviewed the six assigned function bodies. They construct conditional Y-tap scripts, level-paced downward-stick scripts, randomized input scripts, and a command terminator; periodically replace a kind-dependent random CPU scalar; and reduce hurt-capsule geometry to facing-relative extents. Current source uses Fighter.cpu and struct CpuFighter, rather than the baseline's x1A88/Fighter_x1A88_t spelling. Gameplay interpretations and legacy layout assertions not independently established remain deferred. This is not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-022
Reviewed the six assigned subjects. They implement timed fighter-target exclusion, a nearest-floor query with a post-selection veto, CPU-state initialization, planar fighter distance, aggregation of four stage-line predicates, and directional target-wall obstruction testing. Current source uses `Fighter.cpu` and `struct CpuFighter`; historical `x1A88` references are not current source identifiers. This review does not establish complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-023
Reviewed the six assigned subjects. Two read-only fighter predicates reduce state fields to booleans. The navigation helper selects an eligible route-list waypoint, preserves the requested destination, and starts a 300-update timer; the destination setter refuses replacement while that timer is active. A Zebes-only predicate compares a height against a stored level and its linear projection. The CPU eligibility predicate requires effective CPU participation and excludes internal mode 5; its fighter-process caller separately checks x221F_b3. Current source names the CPU member `cpu` and its type `struct CpuFighter`; historical offset-style notation is not independent proof of compiled layout.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-024-retry180539
Reviewed the six assigned predicates/updaters and selected dependencies and consumers, not the complete translation unit. They maintain grounded target proximity, compare supporting collision islands, test the island intersected near a CPU destination, classify exceptional stage-position conditions, classify islands using item and stage predicates, and test facing-side island-endpoint distance. Current source calls the embedded state `cpu`; historical `x1A88` layout terminology is not independently established here.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-025
Reviewed the six assigned subjects and their 36 baseline facts. The helpers measure proximity and distance to supporting floor-island endpoints, test facing against a stored CPU coordinate or referenced fighter, classify selected terrain/trajectory hazards, and distinguish DownBound from DownWait motions. Current callers use these results to gate CPU decisions, construct directional input sequences, select attack candidates, or enter CPU state 4. The trajectory classifier also has a grounded special-floor path; it is not exclusively a falling-to-death test. This review does not establish complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-026
Reviewed the six assigned function bodies and relevant dependencies. They classify two motion states for CPU attack selection, gate destination-directed jump/recovery responses, handle arrival and temporary-waypoint rollover, validate a tracked item for pickup, and search leftward island endpoints for navigation destinations. The leftward search has first-success strict mode and nearest-candidate fallback mode; fallback can update navigation while returning false. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-027-retry180539
Reviewed the six assigned selectors/navigation helpers. They implement rightward island waypoint search, nearest inward-offset island-edge fallback, planar destination-distance caching, uncached eligible-fighter selection, sticky non-allied target selection, and nearest non-allied fighter selection relative to a supplied 3D position. The uncached selector used by Samus's grapple does not reject allies. Sticky selection invalidates a missing cached target without acquiring a replacement during that same call. This review does not establish complete TU coverage or compiled field offsets.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-028
Reviewed the six assigned subjects and all 36 baseline facts, not the complete translation unit. The fighter queries select the nearest eligible ally, the first eligible requested-player fighter, an enemy minimizing a game-mode ranking value then XY distance, or the first distinct same-player fighter. The same-player lookup stops with NULL on a flagged first match and supplies Nana's history and follow logic. Two non-null Item predicates recognize separate three-kind whitelists; one gates held-item action planning and the other participates in collision-island evaluation. The ranked selector can indirectly refresh persistent game-mode state, contradicting its baseline no-mutation claim.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-029
Reviewed the six assigned predicates and relevant CPU consumers. They provide read-only classification for item-threat exclusion, attribute-category-3 handling, six-kind weapon-reach handling, nine-kind directional action selection, four-kind fixed action selection, and two fighter motion-state intervals used to recognize item attacks. Only the six-kind predicate explicitly accepts null. CPU callers, not these predicates, perform prediction, collision tests, and action writes. The Fighter-typed threat-exclusion predicate is called with a cast Item pointer; its intended layout remains unverified.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-030
Reviewed the six assigned selectors and predicates, not the complete TU. They implement a level-dependent command-7 eligibility window, filtered nearest-fighter selection, priority-qualified item selection, a restricted-item nearest search, and farthest inset-island-endpoint selection. Item replacement requires both nondecreasing priority and strictly shorter distance. The navigation query preserves endpoint height and writes only when a candidate improves its distance score.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-031
Reviewed the six assigned navigation helpers and relevant consumers. Two queries select above-platform or below-floor midpoint contacts; a directional query processes other-island midpoints and inset endpoints with sequential guards. Fighter-target and partner-follow helpers derive lock-aware destinations from floor projection, target positions, and island edges. The nearby-target helper requests an approach destination only for a grounded fighter within the distance guard. Current source accesses this state through `fp->cpu`. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-032
The six assigned functions select stage-aware, item-relative, randomized, or recovery destinations and construct character-specific recovery controller scripts. Destination selection and destination mutation are distinct: the stage dispatcher can report success without writing locked destination state. Item pursuit separately projects a floor and adjusts cross-island approaches. Recovery initialization performs facing-ordered strict searches followed by a relaxed search. Ness and Pikachu/Pichu script builders emit timed stick and button commands rather than directly executing movement. This review covers only the assigned subjects and supporting excerpts.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-033
Reviewed the six assigned subjects and relevant command interpreter/callers, not the complete TU. These routines construct character-specific recovery and airborne navigation scripts, or select level-dependent horizontal-stick operands. Zelda chooses diagonal versus vertical input at a 30-unit horizontal threshold; Samus emits a fixed sequence. The dispatcher selects character-specific scripts and gates Ness by destination height. Navigation combines jump availability, flags, stage queries and projected destination-crossing height. The airborne shortfall-derived operand is a stick increment capped at 32, not the final magnitude clamp; the latter is 127. Current source accesses CPU state through Fighter.cpu and struct CpuFighter.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-034
Reviewed the six assigned navigation functions and their command-generation context. They select destination-relative approach, facing-relative movement, platform/drop or jump builders, and grounded route dispatch. The Shrine-specific waypoint search mutates the destination after obstruction and range checks, but its vertical tests are asymmetric: the positive-facing branch accepts endpoints at or above the fighter, while the other branch accepts endpoints at or below it. The cross-edge builder also selects the jump helper outside its near-edge branch.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-035
Reviewed the six assigned command builders and their dispatcher. They implement prioritized movement overrides, floor/trajectory-dependent R and stick commands, periodic alternating horizontal input, two barrel-state A-input policies, knockback-perpendicular input, and a proximity-dependent A-retap or movement-away response. Current source uses fp->cpu and struct CpuFighter. Gameplay interpretations not established by the inspected command construction remain deferred; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-036
Reviewed the six assigned CPU command builders and their common dispatch: ledge-response selection, charge-related behavior, destination-gated Y input, forward movement, angle-dependent held-item scripts, and pre-dispatch R input for selected charging motions. Current source uses Fighter.cpu where baseline descriptions use x1A88. Gameplay outcomes beyond command construction remain deferred where downstream execution was not verified. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-037
Reviewed the six assigned CPU-decision routines and relevant local helpers and callers. They refresh target-policy flags, prioritize exceptional positional responses and fighter targets, select item or navigation fallbacks, and invoke a shared action-state selector. The shared selector repairs destinations, updates distance and policy counters, and scans action conditions in order. Current source uses `fp->cpu` and `struct CpuFighter`; historical structure names and stronger gameplay interpretations require qualification. This review does not claim complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-038
Reviewed the six assigned CPU-handler bodies and selected supporting helpers and callers, not the entire TU. These handlers configure fighter/item targeting, gate destination updates through CPU action state, and invoke common final processing. Distinct paths include preferred-fighter selection, player-index-directed fallback, periodic randomized navigation, proximity-conditioned destination requests, and Nana-follow action dispatch. Current source uses `fp->cpu` and `struct CpuFighter`; historical layout/type wording is not independently established. The food-named helper checks held healing-item kinds but calls a selector with `It_Kind_L_Gun_Ray`, so its name alone does not establish healing-item pursuit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-039
Reviewed the six assigned functions and their local producer/consumer and dispatch context. The partner-control family records circular input/transform snapshots, conditionally replays delayed inputs, applies XY position correction, tests follow compatibility and close-range entry, and derives Nana's CPU level from partner damage. The item-oriented updater refreshes targets and chooses between empty-hand item pursuit and periodic randomized navigation. This is bounded subject coverage, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-040
The six assigned routines implement related CPU targeting updates. They select fighter targets, configure fallback targeting flags, refresh item observations, and delegate guarded destination/action updates. Four prioritize a stage-position classification before normal targeting. Modes 17 and 29 differ in their fallback xF9_b5 setting; mode 28 refreshes special items and distance without the common-item branch. Mode 24 periodically attempts a randomized destination on another stage island. Current source calls the embedded state `cpu` and its type `struct CpuFighter`; baseline x1A88 terminology is treated as historical terminology, not independently verified compiled layout. Coverage is limited to this shard and supporting reads.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-041
Reviewed the six assigned function bodies and supporting source, not the entire TU. The common CPU coordinator updates persistent navigation state, dispatches a behavior policy, builds a command script when idle, interprets commands, runs the remaining update phase, and increments its counter. Default targeting prioritizes a query-produced override, then a fighter target, then guarded item/fallback handling. Navigation bookkeeping probes floors, checks blast-zone margins, tracks immobility and timers, and adjusts destinations for stage motion. The separate CPU-only drawing callback visualizes internal positions and regions without directly mutating fighter state. Current source accesses this state as `fp->cpu` with type `struct CpuFighter`.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-042
The six assigned accessors expose CPU-generated controller input without mutating fighter state. Main-stick and C-stick axes use signed-byte normalization (positive /127, otherwise /128) and clamp to [-1, 1]. Buttons are returned unchanged; the left trigger is divided by 255 and upper-clamped to 1. The fighter input updater selects these sources instead of hardware input, conditionally enables C-stick input, combines triggers by maximum, applies dead zones, and processes button masks and logical shoulder inputs. Current source uses `cpu`, indexed input histories, and descriptive trigger/button fields rather than several baseline field spellings.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-043
Reviewed the assigned baseline subjects, not the complete translation unit. The right-trigger accessor divides CPU trigger input by 255 and upper-clamps it; fighter input processing combines the two CPU triggers by maximum, just as it combines physical-controller triggers. The ally predicate rejects null fighters, accepts shared player IDs, and otherwise consults team rules. The grabbing predicate recognizes an explicit character/motion-state domain and feeds behavior selection and directional-input scripting. Sampled translation-unit bodies show recovery command construction, target updates, and behavior dispatch. The two assigned parameter subjects contain no baseline facts.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-044
The six assigned parameter subjects have no baseline facts. Their current function bodies take `Fighter* fp` and pass it to CPU-command helpers. The routines construct timed stick/button sequences, conditionally inspect fighter position, motion, kind or CPU level, select among randomized command sequences, or forward the literal command 127. This review covers only the assigned subjects, not the complete translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-045
The six assigned parameter subjects contain no baseline facts. The reviewed bodies use a Fighter pointer to periodically update cpu.x56C or compute facing-relative hurt-capsule extents, and a Fighter_GObj pointer to evaluate a boolean condition involving fighter queries and cpu.x7C. ftCo_800A0FB0 initializes the output line ID, forwards a floor query, and rejects successful results when an additional line predicate holds. No register-to-source-parameter mappings are proposed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-046
The assigned subjects have no baseline facts. Their parent function, `ftCo_800A0FB0`, initializes the output line ID to -1, forwards its arguments to `mpCheckFloor`, and rejects a successful result when `ftCo_800A1B38` accepts the resulting line ID. A caller uses its returned position to initialize CPU destination coordinates, falling back to the fighter's current position on failure. Register-labelled subject identities are not mapped to source parameters without compiled-layout evidence.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-047
The six assigned parameter subjects have no baseline facts to disposition. In the canonical source, ftCo_800A0FB0 initializes the output line ID to -1, forwards its arguments to mpCheckFloor, and rejects successful results when ftCo_800A1B38 accepts the resulting line ID. ftCo_800A101C initializes fighter CPU state: arg1 supplies xC except for the explicit FTKIND_NANA branch, arg2 supplies level, and arg3 supplies x14. It also initializes destination coordinates using a floor query with a current-position fallback, resets command/input state, and initializes history and movement-related values. Register-labelled subject identities are not treated as verified source-parameter mappings.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-048
The six assigned parameter subjects contain no baseline facts. Their canonical functions initialize CPU state (including copying the fourth argument into cpu.x14), compute two fighters' planar distance, aggregate four stage predicates for a supplied identifier, query a facing-dependent wall between a fighter and cpu.x44, and test a disjunction of fighter fields. No gameplay meaning is assigned to unnamed fields or numeric values. This review covers only the bounded subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-049
The assigned subjects have no baseline facts. Their containing functions test whether a fighter's x2168 is nonzero, conditionally select coordinates from a linked stage-entry list, and update CPU coordinates and x38 when x60 is zero. The stage-entry helper can preserve the previous coordinates in x64, replace x54, and set x60 to 300 and x38 to 5. This review covers only these bounded subjects.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-050
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions to issue. Their containing functions conditionally store CPU coordinates and a scalar, test coordinates against stage-dependent thresholds, test CPU eligibility, update a grounded comparison flag, and compare two fighters' floor-island lookup results. These are source-level observations, not validated register-to-parameter mappings.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-051
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions. Current canonical bodies show: ftCo_800A2170 compares two non-airborne fighters' floor lookup results; ftCo_800A21FC compares a fighter's floor lookup with a query at its CPU x54 coordinates; ftCo_800A229C reads fighter position and conditionally writes a Vec3 output while returning stage-dependent status values; ftCo_800A2718 tests a supplied island pointer against filtered items and stage-specific conditions; ftCo_800A28D0 tests horizontal distance to a facing-selected island endpoint against five times its float argument. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-052
The assigned parameters belong to four read-only predicates/distance helpers. ftCo_800A28D0 compares facing-selected horizontal endpoint separation against five times its float argument; ftCo_800A2998 uses the nearer endpoint instead. Both return false while airborne or when floor lookup fails. ftCo_800A2A70 returns planar distance to x8 when its boolean argument is true, otherwise x14, with -1 on those failure conditions. ftCo_800A2BD4 tests whether facing_dir multiplied by the horizontal displacement to cpu.x54 is nonnegative. All six assigned subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-053
The six assigned parameter subjects have no baseline facts. Their current functions each accept `Fighter* fp`: ftCo_800A2C08 compares facing against the fighter referenced by cpu.x44; ftCo_800A2C80 evaluates movement and projected collision positions against stage boundaries; ftCo_800A3134 and ftCo_800A3200 classify motion IDs; ftCo_800A3234 and ftCo_800A3498 evaluate predicates using airborne movement, collision information, and CPU fields. Review is limited to these subjects, not the full translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-054
The fully read bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled register-to-parameter mappings are asserted in this review.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-055
The six assigned parameter subjects contain no baseline facts, so no fact dispositions are required. Canonical bodies show that ftCo_800A4038's boolean argument switches between a predicted-height-gated first-success selection and distance-improving updates. ftCo_800A4768 reads a fighter's position and bounds margins and conditionally writes an offset island position through its Vec3 pointer; it always returns zero. ftCo_800A49B4 updates cpu.x5C with planar distance to cpu.x54. ftCo_800A4A40 selects the nearest qualifying other fighter, without an explicit ally exclusion. ftCo_800A4BEC additionally filters allies and can reuse a cached qualifying fighter or update selection state.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-056
The assigned subjects have no baseline facts. Their current function bodies implement filtered fighter selection: ftCo_800A4E8C uses a Fighter context and a Vec3 reference point to minimize three-dimensional distance; ftCo_800A50D4 uses a Fighter context and minimizes ftCo_800A1AB4 among candidates passing its predicates; ftCo_800A5294 uses a Fighter context and an integer matched against candidate player_id; ftCo_800A53DC uses a Fighter context to select by ascending gm_8016C6C0 result, breaking ties with ftCo_800A1AB4, with an optional more restrictive first pass. These are source-level observations, not verified register-parameter mappings.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-057
The six assigned parameter subjects have no baseline facts to disposition. Their canonical functions use the first parameter as follows: ftCo_800A589C accepts a nullable Fighter pointer and searches for another fighter with the same player_id, returning NULL if that first matching fighter has x221F_b3 set. ftCo_800A5908 and ftCo_800A5944 inspect an Item's kind against explicit three-member sets. ftCo_800A5980 inspects a Fighter's motion_id against a range and four individual states. ftCo_800A59C0 tests an Item attribute field for equality to 3. ftCo_800A59E4 accepts a nullable Item pointer and checks six explicit item kinds. These observations do not establish compiled parameter-register bindings or additional gameplay meanings.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-058
The six assigned parameter subjects have no baseline facts. Their enclosing canonical functions accept Item* for two item-kind membership predicates and Fighter* for a motion-range predicate, a CPU flag/level/periodic-counter predicate, filtered fighter selection, and filtered item selection. The fighter and item selectors use the supplied fighter as selection context. No register-to-source-parameter mapping or compiled layout is asserted.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-059
The assigned subjects have no baseline facts to disposition. Their current function bodies implement filtered item selection and an island-point search. ftCo_800A5F4C accepts an item-kind filter; ftCo_800A61D8 and ftCo_800A648C use a fighter context when selecting items by eligibility and distance. ftCo_800A6700 uses fighter CPU dimensions for boundary checks, reads a reference vector, and writes the accepted candidate with greatest squared XY distance to an output vector; it returns false without writing that vector when no candidate qualifies.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-060
The six assigned parameter subjects have no baseline facts. The three canonical functions take a Fighter* first and a Vec3* output second. They select filtered floor positions relative to the fighter, writing x/y and zero z when a candidate improves the selection. ftCo_800A6A98 applies a platform-flag and upper-height test; ftCo_800A6D2C excludes the current island and applies a lower-height test; ftCo_800A6FC4 excludes the current island and additionally filters positions against its third, directional argument. The inspected caller consumes successful outputs as CPU destination coordinates. This review covers only the assigned subjects, not the complete TU.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-061
The entire assigned bundle contains six parameter subjects, each with an empty baseline fact list and no source hints. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No parameter semantics or register-to-source mappings are asserted, and no new facts or links are proposed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-062
The complete assigned bundle contains six parameter subjects, each with an empty baseline facts array. There are therefore no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new semantic claims or parameter interpretations are proposed; function-body coverage and complete translation-unit coverage are not claimed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-063
The assigned parameters belong to four CPU recovery routines. Their canonical first parameter is `Fighter* fp`, used to read fighter/CPU state and passed to command-building helpers. `ftCo_800A949C` chooses diagonal versus vertical input using horizontal destination distance; `ftCo_800A963C` supplies a fixed input sequence. Both declare an unused boolean second parameter, supplied by `ftCo_800A96B8` from a destination-height comparison. `ftCo_800A96B8` dispatches by fighter kind. `ftCo_800A9904` selects a jump, delegates to that dispatcher, or selects horizontal input using motion prediction and a ceiling check. All six assigned subjects have empty baseline fact arrays; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-064
The complete bundle assigns six parameter subjects, all with empty baseline fact arrays. There are no baseline fact IDs to retain, supersede, reject, or mark unresolved. No new parameter semantics or compiled-register mappings are proposed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-065
This bounded subjects shard contains six parameter identities, each with an empty baseline fact list. There are no assigned fact IDs to retain, correct, reject, or defer. No parameter semantics or register-to-source mappings are asserted, and no complete translation-unit coverage is claimed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-066
The fully read bundle assigns six parameter subjects, each with an empty baseline facts array. There are no baseline fact IDs to disposition in this shard. No parameter semantics, compiled-layout claims, or gameplay mappings are proposed; this result does not claim function-body or complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-067
The six assigned parameter subjects have no baseline facts. Their current function bodies use a first C parameter named `fp` of type `Fighter*`: they inspect fighter state, pass the fighter to CPU command helpers, and access or update its CPU state. The reviewed routines cover conditional input sequences, item-dependent script selection, character-specific state checks, destination validation and action selection, and target/destination updates. No compiled-register mapping or numeric command gameplay meaning is asserted.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-068
The six assigned parameter subjects contain no baseline facts, so there are no fact dispositions. The inspected functions operate on a Fighter's CPU state, configure flags and target pointers, and dispatch further processing. In ftCo_800AE7AC, the Vec3 pointer is forwarded to ftCo_800A8210 when the integer argument is nonnegative; that integer also controls three CPU flags. The other four functions take Fighter* and select among target, item, floor-query, and delegation paths. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-069
The entire bundle was read. All six assigned parameter subjects have empty baseline fact arrays, so this shard contains no fact records to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled-register mappings are asserted, and no new facts or links are proposed. This review does not claim complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-070
The fully read bundle assigns six parameter subjects, each with an empty baseline fact list. There are no baseline facts to retain, supersede, reject, or mark unresolved. No parameter semantics or compiled register mappings are asserted, and no broader translation-unit coverage is claimed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-071
The six assigned parameter subjects have no baseline facts to assess. The examined functions accept Fighter pointers. ftCo_800B0E98 compares two fighters using grounded state, CPU/action gates, relative position deltas, and distance. ftCo_800B101C updates the supplied fighter's CPU follow state, derives its CPU level from another fighter's damage percentage, and conditionally clears generated inputs. ftCo_800B126C, ftCo_800B1478, and ftCo_800B17D0 configure CPU flags and select target-dependent actions; the latter also has an early command-handling path. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-072
This bounded shard contains six parameter subjects, each with an empty baseline fact list. There are no baseline assertions to retain, supersede, reject, or mark unresolved. No parameter functionality, type, register-to-source mapping, or gameplay interpretation is established by this review.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-073
This bounded subjects shard contains six parameter identities, each with an empty baseline facts array. There are no baseline semantic assertions to retain, correct, reject, or defer. No new parameter semantics or register-to-source mappings are proposed.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-074
The six assigned getter parameters correspond to source-level `Fighter* fp` inputs. Each getter reads the corresponding field of `fp->cpu` without modifying it. Stick axes are converted using division by 127 for positive values and 128 otherwise, then clamped to [-1, 1]. Trigger values are divided by 255 and capped at 1. All six assigned subjects have empty baseline fact lists; there are no baseline fact IDs to disposition.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-075
The three assigned parameter subjects have no baseline facts, so there are no fact dispositions to emit. Canonical source shows that `ftCo_IsAlly` compares two nullable fighter pointers: either null yields false, equal player IDs yield true, and otherwise global predicates gate team comparison. `ftCo_IsGrabbing` reads a fighter's motion ID and kind and returns membership in explicitly listed motion states or ranges; it does not check a held-object pointer. These observations do not establish compiled register bindings for the parameter identities.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-076
Reviewed the twelve assigned links against current canonical source and selected callers. The examined code emits CPU command sequences, initializes CPU behavior state, supplies simulated controller buttons, selects item targets and stage destinations, and switches partner-follow behavior. Navigation uses collision-island geometry, floor tests, destination angles, and obstacle checks. Several narrower gameplay mappings remain deferred pending verification of external helper semantics; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-077
The reviewed routines generate CPU controller-command sequences, gate movement on floor metadata, initialize CPU behavior selectors, normalize CPU C-stick input, and coordinate fighter/item targeting. Specific move identities and some caller-dependent gameplay claims remain deferred. This assessment covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-078
Reviewed the twelve assigned links against current canonical source. The inspected routines select CPU targets and actions, install stage-dependent intermediate destinations, filter floor contacts, test facing and floor-boundary proximity, and emit timed controller commands for randomized responses and recovery. Section-level compiled ownership and the specific PK Thunder 2 mapping remain unconfirmed. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-079
Reviewed the twelve assigned links against current canonical code. The inspected routines construct CPU virtual-controller scripts, initialize CPU level and runtime state, normalize trigger input, select fighter targets, classify held items for attack decisions, and maintain navigation destinations. One targeting link has a stale proximity-gating rationale; its broader target-selection relationship remains supported by current callers. This review does not claim complete translation-unit coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-080
The reviewed functions select CPU behavior builders, emit controller-command sequences, steer toward destinations using distance and collision-island tests, and conditionally pursue items. A stage-specific branch selects an elevated-platform query using the sign of a returned vector. This review assesses only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-081
The reviewed routines initialize CPU level and command/controller state, aggregate hurt-capsule extents, classify cliff states and facing-dependent floor proximity, select fighter targets, supply destination-steering parameters, and dispatch or construct CPU command sequences. Review is limited to the assigned links, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-082
The reviewed links describe CPU target filtering and action selection, level-dependent controller decisions, collision-island navigation, held-opponent classification, and partner-follow compatibility. Current canonical code supports these relationships. Historical line numbers have shifted; the evidence below refers to the pinned current revision. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-083
Reviewed the twelve assigned concept links against current canonical bodies. These routines filter item targets, construct CPU input scripts, classify projected collisions against blast boundaries, dispatch character-specific recovery, maintain destination geometry, and expose CPU controller state. Some broader gameplay mappings remain deferred; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-084
Reviewed the twelve assigned concept links against current canonical bodies and relevant callers. These routines support CPU collision-aware navigation, stage-boundary responses, fighter targeting, attack eligibility, airborne jump decisions, item-directed destinations, knockdown classification, and command-sequence construction. This assessment covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-085
The reviewed code builds CPU input-command sequences, gates decisions by CPU level, substitutes stage-route waypoints, classifies fighter motion states, and gives stage-response checks priority over target selection. Several broader gameplay and compiled-section associations remain unverified; this review does not establish complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-086
The reviewed links connect CPU target and behavior selection, item-pickup eligibility, collision-aware navigation, command generation, gameplay-facing button input, and partner-input synchronization. Current canonical bodies support these relationships. This review covers only the twelve assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-087
The reviewed routines select CPU behavior, install fighter-relative destinations using floor geometry, and emit timed controller commands. Destination steering can depend on CPU level. No-target processing refreshes item targets and prioritizes an available item before fighter-directed navigation. This review covers only the assigned links, not the entire translation unit.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-088
Reviewed the twelve assigned links. Current source supports CPU input accessors feeding shared controller processing, level-dependent decisions, destination-facing checks, stage-navigation and recovery calculations, and scripted stick alternation. Two links remain unresolved: an Item-to-Fighter cast prevents validating the claimed item-kind filter, and direction-dependent numeric action selections do not independently establish item throwing. This review does not claim complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-089
The reviewed links cover CPU destination construction from stage geometry, timer-dependent fighter filtering, normalized controller output, partner-follow coordination, and item-action selection. Canonical bodies support the navigation and controller relationships. Several specific gameplay mappings require additional consumer or move-implementation evidence; these are explicitly deferred. This review does not claim complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-090
Reviewed the twelve assigned concept links, not the entire translation unit. Current source supports CPU input-script construction, destination and wall queries, item-sensitive island classification, attack-selection guards, target-dependent behavior selection, and scripted Ness recovery. The specific mapping of the randomized input routine to ledge options remains deferred.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-091
Reviewed the twelve assigned links against current canonical code. The routines cover CPU eligibility, command initialization and generation, destination routing and moving-floor tracking, prioritized behavior selection, character-specific recovery and charging inputs, and paired-fighter input playback. Opponent-selection delegation and the specifically double-jump interpretation remain deferred; this is not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-092
Reviewed the twelve assigned concept links against current canonical source. The routines select CPU fighter/item targets, choose behavior paths, measure hurt-capsule and floor-descriptor geometry, select platform destinations, emit timed controller-command sequences, and normalize CPU input for the shared fighter-input pipeline. The specific Quick Attack mapping remains deferred; the source establishes shared Pikachu/Pichu recovery scripting, not the named move implementation. This is bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-093-retry180539
The reviewed routines build CPU controller-command sequences for jumping and recovery, select fighter and item targets, coordinate partner AI, run the CPU update pipeline, and draw CPU targeting geometry. The aerial-pursuit caller explicitly advances from its jump-command phase to airborne target steering. Review is limited to the assigned links; several specific gameplay mappings remain deferred.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-094
The reviewed code constructs stage- and fighter-relative CPU destinations, selects fighter/item actions, emits virtual-controller command sequences, and records and replays associated-fighter inputs. Specialized branches handle barrel states, knockback-relative stick input, and stage-specific geometry. This is a bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-095
Reviewed the twelve assigned links against current canonical source. The supported relationships cover ally/enemy filtering, prioritized CPU action selection, command construction, item-oriented targeting, collision-based navigation, and normalized controller input. Two narrower gameplay mappings remain deferred. This review does not claim complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-096-retry180539
This bounded review covers CPU command construction, controller-input accessors, probabilistic decisions, item-directed navigation, behavior dispatch, and a grabbing-state predicate. Command builders emit terminated stick/button sequences; input accessors expose CPU state to shared fighter input processing. Navigation uses floor intersections and collision-island relationships. Behavior handlers configure CPU state and delegate action selection. The special-item selector is verified, but its broader stage-enemy classification remains deferred.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-097
The reviewed links concern CPU command construction, target acquisition and behavior dispatch, level-dependent steering, randomized parameter updates, partner-relative initialization, and floor validation against blast-zone boundaries. Current source supports these core relationships. Kirby Inhale mapping, indexed-script implementation details, and the external Discord attribution remain explicitly deferred. This is a bounded link review, not complete TU coverage.

### shard-main__melee__ft__kinds__ftCommon__ftCo_0A01-098
Reviewed the five assigned links against current canonical source. The code supports CPU-state visualization, stage-boundary checks that precede ordinary targeting, and item-target refresh with preferential fallback dispatch. Random controller-command selection is directly visible, but its ledge-specific gameplay mapping remains unverified. The CPU update orders consecutive helper calls, but their complete command-stream producer/interpreter semantics remain unverified.

Status: researched; no-change lead bypass; independent review and live promotion pending.
