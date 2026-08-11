---
url: "https://www.daytona.io/docs/en/web-terminal/"
title: "Web Terminal | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/web-terminal/#_top)

# Web Terminal

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/web-terminal.md)Open

Daytona provides a browser-based web terminal for interacting with your sandboxes. The web terminal allows you to run commands, view files, and debug directly from your browser without installing any local tools.

- **Remote command execution**: run shell commands directly in your sandbox
- **File management**: navigate the file system, view and edit files
- **Debugging**: inspect logs, monitor processes, and troubleshoot issues
- **Package management**: install dependencies and configure your environment

## [\#](https://www.daytona.io/docs/en/web-terminal/\#access-from-dashboard) Access from Dashboard

[Section titled “Access from Dashboard”](https://www.daytona.io/docs/en/web-terminal/#access-from-dashboard)

Access the web terminal directly from the [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sandboxes).

1. Go to [Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Locate the running sandbox you want to access
3. Click the terminal icon **`>_`**

This opens the web terminal in a new browser tab, providing a full terminal session connected to your sandbox. The web terminal is available only for sandboxes in the `STARTED` state. If your sandbox is stopped, start it before attempting to access the terminal.

## [\#](https://www.daytona.io/docs/en/web-terminal/\#access-via-cli) Access via CLI

[Section titled “Access via CLI”](https://www.daytona.io/docs/en/web-terminal/#access-via-cli)

When you create a sandbox using the Daytona CLI, the web terminal URL is displayed automatically in the output.

```
daytona create
```

The CLI output includes the terminal URL:

```
Sandbox '<sandboxId>' created successfully

Connect via SSH:         daytona ssh <sandboxId>

Open the Web Terminal:   https://22222-<sandboxId>.proxy.daytona.work
```

## [\#](https://www.daytona.io/docs/en/web-terminal/\#access-via-url) Access via URL

[Section titled “Access via URL”](https://www.daytona.io/docs/en/web-terminal/#access-via-url)

The web terminal runs on port `22222` inside each sandbox. You can obtain the terminal URL programmatically using [Preview URLs](https://www.daytona.io/docs/en/preview).

Pass port `22222` to the preview URL method:

- [Python](https://www.daytona.io/docs/en/web-terminal/#tab-panel-1663)
- [TypeScript](https://www.daytona.io/docs/en/web-terminal/#tab-panel-1664)
- [Ruby](https://www.daytona.io/docs/en/web-terminal/#tab-panel-1665)
- [Go](https://www.daytona.io/docs/en/web-terminal/#tab-panel-1666)
- [CLI](https://www.daytona.io/docs/en/web-terminal/#tab-panel-1667)
- [API](https://www.daytona.io/docs/en/web-terminal/#tab-panel-1668)

```
terminal_info = sandbox.get_preview_link(22222)

print(f"Web Terminal URL: {terminal_info.url}")
```

```
const terminalInfo = await sandbox.getPreviewLink(22222);

console.log(`Web Terminal URL: ${terminalInfo.url}`);
```

```
terminal_info = sandbox.preview_url(22222)

puts "Web Terminal URL: #{terminal_info.url}"
```

```
url, err := sandbox.GetPreviewLink(ctx, 22222)
```

```
daytona preview-url <sandbox-name> --port 22222
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/22222/preview-url' \

  --header 'Authorization: Bearer <API_KEY>'
```

## [\#](https://www.daytona.io/docs/en/web-terminal/\#security) Security

[Section titled “Security”](https://www.daytona.io/docs/en/web-terminal/#security)

Terminal access is restricted to authenticated members of your [Organization](https://www.daytona.io/docs/en/organizations). Even when a sandbox has its `public` parameter set to `true`, the web terminal remains accessible only to organization members.

The web terminal provides full shell access to your sandbox. Treat terminal URLs with the same care as SSH credentials. Do not share terminal URLs with untrusted parties.