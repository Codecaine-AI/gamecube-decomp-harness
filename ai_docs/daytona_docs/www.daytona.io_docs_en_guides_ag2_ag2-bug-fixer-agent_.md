---
url: "https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/"
title: "Fix Bugs Automatically With AG2 and Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#_top)

# Fix Bugs Automatically With AG2 and Daytona

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent.md)Open

This guide demonstrates how to use `DaytonaCodeExecutor` for [AG2](https://ag2.ai/) to build a multi-agent system that automatically fixes broken code in a secure sandbox environment. The executor enables agents to run Python, JavaScript, TypeScript, and Bash code within isolated Daytona sandboxes, with no risk to your local machine.

In this example, we build a bug fixer that takes broken code as input, analyzes the bug, proposes a fix, and verifies it by actually executing the code in a Daytona sandbox. If the fix fails, the agent sees the error output and retries with a different approach, continuing until the code passes or the maximum number of attempts is reached.

* * *

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#1-workflow-overview)

You provide broken code. The `bug_fixer` agent (LLM) analyzes it and proposes a fix wrapped in a fenced code block. The `code_executor` agent extracts the code block and runs it in a Daytona sandbox. If execution fails, the bug fixer sees the full error output and tries again. Once the code passes, the agents terminate and the sandbox is automatically deleted.

The key benefit: every fix attempt is verified by actually running the code — not just reviewed by the LLM.

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#clone-the-repository)

Clone the Daytona repository and navigate to the example directory:

```
git clone https://github.com/daytona/guides

cd guides/python/ag2/bug-fixer-agent
```

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#install-dependencies) Install Dependencies

[Section titled “Install Dependencies”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#install-dependencies)

Install the required packages for this example:

- [Python](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#tab-panel-415)

```
pip install "ag2[openai]<1.0" daytona python-dotenv
```

The packages include:

- `ag2[openai]`: AG2 with OpenAI model support (pinned to `<1.0` for compatibility with the Daytona code executor)
- `daytona`: The Daytona SDK used by AG2’s `DaytonaCodeExecutor` to create and manage sandboxes
- `python-dotenv`: Loads environment variables from a `.env` file

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#configure-environment)

Get your API keys and configure your environment:

1. **Daytona API key:** Get it from [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
2. **OpenAI API key:** Get it from [OpenAI Platform](https://platform.openai.com/api-keys)

Create a `.env` file in your project directory:

```
DAYTONA_API_KEY=dtn_***

OPENAI_API_KEY=sk-***
```

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#3-understanding-the-core-components) 3\. Understanding the Core Components

[Section titled “3. Understanding the Core Components”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#3-understanding-the-core-components)

Before diving into the implementation, let’s understand the key components:

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#ag2-conversableagent) AG2 ConversableAgent

[Section titled “AG2 ConversableAgent”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#ag2-conversableagent)

`ConversableAgent` is AG2’s general-purpose agent. Each agent can be configured as either an LLM agent (with a model and system prompt) or a non-LLM agent (`llm_config=False`) that responds through registered reply handlers — in our case, code execution via `code_execution_config`. The two agents communicate by passing messages back and forth until a termination condition is met.

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#daytonacodeexecutor) DaytonaCodeExecutor

[Section titled “DaytonaCodeExecutor”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#daytonacodeexecutor)

`DaytonaCodeExecutor` implements the AG2 `CodeExecutor` protocol. When used as a context manager, it creates a Daytona sandbox on entry and automatically deletes it on exit. It reuses the same sandbox across all code executions within the session, extracting and running fenced code blocks from agent messages. The language is inferred from the code block tag (``````python```, ``````javascript```, ``````typescript```).

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#4-implementation) 4\. Implementation

[Section titled “4. Implementation”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#4-implementation)

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#step-1-imports-and-environment) Step 1: Imports and environment

[Section titled “Step 1: Imports and environment”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#step-1-imports-and-environment)

```
import os

from autogen import ConversableAgent, LLMConfig

from autogen.coding import DaytonaCodeExecutor

from dotenv import load_dotenv

load_dotenv()
```

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#step-2-bug-fixer-system-prompt) Step 2: Bug fixer system prompt

[Section titled “Step 2: Bug fixer system prompt”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#step-2-bug-fixer-system-prompt)

The system prompt drives the iterative fix loop. It tells the agent which languages are supported, instructs it to wrap fixes in fenced code blocks, and separates the fix message from the TERMINATE signal so the executor always runs the code before the session ends:

````
BUG_FIXER_SYSTEM_MESSAGE = """You are an expert bug fixer. You support Python, JavaScript, and TypeScript.

If asked to fix code in any other language, refuse and explain which languages are supported.

When given broken code:

1. Analyze the bug carefully and identify the root cause

2. Write the complete fixed code in a fenced code block using the correct language tag

3. Always include assertions or print statements at the end to verify the fix works

4. If your previous fix didn't work, analyze the error output and try a different approach

5. Once the code runs successfully, reply with just the word TERMINATE — never in the same message as a code block

Always wrap your code in fenced code blocks (```python, ```javascript, or ```typescript). Never explain without providing fixed code.

Never include TERMINATE in a message that contains a code block.

"""
````

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#step-3-create-the-agents) Step 3: Create the agents

[Section titled “Step 3: Create the agents”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#step-3-create-the-agents)

```
def fix_bug(broken_code: str, error_description: str = "") -> None:

    llm_config = LLMConfig(

        {

            "model": "gpt-4o-mini",

            "api_key": os.environ["OPENAI_API_KEY"],

        }

    )

    with DaytonaCodeExecutor(timeout=60) as executor:

        bug_fixer = ConversableAgent(

            name="bug_fixer",

            system_message=BUG_FIXER_SYSTEM_MESSAGE,

            llm_config=llm_config,

            code_execution_config=False,

            is_termination_msg=lambda x: (

                "TERMINATE" in (x.get("content") or "") or not (x.get("content") or "").strip()

            ),

        )

        code_executor = ConversableAgent(

            name="code_executor",

            llm_config=False,

            code_execution_config={"executor": executor},

        )
```

`DaytonaCodeExecutor` is used as a context manager so the sandbox is automatically cleaned up when `fix_bug` returns. `bug_fixer` owns the LLM reasoning; `code_executor` owns sandbox execution and never calls the LLM itself (`llm_config=False`).

The optional `error_description` parameter can be used to pass additional context about the failure — for example, a stack trace, a known symptom, or a hint about the cause. In the examples below we leave it empty, as the agent is capable of identifying and fixing the bugs purely from the assertion output.

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#step-4-start-the-conversation) Step 4: Start the conversation

[Section titled “Step 4: Start the conversation”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#step-4-start-the-conversation)

```
        message = f"Fix this broken code:\n\n\n{broken_code}\n"

        if error_description:

            message += f"\n\nError: {error_description}"

        code_executor.run(

            recipient=bug_fixer,

            message=message,

            max_turns=8,

        ).process()
```

`code_executor` initiates the chat because it owns the problem — the broken code. `bug_fixer` receives it as its first message, proposes a fix, and waits for execution results.

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#5-running-the-example) 5\. Running the Example

[Section titled “5. Running the Example”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#5-running-the-example)

The complete example ships with three broken code snippets, one per language:

**Example 1 — Python: postfix evaluator with swapped operands**

The subtraction and division operators pop two values from the stack but apply them in reverse order, producing wrong results for non-commutative operations.

```
elif token == '-':

    stack.append(b - a)   # Bug: reversed — should be a - b

elif token == '/':

    stack.append(b // a)  # Bug: reversed — should be a // b
```

**Example 2 — JavaScript: wrong concatenation order in run-length encoder**

The character and count are concatenated in the wrong order in two places, producing `"a2b3c2"` instead of `"2a3b2c"`.

```
result += str[i - 1] + count;          // Bug: should be count + str[i - 1]

result += str[str.length - 1] + count; // Bug: should be count + str[str.length - 1]
```

**Example 3 — TypeScript: `Math.min` instead of `Math.max` in Kadane’s algorithm**

Both calls use `Math.min` instead of `Math.max`, causing the algorithm to track the most negative subarray sum instead of the most positive.

```
currentSum = Math.min(currentSum + nums[i], nums[i]);  // Bug: should be Math.max

maxSum = Math.min(maxSum, currentSum);                  // Bug: should be Math.max
```

Run all examples:

```
python main.py
```

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#expected-output) Expected output

[Section titled “Expected output”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#expected-output)

The following shows the full agent conversation for Example 1 (Python postfix evaluator):

````
============================================================

Example 1: Python — Postfix Expression Evaluator Bug

============================================================

code_executor (to bug_fixer):

Fix this broken code:

def eval_postfix(expression):

    stack = []

    for token in expression.split():

        if token.lstrip('-').isdigit():

            stack.append(int(token))

        else:

            b = stack.pop()

            a = stack.pop()

            if token == '+':

                stack.append(a + b)

            elif token == '-':

                stack.append(b - a)

            elif token == '*':

                stack.append(a * b)

            elif token == '/':

                stack.append(b // a)

    return stack[0]

assert eval_postfix("3 4 +") == 7

assert eval_postfix("10 3 -") == 7, f"Got {eval_postfix('10 3 -')}"

assert eval_postfix("12 4 /") == 3, f"Got {eval_postfix('12 4 /')}"

assert eval_postfix("2 3 4 * +") == 14

print("All postfix tests passed!")

--------------------------------------------------------------------------------

>>>>>>>> USING AUTO REPLY...

bug_fixer (to code_executor):

```python

def eval_postfix(expression):

    stack = []

    for token in expression.split():

        if token.lstrip('-').isdigit():

            stack.append(int(token))

        else:

            b = stack.pop()

            a = stack.pop()

            if token == '+':

                stack.append(a + b)

            elif token == '-':

                stack.append(a - b)  # Fixed order of operands for subtraction

            elif token == '*':

                stack.append(a * b)

            elif token == '/':

                stack.append(a // b)  # Fixed order of operands for division

    return stack[0]

assert eval_postfix("3 4 +") == 7

assert eval_postfix("10 3 -") == 7, f"Got {eval_postfix('10 3 -')}"

assert eval_postfix("12 4 /") == 3, f"Got {eval_postfix('12 4 /')}"

assert eval_postfix("2 3 4 * +") == 14

print("All postfix tests passed!")

```

--------------------------------------------------------------------------------

>>>>>>>> USING AUTO REPLY...

>>>>>>>> EXECUTING CODE BLOCK (inferred language is python)...

code_executor (to bug_fixer):

exitcode: 0 (execution succeeded)

Code output: All postfix tests passed!

--------------------------------------------------------------------------------

>>>>>>>> USING AUTO REPLY...

bug_fixer (to code_executor):

TERMINATE
````

The agent correctly identified both reversed operand bugs from the assertion failure output alone and resolved them in a single attempt, adding its own `# Fixed order of operands` comments to the corrected lines.

#### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#how-the-message-loop-works) How the message loop works

[Section titled “How the message loop works”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#how-the-message-loop-works)

`recipient=bug_fixer` in `run()` is what connects the two agents. AG2 sets up a managed back-and-forth loop between them — after each reply, the message is automatically forwarded to the other agent. The agents have no direct reference to each other outside of that call.

Tracing the session above step by step:

1. `code_executor.run(recipient=bug_fixer, ...)` — AG2 starts the loop and `code_executor` sends the broken code as plain text to `bug_fixer`. Nothing is executed yet.
2. `bug_fixer` (LLM) analyzes the code and replies with the fix wrapped in a ``````python``` block.
3. AG2 calls `_generate_code_execution_reply_using_executor` on `code_executor` — a reply method registered automatically when `code_execution_config` is set. It scans `bug_fixer`’s last message for fenced code blocks, extracts the block, and calls `DaytonaCodeExecutor.execute_code_blocks()`.
4. Daytona runs the code in the sandbox and returns the exit code and output.
5. AG2 forwards the result (`exitcode: 0 (execution succeeded)\nCode output: All postfix tests passed!`) back to `bug_fixer` as `code_executor`’s reply.
6. `bug_fixer` sees the successful output and replies with `TERMINATE`.
7. AG2 checks `is_termination_msg` on the incoming message — returns `True`, conversation stops, the sandbox is deleted.

Note that the original broken code is never executed — only `bug_fixer`’s proposed fix goes into Daytona.

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#6-complete-code) 6\. Complete Code

[Section titled “6. Complete Code”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#6-complete-code)

````
import os

from autogen import ConversableAgent, LLMConfig

from autogen.coding import DaytonaCodeExecutor

from dotenv import load_dotenv

load_dotenv()

BUG_FIXER_SYSTEM_MESSAGE = """You are an expert bug fixer. You support Python, JavaScript, and TypeScript.

If asked to fix code in any other language, refuse and explain which languages are supported.

When given broken code:

1. Analyze the bug carefully and identify the root cause

2. Write the complete fixed code in a fenced code block using the correct language tag

3. Always include assertions or print statements at the end to verify the fix works

4. If your previous fix didn't work, analyze the error output and try a different approach

5. Once the code runs successfully, reply with just the word TERMINATE — never in the same message as a code block

Always wrap your code in fenced code blocks (```python, ```javascript, or ```typescript). Never explain without providing fixed code.

Never include TERMINATE in a message that contains a code block.

"""

def fix_bug(broken_code: str, error_description: str = "") -> None:

    llm_config = LLMConfig(

        {

            "model": "gpt-4o-mini",

            "api_key": os.environ["OPENAI_API_KEY"],

        }

    )

    with DaytonaCodeExecutor(timeout=60) as executor:

        bug_fixer = ConversableAgent(

            name="bug_fixer",

            system_message=BUG_FIXER_SYSTEM_MESSAGE,

            llm_config=llm_config,

            code_execution_config=False,

            is_termination_msg=lambda x: (

                "TERMINATE" in (x.get("content") or "") or not (x.get("content") or "").strip()

            ),

        )

        code_executor = ConversableAgent(

            name="code_executor",

            llm_config=False,

            code_execution_config={"executor": executor},

        )

        message = f"Fix this broken code:\n\n\n{broken_code}\n"

        if error_description:

            message += f"\n\nError: {error_description}"

        code_executor.run(

            recipient=bug_fixer,

            message=message,

            max_turns=8,

        ).process()

if __name__ == "__main__":

    # Example 1: Python — swapped operands in postfix expression evaluator

    broken_postfix = """\

def eval_postfix(expression):

    stack = []

    for token in expression.split():

        if token.lstrip('-').isdigit():

            stack.append(int(token))

        else:

            b = stack.pop()

            a = stack.pop()

            if token == '+':

                stack.append(a + b)

            elif token == '-':

                stack.append(b - a)

            elif token == '*':

                stack.append(a * b)

            elif token == '/':

                stack.append(b // a)

    return stack[0]

assert eval_postfix("3 4 +") == 7

assert eval_postfix("10 3 -") == 7, f"Got {eval_postfix('10 3 -')}"

assert eval_postfix("12 4 /") == 3, f"Got {eval_postfix('12 4 /')}"

assert eval_postfix("2 3 4 * +") == 14

print("All postfix tests passed!")

"""

    print("=" * 60)

    print("Example 1: Python — Postfix Expression Evaluator Bug")

    print("=" * 60)

    fix_bug(broken_postfix, "")

    # Example 2: JavaScript — wrong concatenation order in run-length encoder

    broken_js = """\

function encode(str) {

    if (!str) return '';

    let result = '';

    let count = 1;

    for (let i = 1; i < str.length; i++) {

        if (str[i] === str[i - 1]) {

            count++;

        } else {

            result += str[i - 1] + count;

            count = 1;

        }

    }

    result += str[str.length - 1] + count;

    return result;

}

console.assert(encode("aabbbcc") === "2a3b2c", `Expected "2a3b2c", got "${encode("aabbbcc")}"`);

console.assert(encode("abcd") === "1a1b1c1d", `Expected "1a1b1c1d", got "${encode("abcd")}"`);

console.log("All encoding tests passed!");

"""

    print("\n" + "=" * 60)

    print("Example 2: JavaScript — Run-Length Encoder Bug")

    print("=" * 60)

    fix_bug(broken_js, "")

    # Example 3: TypeScript — Math.min instead of Math.max in Kadane's algorithm

    broken_ts = """\

function maxSubarray(nums: number[]): number {

    let maxSum = nums[0];

    let currentSum = nums[0];

    for (let i = 1; i < nums.length; i++) {

        currentSum = Math.min(currentSum + nums[i], nums[i]);

        maxSum = Math.min(maxSum, currentSum);

    }

    return maxSum;

}

console.assert(maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]) === 6,

    `Expected 6, got ${maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4])}`);

console.assert(maxSubarray([1]) === 1,

    `Expected 1, got ${maxSubarray([1])}`);

console.assert(maxSubarray([5, 4, -1, 7, 8]) === 23,

    `Expected 23, got ${maxSubarray([5, 4, -1, 7, 8])}`);

console.log("All max subarray tests passed!");

"""

    print("\n" + "=" * 60)

    print("Example 3: TypeScript — Max Subarray Bug")

    print("=" * 60)

    fix_bug(broken_ts, "")
````

**Key advantages of this approach:**

- **Execution-verified fixes:** Every proposed fix is actually run in a sandbox — the agent only terminates when the code passes, not just when it looks correct
- **Secure execution:** Fix attempts run in isolated Daytona sandboxes, not on your machine
- **Multi-language support:** Python, JavaScript, TypeScript, and Bash — language is inferred automatically from the LLM’s fenced code block
- **Iterative refinement:** If a fix fails, the agent sees the full error output and retries automatically
- **Automatic cleanup:** The sandbox is deleted as soon as `fix_bug` returns, regardless of outcome

### [\#](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/\#7-api-reference) 7\. API Reference

[Section titled “7. API Reference”](https://www.daytona.io/docs/en/guides/ag2/ag2-bug-fixer-agent/#7-api-reference)

For the complete API reference of `DaytonaCodeExecutor`, including all configuration options and supported parameters, see the [DaytonaCodeExecutor documentation](https://docs.ag2.ai/latest/docs/api-reference/autogen/coding/DaytonaCodeExecutor/).