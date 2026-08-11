---
url: "https://www.daytona.io/docs/en/web-terminal.md"
title: undefined
---

\# Web Terminal

Daytona provides a browser-based web terminal for interacting with your sandboxes. The web terminal allows you to run commands, view files, and debug directly from your browser without installing any local tools.

\- \*\*Remote command execution\*\*: run shell commands directly in your sandbox
\- \*\*File management\*\*: navigate the file system, view and edit files
\- \*\*Debugging\*\*: inspect logs, monitor processes, and troubleshoot issues
\- \*\*Package management\*\*: install dependencies and configure your environment

\## Access from Dashboard

Access the web terminal directly from the \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/sandboxes).

1\. Go to \[Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Locate the running sandbox you want to access
3\. Click the terminal icon \*\*\`>\_\`\*\*

This opens the web terminal in a new browser tab, providing a full terminal session connected to your sandbox. The web terminal is available only for sandboxes in the \`STARTED\` state. If your sandbox is stopped, start it before attempting to access the terminal.

\## Access via CLI

When you create a sandbox using the Daytona CLI, the web terminal URL is displayed automatically in the output.

\`\`\`shell
daytona create
\`\`\`

The CLI output includes the terminal URL:

\`\`\`text
Sandbox '' created successfully
Connect via SSH: daytona ssh
Open the Web Terminal: https://22222-.proxy.daytona.work
\`\`\`

\## Access via URL

The web terminal runs on port \`22222\` inside each sandbox. You can obtain the terminal URL programmatically using \[Preview URLs\](https://www.daytona.io/docs/en/preview.md).

Pass port \`22222\` to the preview URL method:

\`\`\`python
terminal\_info = sandbox.get\_preview\_link(22222)
print(f"Web Terminal URL: {terminal\_info.url}")
\`\`\`

\`\`\`typescript
const terminalInfo = await sandbox.getPreviewLink(22222);
console.log(\`Web Terminal URL: ${terminalInfo.url}\`);
\`\`\`

\`\`\`ruby
terminal\_info = sandbox.preview\_url(22222)
puts "Web Terminal URL: #{terminal\_info.url}"
\`\`\`

\`\`\`go
url, err := sandbox.GetPreviewLink(ctx, 22222)
\`\`\`

\`\`\`bash
daytona preview-url  --port 22222
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/22222/preview-url' \
 --header 'Authorization: Bearer '
\`\`\`

\## Security

Terminal access is restricted to authenticated members of your \[Organization\](https://www.daytona.io/docs/en/organizations.md). Even when a sandbox has its \`public\` parameter set to \`true\`, the web terminal remains accessible only to organization members.

:::warning
The web terminal provides full shell access to your sandbox. Treat terminal URLs with the same care as SSH credentials. Do not share terminal URLs with untrusted parties.
:::