---
covers: Pseudocode patterns for the recurring formatter shapes — flat record, nested record, list, conversation, retrieved chunks, tool results, composition
type: patterns
concepts: [formatter, patterns, pseudocode, composition, conversation, retrieval, tool-results]
depends-on: [20-inputs/00-overview.md, 20-inputs/10-input-contracts.md, 20-inputs/20-formatting-principles.md]
---

# Formatter Patterns

Pseudocode for the shapes that come up over and over. Translate to whichever language the application uses; the structure is the same.

The patterns share two primitives:

```text
function field(tag, value):
    return `<${tag}>${escape(value)}</${tag}>`

function wrap(tag, children, attrs=none):
    if children is empty: return ""
    body = join(indent(children), "\n")
    open = if attrs: `<${tag} ${render_attrs(attrs)}>` else: `<${tag}>`
    return `${open}\n${body}\n</${tag}>`
```

`field` produces `<tag>value</tag>` on one line. `wrap` produces a multi-line block, indenting each child by one level. Every pattern below builds on these two.

## 1. Flat Record

A record with scalar fields. Most common shape.

```text
function format_customer(c):
    if c is empty: return ""
    fields = []
    if c.name:             fields.append(field("name",             c.name))
    if c.tier:             fields.append(field("tier",             c.tier))
    if c.account_age_days: fields.append(field("account_age_days", c.account_age_days))
    return wrap("customer", fields)
```

Renders:

```text
<customer>
    <name>Acme Corp</name>
    <tier>enterprise</tier>
    <account_age_days>450</account_age_days>
</customer>
```

Notes:

- Field order is fixed in the formatter, not derived from the data.
- Each field is conditionally included; the whole block disappears when every field is empty.
- The block disappears entirely if the record is empty — `wrap` handles that via the `children is empty` guard.

## 2. Nested Record

A record that contains sub-records.

```text
function format_account(a):
    sub = []
    sub.append(format_customer(a.customer))
    sub.append(format_subscription(a.subscription))
    return wrap("account", sub)

function format_subscription(s):
    if s is empty: return ""
    fields = []
    if s.plan:        fields.append(field("plan",        s.plan))
    if s.renews_on:   fields.append(field("renews_on",   s.renews_on))
    return wrap("subscription", fields)
```

Renders:

```text
<account>
    <customer>
        <name>Acme Corp</name>
    </customer>
    <subscription>
        <plan>enterprise</plan>
        <renews_on>2026-03-01</renews_on>
    </subscription>
</account>
```

Notes:

- Each sub-record is its own helper. The parent composes; it doesn't reach into children.
- If a sub-record is empty it returns `""` and `wrap` drops it.

## 3. List of Records

A homogeneous list rendered as repeated child tags inside a plural-named parent.

```text
function format_questions(questions):
    if questions is empty: return ""
    items = [format_question(q) for q in questions]
    return wrap("questions", items)

function format_question(q):
    fields = []
    fields.append(field("id",     q.id))
    fields.append(field("text",   q.text))
    fields.append(field("status", q.status))
    return wrap("question", fields)
```

Renders:

```text
<questions>
    <question>
        <id>q1</id>
        <text>What is the target latency?</text>
        <status>open</status>
    </question>
    <question>
        <id>q2</id>
        <text>Which regions must be covered?</text>
        <status>resolved</status>
    </question>
</questions>
```

Notes:

- Singular tag (`<question>`) inside plural tag (`<questions>`). Same word, two cardinalities.
- Always emit the plural wrapper, even when there is one item or zero items (omit-when-empty applies to the wrapper, not to the list shape).
- Do **not** sort the list at format time unless the prompt depends on a specific order. Preserve whatever order state holds.

## 4. List of Scalars

A flat list — same idea as a list of records but the child is a leaf.

```text
function format_tags(tags):
    if tags is empty: return ""
    items = [field("tag", t) for t in tags]
    return wrap("tags", items)
```

Renders:

```text
<tags>
    <tag>refund</tag>
    <tag>enterprise</tag>
</tags>
```

Even with one element, render the list shape — never collapse `<tags><tag>x</tag></tags>` to `<tags>x</tags>`.

## 5. Conversation History (Sliding Window)

A list with a window applied and metadata in attributes.

```text
function format_conversation(messages, max=20):
    if messages is empty: return ""
    recent = last_n(messages, max)
    items  = [render_message(m) for m in recent]
    return wrap("conversation", items)

function render_message(m):
    return `<message role="${m.role}">${escape(m.content)}</message>`
```

Renders:

```text
<conversation>
    <message role="user">I need a refund for the December outage</message>
    <message role="assistant">Let me look up your account.</message>
</conversation>
```

When messages older than the window matter, summarize them in a sibling block:

```text
function format_conversation_with_summary(messages, summary, max=20):
    blocks = []
    if summary:                     blocks.append(field("conversation_summary", summary))
    if length(messages) > 0:        blocks.append(format_conversation(messages, max))
    return join(blocks, "\n\n")
```

