#!/usr/bin/env python3
"""Read-only search for real-code evidence: link map, headers, report, JSystem refs.

A steering edit changes how code is spelled; real evidence says what the
original code was. This tool looks only at facts that exist outside the
current attempt:

  map-calls --symbol S
      What S references in the original link map call tree (CodeWarrior
      `mario.MAP`): callee functions and data, plus the symbol that first
      referenced S. The map lists each symbol once, at its first reference,
      so callees already referenced elsewhere are not repeated under S.

  map-unit --unit U
      Every function the original link placed in U's `.text`, in link
      order, with scope (global | weak | local) and UNUSED rows (functions
      the original compiled but the linker stripped: inlines and weak
      helpers that really existed in this unit).

  inlines --type T [--member M]
      Inline member functions of T defined in headers under include/ and
      libs/*/include/ (class-body definitions and out-of-class inline or
      template definitions).

  usage --inline I [--unit U] [--min-percent 100] [--unverified-json F]
      Source functions whose body calls I (text match on the member name)
      and that already match at --min-percent in build/<ver>/report.json.
      Each sibling carries `certification` (certified | unverified |
      ungated | unknown) and `revision`; `results` lists the matched ones
      (100% and certified or ungated), `hypotheses` the rest. Certification
      comes from the orchestrator's hold list at the sandbox revision
      (--unverified-json, else $ORCH_UNVERIFIED_MATCHES_JSON, else
      build/steering/unverified-matches.json in the checkout); without a
      valid list every sibling is `unknown` (a hypothesis) unless the gate is
      confirmed off (ORCH_STEERING_GATE, or game.json in ORCH_GAME_DIR).

  jsystem --query Q [--game tp|tww|all]
      Literal search over the pinned Twilight Princess / Wind Waker JSystem
      sources under --refs-root, else $ORCH_JSYSTEM_REFS_ROOT, else the
      sandbox image's /opt/refs/jsystem, else $ORCH_GAME_STATE_DIR/refs/jsystem
      (fetched by fetch_jsystem_refs.sh, commits in refs.lock.json).

  compiler --query Q [--path P] [--context N]
      Literal search over the pinned MWCC compiler source (rayanht/mwcc):
      /opt/mwcc in sandboxes, else <checkout>/../mwcc, else
      $ORCH_GAME_STATE_DIR/refs/mwcc (fetch_mwcc_ref.sh, commit in
      mwcc_ref.lock.json). file:line hits, src/ first, at most 5 per file
      unless --path narrows it to a file name, directory prefix or glob. See
      compiler_ref.py.

All subcommands take --json. Exit 0 = analysis produced (including
"unavailable" and "not found" answers), 2 = tool failure. --repo defaults to
$ORCH_GAME_HOST_REPO_ROOT, then $ORCH_GAME_REPO_ROOT. Parsed map and symbol
files are cached as JSON keyed by path, mtime and size under --cache-dir
(default $ORCH_EVIDENCE_CACHE_DIR, $ORCH_GAME_STATE_DIR/cache/evidence, or the
system temp dir); nothing is ever written into the repo.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

import project_layout  # noqa: E402
import compiler_ref  # noqa: E402

PARSER_VERSION = 1
DEMANGLER_PATH = TOOLS_DIR.parent / "m2c" / "m2c" / "demangle_codewarrior.py"
REFS_LOCK_PATH = TOOLS_DIR / "refs.lock.json"
FETCH_SCRIPT = TOOLS_DIR / "fetch_jsystem_refs.sh"
JSYSTEM_GAMES = ("tp", "tww")
SOURCE_SUFFIXES = (".h", ".hpp", ".hh", ".inc", ".inl", ".c", ".cpp", ".cp", ".cc")
HEADER_SUFFIXES = (".h", ".hpp", ".hh", ".inc", ".inl")
BODY_MAX_LINES = 40
MAP_NOTE = (
    "The CodeWarrior link map lists each symbol once, under the first function "
    "that referenced it; callees already referenced earlier in the link are not "
    "repeated here."
)


class EvidenceUnavailable(RuntimeError):
    """The data source a query needs is missing from this checkout."""


# --------------------------------------------------------------------------
# Demangling
# --------------------------------------------------------------------------

_DEMANGLER: Any = None


def _demangler() -> Any:
    global _DEMANGLER
    if _DEMANGLER is None:
        if not DEMANGLER_PATH.is_file():
            _DEMANGLER = False
            return _DEMANGLER
        # Load the file directly: the m2c package __init__ (and its types.py)
        # would shadow stdlib modules when added to sys.path.
        spec = importlib.util.spec_from_file_location("_evidence_cw_demangle", DEMANGLER_PATH)
        module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        sys.modules["_evidence_cw_demangle"] = module
        try:
            spec.loader.exec_module(module)  # type: ignore[union-attr]
            _DEMANGLER = module
        except Exception:  # pragma: no cover - only if the vendored file breaks
            _DEMANGLER = False
    return _DEMANGLER


def demangle(name: str) -> Tuple[str, str]:
    """Return (readable, qualified) for a CodeWarrior symbol.

    `qualified` is the scope-qualified name without parameters
    (`TNerveHanaSamboHide::execute`); both fall back to `name`.
    """
    module = _demangler()
    if not module or "__" not in name.lstrip("_@") and not name.startswith("__"):
        return name, name
    try:
        parsed = module.parse(name)
        qualified = str(parsed.name)
        type_text = str(parsed.type)
    except Exception:
        return name, name
    if "(" in type_text or "::" in qualified:
        readable = f"{qualified} {type_text}".strip() if "(" in type_text else qualified
        return readable, qualified
    # Data member `name__Class` demangles to name + class type.
    if re.fullmatch(r"[\w:<>, *&]+", type_text) and type_text:
        qualified = f"{type_text}::{qualified}"
        return qualified, qualified
    return name, name


def _strip_templates(text: str) -> str:
    out: List[str] = []
    depth = 0
    for ch in text:
        if ch == "<":
            depth += 1
        elif ch == ">" and depth:
            depth -= 1
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text)


TYPEDEF_SPELLINGS = {
    "f32": "float", "f64": "double", "s8": "char", "u8": "unsignedchar", "s16": "short",
    "u16": "unsignedshort", "s32": "long", "u32": "unsignedlong", "int": "long",
    "unsignedint": "unsignedlong", "f": "float", "d": "double", "l": "long",
}


def _canon_args(text: str) -> str:
    """Template argument text with common typedef spellings folded (f32 == float)."""
    return re.sub(r"[A-Za-z_]\w*", lambda m: TYPEDEF_SPELLINGS.get(m.group(0), m.group(0)), _norm(text))


# --------------------------------------------------------------------------
# Repo, version and cache
# --------------------------------------------------------------------------


def default_repo() -> Optional[Path]:
    for key in ("ORCH_GAME_HOST_REPO_ROOT", "ORCH_GAME_REPO_ROOT"):
        value = os.environ.get(key)
        if value:
            return Path(value).expanduser()
    return None


def detect_version(repo: Path) -> str:
    candidates = sorted(p.name for p in (repo / "config").glob("*") if (p / "symbols.txt").is_file())
    try:
        version = project_layout.get_project_layout(repo).version
    except Exception:
        version = None
    if version and (not candidates or version in candidates):
        return version
    if candidates:
        return candidates[0]
    return version or "GALE01"


def cache_dir(explicit: Optional[Path] = None) -> Path:
    if explicit is not None:
        return explicit
    if os.environ.get("ORCH_EVIDENCE_CACHE_DIR"):
        return Path(os.environ["ORCH_EVIDENCE_CACHE_DIR"])
    if os.environ.get("ORCH_GAME_STATE_DIR"):
        return Path(os.environ["ORCH_GAME_STATE_DIR"]) / "cache" / "evidence"
    return Path(tempfile.gettempdir()) / "orch-evidence-cache"


def _cached(kind: str, path: Path, parse, cache: Optional[Path]) -> Any:
    stat = path.stat()
    key = hashlib.sha1(
        f"{kind}:{PARSER_VERSION}:{path.resolve()}:{stat.st_mtime_ns}:{stat.st_size}".encode()
    ).hexdigest()
    root = cache_dir(cache)
    target = root / f"{kind}-{key}.json"
    if target.is_file():
        try:
            return json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    value = parse(path)
    try:
        root.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(root), prefix=f".{kind}-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, separators=(",", ":"))
        os.replace(tmp, target)
    except OSError:
        pass
    return value


# --------------------------------------------------------------------------
# symbols.txt
# --------------------------------------------------------------------------

SYMBOL_LINE_RE = re.compile(
    r"^\s*(?P<name>\S+)\s*=\s*(?P<section>[^:\s]+):0x(?P<addr>[0-9A-Fa-f]+);\s*//(?P<attrs>.*)$"
)


def parse_symbols_text(text: str) -> Dict[str, Dict[str, Any]]:
    symbols: Dict[str, Dict[str, Any]] = {}
    for line in text.splitlines():
        match = SYMBOL_LINE_RE.match(line)
        if not match:
            continue
        attrs = dict(
            part.split(":", 1) for part in match.group("attrs").split() if ":" in part
        )
        entry: Dict[str, Any] = {
            "section": match.group("section"),
            "address": int(match.group("addr"), 16),
            "type": attrs.get("type"),
            "scope": attrs.get("scope"),
        }
        if "size" in attrs:
            try:
                entry["size"] = int(attrs["size"], 0)
            except ValueError:
                pass
        symbols.setdefault(match.group("name"), entry)
    return symbols


def load_symbols(repo: Path, version: str, cache: Optional[Path] = None) -> Dict[str, Dict[str, Any]]:
    path = repo / "config" / version / "symbols.txt"
    if not path.is_file():
        return {}
    return _cached("symbols", path, lambda p: parse_symbols_text(p.read_text(encoding="utf-8", errors="replace")), cache)


# --------------------------------------------------------------------------
# CodeWarrior link map
# --------------------------------------------------------------------------

TREE_RE = re.compile(
    r"^\s*(?P<depth>\d+)\]\s+(?P<name>\S+)\s+"
    r"(?:\((?P<kind>[^,()]+),(?P<scope>[^()]+)\)\s+found in\s+(?P<object>.*?)|found as (?P<linker>linker generated symbol))\s*$"
)
SECTION_HEADER_RE = re.compile(r"^(?P<section>\S+) section layout\s*$")
SECTION_ROW_RE = re.compile(
    r"^\s+(?P<offset>[0-9a-fA-F]{8})\s+(?P<size>[0-9a-fA-F]{6,8})\s+(?P<vaddr>[0-9a-fA-F]{8})\s+(?:(?P<align>\d+)\s+)?(?P<rest>.*)$"
)
UNUSED_ROW_RE = re.compile(r"^\s+UNUSED\s+(?P<size>[0-9a-fA-F]{6,8})\s+\.+\s+(?P<rest>.*)$")


def _split_name_object(rest: str) -> Tuple[str, str]:
    """`name \\tlib file` (placed rows) or `name lib file` (UNUSED rows)."""
    rest = rest.rstrip()
    if "\t" in rest:
        name, obj = rest.split("\t", 1)
        return name.strip(), obj.strip()
    parts = rest.split(None, 1)
    return parts[0], (parts[1].strip() if len(parts) > 1 else "")


def parse_map_text(text: str) -> Dict[str, Any]:
    """Parse a CodeWarrior link map into call-tree nodes and section rows.

    tree:  [depth, name, kind, scope, object]
    rows:  [section, name, size, vaddr|None, object]   (vaddr None = UNUSED)
    """
    tree: List[List[Any]] = []
    rows: List[List[Any]] = []
    section: Optional[str] = None
    for line in text.splitlines():
        header = SECTION_HEADER_RE.match(line)
        if header:
            section = header.group("section")
            continue
        if line.startswith("Memory map:") or line.startswith("Linker generated symbols:"):
            section = None
            continue
        if section is None:
            if ">>>" in line:
                continue
            node = TREE_RE.match(line)
            if node:
                if node.group("linker"):
                    tree.append([int(node.group("depth")), node.group("name"), "linker", "global", ""])
                else:
                    tree.append([
                        int(node.group("depth")),
                        node.group("name"),
                        node.group("kind").strip(),
                        node.group("scope").strip(),
                        (node.group("object") or "").strip(),
                    ])
            continue
        unused = UNUSED_ROW_RE.match(line)
        if unused:
            name, obj = _split_name_object(unused.group("rest"))
            rows.append([section, name, int(unused.group("size"), 16), None, obj])
            continue
        row = SECTION_ROW_RE.match(line)
        if row:
            name, obj = _split_name_object(row.group("rest"))
            if " (entry of " in name:
                continue
            rows.append([section, name, int(row.group("size"), 16), int(row.group("vaddr"), 16), obj])
    readable: Dict[str, str] = {}
    qualified: Dict[str, str] = {}
    for name in {node[1] for node in tree} | {row[1] for row in rows}:
        full, short = demangle(name)
        if full != name:
            readable[name] = full
            qualified[name] = short
    return {"tree": tree, "rows": rows, "readable": readable, "qualified": qualified}


def find_map(repo: Path, version: str) -> Optional[Path]:
    for pattern in ("orig/{v}/files/*.MAP", "orig/{v}/files/*.map", "orig/{v}/*.MAP", "orig/{v}/*.map", "config/{v}/*.MAP"):
        found = sorted(repo.glob(pattern.format(v=version)))
        if found:
            return found[0]
    return None


class LinkMap:
    def __init__(self, data: Dict[str, Any], path: Path):
        self.path = path
        self.tree = data["tree"]
        self.rows = data["rows"]
        self.readable: Dict[str, str] = data.get("readable", {})
        self.qualified: Dict[str, str] = data.get("qualified", {})
        self.tree_index: Dict[str, int] = {}
        for index, node in enumerate(self.tree):
            self.tree_index.setdefault(node[1], index)
        self.text_rows: Dict[str, List[Any]] = {}
        for row in self.rows:
            if row[0] == ".text":
                self.text_rows.setdefault(row[1], row)

    def display(self, name: str) -> str:
        return self.readable.get(name, name)

    def scope(self, name: str) -> Optional[str]:
        index = self.tree_index.get(name)
        return self.tree[index][3] if index is not None else None

    def resolve(self, query: str) -> List[str]:
        """Mangled names matching a mangled, qualified or readable query."""
        query = query.strip()
        known = set(self.tree_index) | set(self.text_rows)
        if query in known:
            return [query]
        want = _norm(query)
        has_params = "(" in query
        if has_params:
            matches = [n for n in known if _norm(self.readable.get(n, "")) == want]
            if matches:
                return sorted(matches)
            want = _norm(query.split("(", 1)[0])
        matches = [n for n in known if _norm(self.qualified.get(n, n)) == want]
        if not matches:
            loose = _norm(_strip_templates(want))
            matches = [
                n for n in known
                if _norm(_strip_templates(self.qualified.get(n, n))) == loose
            ]
        if not matches and "::" not in want:
            # Bare member name: accept any scope.
            matches = [n for n in known if _strip_templates(self.qualified.get(n, n)).split("::")[-1] == want]
        return sorted(matches, key=lambda n: (n not in self.text_rows, n))

    def suggestions(self, query: str, limit: int = 8) -> List[str]:
        tail = _strip_templates(query.split("(", 1)[0]).split("::")[-1].strip().lower()
        if not tail:
            return []
        hits = sorted({self.display(n) for n in self.tree_index if tail in self.qualified.get(n, n).lower()})
        return hits[:limit]


def load_map(repo: Path, version: str, cache: Optional[Path] = None) -> Optional[LinkMap]:
    path = find_map(repo, version)
    if path is None:
        return None
    data = _cached("map", path, lambda p: parse_map_text(p.read_text(encoding="utf-8", errors="replace")), cache)
    return LinkMap(data, path)


def _repo_rel(repo: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(repo.resolve()).as_posix()
    except ValueError:
        return str(path)


def _unavailable_map(repo: Path, version: str, extra: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **extra,
        "available": False,
        "reason": f"no CodeWarrior link map under {repo}/orig/{version}/ (this game has no original .MAP)",
    }


def map_calls(repo: Path, symbol: str, version: Optional[str] = None, cache: Optional[Path] = None) -> Dict[str, Any]:
    repo = Path(repo)
    version = version or detect_version(repo)
    link = load_map(repo, version, cache)
    if link is None:
        return _unavailable_map(repo, version, {"symbol": symbol})
    matches = link.resolve(symbol)
    tree_matches = [m for m in matches if m in link.tree_index]
    if not tree_matches:
        return {
            "available": True,
            "found": False,
            "symbol": symbol,
            "map": _repo_rel(repo, link.path),
            "suggestions": link.suggestions(symbol),
        }
    name = tree_matches[0]
    index = link.tree_index[name]
    depth, _, kind, scope, obj = link.tree[index]
    callees: List[Dict[str, Any]] = []
    for node in link.tree[index + 1:]:
        if node[0] <= depth:
            break
        if node[0] == depth + 1:
            callees.append({
                "name": link.display(node[1]),
                "mangled": node[1],
                "kind": node[2],
                "scope": node[3],
                "object": node[4],
            })
    referenced_by = None
    for node in reversed(link.tree[:index]):
        if node[0] < depth:
            referenced_by = {"name": link.display(node[1]), "mangled": node[1], "object": node[4]}
            break
    row = link.text_rows.get(name)
    symbols = load_symbols(repo, version, cache)
    size = row[2] if row else symbols.get(name, {}).get("size")
    result: Dict[str, Any] = {
        "available": True,
        "found": True,
        "symbol": link.display(name),
        "mangled": name,
        "object": obj,
        "kind": kind,
        "scope": scope,
        "size": size,
        "address": f"0x{row[3]:08X}" if row and row[3] is not None else None,
        "callees": callees,
        "referenced_by": referenced_by,
        "map": _repo_rel(repo, link.path),
        "note": MAP_NOTE,
    }
    if len(tree_matches) > 1:
        result["other_matches"] = [link.display(m) for m in tree_matches[1:]]
    return result


def _map_objects_for_unit(repo: Path, link: LinkMap, unit: str) -> Tuple[str, List[str]]:
    """Return (unit label, map object strings) for a unit name, source path or map object."""
    objects = sorted({row[4] for row in link.rows if row[0] == ".text" and row[4]})
    query = unit.strip()
    if query in objects:
        return query, [query]
    label = query
    source = query
    try:
        layout = project_layout.get_project_layout(repo)
        wanted = query[2:] if query.startswith("./") else query
        for candidate in layout._units:  # noqa: SLF001 - read-only metadata
            names = {candidate.name, candidate.operational_name, candidate.source_path.as_posix(),
                     candidate.object_path.as_posix(), candidate.target_object_path.as_posix()}
            if wanted in names:
                label, source = candidate.name, candidate.source_path.as_posix()
                break
    except Exception:
        pass
    stem = Path(source).name
    if not Path(stem).suffix:
        hits = [o for o in objects if Path(o.split()[-1]).stem == stem]
    else:
        hits = [o for o in objects if o.split()[-1] == stem]
    if len(hits) > 1:
        parts = {p.lower() for p in Path(source).parts}
        narrowed = [o for o in hits if len(o.split()) > 1 and Path(o.split()[0]).stem.lower() in parts]
        if narrowed:
            hits = narrowed
    return label, hits


def map_unit(repo: Path, unit: str, version: Optional[str] = None, cache: Optional[Path] = None) -> Dict[str, Any]:
    repo = Path(repo)
    version = version or detect_version(repo)
    link = load_map(repo, version, cache)
    if link is None:
        return _unavailable_map(repo, version, {"unit": unit, "functions": []})
    label, objects = _map_objects_for_unit(repo, link, unit)
    if not objects:
        return {
            "available": True,
            "found": False,
            "unit": unit,
            "functions": [],
            "map": _repo_rel(repo, link.path),
        }
    symbols = load_symbols(repo, version, cache)
    functions: List[Dict[str, Any]] = []
    for section, name, size, vaddr, obj in link.rows:
        if section != ".text" or obj not in objects or name == ".text":
            continue
        scope = link.scope(name) or symbols.get(name, {}).get("scope") or "unknown"
        functions.append({
            "name": link.display(name),
            "mangled": name,
            "kind": scope,
            "unused": vaddr is None,
            "size": size,
            "address": f"0x{vaddr:08X}" if vaddr is not None else None,
        })
    return {
        "available": True,
        "found": True,
        "unit": label,
        "objects": objects,
        "functions": functions,
        "counts": {
            "functions": len(functions),
            "weak": sum(1 for f in functions if f["kind"] == "weak"),
            "local": sum(1 for f in functions if f["kind"] == "local"),
            "unused": sum(1 for f in functions if f["unused"]),
        },
        "map": _repo_rel(repo, link.path),
        "note": "UNUSED rows are functions the original compiled into this unit but the linker stripped (often inlines or weak helpers).",
    }


# --------------------------------------------------------------------------
# Light C++ scanning
# --------------------------------------------------------------------------


def strip_code(text: str) -> str:
    """Blank comments, string/char literal contents and preprocessor lines.

    Offsets and newlines are preserved so indices map back onto `text`.
    """
    out = list(text)
    i, n = 0, len(text)
    line_start = True
    while i < n:
        ch = text[i]
        if line_start and ch in " \t":
            i += 1
            continue
        if line_start and ch == "#":
            j = i
            while j < n:
                if text[j] == "\n" and text[j - 1] != "\\":
                    break
                if text[j] != "\n":
                    out[j] = " "
                j += 1
            i = j
            continue
        line_start = ch == "\n"
        if text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if text[k] != "\n":
                    out[k] = " "
            i = j
            continue
        if ch in "\"'":
            j = i + 1
            while j < n and text[j] != ch and text[j] != "\n":
                if text[j] == "\\":
                    out[j] = " "
                    j += 1
                if j < n and text[j] != "\n":
                    out[j] = " "
                j += 1
            i = j + 1
            continue
        i += 1
    return "".join(out)


def match_brace(code: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(code)):
        ch = code[index]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return index
    return len(code) - 1


def _match_paren(code: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(code)):
        if code[index] == "(":
            depth += 1
        elif code[index] == ")":
            depth -= 1
            if depth == 0:
                return index
    return -1


ACCESS_RE = re.compile(r"^\s*(?:(?:public|protected|private)\s*:(?!:)\s*)+")
OPERATOR_RE = re.compile(r"\boperator\s*(\(\s*\)|[^\s(][^(]*?)\s*\(")
NAME_BEFORE_PAREN_RE = re.compile(r"(~?[A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*$")
QUALIFIED_BEFORE_PAREN_RE = re.compile(
    r"((?:[A-Za-z_]\w*\s*(?:<[^()]*?>)?\s*::\s*)*(?:~?[A-Za-z_]\w*|operator\s*(?:\(\s*\)|[^\s(][^(]*?)))\s*$"
)
TYPE_KEYWORD_RE = re.compile(r"\b(class|struct|union|enum|namespace)\b")


def _function_name(decl: str) -> Optional[str]:
    """Unqualified name of the function declared by `decl` (text up to its body)."""
    paren = decl.find("(")
    if paren < 0:
        return None
    op = OPERATOR_RE.search(decl)
    if op and op.start() < paren + 1 + (2 if op.group(1).startswith("(") else 0):
        symbol = re.sub(r"\s+", " ", op.group(1)).strip()
        if symbol[0].isalpha() or symbol[0] == "_":
            return "operator " + symbol
        return "operator" + symbol.replace(" ", "")
    match = NAME_BEFORE_PAREN_RE.search(decl[:paren])
    return match.group(1) if match else None


def _line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def _body_excerpt(text: str, start: int, end: int) -> Tuple[str, bool]:
    lines = text[start:end + 1].strip("\n").splitlines()
    if len(lines) > BODY_MAX_LINES:
        return "\n".join(lines[:BODY_MAX_LINES] + ["    ..."]), True
    return "\n".join(lines), False


def _scope_ranges(code: str) -> List[Tuple[int, int, str]]:
    """(open, close, name) for every namespace and class/struct/union body."""
    ranges: List[Tuple[int, int, str]] = []
    for match in re.finditer(r"\b(namespace|class|struct|union)\s+([A-Za-z_]\w*)", code):
        index = match.end()
        while index < len(code) and code[index] not in "{;()=":
            index += 1
        if index < len(code) and code[index] == "{":
            ranges.append((index, match_brace(code, index), match.group(2)))
    return ranges


def _enclosing(ranges: List[Tuple[int, int, str]], offset: int) -> List[str]:
    return [name for start, end, name in ranges if start < offset <= end]


def _class_members(text: str, code: str, open_index: int, close_index: int) -> Iterable[Tuple[str, int, int]]:
    """Yield (name, start, close) for member functions defined in a class body."""
    index = open_index + 1
    stmt_start = index
    while index < close_index:
        ch = code[index]
        if ch == ";":
            stmt_start = index + 1
        elif ch == "{":
            end = match_brace(code, index)
            decl = code[stmt_start:index]
            access = ACCESS_RE.match(decl)
            decl_offset = stmt_start + (access.end() if access else 0)
            decl = code[decl_offset:index]
            keyword = TYPE_KEYWORD_RE.search(_strip_templates(decl))
            paren = decl.find("(")
            if paren >= 0 and not (keyword and keyword.start() < _strip_templates(decl).find("(")):
                name = _function_name(decl)
                if name:
                    start = decl_offset + (len(decl) - len(decl.lstrip()))
                    yield name, start, end
            index = end
            stmt_start = end + 1
        elif ch == ":" and ACCESS_RE.match(code[stmt_start:index + 1]):
            stmt_start = index + 1
        index += 1


def _iter_headers(repo: Path) -> Iterable[Path]:
    roots = [repo / "include"] + sorted((repo / "libs").glob("*/include"))
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix.lower() in HEADER_SUFFIXES and path.is_file():
                yield path


def _parse_type_query(type_name: str) -> Tuple[List[str], str, Optional[str]]:
    parts = [p.strip() for p in _split_scope(type_name.strip()) if p.strip()]
    if not parts:
        return [], "", None
    last = parts[-1]
    args = None
    if "<" in last:
        base, args = last.split("<", 1)
        last, args = base.strip(), "<" + args
    return parts[:-1], last, args


def _split_scope(text: str) -> List[str]:
    parts, depth, current = [], 0, ""
    index = 0
    while index < len(text):
        ch = text[index]
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        if depth == 0 and text.startswith("::", index):
            parts.append(current)
            current = ""
            index += 2
            continue
        current += ch
        index += 1
    parts.append(current)
    return parts


def _template_args_after(code: str, index: int) -> Tuple[str, int]:
    while index < len(code) and code[index] in " \t\n":
        index += 1
    if index >= len(code) or code[index] != "<":
        return "", index
    depth = 0
    start = index
    while index < len(code):
        if code[index] == "<":
            depth += 1
        elif code[index] == ">":
            depth -= 1
            if depth == 0:
                return re.sub(r"\s+", " ", code[start:index + 1]), index + 1
        elif code[index] in ";{":
            break
        index += 1
    return "", start


def inlines(repo: Path, type_name: str, member: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Inline member functions of `type_name` defined in repo headers."""
    repo = Path(repo)
    qualifiers, base, wanted_args = _parse_type_query(type_name)
    if not base:
        return []
    member_norm = re.sub(r"\s+", "", member) if member else None
    word = re.compile(rf"\b{re.escape(base)}\b")
    class_re = re.compile(rf"\b(class|struct|union)\s+{re.escape(base)}\b")
    out_of_class_re = re.compile(
        rf"\b{re.escape(base)}\s*(?:<[^;{{}}()]*>)?\s*::\s*(~?[A-Za-z_]\w*|operator\s*(?:\(\s*\)|[^\s(][^(]*?))\s*\("
    )
    results: List[Dict[str, Any]] = []
    for path in _iter_headers(repo):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if not word.search(text):
            continue
        code = strip_code(text)
        scopes = _scope_ranges(code)
        rel = _repo_rel(repo, path)
        for match in class_re.finditer(code):
            args, index = _template_args_after(code, match.end())
            if wanted_args and _canon_args(args) != _canon_args(wanted_args):
                continue
            while index < len(code) and code[index] not in "{;()=":
                index += 1
            if index >= len(code) or code[index] != "{":
                continue
            if qualifiers and not set(qualifiers) <= set(_enclosing(scopes, match.start())):
                continue
            close = match_brace(code, index)
            owner = f"{base}{args}"
            for name, start, end in _class_members(text, code, index, close):
                if member_norm and _norm(name) != member_norm:
                    continue
                body, truncated = _body_excerpt(text, start, end)
                results.append({
                    "name": f"{owner}::{name}",
                    "file": rel,
                    "line": _line_of(text, start),
                    "body": body,
                    "kind": "class_body",
                    "truncated": truncated,
                })
        for match in out_of_class_re.finditer(code):
            name = re.sub(r"\s+", "", match.group(1))
            if member_norm and name != member_norm:
                continue
            paren = match.end() - 1
            close_paren = _match_paren(code, paren)
            if close_paren < 0:
                continue
            brace = close_paren + 1
            while brace < len(code) and code[brace] not in "{;":
                brace += 1
            if brace >= len(code) or code[brace] != "{":
                continue
            between = code[close_paren + 1:brace]
            if not re.fullmatch(r"\s*(?:const\b\s*)?(?::[^;{}]*)?", between):
                continue
            prev = max(code.rfind(";", 0, match.start()), code.rfind("}", 0, match.start()), code.rfind("{", 0, match.start()))
            prefix = code[prev + 1:match.start()]
            if re.search(r"\b(return|if|while|for|switch)\b|[=(,]", prefix):
                continue
            start = prev + 1 + (len(prefix) - len(prefix.lstrip()))
            end = match_brace(code, brace)
            kind = "inline" if re.search(r"\binline\b", prefix) else "template" if "template" in prefix else "out_of_class"
            body, truncated = _body_excerpt(text, start, end)
            results.append({
                "name": f"{base}::{name}",
                "file": rel,
                "line": _line_of(text, start),
                "body": body,
                "kind": kind,
                "truncated": truncated,
            })
        if len(results) >= limit:
            break
    return results[:limit]


