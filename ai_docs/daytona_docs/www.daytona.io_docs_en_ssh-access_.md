---
url: "https://www.daytona.io/docs/en/ssh-access/"
title: "SSH Access | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ssh-access/#_top)

# SSH Access

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ssh-access.md)Open

Daytona provides SSH access to your sandboxes using token-based authentication. This allows you to connect from local terminals, IDEs, and development tools without installing additional software.

## [\#](https://www.daytona.io/docs/en/ssh-access/\#access-from-dashboard) Access from Dashboard

[Section titled “Access from Dashboard”](https://www.daytona.io/docs/en/ssh-access/#access-from-dashboard)

Create an SSH access token directly from the [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sandboxes).

1. Go to [Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Locate the sandbox you want to create an SSH access token for
3. Click the sandbox options menu ( **⋮**)
4. Select **Create SSH Access**
5. Set the expiration time (defaults to 60 minutes)
6. Click **Create**

Daytona generates a token and displays it in the modal. Copy the token and use it to connect to your sandbox.

## [\#](https://www.daytona.io/docs/en/ssh-access/\#access-via-cli) Access via CLI

[Section titled “Access via CLI”](https://www.daytona.io/docs/en/ssh-access/#access-via-cli)

Daytona provides a CLI command to create an SSH access token for a sandbox:

```
daytona create
```

When you create a sandbox, Daytona displays the SSH command automatically in the output:

```
Sandbox '<sandboxId>' created successfully

Connect via SSH:         daytona ssh <sandboxId>

Open the Web Terminal:   https://22222-<sandboxId>.proxy.daytona.work
```

To SSH into an existing sandbox, use the following command:

```
daytona ssh <sandbox> --expires 60
```

## [\#](https://www.daytona.io/docs/en/ssh-access/\#access-via-token) Access via token

[Section titled “Access via token”](https://www.daytona.io/docs/en/ssh-access/#access-via-token)

You can create SSH access tokens programmatically. The token can then be used to connect manually:

- [Python](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1492)
- [TypeScript](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1493)
- [Ruby](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1494)
- [API](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1495)

```
from daytona import Daytona

daytona = Daytona()

sandbox = daytona.get("sandbox-abc123")

# Create SSH access token

ssh_access = sandbox.create_ssh_access(expires_in_minutes=60)

print(f"SSH Token: {ssh_access.token}")
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.get('sandbox-abc123')

// Create SSH access token

const sshAccess = await sandbox.createSshAccess(60)

console.log(`SSH Token: ${sshAccess.token}`)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.get('sandbox-abc123')

# Create SSH access token

ssh_access = sandbox.create_ssh_access(expires_in_minutes: 60)

puts "SSH Token: #{ssh_access.token}"
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ssh-access?expiresInMinutes=60' \

  --request POST \

  --header 'Authorization: Bearer <API_KEY>'
```

To connect to your sandbox, use the following command:

```
ssh <token>@ssh.app.daytona.io
```

## [\#](https://www.daytona.io/docs/en/ssh-access/\#connect-with-vs-code) Connect with VS Code

[Section titled “Connect with VS Code”](https://www.daytona.io/docs/en/ssh-access/#connect-with-vs-code)

You can connect VS Code directly to your sandbox using the Remote SSH extension.

1. Install the [Remote Explorer extension ↗](https://marketplace.visualstudio.com/items?itemName=ms-vscode.remote-explorer)
2. Add a new SSH connection
3. When prompted for the SSH connection URL, paste the SSH command from above

For more information, see the [VS Code Remote SSH documentation ↗](https://code.visualstudio.com/docs/remote/ssh).

## [\#](https://www.daytona.io/docs/en/ssh-access/\#connect-with-jetbrains-ides) Connect with JetBrains IDEs

[Section titled “Connect with JetBrains IDEs”](https://www.daytona.io/docs/en/ssh-access/#connect-with-jetbrains-ides)

JetBrains Gateway provides remote development support for connecting to your sandbox.

1. Download [JetBrains Gateway ↗](https://www.jetbrains.com/remote-development/gateway/)
2. Add a new connection
3. When prompted for the SSH connection URL, paste the SSH command from above
4. Select the IDE to install in your sandbox

## [\#](https://www.daytona.io/docs/en/ssh-access/\#token-management) Token management

[Section titled “Token management”](https://www.daytona.io/docs/en/ssh-access/#token-management)

### [\#](https://www.daytona.io/docs/en/ssh-access/\#expiration) Expiration

[Section titled “Expiration”](https://www.daytona.io/docs/en/ssh-access/#expiration)

SSH access tokens expire automatically after 60 minutes. You can specify a custom expiration time when creating the token using the `expires_in_minutes` parameter.

### [\#](https://www.daytona.io/docs/en/ssh-access/\#revoke-token) Revoke token

[Section titled “Revoke token”](https://www.daytona.io/docs/en/ssh-access/#revoke-token)

Revoke SSH access tokens before expiry:

- [Python](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1496)
- [TypeScript](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1497)
- [Ruby](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1498)
- [API](https://www.daytona.io/docs/en/ssh-access/#tab-panel-1499)

```
# Revoke specific SSH access token for the sandbox

sandbox.revoke_ssh_access(token="specific-token")
```

```
// Revoke specific SSH access token for the sandbox

await sandbox.revokeSshAccess('specific-token')
```

```
# Revoke specific SSH access token for the sandbox

sandbox.revoke_ssh_access(token: 'specific-token')
```

```
# Revoke specific SSH access token

curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ssh-access?token=specific-token' \

  --request DELETE \

  --header 'Authorization: Bearer <API_KEY>'

# Revoke all SSH access for the sandbox

curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ssh-access' \

  --request DELETE \

  --header 'Authorization: Bearer <API_KEY>'
```