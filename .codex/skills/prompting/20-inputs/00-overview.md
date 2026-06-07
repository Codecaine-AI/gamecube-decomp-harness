---
covers: Input formatters — code that turns runtime state into the user message of an LLM call
type: overview
concepts: [input-formatter, user-message, state, xml-tags, contract]
depends-on: [00-routing.md, 10-system-prompts/00-overview.md]
---

# Input Formatters

An input formatter is the code that runs immediately before an LLM call. It takes the application's runtime state and produces the user message that pairs with the system prompt.

```text
state object  →  formatter  →  user message  →  LLM call
                                                  ↑
                              system prompt  ──────┘
```

The system prompt is a static artifact (a `.md` file). The user message is constructed at call time from live data — current request, conversation history, tool outputs, retrieved chunks, prior agent state. The formatter is the code that does that construction.

This section is language-agnostic. Examples are written as pseudocode so they map cleanly to TypeScript, Python, Go, or whatever the application is written in.

## Mental Model

Three things live in different places and are joined only at call time:

| Thing | Lives in | Owned by |
| --- | --- | --- |
| **System prompt** | `.md` file on disk | The prompt author |
| **State** | Database, Redis, in-memory object, JSON file | The application |
| **User message** | Built fresh on each call, never persisted | The formatter |

The formatter is glue. It does not own state and it does not own behavior. Its only job is: read the slice of state that this call needs, and emit a user message whose shape matches the contract declared by the system prompt.

## The Contract

Every system prompt declares what runtime data it expects:

- A **Task** declares it via sub-tags inside `<context>` (`<data>`, `<document>`, `<message>`, …).
- A **Workflow** or **Multi-turn** declares it via `<inputs>` inside `<workflow>`.

That declaration *is* the formatter's output contract. The formatter is correct when the message it produces fills every field the prompt names, in the shape the prompt expects, with the same field names and the same nesting.

Draft the system prompt first. Once `<inputs>` (or the `<context>` sub-tags) is fixed, the formatter has a target to hit. See `10-input-contracts.md`.

## Why XML-Tagged Text

The user message is plain text, but it is not unstructured prose. It is text with semantic XML tags around each section.

- **Boundaries.** The model sees exactly where each piece begins and ends. No "is this still the customer block or did we move on?" ambiguity.
- **Injection resistance.** User-supplied content sits inside a `<message>` tag. Instructions in that content read as data, not directives.
- **Stable shape.** The same state always serializes to the same bytes, which keeps prompt-cache hit rates high.

XML tags are not the only option, but they are the default in this skill because every system-prompt type already uses them. A formatter that emits a different shape would force the prompt and the formatter to disagree.

## A Complete Example

State (JSON-like, however the application stores it):

```json
{
  "customer": {
    "name": "Acme Corp",
    "tier": "enterprise",
    "account_age_days": 450
  },
  "request": {
    "type": "refund",
    "amount": 2500,
    "reason": "Service outage on Dec 15"
  },
  "conversation": [
    { "role": "user", "content": "I need a refund for the December outage" },
    { "role": "assistant", "content": "Let me look up your account." }
  ]
}
```

Formatter (pseudocode):

```text
function format_user_message(state):
    parts = []
    parts.append("Process this customer request:")
    parts.append(format_record("customer", state.customer))
    parts.append(format_record("request",  state.request))
    parts.append(format_conversation(state.conversation, max=20))
    parts.append("Generate the response to the customer.")
    return join(parts, "\n\n")

function format_record(tag, record):
    if record is empty: return ""
    fields = [`    <${k}>${v}</${k}>` for k, v in record]
    return `<${tag}>\n${join(fields, "\n")}\n</${tag}>`

function format_conversation(messages, max):
    if messages is empty: return ""
    recent = last_n(messages, max)
    items = [`    <message role="${m.role}">${m.content}</message>` for m in recent]
    return `<conversation>\n${join(items, "\n")}\n</conversation>`
```

Rendered user message:

```text
Process this customer request:

<customer>
    <name>Acme Corp</name>
    <tier>enterprise</tier>
    <account_age_days>450</account_age_days>
</customer>

<request>
    <type>refund</type>
    <amount>2500</amount>
    <reason>Service outage on Dec 15</reason>
</request>

<conversation>
    <message role="user">I need a refund for the December outage</message>
    <message role="assistant">Let me look up your account.</message>
</conversation>

Generate the response to the customer.
```

The formatter is small, modular, and has no model in it. It is pure: same state in, same bytes out. That property is what makes it testable.

## Responsibilities

The formatter does five things and nothing else:

1. **Select.** Pick the slice of state this call needs. Don't pass the whole blob.
2. **Shape.** Put fields in a stable order with stable names.
3. **Wrap.** Tag each section so the model can see boundaries.
4. **Bound.** Apply sliding windows to unbounded sources (conversation, logs, retrieved docs).
5. **Emit.** Return a string. No model calls, no side effects.

Anything beyond that — deciding *what* the model should do, choosing a system prompt, parsing a response — is not the formatter's job.

## What Each File in This Section Covers

- **`10-input-contracts.md`** — How the system prompt's `<inputs>` declaration becomes the formatter's output contract. Stability rules, naming, missing vs. omitted fields, versioning.
- **`20-formatting-principles.md`** — XML tag conventions, indentation, ordering, conditional inclusion, escaping, and the rules that keep the rendered message cache-stable.
- **`30-formatter-patterns.md`** — Pseudocode patterns for the recurring shapes: flat record, nested record, list, conversation history, retrieved chunks, tool results, and how to compose them into the final message.

## Anti-Patterns

- **Don't put behavior in the formatter.** Decisions about what the model should do live in the system prompt. The formatter only assembles data.
- **Don't pass the whole state blob.** "I'll just include everything" defeats the point — the model can't focus and the prompt cache thrashes on every change.
- **Don't build the message with one giant template string.** Per-section helpers are the unit of change. State schemas drift; helpers absorb that without rewriting a 300-line template.
- **Don't reorder fields based on data.** Stable order is what makes prompt caching effective. Sort keys are static, not derived.
- **Don't format inside the system prompt file.** The `.md` file is static; runtime data goes in the user message. Mixing them produces a system prompt that has to be rewritten on every call.
