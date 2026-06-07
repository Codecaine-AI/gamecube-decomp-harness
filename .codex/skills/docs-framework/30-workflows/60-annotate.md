---
covers: Add L4 file headers and L5 function docstrings to source code.
concepts: [annotate, L4, L5, headers, docstrings, code-comments]
---

# Docs Annotate Workflow

Add L4 file headers and L5 function docstrings to source code. These annotations bridge `docs/` (the Why) with implementation (the How) by placing contracts directly in source files.

---

## Purpose

L4 (file headers) and L5 (function docstrings) live IN the source code, not in `docs/`. They provide:
- **L4**: What this file is responsible for (the contract)
- **L5**: What each function does (input/output/side effects)

This bridges `docs/` (the Why) with implementation (the How).

## Prerequisites

- Corresponding `docs/20-implementation/` section exists with L2/L3 documentation
- Ideally, `/docs:interview-codebase` and `/docs:draft` have been run for this section

## Process

### 1. Load Context

Read:
- Corresponding `docs/20-implementation/[section]/` documentation
- Interview notes if available: `docs/.drafts/[section].interview.md`
- Templates:
  - `.claude/skills/docs-framework/40-templates/50-L4-file-header/10-generic.md`
  - `.claude/skills/docs-framework/40-templates/60-L5-docstring/10-generic.md`

### 2. Analyze Target Files

For each source file in the path:

1. **Check existing documentation**:
   - Does an L4 header already exist?
   - Are there existing docstrings?
   - Note what to preserve vs. replace

2. **Identify major functions**:
   - Public/exported functions (priority)
   - Complex private functions
   - Entry points and handlers

3. **Understand the file's role**:
   - From `docs/` documentation
   - From the code itself

### 3. Generate L4 Headers

For files without headers (or with inadequate headers), propose:

```
┌─────────────────────────────────────────────────────────────────┐
│ File: src/auth/session.py                                       │
├─────────────────────────────────────────────────────────────────┤
│ Proposed L4 Header:                                             │
│                                                                 │
│ """                                                             │
│ Session Management                                              │
│                                                                 │
│ Responsibilities:                                               │
│ - Create and validate user sessions                             │
│ - Store session data in Redis                                   │
│ - Handle session expiration and cleanup                         │
│                                                                 │
│ Dependencies:                                                   │
│ - redis: Session storage                                        │
│ - jwt: Token generation (via token_service)                     │
│                                                                 │
│ Docs: docs/10-auth/10-session-lifecycle.md                  │
│ """                                                             │
└─────────────────────────────────────────────────────────────────┘

Add this header? [y/n/edit]
```

**L4 Header Guidelines:**
- Keep under 50 lines (scannability)
- Focus on WHAT, not HOW
- Include link to relevant `docs/` section
- List key dependencies
- State responsibilities as bullet points

### 4. Generate L5 Docstrings

For major functions without docstrings, propose:

```
┌─────────────────────────────────────────────────────────────────┐
│ Function: create_session(user_id, metadata)                     │
├─────────────────────────────────────────────────────────────────┤
│ Proposed L5 Docstring:                                          │
│                                                                 │
│ """                                                             │
│ Create a new session for the given user.                        │
│                                                                 │
│ Args:                                                           │
│     user_id: Unique identifier for the user                     │
│     metadata: Optional dict of session metadata                 │
│                                                                 │
│ Returns:                                                        │
│     Session object with token and expiration                    │
│                                                                 │
│ Raises:                                                         │
│     SessionLimitError: If user exceeds max concurrent sessions  │
│                                                                 │
│ Side Effects:                                                   │
│     - Writes to Redis                                           │
│     - May invalidate oldest session if at limit                 │
│ """                                                             │
└─────────────────────────────────────────────────────────────────┘

Add this docstring? [y/n/edit]
```

**L5 Docstring Guidelines:**
- Start with action verb (Create, Validate, Process...)
- Document all parameters with types if not typed
- Document return value
- Document exceptions/errors raised
- Document side effects (DB writes, external calls, state changes)
- Keep concise - this is a contract, not a tutorial

### 5. Apply Changes

For each approved header/docstring:
1. Show the exact change to be made
2. Apply with user confirmation
3. Preserve existing code formatting

### 6. Summary

Output completion summary:

```
Annotation Complete!

Path: src/auth/
═══════════════════

L4 Headers Added:
- src/auth/session.py
- src/auth/token_service.py
- src/auth/middleware.py

L5 Docstrings Added:
- session.py: create_session, validate_session, expire_session
- token_service.py: generate_token, verify_token
- middleware.py: auth_required (decorator)

Skipped (already documented):
- src/auth/__init__.py
- src/auth/constants.py

Next Steps:
1. Review the added documentation in your editor
2. Run tests to ensure no syntax errors introduced
3. Continue with /docs:annotate on other directories, OR
4. Run /docs:audit to validate overall documentation health
```

## Language-Specific Formats

### Python
```python
"""
File header or docstring content.
"""
```

### JavaScript/TypeScript
```javascript
/**
 * File header or JSDoc comment.
 * @param {type} name - Description
 * @returns {type} Description
 */
```

### Go
```go
// Package auth handles authentication and session management.
//
// Responsibilities:
// - Create and validate user sessions
// - Store session data in Redis
```

### Rust
```rust
//! Module-level documentation (L4)
//!
//! Responsibilities:
//! - Create and validate user sessions

/// Function-level documentation (L5)
///
/// # Arguments
/// * `user_id` - The user's unique identifier
```

Adapt the format to match the language and existing conventions in the codebase.

## Output

- List of files modified
- Headers and docstrings added
- Files skipped and why
- Next steps
