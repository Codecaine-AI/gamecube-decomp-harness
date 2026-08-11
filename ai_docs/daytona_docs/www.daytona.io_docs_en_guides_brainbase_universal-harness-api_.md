---
url: "https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/"
title: "Run Agents on Daytona with Brainbase's Universal Harness API | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#_top)

# Run Agents on Daytona with Brainbase's Universal Harness API

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api.md)Open

This guide walks you through running a background coding agent through Brainbase’s [Universal Harness API](https://docs.brainbaselabs.com/api) on Daytona sandboxes. One API call describes an agent (any harness such as Claude Code, Codex, or OpenCode, in any configuration), and Brainbase runs it inside an isolated Daytona sandbox.

Daytona is the default sandbox provider for the Universal Harness API. Brainbase manages the sandbox for you: it provisions the Daytona sandbox, runs the agent’s turns in it, and handles its lifecycle, so you never touch a Daytona API key or manage any infrastructure yourself.

In this example the agent is handed a real ticket: a seeded Python project whose `pytest` suite is failing. It diagnoses the bug, fixes it until the suite is green, then extends the code with a new feature on a follow-up turn.

* * *

### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#1-workflow-overview)

When you run the script, a single `POST /v2/threads` call describes the agent inline and starts its first turn. Brainbase creates the agent, boots an isolated Daytona sandbox, and runs the agent inside it while the script streams the events back to your terminal in real time. Each tool call and assistant message surfaces as it happens, and every turn ends with an `idle` event that carries the outcome.

The agent works entirely inside its Daytona sandbox: it reads and edits files, runs `pytest`, and iterates until the suite passes. When the first turn settles, the script appends a follow-up on the same thread, so the agent picks the work back up in the same sandbox with full context. Once both turns finish, the script reads the thread to report the Daytona sandbox that ran the agent and prints the transcript.

### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#clone-the-repository)

Clone the Daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/brainbase/universal-harness-api
```

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#configure-environment)

Create a Brainbase API key at [app.brainbaselabs.com/api-keys](https://app.brainbaselabs.com/api-keys).

Copy `.env.example` to `.env` and add your key:

```
BRAINBASE_API_KEY=your_brainbase_key
```

The Brainbase key stays on your machine and authenticates your calls to the Universal Harness API. It is never passed into the sandbox.

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#local-usage)

Install dependencies and run the example:

```
npm install

npm run start
```

### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#3-example-usage) 3\. Example Usage

[Section titled “3. Example Usage”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#3-example-usage)

The agent is pointed at a seeded project whose test suite is failing. It runs `pytest`, finds and fixes the bug, and reports the outcome. A follow-up turn then adds a new function with its own tests, all in the same Daytona sandbox:

```
Creating a "claude_code" agent on daytona...

Thread fa45300b-7247-4cad-898c-38cfd8b35f25 (agent 4578483b-ba07-424e-8e2e-b5164fe4247d)

------------------------------------------------------------

User: The Python project in /workspace has a failing test suite. Run pytest to see the failures, then find and fix the bug in intervals.py so the whole suite passes. Do not modify the tests.

  · mcp: brainbase-browser (ok), brainbase-memory (ok), brainbase-orchestration (ok)

  -> Terminal

  -> Read File

Agent: The bug: `start < last_end` should be `<=` to merge touching intervals.

  -> Edit

  -> Terminal

Agent: All 5 tests pass. Fixed the merge condition in `intervals.py` (line 8) from `start < last_end` to `start <= last_end` so touching intervals (e.g. `(1,2)` and `(2,3)`) merge correctly.

  -> mcp__brainbase-idle__brainbase_idle

● turn success: Fixed off-by-one in merge_intervals (changed `<` to `<=` on intervals.py:8) so touching intervals merge; full pytest suite now passes (5/5).

------------------------------------------------------------

User: Add a function total_covered(intervals) to intervals.py that returns the total length covered by the intervals (merge overlapping ones first), add tests for it, and run pytest again.

  -> Read File

  -> Edit

  -> Edit

  -> Edit

  -> Terminal

Agent: All 9 tests pass. Added `total_covered(intervals)` to `intervals.py` (sums lengths of merged intervals) and 4 new tests covering overlapping, touching, empty, and single-interval cases.

● turn success: All 9 tests pass. Added `total_covered(intervals)` to `intervals.py` (sums lengths of merged intervals) and 4 new tests covering overlapping, touching, empty, and single-interval cases.

------------------------------------------------------------

Ran on daytona sandbox: 5521cb88-48ee-41bc-893d-427e4b148f3f

Final status: success

Transcript (13 messages):

  user: The Python project in /workspace has a failing test suite. Run pytest to see the failures, then find and fix the bug in…

  assistant: The bug: `start < last_end` should be `<=` to merge touching intervals.

  assistant: All 5 tests pass. Fixed the merge condition in `intervals.py` (line 8) from `start < last_end` to `start <= last_end` s…

  user: Add a function total_covered(intervals) to intervals.py that returns the total length covered by the intervals (merge o…

  assistant: All 9 tests pass. Added `total_covered(intervals)` to `intervals.py` (sums lengths of merged intervals) and 4 new tests…
```

### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#4-understanding-the-script) 4\. Understanding the Script

[Section titled “4. Understanding the Script”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#4-understanding-the-script)

The example is a small TypeScript program that talks to the Universal Harness API directly over its REST endpoints with `fetch`, so there is no SDK to install. The `src/` directory has four files:

- `config.ts`: the agent spec and the prompts that drive the run.
- `client.ts`: a small typed client for the Universal Harness API.
- `render.ts`: turns the event stream into readable console output.
- `index.ts`: orchestrates the run.

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#describing-the-agent-configts) Describing the agent (config.ts)

[Section titled “Describing the agent (config.ts)”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#describing-the-agent-configts)

The whole agent is described inline, so a single request is enough to create it and start it running. Before the spec, a `seedEntrypoint` string holds the bash that prepares the sandbox: it writes a small Python project with a deliberately failing test suite, then installs `pytest`. The bug is on the merge condition, `start < last_end`, which should be `<=` so that touching intervals like `(1, 2)` and `(2, 3)` merge; two of the five tests fail because of it. That is the ticket the agent picks up.

```
const seedEntrypoint = `set -e

cat > /workspace/intervals.py <<'PY'

def merge_intervals(intervals):

    if not intervals:

        return []

    ordered = sorted(intervals)

    merged = [ordered[0]]

    for start, end in ordered[1:]:

        last_start, last_end = merged[-1]

        if start < last_end:

            merged[-1] = (last_start, max(last_end, end))

        else:

            merged.append((start, end))

    return merged

PY

cat > /workspace/test_intervals.py <<'PY'

from intervals import merge_intervals

def test_overlapping():

    assert merge_intervals([(1, 3), (2, 6), (8, 10)]) == [(1, 6), (8, 10)]

def test_touching_intervals_merge():

    assert merge_intervals([(1, 2), (2, 3)]) == [(1, 3)]

def test_unsorted_input():

    assert merge_intervals([(2, 3), (1, 2)]) == [(1, 3)]

def test_empty():

    assert merge_intervals([]) == []

def test_single():

    assert merge_intervals([(5, 7)]) == [(5, 7)]

PY

python3 -m pip install -q pytest`

export const agent: AgentSpec = {

  harness: 'claude_code',

  machine_kind: 'daytona',

  instructions:

    'You are a background software engineering agent working in a fresh Linux sandbox that ' +

    'already contains a small Python project. Fix failing tests by editing the implementation ' +

    'only — never modify the test files. Run pytest to verify, and iterate until the whole ' +

    'suite passes. Keep your replies brief.',

  model: 'claude-sonnet-5',

  entrypoint: seedEntrypoint,

}
```

`machine_kind: 'daytona'` is what places the agent on a Daytona sandbox. `entrypoint` runs inside that sandbox before the agent starts, so the failing project and `pytest` are ready when it wakes up. `instructions` sets the agent’s role, and `harness` selects which agent runtime executes the turns.

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#talking-to-the-api-clientts) Talking to the API (client.ts)

[Section titled “Talking to the API (client.ts)”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#talking-to-the-api-clientts)

`client.ts` is a thin wrapper over the REST endpoints. Every call is an authenticated HTTPS request that sends your Brainbase key as a bearer token; `this.headers()` adds the `Authorization: Bearer <key>` header, and a `Content-Type` is set only when there is a body.

```
const res = await fetch(`${this.baseUrl}${path}`, {

  method,

  headers: this.headers(body === undefined ? {} : { 'Content-Type': 'application/json' }),

  body: body === undefined ? undefined : JSON.stringify(body),

})
```

Creating the agent and starting its first turn is a single `POST /v2/threads` with the agent spec and the first user message. The response returns the thread and agent ids:

```
const { thread_id, agent_id } = await client.createThread({ agent, input: initialInput })
```

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#streaming-the-turn-indexts) Streaming the turn (index.ts)

[Section titled “Streaming the turn (index.ts)”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#streaming-the-turn-indexts)

Creating the thread starts the first turn immediately, so the script opens the thread’s server-sent events stream with `backfill`. That replays anything emitted in the short gap before the stream connects, so the start of the turn is never missed, and the same connection then stays open across turns.

```
const stream = await client.openEventStream(thread_id, { backfill: BACKFILL, signal: controller.signal })
```

`stream.events()` is an async generator. Internally it reads the raw byte stream from the response, decodes and buffers it, and splits on the blank line that separates server-sent events; each complete frame is parsed into a typed `ThreadEvent` by the `parseFrame` helper and handed back with `yield`. Keeping the transport details (buffering, frame splitting, JSON parsing) inside the generator lets the caller consume events with a plain `for await` loop:

```
async *events(): AsyncGenerator<ThreadEvent> {

  try {

    while (true) {

      const { done, value } = await this.reader.read()

      if (done) break

      // Strip CRs so frame separation works for both "\n\n" and "\r\n\r\n".

      this.buffer += this.decoder.decode(value, { stream: true }).replace(/\r/g, '')

      let sep: number

      while ((sep = this.buffer.indexOf('\n\n')) !== -1) {

        const frame = this.buffer.slice(0, sep)

        this.buffer = this.buffer.slice(sep + 2)

        const event = parseFrame(frame)

        if (event) yield event

      }

    }

  } finally {

    this.reader.releaseLock()

  }

}
```

The main loop consumes that generator, renders each event, and watches for `idle`, which marks the end of a turn. When a turn ends it sends the next follow-up on the same thread, or stops if there are none left. `arm()` resets an inactivity watchdog on every event so a stalled turn cannot hang the run forever:

```
for await (const event of stream.events()) {

  arm()

  renderer.handle(event)

  if (event.type === 'idle') {

    const next = followUps.shift()

    if (!next) break

    await sendAndRun(client, thread_id, next)

  }

}
```

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#continuing-the-conversation-indexts) Continuing the conversation (index.ts)

[Section titled “Continuing the conversation (index.ts)”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#continuing-the-conversation-indexts)

A follow-up is appended to the same thread with `run: true`, which picks the agent back up in the same sandbox with full context. A just-finished turn holds its run slot for a moment, so the API can briefly answer `409` (“task is busy”); `sendAndRun` retries for up to 30 seconds until the slot frees, rather than failing the run.

```
async function sendAndRun(client: BrainbaseClient, threadId: string, content: string): Promise<void> {

  const deadline = Date.now() + 30_000

  for (;;) {

    try {

      await client.postMessages(threadId, [{ content }], true)

      return

    } catch (err) {

      if (err instanceof ApiError && err.status === 409 && Date.now() < deadline) {

        await sleep(1_500)

        continue

      }

      throw err

    }

  }

}
```

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#reporting-the-result-indexts) Reporting the result (index.ts)

[Section titled “Reporting the result (index.ts)”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#reporting-the-result-indexts)

Once the turns are done, the script reads the thread once more to show the Daytona sandbox that ran the agent (the thread carries a `sandbox_id`), then fetches and prints the transcript:

```
const thread = await client.getThread(thread_id)

const machine = thread.sandbox_id ?? thread.machine_id

if (machine) console.log(`Ran on ${provider} sandbox: ${machine}`)

console.log(`Final status: ${thread.status}`)

const { items } = await client.listMessages(thread_id)

console.log(`\nTranscript (${items.length} messages):`)

for (const message of items) {

  const body = oneLine(message.content)

  if (body) console.log(`  ${message.role}: ${body}`)

}
```

#### [\#](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/\#rendering-events-renderts) Rendering events (render.ts)

[Section titled “Rendering events (render.ts)”](https://www.daytona.io/docs/en/guides/brainbase/universal-harness-api/#rendering-events-renderts)

`render.ts` turns the event stream into the console output shown earlier. `handle()` switches on `event.type`: assistant text arrives either as streamed `assistant.message.chunk`s (accumulated in `pending`) or as one complete `assistant.message`, while `tool_call.start`, `mcp.status`, and `idle` are printed as they arrive. Because the text comes from the model and its tools, it is first run through `sanitize()`, which strips terminal escape and control sequences to reduce the risk of generated output driving the terminal (moving the cursor, changing colors, or overwriting lines). This is best-effort hardening, not a complete guarantee:

```
function sanitize(text: string): string {

  return text

    .replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '')\
\
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')\
\
}\
```\
\
`printAgent()` applies that sanitization once per message and de-duplicates a repeated final message within a turn, since some harnesses emit it more than once:\
\
```\
private printAgent(raw: string): void {\
\
  const text = sanitize(raw)\
\
  if (text && text !== this.lastAssistant) {\
\
    console.log(`\n${BOLD}Agent:${RESET} ${text}`)\
\
    this.lastAssistant = text\
\
  }\
\
}\
```\
\
ANSI styling is applied only when writing to a real terminal (`process.stdout.isTTY`), so redirected or piped output stays clean plain text.\
\
**Key advantages:**\
\
- Any agent harness runs on Daytona from a single API call, each in its own isolated sandbox.\
- Fully managed by Brainbase: you only need a Brainbase API key, with no Daytona key or infrastructure to operate.\
- Live event streaming of assistant messages, tool calls, and turn outcomes over server-sent events.\
- Multi-turn conversations continue on the same sandbox with full context and the same filesystem.\
- Plain REST and server-sent events, so switching harness, model, or task is a config change rather than a rewrite.