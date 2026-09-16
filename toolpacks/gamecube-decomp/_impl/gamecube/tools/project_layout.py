"""Resolve source and build paths from a decomp project's own metadata.

Objdiff unit names are identifiers, not paths.  In Melee they have a ``main/``
prefix which is absent from source and object paths; in Super Mario Sunshine
they have a ``mario/`` prefix while the paths may omit it.  This module keeps
the metadata-authored paths authoritative and exposes the path beneath the
version's ``src`` object directory as the operational unit key.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import Any, Optional


@dataclass(frozen=True)
class _Unit:
    name: str
    operational_name: str
    source_path: Path
    object_path: Path
    target_object_path: Path
    functions: tuple[str, ...]


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    with path.open("r", encoding="utf-8") as stream:
        value = json.load(stream)
    return value if isinstance(value, dict) else {}


def _version_from_path(path: Path) -> Optional[str]:
    parts = path.parts
    for index, part in enumerate(parts[:-1]):
        if part == "build" and index + 1 < len(parts):
            version = parts[index + 1]
            if version not in {"asm", "obj", "src", "tools"}:
                return version
    return None


def _strip_suffix(path: PurePosixPath) -> PurePosixPath:
    return path.with_suffix("") if path.suffix else path


class ProjectLayout:
    """One immutable view of a checkout's objdiff and report metadata."""

    def __init__(self, root: Path, report_override: Optional[Path] = None):
        self.root = root.resolve()
        objdiff = _read_json(self.root / "objdiff.json")

        override = None
        if report_override is not None:
            override = report_override.expanduser()
            if not override.is_absolute():
                override = self.root / override

        self.version = self._detect_version(override, objdiff)
        self.report_path = override or self.root / "build" / self.version / "report.json"
        self.asm_root = self.root / "build" / self.version / "asm"
        self.obj_root = self.root / "build" / self.version / "obj"
        self.context_script = self._detect_context_script()

        report = _read_json(self.report_path)
        self._units, self._aliases = self._load_units(objdiff, report)
        self._functions: dict[str, str] = {}
        self._source_functions: dict[str, str] = {}
        for unit in self._units:
            for function in unit.functions:
                # Match the legacy linear report scan: the first declaration wins.
                self._functions.setdefault(function, unit.name)
        report_units = report.get("units", [])
        if isinstance(report_units, list):
            for unit in report_units:
                if not isinstance(unit, dict):
                    continue
                functions = unit.get("functions", [])
                if not isinstance(functions, list):
                    continue
                for function in functions:
                    if not isinstance(function, dict):
                        continue
                    name = function.get("name")
                    if not isinstance(name, str):
                        continue
                    metadata = function.get("metadata", {})
                    demangled = (
                        metadata.get("demangled_name")
                        if isinstance(metadata, dict)
                        else None
                    )
                    source_name = name
                    if isinstance(demangled, str) and demangled:
                        qualified = demangled.split("(", 1)[0].strip()
                        source_name = qualified or name
                    self._source_functions.setdefault(name, source_name)

    def _detect_version(
        self, report_override: Optional[Path], objdiff: dict[str, Any]
    ) -> str:
        if report_override is not None:
            version = _version_from_path(report_override)
            if version:
                return version

        units = objdiff.get("units", [])
        if isinstance(units, list):
            for unit in units:
                if not isinstance(unit, dict):
                    continue
                for key in ("base_path", "target_path"):
                    value = unit.get(key)
                    if isinstance(value, str):
                        version = _version_from_path(Path(value))
                        if version:
                            return version

        reports = sorted((self.root / "build").glob("*/report.json"))
        if reports:
            return reports[0].parent.name

        # Unbound legacy consumers historically assumed Melee.
        return "GALE01"

    def _detect_context_script(self) -> Path:
        candidates = (
            self.root / "tools" / "m2ctx" / "m2ctx.py",
            self.root / "tools" / "decompctx.py",
        )
        return next((path for path in candidates if path.is_file()), candidates[0])

    def _project_path(self, value: str | PurePosixPath) -> PurePosixPath:
        """Keep checkout-owned metadata paths relative to the checkout root."""
        path = Path(str(value)).expanduser()
        if path.is_absolute():
            try:
                path = path.relative_to(self.root)
            except ValueError:
                pass
        return PurePosixPath(path.as_posix())

    def _load_units(
        self, objdiff: dict[str, Any], report: dict[str, Any]
    ) -> tuple[tuple[_Unit, ...], dict[str, _Unit]]:
        configured: dict[str, dict[str, Any]] = {}
        objdiff_units = objdiff.get("units", [])
        if isinstance(objdiff_units, list):
            for value in objdiff_units:
                if not isinstance(value, dict) or not isinstance(value.get("name"), str):
                    continue
                configured[value["name"]] = value

        reported: dict[str, dict[str, Any]] = {}
        report_units = report.get("units", [])
        if isinstance(report_units, list):
            for value in report_units:
                if not isinstance(value, dict) or not isinstance(value.get("name"), str):
                    continue
                reported[value["name"]] = value

        units: list[_Unit] = []
        aliases: dict[str, _Unit] = {}
        for name in dict.fromkeys((*configured, *reported)):
            config = configured.get(name, {})
            report_unit = reported.get(name, {})
            config_metadata = config.get("metadata", {})
            report_metadata = report_unit.get("metadata", {})
            metadata = {
                **(report_metadata if isinstance(report_metadata, dict) else {}),
                **(config_metadata if isinstance(config_metadata, dict) else {}),
            }

            source_value = metadata.get("source_path")
            if isinstance(source_value, str) and source_value:
                source = self._project_path(source_value)
            else:
                source = PurePosixPath("src") / f"{name.removeprefix('main/')}.c"

            base_value = config.get("base_path")
            target_value = config.get("target_path")
            base = self._project_path(base_value) if isinstance(base_value, str) else None
            target = self._project_path(target_value) if isinstance(target_value, str) else None

            operational = self._operational_name(name, source, base)
            if base is None:
                base = PurePosixPath("build") / self.version / source.with_suffix(".o")
            if target is None:
                try:
                    target_stem = source.relative_to("src").with_suffix(".o")
                except ValueError:
                    target_stem = PurePosixPath(f"{operational}.o")
                target = (
                    PurePosixPath("build")
                    / self.version
                    / "obj"
                    / target_stem
                )

            functions_value = report_unit.get("functions", [])
            functions = tuple(
                function["name"]
                for function in functions_value
                if isinstance(function, dict) and isinstance(function.get("name"), str)
            ) if isinstance(functions_value, list) else ()

            unit = _Unit(
                name=name,
                operational_name=operational,
                source_path=Path(source.as_posix()),
                object_path=Path(base.as_posix()),
                target_object_path=Path(target.as_posix()),
                functions=functions,
            )
            units.append(unit)
            for alias in (name, operational, source.as_posix(), base.as_posix(), target.as_posix()):
                aliases.setdefault(self._normalize_alias(alias), unit)

        return tuple(units), aliases

    def _operational_name(
        self,
        name: str,
        source: PurePosixPath,
        base: Optional[PurePosixPath],
    ) -> str:
        if base is not None:
            prefix = PurePosixPath("build") / self.version / "src"
            try:
                return _strip_suffix(base.relative_to(prefix)).as_posix()
            except ValueError:
                pass
        try:
            return _strip_suffix(source.relative_to("src")).as_posix()
        except ValueError:
            return name.removeprefix("main/")

    def _normalize_alias(self, value: str | Path) -> str:
        path = Path(value)
        if path.is_absolute():
            try:
                path = path.relative_to(self.root)
            except ValueError:
                pass
        normalized = path.as_posix()
        while normalized.startswith("./"):
            normalized = normalized[2:]
        return normalized

    def _unit(self, unit_name: str | Path) -> _Unit:
        alias = self._normalize_alias(unit_name)
        try:
            return self._aliases[alias]
        except KeyError:
            # Legacy callers can pass an operational unit before objdiff/report
            # exists. Preserve the historic Melee path rule in that case.
            path = PurePosixPath(alias)
            source_prefix = PurePosixPath("src")
            object_prefix = PurePosixPath("build") / self.version / "src"
            target_prefix = PurePosixPath("build") / self.version / "obj"
            source: PurePosixPath
            try:
                source_rel = path.relative_to(source_prefix)
                operational = _strip_suffix(source_rel).as_posix()
                source = path
            except ValueError:
                for prefix in (object_prefix, target_prefix):
                    try:
                        operational = _strip_suffix(path.relative_to(prefix)).as_posix()
                        break
                    except ValueError:
                        continue
                else:
                    operational = _strip_suffix(
                        PurePosixPath(alias.removeprefix("main/"))
                    ).as_posix()
                source = source_prefix / f"{operational}.c"
            return _Unit(
                name=alias,
                operational_name=operational,
                source_path=Path(source.as_posix()),
                object_path=Path((object_prefix / f"{operational}.o").as_posix()),
                target_object_path=Path((target_prefix / f"{operational}.o").as_posix()),
                functions=(),
            )

    def unit_for_function(self, func_name: str) -> Optional[str]:
        """Return the metadata unit name containing ``func_name``."""
        return self._functions.get(func_name)

    def operational_name_for_unit(self, unit_name: str | Path) -> str:
        """Return the build-object stem historically used by Melee tools."""
        return self._unit(unit_name).operational_name

    def operational_unit_for_function(self, func_name: str) -> Optional[str]:
        """Return the build-object stem containing ``func_name``."""
        unit_name = self.unit_for_function(func_name)
        return self.operational_name_for_unit(unit_name) if unit_name is not None else None

    def source_name_for_function(self, func_name: str) -> str:
        """Return the source identifier for a report symbol when metadata has it."""
        return self._source_functions.get(func_name, func_name)

    def source_path_for_unit(self, unit_name: str | Path) -> Path:
        return self._unit(unit_name).source_path

    def object_path_for_unit(self, unit_name: str | Path) -> Path:
        return self._unit(unit_name).object_path

    def target_object_path_for_unit(self, unit_name: str | Path) -> Path:
        return self._unit(unit_name).target_object_path

    def path_label(self, path: str | Path) -> Path:
        """Return a repo-relative path when possible, otherwise the absolute path."""
        value = Path(path)
        try:
            return value.relative_to(self.root)
        except ValueError:
            return value


@lru_cache(maxsize=None)
def _cached_project_layout(root: str, report_override: Optional[str]) -> ProjectLayout:
    override = Path(report_override) if report_override is not None else None
    return ProjectLayout(Path(root), override)


def get_project_layout(
    root: str | Path, report_override: str | Path | None = None
) -> ProjectLayout:
    """Return the cached layout for ``root`` and an optional report binding."""
    resolved_root = Path(root).expanduser().resolve()
    if report_override is None:
        report_override = os.environ.get("ORCH_GAME_REPORT_PATH")
    normalized_report = None
    if report_override is not None:
        report = Path(report_override).expanduser()
        normalized_report = str(report if report.is_absolute() else resolved_root / report)
    return _cached_project_layout(str(resolved_root), normalized_report)