# --------------------------------------------------------------------------
# certification: the steering gate's verdict on matched siblings
# --------------------------------------------------------------------------

UNVERIFIED_SCHEMA = "orch-unverified-matches-v1"
UNVERIFIED_ENV = "ORCH_UNVERIFIED_MATCHES_JSON"
UNVERIFIED_DEFAULT = Path("build") / "steering" / "unverified-matches.json"
GATE_MODES = ("off", "shadow", "enforce")
# Siblings with these statuses are evidence at 100%; `unverified` and `unknown` never are.
EVIDENCE_CERTIFICATIONS = ("certified", "ungated")
UNKNOWN_NOTE = (
    "Certification is unknown: {why}. Every sibling is `unknown` and listed as a hypothesis, never as "
    "evidence: on a steering-gated game (SMS) a 100% sibling may be a \"100% but unverified\" match."
)


class Certification:
    """The orchestrator's per-revision hold list for one game, as the server wrote it.

    File (`orch-unverified-matches-v1`, written at sandbox provisioning by
    `unverifiedMatchesEvidence`): `{schema, game_id, gate, gate_active,
    revision, generated_at, unverified: [{unit, symbol, analyzed_rev, base_rev, reason}]}`,
    derived at the sandbox's exact `revision`. Statuses:

    - `unverified`: listed (an unverified match, one cleared only after
      `revision`, or a steering rollback not certified at `revision`);
    - `certified`: a gated game's sibling that is not listed, at `revision`,
      whose source file in the checkout is byte-identical to that file at
      `revision` (`source_at_revision`); an edited file is `unknown`;
    - `ungated`: the gate is confirmed off (the file says so, or with no file
      ORCH_STEERING_GATE / the game's game.json does);
    - `unknown`: anything else (no file and no confirmed gate state, a missing
      or malformed file). Unknown never counts as evidence.
    """

    def __init__(self, status: str, source: Optional[str], revision: Optional[str],
                 unverified: Iterable[Dict[str, Any]], note: Optional[str] = None,
                 fallback_revision: Optional[str] = None) -> None:
        self.status = status  # gated | ungated | unknown
        self.source = source
        self.revision = revision
        self.note = note
        self.fallback_revision = fallback_revision
        self._source_state: Dict[str, bool] = {}
        self._by_symbol: Dict[str, List[Dict[str, Any]]] = {}
        for row in unverified:
            self._by_symbol.setdefault(row["symbol"], []).append(row)

    @property
    def gated(self) -> bool:
        return self.status == "gated"

    def classify(self, unit: str, symbol: str) -> Tuple[str, Optional[str]]:
        """(certification, revision) for one sibling."""
        if self.status != "gated":
            return self.status, self.revision or self.fallback_revision
        rows = self._by_symbol.get(symbol) or []
        # Same unit first; a symbol listed under another unit name still counts (fail toward unverified).
        row = next((r for r in rows if r.get("unit") == unit), rows[0] if rows else None)
        if row is not None:
            rev = row.get("analyzed_rev")
            return "unverified", rev if isinstance(rev, str) and rev else self.revision
        return "certified", self.revision

    def source_at_revision(self, repo: Path, rel_path: str) -> bool:
        """The checkout's `rel_path` is the file the certification describes: identical to `<revision>:<rel_path>`.

        Any doubt (no revision, git failure, a file absent at the revision or
        in the checkout) is False, so the sibling cannot be certified.
        """
        if not self.revision:
            return False
        if rel_path not in self._source_state:
            try:
                current = (Path(repo) / rel_path).read_bytes()
            except OSError:
                current = None
            shown = _git(repo, "show", f"{self.revision}:{rel_path}")
            self._source_state[rel_path] = current is not None and shown is not None and shown.returncode == 0 \
                and shown.stdout == current
        return self._source_state[rel_path]

    def summary(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"status": self.status, "source": self.source, "gated": self.gated, "revision": self.revision,
                               "unverified_count": sum(len(v) for v in self._by_symbol.values())}
        if self.note:
            out["note"] = self.note
        return out


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validated(data: Any) -> Tuple[Optional[Dict[str, Any]], str]:
    """The file's content when every required field is well formed, else (None, why)."""
    if not isinstance(data, dict):
        return None, "not a JSON object"
    if data.get("schema") != UNVERIFIED_SCHEMA:
        return None, f"schema is not {UNVERIFIED_SCHEMA}"
    if not _nonempty(data.get("game_id")):
        return None, "game_id missing"
    gate = data.get("gate")
    if gate not in GATE_MODES:
        return None, f"gate {gate!r} is not one of {', '.join(GATE_MODES)}"
    if not isinstance(data.get("gate_active"), bool) or data["gate_active"] != (gate != "off"):
        return None, "gate_active missing or inconsistent with gate"
    rows = data.get("unverified")
    if not isinstance(rows, list):
        return None, "unverified list missing"
    for row in rows:
        if not isinstance(row, dict) or not _nonempty(row.get("unit")) or not _nonempty(row.get("symbol")):
            return None, "an unverified row lacks unit or symbol"
        if row.get("analyzed_rev") is not None and not isinstance(row.get("analyzed_rev"), str):
            return None, "an unverified row has a non-string analyzed_rev"
    if data["gate_active"] and not _nonempty(data.get("revision")):
        return None, "revision missing (the list is only valid at the revision it was derived for)"
    return data, ""


