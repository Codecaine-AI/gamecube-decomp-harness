---
url: "https://www.daytona.io/docs/en/ssh-access.md"
title: undefined
---

\# SSH Access

Daytona provides SSH access to your sandboxes using token-based authentication. This allows you to connect from local terminals, IDEs, and development tools without installing additional software.

\## Access from Dashboard

Create an SSH access token directly from the \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/sandboxes).

1\. Go to \[Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Locate the sandbox you want to create an SSH access token for
3\. Click the sandbox options menu (\*\*⋮\*\*)
4\. Select \*\*Create SSH Access\*\*
5\. Set the expiration time (defaults to 60 minutes)
6\. Click \*\*Create\*\*

Daytona generates a token and displays it in the modal. Copy the token and use it to connect to your sandbox.

\## Access via CLI

Daytona provides a CLI command to create an SSH access token for a sandbox:

\`\`\`shell
daytona create
\`\`\`

When you create a sandbox, Daytona displays the SSH command automatically in the output:

\`\`\`text
Sandbox '' created successfully
Connect via SSH: daytona ssh
Open the Web Terminal: https://22222-.proxy.daytona.work
\`\`\`

To SSH into an existing sandbox, use the following command:

\`\`\`bash
daytona ssh  --expires 60
\`\`\`

\## Access via token

You can create SSH access tokens programmatically. The token can then be used to connect manually:

\`\`\`python
from daytona import Daytona

daytona = Daytona()
sandbox = daytona.get("sandbox-abc123")

\# Create SSH access token
ssh\_access = sandbox.create\_ssh\_access(expires\_in\_minutes=60)
print(f"SSH Token: {ssh\_access.token}")
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.get('sandbox-abc123')

// Create SSH access token
const sshAccess = await sandbox.createSshAccess(60)
console.log(\`SSH Token: ${sshAccess.token}\`)
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.get('sandbox-abc123')

\# Create SSH access token
ssh\_access = sandbox.create\_ssh\_access(expires\_in\_minutes: 60)
puts "SSH Token: #{ssh\_access.token}"
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ssh-access?expiresInMinutes=60' \
 --request POST \
 --header 'Authorization: Bearer '
\`\`\`

To connect to your sandbox, use the following command:

\`\`\`bash
ssh @ssh.app.daytona.io
\`\`\`

\## Connect with VS Code

You can connect VS Code directly to your sandbox using the Remote SSH extension.

1\. Install the \[Remote Explorer extension ↗\](https://marketplace.visualstudio.com/items?itemName=ms-vscode.remote-explorer)
2\. Add a new SSH connection
3\. When prompted for the SSH connection URL, paste the SSH command from above

For more information, see the \[VS Code Remote SSH documentation ↗\](https://code.visualstudio.com/docs/remote/ssh).

\## Connect with JetBrains IDEs

JetBrains Gateway provides remote development support for connecting to your sandbox.

1\. Download \[JetBrains Gateway ↗\](https://www.jetbrains.com/remote-development/gateway/)
2\. Add a new connection
3\. When prompted for the SSH connection URL, paste the SSH command from above
4\. Select the IDE to install in your sandbox

\## Token management

\### Expiration

SSH access tokens expire automatically after 60 minutes. You can specify a custom expiration time when creating the token using the \`expires\_in\_minutes\` parameter.

\### Revoke token

Revoke SSH access tokens before expiry:

\`\`\`python
\# Revoke specific SSH access token for the sandbox
sandbox.revoke\_ssh\_access(token="specific-token")
\`\`\`

\`\`\`typescript
// Revoke specific SSH access token for the sandbox
await sandbox.revokeSshAccess('specific-token')
\`\`\`

\`\`\`ruby
\# Revoke specific SSH access token for the sandbox
sandbox.revoke\_ssh\_access(token: 'specific-token')
\`\`\`

\`\`\`bash
\# Revoke specific SSH access token
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ssh-access?token=specific-token' \
 --request DELETE \
 --header 'Authorization: Bearer '

\# Revoke all SSH access for the sandbox
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ssh-access' \
 --request DELETE \
 --header 'Authorization: Bearer '
\`\`\`