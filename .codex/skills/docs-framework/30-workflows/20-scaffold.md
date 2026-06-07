---
covers: Map source directory structure to docs/20-implementation/ sections.
concepts: [scaffold, mapping, structure, sections]
---

# Docs Scaffold Workflow

Map your source directory structure to documentation sections. Analyzes `src/` (or equivalent) and proposes a mirrored structure in `docs/20-implementation/` with L2 section overviews.

---

## Prerequisites

- `/docs:init` has been run (docs/ exists with three-layer structure)
- User has identified their source directory

## Process

### 1. Analyze Source Structure

Run tree on the source directory (2-3 levels deep):
```bash
eza --tree --level=3 [source_path]
# or: tree -L 3 [source_path]
```

Identify major subdirectories that represent architectural domains:
- Look for: auth, api, core, data, models, services, utils, etc.
- Skip: tests, __pycache__, node_modules, build artifacts

### 2. Propose Section Mapping

Present a mapping table to the user:

```
Source Directory        →    Documentation Section
──────────────────────────────────────────────────
src/auth/               →    docs/20-implementation/10-auth/
src/api/                →    docs/20-implementation/20-api/
src/core/               →    docs/20-implementation/30-core/
src/models/             →    docs/20-implementation/40-models/
src/utils/              →    (skip - utilities rarely need architecture docs)
```

**Numbering guidelines:**
- Use 10, 20, 30... (gaps allow insertions)
- Group related sections numerically
- All sections go in `20-implementation/`

Ask the user:
- "Does this mapping look right?"
- "Any directories to skip or add?"
- "Should any sections be renamed?"

### 3. Create Section Stubs

For each confirmed mapping:

1. Create the directory: `docs/20-implementation/XX-section/`

2. Create `00-overview.md` using template from:
   `.claude/skills/docs-framework/40-templates/30-L2-section-overview/10-generic.md`
   (or choose a more specific archetype from `30-L2-section-overview/` if applicable)

3. Fill in minimal content:
   ```markdown
   # [Section Name]: Overview (L2)

   ## Covers
   [To be filled after interview]

   ## File Tree
   ```
   [source_path]/
   ├── [actual files from source]
   ```

   ## Section Scope
   [To be filled after interview]

   ## Child Nodes
   [To be added after interview]
   ```

### 4. Update L1 Codebase Overview

Edit `docs/20-implementation/00-overview.md`:
- Add each new section to the Section Index
- Use placeholder descriptions until interviews complete

```markdown
## Section Index

### [10-auth/](10-auth/00-overview.md)
Authentication and authorization. [Details pending interview]

### [20-api/](20-api/00-overview.md)
API layer and endpoints. [Details pending interview]
```

### 5. Generate Coverage Report

Output a summary:

```
Documentation Scaffold Complete
══════════════════════

Created Sections (in docs/20-implementation/):
- 10-auth/00-overview.md
- 20-api/00-overview.md
- 30-core/00-overview.md

Coverage Map:
┌─────────────────┬──────────────────────────┬────────────┐
│ Source          │ Docs                     │ Status     │
├─────────────────┼──────────────────────────┼────────────┤
│ src/auth/       │ 20-implementation/10-auth/     │ ✅ Created │
│ src/api/        │ 20-implementation/20-api/      │ ✅ Created │
│ src/core/       │ 20-implementation/30-core/     │ ✅ Created │
│ src/utils/      │ (skipped)                │ ⏭️ Skip    │
└─────────────────┴──────────────────────────┴────────────┘

Next Steps:
1. Run /docs:interview-codebase src/auth/ to start knowledge extraction
2. Repeat for each section
3. Run /docs:draft to generate full documentation
```

## Output

- Created directories and files in `20-implementation/`
- Coverage map (source → docs)
- Clear next steps with specific commands
