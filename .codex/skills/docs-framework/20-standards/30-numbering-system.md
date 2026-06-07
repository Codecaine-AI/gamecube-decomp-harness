---
covers: The two-digit numbering scheme for files and directories.
concepts: [numbering, prefix, ordering, insertion]
---

# File Numbering System

The `XX-` prefix system that keeps files ordered and allows for insertion. Two-digit prefixes with gaps of 10, reserved ranges for overview and appendix, and naming conventions.

---

## The Numbering Scheme

Files and directories use two-digit prefixes with gaps of 10:

```
00-overview.md           # Always first (reserved)
10-first-topic.md
20-second-topic.md
30-third-topic.md
...
99-appendix/             # Always last (reserved)
```

---

## Reserved Numbers

| Number | Purpose |
|--------|---------|
| `00`   | Overview files only (`00-overview.md`) |
| `01-09`| Early/foundational content (use sparingly) |
| `10-89`| Main content |
| `90-98`| Late/supplementary content |
| `99`   | Meta/appendix content (e.g., `20-implementation/99-appendix/`) |

---

## Naming Format

```
XX-lowercase-hyphenated-name.md
XX-lowercase-hyphenated-name/
```

Examples:
```
10-authentication.md
20-data-layer/
30-api-design.md
```

Always use two digits. Always use lowercase with hyphens.

---

## Insertion Strategy

Gaps exist so you can insert without renumbering:

```
# Before:
10-authentication.md
20-authorization.md

# Need to add session management:
10-authentication.md
15-session-management.md    # Inserted
20-authorization.md
```

If you run out of gap space, it's a signal to reorganize into a subfolder.

---

## Anti-Patterns

### ❌ No Gaps
```
10-file.md
11-file.md    # No room for insertion
12-file.md
```

### ❌ Inconsistent Format
```
1-intro.md       # Single digit
02-setup.md      # Two digits
section-3.md     # Number at end
```

### ❌ Wrong Reserved Usage
```
00-introduction.md   # 00 is only for overview
99-main-feature.md   # 99 is only for appendix/meta
```
