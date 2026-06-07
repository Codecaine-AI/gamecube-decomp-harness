# Thinking Frameworks

Scaffolding that changes HOW the model reasons. Use sparingly — most prompts need zero frameworks. Only add one if the task has a specific failure mode that a framework addresses. "It might help" is not a reason.

---

## Inversion

Define failure before pursuing success.

```xml
<approach>
Before generating your response:
1. What would make this output useless or generic?
2. What are the 3 most likely failure patterns for this type of task?
3. Generate your response while actively avoiding every failure you identified.
</approach>
```

**Use when:** The main risk is generic, average output. Creative tasks, strategy, content generation.
**Skip when:** Clear right/wrong answers (math, code, factual lookup).

---

## First Principles

Decompose before solving. Prevents pattern-matching to "the usual answer."

```xml
<approach>
Before answering:
1. What are the fundamental components of this problem?
2. What constraints are real vs assumed by convention?
3. Build your answer from fundamentals. Do not pattern-match against similar problems.
</approach>
```

**Use when:** Novel problems, technical architecture, situations where conventional approaches are suspect.
**Skip when:** The conventional approach is fine.

---

## Contention

Two opposing lenses that must be reconciled.

```xml
<approach>
Analyze from two opposing angles before synthesizing:
- The case FOR: strongest possible argument, best-case scenario
- The case AGAINST: fatal flaws, worst-case scenario
Synthesize an actionable position that accounts for both.
</approach>
```

**Use when:** Decisions, strategy, anything where single-perspective output is flat.
**Skip when:** The task doesn't involve judgment or tradeoffs.

---

## Constraint-First

Define solution space by its boundaries before generating.

```xml
<approach>
Before generating:
1. List every hard constraint (non-negotiable)
2. List every soft constraint (nice-to-have)
3. Where do constraints conflict? Resolve with explicit priority.
4. What CANNOT the output be? (negative space)
5. Generate only within what remains
</approach>
```

**Use when:** Many requirements, design problems, creative work within tight briefs.
**Skip when:** Few constraints, open-ended exploration.

---

## Cross-Domain Transfer

Import frameworks from unrelated fields to force non-obvious thinking.

```xml
<approach>
Before answering:
1. Identify a mental model from a completely different domain that applies here
2. What would a practitioner from that domain notice that a domain expert would miss?
3. Apply that borrowed framework to generate at least one non-obvious insight
4. Integrate into your main analysis
</approach>
```

**Use when:** Innovation, strategy, breaking out of conventional thinking.
**Skip when:** The task needs precision and established methodology, not novel angles.

---

## Recursive Depth

Force deeper passes on initial output.

```xml
<approach>
After your initial response:
1. What's the most superficial claim you made? Go one level deeper.
2. What would an expert push back on? Address it.
3. What did you leave out because it's hard to explain? Include it.
Revise incorporating these deeper layers.
</approach>
```

**Use when:** Research, analysis, tasks where depth matters more than breadth.
**Skip when:** Speed matters more than depth.

---

## Selection Guide

| Risk | Framework |
|------|-----------|
| Output will be generic/average | Inversion |
| Conventional thinking might be wrong | First Principles |
| Need nuanced judgment on tradeoffs | Contention |
| Too many competing requirements | Constraint-First |
| Thinking is stale or conventional | Cross-Domain Transfer |
| Analysis is too shallow | Recursive Depth |
| None of the above | No framework. Just write a good prompt. |

## Combining Frameworks

Occasionally justified. Max 2 per prompt.

| Task Type | Recommended Pair |
|-----------|-----------------|
| Business strategy | Inversion + Cross-Domain Transfer |
| Technical architecture | First Principles + Constraint-First |
| Creative content | Inversion + Recursive Depth |
| Decision support | Contention + Constraint-First |
| High-stakes deliverable | Inversion + Recursive Depth |

Three frameworks is almost always too many. The overhead starts hurting more than it helps.

**Order within the prompt:**
1. Problem-space frameworks first (First Principles, Constraint-First)
2. Perspective frameworks second (Contention, Cross-Domain Transfer)
3. Quality frameworks last (Inversion, Recursive Depth)

## Connects To
- 03: Techniques (lighter-weight tools that don't restructure thinking)
- 05: Anti-patterns that frameworks help prevent
- 06: Evaluation protocol checks whether framework selection was appropriate
