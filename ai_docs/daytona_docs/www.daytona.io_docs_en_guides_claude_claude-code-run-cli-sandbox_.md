---
url: "https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/"
title: "Run Claude Code in a Daytona Sandbox via CLI | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#_top)

# Run Claude Code in a Daytona Sandbox via CLI

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox.md)Open

This guide walks you through running Claude Code inside a Daytona sandbox using the Daytona CLI.

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/\#prerequisites) Prerequisites

[Section titled “Prerequisites”](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#prerequisites)

- Daytona account and API key (Get it from [Daytona Dashboard](https://app.daytona.io/dashboard/keys))
- Local terminal (macOS, Linux, or Windows)

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/\#install-the-daytona-cli) Install the Daytona CLI

[Section titled “Install the Daytona CLI”](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#install-the-daytona-cli)

- [Mac/Linux](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#tab-panel-416)
- [Windows](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#tab-panel-417)

```
brew install daytonaio/cli/daytona
```

```
powershell -Command "irm https://get.daytona.io/windows | iex"
```

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/\#authenticate-with-daytona) Authenticate with Daytona

[Section titled “Authenticate with Daytona”](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#authenticate-with-daytona)

Log in to your Daytona account using your API key:

```
daytona login --api-key=YOUR_API_KEY
```

Replace `YOUR_API_KEY` with your actual Daytona API key.

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/\#create-a-sandbox) Create a Sandbox

[Section titled “Create a Sandbox”](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#create-a-sandbox)

Create a new sandbox for running Claude Code:

```
daytona sandbox create --name claude-sandbox
```

This creates a sandbox named `claude-sandbox`, visible in your [Dashboard](https://app.daytona.io/dashboard/sandboxes). The default Daytona snapshot includes Claude Code, so the command above is all you need.

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/\#connect-to-the-sandbox) Connect to the Sandbox

[Section titled “Connect to the Sandbox”](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#connect-to-the-sandbox)

SSH into your sandbox:

```
daytona ssh claude-sandbox
```

You now have an interactive terminal session inside the sandbox.

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/\#run-claude-code) Run Claude Code

[Section titled “Run Claude Code”](https://www.daytona.io/docs/en/guides/claude/claude-code-run-cli-sandbox/#run-claude-code)

Inside the SSH session, start Claude Code:

```
claude
```

On first run, Claude Code will prompt you to authenticate:

1. Copy the authentication URL displayed in the terminal
2. Open the URL in your local browser
3. Complete the authentication flow
4. Copy the code provided by the browser
5. Paste the code back into the terminal

Once authenticated, you’re all set. Claude Code runs inside the sandbox while you control it from your terminal.