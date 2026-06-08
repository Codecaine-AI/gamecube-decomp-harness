# Melee PR Shaping And Reviewer Guidance

Use this when designing a Melee PR or PR series, regrouping existing changes,
or writing PR bodies. Optimize for maintainer review and regression signal, not
for a simple path-based split.

## Reviewer Model

Maintainers need to answer three questions quickly:

- What conceptual change am I reviewing?
- Which files deserve careful semantic attention?
- Can the regression tooling be trusted, or did the PR create naming/header
  noise that makes deleted-and-created symbols look like regressions?

Make PRs boring to triage. Avoid mixing changes that require different review
mindsets unless the combined scope is still small and cohesive.

## Risk Classes

Classify each touched file/change before splitting:

- **Low review cost**: local `.c` implementation work, matched function bodies,
  removed nonmatching asm, local callsite updates, narrow comments around proven
  matches.
- **Medium review cost**: local headers, local prototypes, local structs,
  nearby include changes, file-local data declarations.
- **High review cost**: shared headers, common structs, exported prototypes,
  broad include churn, build/config changes, symbol metadata changes, changes
  that affect multiple translation units.
- **Very high review cost**: symbol renames, large naming sweeps, global header
  reshaping, broad type/layout changes, or anything that can make the bot treat
  a renamed symbol as deleted plus newly created.

## Split And Group Rules

- Split on reviewer cognition and bot-risk boundaries, not directory paths.
- Prefer one PR per subsystem, actor/module family, matching milestone,
  mechanical cleanup category, or header/API adjustment.
- Group small PRs when they share one review context, touch the same subsystem,
  and are mostly low-cost implementation changes.
- Keep broad header, naming, symbol, build, or metadata churn out of ordinary
  decomp/body PRs unless the PR is intentionally about that change.
- Isolate rename-only or declaration-only work when it would otherwise obscure
  regression output.
- Do not mix a high-risk rename/header sweep with meaningful implementation
  matching work just because the files are nearby.
- Keep tool or regression-gate changes separate from decomp source changes.
- A large PR can be acceptable when it is mechanically uniform and easy to
  verify. A smaller PR can still be bad if it combines unrelated review risks.

## Size Budget

Use file count as a warning light, not a hard rule:

- **Ideal**: 5-25 files, one concept, no broad naming/header churn.
- **Acceptable**: 25-45 files if cohesive, mostly implementation, and the PR
  body clearly calls out hotspots.
- **Split by default**: 45+ files unless the changes are mechanically uniform
  and low-risk.
- **Isolate regardless of size**: broad renames, shared-header churn, symbol
  ownership changes, or changes likely to confuse regression reporting.

When in doubt, choose the shape that lets a maintainer review the PR with one
mental model and lets the bot compare like with like.

## PR Design Procedure

1. Inventory touched files by type: source, local header, shared header, data,
   build/config, generated/tooling, docs.
2. Identify high-risk churn: renames, moved declarations, shared prototypes,
   type/layout changes, symbol metadata, includes, or bot-visible name changes.
3. Identify the natural review units: subsystem, actor/module family, matching
   target, API/header change, or mechanical cleanup.
4. Propose PR groups that keep high-risk churn isolated and combine low-risk
   implementation work only when it shares one review context.
5. For each PR group, write down why the grouping is reviewer-friendly and what
   would force a split.
6. Before handoff, run the normal build/regression gates and explicitly note any
   false-positive risk caused by renames or header movement.

## PR Body Template

Write the PR body as a reviewer-facing digest. It should let a maintainer know
what to expect before opening the diff.

```markdown
## Summary

- <main change in reviewer terms>
- <secondary change, if any>
- <verification or matching outcome>

## PR Shape

- Scope: <subsystem/module/family>
- Change type: <implementation-only/header-only/rename-only/mixed but scoped>
- Review risk: <low/medium/high> because <short reason>
- Header/naming churn: <none/local/shared/rename-only details>
- Regression signal: <clean/expected noise and why>
- Grouping rationale: <why these changes belong together>

## Reviewer Notes

- <files or symbols that deserve focused review>
- <intentional mechanical changes>
- <known non-obvious matching tactic, if any>

## Verification

- `ninja`
- `<objdiff/checkdiff/regression command>`
- <bot/regression summary: broken matches, fuzzy regressions, metric regressions>
```

Prefer specific file families, symbols, and risk notes over generic claims like
"misc cleanup." If a PR is large, the body must include a short review map that
names the major clusters and any hotspots.
