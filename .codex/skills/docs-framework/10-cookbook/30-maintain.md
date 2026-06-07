---
covers: How to maintain documentation alignment — update and audit workflows for ongoing changes.
concepts: [maintain, write, audit, drift, alignment, chore, bugfix, refactor]
---

# Maintain: Keeping Docs Aligned

When making changes to existing code—bug fixes, refactors, chores—documentation may drift from reality. The maintain workflow uses change context to find drift, then rewrites affected docs so they describe the current system.

---

## When to Use

- Bug fixes that change behavior
- Refactoring that restructures code
- Chores and minor updates
- Periodic health checks
- Before major releases

---

## The Maintenance Workflow

```
┌─────────────┐     ┌─────────────┐
│    Write    │ ──▶ │   Audit     │
│  (update)   │     │  (verify)   │
└─────────────┘     └─────────────┘
```

### Step 1: Write (Update Docs)

**Purpose:** Update documentation to match current code using implementation notes.

**Load:** `../30-workflows/50-write.md`

**Input:** Provide notes describing what changed:
- Implementation notes from the work you just completed
- A summary of the refactor or bug fix
- Description of new functionality added

**Writing rule:** Treat notes as analysis input, not final wording. The finished docs should describe what exists now, not narrate the update path that produced it.

**Process:**
- Reads existing docs and source code
- Shows what will be created/updated
- Writes the documentation changes

**Output:** Updated L2/L3 documentation aligned with current code and written as present-state documentation.

### Step 2: Audit (Verify Health)

**Purpose:** Validate documentation structure, frontmatter, and overall health.

**Load:** `../30-workflows/70-audit.md`

**Checks:**
- Frontmatter schema compliance
- Required fields present
- Numbering system followed
- Cross-references valid
- No orphaned docs

**Output:** Health report with pass/fail per check.

---

## Maintenance Triggers

| Trigger | Action |
|---------|--------|
| After code change | Write with implementation notes |
| After refactor | Write on refactored section |
| Weekly/sprint boundary | Audit on active sections |
| Before release | Full audit on entire `docs/` |

---

## Commands

| Command | Purpose | Workflow |
|---------|---------|----------|
| `/docs:write <path> [notes]` | Update docs from notes | `30-workflows/50-write.md` |
| `/docs:audit [quick\|deep]` | Validate structure and health | `30-workflows/80-audit.md` |

---

## Quick vs Deep Audit

| Mode | Scope | Checks |
|------|-------|--------|
| **Quick** | Single section | Frontmatter, structure |
| **Deep** | Full `docs/` | Everything + cross-refs |

---

## Drift Prevention

To minimize maintenance burden:

1. **Document as you code** — Don't accumulate debt
2. **Write notes as you implement** — Capture context while fresh
3. **Include docs in review** — Make docs part of "done"
4. **Automate audits** — CI check for frontmatter schema

---

## Common Drift Patterns

| Pattern | Symptom | Fix |
|---------|---------|-----|
| **Renamed function** | Docstring references old name | Update L5 docstring |
| **Moved file** | Code ref points to old path | Update `code-ref` in L3 |
| **Deleted feature** | Doc exists for removed code | Remove orphaned doc |
| **New parameter** | Docstring missing param | Update L5 docstring |
| **Changed behavior** | Doc describes old behavior | Revise L3/L4 description |

When revising drifted docs, replace outdated statements with current facts. Avoid phrases like "now", "no longer", "previously", or "changed from" unless the document is explicitly about migration history or version compatibility.
