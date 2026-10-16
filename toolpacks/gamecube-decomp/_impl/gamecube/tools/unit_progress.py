#!/usr/bin/env python3
"""Unit progress and class owner units (SMS "decompile in order" rule).

objectives/sms-real-codegen/order-rule.md, "Definitions". Shared by the
steering gate (steering_check.py `decide`) and the sms_fidelity lints, which
load this file by path: standard library only, no sibling imports.

- Unit progress: `build/<ver>/report.json` per unit `measures.fuzzy_match_percent`
  and `matched_code_percent`; `objdiff.json` / report `metadata.source_path`
  says whether the unit has a source file. No source path or no measures ->
  progress 0 (asm only).
- Class owner unit: from the CodeWarrior link map (`mario.MAP`), the object
  holding the class's global vtable `__vt__<len><Class>`; else the object
  holding most of the class's (non-weak) member functions (`.text` rows and
  call-tree rows). Object -> unit through objdiff.json unit names/source
  paths. Templates and classes without map rows -> owner unknown (None).
- stub(unit): the unit's source is a blank stub. With both objects built:
  the base-compiled object (objdiff `base_path`) has no .text while the
  target object has code; otherwise no measures or fuzzy < MOSTLY_UNMATCHED_BELOW.
  (In SMS every unit has a source file, some one line long, so the source
  path alone says nothing.)
- decompiled(unit): not a stub and fuzzy >= ORDER_MATCH_MIN (50: the
  MarNameRefGen ordering check; 90 flags units that are clearly underway).
- mostly_unmatched(unit): a stub, no source, or fuzzy < MOSTLY_UNMATCHED_BELOW.

CLI (debug): unit_progress.py --repo R [--version V] [--class TKoopa ...] [--unit U ...]
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Optional

ORDER_MATCH_MIN = 50.0
MOSTLY_UNMATCHED_BELOW = 50.0
ORDER_GATED_PATHS = ["src/System/MarNameRefGen*.cpp"]  # SMS game policy: factories filled only in order

_TREE_RE = re.compile(r"^\s*\d+\]\s+(?P<name>\S+)\s+\((?P<kind>[^,()]+),(?P<scope>[^()]+)\)\s+found in\s+(?P<obj>.*?)\s*$")
_SECTION_RE = re.compile(r"^(?P<section>\S+) section layout\s*$")
_ROW_RE = re.compile(r"^\s+[0-9a-fA-F]{8}\s+[0-9a-fA-F]{6,8}\s+[0-9a-fA-F]{8}\s+(?:\d+\s+)?(?P<rest>.*)$")
_UNUSED_RE = re.compile(r"^\s+UNUSED\s+[0-9a-fA-F]{6,8}\s+\.+\s+(?P<rest>.*)$")


def is_order_gated(path: str, patterns: Iterable[str] = ORDER_GATED_PATHS) -> bool:
    return any(fnmatch.fnmatchcase(path, p) for p in patterns)


# --------------------------------------------------------------------------
# Units and progress
# --------------------------------------------------------------------------


_TEXT_SIZES: dict[tuple, Optional[int]] = {}


def text_size(path: Optional[str]) -> Optional[int]:
    """Total size of the executable sections of an ELF32 object (None: unreadable)."""
    if not path:
        return None
    try:
        st = os.stat(path)
    except OSError:
        return None
    key = (path, st.st_mtime_ns, st.st_size)
    if key in _TEXT_SIZES:
        return _TEXT_SIZES[key]
    size = None
    try:
        with open(path, "rb") as f:
            head = f.read(52)
            if len(head) == 52 and head[:4] == b"\x7fELF" and head[4] == 1:
                end = ">" if head[5] == 2 else "<"
                shoff, = struct.unpack_from(end + "I", head, 32)
                shentsize, shnum = struct.unpack_from(end + "HH", head, 46)
                f.seek(shoff)
                table = f.read(shentsize * shnum)
                size = 0
                for k in range(shnum):
                    _, typ, flags, _, _, sz = struct.unpack_from(end + "6I", table, k * shentsize)
                    if typ == 1 and flags & 0x4:  # SHT_PROGBITS, SHF_EXECINSTR
                        size += sz
    except (OSError, struct.error):
        size = None
    _TEXT_SIZES[key] = size
    return size


@dataclass(frozen=True)
class UnitInfo:
    name: str  # objdiff/report unit name, e.g. mario/Enemy/tinkoopa
    source_path: Optional[str]  # None: asm only
    fuzzy: Optional[float]  # measures.fuzzy_match_percent (None: no measures)
    matched_code: Optional[float]  # measures.matched_code_percent
    base_object: Optional[str] = None  # absolute paths (objdiff base_path / target_path), when known
    target_object: Optional[str] = None

    @property
    def has_source(self) -> bool:
        return bool(self.source_path)

    @property
    def progress(self) -> float:
        """fuzzy_match_percent; 0 without a source path or measures."""
        return float(self.fuzzy) if self.has_source and self.fuzzy is not None else 0.0

    @property
    def stub(self) -> bool:
        """The source is a blank stub: the base object has no code while the
        target has some; without both objects, no measures or fuzzy < 50."""
        base, target = text_size(self.base_object), text_size(self.target_object)
        if base is not None and target is not None:
            return base == 0 and target > 0
        return self.fuzzy is None or float(self.fuzzy) < MOSTLY_UNMATCHED_BELOW


def decompiled(unit: Optional[UnitInfo], min_percent: float = ORDER_MATCH_MIN) -> bool:
    return (unit is not None and unit.has_source and not unit.stub and unit.fuzzy is not None
            and float(unit.fuzzy) >= min_percent)


def mostly_unmatched(unit: Optional[UnitInfo], below: float = MOSTLY_UNMATCHED_BELOW) -> bool:
    return unit is not None and (not unit.has_source or unit.stub or unit.progress < below)


def _num(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def parse_units(report: Optional[dict], objdiff: Optional[dict], root: Optional[Path] = None) -> dict[str, UnitInfo]:
    """Unit name -> UnitInfo from report.json and objdiff.json (either may be
    None); objdiff object paths resolve against `root` for the stub test."""
    rows: dict[str, dict] = {}
    for u in (objdiff or {}).get("units") or []:
        if u.get("name"):
            row = rows.setdefault(u["name"], {})
            row["source"] = (u.get("metadata") or {}).get("source_path")
            if root is not None:
                for key, field in (("base_path", "base"), ("target_path", "target")):
                    if u.get(key):
                        row[field] = str(Path(root) / u[key])
    for u in (report or {}).get("units") or []:
        if not u.get("name"):
            continue
        row = rows.setdefault(u["name"], {})
        src = (u.get("metadata") or {}).get("source_path")
        if src and not row.get("source"):
            row["source"] = src
        m = u.get("measures") or {}
        row["fuzzy"] = _num(m.get("fuzzy_match_percent"))
        row["matched"] = _num(m.get("matched_code_percent"))
    return {n: UnitInfo(n, r.get("source") or None, r.get("fuzzy"), r.get("matched"), r.get("base"), r.get("target"))
            for n, r in rows.items()}


# --------------------------------------------------------------------------
# Link map: class -> object
# --------------------------------------------------------------------------


def _parse_name(s: str, i: int) -> tuple[Optional[str], int]:
    m = re.match(r"\d+", s[i:])
    if not m:
        return None, i
    n = int(m.group(0))
    j = i + len(m.group(0))
    if n <= 0 or j + n > len(s):
        return None, i
    return s[j:j + n], j + n


def _parse_qualified(s: str, i: int) -> tuple[Optional[str], int]:
    """`<len><Name>` or `Q<n>[_]<len><Name>...` at s[i:] -> (A::B, end)."""
    if i < len(s) and s[i] == "Q" and i + 1 < len(s) and s[i + 1].isdigit():
        count = int(s[i + 1])
        i += 2
        if i < len(s) and s[i] == "_":
            i += 1
        parts = []
        for _ in range(count):
            p, i2 = _parse_name(s, i)
            if p is None:
                return None, i
            parts.append(p)
            i = i2
        return "::".join(parts), i
    return _parse_name(s, i)


def class_of(mangled: str) -> Optional[str]:
    """Owning class of a CodeWarrior member symbol (`f__9TChuuHanaFv`,
    `__ct__Q26JDrama8TNameRefFv`, `__vt__9TTinKoopa`), else None."""
    for i in range(len(mangled) - 1):  # every `__`, overlapping (`name___22TClassFv`)
        if mangled[i:i + 2] != "__":
            continue
        j = i + 2
        if j >= len(mangled) or not (mangled[j].isdigit() or mangled[j] == "Q"):
            continue
        cls, k = _parse_qualified(mangled, j)
        if cls and (k == len(mangled) or mangled[k] in "FC"):
            return cls
    return None


def _split_rest(rest: str) -> tuple[str, str]:
    rest = rest.rstrip()
    if "\t" in rest:
        name, obj = rest.split("\t", 1)
        return name.strip(), obj.strip()
    parts = rest.split(None, 1)
    return parts[0], (parts[1].strip() if len(parts) > 1 else "")


@dataclass
class ClassIndex:
    vtables: dict[str, list[str]]  # class -> objects holding a global vtable
    weak_vtables: dict[str, list[str]]
    members: dict[str, dict[str, set[str]]]  # class -> object -> member function names
    special: set = None  # classes with a vtable, constructor, destructor or RTTI symbol

    def namespace_like(self, cls: str) -> bool:
        """Only free functions / statics under this scope (`GetValue__6JDramaFPCc`):
        CodeWarrior mangles namespace members like class members, so a scope
        with no vtable, constructor, destructor or RTTI is not treated as a class."""
        return cls not in (self.special or set())


def parse_map_classes(text: str) -> ClassIndex:
    vt: dict[str, list[str]] = {}
    weak_vt: dict[str, list[str]] = {}
    members: dict[str, dict[str, set[str]]] = {}
    scope: dict[str, str] = {}
    section: Optional[str] = None

    special: set[str] = set()

    def member(name: str, obj: str) -> None:
        cls = class_of(name)
        if cls and name.startswith(("__vt__", "__ct__", "__dt__", "__RTTI__", "__ti__")):
            special.add(cls)
        if cls and obj and not name.startswith("__vt__"):
            members.setdefault(cls, {}).setdefault(obj, set()).add(name)

    for line in text.splitlines():
        line = line.rstrip("\r")
        head = _SECTION_RE.match(line)
        if head:
            section = head.group("section")
            continue
        if line.startswith("Memory map:") or line.startswith("Linker generated symbols:"):
            section = None
            continue
        if section is None:
            node = _TREE_RE.match(line)
            if not node:
                continue
            name, kind, sc, obj = node.group("name"), node.group("kind").strip(), node.group("scope").strip(), node.group("obj")
            scope.setdefault(name, sc)
            if name.startswith(("__vt__", "__ct__", "__dt__", "__RTTI__", "__ti__")):
                c = class_of(name)
                if c:
                    special.add(c)
            if name.startswith("__vt__"):
                cls = class_of(name)
                target = (weak_vt if sc == "weak" else vt).setdefault(cls, []) if cls else None
                if target is not None and obj not in target:
                    target.append(obj)
            elif kind == "func" and sc != "weak":
                member(name, obj)
            continue
        m = _UNUSED_RE.match(line) or _ROW_RE.match(line)
        if not m or section != ".text":
            continue
        name, obj = _split_rest(m.group("rest"))
        if " (entry of " in name or scope.get(name) == "weak":
            continue
        member(name, obj)
    return ClassIndex(vt, weak_vt, members, special)


# --------------------------------------------------------------------------
# Progress over a repo
# --------------------------------------------------------------------------


class Progress:
    def __init__(self, units: dict[str, UnitInfo], classes: Optional[ClassIndex], has_report: bool = True):
        self.units = units
        self.classes = classes
        self.has_report = has_report
        self._by_file: dict[str, list[UnitInfo]] = {}
        for u in units.values():
            names = set()
            if u.source_path:
                names.add(PurePosixPath(u.source_path).name.lower())
            names.add(PurePosixPath(u.name).name.lower())
            for n in names:
                self._by_file.setdefault(n, []).append(u)

    # units ---------------------------------------------------------------
    def unit(self, name: str) -> Optional[UnitInfo]:
        if name in self.units:
            return self.units[name]
        for u in self.units.values():
            if u.source_path == name or u.name.endswith("/" + name):
                return u
        return None

    def unit_for_source(self, source: str) -> Optional[UnitInfo]:
        hits = [u for u in self.units.values() if u.source_path == source]
        return hits[0] if hits else None

    def object_unit(self, obj: str) -> Optional[UnitInfo]:
        """Map object (`Enemy.a tinkoopa.cpp`) -> unit, by file name, then by the library dir."""
        parts = obj.split()
        if not parts:
            return None
        fname = parts[-1].lower()
        stem = fname.rsplit(".", 1)[0]
        hits = list(self._by_file.get(fname, [])) or [u for u in self._by_file.get(stem, []) if not u.source_path]
        hits = list({u.name: u for u in hits}.values())
        if len(hits) > 1 and len(parts) > 1:
            lib = parts[0].lower().rsplit(".", 1)[0]
            narrowed = [u for u in hits if lib in {p.lower() for p in PurePosixPath(u.source_path or u.name).parts}]
            hits = narrowed or hits
        return hits[0] if len(hits) == 1 else None

    # classes -------------------------------------------------------------
    def _class_key(self, cls: str) -> Optional[str]:
        if self.classes is None:
            return None
        cls = re.sub(r"\s+", "", cls)
        known = {k for k in set(self.classes.vtables) | set(self.classes.members) | set(self.classes.weak_vtables)
                 if not self.classes.namespace_like(k)}
        if cls in known:
            return cls
        tail = [k for k in known if k.split("::")[-1] == cls.split("::")[-1]]
        return tail[0] if len(tail) == 1 else None

    def owner_object(self, cls: str) -> Optional[str]:
        if "<" in cls:
            return None  # templates: owner unknown
        key = self._class_key(cls)
        if key is None:
            return None
        objs = self.classes.vtables.get(key) or []
        if len(objs) == 1:
            return objs[0]
        counts = sorted(((len(v), o) for o, v in (self.classes.members.get(key) or {}).items()), reverse=True)
        if not counts or (len(counts) > 1 and counts[0][0] == counts[1][0]):
            return None
        return counts[0][1]

    def owner_unit(self, cls: str) -> Optional[UnitInfo]:
        obj = self.owner_object(cls)
        return self.object_unit(obj) if obj else None

    def decompiled(self, unit: Optional[UnitInfo], min_percent: float = ORDER_MATCH_MIN) -> bool:
        return decompiled(unit, min_percent)

    def mostly_unmatched(self, unit: Optional[UnitInfo], below: float = MOSTLY_UNMATCHED_BELOW) -> bool:
        return mostly_unmatched(unit, below)

    def describe(self, cls: str) -> dict:
        """{class, owner_unit, owner_progress, stub, decompiled, mostly_unmatched, known}"""
        u = self.owner_unit(cls)
        return {"class": cls, "owner_unit": u.name if u else None, "owner_progress": round(u.progress, 4) if u else None,
                "stub": u.stub if u else None, "decompiled": decompiled(u), "mostly_unmatched": mostly_unmatched(u),
                "known": u is not None}


def detect_version(repo: Path) -> Optional[str]:
    build = repo / "build"
    found = sorted(p.parent.name for p in build.glob("*/report.json")) if build.is_dir() else []
    if found:
        return found[0]
    cfg = sorted(p.name for p in (repo / "config").glob("*") if (p / "symbols.txt").is_file()) if (repo / "config").is_dir() else []
    return cfg[0] if cfg else None


def expected_map_path(repo: Path | str, version: str) -> str:
    """Where the original link map is expected (SMS: orig/<ver>/files/mario.MAP)."""
    name = "mario.MAP" if str(version).startswith("GMS") else "<game>.MAP"
    return f"{Path(repo)}/orig/{version}/files/{name}"


def missing_map_message(repo: Path | str, version: str) -> str:
    return (f"link map missing: expected {expected_map_path(repo, version)} (the original CodeWarrior map; "
            "it is not in git: copy it into the checkout)")


def find_map(repo: Path, version: str) -> Optional[Path]:
    for pattern in ("orig/{v}/files/*.MAP", "orig/{v}/files/*.map", "orig/{v}/*.MAP", "orig/{v}/*.map"):
        found = sorted(repo.glob(pattern.format(v=version)))
        if found:
            return found[0]
    return None


_CACHE: dict[tuple, Any] = {}


def _read_json(path: Path) -> Optional[dict]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def map_classes(path: Path) -> ClassIndex:
    st = path.stat()
    key = ("map", str(path.resolve()), st.st_mtime_ns, st.st_size)
    if key not in _CACHE:
        _CACHE[key] = parse_map_classes(path.read_text(encoding="utf-8", errors="replace"))
    return _CACHE[key]


def map_classes_text(text: str, key: str) -> ClassIndex:
    k = ("maptext", key)
    if k not in _CACHE:
        _CACHE[k] = parse_map_classes(text)
    return _CACHE[k]


def load(repo: Path | str, version: Optional[str] = None, *, map_text: Optional[str] = None,
         map_key: Optional[str] = None, report: Optional[dict] = None, objdiff: Optional[dict] = None) -> Optional[Progress]:
    """Progress for a checkout: report.json + objdiff.json + the link map
    (`map_text` overrides the checkout's map, e.g. read at a base rev).
    None when there is no report.json (unbuilt checkout, or a game without one)."""
    repo = Path(repo)
    version = version or detect_version(repo)
    if report is None and version:
        report = _read_json(repo / "build" / version / "report.json")
    if report is None:
        return None
    if objdiff is None:
        objdiff = _read_json(repo / "objdiff.json")
    classes = None
    if map_text is not None:
        classes = map_classes_text(map_text, map_key or str(hash(map_text)))
    elif version:
        path = find_map(repo, version)
        classes = map_classes(path) if path else None
    return Progress(parse_units(report, objdiff, repo), classes)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--repo", default=os.environ.get("ORCH_GAME_REPO_ROOT", "."))
    ap.add_argument("--version")
    ap.add_argument("--class", dest="classes", nargs="*", default=[])
    ap.add_argument("--unit", nargs="*", default=[])
    args = ap.parse_args(argv)
    prog = load(args.repo, args.version)
    if prog is None:
        print(json.dumps({"available": False, "reason": "no build/<ver>/report.json"}))
        return 0
    out = {"available": True, "map": prog.classes is not None,
           "classes": [prog.describe(c) for c in args.classes],
           "units": [{"unit": u, "progress": (prog.unit(u).progress if prog.unit(u) else None),
                      "decompiled": decompiled(prog.unit(u)), "mostly_unmatched": mostly_unmatched(prog.unit(u))}
                     for u in args.unit]}
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
