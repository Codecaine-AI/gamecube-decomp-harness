---
covers: How documentation references code files — one-way linking from docs to code.
concepts: [code-linking, references, file-paths, inline-references]
---

# Code References

How documentation references code files. Inline references within prose, optional file summaries for complex topics, and one-way linking (docs point to code, code does NOT point back).

---

## Core Principle

**Documentation points to code. Code does NOT point back.**

This keeps maintenance simple:
- When you rename a doc, update links in parent docs only
- No need to hunt through code files for doc references
- Single source of truth for the relationship

---

## Inline References (Default)

Reference code files naturally within your prose:

```markdown
## Session Management

The session system maintains user state across requests. When a user
logs in via `src/auth/login.ts`, a session is created in
`src/auth/session/manager.ts` and stored via the Redis store in
`src/auth/session/stores/redis.ts`.

On subsequent requests, the auth middleware in `src/middleware/auth.ts`
validates the session token and attaches session data to the request.
```

This approach:
- Introduces files in context
- Explains WHY each file matters
- Reads naturally for humans and AI

---

## Optional: Related Files Summary

For documentation covering many files, add a simple list at the end:

```markdown
## Related Files

- `src/auth/login.ts` - Login handler
- `src/auth/session/manager.ts` - Session lifecycle
- `src/auth/session/stores/redis.ts` - Redis storage
- `src/middleware/auth.ts` - Request validation
- `tests/auth/session.test.ts` - Test suite
```

**Use when:**
- Documentation references 4+ files
- Readers need a quick reference list
- Files are scattered through a long document

**Skip when:**
- Only 1-3 files referenced
- Inline references are clear enough

---

## Anti-Patterns

### ❌ Vague Pointers
```markdown
## Related Files
- `src/` - The source code
- Various files implement this
```
Always be specific about which files and why.

### ❌ Outdated References
```markdown
- `src/OldService.js` - Main implementation
```
Update references when files move or rename.

### ❌ Missing Context
```markdown
- `userRepository.ts`
- `processOrder()`
```
Include full path and brief description.

### ❌ Elaborate Navigation
```markdown
## Code Pointers

**Start Here**: `src/auth/index.ts`
**Then read**: `src/auth/jwt.ts`
**For debugging**: See `src/auth/errors.ts`
**If adding features**: Modify `src/auth/providers/`

Choose engine.py when modifying execution semantics;
choose repository.py for storage concerns.
```
Keep it simple. List files, explain briefly, let readers navigate.

### ❌ Bidirectional Links
```typescript
/**
 * @related-docs
 * - docs/30-auth/10-jwt.md
 */
```
Don't add doc links in code. Docs point to code, not vice versa.

---

## Summary

1. Reference code inline as you discuss concepts
2. Add a simple file list for complex docs with many files
3. Explain WHY someone would look at each file
4. Keep references current when code changes
5. One-way linking: docs → code only