The summary is produced by the application (often by an earlier LLM call) and stored in state. The formatter just emits it.

## 6. Retrieved Chunks

Items pulled from a retrieval system. Each chunk needs provenance so the model can cite or weigh it.

```text
function format_retrieved(chunks):
    if chunks is empty: return ""
    items = [format_chunk(c) for c in chunks]
    return wrap("retrieved", items)

function format_chunk(c):
    fields = []
    fields.append(field("source", c.source))
    if c.score is not none:
        fields.append(field("score", format_float(c.score, precision=3)))
    fields.append(field("text", c.text))
    return wrap("chunk", fields)
```

Renders:

```text
<retrieved>
    <chunk>
        <source>handbook.md#refund-policy</source>
        <score>0.871</score>
        <text>Enterprise customers receive prorated refunds for verified outages exceeding two hours.</text>
    </chunk>
</retrieved>
```

Notes:

- `score` is rendered with fixed precision so byte output is deterministic across runs.
- Source first, content last. The model reads the label before the body.
- If chunks come pre-ranked, preserve the order. If not, the formatter does not invent one.

## 7. Tool Results

Results from previously-executed tool calls (relevant in Multi-turn agents that read prior tool output from state).

```text
function format_tool_results(results):
    if results is empty: return ""
    items = [format_tool_result(r) for r in results]
    return wrap("tool_results", items)

function format_tool_result(r):
    attrs    = { "tool": r.tool, "status": r.status }
    children = []
    if r.input:  children.append(field("input",  r.input))
    if r.output: children.append(field("output", r.output))
    if r.error:  children.append(field("error",  r.error))
    return wrap("tool_result", children, attrs)
```

Renders:

```text
<tool_results>
    <tool_result tool="lookup_account" status="ok">
        <input>{"customer_id": "acme-123"}</input>
        <output>{"tier": "enterprise", "account_age_days": 450}</output>
    </tool_result>
    <tool_result tool="check_outage" status="error">
        <input>{"date": "2024-12-15"}</input>
        <error>Service unavailable</error>
    </tool_result>
</tool_results>
```

The status attribute lets the model see at a glance which results succeeded.

## 8. Composing the Full Message

The top-level formatter is a thin assembler. It chooses which sections to include and the order they appear. It does not contain any field-level logic.

```text
function format_user_message(state):
    parts = []
    parts.append("Process this customer request:")
    parts.append(format_customer(state.customer))
    parts.append(format_request(state.request))
    parts.append(format_verified_context(state.verified))
    parts.append(format_retrieved(state.retrieved))
    parts.append(format_tool_results(state.tool_results))
    parts.append(format_conversation(state.conversation, max=20))
    parts.append("Generate the response to the customer.")
    return join_nonempty(parts, separator="\n\n")

function join_nonempty(parts, separator):
    return join([p for p in parts if p is not ""], separator)
```

`join_nonempty` is the second important primitive: empty sections drop out without leaving blank lines. The result is one well-spaced message that adapts cleanly to whichever sections are populated this call.

## 9. Hooking the Formatter into the Call

Once the formatter exists, the LLM call is small. Pseudocode for any provider/SDK:

```text
state          = load_state(session_id)
system_prompt  = read_file("prompts/customer_support.md")
user_message   = format_user_message(state)

response = llm.complete(
    model       = "claude-sonnet-4-6",
    system      = system_prompt,
    messages    = [{ role: "user", content: user_message }],
    temperature = 0.1,
)
```

The system prompt is loaded once (or cached). The user message is rebuilt every call. Nothing in the call site reaches into state directly — the formatter is the only thing that does.

## Choosing a Pattern

| State shape | Pattern |
| --- | --- |
| Object with scalar fields | Flat record (§1) |
| Object containing other objects | Nested record (§2) |
| Array of objects | List of records (§3) |
| Array of strings/numbers | List of scalars (§4) |
| Chat history | Conversation with sliding window (§5) |
| Retrieved documents | Chunks with provenance (§6) |
| Prior tool calls | Tool results (§7) |
| Whole user message | Composition (§8) |

Most real prompts combine several. The composition pattern (§8) is what lets a Multi-turn agent stack identity, request, retrieved context, prior tool output, and conversation into one stable message — and have it stay byte-stable across calls when the underlying state hasn't changed.

## Anti-Patterns

- **One giant template string with `${…}` interpolation.** Looks fine for the first version. Becomes unreadable and impossible to test by the third schema change.
- **Per-pattern divergence.** Two list formatters that indent differently, or two record formatters that handle missing values differently. Use the shared `field` and `wrap` primitives so behavior is uniform.
- **Reaching into nested state from the top-level formatter.** `format_user_message(state)` should call `format_customer(state.customer)`, not pull `state.customer.subscription.plan` directly. Each helper owns its slice.
- **Sorting lists at format time.** Order is part of the state's meaning. The formatter renders, it doesn't reorder.
- **Hand-rolled escaping that disagrees between helpers.** One `escape` function, called from one `field` primitive, used by every helper.
