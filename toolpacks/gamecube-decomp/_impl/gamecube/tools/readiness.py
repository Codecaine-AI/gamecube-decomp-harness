#!/usr/bin/env python3
"""Class and function readiness, bound to a revision (order-scope plan v3, section 1).

"Don't jump the fence": code that constructs or declares a class must wait
until the class's own unit is decompiled. Readiness is per class:

Static facts (TARGET objects `build/<ver>/obj/**.o` + the link map; fixed for a
game version, cached by target stamp + map hash):
- per function, references to class symbols with kinds `construct` (__ct__),
  `vtable` (__vt__), `rtti` (__RTTI__/__ti__), `destroy` (__dt__), `call`, `data`;
- class owner: the object that strongly defines the vtable (`vtable`); else
  the object with a strict majority of the class's strong member functions
  (`majority`); otherwise `ambiguous`; only weak definitions (templates,
  header-only classes) -> `weak_only` (shared); classes only the map knows
  (UNUSED/stripped members) use the map's members; nothing -> `absent`.

Revision facts (from `git show REV:path` of the owner unit's source, never
from build artifacts). "Defines" = an active definition (comments, `#if 0`
and other known-inactive branches stripped) whose qualified name and
parameter list match a symbol the owner's target object strongly defines:
- started(C): the owner source defines at least one strong member of C;
- construct(C): every strong constructor of C in the target is defined in
  the owner source -> ready; a strong one missing -> not_ready; constructors
  only weak or none -> shared. Header text never grants readiness.
- declare(C): started -> ready, else not_ready (shared for weak-only).
- precedent: a class a file already constructs (`new C`) at REV was accepted
  by humans there; for that file C is construct-ready (provenance `precedent`).
- unresolved: ambiguous or absent owner, or an owner unit without a source path.

Function readiness at REV: unmet(f) = classes C with construct/vtable/rtti
references from f's target code, owner(C) != unit(f), construct(C) == not_ready;
unresolved(f) likewise for unresolved classes. Calls, destroys and data
references never count.

CLI:
  readiness.py index --repo R --rev REV [--version V] [--policy-json JSON] [--cache-dir D] --json
  readiness.py class --repo R --rev REV CLASS... [--json]
Exit 0 on success, 2 on ReadinessError (stderr JSON {"error": kind, "detail": ...}).
"""

from __future__ import annotations

import argparse
import bisect
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Iterable, Optional

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import stack_compare as sc  # noqa: E402
import unit_progress  # noqa: E402

STATIC_VERSION = 6
REV_VERSION = 8
STB_LOCAL, STB_GLOBAL, STB_WEAK = 0, 1, 2
SHN_COMMON = 0xFFF2
STT_OBJECT, STT_FUNC = 1, 2
SPECIAL = (("__ct__", "construct"), ("__dt__", "destroy"), ("__vt__", "vtable"), ("__RTTI__", "rtti"), ("__ti__", "rtti"))
GATING_KINDS = ("construct", "vtable", "rtti")
ERROR_KINDS = ("missing_objects", "missing_map", "bad_rev", "timeout", "malformed")


class ReadinessError(Exception):
    def __init__(self, kind: str, detail: str):
        assert kind in ERROR_KINDS, kind
        super().__init__(f"{kind}: {detail}")
        self.kind = kind
        self.detail = detail

    def to_json(self) -> dict:
        return {"error": self.kind, "detail": self.detail}


def kind_of(name: str, is_func: bool) -> tuple[str, Optional[str]]:
    cls = unit_progress.class_of(name)
    if cls is None:
        return ("call" if is_func else "data"), None
    for prefix, kind in SPECIAL:
        if name.startswith(prefix):
            return kind, cls
    return ("call" if is_func else "data"), cls


def default_cache_dir() -> Path:
    for env in ("ORCH_READINESS_CACHE",):
        if os.environ.get(env):
            return Path(os.environ[env])
    if os.environ.get("ORCH_GAME_STATE_DIR"):
        return Path(os.environ["ORCH_GAME_STATE_DIR"]) / "cache" / "readiness"
    return Path(tempfile.gettempdir()) / "orch-readiness-cache"


