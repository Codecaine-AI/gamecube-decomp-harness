#!/usr/bin/env bash

# Sample macOS host and Bun job-runner resource usage as JSON Lines.

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <out.jsonl> <interval_seconds>" >&2
  exit 2
fi

out_file=$1
interval=$2
if ! [[ $interval =~ ^([0-9]+([.][0-9]*)?|[.][0-9]+)$ ]] || ! awk -v n="$interval" 'BEGIN { exit !(n > 0) }'; then
  echo "interval_seconds must be greater than zero" >&2
  exit 2
fi

mkdir -p "$(dirname "$out_file")" 2>/dev/null || true

number_or_empty() {
  awk 'NF && $1 ~ /^-?[0-9]+([.][0-9]+)?$/ { print $1; exit }' 2>/dev/null
}

memory_to_mb() {
  awk '
    /^[0-9]+([.][0-9]+)?[KMGT]$/ {
      unit = substr($0, length($0), 1)
      value = substr($0, 1, length($0) - 1) + 0
      scale = (unit == "K" ? 1 / 1024 : unit == "M" ? 1 : unit == "G" ? 1024 : 1024 * 1024)
      printf "%.6f\n", value * scale
    }
  ' 2>/dev/null
}

while :; do
  ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)
  top_snapshot=$(top -l 1 -n 0 2>/dev/null || true)
  cpu_busy=$(printf '%s\n' "$top_snapshot" | awk '
    /CPU usage:/ {
      for (i = 2; i <= NF; i++) if ($i == "idle") {
        value = $(i - 1)
        gsub(/[^0-9.]/, "", value)
        if (value != "") printf "%.6f\n", 100 - value
        exit
      }
    }
  ' | number_or_empty)
  physmem_line=$(printf '%s\n' "$top_snapshot" | awk '/^PhysMem:/ { print; exit }')
  mem_used=$(printf '%s\n' "$physmem_line" | sed -E 's/^PhysMem:[[:space:]]*([^ ]+)[[:space:]]+used.*/\1/' | memory_to_mb)
  mem_free=$(printf '%s\n' "$physmem_line" | sed -nE 's/.*[,[:space:]]([^ ]+)[[:space:]]+unused.*/\1/p' | memory_to_mb)

  load_avg=$(sysctl -n vm.loadavg 2>/dev/null | awk '
    { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+([.][0-9]+)?$/) printf "%s%s", (++n > 1 ? "," : ""), $i }
  ' || true)

  ps_snapshot=$(ps -Ao pid=,rss=,pcpu=,command= 2>/dev/null || true)
  proc_file=$(mktemp "${TMPDIR:-/tmp}/host-footprint-procs.XXXXXX" 2>/dev/null || true)
  if [[ -n $proc_file ]]; then
    printf '%s\n' "$ps_snapshot" | awk '
      /job-runner[.]ts/ && /(^|[ /])bun([[:space:]]|$)/ {
        role = ""
        if ($0 ~ /(^|[[:space:]])run-loop([[:space:]]|$)/) role = "run-loop"
        else if ($0 ~ /(^|[[:space:]])worker-task([[:space:]]|$)/) role = "worker"
        printf "%s\t%.6f\t%.6f\t%s\n", $1, $2 / 1024, $3, role
      }
    ' >"$proc_file" 2>/dev/null || true
  fi

  n_workers=$(printf '%s\n' "$ps_snapshot" | awk '/job-runner[.]ts/ && /(^|[ \/])bun([[:space:]]|$)/ && /(^|[[:space:]])worker-task([[:space:]]|$)/ { n++ } END { print n + 0 }' 2>/dev/null || true)
  n_bun_total=$(printf '%s\n' "$ps_snapshot" | awk '/(^|[ \/])bun([[:space:]]|$)/ { n++ } END { print n + 0 }' 2>/dev/null || true)

  tcp_conns=""
  if [[ -n $proc_file ]]; then
    pid_list=$(awk -F '\t' 'BEGIN { ORS="," } NF { print $1 }' "$proc_file" 2>/dev/null | sed 's/,$//')
    if [[ -n $pid_list ]] && command -v lsof >/dev/null 2>&1; then
      lsof_output=$(lsof -nP -iTCP -a -p "$pid_list" 2>/dev/null)
      lsof_status=$?
      if [[ $lsof_status -eq 0 ]]; then
        tcp_conns=$(printf '%s\n' "$lsof_output" | awk 'NR > 1 && NF { n++ } END { print n + 0 }')
      fi
    elif [[ -z $pid_list ]]; then
      tcp_conns=0
    fi
  fi

  interface=$(route -n get default 2>/dev/null | awk '/interface:/ { print $2; exit }' || true)
  net_values=""
  if [[ -n $interface ]]; then
    net_values=$(netstat -ibn 2>/dev/null | awk -v target="$interface" '
      /^Name[[:space:]]/ {
        for (i = 1; i <= NF; i++) {
          if ($i == "Ibytes") ibytes = i
          if ($i == "Obytes") obytes = i
        }
        next
      }
      $1 == target && ibytes && obytes && $ibytes ~ /^[0-9]+$/ && $obytes ~ /^[0-9]+$/ {
        print $ibytes "\t" $obytes
        exit
      }
    ' || true)
  fi
  net_in=$(printf '%s\n' "$net_values" | awk -F '\t' 'NF >= 2 { print $1; exit }')
  net_out=$(printf '%s\n' "$net_values" | awk -F '\t' 'NF >= 2 { print $2; exit }')

  SAMPLE_TS=$ts CPU_BUSY=$cpu_busy MEM_USED_MB=$mem_used MEM_FREE_MB=$mem_free \
    LOAD_AVG=$load_avg N_WORKERS=$n_workers N_BUN_TOTAL=$n_bun_total \
    TCP_CONNS=$tcp_conns NET_INTERFACE=$interface NET_BYTES_IN=$net_in \
    NET_BYTES_OUT=$net_out PROC_FILE=$proc_file python3 - <<'PY' >>"$out_file" 2>/dev/null || true
import json
import os


def number(name, integer=False):
    value = os.environ.get(name, "")
    try:
        return int(value) if integer else float(value)
    except (TypeError, ValueError):
        return None


loads = []
for value in os.environ.get("LOAD_AVG", "").split(","):
    try:
        loads.append(float(value))
    except ValueError:
        pass

processes = []
path = os.environ.get("PROC_FILE", "")
try:
    with open(path, encoding="utf-8") as stream:
        for line in stream:
            pid, rss, cpu, role = line.rstrip("\n").split("\t", 3)
            processes.append({
                "pid": int(pid),
                "rss_mb": float(rss),
                "cpu_pct": float(cpu),
                "role": role or None,
            })
except (OSError, ValueError):
    processes = []

sample = {
    "ts": os.environ.get("SAMPLE_TS") or None,
    "host": {
        "cpu_busy_pct": number("CPU_BUSY"),
        "memory": {
            "used_mb": number("MEM_USED_MB"),
            "free_mb": number("MEM_FREE_MB"),
        },
        "load_avg": loads or None,
    },
    "procs": processes,
    "counts": {
        "n_workers": number("N_WORKERS", integer=True),
        "n_bun_total": number("N_BUN_TOTAL", integer=True),
        "tcp_conns": number("TCP_CONNS", integer=True),
    },
    "net": {
        "interface": os.environ.get("NET_INTERFACE") or None,
        "bytes_in": number("NET_BYTES_IN", integer=True),
        "bytes_out": number("NET_BYTES_OUT", integer=True),
    },
}
print(json.dumps(sample, separators=(",", ":"), sort_keys=True))
PY

  [[ -n $proc_file ]] && rm -f "$proc_file"
  sleep "$interval" 2>/dev/null || sleep 1
done
