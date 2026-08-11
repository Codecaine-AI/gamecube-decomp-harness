---
url: "https://www.daytona.io/docs/en/network-limits/"
title: "Network Limits (Firewall) | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/network-limits/#_top)

# Network Limits (Firewall)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/network-limits.md)Open

Network limits control outbound internet access from sandboxes. Each sandbox runs behind a firewall that restricts which external IP addresses and domains it can reach, preventing untrusted code from exfiltrating data or contacting arbitrary hosts.

Default network policies are applied automatically based on your organization’s tier. You can also configure access per sandbox using three parameters:

- **`networkAllowList`** for IPv4 CIDR ranges
- **`domainAllowList`** for domains and wildcard domains
- **`networkBlockAll`** to block all outbound traffic

Set these parameters when [creating a sandbox](https://www.daytona.io/docs/en/network-limits/#create-sandboxes-with-network-restrictions) or [update them while the sandbox is running](https://www.daytona.io/docs/en/network-limits/#update-network-settings-while-a-sandbox-is-running).

## [\#](https://www.daytona.io/docs/en/network-limits/\#tier-based-network-restrictions) Tier-based network restrictions

[Section titled “Tier-based network restrictions”](https://www.daytona.io/docs/en/network-limits/#tier-based-network-restrictions)

Network limits are automatically applied to sandboxes based on your organization’s billing tier. This provides secure and controlled internet access for development environments:

- **Tier 1 & Tier 2**: Network access is restricted and cannot be overridden at the sandbox level. Organization-level network restrictions take precedence over sandbox-level settings. Even with [`networkAllowList`](https://www.daytona.io/docs/en/network-limits/#create-sandboxes-with-network-restrictions) or [`domainAllowList`](https://www.daytona.io/docs/en/network-limits/#create-sandboxes-with-network-restrictions) specified when creating a sandbox, the organization’s network restrictions still apply
- **Tier 3 & Tier 4**: Full internet access is available by default, with the ability to configure custom network settings

[Essential services](https://www.daytona.io/docs/en/network-limits/#essential-services) are available on all tiers and include services essential for development.

## [\#](https://www.daytona.io/docs/en/network-limits/\#create-sandboxes-with-network-restrictions) Create sandboxes with network restrictions

[Section titled “Create sandboxes with network restrictions”](https://www.daytona.io/docs/en/network-limits/#create-sandboxes-with-network-restrictions)

Create a sandbox with network restrictions to control outbound internet access.

The options are mutually exclusive. Set at most one non-empty value. Sending a conflicting combination returns a `400` error. Empty-string allow lists count as unset and never conflict.

- [Python](https://www.daytona.io/docs/en/network-limits/#tab-panel-776)
- [TypeScript](https://www.daytona.io/docs/en/network-limits/#tab-panel-777)
- [Ruby](https://www.daytona.io/docs/en/network-limits/#tab-panel-778)
- [Go](https://www.daytona.io/docs/en/network-limits/#tab-panel-779)
- [Java](https://www.daytona.io/docs/en/network-limits/#tab-panel-780)
- [API](https://www.daytona.io/docs/en/network-limits/#tab-panel-781)
- [CLI](https://www.daytona.io/docs/en/network-limits/#tab-panel-782)

```
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# Allow access to specific IP addresses (Wikipedia, X/Twitter, private network)

sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    network_allow_list='208.80.154.232/32,199.16.156.103/32,192.168.1.0/24'

))

# Allow access to specific domains

sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    domain_allow_list='example.com,*.daytona.io'

))

# Or block all network access

sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    network_block_all=True

))
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// Allow access to specific IP addresses (Wikipedia, X/Twitter, private network)

const sandboxWithCidrAllowList = await daytona.create({

  networkAllowList: '208.80.154.232/32,199.16.156.103/32,192.168.1.0/24'

})

// Allow access to specific domains

const sandboxWithDomainAllowList = await daytona.create({

  domainAllowList: 'example.com,*.daytona.io'

})

// Or block all network access

const blockedSandbox = await daytona.create({

  networkBlockAll: true

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# Allow access to specific IP addresses (Wikipedia, X/Twitter, private network)

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    network_allow_list: '208.80.154.232/32,199.16.156.103/32,192.168.1.0/24'

  )

)

# Allow access to specific domains

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    domain_allow_list: 'example.com,*.daytona.io'

  )

)

# Or block all network access

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    network_block_all: true

  )

)
```

```
package main

import (

  "context"

  "log"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, err := daytona.NewClient()

  if err != nil {

    log.Fatal(err)

  }

  ctx := context.Background()

  // Allow access to specific IP addresses (Wikipedia, X/Twitter, private network)

  allowList := "208.80.154.232/32,199.16.156.103/32,192.168.1.0/24"

  _, err = client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{

      NetworkAllowList: &allowList,

    },

  })

  if err != nil {

    log.Fatal(err)

  }

  // Allow access to specific domains

  domainAllowList := "example.com,*.daytona.io"

  _, err = client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{

      DomainAllowList: &domainAllowList,

    },

  })

  if err != nil {

    log.Fatal(err)

  }

  // Or block all network access

  _, err = client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{

      NetworkBlockAll: true,

    },

  })

  if err != nil {

    log.Fatal(err)

  }

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // Allow access to specific domains

            CreateSandboxFromSnapshotParams domainParams = new CreateSandboxFromSnapshotParams();

            domainParams.setDomainAllowList("example.com,*.daytona.io");

            Sandbox domainRestrictedSandbox = daytona.create(domainParams);

            // Or block all network access

            CreateSandboxFromSnapshotParams blockedParams = new CreateSandboxFromSnapshotParams();

            blockedParams.setNetworkBlockAll(true);

            Sandbox blockedSandbox = daytona.create(blockedParams);

        }

    }

}
```

```
# Allow access to specific IP addresses (Wikipedia, X/Twitter, private network)

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

    "networkAllowList": "208.80.154.232/32,199.16.156.103/32,192.168.1.0/24"

  }'

# Allow access to specific domains

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

    "domainAllowList": "example.com,*.daytona.io"

  }'

# Or block all network access

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

    "networkBlockAll": true

  }'
```

```
# Allow access to specific IP addresses (Wikipedia, X/Twitter, private network)

daytona create --network-allow-list '208.80.154.232/32,199.16.156.103/32,192.168.1.0/24'

# Or block all network access

daytona create --network-block-all
```

## [\#](https://www.daytona.io/docs/en/network-limits/\#update-network-settings-while-a-sandbox-is-running) Update network settings while a sandbox is running

[Section titled “Update network settings while a sandbox is running”](https://www.daytona.io/docs/en/network-limits/#update-network-settings-while-a-sandbox-is-running)

Update network settings for running sandboxes.

This operation requires the `WRITE_SANDBOXES` permission. Organizations on [Tier 3 and Tier 4](https://www.daytona.io/docs/en/network-limits/#tier-based-network-restrictions) can change outbound firewall policy on a running sandbox. The API applies the new rules and persists them on the sandbox. The sandbox keeps running; stop or start are not required.

Organizations on Tier 1 or Tier 2 cannot override network policy at the sandbox level, and the API returns an error in that case.

- Sending `networkAllowList` as an empty string clears a stored CIDR allow list
- Sending `domainAllowList` as an empty string clears a stored domain allow list
- Sending `networkBlockAll: true` blocks all outbound traffic and clears both the stored CIDR and domain allow lists
- Sending only `networkBlockAll: false` removes the block-all rule and clears both the stored CIDR and domain allow lists

- [Python](https://www.daytona.io/docs/en/network-limits/#tab-panel-783)
- [TypeScript](https://www.daytona.io/docs/en/network-limits/#tab-panel-784)
- [Ruby](https://www.daytona.io/docs/en/network-limits/#tab-panel-785)
- [Go](https://www.daytona.io/docs/en/network-limits/#tab-panel-786)
- [Java](https://www.daytona.io/docs/en/network-limits/#tab-panel-787)
- [API](https://www.daytona.io/docs/en/network-limits/#tab-panel-788)

```
# Block all outbound traffic (clears the CIDR allow list)

sandbox.update_network_settings(network_block_all=True)

# Remove the block-all rule and clear the CIDR allow list

sandbox.update_network_settings(network_block_all=False)

# Apply or replace a CIDR allow list (implies not blocking all)

sandbox.update_network_settings(

    network_allow_list='208.80.154.232/32,192.168.1.0/24'

)

# Apply or replace a domain allow list

sandbox.update_network_settings(

    domain_allow_list='example.com,*.daytona.io'

)

# Clear a stored CIDR allow list (empty string). Outbound traffic still follows `network_block_all`.

sandbox.update_network_settings(network_allow_list='')

# Clear a stored domain allow list

sandbox.update_network_settings(domain_allow_list='')
```

```
// Block all outbound traffic (clears the CIDR allow list)

await sandbox.updateNetworkSettings({ networkBlockAll: true })

// Remove the block-all rule and clear the CIDR allow list

await sandbox.updateNetworkSettings({ networkBlockAll: false })

// Apply or replace a CIDR allow list (implies not blocking all)

await sandbox.updateNetworkSettings({

  networkAllowList: '208.80.154.232/32,192.168.1.0/24',

})

// Apply or replace a domain allow list

await sandbox.updateNetworkSettings({

  domainAllowList: 'example.com,*.daytona.io',

})

// Clear a stored CIDR allow list (empty string). Outbound traffic still follows `networkBlockAll`.

await sandbox.updateNetworkSettings({ networkAllowList: '' })

// Clear a stored domain allow list

await sandbox.updateNetworkSettings({ domainAllowList: '' })
```

```
# Block all outbound traffic (clears the CIDR allow list)

sandbox.update_network_settings(network_block_all: true)

# Remove the block-all rule and clear the CIDR allow list

sandbox.update_network_settings(network_block_all: false)

# Apply or replace a CIDR allow list (implies not blocking all)

sandbox.update_network_settings(

  network_allow_list: '208.80.154.232/32,192.168.1.0/24'

)

# Apply or replace a domain allow list

sandbox.update_network_settings(

  domain_allow_list: 'example.com,*.daytona.io'

)

# Clear the CIDR allow list (empty string)

sandbox.update_network_settings(network_allow_list: '')

# Clear the domain allow list

sandbox.update_network_settings(domain_allow_list: '')
```

```
import apiclient "github.com/daytona/clients/api-client-go"

settings := apiclient.NewUpdateSandboxNetworkSettings()

settings.SetNetworkBlockAll(true)

if err := sandbox.UpdateNetworkSettings(ctx, *settings); err != nil {

  log.Fatal(err)

}

restore := apiclient.NewUpdateSandboxNetworkSettings()

restore.SetNetworkBlockAll(false)

if err := sandbox.UpdateNetworkSettings(ctx, *restore); err != nil {

  log.Fatal(err)

}

allow := apiclient.NewUpdateSandboxNetworkSettings()

allow.SetNetworkAllowList("208.80.154.232/32,192.168.1.0/24")

if err := sandbox.UpdateNetworkSettings(ctx, *allow); err != nil {

  log.Fatal(err)

}

domainAllow := apiclient.NewUpdateSandboxNetworkSettings()

domainAllow.SetDomainAllowList("example.com,*.daytona.io")

if err := sandbox.UpdateNetworkSettings(ctx, *domainAllow); err != nil {

  log.Fatal(err)

}

clearDomainAllow := apiclient.NewUpdateSandboxNetworkSettings()

clearDomainAllow.SetDomainAllowList("")

if err := sandbox.UpdateNetworkSettings(ctx, *clearDomainAllow); err != nil {

  log.Fatal(err)

}
```

```
import io.daytona.api.client.model.UpdateSandboxNetworkSettings;

// Block all outbound traffic (clears the CIDR allow list)

sandbox.updateNetworkSettings(new UpdateSandboxNetworkSettings().networkBlockAll(true));

// Remove the block-all rule and clear the CIDR allow list

sandbox.updateNetworkSettings(new UpdateSandboxNetworkSettings().networkBlockAll(false));

// Apply or replace a CIDR allow list

sandbox.updateNetworkSettings(

    new UpdateSandboxNetworkSettings().networkAllowList("208.80.154.232/32,192.168.1.0/24"));

// Apply or replace a domain allow list

sandbox.updateNetworkSettings(

    new UpdateSandboxNetworkSettings().domainAllowList("example.com,*.daytona.io"));

// Clear a stored domain allow list

sandbox.updateNetworkSettings(new UpdateSandboxNetworkSettings().domainAllowList(""));
```

```
curl 'https://app.daytona.io/api/sandbox/SANDBOX_ID_OR_NAME/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"networkBlockAll": true}'

# Remove the block-all rule and clear the CIDR allow list

curl 'https://app.daytona.io/api/sandbox/SANDBOX_ID_OR_NAME/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"networkBlockAll": false}'

# Apply or replace a domain allow list

curl 'https://app.daytona.io/api/sandbox/SANDBOX_ID_OR_NAME/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"domainAllowList": "example.com,*.daytona.io"}'

# Clear a stored domain allow list

curl 'https://app.daytona.io/api/sandbox/SANDBOX_ID_OR_NAME/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"domainAllowList": ""}'
```

## [\#](https://www.daytona.io/docs/en/network-limits/\#network-allow-list-format) Network allow list format

[Section titled “Network allow list format”](https://www.daytona.io/docs/en/network-limits/#network-allow-list-format)

The network allow list is a comma-separated list of IPv4 CIDR blocks.

- **IPv4 only**: hostnames, domains, and IPv6 are not supported
- **CIDR required**: every entry must include a `/` prefix length integer in the range `0` to `32` (inclusive), for example: `/32`
- **CIDR format**: use standard CIDR notation (`A.B.C.D/N`). Do not include extra `/` segments
- **Max 10 entries**: the list cannot contain more than 10 comma-separated items
- **Whitespace is ignored**: entries are trimmed, so spaces around commas are ok

Examples:

- **Single IP**: `208.80.154.232/32` (Wikipedia)
- **Subnet**: `192.168.1.0/24` (Private network)
- **Multiple networks**: `208.80.154.232/32,199.16.156.103/32,10.0.0.0/8`

## [\#](https://www.daytona.io/docs/en/network-limits/\#domain-allow-list-format) Domain allow list format

[Section titled “Domain allow list format”](https://www.daytona.io/docs/en/network-limits/#domain-allow-list-format)

The domain allow list is a comma-separated list of DNS domains. When a domain allow list is set, outbound traffic is limited to the listed domains and other external domains are blocked.

- **Domains only**: use hostnames such as `example.com` or `api.openai.com`. Do not include protocols, paths, ports, or query strings
- **Wildcards supported**: prefix a domain with `*.` to allow the base domain and its subdomains, for example `*.daytona.io`
- **Max 20 entries**: the list cannot contain more than 20 comma-separated items
- **Whitespace is ignored**: entries are trimmed, so spaces around commas are ok
- **Clear on update**: send `domainAllowList` as an empty string when updating network settings to clear a stored domain allow list

Examples:

- **Single domain**: `example.com`
- **Wildcard domain**: `*.daytona.io`
- **Multiple domains**: `example.com,*.daytona.io,api.openai.com`

## [\#](https://www.daytona.io/docs/en/network-limits/\#test-network-access) Test network access

[Section titled “Test network access”](https://www.daytona.io/docs/en/network-limits/#test-network-access)

To test network connectivity from your sandbox:

```
# Test HTTP connectivity to allowed addresses

curl -I https://208.80.154.232

# Test HTTP connectivity to allowed domains

curl -I https://example.com

# Test package manager access (allowed on all tiers)

apt update  # For Ubuntu/Debian

npm ping    # For Node.js

pip install --dry-run requests  # For Python
```

## [\#](https://www.daytona.io/docs/en/network-limits/\#security-benefits) Security benefits

[Section titled “Security benefits”](https://www.daytona.io/docs/en/network-limits/#security-benefits)

Network limits provide several security advantages:

- **Prevents data exfiltration** from sandboxes
- **Reduces attack surface** by limiting external connections
- **Complies with security policies** for development environments
- **Enables fine-grained control** over network access

## [\#](https://www.daytona.io/docs/en/network-limits/\#essential-services) Essential services

[Section titled “Essential services”](https://www.daytona.io/docs/en/network-limits/#essential-services)

Essential services are available on all tiers and include services essential for development.

### [\#](https://www.daytona.io/docs/en/network-limits/\#npm-registry-and-package-managers) NPM registry and package managers

[Section titled “NPM registry and package managers”](https://www.daytona.io/docs/en/network-limits/#npm-registry-and-package-managers)

| **Service** | **Domains** |
| --- | --- |
| NPM Registry | **`registry.npmjs.org`**, **`registry.npmjs.com`**, **`nodejs.org`**, **`nodesource.com`**, **`deb.nodesource.com`**, **`npm.pkg.github.com`** |
| Yarn Packages | **`yarnpkg.com`**, **`*.yarnpkg.com`**, **`yarn.npmjs.org`**, **`yarnpkg.netlify.com`** |
| Bun | **`bun.sh`**, **`*.bun.sh`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#nix-package-manager) Nix package manager

[Section titled “Nix package manager”](https://www.daytona.io/docs/en/network-limits/#nix-package-manager)

| **Service** | **Domains** |
| --- | --- |
| Nix | **`cache.nixos.org`**, **`channels.nixos.org`**, **`releases.nixos.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#git-hosting-and-version-control) Git hosting and version control

[Section titled “Git hosting and version control”](https://www.daytona.io/docs/en/network-limits/#git-hosting-and-version-control)

| **Service** | **Domains** |
| --- | --- |
| GitHub | **`github.com`**, **`*.github.com`**, **`*.githubusercontent.com`**, **`gh.io`**, **`ghcr.io`** |
| GitLab | **`gitlab.com`**, **`*.gitlab.com`** |
| Bitbucket | **`bitbucket.org`** |
| Code Storage | **`code.storage`**, **`*.code.storage`** |
| Azure DevOps | **`dev.azure.com`**, **`*.dev.azure.com`**, **`login.microsoftonline.com`**, **`visualstudio.com`**, **`*.visualstudio.com`**, **`ssh.dev.azure.com`**, **`vs-ssh.visualstudio.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#python-package-managers) Python package managers

[Section titled “Python package managers”](https://www.daytona.io/docs/en/network-limits/#python-package-managers)

| **Service** | **Domains** |
| --- | --- |
| PyPI | **`pypi.org`**, **`pypi.python.org`**, **`files.pythonhosted.org`**, **`bootstrap.pypa.io`**, **`astral.sh`**, **`*.astral.sh`** |
| Conda | **`repo.anaconda.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#rust-package-manager-and-toolchain) Rust package manager and toolchain

[Section titled “Rust package manager and toolchain”](https://www.daytona.io/docs/en/network-limits/#rust-package-manager-and-toolchain)

| **Service** | **Domains** |
| --- | --- |
| Rust | **`crates.io`**, **`static.crates.io`**, **`index.crates.io`**, **`static.rust-lang.org`**, **`rustup.rs`**, **`sh.rustup.rs`**, **`doc.rust-lang.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#go-module-proxy-and-toolchain) Go module proxy and toolchain

[Section titled “Go module proxy and toolchain”](https://www.daytona.io/docs/en/network-limits/#go-module-proxy-and-toolchain)

| **Service** | **Domains** |
| --- | --- |
| Go | **`proxy.golang.org`**, **`sum.golang.org`**, **`index.golang.org`**, **`go.dev`**, **`golang.org`**, **`*.golang.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#cc-build-tools) C/C++ build tools

[Section titled “C/C++ build tools”](https://www.daytona.io/docs/en/network-limits/#cc-build-tools)

| **Service** | **Domains** |
| --- | --- |
| CMake | **`cmake.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#composer-packages) Composer packages

[Section titled “Composer packages”](https://www.daytona.io/docs/en/network-limits/#composer-packages)

| **Service** | **Domains** |
| --- | --- |
| Composer | **`packagist.org`**, **`*.packagist.org`**, **`packagist.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#nuget-packages) NuGet packages

[Section titled “NuGet packages”](https://www.daytona.io/docs/en/network-limits/#nuget-packages)

| **Service** | **Domains** |
| --- | --- |
| NuGet | **`nuget.org`**, **`*.nuget.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#elixirerlang-packages) Elixir/Erlang packages

[Section titled “Elixir/Erlang packages”](https://www.daytona.io/docs/en/network-limits/#elixirerlang-packages)

| **Service** | **Domains** |
| --- | --- |
| Hex | **`hex.pm`**, **`*.hex.pm`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#ruby-packages) Ruby packages

[Section titled “Ruby packages”](https://www.daytona.io/docs/en/network-limits/#ruby-packages)

| **Service** | **Domains** |
| --- | --- |
| RubyGems | **`rubygems.org`**, **`*.rubygems.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#ubuntudebian-package-repositories) Ubuntu/Debian package repositories

[Section titled “Ubuntu/Debian package repositories”](https://www.daytona.io/docs/en/network-limits/#ubuntudebian-package-repositories)

| **Service** | **Domains** |
| --- | --- |
| Ubuntu Repos | **`*.ubuntu.com`** |
| Debian Repos | **`*.debian.org`**, **`cdn-fastly.deb.debian.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#cdn-and-content-delivery) CDN and content delivery

[Section titled “CDN and content delivery”](https://www.daytona.io/docs/en/network-limits/#cdn-and-content-delivery)

| **Service** | **Domains** |
| --- | --- |
| CDN Services | **`fastly.com`**, **`cloudflare.com`**, **`gateway.ai.cloudflare.com`**, **`*.workers.dev`**, **`r2.cloudflarestorage.com`**, **`*.r2.cloudflarestorage.com`** |
| JavaScript CDNs | **`unpkg.com`**, **`jsdelivr.net`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#aiml-services) AI/ML services

[Section titled “AI/ML services”](https://www.daytona.io/docs/en/network-limits/#aiml-services)

| **Service** | **Domains** |
| --- | --- |
| Anthropic | **`*.anthropic.com`**, **`claude.ai`**, **`*.claude.ai`**, **`platform.claude.com`** |
| OpenAI | **`openai.com`**, **`*.openai.com`**, **`chatgpt.com`**, **`*.chatgpt.com`** |
| Google AI | **`generativelanguage.googleapis.com`**, **`gemini.google.com`**, **`aistudio.google.com`**, **`ai.google.dev`**, **`models.dev`** |
| Perplexity | **`api.perplexity.ai`** |
| DeepSeek | **`api.deepseek.com`** |
| Groq | **`api.groq.com`** |
| Expo | **`api.expo.dev`** |
| OpenRouter | **`openrouter.ai`** |
| Qwen | **`chat.qwen.ai`**, **`dashscope.aliyuncs.com`**, **`dashscope-intl.aliyuncs.com`** |
| Cursor | **`cursor.com`**, **`*.cursor.com`**, **`*.cursor.sh`** |
| OpenCode | **`opencode.ai`**, **`*.opencode.ai`** |
| Aider | **`aider.chat`** |
| Hugging Face | **`huggingface.co`**, **`*.huggingface.co`**, **`hf.co`**, **`*.hf.co`**, **`*.xethub.hf.co`**, **`*.cdn.hf.co`**, **`*.aws.cdn.hf.co`**, **`*.gcp.cdn.hf.co`** |
| Other AI Services | **`api.letta.com`**, **`api.fireworks.ai`**, **`api.tensorx.ai`**, **`open.bigmodel.cn`**, **`*.z.ai`**, **`*.moonshot.ai`**, **`*.minimax.io`**, **`*.kimi.com`**, **`ai-gateway.vercel.sh`**, **`api.elevenlabs.io`**, **`api.featherless.ai`**, **`ampcode.com`**, **`*.ampcode.com`**, **`*.openai.azure.com`**, **`*.services.ai.azure.com`**, **`trynia.ai`**, **`*.trynia.ai`**, **`api.x.ai`**, **`copass.id`**, **`*.copass.id`**, **`zenmux.ai`**, **`aihubmix.com`**, **`api.aihubmix.com`**, **`*.devin.ai`**, **`*.codeium.com`**, **`you.com`**, **`*.you.com`**, **`ydc-index-.io`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#docker-registries-and-container-services) Docker registries and container services

[Section titled “Docker registries and container services”](https://www.daytona.io/docs/en/network-limits/#docker-registries-and-container-services)

| **Service** | **Domains** |
| --- | --- |
| Docker Registries | **`docker.io`**, **`*.docker.io`**, **`*.docker.com`** |
| Microsoft Container Registry | **`mcr.microsoft.com`** |
| Kubernetes Registry | **`registry.k8s.io`** |
| Google Container Registry | **`gcr.io`**, **`*.gcr.io`**, **`*.pkg.dev`**, **`registry.cloud.google.com`** |
| Quay | **`quay.io`**, **`quay-registry.s3.amazonaws.com`** |
| AWS ECR | **`public.ecr.aws`**, **`*.ecr.aws`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#maven-repositories) Maven repositories

[Section titled “Maven repositories”](https://www.daytona.io/docs/en/network-limits/#maven-repositories)

| **Service** | **Domains** |
| --- | --- |
| Maven Repos | **`repo1.maven.org`**, **`repo.maven.apache.org`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#google-fonts) Google Fonts

[Section titled “Google Fonts”](https://www.daytona.io/docs/en/network-limits/#google-fonts)

| **Service** | **Domains** |
| --- | --- |
| Google Fonts | **`fonts.googleapis.com`**, **`fonts.gstatic.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#aws-endpoints) AWS endpoints

[Section titled “AWS endpoints”](https://www.daytona.io/docs/en/network-limits/#aws-endpoints)

| **Region** | **Domains** |
| --- | --- |
| US East | **`*.us-east-1.amazonaws.com`**, **`*.us-east-2.amazonaws.com`** |
| US West | **`*.us-west-1.amazonaws.com`**, **`*.us-west-2.amazonaws.com`** |
| EU | **`*.eu-central-1.amazonaws.com`**, **`*.eu-central-2.amazonaws.com`**, **`*.eu-north-1.amazonaws.com`**, **`*.eu-south-1.amazonaws.com`**, **`*.eu-south-2.amazonaws.com`**, **`*.eu-west-1.amazonaws.com`**, **`*.eu-west-2.amazonaws.com`**, **`*.eu-west-3.amazonaws.com`** |
| Asia Pacific | **`*.ap-south-1.amazonaws.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#google-cloud) Google Cloud

[Section titled “Google Cloud”](https://www.daytona.io/docs/en/network-limits/#google-cloud)

| **Service** | **Domains** |
| --- | --- |
| Google Cloud Platform | **`accounts.google.com`**, **`*.googleapis.com`**, **`*.storage.googleapis.com`**, **`*.gstatic.com`** |
| Google Downloads | **`dl.google.com`** |
| Google Package Registry | **`packages.cloud.google.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#cloud-storage) Cloud storage

[Section titled “Cloud storage”](https://www.daytona.io/docs/en/network-limits/#cloud-storage)

| **Service** | **Domains** |
| --- | --- |
| Azure Blob Storage | **`*.blob.core.windows.net`** |
| Box | **`api.box.com`**, **`app.box.com`**, **`*.app.box.com`**, **`upload.box.com`**, **`account.box.com`**, **`*.ent.box.com`**, **`*.boxcloud.com`** |
| Mountpoint for S3 | **`s3.amazonaws.com`**, **`*.s3.amazonaws.com`**, **`*.s3.us-east-1.amazonaws.com`**, **`*.s3.us-east-2.amazonaws.com`**, **`*.s3.us-west-1.amazonaws.com`**, **`*.s3.us-west-2.amazonaws.com`**, **`*.s3.eu-central-1.amazonaws.com`**, **`*.s3.eu-central-2.amazonaws.com`**, **`*.s3.eu-north-1.amazonaws.com`**, **`*.s3.eu-south-1.amazonaws.com`**, **`*.s3.eu-south-2.amazonaws.com`**, **`*.s3.eu-west-1.amazonaws.com`**, **`*.s3.eu-west-2.amazonaws.com`**, **`*.s3.eu-west-3.amazonaws.com`**, **`*.s3.ap-south-1.amazonaws.com`** |
| Tigris | **`t3.storage.dev`**, **`*.t3.storage.dev`** |
| Archil | **`archil.com`**, **`*.archil.com`** |
| rclone | **`rclone.org`**, **`downloads.rclone.org`** |
| Microsoft Packages | **`packages.microsoft.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#daytona) Daytona

[Section titled “Daytona”](https://www.daytona.io/docs/en/network-limits/#daytona)

| **Service** | **Domains** |
| --- | --- |
| Daytona | **`app.daytona.io`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#developer-tools-and-services) Developer tools and services

[Section titled “Developer tools and services”](https://www.daytona.io/docs/en/network-limits/#developer-tools-and-services)

| **Service** | **Domains** |
| --- | --- |
| Convex | **`convex.dev`**, **`*.convex.dev`**, **`*.convex.cloud`**, **`*.convex.site`** |
| Heroku | **`herokuapp.com`**, **`*.herokuapp.com`** |
| Vercel | **`vercel.com`**, **`*.vercel.com`**, **`*.vercel.app`** |
| Supabase | **`supabase.com`**, **`*.supabase.com`**, **`supabase.co`**, **`*.supabase.co`**, **`*.storage.supabase.co`** |
| Clerk | **`clerk.com`**, **`*.clerk.com`**, **`clerk.dev`**, **`*.clerk.dev`**, **`accounts.dev`**, **`*.accounts.dev`**, **`clerk.accounts.dev`**, **`*.clerk.accounts.dev`** |
| WorkOS | **`workos.com`**, **`*.workos.com`**, **`authkit.app`**, **`*.authkit.app`** |
| Inngest | **`inngest.com`**, **`*.inngest.com`** |
| PostHog | **`posthog.com`**, **`*.posthog.com`** |
| Sentry | **`sentry.io`**, **`*.sentry.io`**, **`sentry-cdn.com`**, **`*.sentry-cdn.com`** |
| Linear | **`linear.app`**, **`*.linear.app`** |
| Figma | **`figma.com`**, **`*.figma.com`**, **`*.figmafiles.com`** |
| ClickUp | **`clickup.com`**, **`*.clickup.com`** |
| Atlassian | **`acli.atlassian.com`** |
| Railway | **`railway.app`**, **`*.railway.app`**, **`railway.com`**, **`*.railway.com`** |
| Autumn | **`api.useautumn.com`** |
| Playwright | **`playwright.dev`**, **`cdn.playwright.dev`** |
| Doppler | **`doppler.com`**, **`*.doppler.com`** |
| Auth0 | **`auth0.com`**, **`*.auth0.com`** |
| Sanity | **`*.sanity.io`**, **`*.sanity.work`**, **`sanity.io`**, **`sanity.work`** |
| Shopify | **`shopify.com`**, **`*.shopify.com`**, **`*.myshopify.com`**, **`*.shopify.dev`**, **`*.shopifycdn.com`** |
| Mesa | **`mesa.dev`**, **`*.mesa.dev`** |
| Buildkite | **`buildkite.com`**, **`*.buildkite.com`** |
| Shortcut | **`api.app.shortcut.com`**, **`app.shortcut.com`** |
| USAspending | **`api.usaspending.gov`**, **`files.usaspending.gov`** |
| Logo Dev | **`img.logo.dev`**, **`logo.dev`** |
| Kiro | **`*.kiro.dev`**, **`*.us-east-1.kiro.dev`**, **`prod.download.cli.kiro.dev`** |
| Browserbase | **`browserbase.com`**, **`*.browserbase.com`**, **`connect.usw2.browserbase.com`**, **`connect.use1.browserbase.com`**, **`connect.euc1.browserbase.com`**, **`connect.apse1.browserbase.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#messaging-services) Messaging services

[Section titled “Messaging services”](https://www.daytona.io/docs/en/network-limits/#messaging-services)

| **Service** | **Domains** |
| --- | --- |
| Telegram | **`api.telegram.org`** |
| WhatsApp | **`web.whatsapp.com`**, **`*.whatsapp.net`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#llm-observability) LLM observability

[Section titled “LLM observability”](https://www.daytona.io/docs/en/network-limits/#llm-observability)

| **Service** | **Domains** |
| --- | --- |
| Langfuse | **`*.langfuse.com`**, **`*.cloud.langfuse.com`** |
| LangSmith | **`api.smith.langchain.com`** |

### [\#](https://www.daytona.io/docs/en/network-limits/\#scientific-and-ml-downloads) Scientific and ML downloads

[Section titled “Scientific and ML downloads”](https://www.daytona.io/docs/en/network-limits/#scientific-and-ml-downloads)

| **Service** | **Domains** |
| --- | --- |
| PyTorch | **`pytorch.org`**, **`*.pytorch.org`** |
| POV-Ray | **`povray.org`**, **`*.povray.org`** |
| RCSB | **`rcsb.org`**, **`*.rcsb.org`** |
| PubChem | **`pubchem.ncbi.nlm.nih.gov`** |
| FPBase | **`fpbase.org`**, **`*.fpbase.org`** |