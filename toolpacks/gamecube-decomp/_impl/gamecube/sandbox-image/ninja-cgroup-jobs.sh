#!/bin/sh
# Installed as /usr/local/bin/ninja, ahead of the real /usr/bin/ninja on PATH.
# Daytona sandboxes report host CPUs to nproc (48-64), so bare ninja would run
# ~50 jobs against a 1-4 core cgroup quota. Without an explicit -j, pass
# -j ceil(quota/period) from the cgroup CPU limit (v2, then v1), else -j 2.
for arg; do
  case $arg in -j*) exec /usr/bin/ninja "$@" ;; --) break ;; esac
done
quota= period=
if [ -r /sys/fs/cgroup/cpu.max ]; then
  read -r quota period < /sys/fs/cgroup/cpu.max
elif [ -r /sys/fs/cgroup/cpu/cpu.cfs_quota_us ]; then
  read -r quota < /sys/fs/cgroup/cpu/cpu.cfs_quota_us
  read -r period < /sys/fs/cgroup/cpu/cpu.cfs_period_us
fi
jobs=2
case $quota:$period in
  *[!0-9:]* | :* | *: | 0:* | *:0) ;;
  *) jobs=$(( (quota + period - 1) / period )) ;;
esac
exec /usr/bin/ninja -j "$jobs" "$@"
