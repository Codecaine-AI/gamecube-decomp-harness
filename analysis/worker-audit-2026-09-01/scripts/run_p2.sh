#!/bin/zsh
# Phase 2 fan-out: 21 codex jobs, 7 at a time.
AUDIT="/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/analysis/worker-audit-2026-09-01"
OUT="$AUDIT/phase2_notes"
TPL="$AUDIT/scripts/p2_prompt_template.md"
mkdir -p "$OUT" "$AUDIT/scripts/p2_logs"

run_batch() {
  local n="$1"
  local bf="$AUDIT/scripts/p2_batches/batch_${n}.tsv"
  [ -f "$OUT/batch_${n}.json" ] && { echo "skip $n (done)"; return 0; }
  local prompt
  prompt=$(sed -e "s|{BATCH_FILE}|$bf|g" -e "s|{OUT_DIR}|$OUT|g" -e "s|{BATCH}|$n|g" "$TPL")
  codex exec -m gpt-5.6-sol -c model_reasoning_effort="low" --enable fast_mode --sandbox workspace-write --cd "$AUDIT" "$prompt" \
    > "$AUDIT/scripts/p2_logs/batch_${n}.log" 2>&1
  echo "batch $n exit=$?"
}

export AUDIT OUT TPL
pids=()
count=0
for n in $(seq -w 0 20); do
  nn=$(printf "%02d" $n)
  run_batch "$nn" &
  pids+=($!)
  count=$((count+1))
  if (( count % 7 == 0 )); then wait; fi
done
wait
echo "PHASE2 COMPLETE: $(ls "$OUT"/batch_*.json 2>/dev/null | wc -l) json files"
