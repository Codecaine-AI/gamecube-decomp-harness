"""Builds the scale classifier's sample from a real traced compile (sms 1.2.5n OSReport):
the decisions document the real build_decisions writes, the capture envelope snapshot.run_native
returns (same keys), and the compare_sources stdout result (decision_diff of the document with itself)."""
import json, sys
from pathlib import Path
api = Path(sys.argv[1]); trace_path = Path(sys.argv[2]); out = Path(sys.argv[3])
sys.path.insert(0, str(api))
from decisions import build_decisions, decision_diff
from native_trace import load_trace
trace = load_trace(trace_path)
fn = trace.select("OSReport")
stock = {"path": "build/compilers/GC/1.2.5n/mwcceppc.exe", "sha1": "0" * 40, "sha256": "0" * 64, "label": "GC/1.2.5n"}
points = ("vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame")
doc, _ = build_decisions(fn, unit="libs/dolphin/src/os/OSError.c", version="1.2.5n", stock=stock, available_points=points,
                         normalize=lambda p: p.split("/checkout/")[-1])
out_dir = "build/mwcc_alloc/native/OSReport"
coloring = {cls: [{"pass": p["pass"], "nodes": len(p["nodes"]), "spilled": sum(1 for n in p["nodes"] if n["spilled"]),
                   "available_colors": p["available_colors"]} for p in passes] for cls, passes in doc["coloring"].items()}
envelope = {
    "backend": "native", "capture": "decisions", "unit": "os/OSError", "requested_function": "OSReport",
    "version": "1.2.5n", "provenance": {"backend": "native", "version": "1.2.5n"}, "compile_seconds": 1.2,
    "status": "ok", "format": "mwcc-alloc-native-capture-v1", "function": fn.fn, "display": fn.display,
    "traced_object_matches_stock": True, "available_points": doc["available_points"], "unavailable_points": doc["unavailable_points"],
    "out_dir": out_dir,
    "files": [{"path": f"{out_dir}/trace.jsonl", "kind": "trace"}, {"path": f"{out_dir}/capture.o", "kind": "compiled_object"},
              {"path": f"{out_dir}/decisions.json", "kind": "decisions"}],
    "replay": [],
    "decisions_summary": {"vregs": len(doc["vregs"]), "inlines": len(doc["inlines"]), "cse": len(doc["cse"]),
                          "frame_slots": len(doc["frame_slots"]), "coloring": coloring},
    "duration_seconds": 1.5,
}
diff = decision_diff(doc, doc)
diff["stock"] = {"a_obj_sha": "a" * 64, "b_obj_sha": "a" * 64, "code_class": "identical"}
base = {"schema": "mwcc-decision-diff-v1", "backend": "native", "unit": "os/OSError", "requested_function": "OSReport", "a": "@base", "b": "@worktree",
        "version": "1.2.5n", "provenance": {"backend": "native", "version": "1.2.5n"}}
full = {**base, **diff, "status": "ok", "traced_object_matches_stock": True}
compare = {**full, "full_report": "build/mwcc_alloc/compare/OSReport/decision-diff.json", "compile_seconds": {"a": 1.0, "b": 1.0},
           "duration_seconds": 2.1, "changes_truncated": False}
out.write_text(json.dumps({"source": "sms 1.2.5n OSReport trace (/tmp/wcl-native/samples/sms-1.2.5n-OSReport.jsonl) through mwcc_alloc/api decisions.py",
                           "capture_envelope": envelope, "decisions_document": doc, "compare_sources_result": compare,
                           "compare_sources_full_report": full}, indent=1) + "\n")
print(doc["schema"], len(doc["vregs"]), diff.get("schema"), len(diff.get("changes", [])))