def policy_hash(policy: Optional[dict]) -> str:
    return hashlib.sha256(json.dumps(policy or {}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# --------------------------------------------------------------------------
# Git
# --------------------------------------------------------------------------


class GitReader:
    """`git cat-file --batch` reader for REV:path blobs (one process)."""

    def __init__(self, repo: Path):
        self.repo = repo
        self.proc: Optional[subprocess.Popen] = None
        self.memo: dict[str, Optional[bytes]] = {}

    def show(self, rev: str, rel: str) -> Optional[bytes]:
        key = f"{rev}:{rel}"
        if key in self.memo:
            return self.memo[key]
        if self.proc is None:
            self.proc = subprocess.Popen(["git", "-C", str(self.repo), "cat-file", "--batch"],
                                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(key.encode() + b"\n")
        self.proc.stdin.flush()
        header = self.proc.stdout.readline().decode().split()
        data = None
        if len(header) == 3 and header[1] == "blob":
            size = int(header[2])
            data = self.proc.stdout.read(size)
            self.proc.stdout.read(1)
        self.memo[key] = data
        return data

    def close(self) -> None:
        if self.proc is not None:
            try:
                self.proc.stdin.close()  # type: ignore[union-attr]
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
            self.proc = None


def resolve_rev(repo: Path, rev: str) -> str:
    r = subprocess.run(["git", "-C", str(repo), "rev-parse", "--verify", "--quiet", f"{rev}^{{commit}}"],
                       capture_output=True)
    if r.returncode != 0:
        raise ReadinessError("bad_rev", f"{rev}: not a commit in {repo}")
    return r.stdout.decode().strip()


# --------------------------------------------------------------------------
# Active source text
# --------------------------------------------------------------------------

from preprocess import active_text, defines_from_flags, eval_condition  # noqa: E402,F401  (re-exported)


# --------------------------------------------------------------------------
# Static facts
# --------------------------------------------------------------------------


def _load_json(path: Path, kind: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as e:
        raise ReadinessError(kind, f"{path}: {e}")
    except ValueError as e:
        raise ReadinessError("malformed", f"{path}: {e}")


def target_stamp(repo: Path, units: list[dict]) -> str:
    h = hashlib.sha1()
    for u in sorted(units, key=lambda x: x["name"]):
        p = repo / u["target_path"]
        try:
            st = p.stat()
        except OSError:
            continue
        h.update(f"{u['target_path']}:{st.st_mtime_ns}:{st.st_size}\n".encode())
    return h.hexdigest()[:16]


def _function_refs(obj: sc.ElfObject) -> dict[str, list]:
    """Function name -> unique [kind, class, symbol] class references (code relocations)."""
    by_sec: dict[int, tuple[list[int], list]] = {}
    for fn in obj.functions:
        by_sec.setdefault(fn.section.index, ([], []))
    for idx in by_sec:
        fl = sorted((f for f in obj.functions if f.section.index == idx), key=lambda f: f.start)
        by_sec[idx] = ([f.start for f in fl], fl)
    out: dict[str, list] = {fn.name: [] for fn in obj.functions}
    seen: set[tuple] = set()
    for sec in obj.sections:
        if not sec.relocs or not sec.is_exec:
            continue
        starts, fl = by_sec.get(sec.index, ([], []))
        for rel in sec.relocs:
            sym = rel.sym
            if not sym.name or sym.bind == STB_LOCAL:
                continue
            i = bisect.bisect_right(starts, rel.offset) - 1
            if i < 0 or rel.offset >= fl[i].start + fl[i].size:
                continue
            kind, cls = kind_of(sym.name, sym.type == STT_FUNC or sym.shndx == 0)
            if cls is None:
                continue
            key = (fl[i].name, kind, cls, sym.name)
            if key in seen:
                continue
            seen.add(key)
            out[fl[i].name].append([kind, cls, sym.name])
    return out


def build_static(repo: Path, version: str, units: list[dict], map_path: Path, deadline: Optional[float]) -> dict:
    defs: dict[str, list] = {}  # symbol -> [unit, bind, type]
    funcs: dict[str, dict[str, list]] = {}
    for u in units:
        if deadline and time.time() > deadline:
            raise ReadinessError("timeout", "building static facts")
        p = repo / u["target_path"]
        if not p.is_file():
            continue
        try:
            obj = sc.ElfObject.from_path(str(p))
        except (OSError, ValueError, Exception) as e:  # struct errors on truncated objects
            raise ReadinessError("malformed", f"{p}: {e}")
        name = u["name"]
        for s in obj.symbols:
            defined = 0 < s.shndx < sc.SHN_LORESERVE or s.shndx == SHN_COMMON
            if defined and s.bind in (STB_GLOBAL, STB_WEAK) and s.name:
                prev = defs.get(s.name)
                if prev is None or (prev[1] == STB_WEAK and s.bind == STB_GLOBAL):
                    defs[s.name] = [name, s.bind, s.type]
        funcs[name] = _function_refs(obj)
    if not funcs:
        raise ReadinessError("missing_objects", f"no target objects under {repo}/build/{version}/obj")
    classes: dict[str, dict] = {}
    for sym, (unit, bind, typ) in defs.items():
        kind, cls = kind_of(sym, typ == STT_FUNC)
        if cls is None:
            continue
        rec = classes.setdefault(cls, {"vtables": [], "ctors": [], "strong": {}, "weak": 0})
        if kind == "vtable":
            rec["vtables"].append([sym, unit, bind])
        if kind == "construct":
            rec["ctors"].append([sym, unit, bind])
        if bind == STB_GLOBAL and typ == STT_FUNC:
            rec["strong"].setdefault(unit, []).append(sym)
        elif bind == STB_WEAK:
            rec["weak"] += 1
    # the link map: UNUSED rows per unit, and member evidence for classes the objects lack
    try:
        map_text = map_path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        raise ReadinessError("missing_map", f"{map_path}: {e}")
    unused: dict[str, list[str]] = {}
    index = unit_progress.parse_map_classes(map_text)
    prog = unit_progress.Progress({u["name"]: unit_progress.UnitInfo(u["name"], u.get("source"), None, None)
                                   for u in units}, index)
    for line in map_text.splitlines():
        m = unit_progress._UNUSED_RE.match(line.rstrip("\r"))
        if not m:
            continue
        sym, obj = unit_progress._split_rest(m.group("rest"))
        u = prog.object_unit(obj)
        if u is not None:
            unused.setdefault(u.name, []).append(sym)
    map_members: dict[str, dict[str, int]] = {}
    for cls, objs in index.members.items():
        if cls in classes:
            continue
        counts: dict[str, int] = {}
        for obj, names in objs.items():
            u = prog.object_unit(obj)
            if u is not None:
                counts[u.name] = counts.get(u.name, 0) + len(names)
        if counts:
            map_members[cls] = counts
    # owners
    owners: dict[str, dict] = {}
    for cls, rec in classes.items():
        strong_vt = sorted({v[1] for v in rec["vtables"] if v[2] == STB_GLOBAL})
        counts = {u: len(s) for u, s in rec["strong"].items()}
        if len(strong_vt) == 1:
            owner, prov = strong_vt[0], "vtable"
        elif len(strong_vt) > 1:
            owner, prov = None, "ambiguous"
        elif counts:
            top = max(counts.values())
            leaders = [u for u, n in counts.items() if n == top]
            if len(leaders) == 1 and top * 2 > sum(counts.values()):
                owner, prov = leaders[0], "majority"
            else:
                owner, prov = None, "ambiguous"
        else:
            owner, prov = None, "weak_only"
        owners[cls] = {"owner": owner, "provenance": prov}
    for cls, counts in map_members.items():
        top = max(counts.values())
        leaders = [u for u, n in counts.items() if n == top]
        if len(leaders) == 1 and top * 2 > sum(counts.values()):
            owners[cls] = {"owner": leaders[0], "provenance": "majority", "map_only": True}
        else:
            owners[cls] = {"owner": None, "provenance": "ambiguous", "map_only": True}
    # demangled signatures of the owner's strong members and constructors
    import steering_check

    def sig(sym: str) -> list:
        d = steering_check.demangled_symbol(sym)
        return [sym, d["qualified"], d["params"]]

    special_syms = {cls for sym in defs for kind, cls in [kind_of(sym, True)]
                    if cls and kind in ("vtable", "construct", "destroy", "rtti")}
    for cls, o in owners.items():
        o["special"] = cls in special_syms or cls in (index.special or set())
        rec = classes.get(cls)
        if rec is None:
            o["members"], o["ctors"] = [], []
            continue
        o["members"] = [sig(s) for s in rec["strong"].get(o["owner"], [])] if o["owner"] else []
        o["ctors"] = [sig(c[0]) + [c[1]] for c in rec["ctors"] if c[2] == STB_GLOBAL]
        o["weak_ctors"] = sum(1 for c in rec["ctors"] if c[2] == STB_WEAK)
    return {"version": STATIC_VERSION, "owners": owners, "funcs": funcs, "unused": unused}


# --------------------------------------------------------------------------
# Readiness
# --------------------------------------------------------------------------


class Readiness:
    def __init__(self, repo: Path, rev: str, version: str, units: list[dict], static: dict, identity: dict,
                 policy: dict, rev_cache: Optional[Path], deadline: Optional[float] = None):
        self.repo = repo
        self.rev = rev
        self.version = version
        self.policy = policy
        self.identity = identity
        self.static = static
        self.owners: dict[str, dict] = static["owners"]
        self.funcs: dict[str, dict[str, list]] = static["funcs"]
        self.units = {u["name"]: u for u in units}
        self._by_source = {u["source"]: u["name"] for u in units if u.get("source")}
        self._tail: dict[str, list[str]] = {}
        for cls in self.owners:
            self._tail.setdefault(cls.split("::")[-1], []).append(cls)
        self._git = GitReader(repo)
        self._defs: dict[str, Optional[list]] = {}
        self._namespace_names: Optional[set[str]] = None
        self._type_index = None
        self._precedent: dict[str, set[str]] = {}
        self._states: dict[str, dict] = {}
        self._rev_cache = rev_cache
        self._deadline = deadline
        if rev_cache is not None and rev_cache.is_file():
            try:
                data = json.loads(rev_cache.read_text())
                if data.get("version") == REV_VERSION:
                    self._states = data["classes"]
            except (OSError, ValueError):
                self._states = {}
        self._dirty = False

    # identity / units -----------------------------------------------------
    def gated(self, path: str) -> bool:
        return any(fnmatch.fnmatchcase(path, p) for p in self.policy.get("gatedPaths") or [])

    def unit_for_source(self, path: str) -> Optional[str]:
        return self._by_source.get(path)

    def source_of(self, unit: str) -> Optional[str]:
        return (self.units.get(unit) or {}).get("source")

    def unused_symbols(self, unit: str) -> list[str]:
        return list(self.static["unused"].get(unit, []))

    def namespaces(self) -> set[str]:
        """Names declared `namespace X` anywhere in src/include/libs at rev."""
        if self._namespace_names is None:
            r = subprocess.run(["git", "-C", str(self.repo), "grep", "-h", "-o", "-E",
                                r"namespace[[:space:]]+[A-Za-z_][A-Za-z0-9_]*", self.rev, "--", "src", "include", "libs"],
                               capture_output=True)
            self._namespace_names = {line.split()[-1] for line in r.stdout.decode("utf-8", "replace").splitlines()
                                     if line.split()}
        return self._namespace_names

    def is_namespace(self, cls: str) -> bool:
        """A mangled scope with no vtable/ctor/dtor/RTTI that the source declares as a namespace
        (`GetValue__6JDramaFPCc`): CodeWarrior mangles namespace members like class members."""
        o = self.owners.get(cls)
        return o is not None and not o.get("special") and cls.split("::")[-1] in self.namespaces()

    def canonical(self, qualified: str) -> Optional[str]:
        q = re.sub(r"\s+", "", qualified)
        if q not in self.owners:
            hits = self._tail.get(q.split("::")[-1], []) if "::" not in q else []
            q = hits[0] if len(hits) == 1 else None
        return None if q is None or self.is_namespace(q) else q

    # revision facts ---------------------------------------------------------
    def source_defs(self, unit: str) -> Optional[list]:
        """[(qualified, params|None)] active definitions in the unit's source at rev (None: no source)."""
        if unit in self._defs:
            return self._defs[unit]
        src = self.source_of(unit)
        out = None
        if src:
            data = self._git.show(self.rev, src)
            out = [] if data is None else definitions(data.decode("utf-8", "replace"), self.defines_of(unit),
                                                       self.type_index(), src)
        self._defs[unit] = out
        return out

    def type_index(self):
        """signatures.TypeIndex of the repo at rev (typedefs, namespaces, classes) for exact signatures."""
        if self._type_index is None:
            import signatures

            self._type_index = signatures.TypeIndex.from_git(self.repo, self.rev)
        return self._type_index

    def unit_flags(self, unit: str) -> Optional[str]:
        """objdiff.json `scratch.c_flags` of the unit (certificate binding: `unit_flags_sha256`)."""
        u = self.units.get(unit)
        return None if u is None else (u.get("cflags") or None)

    def defines_of(self, unit: str) -> dict:
        """The unit's -D flags (objdiff scratch c_flags): known macros for #if evaluation."""
        return defines_from_flags((self.units.get(unit) or {}).get("cflags") or "")

    def _compute(self, cls: str, defs_for) -> dict:
        o = self.owners[cls]
        prov, owner = o["provenance"], o["owner"]
        if prov == "weak_only":
            return {"started": False, "construct": "shared", "declare": "shared"}
        if owner is None or not self.source_of(owner):
            return {"started": False, "construct": "unresolved", "declare": "unresolved"}
        defs = defs_for(owner) or []
        started = any(_defines(defs, m[0], m[1]) for m in o.get("members") or [])
        if o.get("map_only"):
            construct = "ready" if started else "not_ready"
        elif not o.get("ctors"):
            construct = "shared"  # constructors weak (inline) or none: no owner code needed
        else:
            ok = all(_defines(defs if c[3] == owner else (defs_for(c[3]) or []), c[0], c[1]) for c in o["ctors"])
            construct = "ready" if ok else "not_ready"
        return {"started": started, "construct": construct, "declare": "ready" if started else "not_ready"}

    def _state(self, cls: str) -> dict:
        if cls in self._states:
            return self._states[cls]
        if self._deadline and time.time() > self._deadline:
            raise ReadinessError("timeout", "evaluating class readiness")
        st = self._compute(cls, self.source_defs)
        self._states[cls] = st
        self._dirty = True
        return st

    def class_state_with_sources(self, qualified: str, texts: dict[str, Optional[str]]) -> dict:
        """class_state with the given source texts (path -> text, e.g. a PR's
        candidate owner source) instead of rev, under the same rules: the
        target's strong signatures must be defined by active code."""
        cls = self.canonical(qualified)
        if cls is None:
            return self.class_state(qualified)
        by_unit = {self.unit_for_source(p): (p, t) for p, t in texts.items() if self.unit_for_source(p)}
        index = self.type_index().with_texts({p: t for p, t in texts.items() if t is not None})

        def defs_for(unit: str):
            if unit in by_unit:
                p, t = by_unit[unit]
                return [] if t is None else definitions(t, self.defines_of(unit), index, p)
            return self.source_defs(unit)

        o = self.owners[cls]
        return {"class": cls, "owner_unit": o["owner"], "provenance": o["provenance"], **self._compute(cls, defs_for)}

    def precedent(self, path: Optional[str]) -> set[str]:
        """Classes the file already constructs (`new X`) at rev, canonical names included."""
        if not path:
            return set()
        if path not in self._precedent:
            data = self._git.show(self.rev, path)
            unit = self.unit_for_source(path)
            names = constructed_classes(data.decode("utf-8", "replace") if data is not None else None,
                                        self.defines_of(unit) if unit else None)
            # canonical class identity; a name without one is kept exactly as written
            self._precedent[path] = {self.canonical(n) or n for n in names}
        return self._precedent[path]

    def class_state(self, qualified: str, path: Optional[str] = None) -> dict:
        """Readiness of a class; with `path`, a class that file already constructs
        at rev is construct-ready by precedent (provenance `precedent`)."""
        cls = self.canonical(qualified)
        if cls is None:
            st = {"class": qualified, "owner_unit": None, "provenance": "absent", "started": False,
                  "construct": "unresolved", "declare": "unresolved"}
        else:
            o = self.owners[cls]
            st = {"class": cls, "owner_unit": o["owner"], "provenance": o["provenance"], **self._state(cls)}
        ident = cls or re.sub(r"\s+", "", qualified)
        if path and st["construct"] in ("not_ready", "unresolved") and ident in self.precedent(path):
            st = dict(st, construct="ready", provenance="precedent")
        return st

    def function(self, unit: str, symbol: str) -> dict:
        """Unmet / unresolved classes of a function at rev. Classes its own
        source file already constructs at rev are ready by precedent (listed
        under `precedent`)."""
        unmet, unresolved, precedent, seen = [], [], [], set()
        src = self.source_of(unit)
        for kind, cls, _sym in (self.funcs.get(unit) or {}).get(symbol, []):
            if kind not in GATING_KINDS or cls in seen:
                continue
            o = self.owners.get(cls)
            if o is not None and o["owner"] == unit:
                continue
            seen.add(cls)
            st = self.class_state(cls, src)
            row = {"class": cls, "owner_unit": st["owner_unit"], "kind": kind}
            if st["provenance"] == "precedent":
                precedent.append(dict(row, provenance="precedent"))
            elif st["construct"] == "not_ready":
                unmet.append(row)
            elif st["construct"] == "unresolved":
                unresolved.append(row)
        return {"unmet": unmet, "unresolved": unresolved, "precedent": precedent}

    def index(self) -> dict:
        functions, summary = {}, {"blocked": 0, "deferred": 0, "ready": 0, "unresolved_classes": 0}
        for unit in sorted(self.funcs):
            gated = self.gated(self.source_of(unit) or "")
            for sym in sorted(self.funcs[unit]):
                f = self.function(unit, sym)
                state = ("blocked" if gated and f["unmet"] else
                         "deferred" if f["unmet"] or f["unresolved"] else "ready")
                summary[state] += 1
                functions[f"{unit}::{sym}"] = {"state": state, **f}
        classes = {c: self.class_state(c) for c in sorted(self.owners) if not self.is_namespace(c)}
        summary["unresolved_classes"] = sum(1 for c in classes.values() if c["construct"] == "unresolved")
        summary["not_ready_classes"] = sum(1 for c in classes.values() if c["construct"] == "not_ready")
        self.save()
        return {"identity": self.identity, "functions": functions, "classes": classes, "summary": summary}

    def save(self) -> None:
        if self._rev_cache is None or not self._dirty:
            return
        try:
            self._rev_cache.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._rev_cache.with_suffix(".tmp")
            tmp.write_text(json.dumps({"version": REV_VERSION, "classes": self._states}, separators=(",", ":")))
            os.replace(tmp, self._rev_cache)
            self._dirty = False
        except OSError:
            pass

    def close(self) -> None:
        self.save()
        self._git.close()


def _defines(defs: list, mangled: str, qualified: Optional[str] = None) -> bool:
    """Does an active definition in `defs` define the target symbol `mangled`?
    Exact identity (signatures.matches over resolved types); undecidable is
    not a definition (no positive evidence). Macro-defined functions
    (`DEFINE_NERVE(T, A)` -> `T::execute`) match by qualified name."""
    import signatures
    import steering_check

    for d in defs:
        if isinstance(d, tuple):  # (macro-defined qualified name, None)
            dem = signatures.demangled_signature(mangled)
            if dem is not None and steering_check._qual_eq(d[0], dem[0]):
                return True
            continue
        if signatures.matches(d, mangled) is True:
            return True
    return False


def constructed_classes(text: Optional[str], defines: Optional[dict] = None) -> set[str]:
    """Classes an active `new X` / `new (place) X` constructs in `text`, matched
    over the whole token stream (an expression may span lines). Comments,
    literals and inactive or undecidable branches are ignored: this is
    positive evidence (precedent)."""
    if not text:
        return set()
    import steering_check

    return {r["class"] for r in steering_check.class_references(active_text(text, defines, unknown="inactive"))
            if r["via"] == "new"}


def signatures_index_for_test(texts: dict[str, str]):
    import signatures

    return signatures.TypeIndex.from_texts(texts)


def definitions(text: str, defines: Optional[dict] = None, index=None, path: str = "") -> list:
    """Active function definitions of a source text: signatures.SourceSignature rows
    (exact, resolved through `index`), plus `(qualified, None)` for functions
    defined by known macros (`DEFINE_NERVE`). Undecidable preprocessor
    branches do not count (positive evidence)."""
    import signatures
    import steering_edits as se

    act = active_text(text, defines, unknown="inactive")
    out: list = []
    for g in signatures.source_signatures(act, index, path):
        if g.qualified in se.DEFINING_MACROS:
            m = re.match(r"\s*\w+\s*\(([^)]*)\)", act[g.start:g.open])
            args = [a.strip() for a in m.group(1).split(",")] if m else []
            if args:
                out.append((se.DEFINING_MACROS[g.qualified].format(*args), None))
            continue
        out.append(g)
    return out


def load(repo: Path | str, rev: str, *, version: Optional[str] = None, policy: Optional[dict] = None,
         cache_dir: Optional[Path | str] = None, timeout: Optional[float] = None) -> Readiness:
    repo = Path(repo).resolve()
    deadline = time.time() + timeout if timeout else None
    policy = dict(policy or {"gatedPaths": []})
    full_rev = resolve_rev(repo, rev)
    objdiff = repo / "objdiff.json"
    if not objdiff.is_file():
        raise ReadinessError("missing_objects", f"{objdiff}: missing (run configure.py)")
    raw = _load_json(objdiff, "missing_objects")
    units = []
    for u in raw.get("units") or []:
        if u.get("name") and u.get("target_path"):
            units.append({"name": u["name"], "target_path": u["target_path"], "base_path": u.get("base_path"),
                          "source": (u.get("metadata") or {}).get("source_path"),
                          "cflags": (u.get("scratch") or {}).get("c_flags") or ""})
    version = version or _version_from_units(units) or unit_progress.detect_version(repo)
    if not version:
        raise ReadinessError("missing_objects", "cannot detect the build version")
    map_path = unit_progress.find_map(repo, version)
    if map_path is None:
        raise ReadinessError("missing_map", f"no link map under {repo}/orig/{version}")
    stamp = target_stamp(repo, units)
    if not any((repo / u["target_path"]).is_file() for u in units):
        raise ReadinessError("missing_objects", f"no target objects under {repo}/build/{version}/obj")
    map_sha = _sha(map_path.read_bytes())
    identity = {"repo": str(repo), "rev": full_rev, "version": version, "target_stamp": stamp,
                "map_sha": map_sha, "policy_hash": policy_hash(policy)}
    root = Path(cache_dir) if cache_dir else default_cache_dir()
    ns = hashlib.sha1(f"{repo}\0{version}".encode()).hexdigest()[:16]
    static_file = root / ns / f"static-{STATIC_VERSION}-{stamp}-{map_sha[:16]}.json"
    static = None
    if static_file.is_file():
        try:
            static = json.loads(static_file.read_text())
            if static.get("version") != STATIC_VERSION:
                static = None
        except (OSError, ValueError):
            static = None
    if static is None:
        static = build_static(repo, version, units, map_path, deadline)
        try:
            static_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = static_file.with_suffix(".tmp")
            tmp.write_text(json.dumps(static, separators=(",", ":")))
            os.replace(tmp, static_file)
        except OSError:
            pass
    rev_file = root / ns / f"rev-{REV_VERSION}-{stamp}-{map_sha[:16]}-{full_rev}-{identity['policy_hash']}.json"
    return Readiness(repo, full_rev, version, units, static, identity, policy, rev_file, deadline)


def _version_from_units(units: list[dict]) -> Optional[str]:
    for u in units:
        parts = u["target_path"].split("/")
        if len(parts) > 2 and parts[0] == "build":
            return parts[1]
    return None


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="command", required=True)
    for name in ("index", "class"):
        p = sub.add_parser(name)
        p.add_argument("--repo", required=True)
        p.add_argument("--rev", required=True)
        p.add_argument("--version")
        p.add_argument("--policy-json")
        p.add_argument("--cache-dir")
        p.add_argument("--timeout", type=float)
        p.add_argument("--json", action="store_true")
        if name == "class":
            p.add_argument("classes", nargs="+")
    args = ap.parse_args(argv)
    try:
        policy = json.loads(args.policy_json) if args.policy_json else None
    except ValueError as e:
        sys.stderr.write(json.dumps({"error": "malformed", "detail": f"--policy-json: {e}"}) + "\n")
        return 2
    try:
        r = load(Path(args.repo), args.rev, version=args.version, policy=policy, cache_dir=args.cache_dir,
                 timeout=args.timeout)
        try:
            if args.command == "index":
                payload = r.index()
                human = [json.dumps(payload["identity"]), json.dumps(payload["summary"])]
            else:
                payload = {"identity": r.identity, "classes": [r.class_state(c) for c in args.classes]}
                human = [json.dumps(c) for c in payload["classes"]]
        finally:
            r.close()
    except ReadinessError as e:
        sys.stderr.write(json.dumps(e.to_json()) + "\n")
        return 2
    print(json.dumps(payload) if args.json else "\n".join(human))
    return 0


if __name__ == "__main__":
    sys.exit(main())
