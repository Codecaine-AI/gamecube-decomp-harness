# Diagnose + evidence loop brief (validation 8.4)

You are a decomp worker testing whether the steering probe and evidence tools lead to REAL source fixes. Each assigned function is exact in our PR only through steering (same-behaviour rewrites). The upstream source (7fed828b) is below 100%. Your job: find what the original source really had, so the function becomes exact (or stack-frame-only, SMS policy) through a REAL change, and the steering gate certifies it.

## Paths
- WT = /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-sms-real-codegen (harness worktree; tools in `$WT/toolpacks/gamecube-decomp/_impl/gamecube/tools/`).
- UP = /Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up7f — upstream 7fed828b, READ-ONLY. Never write into it, never checkout, never build in it with ninja.
- Gate runs cached from validation: `$WT/objectives/sms-real-codegen/validation/runs/<PR>.json` (contains each function's probe, steering edits, groups, matches).
- Audit: /Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/objectives/sms-pr189-split/audit/temp-audit/<PR>.json (`head` SHA). The steering version is `git -C $UP show <head>:<file>`.
- JSystem refs: `export ORCH_GAME_STATE_DIR=/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/runtime/state`.

## Workflow per function
1. Make a private overlay dir: `O=/tmp/loop-<yourname>/<function-slug>`; copy upstream versions of the files you'll edit into `$O/<same relative path>` (e.g. `git -C $UP show 7fed828b:src/Enemy/x.cpp > $O/src/Enemy/x.cpp`). Headers you edit go there too. Only `$O` is your candidate.
2. Read the probe for the function in `runs/<PR>.json` (find the function row; its `probe`) and the steering diff (`git -C $UP diff 7fed828b <head> -- <file>`). The steering edit tells you what codegen the original needs. Do NOT reproduce the steering.
3. Form hypotheses (missing inline, wrong inline, wrong type/signedness, wrong header inline body, missing call, wrong field, struct layout...). Search evidence:
   `python3 $WT/toolpacks/gamecube-decomp/_impl/gamecube/tools/evidence_search.py <map-calls|map-unit|inlines|usage|jsystem> --repo $UP ... --json` (see `--help`). Also read upstream headers in $UP (include/, libs/*/include) and the TP/TWW JSystem sources under $ORCH_GAME_STATE_DIR/refs/jsystem.
4. Edit `$O`, then check: `python3 $WT/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py check --repo $UP --base-ref 7fed828b --overlay-dir $O --functions '<Func>' --jobs 3 --json --out $O.check.json` (run `--help` first). Read `decision` for the function: you need `decision: pass` for your function and attempt-level `pass` (no unresolved groups, no removable non-cosmetic groups). A quick per-function score is in the `mwcc` section. Iterate.
5. Rules: no steering edits (temps/aliases/accessor swaps/reordering/if↔ternary/int↔s32 etc.), no PAD_STACK or stack-padding tricks, no `volatile`/`register`/`#pragma`, no invented helpers that are not backed by the map or headers, no comments explaining the hack. Header changes are allowed only if they are real (an inline that exists in the map as weak/local for this unit, or exists in TP/TWW JSystem with that body, or fixes a real declaration). Time box: ~40 minutes per function. Stop early if evidence says the original source cannot be recovered with available information.

## Output per function
Append one JSON line to `$WT/objectives/sms-real-codegen/validation/loop-results.jsonl`:
`{"pr","function","file","outcome":"real_match"|"improved"|"no_progress","base_pct","final_pct","gate_decision","real_change":"<what you changed and why it is real>","evidence":["map/header/jsystem refs used"],"hypotheses_tried":[...],"probe_helpful":"yes|partly|no + why","overlay_dir":"$O","diff":"<unified diff vs upstream, ≤120 lines>"}`
Then report a short summary.
