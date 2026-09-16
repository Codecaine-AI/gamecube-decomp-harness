#!/usr/bin/env python3
"""Mechanical sweep of the ADDED lines of a diff for source-fidelity smells. Output is a starting point for reviewers, not a verdict.

Usage: sweep_patterns.py delta.diff [--top 12]
"""
import argparse, collections, re, sys

PATTERNS = {
    "volatile": r"\bvolatile\b",
    "goto_or_label": r"\bgoto\b|^\+\s*[A-Za-z_]\w*:\s*;?\s*$",
    "discarded_literal": r"^\+\s*\(void\)\s*[\"\d]|^\+\s*\"[^\"]*\"\s*;",
    "guard_predefine": r"^\+\s*#\s*define\s+\w+_(HPP|H)\b",
    "type_rename_define": r"^\+\s*#\s*define\s+T[A-Z]\w*\s+\w+",
    "extern_c": r'^\+\s*extern\s+"C"',
    "mangled_identifier": r"^\+[^/]*\b[A-Za-z_]\w*__(?:\d+|Q\d)\w*\s*[=;\[(]",
    "manual_vtable": r"__vt__|vtable_padding",
    "local_class_in_cpp": r"^\+\s*(class|struct)\s+\w+\s*(:\s*public\s+\w+)?\s*\{",
    "static_fn": r"^\+\s*static\s+(?!const\b)(?!inline\b)[\w:<>\*&\s]+\b\w+\s*\([^;]*\)\s*\{?\s*$",
    "static_inline": r"^\+\s*static\s+inline\b",
    "fn_pointer_local": r"^\+\s*[\w:<>]+\s*\(\s*\*\s*\w+\s*\)\s*\([^)]*\)\s*=",
    "cancelling_arith": r"-\s*-\s*[\w(]|\+\s*-\s*[\w(]|-\s*0\.0f\b",
    "discarded_strcmp": r"^\+\s*(strcmp|strlen|memcmp)\s*\([^;]*\)\s*;",
    "dummy_ident": r"\b(dummy|unused|padding|filler|trash)\w*",
    "member_index": r"&\w+->\w+;|\(&\w+\)\s*\[|\bunk\w*\[\d\]",
    "pragma": r"^\+\s*#\s*pragma\b",
    "asm_attr": r"\basm\b|__attribute__",
    "widened_matrix": r"\bMtx44\b",
    "static_const_data": r"^\+\s*static\s+const\s+[\w:<>\*]+\s+\w+(\[\])?\s*(\[\d*\])?\s*=",
    "fake_marker": r"(?i)fakematch|fabricat|// hack|to match\b",
    "todo": r"TODO",
    "intrinsic": r"\b__f(abs|abs|rsqrte|res|sqrt)\w*\s*\(",
    "self_alias": r"=\s*this\s*;",
    "one_element_array": r"\b\w+\[1\]\s*;",
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("diff")
    ap.add_argument("--top", type=int, default=12)
    a = ap.parse_args()
    cur = None
    hits = collections.defaultdict(lambda: collections.defaultdict(list))
    for line in open(a.diff, encoding="utf-8", errors="replace"):
        m = re.match(r"^diff --git a/(.+?) b/(.+)$", line)
        if m:
            cur = m.group(2)
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for k, p in PATTERNS.items():
            if re.search(p, line):
                hits[k][cur].append(line.rstrip()[:140])
    for k in PATTERNS:
        total = sum(len(v) for v in hits[k].values())
        print(f"## {k}: {total} hits in {len(hits[k])} files")
        for f, ls in sorted(hits[k].items(), key=lambda x: -len(x[1]))[: a.top]:
            print(f"   {len(ls):3d} {f}")
            for l in ls[:2]:
                print("        ", l)

if __name__ == "__main__":
    main()
