---
covers: One-time initialization of docs/ with three-layer structure.
concepts: [init, initialization, setup, three-layers]
---

# Docs Init Workflow

One-time initialization of `docs/` in your project. Sets up the three-layer structure (Foundation/System Design/Implementation) with minimal starting files.

---

## Prerequisites Check

First, verify the Documentation framework is installed:

1. **Check `.claude/skills/docs-framework/` exists** (framework documentation)
   - If missing: "Copy `.claude/skills/docs-framework/` from the Documentation repository first"

2. **Check `.claude/commands/docs/` exists** (commands)
   - If missing: "Copy `.claude/commands/docs/` from the Documentation repository"

If any prerequisites are missing, stop and instruct the user to copy the missing components.

## Initialization Steps

If all prerequisites pass:

### 1. Show Project Structure
Run: `eza --tree --level=2` (or `tree -L 2` if eza unavailable)
- Exclude: node_modules, .git, build artifacts, __pycache__, etc.

### 2. Check for Existing Documentation

- Does `docs/` already exist?
  - If yes with three-layer structure (`00-foundation/`, `10-system-design/`, `20-implementation/`): Report what exists, suggest `/docs:audit` to validate
  - If yes without structure: "Found docs/ without framework structure. Run this init to set it up."
  - If no: Proceed with creation

### 3. Create Three-Zone Structure

Create minimal starting files—Foundation structure will be determined by the interview:

**Foundation Zone (minimal):**
| File | Content |
|------|---------|
| `docs/00-foundation/00-overview.md` | Placeholder with note to run `/docs:interview-foundation` |

```markdown
---
covers: Understanding of what this project is and why it exists.
type: overview
---

# Foundation

*This section will be populated after running `/docs:interview-foundation`.*

The Foundation interview will explore:
- What is this trying to BE?
- What should it do extremely well?
- How do you think about this problem?

Structure will emerge from that conversation.
```

**System Design Zone:**
| File | Template Source |
|------|-----------------|
| `docs/10-system-design/00-overview.md` | `.claude/skills/docs-framework/40-templates/30-L2-section-overview/10-generic.md` |

**Implementation Zone:**
| File | Template Source |
|------|-----------------|
| `docs/20-implementation/00-overview.md` | `.claude/skills/docs-framework/40-templates/20-L1-codebase-overview/10-generic.md` |

**Drafts Directory:**
| File | Purpose |
|------|---------|
| `docs/.drafts/.gitkeep` | Working directory for interviews |

### 4. Ask Source Directory

Ask the user: "What is your main source code directory?"
- Common patterns like `src/`, `app/`, `lib/`, or project root
- Store this answer for `/docs:scaffold`

### 5. Suggest Next Steps

```
Documentation initialized successfully.

Created:
- docs/00-foundation/00-overview.md (placeholder - run interview to populate)
- docs/10-system-design/00-overview.md (System design overview)
- docs/20-implementation/00-overview.md (Implementation overview)
- docs/.drafts/ (working directory for interviews)

Next steps:
1. Run /docs:interview-foundation — explore what you're building and why
2. Run /docs:write foundation — generate Foundation docs from the interview
3. Edit docs/20-implementation/00-overview.md to describe your codebase
4. Run /docs:scaffold to map your source structure to documentation sections
```

## Output Summary

Provide:
- List of created files by zone
- Project structure visualization
- Clear next steps (Foundation interview first, then structure)
