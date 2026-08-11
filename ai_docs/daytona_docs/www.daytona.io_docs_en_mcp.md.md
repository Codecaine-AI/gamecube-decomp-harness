---
url: "https://www.daytona.io/docs/en/mcp.md"
title: undefined
---

# Daytona MCP Server

Daytona Model Context Protocol (MCP) server enables AI agents to interact with [Daytona Sandboxes](https://www.daytona.io/docs/en/sandboxes.md) programmatically. This guide covers how to set up and use the MCP server with various AI agents.

## Install Daytona CLI

Install the Daytona CLI to manage the MCP server.


```bash
brew install daytonaio/cli/daytona
```


```bash
powershell -Command "irm https://get.daytona.io/windows | iex"
```


## Authenticate with Daytona

Authenticate with Daytona to enable MCP server access.


```bash
daytona login
```


## Initialize MCP server

Initialize the MCP server with your preferred AI agent. Supported agents include Claude, Cursor, and Windsurf.


```bash
# Initialize with Claude
daytona mcp init claude

# Initialize with Cursor
daytona mcp init cursor

# Initialize with Windsurf
daytona mcp init windsurf
```


After initialization, open your AI agent application to begin using Daytona features.

## Configure MCP server

Generate MCP configuration for integration with other AI agents.


```bash
daytona mcp config
```


This command outputs a JSON configuration that you can copy into your agent's settings:

```json
{
  "mcpServers": {
    "daytona-mcp": {
      "command": "daytona",
      "args": ["mcp", "start"],
      "env": {
        "HOME": "${HOME}",
        "PATH": "${HOME}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
      },
      "logFile": "${HOME}/Library/Logs/daytona/daytona-mcp-server.log"
    }
  }
}
```

:::note
For Windows users, add the following to the `env` field:
<br />
```json
"APPDATA": "${APPDATA}"
```
:::

## Start MCP server

Manually start the MCP server.


```bash
daytona mcp start
```


## Available tools

MCP server provides the following tools for interacting with Daytona Sandboxes:

- [Sandbox management](https://www.daytona.io/docs/en/sandboxes.md)
- [File system operations](https://www.daytona.io/docs/en/file-system-operations.md)
- [Git operations](https://www.daytona.io/docs/en/git-operations.md)
- [Process and code execution](https://www.daytona.io/docs/en/process-code-execution.md)
- [Computer use](https://www.daytona.io/docs/en/computer-use.md)
- [Preview](https://www.daytona.io/docs/en/preview.md)