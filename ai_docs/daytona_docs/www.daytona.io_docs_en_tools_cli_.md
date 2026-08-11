---
url: "https://www.daytona.io/docs/en/tools/cli/"
title: "CLI | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/tools/cli/#_top)

# CLI

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/tools/cli.md)Open

Daytona provides command-line access to core features for interacting with Daytona Sandboxes, including managing their lifecycle, snapshots, and more.

The CLI reference lists all commands supported by the `daytona` command-line tool, complete with a description of their behavior, and any supported flags.
You can access this documentation on a per-command basis by appending the `--help`/`-h` flag when invoking `daytona`.

## [\#](https://www.daytona.io/docs/en/tools/cli/\#installation) Installation

[Section titled “Installation”](https://www.daytona.io/docs/en/tools/cli/#installation)

Install the Daytona CLI to interact with Daytona sandboxes from the command line.

- [Mac](https://www.daytona.io/docs/en/tools/cli/#tab-panel-1517)
- [Linux](https://www.daytona.io/docs/en/tools/cli/#tab-panel-1518)
- [Windows](https://www.daytona.io/docs/en/tools/cli/#tab-panel-1519)

```
brew install daytonaio/cli/daytona
```

Trust the tap once so routine `brew upgrade` keeps the Daytona CLI up to date. Recent Homebrew versions require third-party taps to be explicitly trusted; without it, a bare `brew upgrade` skips the Daytona tap and the CLI goes stale:

```
brew trust daytonaio/cli
```

To upgrade the Daytona CLI to the latest version:

```
brew upgrade daytonaio/cli/daytona
```

Alternatively, install directly without Homebrew:

For Apple Silicon (`arm64`):

```
sudo curl -fL https://github.com/daytona/clients/releases/latest/download/daytona-darwin-arm64 -o /usr/local/bin/daytona && sudo chmod +x /usr/local/bin/daytona
```

For Intel (`amd64`):

```
sudo curl -fL https://github.com/daytona/clients/releases/latest/download/daytona-darwin-amd64 -o /usr/local/bin/daytona && sudo chmod +x /usr/local/bin/daytona
```

Choose the command for your Linux architecture. Both commands download the latest binary from GitHub releases and install it to `/usr/local/bin`, overwriting any existing version.

For `amd64` (`x86_64`):

```
sudo curl -fL https://github.com/daytona/clients/releases/latest/download/daytona-linux-amd64 -o /usr/local/bin/daytona && sudo chmod +x /usr/local/bin/daytona
```

For `arm64` (`aarch64`):

```
sudo curl -fL https://github.com/daytona/clients/releases/latest/download/daytona-linux-arm64 -o /usr/local/bin/daytona && sudo chmod +x /usr/local/bin/daytona
```

```
powershell -Command "irm https://get.daytona.io/windows | iex"
```

After installing the Daytona CLI, use the `daytona` command to interact with Daytona sandboxes from the command line.

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona) daytona

[Section titled “daytona”](https://www.daytona.io/docs/en/tools/cli/#daytona)

Daytona CLI

```
daytona [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |
| `--version` | `-v` | Display the version of Daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-archive) daytona archive

[Section titled “daytona archive”](https://www.daytona.io/docs/en/tools/cli/#daytona-archive)

Archive a sandbox

```
daytona archive [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-autocomplete) daytona autocomplete

[Section titled “daytona autocomplete”](https://www.daytona.io/docs/en/tools/cli/#daytona-autocomplete)

Adds a completion script for your shell environment

```
daytona autocomplete [bash|zsh|fish|powershell] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-create) daytona create

[Section titled “daytona create”](https://www.daytona.io/docs/en/tools/cli/#daytona-create)

Create a new sandbox

```
daytona create [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--auto-archive` |  | Auto-archive interval in minutes (0 means the maximum interval will be used) |
| `--auto-delete` |  | Auto-delete interval in minutes (negative value means disabled, 0 means delete immediately upon stopping) |
| `--auto-stop` |  | Auto-stop interval in minutes (0 means disabled) |
| `--context` | `-c` | Files or directories to include in the build context (can be specified multiple times) |
| `--cpu` |  | CPU cores allocated to the sandbox |
| `--disk` |  | Disk space allocated to the sandbox in GB |
| `--dockerfile` | `-f` | Path to Dockerfile for Sandbox snapshot |
| `--env` | `-e` | Environment variables (format: KEY=VALUE) |
| `--gpu` |  | GPU units allocated to the sandbox |
| `--label` | `-l` | Labels (format: KEY=VALUE) |
| `--memory` |  | Memory allocated to the sandbox in MB |
| `--name` |  | Name of the sandbox |
| `--network-allow-list` |  | Comma-separated list of allowed CIDR network addresses for the sandbox |
| `--network-block-all` |  | Whether to block all network access for the sandbox |
| `--public` |  | Make sandbox publicly accessible |
| `--snapshot` |  | Snapshot to use for the sandbox |
| `--target` |  | Target region (eu, us) |
| `--user` |  | User associated with the sandbox |
| `--volume` | `-v` | Volumes to mount (format: VOLUME\_ID\_OR\_NAME:MOUNT\_PATH) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-delete) daytona delete

[Section titled “daytona delete”](https://www.daytona.io/docs/en/tools/cli/#daytona-delete)

Delete a sandbox

```
daytona delete [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--all` | `-a` | Delete all sandboxes |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-docs) daytona docs

[Section titled “daytona docs”](https://www.daytona.io/docs/en/tools/cli/#daytona-docs)

Opens the Daytona documentation in your default browser.

```
daytona docs [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-exec) daytona exec

[Section titled “daytona exec”](https://www.daytona.io/docs/en/tools/cli/#daytona-exec)

Execute a command in a sandbox

```
daytona exec [SANDBOX_ID | SANDBOX_NAME] -- [COMMAND] [ARGS...] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--cwd` |  | Working directory for command execution |
| `--timeout` |  | Command timeout in seconds (0 for no timeout) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-info) daytona info

[Section titled “daytona info”](https://www.daytona.io/docs/en/tools/cli/#daytona-info)

Get sandbox info

```
daytona info [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--format` | `-f` | Output format. Must be one of (yaml, json) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-list) daytona list

[Section titled “daytona list”](https://www.daytona.io/docs/en/tools/cli/#daytona-list)

List sandboxes

```
daytona list [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--cursor` | `-c` | Cursor for pagination |
| `--format` | `-f` | Output format. Must be one of (yaml, json) |
| `--limit` | `-l` | Maximum number of items per page |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-login) daytona login

[Section titled “daytona login”](https://www.daytona.io/docs/en/tools/cli/#daytona-login)

Log in to Daytona

```
daytona login [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--api-key` |  | API key to use for authentication |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-logout) daytona logout

[Section titled “daytona logout”](https://www.daytona.io/docs/en/tools/cli/#daytona-logout)

Logout from Daytona

```
daytona logout [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-mcp) daytona mcp

[Section titled “daytona mcp”](https://www.daytona.io/docs/en/tools/cli/#daytona-mcp)

Manage Daytona MCP Server

```
daytona mcp [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-mcp-config) daytona mcp config

[Section titled “daytona mcp config”](https://www.daytona.io/docs/en/tools/cli/#daytona-mcp-config)

Outputs JSON configuration for Daytona MCP Server

```
daytona mcp config [AGENT_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-mcp-init) daytona mcp init

[Section titled “daytona mcp init”](https://www.daytona.io/docs/en/tools/cli/#daytona-mcp-init)

Initialize Daytona MCP Server with an agent (currently supported: claude, windsurf, cursor)

```
daytona mcp init [AGENT_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-mcp-start) daytona mcp start

[Section titled “daytona mcp start”](https://www.daytona.io/docs/en/tools/cli/#daytona-mcp-start)

Start Daytona MCP Server

```
daytona mcp start [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-organization) daytona organization

[Section titled “daytona organization”](https://www.daytona.io/docs/en/tools/cli/#daytona-organization)

Manage Daytona organizations

```
daytona organization [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-organization-create) daytona organization create

[Section titled “daytona organization create”](https://www.daytona.io/docs/en/tools/cli/#daytona-organization-create)

Create a new organization and set it as active

```
daytona organization create [ORGANIZATION_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-organization-delete) daytona organization delete

[Section titled “daytona organization delete”](https://www.daytona.io/docs/en/tools/cli/#daytona-organization-delete)

Delete an organization

```
daytona organization delete [ORGANIZATION] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-organization-list) daytona organization list

[Section titled “daytona organization list”](https://www.daytona.io/docs/en/tools/cli/#daytona-organization-list)

List all organizations

```
daytona organization list [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--format` | `-f` | Output format. Must be one of (yaml, json) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-organization-use) daytona organization use

[Section titled “daytona organization use”](https://www.daytona.io/docs/en/tools/cli/#daytona-organization-use)

Set active organization

```
daytona organization use [ORGANIZATION] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-preview-url) daytona preview-url

[Section titled “daytona preview-url”](https://www.daytona.io/docs/en/tools/cli/#daytona-preview-url)

Get signed preview URL for a sandbox port

```
daytona preview-url [SANDBOX_ID | SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--expires` |  | URL expiration time in seconds |
| `--port` | `-p` | Port number to get preview URL for (required) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-snapshot) daytona snapshot

[Section titled “daytona snapshot”](https://www.daytona.io/docs/en/tools/cli/#daytona-snapshot)

Manage Daytona snapshots

```
daytona snapshot [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-snapshot-create) daytona snapshot create

[Section titled “daytona snapshot create”](https://www.daytona.io/docs/en/tools/cli/#daytona-snapshot-create)

Create a snapshot

```
daytona snapshot create [SNAPSHOT] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--context` | `-c` | Files or directories to include in the build context (can be specified multiple times). If not provided, context will be automatically determined from COPY/ADD commands in the Dockerfile |
| `--cpu` |  | CPU cores that will be allocated to the underlying sandboxes (default: 1) |
| `--disk` |  | Disk space that will be allocated to the underlying sandboxes in GB (default: 3) |
| `--dockerfile` | `-f` | Path to Dockerfile to build |
| `--entrypoint` | `-e` | The entrypoint command for the snapshot |
| `--image` | `-i` | The image name for the snapshot |
| `--memory` |  | Memory that will be allocated to the underlying sandboxes in GB (default: 1) |
| `--region` |  | ID of the region where the snapshot will be available (defaults to organization default region) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-snapshot-delete) daytona snapshot delete

[Section titled “daytona snapshot delete”](https://www.daytona.io/docs/en/tools/cli/#daytona-snapshot-delete)

Delete a snapshot

```
daytona snapshot delete [SNAPSHOT_ID | SNAPSHOT_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--all` | `-a` | Delete all snapshots |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-snapshot-list) daytona snapshot list

[Section titled “daytona snapshot list”](https://www.daytona.io/docs/en/tools/cli/#daytona-snapshot-list)

List all snapshots

```
daytona snapshot list [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--format` | `-f` | Output format. Must be one of (yaml, json) |
| `--limit` | `-l` | Maximum number of items per page |
| `--page` | `-p` | Page number for pagination (starting from 1) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-snapshot-push) daytona snapshot push

[Section titled “daytona snapshot push”](https://www.daytona.io/docs/en/tools/cli/#daytona-snapshot-push)

Push local snapshot

```
daytona snapshot push [SNAPSHOT] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--cpu` |  | CPU cores that will be allocated to the underlying sandboxes (default: 1) |
| `--disk` |  | Disk space that will be allocated to the underlying sandboxes in GB (default: 3) |
| `--entrypoint` | `-e` | The entrypoint command for the image |
| `--memory` |  | Memory that will be allocated to the underlying sandboxes in GB (default: 1) |
| `--name` | `-n` | Specify the Snapshot name |
| `--region` |  | ID of the region where the snapshot will be available (defaults to organization default region) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-ssh) daytona ssh

[Section titled “daytona ssh”](https://www.daytona.io/docs/en/tools/cli/#daytona-ssh)

SSH into a sandbox

```
daytona ssh [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--expires` |  | SSH access token expiration time in minutes (defaults to 24 hours) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-start) daytona start

[Section titled “daytona start”](https://www.daytona.io/docs/en/tools/cli/#daytona-start)

Start a sandbox

```
daytona start [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-stop) daytona stop

[Section titled “daytona stop”](https://www.daytona.io/docs/en/tools/cli/#daytona-stop)

Stop a sandbox

```
daytona stop [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--force` | `-f` | Force stop the sandbox using SIGKILL |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-version) daytona version

[Section titled “daytona version”](https://www.daytona.io/docs/en/tools/cli/#daytona-version)

Print the version number

```
daytona version [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-volume) daytona volume

[Section titled “daytona volume”](https://www.daytona.io/docs/en/tools/cli/#daytona-volume)

Manage Daytona volumes

```
daytona volume [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-volume-create) daytona volume create

[Section titled “daytona volume create”](https://www.daytona.io/docs/en/tools/cli/#daytona-volume-create)

Create a volume

```
daytona volume create [NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--size` | `-s` | Size of the volume in GB |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-volume-delete) daytona volume delete

[Section titled “daytona volume delete”](https://www.daytona.io/docs/en/tools/cli/#daytona-volume-delete)

Delete a volume

```
daytona volume delete [VOLUME_ID_OR_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-volume-get) daytona volume get

[Section titled “daytona volume get”](https://www.daytona.io/docs/en/tools/cli/#daytona-volume-get)

Get volume details

```
daytona volume get [VOLUME_ID_OR_NAME] [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--format` | `-f` | Output format. Must be one of (yaml, json) |
| `--help` |  | help for daytona |

## [\#](https://www.daytona.io/docs/en/tools/cli/\#daytona-volume-list) daytona volume list

[Section titled “daytona volume list”](https://www.daytona.io/docs/en/tools/cli/#daytona-volume-list)

List all volumes

```
daytona volume list [flags]
```

**Flags**

| Long | Short | Description |
| :-- | :-- | :-- |
| `--format` | `-f` | Output format. Must be one of (yaml, json) |
| `--help` |  | help for daytona |