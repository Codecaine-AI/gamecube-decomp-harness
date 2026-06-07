---
covers: Task type — single call, single transform, single output, minimal structure
type: prompt-type
concepts: [task, single-completion, transform, classification, extraction]
depends-on: [10-system-prompts/00-overview.md]
---

# Task Prompt Archetype

## Shape

```text
Task System Prompt
├─ <task>           Concrete, measurable outcome. Imperative voice.
├─ <context>        User input, wrapped in sub-tags.
├─ <constraints>    Hard requirements.
├─ <output_format>  Literal skeleton of the expected response.
└─ <examples>       Optional. One good + one bad. Skip if format is obvious.
```

## Reference Template

```xml
<!--
  TASK
  Format: One imperative sentence (or two)

  The concrete, measurable outcome. The task itself is the role.
  No "you are a..." framing — the imperative gives the model its job.

  BAD: "You are a helpful sales analyzer"
  GOOD: "Analyze the following sales data and identify the three highest-impact trends."
-->
<task>
    [Imperative statement of what to produce]
</task>

<!--
  CONTEXT
  Format: User input wrapped in sub-tags

  Separate user-supplied data from instructions. Sub-tags prevent
  prompt injection and let the model distinguish content from directives.

  Common sub-tags: <data>, <background>, <document>, <history>, <prior_output>.
-->
<context>
    <data>
        {{USER_INPUT}}
    </data>
</context>

<!--
  CONSTRAINTS
  Format: Bullet list

  Hard requirements: length, tone, format, must-includes, must-excludes.
  Resolve tensions explicitly when constraints could conflict.

  BAD: "Be accurate and complete"
  GOOD: "Prioritize accuracy over completeness when both can't be satisfied"
-->
<constraints>
    - [Hard requirement]
    - [Inclusion or exclusion]
    - [Tension resolution if relevant]
</constraints>

<!--
  OUTPUT FORMAT
  Format: Literal skeleton showing the exact structure

  Show the structure, don't describe it. The model should be able to
  copy the shape directly.

  BAD: "Present the result clearly in a structured format"
  GOOD: '{ "intent": "billing" | "technical" | ..., "confidence": 0.0-1.0 }'
-->
<output_format>
    [Literal skeleton — JSON shape, XML, or strict bullet schema]
</output_format>

<!--
  EXAMPLES (optional)
  Format: One good + one bad, with a brief reason

  Skip when the output format is self-explanatory.
  Include when the format is non-obvious or edge cases need disambiguation.
-->
<examples>
    <good>
        [Example of correct output]
    </good>
    <bad>
        [Example of incorrect output] — reason: [why it's wrong]
    </bad>
</examples>
```

## Key Decisions
- No role block.
  - The task itself provides steering.
- Sub-tags separate user data from instructions (prevents injection).
- Under 500 tokens when possible.
  - Task prompts pay a tax for every unnecessary token.
- Skip examples if output format is self-explanatory.
- Skip thinking tools if task is straightforward.
