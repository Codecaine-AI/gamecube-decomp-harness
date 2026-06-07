---
covers: The structural rules — hierarchy, directory structure, numbering systems, and linking conventions.
type: overview
concepts: [standards, hierarchy, zones, layers, numbering, linking]
---

# Standards Capability

The structural rules that make the documentation system navigable. 

Defines the three layers, six-level depth hierarchy, directory organization, numbering conventions, and linking patterns.

---

## The Foundation

The framework organizes `docs/` into three layers and six depth levels:

**Three Layers** (by kind of knowledge):
- `00-foundation/`
  - Intent (why, what problem, north star)
- `10-system-design/`
  - Blueprints (system behaviors, architecture, data flow)
- `20-implementation/`
  - Code (mirrors source, L1-L6, includes `99-appendix/`)

**Six Depth Levels** (progressive depth in Implementation):
- L1-L3: Documentation files (overview → sections → concepts)
- L4-L5: Code annotations (file headers → function docstrings)
- L6: Implementation (the code itself)

## Contents

### [10-hierarchy-layers.md](10-hierarchy-layers.md)
The L1-L6 depth model. Defines what belongs in each layer (Foundation, System Design, Implementation), and Headers vs Docstrings.

### [20-directory-rules.md](20-directory-rules.md)
The physical organization of `docs/`. Zones, mirroring source code, and folder vs file decisions.

### [25-frontmatter-schema.md](25-frontmatter-schema.md)
The YAML frontmatter specification for progressive disclosure. Defines `covers`, `concepts`, `depends-on`, and `design_refs` fields.

### [30-numbering-system.md](30-numbering-system.md)
The `XX-` prefix system that keeps files ordered and allows for insertion.

### [40-doc-linking.md](40-doc-linking.md)
How to link between documentation files (top-down, declarative anchor text).

### [50-code-linking.md](50-code-linking.md)
How to link from documentation to code (one-way, specific references).
