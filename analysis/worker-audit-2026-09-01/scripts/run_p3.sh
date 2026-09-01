#!/bin/zsh
# Phase 3 fan-out: one codex job per pair in pairs.json, 8 at a time.
AUDIT="/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/analysis/worker-audit-2026-09-01"
OUT="$AUDIT/phase3_notes"
TPL="$AUDIT/scripts/p3_prompt_template.md"
mkdir -p "$OUT" "$AUDIT/scripts/p3_logs"

python3 - "$AUDIT" <<'EOF' > "$AUDIT/scripts/p3_jobs.tsv"
import json, sys, os
audit = sys.argv[1]
pairs = json.load(open(os.path.join(audit, 'pairs.json')))
for p in pairs:
    ex, ct = p['exact'], p['control']
    exf = os.path.join(audit, 'condensed', ex['ws_id'] + '.md')
    ctf = os.path.join(audit, 'condensed', ct['ws_id'] + '.md')
    if not (os.path.exists(exf) and os.path.exists(ctf)):
        sys.stderr.write(f"missing condensed for pair {p['pair_id']}\n"); continue
    print('\t'.join(str(x) for x in [p['pair_id'], p['epoch_ordinal'],
        ex['target_key'], ex['baseline_score'], exf,
        ct['target_key'], ct['baseline_score'], ct.get('best_score',''), ctf]))
EOF

run_pair() {
  local pair_id="$1" epoch="$2" ext="$3" exb="$4" exf="$5" ctt="$6" ctb="$7" ctbest="$8" ctf="$9"
  local outfile="$OUT/pair_${pair_id}.md"
  [ -f "$outfile" ] && { echo "skip $pair_id (done)"; return 0; }
  local prompt
  prompt=$(sed -e "s|{PAIR_ID}|$pair_id|g" -e "s|{EPOCH}|$epoch|g" \
    -e "s|{EXACT_TARGET}|$ext|g" -e "s|{EXACT_BASE}|$exb|g" -e "s|{EXACT_FILE}|$exf|g" \
    -e "s|{CTRL_TARGET}|$ctt|g" -e "s|{CTRL_BASE}|$ctb|g" -e "s|{CTRL_BEST}|$ctbest|g" \
    -e "s|{CTRL_FILE}|$ctf|g" -e "s|{OUT_FILE}|$outfile|g" "$TPL")
  codex exec -m gpt-5.6-sol -c model_reasoning_effort="low" --enable fast_mode --sandbox workspace-write --cd "$AUDIT" "$prompt" \
    > "$AUDIT/scripts/p3_logs/pair_${pair_id}.log" 2>&1 < /dev/null
  echo "pair $pair_id exit=$?"
}

count=0
while IFS=$'\t' read -u 3 -r pid epoch ext exb exf ctt ctb ctbest ctf; do
  run_pair "$pid" "$epoch" "$ext" "$exb" "$exf" "$ctt" "$ctb" "$ctbest" "$ctf" &
  count=$((count+1))
  if (( count % 8 == 0 )); then wait; fi
done 3< "$AUDIT/scripts/p3_jobs.tsv"
wait
echo "PHASE3 COMPLETE: $(ls "$OUT"/pair_*.md 2>/dev/null | wc -l) pair reports"
