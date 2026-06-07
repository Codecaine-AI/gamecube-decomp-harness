---
covers: XML tag conventions, ordering, indentation, escaping, and the rules that keep the user message cache-stable
type: principles
concepts: [xml-tags, naming, ordering, escaping, sliding-window, cache-stability]
depends-on: [20-inputs/00-overview.md, 20-inputs/10-input-contracts.md]
---

# Formatting Principles

These are the rules the formatter follows when it converts state into the user message. They are language-agnostic — every example is pseudocode.

## Tag Conventions

### Use semantic names

Tags name the *role* of the data, not its type. `<customer>`, `<request>`, `<conversation>` — not `<object_1>`, `<dict>`, `<array>`.

```text
# Good
<customer>
    <name>Acme Corp</name>
</customer>

# Bad
<data>
    <field name="name">Acme Corp</field>
</data>
```

### Lowercase, snake_case

`<account_age_days>`, not `<accountAgeDays>` or `<AccountAgeDays>`. One convention across every formatter and every prompt in the project.

### Singular for one, plural for many

`<message>` for one message; `<messages>` containing `<message>` children for many. Same word, different cardinality — the model picks up the pattern instantly.

```text
<messages>
    <message role="user">…</message>
    <message role="assistant">…</message>
</messages>
```

### Attributes for metadata, body for content

When an item has both a payload and a small classifier (a role, a type, a timestamp), put the classifier in an attribute and the payload in the body. The model reads it as "labeled content" rather than "two sibling fields."

```text
# Good
<message role="user">I need a refund for the December outage</message>

# Acceptable but noisier
<message>
    <role>user</role>
    <content>I need a refund for the December outage</content>
</message>
```

Attributes work best for low-cardinality enums (role, status, type). For anything bigger, use a child tag.

## Indentation and Spacing

### Four-space indent inside tags

Pick one indentation width and use it everywhere. This skill uses four spaces. The choice is arbitrary; consistency is not.

```text
<customer>
    <name>Acme Corp</name>
    <tier>enterprise</tier>
</customer>
```

### Blank line between top-level blocks

Top-level sections (`<customer>`, `<request>`, `<conversation>`) are separated by one blank line. Nested children are not. The blank line is a visual cue to the model that one block has ended and another begun.

```text
<customer>
    <name>Acme Corp</name>
</customer>

<request>
    <type>refund</type>
</request>
```

### No trailing whitespace, single trailing newline

The rendered message ends with exactly one newline. Trailing spaces and double-newlines are noise that varies between languages' default string handling — make the formatter normalize them.

## Ordering

### Fixed at write time

Inside any tag, child order is decided by the formatter, not by the data. Iterating over a hash/dict's keys produces order that depends on insertion or hash seed, neither of which the formatter should expose to the model.

```text
# Good — order is part of the formatter
function format_customer(c):
    return wrap("customer", [
        ("name",             c.name),
        ("tier",             c.tier),
        ("account_age_days", c.account_age_days),
    ])

# Bad — order leaks from the runtime
function format_customer(c):
    return wrap("customer", c.entries())
```

### Section order within the message

Inside the message as a whole, sections appear in a fixed top-to-bottom order. A reasonable default:

1. Brief instruction line ("Process this customer request:").
2. Identity and context that doesn't change within a session (`<customer>`, `<account>`).
3. The current request or input (`<request>`, `<message>`, `<document>`).
4. Verified facts and supporting context (`<verified_context>`, `<retrieved>`).
5. History (`<conversation>`, `<prior_outputs>`).
6. Closing instruction ("Generate the response.").

Stable across calls. Sections that aren't applicable on this call are omitted entirely; the order of the remaining sections does not change.

### Why ordering matters for caching

Most providers' prompt caches key on a prefix of the message. Two calls whose state happens to differ only after position N will share the cache up to position N — but only if everything before N is byte-identical. Stable ordering is the cheapest way to make that true.

Put the longest-lived sections first. Identity and configuration that holds across many calls goes near the top; the most volatile content (current request, latest tool result) goes near the bottom.

