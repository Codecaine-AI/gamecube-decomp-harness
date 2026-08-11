---
url: "https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/"
title: "Use Mastra Coding Agent with Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#_top)

# Use Mastra Coding Agent with Daytona

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent.md)Open

This guide demonstrates how to configure the [Mastra coding agent](https://github.com/mastra-ai/template-coding-agent) to use Daytona sandboxes, enabling you to leverage AI capabilities for any coding-related task in a secure, isolated environment.

* * *

### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#1-workflow-overview)

Once configured, you can use Mastra Studio to interact with the coding agent through a ChatGPT-like interface. This enables human-in-the-loop workflows where you can guide the agent, review its decisions, and iterate on solutions in real-time; all while the agent executes tasks securely within Daytona sandboxes.

### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#clone-the-repository)

Clone the Mastra coding agent template repository, which includes the agent implementation and Daytona integration:

```
git clone https://github.com/mastra-ai/template-coding-agent.git

cd template-coding-agent
```

#### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#configure-environment)

Create a `.env` file in the project root directory:

```
touch .env
```

The `.env` file requires the following configuration:

- **LLM Provider**: The AI model provider for your coding agent
- **Model**: The specific model to use from your chosen provider
- **Sandbox Provider**: Daytona configuration for isolated execution

For this guide, we’ll use OpenAI as the LLM provider with the `gpt-4o-mini` model:

```
OPENAI_API_KEY=your_openai_key

MODEL=openai/gpt-4o-mini
```

The agent works with any provider supported by [Mastra’s model router](https://mastra.ai/models) \- set `MODEL` in `provider/model` format and the matching provider API key. For example, to use [Fireworks AI](https://fireworks.ai/):

```
FIREWORKS_API_KEY=your_fireworks_key

MODEL=fireworks-ai/accounts/fireworks/models/kimi-k2p6
```

Next, configure Daytona as your sandbox provider by adding your API key (available from the [Daytona Dashboard](https://app.daytona.io/dashboard/keys)):

```
DAYTONA_API_KEY=your-daytona-api-key-here
```

#### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#install-dependencies) Install Dependencies

[Section titled “Install Dependencies”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#install-dependencies)

Install the required packages using pnpm:

```
pnpm install
```

### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#3-running-the-agent) 3\. Running the Agent

[Section titled “3. Running the Agent”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#3-running-the-agent)

Mastra Studio provides a ChatGPT-like interface for interacting with your coding agent. This mode offers:

- **Conversation History**: Previous conversations are stored and organized in threads
- **Visual Debugging**: Inspect agent execution steps, workflow, and tool calls
- **Model Switching**: Easily switch between different AI models
- **Tool Inspection**: View which tools your agent is using in real-time

For a complete overview of all features and capabilities, visit the [Mastra Studio documentation](https://mastra.ai/docs/getting-started/studio).

Start the dev server with:

```
pnpm run dev
```

If the dev server starts successfully, you’ll see the terminal output displaying the URLs where you can access Mastra Studio:

```
│ Studio: http://localhost:4111

│ API:    http://localhost:4111/api
```

Once started, open the provided URL in your browser to access the interactive interface. You can interact with your agent while monitoring its workflow in the terminal, where detailed logs show execution steps and low-level parameters.

Below is an example of terminal logs generated when the agent calls the `writeFile` tool to create a JavaScript file with a basic “Hello, world!” output:

```
{

  "text": "",

  "toolCalls": [\
\
    {\
\
      "type": "tool-call",\
\
      "runId": "ab2a1d08-91c6-4028-9046-3446a721527f",\
\
      "from": "AGENT",\
\
      "payload": {\
\
        "toolCallId": "call_NiLLgBmgrYLSL0MsrG54E4A5",\
\
        "toolName": "writeFile",\
\
        "args": {\
\
          "sandboxId": "2152d23b-5742-47c2-9992-4414d4144869",\
\
          "path": "hello.js",\
\
          "content": "console.log('Hello, world!');"\
\
        },\
\
        "providerMetadata": {\
\
          "openai": {\
\
            "itemId": "fc_00bba3412cd22a2b0069399fbaeef881909b0583f359cbc33c"\
\
          }\
\
        }\
\
      }\
\
    }\
\
  ],

  "toolResults": [\
\
    {\
\
      "type": "tool-result",\
\
      "runId": "ab2a1d08-91c6-4028-9046-3446a721527f",\
\
      "from": "AGENT",\
\
      "payload": {\
\
        "args": {\
\
          "sandboxId": "2152d23b-5742-47c2-9992-4414d4144869",\
\
          "path": "hello.js",\
\
          "content": "console.log('Hello, world!');"\
\
        },\
\
        "toolCallId": "call_NiLLgBmgrYLSL0MsrG54E4A5",\
\
        "toolName": "writeFile",\
\
        "result": {\
\
          "success": true,\
\
          "path": "/home/daytona/hello.js"\
\
        },\
\
        "providerMetadata": {\
\
          "openai": {\
\
            "itemId": "fc_00bba3412cd22a2b0069399fbaeef881909b0583f359cbc33c"\
\
          }\
\
        }\
\
      }\
\
    }\
\
  ],

  "finishReason": "tool-calls",

  "usage": {

    "inputTokens": 4243,

    "outputTokens": 53,

    "totalTokens": 4296,

    "reasoningTokens": 0,

    "cachedInputTokens": 4096

  },

  "runId": "ab2a1d08-91c6-4028-9046-3446a721527f"

}
```

These logs show complete visibility into tool execution including arguments, results, token usage with caching metrics, and unique identifiers for debugging.

### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#4-example-usage) 4\. Example Usage

[Section titled “4. Example Usage”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#4-example-usage)

Let’s walk through a practical example to see the Mastra coding agent and Daytona sandbox integration in action. We’ll ask the agent to complete the following task:

> _“Create a Python file with a function that reverses a string, write a test file for it, and run the tests.”_

#### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#agent-workflow) Agent Workflow

[Section titled “Agent Workflow”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#agent-workflow)

The agent executes this task through a series of coordinated steps, utilizing different tools to interact with the Daytona sandbox:

##### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#1-create-sandbox) 1\. Create Sandbox

[Section titled “1. Create Sandbox”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#1-create-sandbox)

The agent first provisions a new Daytona sandbox for Python development:

**Tool:**`createSandbox`

**Arguments:**

```
{

  "name": "reverse_string_project",

  "labels": null,

  "language": "python",

  "envVars": null

}
```

**Result:**

```
{

  "sandboxId": "bdfa9456-4945-43a7-97df-b9bfbcbdc62e"

}
```

##### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#2-write-project-files) 2\. Write Project Files

[Section titled “2. Write Project Files”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#2-write-project-files)

Next, the agent creates both the implementation and test files in a single operation:

**Tool:**`writeFiles`

**Arguments:**

```
{

  "sandboxId": "bdfa9456-4945-43a7-97df-b9bfbcbdc62e",

  "files": [\
\
    {\
\
      "path": "reverse_string.py",\
\
      "data": "def reverse_string(s):\n    \"\"\"Return the reversed version of the input string s.\"\"\"\n    return s[::-1]\n"\
\
    },\
\
    {\
\
      "path": "test_reverse_string.py",\
\
      "data": "import unittest\nfrom reverse_string import reverse_string\n\nclass TestReverseString(unittest.TestCase):\n    def test_regular(self):\n        self.assertEqual(reverse_string(\"hello\"), \"olleh\")\n    def test_empty(self):\n        self.assertEqual(reverse_string(\"\"), \"\")\n    def test_single_char(self):\n        self.assertEqual(reverse_string(\"a\"), \"a\")\n    def test_numbers(self):\n        self.assertEqual(reverse_string(\"12345\"), \"54321\")\n\nif __name__ == \"__main__\":\n    unittest.main()\n"\
\
    }\
\
  ]

}
```

**Result:**

```
{

  "success": true,

  "filesWritten": [\
\
    "/home/daytona/reverse_string.py",\
\
    "/home/daytona/test_reverse_string.py"\
\
  ]

}
```

##### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#3-execute-tests) 3\. Execute Tests

[Section titled “3. Execute Tests”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#3-execute-tests)

Finally, the agent runs the test suite to verify the implementation:

**Tool:**`runCommand`

**Arguments:**

```
{

  "sandboxId": "bdfa9456-4945-43a7-97df-b9bfbcbdc62e",

  "command": "python3 test_reverse_string.py",

  "envs": null,

  "workingDirectory": null,

  "timeoutSeconds": 20,

  "captureOutput": true

}
```

**Result:**

```
{

  "success": true,

  "exitCode": 0,

  "stdout": "....\n----------------------------------------------------------------------\nRan 4 tests in 0.000s\n\nOK\n",

  "command": "python3 test_reverse_string.py",

  "executionTime": 218

}
```

#### [\#](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/\#agent-response) Agent Response

[Section titled “Agent Response”](https://www.daytona.io/docs/en/guides/mastra/mastra-coding-agent/#agent-response)

After successfully completing all steps, the agent provides a detailed summary:

```
The project is complete! Here's what was done:

✓ Created reverse_string.py with a function to reverse a string.

✓ Created test_reverse_string.py using Python's unittest to test the function with several cases.

✓ Ran the tests—all tests passed successfully.

Test Output:

....

----------------------------------------------------------------------

Ran 4 tests in 0.000s

OK

Would you like to see the code for either file or make any changes?
```

This example demonstrates how the agent autonomously handles the entire development workflow, from environment setup to test execution, all within the secure Daytona sandbox environment.

**Key Advantages**

- **Secure Isolation**: All agent operations run in isolated Daytona sandboxes, protecting your local environment
- **Multi-Language Support**: Execute code across different programming languages without local setup
- **Enhanced Debugging**: Use Mastra Studio to visualize and debug agent workflows in real-time
- **Scalable Execution**: Leverage Daytona’s cloud infrastructure for resource-intensive tasks