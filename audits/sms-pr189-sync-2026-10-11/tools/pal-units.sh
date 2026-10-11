set -e
# Inside the Daytona sandbox, cwd = merged tree (GMSJ01 configured by the worker).
# Compile the listed units for GMSP01 in 3 trees: merged (HEAD), ours (OURS), upstream (UP),
# using the GMSJ01 ninja commands retargeted to GMSP01, then compare per function.
R=$(pwd)
OURS=__OURS__; UP=__UP__; UNITS="__UNITS__"
OD=$(ls build/binutils/*objdump | head -1)
OBJS=""; for u in $UNITS; do OBJS="$OBJS build/GMSJ01/${u%.cpp}.o"; done
ninja -t commands $OBJS | grep -F mwcceppc > /tmp/jp.txt
echo "jp commands: $(wc -l < /tmp/jp.txt)"
git worktree add --detach /tmp/v-ours $OURS >/dev/null 2>&1
git worktree add --detach /tmp/v-up $UP >/dev/null 2>&1
for w in /tmp/v-ours /tmp/v-up; do mkdir -p "$w/build"; for d in compilers tools binutils; do ln -s "$R/build/$d" "$w/build/$d"; done; done
mkdir -p /tmp/objs
for VER in __VERSIONS__; do case $VER in GMSJ01) BV=0;; GMSP01) BV=1;; esac
for pair in "$R:merged" "/tmp/v-ours:ours" "/tmp/v-up:up"; do
  root=${pair%%:*}; name=${pair##*:}-$VER
  sed -e "s#$R/#$root/#g" -e "s#$R\"#$root\"#g" -e "s/GMSJ01/X$VER/g" -e "s/XGMS/GMS/g" -e "s/-DBUILD_VERSION=0/-DBUILD_VERSION=$BV/g" /tmp/jp.txt > /tmp/cmds-$name.txt
  ( cd "$root"; for u in $UNITS; do mkdir -p "build/$VER/$(dirname $u)"; done; mkdir -p build/$VER/include
    n=0; while IFS= read -r line; do n=$((n+1)); sh -c "$line" > /tmp/objs/$name-$n.log 2>&1 || echo "COMPILE FAILED $name line $n: $(grep -m3 -E 'Error|error' /tmp/objs/$name-$n.log | tr '\n' ' ')"; done < /tmp/cmds-$name.txt )
  for u in $UNITS; do o="$root/build/$VER/${u%.cpp}.o"; [ -f "$o" ] && "$OD" -dr "$o" > "/tmp/objs/$name.$(echo $u | tr / _).dis" || echo "MISSING $name $u"; done
done
done
for VER in __VERSIONS__; do echo "#### $VER"; python3 - "$UNITS" "$VER" <<'PY'
import re, sys, collections
units = sys.argv[1].split(); VER = sys.argv[2]
def fns(path):
    out, cur = collections.OrderedDict(), None
    try: lines = open(path).read().splitlines()
    except FileNotFoundError: return None
    for l in lines:
        m = re.match(r'^[0-9a-f]+ <(.+)>:$', l)
        if m: cur = m.group(1); out[cur] = []; continue
        if cur is None: continue
        m = re.match(r'^\s+[0-9a-f]+:\s+((?:[0-9a-f]{2} ){4})', l)
        if m: out[cur].append(m.group(1).strip()); continue
        m = re.match(r'^\s+[0-9a-f]+: (R_\S+)\s+(\S+)', l)
        if m: out[cur].append(m.group(1) + " " + re.sub(r'\$\d+', '$N', re.sub(r'@\d+', '@N', m.group(2))))
    return out
tot = collections.Counter()
for u in units:
    k = u.replace('/', '_')
    M, O, U = (fns(f'/tmp/objs/{n}-{VER}.{k}.dis') for n in ('merged', 'ours', 'up'))
    if M is None: print(f"UNIT {u}: merged object missing"); continue
    c = collections.Counter(); neither = []
    for f, body in M.items():
        o = O.get(f) if O else None; up = U.get(f) if U else None
        if up is not None and body == up and o is not None and body == o: c['same_all'] += 1
        elif up is not None and body == up: c['eq_up'] += 1
        elif o is not None and body == o: c['eq_ours'] += 1
        else:
            c['neither'] += 1; neither.append((f, len(body), None if o is None else len(o), None if up is None else len(up)))
            import difflib
            for refname, ref in (('ours', o), ('up', up)):
                if ref is not None:
                    d = [x for x in difflib.unified_diff(ref, body, refname, 'merged', n=0, lineterm='') if not x.startswith(('---','+++','@@'))]
                    print(f"   DIFF-vs-{refname} {f}: {len(d)} lines: " + " | ".join(d[:4]))
    tot.update(c)
    print(f"UNIT {u}: " + " ".join(f"{a}={b}" for a, b in sorted(c.items())))
    for f, lm, lo, lu in neither: print(f"   NEITHER {f} merged={lm} ours={lo} up={lu}")
print("TOTAL " + " ".join(f"{a}={b}" for a, b in sorted(tot.items())))
PY
done
