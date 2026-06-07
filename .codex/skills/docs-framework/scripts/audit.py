# /// script
# requires-python = ">=3.10"
# dependencies = ["pyyaml"]
# ///
"""Documentation Audit Script - Deterministic validation for docs/ structure.

Usage:
    uv run audit.py [docs_path]

Exit codes:
    0 - Pass (no issues)
    1 - Warnings only (non-critical issues)
    2 - Critical issues found
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class Issue:
    """A validation issue found during audit."""

    file: str
    message: str
    severity: str  # "critical" or "warning"

    def to_dict(self) -> dict[str, str]:
        return {"file": self.file, "message": self.message, "severity": self.severity}


@dataclass
class StructureResult:
    """Results from structure validation."""

    zones_present: list[str] = field(default_factory=list)
    zones_missing: list[str] = field(default_factory=list)
    missing_overviews: list[str] = field(default_factory=list)
    numbering_issues: list[str] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "zones_present": self.zones_present,
            "zones_missing": self.zones_missing,
            "missing_overviews": self.missing_overviews,
            "numbering_issues": self.numbering_issues,
            "issues": [i.to_dict() for i in self.issues],
        }


@dataclass
class FrontmatterResult:
    """Results from frontmatter validation."""

    files_checked: int = 0
    issues: list[Issue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "files_checked": self.files_checked,
            "issues": [i.to_dict() for i in self.issues],
        }


@dataclass
class LinkResult:
    """Results from link validation."""

    total: int = 0
    broken: list[dict[str, str]] = field(default_factory=list)
    generic_anchors: list[dict[str, str]] = field(default_factory=list)
    orphan_files: list[str] = field(default_factory=list)
    circular_deps: list[list[str]] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "broken": self.broken,
            "generic_anchors": self.generic_anchors,
            "orphan_files": self.orphan_files,
            "circular_deps": self.circular_deps,
            "issues": [i.to_dict() for i in self.issues],
        }


@dataclass
class AuditResult:
    """Complete audit results."""

    timestamp: str = ""
    docs_root: str = ""
    structure: StructureResult = field(default_factory=StructureResult)
    frontmatter: FrontmatterResult = field(default_factory=FrontmatterResult)
    links: LinkResult = field(default_factory=LinkResult)

    @property
    def all_issues(self) -> list[Issue]:
        return self.structure.issues + self.frontmatter.issues + self.links.issues

    @property
    def critical_count(self) -> int:
        return sum(1 for i in self.all_issues if i.severity == "critical")

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.all_issues if i.severity == "warning")

    @property
    def health_score(self) -> int:
        """Calculate health score (0-100)."""
        total_files = self.frontmatter.files_checked or 1
        critical_penalty = self.critical_count * 10
        warning_penalty = self.warning_count * 2
        score = 100 - critical_penalty - warning_penalty
        return max(0, min(100, score))

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "docs_root": self.docs_root,
            "structure": self.structure.to_dict(),
            "frontmatter": self.frontmatter.to_dict(),
            "links": self.links.to_dict(),
            "summary": {
                "files_checked": self.frontmatter.files_checked,
                "critical": self.critical_count,
                "warnings": self.warning_count,
                "health_score": self.health_score,
            },
        }


# =============================================================================
# Auditor Class
# =============================================================================


class Auditor:
    """Orchestrates documentation validation."""

    REQUIRED_ZONES = ["00-foundation", "10-system-design", "20-implementation"]
    FOUNDATION_FILES = [
        "00-overview.md",
        "10-purpose.md",
        "20-principles.md",
        "30-boundaries.md",
    ]
    GENERIC_ANCHORS = ["click here", "here", "this", "link", "see this", "this link"]
    NUMBERING_PATTERN = re.compile(r"^\d{2}-[a-z0-9-]+$")
    LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")

    def __init__(self, docs_root: Path):
        self.docs_root = docs_root
        self.result = AuditResult(
            timestamp=datetime.now().isoformat(),
            docs_root=str(docs_root),
        )
        self._depends_on_graph: dict[str, list[str]] = {}
        self._parent_links: dict[str, set[str]] = {}  # parent -> children linked

    def run(self) -> AuditResult:
        """Run all validations."""
        self._validate_structure()
        self._validate_frontmatter()
        self._validate_links()
        return self.result

    # -------------------------------------------------------------------------
    # Structure Validation
    # -------------------------------------------------------------------------

    def _validate_structure(self) -> None:
        """Validate directory structure."""
        result = self.result.structure

        # Check required zones
        for zone in self.REQUIRED_ZONES:
            zone_path = self.docs_root / zone
            if zone_path.exists() and zone_path.is_dir():
                result.zones_present.append(zone)
            else:
                result.zones_missing.append(zone)
                result.issues.append(
                    Issue(
                        file=str(zone_path),
                        message=f"Required zone missing: {zone}/",
                        severity="critical",
                    )
                )

        # Check foundation zone files
        foundation_path = self.docs_root / "00-foundation"
        if foundation_path.exists():
            for required_file in self.FOUNDATION_FILES:
                file_path = foundation_path / required_file
                if not file_path.exists():
                    # Allow similar names (e.g., 10-purpose.md vs 10-mission.md)
                    prefix = required_file[:2]
                    matching = list(foundation_path.glob(f"{prefix}-*.md"))
                    if not matching:
                        result.issues.append(
                            Issue(
                                file=str(file_path),
                                message=f"Foundation zone missing: {required_file}",
                                severity="critical",
                            )
                        )

        # Check all directories have 00-overview.md
        self._check_overviews_recursive(self.docs_root, result)

        # Validate numbering patterns
        self._check_numbering_recursive(self.docs_root, result)

    def _check_overviews_recursive(
        self, directory: Path, result: StructureResult
    ) -> None:
        """Recursively check that all directories have 00-overview.md."""
        if not directory.is_dir():
            return

        # Skip hidden directories
        if directory.name.startswith("."):
            return

        # Check for 00-overview.md
        overview = directory / "00-overview.md"
        if not overview.exists():
            # Only report for directories that contain .md files or subdirs
            has_content = any(directory.glob("*.md")) or any(
                d.is_dir() for d in directory.iterdir() if not d.name.startswith(".")
            )
            if has_content and directory != self.docs_root:
                result.missing_overviews.append(str(directory))
                result.issues.append(
                    Issue(
                        file=str(overview),
                        message=f"Directory missing 00-overview.md: {directory.name}/",
                        severity="critical",
                    )
                )

        # Recurse into subdirectories
        for subdir in directory.iterdir():
            if subdir.is_dir() and not subdir.name.startswith("."):
                self._check_overviews_recursive(subdir, result)

    def _check_numbering_recursive(
        self, directory: Path, result: StructureResult
    ) -> None:
        """Recursively validate numbering patterns."""
        if not directory.is_dir():
            return

        for item in directory.iterdir():
            if item.name.startswith("."):
                continue

            name = item.stem if item.is_file() else item.name

            # Skip if it's the docs root itself
            if item == self.docs_root:
                continue

            # Check numbering pattern
            if not self.NUMBERING_PATTERN.match(name):
                # Only warn for items directly in docs structure
                if directory == self.docs_root or self.docs_root in item.parents:
                    rel_path = item.relative_to(self.docs_root)
                    result.numbering_issues.append(str(rel_path))
                    result.issues.append(
                        Issue(
                            file=str(item),
                            message=f"Invalid naming: '{name}'. Expected pattern: XX-lowercase-name",
                            severity="warning",
                        )
                    )

            # Recurse into subdirectories
            if item.is_dir():
                self._check_numbering_recursive(item, result)

    # -------------------------------------------------------------------------
    # Frontmatter Validation
    # -------------------------------------------------------------------------

    def _validate_frontmatter(self) -> None:
        """Validate YAML frontmatter in all markdown files."""
        result = self.result.frontmatter

        for md_file in self.docs_root.rglob("*.md"):
            if md_file.name.startswith("."):
                continue

            result.files_checked += 1
            rel_path = str(md_file.relative_to(self.docs_root))

            try:
                content = md_file.read_text(encoding="utf-8")
            except Exception as e:
                result.issues.append(
                    Issue(
                        file=rel_path,
                        message=f"Cannot read file: {e}",
                        severity="warning",
                    )
                )
                continue

            # Extract frontmatter
            frontmatter = self._extract_frontmatter(content)

            if frontmatter is None:
                result.issues.append(
                    Issue(
                        file=rel_path,
                        message="Missing YAML frontmatter (no --- delimiters)",
                        severity="critical",
                    )
                )
                continue

            # Validate required 'covers' field
            if "covers" not in frontmatter:
                result.issues.append(
                    Issue(
                        file=rel_path,
                        message="Missing required 'covers' field in frontmatter",
                        severity="critical",
                    )
                )
            elif not frontmatter["covers"] or not str(frontmatter["covers"]).strip():
                result.issues.append(
                    Issue(
                        file=rel_path,
                        message="'covers' field is empty",
                        severity="critical",
                    )
                )

            # Validate 'concepts' array if present
            concepts = frontmatter.get("concepts")
            if concepts is not None:
                if not isinstance(concepts, list):
                    result.issues.append(
                        Issue(
                            file=rel_path,
                            message="'concepts' must be an array",
                            severity="warning",
                        )
                    )
                else:
                    for concept in concepts:
                        if not isinstance(concept, str):
                            result.issues.append(
                                Issue(
                                    file=rel_path,
                                    message=f"Concept must be string, got: {type(concept).__name__}",
                                    severity="warning",
                                )
                            )
                        elif len(concept) > 30:
                            result.issues.append(
                                Issue(
                                    file=rel_path,
                                    message=f"Concept '{concept[:20]}...' exceeds 30 chars",
                                    severity="warning",
                                )
                            )

            # Validate 'type' field only on overview files
            if "type" in frontmatter:
                if not md_file.name.startswith("00-"):
                    result.issues.append(
                        Issue(
                            file=rel_path,
                            message="'type' field only valid on 00-overview.md files",
                            severity="warning",
                        )
                    )
                elif frontmatter["type"] not in ("overview", "standard"):
                    result.issues.append(
                        Issue(
                            file=rel_path,
                            message=f"Invalid type '{frontmatter['type']}'. Must be 'overview' or 'standard'.",
                            severity="warning",
                        )
                    )

            # Collect depends-on for graph analysis
            depends_on = frontmatter.get("depends-on")
            if depends_on:
                if isinstance(depends_on, list):
                    self._depends_on_graph[rel_path] = depends_on

            # Check for legacy ## Covers section
            if re.search(r"^##\s+Covers\s*$", content, re.MULTILINE):
                result.issues.append(
                    Issue(
                        file=rel_path,
                        message="Legacy '## Covers' section found. Migrate to frontmatter.",
                        severity="warning",
                    )
                )

    def _extract_frontmatter(self, content: str) -> dict[str, Any] | None:
        """Extract YAML frontmatter from markdown content."""
        if not content.startswith("---"):
            return None

        # Find closing ---
        end_match = re.search(r"\n---\s*\n", content[3:])
        if not end_match:
            return None

        frontmatter_text = content[3 : 3 + end_match.start()]

        try:
            return yaml.safe_load(frontmatter_text) or {}
        except yaml.YAMLError:
            return {}

    # -------------------------------------------------------------------------
    # Link Validation
    # -------------------------------------------------------------------------

    def _validate_links(self) -> None:
        """Validate markdown links and dependency graph."""
        result = self.result.links

        for md_file in self.docs_root.rglob("*.md"):
            if md_file.name.startswith("."):
                continue

            rel_path = str(md_file.relative_to(self.docs_root))

            try:
                content = md_file.read_text(encoding="utf-8")
            except Exception:
                continue

            # Find all links
            links = self.LINK_PATTERN.findall(content)
            result.total += len(links)

            # Track parent -> children for orphan detection
            if md_file.name == "00-overview.md":
                parent_dir = str(md_file.parent.relative_to(self.docs_root))
                self._parent_links[parent_dir] = set()

            for anchor, href in links:
                # Skip external links and anchors
                if href.startswith(("http://", "https://", "#", "mailto:")):
                    continue

                # Check for generic anchor text
                anchor_lower = anchor.lower().strip()
                if anchor_lower in self.GENERIC_ANCHORS:
                    result.generic_anchors.append({"file": rel_path, "anchor": anchor})
                    result.issues.append(
                        Issue(
                            file=rel_path,
                            message=f"Generic anchor text: '{anchor}'. Use descriptive text.",
                            severity="warning",
                        )
                    )

                # Resolve and check link target
                target = self._resolve_link(md_file, href)
                if target and not target.exists():
                    result.broken.append({"file": rel_path, "link": href})
                    result.issues.append(
                        Issue(
                            file=rel_path,
                            message=f"Broken link: {href}",
                            severity="critical",
                        )
                    )

                # Track child links from overview files
                if md_file.name == "00-overview.md" and target:
                    parent_dir = str(md_file.parent.relative_to(self.docs_root))
                    if parent_dir in self._parent_links:
                        try:
                            child_rel = str(target.relative_to(self.docs_root))
                            self._parent_links[parent_dir].add(child_rel)
                        except ValueError:
                            pass

        # Detect orphan files
        self._detect_orphans(result)

        # Detect circular dependencies
        self._detect_circular_deps(result)

    def _resolve_link(self, from_file: Path, href: str) -> Path | None:
        """Resolve a relative link to an absolute path."""
        # Remove anchor
        href = href.split("#")[0]
        if not href:
            return None

        # Resolve relative to the file's directory
        target = (from_file.parent / href).resolve()
        return target

    def _detect_orphans(self, result: LinkResult) -> None:
        """Detect files not linked from their parent overview."""
        for md_file in self.docs_root.rglob("*.md"):
            if md_file.name.startswith("."):
                continue
            if md_file.name == "00-overview.md":
                continue

            rel_path = str(md_file.relative_to(self.docs_root))
            parent_dir = str(md_file.parent.relative_to(self.docs_root))

            # Check if parent overview links to this file
            if parent_dir in self._parent_links:
                linked_children = self._parent_links[parent_dir]
                if rel_path not in linked_children:
                    # Check if any link resolves to this file
                    is_linked = any(
                        rel_path.endswith(child.split("/")[-1])
                        for child in linked_children
                    )
                    if not is_linked:
                        result.orphan_files.append(rel_path)
                        result.issues.append(
                            Issue(
                                file=rel_path,
                                message="Orphan file: not linked from parent 00-overview.md",
                                severity="warning",
                            )
                        )

    def _detect_circular_deps(self, result: LinkResult) -> None:
        """Detect circular dependencies in depends-on graph using DFS."""
        visited: set[str] = set()
        rec_stack: set[str] = set()
        path: list[str] = []

        def dfs(node: str) -> list[str] | None:
            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in self._depends_on_graph.get(node, []):
                if neighbor not in visited:
                    cycle = dfs(neighbor)
                    if cycle:
                        return cycle
                elif neighbor in rec_stack:
                    # Found cycle
                    cycle_start = path.index(neighbor)
                    return path[cycle_start:] + [neighbor]

            path.pop()
            rec_stack.remove(node)
            return None

        for node in self._depends_on_graph:
            if node not in visited:
                cycle = dfs(node)
                if cycle:
                    result.circular_deps.append(cycle)
                    result.issues.append(
                        Issue(
                            file=cycle[0],
                            message=f"Circular dependency: {' -> '.join(cycle)}",
                            severity="critical",
                        )
                    )


# =============================================================================
# Main Entry Point
# =============================================================================


def _has_three_layer_structure(docs_path: Path) -> bool:
    """Check if a docs directory has the three-layer zone structure."""
    zones = ["00-foundation", "10-system-design", "20-implementation"]
    return any((docs_path / zone).is_dir() for zone in zones)


def find_docs_root(start_path: Path | None = None) -> Path | None:
    """Find docs root by looking for a docs/ directory with three-layer structure."""
    if start_path is None:
        start_path = Path.cwd()

    # Check if start_path itself is a docs directory
    if start_path.name == "docs" and _has_three_layer_structure(start_path):
        return start_path

    # Check for docs/ subdirectory
    docs_path = start_path / "docs"
    if docs_path.is_dir() and _has_three_layer_structure(docs_path):
        return docs_path

    # Search upward
    current = start_path
    while current != current.parent:
        candidate = current / "docs"
        if candidate.is_dir() and _has_three_layer_structure(candidate):
            return candidate
        current = current.parent

    # Default to ./docs if it exists
    if (start_path / "docs").is_dir():
        return start_path / "docs"

    return None


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Documentation Audit - Validate docs/ structure"
    )
    parser.add_argument(
        "docs_path",
        nargs="?",
        type=Path,
        help="Path to docs/ directory (default: auto-discover)",
    )

    args = parser.parse_args()

    # Find docs root
    if args.docs_path:
        docs_root = args.docs_path.resolve()
        if not docs_root.exists():
            print(json.dumps({"error": f"Path does not exist: {docs_root}"}))
            return 2
    else:
        docs_root = find_docs_root()
        if docs_root is None:
            print(
                json.dumps(
                    {
                        "error": "Could not find docs/ directory. Specify path or run from project root."
                    }
                )
            )
            return 2

    # Run audit
    auditor = Auditor(docs_root)
    result = auditor.run()

    # Output JSON
    print(json.dumps(result.to_dict(), indent=2))

    # Return exit code
    if result.critical_count > 0:
        return 2
    elif result.warning_count > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
