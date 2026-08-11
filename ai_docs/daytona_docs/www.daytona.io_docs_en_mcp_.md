---
url: "https://www.daytona.io/docs/en/mcp/"
title: "Daytona MCP Server | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/mcp/#_top)

# Daytona MCP Server

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/mcp.md)Open

Daytona Model Context Protocol (MCP) server enables AI agents to interact with [Daytona Sandboxes](https://www.daytona.io/docs/en/sandboxes) programmatically. This guide covers how to set up and use the MCP server with various AI agents.

## [\#](https://www.daytona.io/docs/en/mcp/\#install-daytona-cli) Install Daytona CLI

[Section titled “Install Daytona CLI”](https://www.daytona.io/docs/en/mcp/#install-daytona-cli)

Install the Daytona CLI to manage the MCP server.

- [Mac/Linux](https://www.daytona.io/docs/en/mcp/#tab-panel-632)
- [Windows](https://www.daytona.io/docs/en/mcp/#tab-panel-633)

```
brew install daytonaio/cli/daytona
```

```
powershell -Command "irm https://get.daytona.io/windows | iex"
```

## [\#](https://www.daytona.io/docs/en/mcp/\#authenticate-with-daytona) Authenticate with Daytona

[Section titled “Authenticate with Daytona”](https://www.daytona.io/docs/en/mcp/#authenticate-with-daytona)

Authenticate with Daytona to enable MCP server access.

- [CLI](https://www.daytona.io/docs/en/mcp/#tab-panel-628)

```
daytona login
```

## [\#](https://www.daytona.io/docs/en/mcp/\#initialize-mcp-server) Initialize MCP server

[Section titled “Initialize MCP server”](https://www.daytona.io/docs/en/mcp/#initialize-mcp-server)

Initialize the MCP server with your preferred AI agent. Supported agents include Claude, Cursor, and Windsurf.

- [CLI](https://www.daytona.io/docs/en/mcp/#tab-panel-629)

```
# Initialize with Claude

daytona mcp init claude

# Initialize with Cursor

daytona mcp init cursor

# Initialize with Windsurf

daytona mcp init windsurf
```

After initialization, open your AI agent application to begin using Daytona features.

## [\#](https://www.daytona.io/docs/en/mcp/\#configure-mcp-server) Configure MCP server

[Section titled “Configure MCP server”](https://www.daytona.io/docs/en/mcp/#configure-mcp-server)

Generate MCP configuration for integration with other AI agents.

- [CLI](https://www.daytona.io/docs/en/mcp/#tab-panel-630)

```
daytona mcp config
```

This command outputs a JSON configuration that you can copy into your agent’s settings:

```
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

## [\#](https://www.daytona.io/docs/en/mcp/\#start-mcp-server) Start MCP server

[Section titled “Start MCP server”](https://www.daytona.io/docs/en/mcp/#start-mcp-server)

Manually start the MCP server.

- [CLI](https://www.daytona.io/docs/en/mcp/#tab-panel-631)

```
daytona mcp start
```

## [\#](https://www.daytona.io/docs/en/mcp/\#available-tools) Available tools

[Section titled “Available tools”](https://www.daytona.io/docs/en/mcp/#available-tools)

MCP server provides the following tools for interacting with Daytona Sandboxes:

- [Sandbox management](https://www.daytona.io/docs/en/sandboxes)
- [File system operations](https://www.daytona.io/docs/en/file-system-operations)
- [Git operations](https://www.daytona.io/docs/en/git-operations)
- [Process and code execution](https://www.daytona.io/docs/en/process-code-execution)
- [Computer use](https://www.daytona.io/docs/en/computer-use)
- [Preview](https://www.daytona.io/docs/en/preview)