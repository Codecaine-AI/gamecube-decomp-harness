---
covers: How the system prompt's input declaration becomes the formatter's output contract
type: contract
concepts: [contract, inputs, stability, naming, versioning]
depends-on: [20-inputs/00-overview.md]
---

# Input Contracts

The formatter's output is constrained by the system prompt. Whatever fields the prompt names, in whatever shape the prompt expects them, the formatter must produce. That constraint is the **input contract**.

The contract is not written separately. It is the declaration that already lives in the system prompt:

- **Task** — the sub-tags inside `<context>` (`<data>`, `<document>`, `<message>`, `<prior_output>`, …).
- **Workflow** — the bullets inside `<workflow><inputs>`.
- **Multi-turn** — the bullets inside `<workflow><inputs>`, plus any state paths the prompt references.

Once those are fixed, the formatter has its target. If the system prompt names `<customer><tier>`, the formatter emits `<customer><tier>`. If the prompt iterates over `state.questions[]`, the formatter emits a `<questions>` block of `<question>` elements.

## Drafting Order

```text
1. Pick the system prompt type.
2. Draft the system prompt, including its <inputs> (or <context> sub-tags).
3. Lift the contract out of that declaration.
4. Implement the formatter to satisfy it.
5. Test the formatter against the contract before wiring up the model call.
```

Doing it in the other order — building the formatter first, then writing a prompt that "uses what we have" — produces prompts shaped like the database instead of prompts shaped like the work.

## Contract Surface

The contract has four surfaces. Each one is a place the formatter and the prompt have to agree.

| Surface | What it specifies | Where it lives |
| --- | --- | --- |
| **Field names** | The exact tag the model will look for | System prompt's `<inputs>` or `<context>` sub-tags |
| **Field shape** | Scalar, record, list, nested record | Same |
| **Field order** | Position of each field within its parent | Same — top-to-bottom in the declaration |
| **Inclusion rule** | Whether a missing field is omitted or rendered as empty | Either spelled out in the prompt, or governed by the default rules below |

## Stability Rules

These are the rules that keep the formatter and the prompt aligned over time.

### Names are exact

If the prompt says `<account_age_days>`, the formatter emits `<account_age_days>`. Not `<accountAgeDays>`, not `<age_days>`. Renaming a field is a contract change — both sides update together.

### Order is fixed

Inside any tag, fields appear in the same order on every call. Stable order keeps the rendered message byte-stable across calls that share the same state, which is what lets prompt caching work. Sort keys are static (defined by the formatter), never derived from the data.

```text
# Good — fixed order
function format_customer(c):
    return wrap("customer", [
        ("name",             c.name),
        ("tier",             c.tier),
        ("account_age_days", c.account_age_days),
    ])

# Bad — order depends on what's in the dict
function format_customer(c):
    return wrap("customer", [(k, v) for k, v in c])  # iteration order is data-dependent
```

### Missing vs. omitted

Two distinct cases for an absent value:

- **Omit the tag entirely** when the field is genuinely not applicable on this call. The model sees one fewer block and infers "not relevant."
- **Render the tag with an empty body** (or a sentinel like `none`) when the prompt expects the field to always be present and absence is itself information.

Pick one rule per field and apply it consistently. A field that sometimes appears and sometimes appears empty teaches the model nothing.

Default rule for this skill: **omit when absent.** Render explicitly empty only when the prompt's behavior depends on knowing the field was checked.

### Shape is fixed

A field that is a record on one call must be a record on every call. A field that is a list must always be a list — even when it has zero or one element. The model is much worse at handling "sometimes a string, sometimes an array" than the formatter is at always emitting the array.

```text
# Good
<tags>
    <tag>refund</tag>
</tags>

# Bad — single-element collapses to a string
<tags>refund</tags>
```

### Source of truth is state, not arguments

The formatter takes state in and emits text out. It does not accept ad-hoc keyword arguments that change the shape. If a caller wants a different shape, that is a different formatter (or a different prompt). A single formatter with branches like "if `verbose=true`, also include …" has two contracts and will eventually diverge from both.

## Testing the Contract

The formatter is pure: same state in, same bytes out. That makes it easy to test without touching a model.

```text
test "formatter matches contract for the refund example":
    state    = load_fixture("refund_request.json")
    expected = load_fixture("refund_request.user_message.txt")
    actual   = format_user_message(state)
    assert actual == expected
```

One snapshot per representative case. When the contract changes, the snapshot changes — the diff is the contract change, made visible.

Useful cases to snapshot:

- Minimum viable state (only required fields).
- Full state (every optional field present).
- Each conditional-inclusion field, separately.
- Sliding-window edge: empty, exactly at limit, over limit.

## Versioning

When the contract changes, both sides change in the same commit:

1. Edit the system prompt's `<inputs>` (or `<context>` sub-tags).
2. Update the formatter to match.
3. Update the snapshot fixtures.
4. If the prompt is cached, bump whatever cache key the application uses.

If the change is breaking and old state still exists, write a migration in the application — not a compatibility shim in the formatter. The formatter stays a pure function of one well-defined shape.

## Anti-Patterns

- **Don't let the formatter invent field names.** If the prompt didn't declare it, the formatter doesn't emit it. Surprise tags read as noise.
- **Don't emit fields the prompt didn't ask for "just in case."** Extra fields enlarge the message, hurt cache locality, and tempt future prompts to start depending on undocumented data.
- **Don't normalize values silently.** If the prompt expects ISO dates, the formatter converts to ISO. But document that conversion at the formatter — not by changing it without telling the prompt.
- **Don't make the formatter dynamic.** No "smart" logic that picks fields based on heuristics. The contract is declarative; the formatter is mechanical.
- **Don't conflate inclusion rules.** Pick "omit when absent" or "always present, possibly empty" per field. Mixing both for the same field hides bugs.
