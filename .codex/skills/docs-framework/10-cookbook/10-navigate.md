---
covers: How to navigate documentation to understand the codebase — the SCAN/SKIM/READ algorithm.
concepts: [navigate, research, understand, traversal, scan, skim, read, progressive-disclosure]
---

# Navigate: Understanding the Codebase

When you need to understand something about the codebase, navigate the documentation first using progressive disclosure. This minimizes token usage while ensuring you find the right information.

---

## Entry Points

| What You Need | Start Here |
|---------------|------------|
| Architecture, code structure, how things work | `docs/20-implementation/00-overview.md` |
| Purpose, principles, boundaries, "why" | `docs/00-foundation/00-overview.md` |

---

## The Three-Phase Algorithm: SCAN → SKIM → READ

### Phase 1: SCAN (Frontmatter Only)

Read only the `covers` field from frontmatter (~10-20 tokens).

**Decision:** Is this file potentially relevant?
- **YES** → Continue to SKIM
- **NO** → Skip this file entirely

```yaml
# What you read:
---
covers: How to link from documentation to code files.
---

# What you skip:
Everything else in the file
```

### Phase 2: SKIM (Opening Paragraph)

Read content between frontmatter and the first `---` delimiter (~50-100 tokens).

**Decision:** Do I have enough context?
- **YES** → Stop here, move to next file
- **NO** → Continue to READ

```markdown
# What you read:
---
covers: ...
---

# Title

This opening paragraph elaborates on covers. It provides
enough context to decide whether you need the full details.

---                    ← Stop here if SKIM is sufficient

## Detailed Section    ← Only read if SKIM wasn't enough
```

### Phase 3: READ (Full Content)

Read everything below the opening delimiter. Only reach this phase when:
- Implementing changes that require full understanding
- The topic is central to your current task
- SKIM raised questions that need detailed answers

---

## Core Algorithm

```pseudocode
function navigate(task):
    # Step 1: Prime with Foundation (SCAN+SKIM all, READ rarely)
    for file in [overview, purpose, principles, boundaries]:
        fm = scan_frontmatter(file)           # SCAN
        opening = skim_opening(file)          # SKIM
        if need_full_detail(task, opening):
            content = read_full(file)         # READ (rare for Foundation)

    # Step 2: Navigate Codebase using three-phase disclosure
    L1 = "docs/20-implementation/00-overview.md"
    fm = scan_frontmatter(L1)                 # SCAN L1
    sections = skim_opening(L1)               # SKIM L1 for section index
    relevant = filter_by_task(sections, task)

    for section in relevant:
        L2 = f"docs/20-implementation/{section}/00-overview.md"

        # SCAN L2
        fm = scan_frontmatter(L2)
        if not relevant(fm.covers, task):
            continue  # Skip entire section

        # SKIM L2 for child nodes
        children = skim_opening(L2)

        for child in children:
            # SCAN L3
            fm = scan_frontmatter(child)
            if not relevant(fm.covers, task):
                continue  # Skip this node

            # SKIM L3
            opening = skim_opening(child)
            if sufficient(opening, task):
                continue  # Have enough context

            # READ L3 full content
            content = read_full(child)
            code_refs = extract_code_references(content)

            # Continue to L4-L6 only if needed...
            for file in code_refs:
                header = read_file_header(file)  # L4
                if not relevant(header, task):
                    continue

                functions = identify_needed_functions(header, task)
                for func in functions:
                    docstring = read_docstring(func)  # L5
                    if need_implementation(docstring, task):
                        implementation = read_code(func)  # L6

            if task_complete():
                return
```

---

## Decision Heuristics

### When to Stop at SCAN
- `covers` clearly indicates irrelevant topic
- Already found answer in a higher-level file
- Section is outside task scope

### When to Stop at SKIM
- Opening paragraph answers your question
- You're building a mental map, not implementing
- Task requires breadth over depth

### When to READ
- Implementing changes in this area
- SKIM raised unanswered questions
- Task specifically targets this concept

### When to Check `depends-on`
- Before modifying: ensure you understand prerequisites
- When confused: missing context may be in dependencies
- For complex features: trace the dependency graph

### When to Backtrack
- File header shows wrong file
- Section overview indicates wrong domain
- Gone too deep without finding relevance

---

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| **Exhaustive Reading** | Reading full content of all files | SCAN first, SKIM selectively |
| **Skipping SCAN** | Going straight to READ | Always check `covers` first |
| **Depth-First Everything** | Going to L6 for every file | Stop when you have enough |
| **Context Hoarding** | Loading "just in case" content | Trust SCAN/SKIM to filter |
| **Ignoring `depends-on`** | Missing prerequisites | Check deps when confused |

---

## Token Economics

| Approach | 10-file search |
|----------|----------------|
| Read all files fully | ~10,000 tokens |
| SCAN all, READ relevant | ~4,000 tokens |
| **SCAN/SKIM/READ** | ~2,500 tokens |

The savings compound with codebase size.

---

## Examples

### Quick Concept Lookup
```
Task: "What's our rate limiting strategy?"

SCAN: 20-implementation/00-overview.md → covers: architecture overview ✓
SKIM: Opening mentions "API section for external integrations"

SCAN: 20-implementation/20-api/00-overview.md → covers: API section ✓
SKIM: Lists rate-limiting.md as child

SCAN: rate-limiting.md → covers: rate limiting strategy ✓
SKIM: "Token bucket algorithm, 100 req/min default" → SUFFICIENT

Result: 3 SCANs, 3 SKIMs, 0 full READs
```

### Implementation Change
```
Task: "Increase rate limit for premium users"

SCAN → SKIM: Navigate to rate-limiting.md (same as above)
READ: Full content needed for implementation details
      → Code ref: rateLimit.ts:45

L4: Read file header → checkLimit() handles tier logic
L5: Read checkLimit() docstring → takes userTier param
L6: Read implementation → modify tier threshold

Result: 3 SCANs, 3 SKIMs, 1 full READ, then L4→L5→L6
```
