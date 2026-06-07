---
covers: Formatting rules for XML-structured Markdown prompt artifacts
type: reference
concepts: [formatting, xml-structure, indentation, bullets]
depends-on: [system_prompt/10-base-template.md]
---

# Formatting Rules

Rules for Markdown prompt artifacts that use XML tags for structure.

## Bullet Points

- All unordered items must use a dash prefix (`-`).
- Numbered lists (`1.` `2.` `3.`) are allowed for sequential workflows where order matters.
- Favor dashes where sequence is not critical.

## Indentation

- All content inside XML tags must be indented 4 spaces.
- Nested content receives another 4 spaces per level.
- Indentation should make hierarchy visible without relying on prose.

## Example

```xml
<!-- WRONG: No indentation -->
<purpose>
- First item
- Second item
</purpose>

<!-- CORRECT: 4-space indentation -->
<purpose>
    - First item
    - Second item
</purpose>

<!-- Nested content: additional indentation per level -->
<workflow>
    <overview>
        1. First phase
        2. Second phase
        3. Third phase
    </overview>

    <step name="example">
        <description>
            - Main instruction point
            - Another instruction point
        </description>
        <constraints>
            - Constraint that applies to this step
            - Another constraint
        </constraints>
    </step>
</workflow>
```
