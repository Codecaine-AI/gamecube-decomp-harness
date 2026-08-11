---
url: "https://www.daytona.io/docs/en/isolation.md"
title: undefined
---

# Isolation

Daytona sandboxes are isolated by default. Code running in a sandbox cannot read another sandbox's filesystem or memory, is not on a shared network with other sandboxes, and its credentials and API access are scoped to its own organization.

Isolation operates at three boundaries:

| **Boundary** | **What is separated**                                        | **Mechanisms**                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Processes, filesystem, memory, and devices of each sandbox   | • <u>[**Sandbox classes**](https://www.daytona.io/docs/en/sandboxes.md)</u> <br /> • <u>[**Reserved resources**](https://www.daytona.io/docs/en/sandboxes.md#resources)</u>                                                                      |
| Network      | Traffic entering (ingress) and leaving (egress) each sandbox | • <u>[**Network limits**](https://www.daytona.io/docs/en/network-limits.md)</u> <br /> • <u>[**Preview authentication**](https://www.daytona.io/docs/en/preview.md)</u> <br /> • <u>[**Link networks**](https://www.daytona.io/docs/en/sandboxes.md#linked-sandboxes)</u> |
| Organization | Access to sandboxes, data, and credentials                   | • <u>[**Organizations**](https://www.daytona.io/docs/en/organizations.md)</u> <br /> • <u>[**API key permissions**](https://www.daytona.io/docs/en/api-keys.md#permissions--scopes)</u> <br /> • <u>[**Secrets**](https://www.daytona.io/docs/en/secrets.md)</u>          |

## Runtime isolation

Runtime isolation separates what runs inside one sandbox from the runner it executes on and from every other sandbox. Each sandbox runs as an isolated instance with its own processes, network, filesystem mounts, and inter-process communication: see [architecture](https://www.daytona.io/docs/en/architecture.md#sandbox-runners) for details.

Resources are part of the runtime boundary. Each sandbox reserves its own **vCPU**, **memory**, and **disk**, enforced as hard limits, so one sandbox cannot consume the resources of another regardless of what its code does. Sandbox classes differ in the kind of boundary they provide:

| **Sandbox class**                          | **Runtime boundary**                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Container                                  | Isolated container with dedicated namespaces and enforced resource limits. Code runs as root inside the sandbox without affecting the runner.               |
| VM sandboxes <br /> (Linux VM and Windows) | Full virtual machine with its own kernel. The hardware virtualization boundary enables VM-only capabilities: <u>[**pause / resume**](https://www.daytona.io/docs/en/sandboxes.md#pause--resume-sandboxes)</u>, <u>[**fork**](https://www.daytona.io/docs/en/sandboxes.md#fork-sandboxes)</u>, and <u>[**hot snapshots**](https://www.daytona.io/docs/en/snapshots.md#create-snapshot-from-sandbox)</u>. |
| GPU                                        | Isolated container with exclusive GPU allocation: assigned GPU devices belong to one sandbox at a time and are never shared.                                 |

Resource limits are visible inside the sandbox through `cgroup` values. Tools such as `nproc` and `free` read host-level values and do not reflect the sandbox's own limits:

```bash
cat /sys/fs/cgroup/cpu.max      # "<quota> <period>" (cores = quota / period)
cat /sys/fs/cgroup/memory.max   # bytes
df -h /                         # disk
```

## Network isolation

Network isolation controls traffic in each direction separately. Outbound and inbound access are configured per sandbox; sandbox-to-sandbox networking is off unless sandboxes are explicitly linked.

| **Direction**       | **Default**                                          | **Controls**                                                                                                              |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Sandbox to internet | Open on Tier 3 and above; restricted on Tier 1 and 2 | <u>[**Network limits**](https://www.daytona.io/docs/en/network-limits.md)</u>: block all, CIDR allow list, or domain allow list                    |
| Internet to sandbox | Authenticated preview URLs and SSH access            | <u>[**Preview tokens and signed URLs**](https://www.daytona.io/docs/en/preview.md)</u> and <u>[**SSH tokens**](https://www.daytona.io/docs/en/ssh-access.md)</u>; the **`public`** flag opts previews out of authentication |
| Sandbox to sandbox  | No shared network                                    | <u>[**Linked sandboxes**](https://www.daytona.io/docs/en/sandboxes.md#linked-sandboxes)</u> join a parent and its children into a link network     |


**Outbound** traffic passes a per-sandbox firewall. [Tier-based restrictions](https://www.daytona.io/docs/en/network-limits.md#tier-based-network-restrictions) apply automatically, and each sandbox can be locked down further with one of three mutually exclusive settings: block all traffic, allow specific CIDR ranges, or allow specific domains. [Essential services](https://www.daytona.io/docs/en/network-limits.md#essential-services) such as package registries stay reachable on all tiers.


```python
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# Block all outbound traffic
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    network_block_all=True,
))

# Or allow specific domains only
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    domain_allow_list="example.com,*.daytona.io",
))

# Or allow specific CIDR ranges only
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    network_allow_list="208.80.154.232/32,192.168.1.0/24",
))
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// Block all outbound traffic
const blocked = await daytona.create({
  networkBlockAll: true,
})

// Or allow specific domains only
const domainRestricted = await daytona.create({
  domainAllowList: 'example.com,*.daytona.io',
})

// Or allow specific CIDR ranges only
const cidrRestricted = await daytona.create({
  networkAllowList: '208.80.154.232/32,192.168.1.0/24',
})
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new

# Block all outbound traffic
sandbox = daytona.create(
  Daytona::CreateSandboxFromSnapshotParams.new(
    network_block_all: true
  )
)

# Or allow specific domains only
sandbox = daytona.create(
  Daytona::CreateSandboxFromSnapshotParams.new(
    domain_allow_list: 'example.com,*.daytona.io'
  )
)

# Or allow specific CIDR ranges only
sandbox = daytona.create(
  Daytona::CreateSandboxFromSnapshotParams.new(
    network_allow_list: '208.80.154.232/32,192.168.1.0/24'
  )
)
```


```go
package main

import (
	"context"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
	client, _ := daytona.NewClient()
	ctx := context.Background()

	// Block all outbound traffic
	_, err := client.Create(ctx, types.SnapshotParams{
		SandboxBaseParams: types.SandboxBaseParams{
			NetworkBlockAll: true,
		},
	})
	if err != nil {
		// handle error
	}

	// Or allow specific domains only
	domainAllowList := "example.com,*.daytona.io"
	_, err = client.Create(ctx, types.SnapshotParams{
		SandboxBaseParams: types.SandboxBaseParams{
			DomainAllowList: &domainAllowList,
		},
	})
	if err != nil {
		// handle error
	}

	// Or allow specific CIDR ranges only
	networkAllowList := "208.80.154.232/32,192.168.1.0/24"
	_, err = client.Create(ctx, types.SnapshotParams{
		SandboxBaseParams: types.SandboxBaseParams{
			NetworkAllowList: &networkAllowList,
		},
	})
	if err != nil {
		// handle error
	}
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
    public static void main(String[] args) {
        try (Daytona daytona = new Daytona()) {
            // Block all outbound traffic
            CreateSandboxFromSnapshotParams blockedParams = new CreateSandboxFromSnapshotParams();
            blockedParams.setNetworkBlockAll(true);
            Sandbox blocked = daytona.create(blockedParams);

            // Or allow specific domains only
            CreateSandboxFromSnapshotParams domainParams = new CreateSandboxFromSnapshotParams();
            domainParams.setDomainAllowList("example.com,*.daytona.io");
            Sandbox domainRestricted = daytona.create(domainParams);
        }
    }
}
```


```bash
# Block all outbound traffic
daytona create --network-block-all

# Or allow specific CIDR ranges only
daytona create --network-allow-list '208.80.154.232/32,192.168.1.0/24'
```


```bash
# Block all outbound traffic
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "networkBlockAll": true
}'

# Or allow specific domains only
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "domainAllowList": "example.com,*.daytona.io"
}'

# Or allow specific CIDR ranges only
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "networkAllowList": "208.80.154.232/32,192.168.1.0/24"
}'
```



**Inbound** traffic reaches a sandbox through [preview URLs](https://www.daytona.io/docs/en/preview.md) or [SSH access](https://www.daytona.io/docs/en/ssh-access.md), and both paths are authenticated: preview URLs require a preview token or a signed URL unless the sandbox is explicitly made public, and SSH connections require an SSH access token.


```python
from daytona import Daytona

daytona = Daytona()
sandbox = daytona.create()

# Preview URLs require a token unless the sandbox is public
preview = sandbox.get_preview_link(3000)
print(preview.url)    # https://3000-{sandboxId}.{proxy-domain}
print(preview.token)  # sent via the x-daytona-preview-token header
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create()

// Preview URLs require a token unless the sandbox is public
const preview = await sandbox.getPreviewLink(3000)
console.log(preview.url)    // https://3000-{sandboxId}.{proxy-domain}
console.log(preview.token)  // sent via the x-daytona-preview-token header
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create

# Preview URLs require a token unless the sandbox is public
preview = sandbox.preview_url(3000)
puts preview.url    # https://3000-{sandboxId}.{proxy-domain}
puts preview.token  # sent via the x-daytona-preview-token header
```


```go
package main

import (
	"context"
	"fmt"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
	client, _ := daytona.NewClient()
	ctx := context.Background()

	sandbox, err := client.Create(ctx, types.SnapshotParams{})
	if err != nil {
		// handle error
	}

	// Preview URLs require a token unless the sandbox is public
	preview, err := sandbox.GetPreviewLink(ctx, 3000)
	if err != nil {
		// handle error
	}
	fmt.Println(preview.URL)   // https://3000-{sandboxId}.{proxy-domain}
	fmt.Println(preview.Token) // sent via the x-daytona-preview-token header
}
```


```bash
# Create a public sandbox (preview URLs skip authentication)
daytona create --public

# Or get a signed preview URL for an existing sandbox
daytona preview-url <sandbox-name> --port 3000 --expires 3600
```


```bash
# Get a standard preview URL and token
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/3000/preview-url' \
  --header 'Authorization: Bearer YOUR_API_KEY'

# Authenticate to the preview with the returned token
curl -H "x-daytona-preview-token: PREVIEW_TOKEN" \
  "https://3000-{sandboxId}.{proxy-domain}"
```



**Between sandboxes**, there is no shared network. [Linked sandboxes](https://www.daytona.io/docs/en/sandboxes.md#linked-sandboxes) are the deliberate exception: children are scheduled onto the same runner as their parent and joined into a link network where each sandbox is reachable by name, while remaining isolated from every sandbox outside the group.


```python
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

parent = daytona.create()

# Only linked sandboxes share a network; everything else is isolated
child = daytona.create(CreateSandboxFromSnapshotParams(
    linked_sandbox=parent.id,
    ephemeral=True,
))

# Sandboxes on the link network are reachable by name
response = child.process.exec(f"curl http://{parent.name}:3000/")
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const parent = await daytona.create()

// Only linked sandboxes share a network; everything else is isolated
const child = await daytona.create({
  linkedSandbox: parent.id,
  ephemeral: true,
})

// Sandboxes on the link network are reachable by name
const response = await child.process.executeCommand(
  `curl http://${parent.name}:3000/`
)
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new

parent = daytona.create

# Only linked sandboxes share a network; everything else is isolated
child = daytona.create(
  Daytona::CreateSandboxFromSnapshotParams.new(
    linked_sandbox: parent.id,
    ephemeral: true
  )
)

# The link network registers each sandbox under its name and ID as DNS aliases.
# The Ruby SDK does not expose the sandbox name, so address the parent by ID.
response = child.process.exec(command: "curl http://#{parent.id}:3000/")
```


```go
package main

import (
	"context"
	"fmt"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
	client, _ := daytona.NewClient()
	ctx := context.Background()

	parent, err := client.Create(ctx, types.SnapshotParams{})
	if err != nil {
		// handle error
	}

	// Only linked sandboxes share a network; everything else is isolated
	child, err := client.Create(ctx, types.SnapshotParams{
		SandboxBaseParams: types.SandboxBaseParams{
			LinkedSandbox: parent.ID,
			Ephemeral:     true,
		},
	})
	if err != nil {
		// handle error
	}

	// Sandboxes on the link network are reachable by name
	response, err := child.Process.ExecuteCommand(
		ctx, fmt.Sprintf("curl http://%s:3000/", parent.Name),
	)
	if err != nil {
		// handle error
	}
	fmt.Println(response.Result)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;
import io.daytona.sdk.model.ExecuteResponse;

public class App {
    public static void main(String[] args) {
        try (Daytona daytona = new Daytona()) {
            Sandbox parent = daytona.create();

            // Only linked sandboxes share a network; everything else is isolated
            CreateSandboxFromSnapshotParams childParams = new CreateSandboxFromSnapshotParams();
            childParams.setLinkedSandbox(parent.getId());
            childParams.setAutoDeleteInterval(0); // linked sandboxes must be ephemeral
            Sandbox child = daytona.create(childParams);

            // Sandboxes on the link network are reachable by name
            ExecuteResponse response = child.getProcess()
                .executeCommand("curl http://" + parent.getName() + ":3000/");
        }
    }
}
```


```bash
# Create parent sandbox
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{}'

# Create linked child sandbox (replace PARENT_SANDBOX_ID)
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "linkedSandbox": "PARENT_SANDBOX_ID",
  "autoDeleteInterval": 0
}'
```



## Organization isolation

Organization isolation separates tenants. Every sandbox, snapshot, and volume belongs to exactly one [organization](https://www.daytona.io/docs/en/organizations.md), and access control is enforced at that boundary: an API key from one organization cannot see or operate on another organization's resources.

Within an organization, access narrows further to the following mechanisms:


**[API key permissions](https://www.daytona.io/docs/en/api-keys.md#permissions--scopes)** scope what a key can do. A key issued with only `write:sandboxes` cannot delete snapshots or read volumes.

**[Managed API keys](https://www.daytona.io/docs/en/api-keys.md#managed-api-keys)** issue scoped child keys at runtime, so a multi-tenant application can hand each tenant a key limited to its own operations.

```bash
# A manager key issues a child key scoped to one tenant's operations;
# child key permissions must be a subset of the manager key's permissions
curl 'https://app.daytona.io/api/api-keys' \
  --request POST \
  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_MANAGER_API_KEY' \
  --data '{
  "name": "tenant-a-key",
  "permissions": ["write:sandboxes", "delete:sandboxes"]
}'
```


**[Secrets](https://www.daytona.io/docs/en/secrets.md)** keep credentials out of sandboxes entirely. A sandbox holds an opaque placeholder; an outbound proxy substitutes the real value only for requests to the secret's allowed hosts. Code in the sandbox can use the credential but cannot read it or send it anywhere else.

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# The sandbox receives a placeholder, never the plaintext value
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    secrets={
        "MY_API_KEY": "my-secret",
    },
))

# Code uses the credential without being able to read it
sandbox.process.exec(
    'curl -H "Authorization: Bearer $MY_API_KEY" https://api.example.com/v1/data'
)
```


**[Volumes](https://www.daytona.io/docs/en/volumes.md)** scope shared data with a `subpath`, so each sandbox mounts only its tenant's slice of a shared volume.

```python
from daytona import CreateSandboxFromSnapshotParams, Daytona, VolumeMount

daytona = Daytona()
volume = daytona.volume.get("tenant-data", create=True)

# Each sandbox mounts only its tenant's slice of the shared volume
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    volumes=[VolumeMount(
        volume_id=volume.id,
        mount_path="/home/daytona/data",
        subpath="tenants/tenant-a",
    )],
))
```