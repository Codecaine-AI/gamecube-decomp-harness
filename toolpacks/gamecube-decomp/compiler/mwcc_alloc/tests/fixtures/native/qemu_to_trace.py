#!/usr/bin/env python3
"""Turn real qemu coloring captures into the allocator events of mwcc-trace-v1.

Fixture generator, not a tool. The qemu reader recorded the compiler's real
interference graphs, pop orders and colors (mnSnap function 0021: GPR passes
1-3 with spills, FPR pass 1). This writes the events the traced compiler emits
for the same decisions: `node` (vregs >= 32 only; precolored nodes are left for
the reader to synthesize), `coalesce`, `push` in removal order, `color` with
pop order, `spill` and `commit`. No vreg identity: those come from real traces.

    qemu_to_trace.py CAPTURE_DIR INDEX OUT.jsonl.gz
"""

import gzip
import json
import sys
from pathlib import Path

CLASSES = {0: "gpr", 1: "fpr"}


def main() -> None:
    capture, index, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    fn = "mnSnap_capture_" + index
    events = [{"v": 1, "fn": fn, "pass": 0, "cls": "-", "ev": "function", "name": fn, "display": fn}]
    for before_path in sorted(capture.glob(f"coloring-{index}-*-before.json")):
        before = json.loads(before_path.read_text())
        after = json.loads(before_path.with_name(before_path.name.replace("before", "after")).read_text())
        cls = CLASSES[before["register_class"]]
        attempt = int(before_path.name.split("-")[3])
        head = {"v": 1, "fn": fn, "pass": attempt, "cls": cls}
        colors = {n["virtual_register"]: n for n in after["nodes"]}
        for node in before["nodes"]:
            vreg = node["virtual_register"]
            if vreg < 32:
                continue
            events.append({**head, "ev": "node", "vreg": vreg, "degree": len(node["neighbors"]),
                           "neighbors": node["neighbors"], "coalesced": bool(node["flags"] & 4),
                           "spill_cost": node["spill_cost"]})
            if node["flags"] & 4:
                events.append({**head, "ev": "coalesce", "a": vreg, "b": node["physical_register"], "reason": "copy"})
        for sweep, vreg in enumerate(reversed(before["simplify_order"])):
            events.append({**head, "ev": "push", "vreg": vreg, "sweep": sweep, "stalled": False})
        for order, vreg in enumerate(before["simplify_order"]):
            color = colors[vreg]["physical_register"]
            if colors[vreg]["flags"] & 1:
                events.append({**head, "ev": "spill", "vreg": vreg})
                continue
            events.append({**head, "ev": "color", "vreg": vreg, "color": color, "order": order})
            events.append({**head, "ev": "commit", "vreg": vreg, "reg": ("r" if cls == "gpr" else "f") + str(color)})
    with gzip.open(out, "wt", encoding="utf-8") as stream:
        for event in events:
            stream.write(json.dumps(event, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