def _git(repo: Path, *args: str) -> Optional["subprocess.CompletedProcess[bytes]"]:
    try:
        return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, timeout=20, check=False)
    except (OSError, subprocess.SubprocessError):
        return None


def binding_problem(repo: Path, data: Dict[str, Any], env: Optional[Dict[str, str]] = None) -> Optional[str]:
    """Why a gated list does not describe this checkout, or None: the game must match ORCH_GAME_ID (when
    set) and `revision` must be a commit that is the checkout HEAD or one of its ancestors."""
    env = os.environ if env is None else env
    game = (env.get("ORCH_GAME_ID") or "").strip()
    if game and game != data["game_id"]:
        return f"the list is for game {data['game_id']}, this checkout is {game}"
    revision = data["revision"]
    if revision.startswith("-"):
        return f"revision {revision!r} is not a commit"
    result = _git(repo, "merge-base", "--is-ancestor", revision, "HEAD")
    if result is None or result.returncode != 0:
        return f"revision {revision} is not the checkout HEAD or an ancestor of it (or git is unavailable)"
    return None


def confirmed_gate(env: Optional[Dict[str, str]] = None) -> Optional[str]:
    """The game's gate mode when it is actually known (ORCH_STEERING_GATE, else game.json in ORCH_GAME_DIR), else None."""
    env = os.environ if env is None else env
    explicit = (env.get("ORCH_STEERING_GATE") or "").strip()
    if explicit in GATE_MODES:
        return explicit
    game_dir = (env.get("ORCH_GAME_DIR") or "").strip()
    if not game_dir:
        return None
    try:
        data = json.loads((Path(game_dir) / "game.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    matching = data.get("matching") if isinstance(data.get("matching"), dict) else {}
    mode = matching.get("steeringGate", "off")  # the registry default
    return mode if mode in GATE_MODES else None


def load_certification(repo: Optional[Path] = None, path: Optional[Path] = None) -> Certification:
    """--unverified-json, else $ORCH_UNVERIFIED_MATCHES_JSON, else the checkout default; never certifies on doubt."""
    head = _git_head(Path(repo) / ".git") if repo is not None else None

    def unknown(why: str, source: Optional[Path] = None) -> Certification:
        return Certification("unknown", str(source) if source else None, None, [], UNKNOWN_NOTE.format(why=why),
                             fallback_revision=head)

    env = os.environ.get(UNVERIFIED_ENV)
    explicit = Path(path) if path is not None else (Path(env) if env else None)
    candidate = explicit if explicit is not None else (Path(repo) / UNVERIFIED_DEFAULT if repo is not None else None)
    if candidate is not None and not candidate.is_absolute() and repo is not None:
        candidate = Path(repo) / candidate
    if candidate is None or not candidate.is_file():
        if explicit is not None:
            return unknown(f"certification file not found: {candidate}", candidate)
        gate = confirmed_gate()
        if gate == "off":
            return Certification("ungated", None, None, [], "the steering gate is off for this game: siblings are `ungated`",
                                 fallback_revision=head)
        return unknown("no certification file (--unverified-json, $ORCH_UNVERIFIED_MATCHES_JSON, "
                       f"{UNVERIFIED_DEFAULT}) and the steering gate is {gate or 'not known to be off'}")
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        return unknown(f"certification file {candidate} is unreadable ({error})", candidate)
    valid, why = _validated(data)
    if valid is None:
        return unknown(f"certification file {candidate} is malformed: {why}", candidate)
    if not valid["gate_active"]:
        return Certification("ungated", str(candidate), valid.get("revision") if _nonempty(valid.get("revision")) else None, [],
                             "the steering gate is off for this game: siblings are `ungated`", fallback_revision=head)
    if repo is not None:
        problem = binding_problem(Path(repo), valid)
        if problem:
            return unknown(f"certification file {candidate} does not describe this checkout: {problem}", candidate)
    return Certification("gated", str(candidate), valid["revision"], valid["unverified"], fallback_revision=head)


def sibling_matched(row: Dict[str, Any]) -> bool:
    """Evidence only at 100% with a certification that admits it (certified, or a confirmed ungated game)."""
    percent = row.get("match_percent")
    return isinstance(percent, (int, float)) and percent >= 100.0 and row.get("certification") in EVIDENCE_CERTIFICATIONS


# --------------------------------------------------------------------------
# usage: source callers that already match
# --------------------------------------------------------------------------


def _source_functions(code: str, start: int, end: int, prefix: str = "") -> Iterable[Tuple[str, int, int, int]]:
    """Yield (qualified name, decl start, body open, body close) for definitions."""
    index = start
    stmt_start = start
    while index < end:
        ch = code[index]
        if ch in ";}":
            stmt_start = index + 1
        elif ch == "{":
            close = match_brace(code, index)
            decl = code[stmt_start:index]
            access = ACCESS_RE.match(decl)
            if access:
                decl = decl[access.end():]
            stripped = decl.strip()
            flat = _strip_templates(decl)
            keyword = TYPE_KEYWORD_RE.search(flat)
            flat_paren = flat.find("(")
            type_first = bool(keyword and (flat_paren < 0 or keyword.start() < flat_paren))
            paren = decl.find("(")
            if re.match(r"(?:inline\s+)?namespace\b", stripped):
                name_match = re.search(r"namespace\s+([A-Za-z_]\w*)", stripped)
                inner = f"{prefix}{name_match.group(1)}::" if name_match else prefix
                yield from _source_functions(code, index + 1, close, inner)
            elif re.match(r'extern\s*"', stripped):
                yield from _source_functions(code, index + 1, close, prefix)
            elif type_first and keyword.group(1) in ("class", "struct", "union"):
                name_match = re.search(rf"\b{keyword.group(1)}\s+([A-Za-z_]\w*)", flat)
                if name_match:
                    yield from _source_functions(code, index + 1, close, f"{prefix}{name_match.group(1)}::")
            elif paren >= 0 and not type_first:
                head = decl[:paren]
                match = QUALIFIED_BEFORE_PAREN_RE.search(head)
                if match and not re.search(r"=\s*$", head):
                    yield f"{prefix}{re.sub(r'\s+', '', match.group(1))}", stmt_start, index, close
            index = close
            stmt_start = close + 1
        index += 1


def _is_call_site(body: str, index: int) -> bool:
    """True when the match at `index` is a call, not `Type name(args)` declaring a variable."""
    if body[index] in ".:-":
        return True
    before = body[:index].rstrip()
    return not before or before[-1] in ";{}(,=!&|?:+-*/%[^~"


def _inline_query(inline_name: str) -> Tuple[Optional[str], str]:
    parts = [p.strip() for p in _split_scope(inline_name.split("(", 1)[0]) if p.strip()]
    if not parts:
        return None, ""
    member = parts[-1]
    owner = _strip_templates(parts[-2]).strip() if len(parts) > 1 else None
    return owner, member


def usage(
    repo: Path,
    inline_name: str,
    unit: Optional[str] = None,
    min_percent: float = 100.0,
    limit: int = 50,
    certification: Optional[Certification] = None,
) -> List[Dict[str, Any]]:
    """Report-matched functions whose source body calls `inline_name`.

    Every row carries `certification`, `revision` and `matched`
    (`sibling_matched`); `certification` defaults to `load_certification(repo)`.
    """
    repo = Path(repo)
    owner, member = _inline_query(inline_name)
    if not member:
        return []
    layout = project_layout.get_project_layout(repo)
    if not layout.report_path.is_file():
        raise EvidenceUnavailable(f"no match report at {_repo_rel(repo, layout.report_path)}; build the project first")
    report = json.loads(layout.report_path.read_text(encoding="utf-8"))
    if member.startswith("operator"):
        call_re = None
    elif owner and member == owner:
        call_re = re.compile(rf"\b{re.escape(member)}\s*(?:<[^;{{}}]*?>)?\s*[({{]")
    else:
        call_re = re.compile(rf"(?:\.|->|::|\b){re.escape(member)}\s*(?:<[^;{{}}()]*>)?\s*\(")
    if call_re is None:
        raise EvidenceUnavailable("usage cannot text-search operator calls; search for a named member")
    if certification is None:
        certification = load_certification(repo)
    unit_filter = None
    if unit:
        try:
            unit_filter = layout.source_path_for_unit(unit).as_posix()
        except Exception:
            unit_filter = unit
    results: List[Dict[str, Any]] = []
    for report_unit in report.get("units", []):
        name = report_unit.get("name")
        if not isinstance(name, str):
            continue
        source = layout.source_path_for_unit(name)
        if unit_filter and source.as_posix() != unit_filter and name != unit:
            continue
        path = repo / source
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if member not in text:
            continue
        matched: Dict[str, List[Tuple[str, float]]] = {}
        for function in report_unit.get("functions", []) or []:
            mangled = function.get("name")
            percent = function.get("fuzzy_match_percent")
            if not isinstance(mangled, str) or not isinstance(percent, (int, float)):
                continue
            _, qualified = demangle(mangled)
            matched.setdefault(_norm(_strip_templates(qualified)), []).append((mangled, float(percent)))
        code = strip_code(text)
        for qualified, decl_start, open_index, close in _source_functions(code, 0, len(code)):
            body = code[open_index:close + 1]
            hit = next((m for m in call_re.finditer(body) if _is_call_site(body, m.start())), None)
            if not hit:
                continue
            key = _norm(_strip_templates(qualified))
            candidates = matched.get(key, [])
            if not candidates:
                # Out-of-namespace definitions lose the namespace prefix.
                candidates = [c for k, v in matched.items() if k.endswith("::" + key) for c in v]
            call_index = open_index + hit.start()
            line = _line_of(text, call_index)
            for mangled, percent in candidates:
                if percent < min_percent:
                    continue
                readable, _ = demangle(mangled)
                status, revision = certification.classify(name, mangled)
                if status == "certified" and not certification.source_at_revision(repo, source.as_posix()):
                    # The certificate is for the file at `revision`; an edit since then is unproven.
                    status = "unknown"

                row = {
                    "function": readable,
                    "mangled": mangled,
                    "unit": name,
                    "match_percent": percent,
                    "certification": status,
                    "revision": revision,
                    "file": source.as_posix(),
                    "line": line,
                    "call": text.splitlines()[line - 1].strip()[:200],
                    "owner_mentioned": bool(owner and owner in text[open_index:close + 1]),
                }
                row["matched"] = sibling_matched(row)
                results.append(row)
    results.sort(key=lambda r: (not r["matched"], not r["owner_mentioned"], -r["match_percent"]))
    return results[:limit]


# --------------------------------------------------------------------------
# JSystem reference sources
# --------------------------------------------------------------------------


REFS_ROOT_ENV = "ORCH_JSYSTEM_REFS_ROOT"
# Baked into the worker sandbox image (sandbox-image/Dockerfile).
SANDBOX_REFS_ROOT = Path("/opt/refs/jsystem")


def default_refs_root() -> Optional[Path]:
    """$ORCH_JSYSTEM_REFS_ROOT, else the sandbox image's /opt/refs/jsystem when present, else $ORCH_GAME_STATE_DIR/refs/jsystem."""
    explicit = os.environ.get(REFS_ROOT_ENV)
    if explicit:
        return Path(explicit)
    if SANDBOX_REFS_ROOT.is_dir():
        return SANDBOX_REFS_ROOT
    state = os.environ.get("ORCH_GAME_STATE_DIR")
    return Path(state) / "refs" / "jsystem" if state else None


def jsystem(
    query: str,
    game: str = "all",
    limit: int = 20,
    refs_root: Optional[Path] = None,
    context: int = 2,
) -> Dict[str, Any]:
    """Literal search over the pinned TP/TWW JSystem sources."""
    root = Path(refs_root) if refs_root is not None else default_refs_root()
    games = JSYSTEM_GAMES if game == "all" else (game,)
    hint = f"bash {FETCH_SCRIPT} {root if root else '<state>/refs/jsystem'}"
    present = [g for g in games if root is not None and (root / g).is_dir()]
    if not present:
        return {"available": False, "query": query, "hits": [], "total": 0, "fetch_hint": hint}
    hits: List[Dict[str, Any]] = []
    total = 0
    for case_sensitive in (True, False):
        needle = query if case_sensitive else query.lower()
        for name in present:
            game_root = root / name  # type: ignore[operator]
            for path in sorted(game_root.rglob("*")):
                if path.suffix.lower() not in SOURCE_SUFFIXES or ".git" in path.parts or not path.is_file():
                    continue
                try:
                    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
                except OSError:
                    continue
                for number, line in enumerate(lines, 1):
                    haystack = line if case_sensitive else line.lower()
                    if needle not in haystack:
                        continue
                    total += 1
                    if len(hits) < limit:
                        lo, hi = max(0, number - 1 - context), min(len(lines), number + context)
                        hits.append({
                            "game": name,
                            "file": path.relative_to(game_root).as_posix(),
                            "line": number,
                            "text": line.strip()[:240],
                            "context": "\n".join(lines[lo:hi]),
                        })
        if total:
            break
    result: Dict[str, Any] = {
        "available": True,
        "query": query,
        "games": present,
        "hits": hits,
        "total": total,
        "commits": _ref_commits(root, present),  # type: ignore[arg-type]
    }
    missing = [g for g in games if g not in present]
    if missing:
        result["missing_games"] = missing
        result["fetch_hint"] = hint
    return result


def _ref_commits(root: Path, games: List[str]) -> Dict[str, Optional[str]]:
    try:
        lock = json.loads(REFS_LOCK_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        lock = {}
    commits: Dict[str, Optional[str]] = {}
    for name in games:
        commits[name] = _git_head(root / name / ".git") or (lock.get(name) or {}).get("commit")
    return commits


def _git_head(git_dir: Path) -> Optional[str]:
    try:
        text = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not text.startswith("ref:"):
        return text or None
    ref = text[4:].strip()
    try:
        return (git_dir / ref).read_text(encoding="utf-8").strip() or None
    except OSError:
        pass
    try:
        for line in (git_dir / "packed-refs").read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1] == ref:
                return parts[0]
    except OSError:
        pass
    return None


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _render_text(command: str, payload: Dict[str, Any]) -> str:
    if payload.get("status") != "ok":
        return json.dumps(payload, indent=2)
    if command == "map-calls" and payload.get("found"):
        lines = [f"{payload['symbol']}  [{payload['scope']}] {payload['object']} size={payload['size']}"]
        for callee in payload["callees"]:
            lines.append(f"  -> {callee['name']}  ({callee['kind']},{callee['scope']}) {callee['object']}")
        return "\n".join(lines)
    if command == "map-unit" and payload.get("found"):
        lines = [f"{payload['unit']}: {', '.join(payload['objects'])}"]
        for fn in payload["functions"]:
            flag = " UNUSED" if fn["unused"] else ""
            lines.append(f"  {fn['kind']:<7} {fn['size']:>6}{flag}  {fn['name']}")
        return "\n".join(lines)
    return json.dumps(payload, indent=2)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--repo", type=Path, help="Game checkout (default $ORCH_GAME_HOST_REPO_ROOT, then $ORCH_GAME_REPO_ROOT).")
    common.add_argument("--version", help="Game version (default: detected from the checkout).")
    common.add_argument("--cache-dir", type=Path, help="Parser cache directory.")
    common.add_argument("--limit", type=int, default=None, help="Maximum rows.")
    common.add_argument("--json", action="store_true", help="Emit JSON.")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("map-calls", parents=[common])
    p.add_argument("--symbol", required=True)
    p = sub.add_parser("map-unit", parents=[common])
    p.add_argument("--unit", required=True)
    p = sub.add_parser("inlines", parents=[common])
    p.add_argument("--type", dest="type_name", required=True)
    p.add_argument("--member")
    p = sub.add_parser("usage", parents=[common])
    p.add_argument("--inline", dest="inline_name", required=True)
    p.add_argument("--unit")
    p.add_argument("--min-percent", type=float, default=100.0)
    p.add_argument("--unverified-json", type=Path,
                   help=f"Unverified-match list ({UNVERIFIED_SCHEMA}; default ${UNVERIFIED_ENV}, then {UNVERIFIED_DEFAULT}).")
    p = sub.add_parser("jsystem", parents=[common])
    p.add_argument("--query", required=True)
    p.add_argument("--game", choices=("tp", "tww", "all"), default="all")
    p.add_argument("--refs-root", type=Path)
    p.add_argument("--context", type=int, default=2)
    p = sub.add_parser("compiler", parents=[common])
    p.add_argument("--query", required=True)
    p.add_argument("--path", help="File name (Coloring.c), directory prefix (src/backend) or glob under the source root.")
    p.add_argument("--compiler-root", type=Path, help="Compiler source root (default: see compiler_ref.py).")
    p.add_argument("--context", type=int, default=0)
    return parser


def _bounded(value: Optional[int], default: int, high: int = 200) -> int:
    if value is None:
        return default
    return max(1, min(high, value))


def run(args: argparse.Namespace) -> Dict[str, Any]:
    command = args.command
    if command == "jsystem":
        result = jsystem(args.query, args.game, _bounded(args.limit, 20), args.refs_root, max(0, min(10, args.context)))
        return {"status": "ok" if result["available"] else "unavailable", "command": command, **result}
    if command == "compiler":
        # The checkout is optional here: it only adds <checkout>/../mwcc as a root.
        checkout = args.repo or default_repo()
        result = compiler_ref.search(
            args.query, root=args.compiler_root, repo=Path(checkout) if checkout else None, path=args.path,
            limit=_bounded(args.limit, 20, 100), context=max(0, min(8, args.context)),
        )
        return {"status": "ok" if result["available"] else "unavailable", "command": command, **result}
    repo = args.repo or default_repo()
    if repo is None:
        return {"status": "error", "command": command, "reason": "no --repo and neither ORCH_GAME_HOST_REPO_ROOT nor ORCH_GAME_REPO_ROOT is set"}
    repo = Path(repo).expanduser()
    if not repo.is_dir():
        return {"status": "unavailable", "command": command, "repo": str(repo), "reason": f"game checkout not found: {repo}"}
    version = args.version or detect_version(repo)
    base = {"command": command, "repo": str(repo), "version": version}
    if command == "map-calls":
        result = map_calls(repo, args.symbol, version, args.cache_dir)
    elif command == "map-unit":
        result = map_unit(repo, args.unit, version, args.cache_dir)
        limit = _bounded(args.limit, 400, 2000)
        if len(result.get("functions", [])) > limit:
            result["functions"] = result["functions"][:limit]
            result["truncated"] = True
    elif command == "inlines":
        rows = inlines(repo, args.type_name, args.member, _bounded(args.limit, 40))
        return {"status": "ok", **base, "type": args.type_name, "member": args.member, "results": rows, "count": len(rows),
                **({} if rows else {"note": "no inline definitions found in include/ or libs/*/include/"})}
    elif command == "usage":
        certification = load_certification(repo, args.unverified_json)
        try:
            rows = usage(repo, args.inline_name, args.unit, args.min_percent, 100000, certification)
        except EvidenceUnavailable as error:
            return {"status": "unavailable", **base, "reason": str(error)}
        limit = _bounded(args.limit, 30)
        matched = [r for r in rows if r["matched"]]
        hypotheses = [r for r in rows if not r["matched"]]
        shown = matched[:limit]
        return {"status": "ok", **base, "inline": args.inline_name, "min_percent": args.min_percent, "results": shown,
                "count": len(shown), "total": len(matched),
                "hypotheses": hypotheses[:limit], "hypotheses_total": len(hypotheses),
                "certification": certification.summary(),
                "note": "Text match on the member name inside matched functions; overloads and same-named members of other types are not distinguished. "
                        "`results` are matched siblings (100%, certified or on a game without the gate); `hypotheses` are below 100%, "
                        "unverified or of unknown certification and prove nothing about the original code."}
    else:  # pragma: no cover - argparse restricts commands
        raise ValueError(command)
    if not result.get("available", True):
        status = "unavailable"
    elif result.get("found") is False:
        status = "not_found"
    else:
        status = "ok"
    return {"status": status, **base, **result}


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = run(args)
    except Exception as error:  # noqa: BLE001 - CLI boundary
        payload = {"status": "error", "command": args.command, "reason": f"{type(error).__name__}: {error}"}
        print(json.dumps(payload) if args.json else payload["reason"], file=sys.stdout if args.json else sys.stderr)
        return 2
    if args.json:
        print(json.dumps(payload, indent=None))
    else:
        print(_render_text(args.command, payload))
    return 2 if payload.get("status") == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
