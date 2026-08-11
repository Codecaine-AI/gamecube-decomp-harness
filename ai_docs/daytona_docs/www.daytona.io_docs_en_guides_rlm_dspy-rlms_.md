---
url: "https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/"
title: "Run DSPy RLMs on Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#_top)

# Run DSPy RLMs on Daytona

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms.md)Open

[DSPy](https://dspy.ai/)’s RLM implements [recursive language models](https://arxiv.org/abs/2512.24601), a system where an LLM writes Python code through which it can pass parts of its context to LLM calls, leading to significantly enhanced long-context reasoning.

The generated code runs in a REPL, and in this guide we use and present `DaytonaInterpreter`, which plugs into DSPy as the code-execution backend so that all generated code runs inside an isolated Daytona cloud sandbox rather than on your machine.

* * *

### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#1-setup) 1\. Setup

[Section titled “1. Setup”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#1-setup)

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#clone-the-repository)

Clone the [Daytona repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/python/dspy-rlms
```

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#create-virtual-environment) Create Virtual Environment

[Section titled “Create Virtual Environment”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#create-virtual-environment)

```
python3.10 -m venv venv

source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#install-dependencies) Install Dependencies

[Section titled “Install Dependencies”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#install-dependencies)

```
pip install -e .
```

This installs the DSPy framework and the Daytona SDK. To also run the included demo (which plots results with matplotlib), use

```
pip install -e ".[demo]"
```

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#configure-environment)

Create a `.env` file with your API keys:

```
cp .env.example .env

# Edit .env with your keys
```

The file needs two variables:

```
DAYTONA_API_KEY=your_daytona_api_key

OPENROUTER_API_KEY=your_openrouter_api_key  # or OPENAI_API_KEY / ANTHROPIC_API_KEY
```

### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#2-basic-usage) 2\. Basic Usage

[Section titled “2. Basic Usage”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#2-basic-usage)

The following example shows the basic setup — configure a model, create a `DaytonaInterpreter`, and pass it to an RLM. The generated code can call `llm_query()` to delegate semantic work back to the LLM:

- [Python](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#tab-panel-530)

```
import dspy

from dotenv import load_dotenv

from daytona_interpreter import DaytonaInterpreter

load_dotenv()

lm = dspy.LM("openrouter/anthropic/claude-sonnet-4.6")

dspy.configure(lm=lm)

interpreter = DaytonaInterpreter()

rlm = dspy.RLM(

    signature="documents: list[str], question: str -> answer: str",

    interpreter=interpreter,

    verbose=True,

)

documents = [...]  # your documents

result = rlm(documents=documents, question="Summarize the key findings across these documents.")

print(result.answer)

interpreter.shutdown()
```

Inside the sandbox, the RLM might loop over the documents, call `llm_query()` to summarize each one, then aggregate the results with Python before calling `SUBMIT(answer=...)`.

### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#3-workflow-overview) 3\. Workflow Overview

[Section titled “3. Workflow Overview”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#3-workflow-overview)

Each RLM call runs an iterative REPL loop. The LLM writes Python code, the code executes in a Daytona sandbox, and the output is fed back to the LLM for the next iteration. Crucially, the generated code can call `llm_query()` to invoke a sub-LLM call — this is how the LLM delegates semantic work (understanding, extraction, classification) to itself while keeping the orchestration logic in Python.

1. **Prompt** — RLM sends the task inputs and previous turns to the LLM
2. **Code** — The LLM responds with reasoning and a Python code snippet
3. **Execute** — The code runs inside a Daytona sandbox; any `llm_query()` calls are bridged back to the host LLM
4. **Repeat** — Steps 1–3 repeat until the code calls `SUBMIT()` or the iteration limit is reached

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#how-bridging-works) How Bridging Works

[Section titled “How Bridging Works”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#how-bridging-works)

Step 3 above mentions that `llm_query()` calls are “bridged back to the host.” Here’s a diagram and an explanation of that process:

```
Host Process                                    Daytona Sandbox

┌──────────────────────────────┐                ┌──────────────────────────────┐

│      DaytonaInterpreter      │                │    Broker Server (Flask)     │

│                              │                │                              │

│  • polls the broker for      │   tool call,   │  • accepts requests from     │

│    pending requests          │ e.g. llm_query │    the wrapper functions     │

│                              │◄───────────────│                              │

│  • calls the LLM API         │                │  • queues them for the host  │

│    or runs tool functions    │    result      │  • returns results once the  │

│  • posts results back        │───────────────►│    host replies              │

│                              │                │                              │

└──────────────────────────────┘                │      Generated Code          │

               │                                │  • llm_query()               │

               ▼                                │  • llm_query_batched()       │

           LLM API                              │  • custom tool wrappers      │

                                                └──────────────────────────────┘
```

When `DaytonaInterpreter` starts, it launches a small Flask broker server inside the sandbox and injects wrapper functions (`llm_query`, `llm_query_batched`, and any custom tools you provide). These wrappers POST requests to the broker and block until a result arrives. On the host side, a polling loop picks up pending requests, executes them (e.g. calls the LLM API or runs your tool function), and posts the results back to the broker. From the generated code’s perspective, the wrappers look and behave like ordinary Python functions.

Custom tools passed via the `tools` dict use the same mechanism, so that the host generates a matching wrapper inside the sandbox and bridges calls identically.

State persists across iterations: variables, imports, and function definitions all carry over.

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#sub-llm-calls) Sub-LLM Calls

[Section titled “Sub-LLM Calls”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#sub-llm-calls)

Two built-in functions are available inside the sandbox:

- **`llm_query(prompt)`** — send a single natural-language prompt to the LLM, get a string back
- **`llm_query_batched(prompts)`** — send multiple prompts concurrently, get a list of strings back

These execute on the host (they need LLM API access) and are bridged into the sandbox. From the generated code’s perspective they are ordinary Python functions that take strings and return strings. This is what makes the pattern powerful: the LLM can write a `for` loop over 100 chapters, call `llm_query_batched()` to extract structured data from each one in parallel, then aggregate and use the results with additional Python code.

### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#4-example-walkthrough) 4\. Example Walkthrough

[Section titled “4. Example Walkthrough”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#4-example-walkthrough)

The included `demo.py` shows a realistic use of sub-LLM calls: literary analysis of _The Count of Monte Cristo_ — a ~1,300-page novel with 117 chapters — tracking the wealth trajectory of five major characters. The RLM uses `llm_query_batched()` to process chapters in parallel batches, then aggregates the results with Python.

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#how-the-demo-works) How the Demo Works

[Section titled “How the Demo Works”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#how-the-demo-works)

The script fetches the full novel text from Project Gutenberg, splits it into chapters, and passes them to an RLM configured with a typed signature:

- [Python](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#tab-panel-531)

```
interpreter = DaytonaInterpreter()

rlm = dspy.RLM(

    signature="chapters: list[str], task: str -> wealth_data: list[dict]",

    interpreter=interpreter,

    max_iterations=40,

    max_llm_calls=500,

    verbose=True,

)

chapters = fetch_chapters()

print(f"Fetched {len(chapters)} chapters")

TASK = (

    "Analyze the economic trajectory of each major character across the novel. "

    "For each chapter where a character's wealth status is mentioned or implied, "

    "produce a dict with keys: chapter (int), character (str), wealth (int 1-10 "

    "where 1=destitute and 10=richest in Paris), and event (str, brief description "

    "of what changed). Track the following characters: Dantès, Danglars, Fernand/"

    "Morcerf, Villefort, and Mercédès. You need to cover each chapter in the book."

)

result = rlm(chapters=chapters, task=TASK)

wealth_data = result.wealth_data
```

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#what-the-rlm-does) What the RLM Does

[Section titled “What the RLM Does”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#what-the-rlm-does)

The RLM’s generated code follows a pattern typical of sub-LLM workloads:

1. **Batch the input** — Split the 117 chapters into manageable groups
2. **Fan out with `llm_query_batched()`** — For each batch, send a prompt like _“Extract wealth events from these chapters as JSON”_ — the sub-LLM calls run concurrently on the host
3. **Parse and accumulate** — Each sub-call returns a string; the code parses the JSON and appends to a running list
4. **Iterate** — Repeat for the next batch; state (the accumulated list) persists across REPL iterations
5. **Submit** — Once all chapters are processed, call `SUBMIT(wealth_data=accumulated_results)`

This is the core RLM pattern: Python handles the data plumbing (batching, parsing, aggregating) while `llm_query_batched()` handles the parts that need language understanding (reading prose, identifying wealth events, rating severity).

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#running-the-demo) Running the Demo

[Section titled “Running the Demo”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#running-the-demo)

```
python demo.py
```

The script plots the results with matplotlib after the RLM finishes.

#### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#results) Results

[Section titled “Results”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#results)

The output is a list of `{chapter, character, wealth, event}` dictionaries that the script plots as smoothed time series:

![Wealth trajectory chart showing five character arcs across 117 chapters of The Count of Monte Cristo.](https://www.daytona.io/docs/_astro/wealth-trajectories.CN4GAeNc_ZaR9SI.webp)

### [\#](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/\#5-conclusion) 5\. Conclusion

[Section titled “5. Conclusion”](https://www.daytona.io/docs/en/guides/rlm/dspy-rlms/#5-conclusion)

RLMs combine the LLM’s language understanding with Python’s ability to loop, branch, and aggregate — the generated code calls the LLM whenever it needs semantic reasoning and handles everything else with ordinary computation. `DaytonaInterpreter` makes this safe to run by executing all generated code in an isolated Daytona cloud sandbox:

- **Sub-LLM recursion** — `llm_query()` and `llm_query_batched()` are bridged from the sandbox to the host, letting generated code invoke the LLM for semantic tasks like extraction, classification, and summarisation
- **Isolation** — All generated code runs in a Daytona cloud sandbox, not on your machine
- **Persistent state** — Variables, imports, and definitions survive across REPL iterations, so the LLM can accumulate results across batches