## Conditional Inclusion

The default rule: **omit the tag entirely when the value is absent.**

```text
function format_customer(c):
    fields = []
    if c.name:             fields.append(field("name",             c.name))
    if c.tier:             fields.append(field("tier",             c.tier))
    if c.account_age_days: fields.append(field("account_age_days", c.account_age_days))
    if fields is empty:    return ""
    return wrap("customer", fields)
```

Two consequences:

- A whole section disappears when none of its fields are populated. The message gets shorter; the model is not told "everything is empty."
- The contract for that field must say "may be omitted." If the prompt branches on whether the field is present, that branch is now load-bearing — make it explicit.

When absence is meaningful, render the tag explicitly empty:

```text
<verified_context>
    <outage_confirmed>false</outage_confirmed>
</verified_context>
```

That tells the model "we checked, and it's false," which is different from "we didn't check."

Pick one rule per field and stick to it. Mixing the two on the same field is the source of subtle bugs.

## Sliding Windows for Unbounded Sources

Conversation histories, log streams, and retrieved-document lists grow without bound. The formatter applies a window so the message size stays predictable.

```text
function format_conversation(messages, max=20):
    if messages is empty: return ""
    recent = last_n(messages, max)
    items  = [render_message(m) for m in recent]
    return wrap("conversation", items)
```

Notes:

- **Last-N is the default.** Most recent messages matter most.
- **Token-bounded windows beat count-bounded windows** when items vary in size — but require a tokenizer. If you don't have one, count-bound and pick a conservative N.
- **Summarize older content separately** when it matters. Two blocks: `<conversation_summary>` for the squashed older messages, `<conversation>` for the recent verbatim ones.
- **The window size is part of the contract.** The system prompt and the formatter agree on it. Don't tune it silently.

## Escaping and Sanitization

User-supplied content goes inside semantic tags (`<message>`, `<document>`, `<query>`). That alone provides most of the injection resistance.

A few additional rules:

- **Keep the tag wrap intact.** If user content contains the literal string `</message>`, the message structure breaks. Either replace with an entity (`&lt;/message&gt;`), strip it, or wrap user content in CDATA-style fences. Pick one and apply consistently.
- **Don't escape `<` and `>` inside trusted, structural content.** The formatter's own tags are not user-supplied; only escape inside the user-supplied body.
- **Don't trim user content.** Whitespace can carry meaning. Render it as-is inside the tag.

```text
function field(tag, value):
    return `<${tag}>${escape(value)}</${tag}>`

function escape(value):
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
```

Apply `escape` only to leaf scalars that originated outside the system. The formatter's own tags pass through.

## Determinism

Two calls with identical state must produce identical bytes. Sources of nondeterminism to watch:

- **Hash/dict iteration order.** Sort keys explicitly or use an ordered structure.
- **Floating-point formatting.** Use a fixed precision; do not rely on language defaults.
- **Date formatting.** Always ISO-8601 with explicit timezone. Locale-default formats vary by environment.
- **`Date.now()` or equivalents.** Don't read the clock from inside the formatter — pass timestamps in via state.

If two calls with the same state produce different messages, the formatter has a bug, even when the model handles it gracefully. The bug shows up as a cache miss long before it shows up as wrong output.

## Anti-Patterns

- **Mixing prose and tags at the top level.** Either the message is structured XML-tagged sections, or it is prose. Pick one, then write a brief unstructured intro/outro line if needed.
- **Re-using a tag for two different things.** `<context>` for both static background and dynamic retrieved chunks teaches the model nothing. Pick distinct names.
- **Encoding data twice.** A field that is `<status>active</status>` and *also* `<is_active>true</is_active>` invites the model to pick one and ignore the other.
- **Putting JSON inside a tag.** If the data is structured, render it as nested tags. JSON-in-XML asks the model to parse twice and breaks the boundary the tags exist to provide.
- **Trailing instructions before user content.** Closing instructions ("Generate the response.") go at the bottom, after all data. Putting them above the data lets injected content override them.
