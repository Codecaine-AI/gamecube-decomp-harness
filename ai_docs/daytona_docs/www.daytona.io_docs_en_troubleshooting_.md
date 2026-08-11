---
url: "https://www.daytona.io/docs/en/troubleshooting/"
title: "Troubleshooting | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/troubleshooting/#_top)

# Troubleshooting

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/troubleshooting.md)Open

Building on Daytona means creating sandboxes, moving them through their lifecycle, and running code and services inside them. Those operations share a common surface: Daytona Dashboard, SDKs, CLI, and API, all backed by the sandbox model, organization, and resources.

When something does not behave as expected, the returned error and the sandbox record identify the cause. From there you retry the call, adjust the request, recover the sandbox, or create a new one. Account and organization issues often look like missing resources or permission failures before any sandbox call runs.

## [\#](https://www.daytona.io/docs/en/troubleshooting/\#sandbox-lifecycle) Sandbox lifecycle

[Section titled “Sandbox lifecycle”](https://www.daytona.io/docs/en/troubleshooting/#sandbox-lifecycle)

A sandbox moves from create through start and into later size and placement changes. Create selects a [sandbox class](https://www.daytona.io/docs/en/sandboxes) and reserves resources from the regional pool. [Provisioning](https://www.daytona.io/docs/en/troubleshooting/#provisioning) then decides how that create is fulfilled: snapshot builds, [warm pools](https://www.daytona.io/docs/en/warm-pools), [region](https://www.daytona.io/docs/en/regions) availability, and [resize](https://www.daytona.io/docs/en/sandboxes#resize-sandboxes).

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#create-and-start) Create and start

[Section titled “Create and start”](https://www.daytona.io/docs/en/troubleshooting/#create-and-start)

Create and start allocate a sandbox from a snapshot or image and bring it to a running state. The request selects a [sandbox class](https://www.daytona.io/docs/en/sandboxes) and reserves **vCPU**, **memory**, and **disk** from the organization’s regional pool. Each class has its own create rules and quota.

- [Container](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1520)
- [Linux VM](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1521)
- [Windows](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1522)
- [GPU](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1523)

**Symptom:** Creating a container sandbox fails with `400` / `DaytonaBadRequestError`. The message typically reports that the total CPU, memory, or disk limit is exceeded for the region.

**Cause:** Container sandboxes draw from the organization’s compute and storage pool in that region. Stopped container sandboxes free CPU and memory, but they still occupy disk quota until they are [archived](https://www.daytona.io/docs/en/sandboxes#archive-sandboxes) or deleted. A full disk quota can therefore block create even when CPU and memory look available.

**Solution:**

1. Check current usage in [Limits ↗](https://app.daytona.io/dashboard/limits)
2. Stop sandboxes you are not using to free CPU and memory
3. [Archive](https://www.daytona.io/docs/en/sandboxes#archive-sandboxes) or delete stopped container sandboxes to free disk quota
4. Upgrade your [tier](https://www.daytona.io/docs/en/limits#tiers) if the pool itself is too small

See [create sandboxes](https://www.daytona.io/docs/en/sandboxes#create-sandboxes) and [disk quota](https://www.daytona.io/docs/en/limits#disk-quota).

**Symptom:** Creating a Linux VM sandbox fails with `400` / `DaytonaBadRequestError`, or a create from a declarative image does not yield a Linux VM sandbox.

**Cause:** Linux VM sandboxes can only be created from existing [VM snapshots](https://www.daytona.io/docs/en/snapshots#vm-snapshots) such as `daytona-vm-small`, or a custom snapshot with sandbox class `LINUX_VM`. The declarative builder applies to [container sandboxes](https://www.daytona.io/docs/en/sandboxes#create-sandboxes) only. Quotas are tracked per sandbox class and region, so unused container capacity does not free Linux VM capacity.

**Solution:**

1. Create from a Linux VM snapshot such as **`daytona-vm-small`**, **`daytona-vm-medium`**, or **`daytona-vm-large`**
2. Confirm regional quota for the Linux VM class in [Limits ↗](https://app.daytona.io/dashboard/limits)
3. If the region is unavailable for the class, pick another region or contact [support@daytona.io](mailto:support@daytona.io)

See [VM sandboxes](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes) and [VM snapshots](https://www.daytona.io/docs/en/snapshots#vm-snapshots).

**Symptom:** Creating a Windows sandbox fails with `400` / `DaytonaBadRequestError`, or a create from a declarative image does not yield a Windows sandbox.

**Cause:** Windows sandboxes can only be created from existing [VM snapshots](https://www.daytona.io/docs/en/snapshots#vm-snapshots) such as `windows-small`, or a custom snapshot with sandbox class `WINDOWS`. The declarative builder applies to [container sandboxes](https://www.daytona.io/docs/en/sandboxes#create-sandboxes) only. Quotas are tracked per sandbox class and region, so unused container capacity does not free Windows capacity.

**Solution:**

1. Create from a Windows snapshot such as **`windows-small`**, **`windows-medium`**, or **`windows-large`**
2. Confirm regional quota for the Windows class in [Limits ↗](https://app.daytona.io/dashboard/limits)
3. If the region is unavailable for the class, pick another region or contact [support@daytona.io](mailto:support@daytona.io)

See [VM sandboxes](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes) and [VM snapshots](https://www.daytona.io/docs/en/snapshots#vm-snapshots).

**Symptom:** Creating a GPU sandbox fails with `400` / `DaytonaBadRequestError`. The message typically reports that the total GPU limit is exceeded, sometimes with `Maximum allowed: 0`. Inside a started GPU sandbox, CUDA may also fail with device-unavailable errors such as error `999`.

**Cause:** GPU capacity is allocated per region. The organization either has no GPU quota in the target region, or existing and pending GPU sandboxes already use the available quota. Under scarcity, Daytona may also place GPU sandboxes outside the requested region. A started sandbox can also land on a GPU that is not healthy for CUDA workloads.

**Solution:**

1. Confirm your organization has GPU quota in [Limits ↗](https://app.daytona.io/dashboard/limits)
2. Try again later if pending GPU usage is consuming the pool
3. If CUDA fails inside a started sandbox, delete it and create a new GPU sandbox
4. For a specific region or repeated device faults, contact [support@daytona.io](mailto:support@daytona.io)

See [GPU sandboxes](https://www.daytona.io/docs/en/sandboxes#gpu-sandboxes) and [regions](https://www.daytona.io/docs/en/regions).

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#provisioning) Provisioning

[Section titled “Provisioning”](https://www.daytona.io/docs/en/troubleshooting/#provisioning)

Provisioning covers how a create is fulfilled after the sandbox class is chosen: [warm pools](https://www.daytona.io/docs/en/warm-pools), [snapshot](https://www.daytona.io/docs/en/snapshots) builds, [region](https://www.daytona.io/docs/en/regions) availability, and [resize](https://www.daytona.io/docs/en/sandboxes#resize-sandboxes) of reserved resources.

- [Warm pools](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1524)
- [Resize](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1525)
- [Build](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1526)
- [Region](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1527)

**Symptom:** A warm pool exists for the snapshot, but create still takes a cold-start path. The new sandbox works, yet it does not come from the pool and start time is higher than expected. Separately, `GET` or `POST``/api/warm-pools` may return `404`.

**Cause:** Warm claim is exact. The create request must match the pool on snapshot, region, the snapshot’s default CPU, memory, and disk, the default OS user (`daytona`), and must not set custom environment variables, volumes, or secrets. Any mismatch skips the pool. The warm pools API is also gated: when warm pools are not enabled for the organization, those endpoints return `404` even though they appear in the docs.

**Solution:** Align the create request with the pool, or accept a cold create when you need custom env, volumes, secrets, or resources. If the API returns `404`, use the Dashboard **Warm Pool** controls when available, or contact [support@daytona.io](mailto:support@daytona.io) to enable warm pools for your organization. See [warm pools](https://www.daytona.io/docs/en/warm-pools).

**Symptom:** Updating sandbox resources with `resize` fails, or the sandbox stays on the previous CPU, memory, or disk allocation.

**Cause:** Resize rules depend on whether the sandbox is running. While started, you can only increase CPU and memory. Decreasing CPU or memory, or increasing disk, requires the sandbox to be stopped first. Disk can only grow, and GPU allocation cannot be changed after create.

**Solution:** Stop the sandbox, resize within [organization limits](https://www.daytona.io/docs/en/limits), then start. See [resize sandboxes](https://www.daytona.io/docs/en/sandboxes#resize-sandboxes).

**Symptom:** Create or start stays in a pending state for a long time, then the sandbox moves to `error`, or a snapshot build never finishes. `errorReason` may mention a start or build deadline.

**Cause:** Snapshot builds and sandbox starts have time bounds. A long image export, a failed base image pull, or a start that does not complete leaves the sandbox or snapshot in an error state. A failed snapshot can also block later creates that reuse the same image or snapshot name.

**Solution:**

1. Read **`sandbox.errorReason`** and **`sandbox.recoverable`**
2. If **`recoverable`** is **`true`**, call **`sandbox.recover()`**
3. If the snapshot is in an error state, delete or rebuild it, then create again from a healthy snapshot
4. If creates keep failing for the same image or snapshot after a prior failure, contact [support@daytona.io](mailto:support@daytona.io)

See [recover sandboxes](https://www.daytona.io/docs/en/sandboxes#recover-sandboxes) and [snapshots](https://www.daytona.io/docs/en/snapshots).

**Symptom:** Create fails with a message such as `Selected snapshot is not available in any region you can use`, or `Snapshot ... is not available in region ...`. Linux VM or Windows creates stay unavailable after a tier upgrade that should unlock them.

**Cause:** Snapshots are published per region, and each sandbox class needs regional capacity for that class. A snapshot that exists in the organization may still be missing from the target region, or the organization may not yet have quota for `LINUX_VM` / `WINDOWS` in that region after a tier change.

**Solution:**

1. Confirm the snapshot and class are available in the target region in [Snapshots ↗](https://app.daytona.io/dashboard/snapshots) and [Limits ↗](https://app.daytona.io/dashboard/limits)
2. Create with a region where the snapshot is active, or wait for the snapshot to finish publishing to that region
3. After a tier upgrade for VM access, confirm Linux VM or Windows quota appears for the region; if it does not, contact [support@daytona.io](mailto:support@daytona.io)

See [regions](https://www.daytona.io/docs/en/regions) and [VM sandboxes](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes).

## [\#](https://www.daytona.io/docs/en/troubleshooting/\#account) Account

[Section titled “Account”](https://www.daytona.io/docs/en/troubleshooting/#account)

Account issues sit outside the sandbox lifecycle. They come from which [organization](https://www.daytona.io/docs/en/organizations) you are working in, and from whether your membership and assignments allow the action. Quotas, API keys, and sandboxes are scoped per organization. For API key and HTTP auth failures, see [authentication](https://www.daytona.io/docs/en/troubleshooting/#authentication).

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#organization) Organization

[Section titled “Organization”](https://www.daytona.io/docs/en/troubleshooting/#organization)

**Symptom:** Sandboxes, snapshots, API keys, or limits you expect are missing in the Dashboard or API. Creates succeed, but the new sandbox appears under a different organization than your team uses. Quotas look empty or unexpectedly low compared with another organization.

**Cause:** Every user has a personal organization, and may also belong to one or more collaborative organizations. Each organization has its own sandboxes, API keys, and resource quotas. The Dashboard shows only the organization selected in the sidebar. An API key is bound to the organization that issued it, so a key from your personal organization cannot list or manage resources in a collaborative organization.

**Solution:**

1. In [Daytona Dashboard ↗](https://app.daytona.io/dashboard/), open the organization dropdown at the top-left of the sidebar and select the organization you intend to use
2. Confirm the sandbox, key, or limit under that organization
3. For SDKs, CLI, or API calls, use an [API key](https://www.daytona.io/docs/en/api-keys) created in that same organization

See [organizations](https://www.daytona.io/docs/en/organizations) and [personal vs collaborative](https://www.daytona.io/docs/en/organizations#personal-vs-collaborative).

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#membership) Membership

[Section titled “Membership”](https://www.daytona.io/docs/en/troubleshooting/#membership)

**Symptom:** You are signed in and the correct organization is selected, but create, delete, or admin actions fail with `403` / `DaytonaForbiddenError`, or the Dashboard keeps resources read-only. A teammate invited you, yet you still cannot create sandboxes or keys in that organization.

**Cause:** Collaborative organizations use roles and [assignments](https://www.daytona.io/docs/en/organizations#role-assignments). Owners have full access. Members need assignments such as **Developer** to create sandboxes and keys; **Viewer** alone is read-only. An invitation also does nothing until it is accepted, and access to that organization’s quotas requires a new API key issued after you join.

**Solution:**

1. Open [Invitations ↗](https://app.daytona.io/dashboard/user/invitations) and accept any pending invitation for the organization
2. Ask an organization owner to grant the assignments you need (for example **Developer** to create sandboxes and keys)
3. After joining, create an [API key](https://www.daytona.io/docs/en/api-keys) in that organization and use it for SDK, CLI, and API calls

See [members](https://www.daytona.io/docs/en/organizations#members), [invitations](https://www.daytona.io/docs/en/organizations#invitations), and [authentication](https://www.daytona.io/docs/en/troubleshooting/#authentication).

## [\#](https://www.daytona.io/docs/en/troubleshooting/\#runtime-and-access) Runtime and access

[Section titled “Runtime and access”](https://www.daytona.io/docs/en/troubleshooting/#runtime-and-access)

Once a sandbox is started, it keeps a lifecycle state, accepts inbound and outbound traffic, and runs processes. Failures here show up in the sandbox record, preview or VNC sessions, network calls, process APIs, and rate-limit responses.

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#state) State

[Section titled “State”](https://www.daytona.io/docs/en/troubleshooting/#state)

State covers whether a started sandbox stays usable: [recovery](https://www.daytona.io/docs/en/sandboxes#recover-sandboxes) from error, [automated lifecycle](https://www.daytona.io/docs/en/sandboxes#automated-lifecycle-management) stops and deletes, and operations that depend on the [sandbox class](https://www.daytona.io/docs/en/sandboxes).

- [Recovery](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1559)
- [Inactivity](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1560)
- [Deletion](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1561)
- [Class capabilities](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1562)

**Symptom:** The sandbox is no longer usable and reports `state` as `error`. Calls that expect a started sandbox fail, and `errorReason` describes what went wrong during start or restore, such as a timeout while creating, starting, or pulling a snapshot.

**Cause:** The sandbox failed to reach a healthy started state. Some of these failures are recoverable: Daytona can restore the sandbox from its last successful backup. Others are not, and the sandbox must be replaced.

**Solution:**

1. Read **`sandbox.errorReason`** and **`sandbox.recoverable`**
2. If **`recoverable`** is **`true`**, call **`sandbox.recover()`** and wait until the sandbox is started
3. If it is not recoverable, delete the sandbox and create a new one from a [snapshot](https://www.daytona.io/docs/en/snapshots)

See [recover sandboxes](https://www.daytona.io/docs/en/sandboxes#recover-sandboxes).

- [Python](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1528)
- [TypeScript](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1529)
- [Ruby](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1530)
- [API](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1531)

```
from daytona import Daytona, ListSandboxesQuery

daytona = Daytona()

for sandbox in daytona.list(ListSandboxesQuery(is_recoverable=True)):

    sandbox.recover()
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

for await (const sandbox of daytona.list({ isRecoverable: true })) {

  await sandbox.recover()

}
```

```
require 'daytona'

daytona = Daytona::Daytona.new

daytona.list(Daytona::ListSandboxesQuery.new(is_recoverable: true)).each do |sandbox|

  sandbox.recover

end
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/recover' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

**Symptom:** A long-running process inside the sandbox is interrupted because the sandbox itself stops or pauses. From outside, the sandbox moves to `stopped` or `paused` even though work was still in progress.

**Cause:** [Auto-stop](https://www.daytona.io/docs/en/sandboxes#auto-stop-interval) or [auto-pause](https://www.daytona.io/docs/en/sandboxes#auto-pause-interval) treats the sandbox as idle when there is no qualifying activity. Processes that only run inside the sandbox do not count. Activity that resets the timer includes toolbox requests, preview traffic, SSH sessions, and lifecycle state changes.

**Solution:**

- Set **`auto_stop_interval=0`** (and **`auto_pause_interval=0`** on VM sandboxes) for jobs that must run without external interaction
- Or call **`sandbox.refresh_activity()`** from your orchestrator on a schedule while the job runs

See [automated lifecycle management](https://www.daytona.io/docs/en/sandboxes#automated-lifecycle-management).

**Symptom:** A sandbox ID that worked earlier can no longer be fetched. `get` or list does not return it, and the SDK may raise `DaytonaNotFoundError`.

**Cause:** The sandbox reached a lifetime bound and was removed. That happens when it was created as [ephemeral](https://www.daytona.io/docs/en/sandboxes#ephemeral-sandboxes) and then stopped, when [auto-delete](https://www.daytona.io/docs/en/sandboxes#auto-delete-interval) elapsed after it stayed stopped, or when [wall-clock TTL](https://www.daytona.io/docs/en/sandboxes#wall-clock-ttl) (`ttl_minutes`) expired in any state.

**Solution:** Check the create parameters and any later `set_ttl` / `set_auto_delete_interval` calls. Persist results to a [volume](https://www.daytona.io/docs/en/volumes) or [snapshot](https://www.daytona.io/docs/en/snapshots) before the sandbox is destroyed.

**Symptom:** Pause, fork, or a snapshot that includes memory fails, often with `422` / `DaytonaUnprocessableEntityError`, even though the sandbox is running.

**Cause:** Those operations are available only on [VM sandboxes](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes) (Linux VM or Windows). Container and GPU sandboxes preserve the filesystem across stop and start, but they do not support pause, fork, or hot snapshots.

**Solution:** Create from a VM snapshot such as `daytona-vm-small`, or use stop/start and a [cold snapshot](https://www.daytona.io/docs/en/snapshots#create-snapshot-from-sandbox) for filesystem-only capture.

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#access) Access

[Section titled “Access”](https://www.daytona.io/docs/en/troubleshooting/#access)

Access covers reaching services inside a started sandbox and driving work through it: [preview](https://www.daytona.io/docs/en/preview), [VNC](https://www.daytona.io/docs/en/vnc-access), [network](https://www.daytona.io/docs/en/network-limits) policy, [process](https://www.daytona.io/docs/en/process-code-execution) execution, and [rate limits](https://www.daytona.io/docs/en/limits#rate-limits).

- [Preview](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1563)
- [VNC](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1564)
- [Network](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1565)
- [Processes](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1566)
- [Rate limits](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1567)

**Symptom:** A browser or HTTP client cannot reach a service through the sandbox preview URL. The response is `401` or `403` even though the sandbox is started and the port is listening.

**Cause:** Preview authentication depends on the URL type, and the two token kinds are not interchangeable. A standard preview URL expects the token in the `x-daytona-preview-token` header, and that token is reset when the sandbox restarts. A signed preview URL embeds the token in the URL itself; it cannot be sent as a header, and it stops working when it expires or when signing keys are rotated.

**Solution:** Use the matching auth method for the URL type. Refresh standard tokens after restart. Check signed URL expiry. See [preview](https://www.daytona.io/docs/en/preview).

**Symptom:** The Dashboard shows **VNC not available**, Computer Use start fails, or the VNC session returns `503` and does not connect. The issue can appear on Linux and Windows sandboxes.

**Cause:** VNC and Computer Use need the desktop stack in the sandbox image. Custom images without the [required packages](https://www.daytona.io/docs/en/vnc-access#required-packages) report that Computer Use is not available. The sandbox must also be started. Intermittent `503` or failed sessions usually clear after restarting Computer Use or recreating the sandbox.

**Solution:**

1. Confirm the sandbox is started
2. Use a default image, or install the packages listed in [VNC access](https://www.daytona.io/docs/en/vnc-access#required-packages)
3. Call **`sandbox.computer_use.start()`**, or open **VNC** again from the Dashboard
4. If the session still fails, stop and start the sandbox, or delete it and create a new one

See [VNC access](https://www.daytona.io/docs/en/vnc-access) and [Computer Use](https://www.daytona.io/docs/en/computer-use).

**Symptom:** Package installs, `curl`, model downloads, or other outbound requests from inside the sandbox fail. Errors often look like `ECONNRESET`, `connection reset by peer`, or a hang while connecting to sites such as package registries and object storage. Separately, create or `update_network_settings` may return `400` / `DaytonaBadRequestError` when network options conflict.

**Cause:** Outbound access is controlled at both the organization and sandbox level. On Tier 1 and Tier 2, organization network restrictions always apply and sandbox-level allow lists cannot override them, so allowlisting domains on the sandbox alone does not open blocked destinations. At the sandbox level, `network_block_all`, a CIDR allow list, and a domain allow list are mutually exclusive: only one mode may be set, and combining them returns `400`.

**Solution:**

1. Check your [tier](https://www.daytona.io/docs/en/limits#tiers) and [network limits](https://www.daytona.io/docs/en/network-limits)
2. On Tier 1 or Tier 2, upgrade to Tier 3 or higher, or ask [support@daytona.io](mailto:support@daytona.io) to adjust the organization network policy
3. On Tier 3 or higher, set exactly one sandbox network mode that includes the destinations you need

- [Python](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1532)
- [TypeScript](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1533)
- [Ruby](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1534)
- [Go](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1535)
- [Java](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1536)
- [API](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1537)

```
# Pick one mode only

sandbox.update_network_settings(network_block_all=True)

# or

sandbox.update_network_settings(network_allow_list="208.80.154.232/32")

# or

sandbox.update_network_settings(domain_allow_list="example.com,*.daytona.io")
```

```
// Pick one mode only

await sandbox.updateNetworkSettings({ networkBlockAll: true })

// or

await sandbox.updateNetworkSettings({ networkAllowList: '208.80.154.232/32' })

// or

await sandbox.updateNetworkSettings({ domainAllowList: 'example.com,*.daytona.io' })
```

```
# Pick one mode only

sandbox.update_network_settings(network_block_all: true)

# or

sandbox.update_network_settings(network_allow_list: '208.80.154.232/32')

# or

sandbox.update_network_settings(domain_allow_list: 'example.com,*.daytona.io')
```

```
import apiclient "github.com/daytona/clients/api-client-go"

// Pick one mode only

blockAll := apiclient.NewUpdateSandboxNetworkSettings()

blockAll.SetNetworkBlockAll(true)

_ = sandbox.UpdateNetworkSettings(ctx, *blockAll)

// or

allowList := apiclient.NewUpdateSandboxNetworkSettings()

allowList.SetNetworkAllowList("208.80.154.232/32")

_ = sandbox.UpdateNetworkSettings(ctx, *allowList)

// or

domainAllow := apiclient.NewUpdateSandboxNetworkSettings()

domainAllow.SetDomainAllowList("example.com,*.daytona.io")

_ = sandbox.UpdateNetworkSettings(ctx, *domainAllow)
```

```
import io.daytona.api.client.model.UpdateSandboxNetworkSettings;

// Pick one mode only

sandbox.updateNetworkSettings(new UpdateSandboxNetworkSettings().networkBlockAll(true));

// or

sandbox.updateNetworkSettings(

    new UpdateSandboxNetworkSettings().networkAllowList("208.80.154.232/32"));

// or

sandbox.updateNetworkSettings(

    new UpdateSandboxNetworkSettings().domainAllowList("example.com,*.daytona.io"));
```

```
# Pick one mode only

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"networkBlockAll": true}'

# or

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"networkAllowList": "208.80.154.232/32"}'

# or

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/network-settings' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"domainAllowList": "example.com,*.daytona.io"}'
```

See [isolation](https://www.daytona.io/docs/en/isolation#network-isolation) and [create sandboxes with network restrictions](https://www.daytona.io/docs/en/network-limits#create-sandboxes-with-network-restrictions).

**Symptom:** Running a command or session operation fails with `DaytonaProcessExecutionTimeoutError` (`PROCESS_EXECUTION_TIMEOUT`), `DaytonaSessionEndedError` (`SESSION_ENDED`), or `DaytonaCommandAlreadyCompletedError` (`COMMAND_ALREADY_COMPLETED`).

**Cause:** Process APIs enforce their own deadlines and session lifecycle. A timeout error means the command ran longer than the timeout passed to `exec` or `code_run`. A 410 session or command error means the shell session already ended, or the command already finished and cannot be waited on again.

**Solution:** Raise the timeout, or run long jobs asynchronously in a [session](https://www.daytona.io/docs/en/process-code-execution#session-operations) with `run_async=True` and poll for completion. For ended sessions or completed commands, create a new session and read the prior exit code or logs instead of re-executing.

- [Python](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1538)
- [TypeScript](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1539)
- [Ruby](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1540)
- [Go](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1541)
- [Java](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1542)
- [API](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1543)

```
from daytona import Daytona, SessionExecuteRequest

daytona = Daytona()

sandbox = daytona.get("my-sandbox")

# Short interactive command

sandbox.process.exec("make test", timeout=120)

# Long job: do not block the caller

sandbox.process.create_session("build")

sandbox.process.execute_session_command(

    "build",

    SessionExecuteRequest(command="make build", run_async=True),

)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.get('my-sandbox')

// Short interactive command

await sandbox.process.executeCommand('make test', undefined, undefined, 120)

// Long job: do not block the caller

await sandbox.process.createSession('build')

await sandbox.process.executeSessionCommand('build', {

  command: 'make build',

  runAsync: true,

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.get('my-sandbox')

# Short interactive command

sandbox.process.exec(command: 'make test', timeout: 120)

# Long job: do not block the caller

sandbox.process.create_session('build')

sandbox.process.execute_session_command(

  session_id: 'build',

  req: Daytona::SessionExecuteRequest.new(

    command: 'make build',

    run_async: true

  )

)
```

```
import (

  "log"

  "time"

  "github.com/daytona/clients/sdk-go/pkg/options"

)

sandbox, err := client.Get(ctx, "my-sandbox")

if err != nil {

  log.Fatal(err)

}

// Short interactive command

_, err = sandbox.Process.ExecuteCommand(ctx, "make test",

  options.WithExecuteTimeout(120*time.Second),

)

if err != nil {

  log.Fatal(err)

}

// Long job: do not block the caller

err = sandbox.Process.CreateSession(ctx, "build")

if err != nil {

  log.Fatal(err)

}

_, err = sandbox.Process.ExecuteSessionCommand(ctx, "build", "make build", true, false)

if err != nil {

  log.Fatal(err)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.SessionExecuteRequest;

Daytona daytona = new Daytona();

Sandbox sandbox = daytona.get("my-sandbox");

// Short interactive command

sandbox.process.executeCommand("make test", null, null, 120);

// Long job: do not block the caller

sandbox.process.createSession("build");

sandbox.process.executeSessionCommand(

    "build",

    new SessionExecuteRequest("make build", true)

);
```

```
# Short interactive command

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/execute' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "command": "make test",

  "timeout": 120

}'

# Long job: create a session, then run async

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{"sessionId": "build"}'

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/build/exec' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "command": "make build",

  "runAsync": true

}'
```

**Symptom:** Create, lifecycle, or other API calls start failing with `DaytonaRateLimitError`, HTTP `429`, or `ThrottlerException: Too Many Requests`, often when many sandboxes are created concurrently.

**Cause:** The organization exceeded a rate limit window for general API requests, sandbox creation, or sandbox lifecycle operations. Sandbox creation has its own per-minute cap by [tier](https://www.daytona.io/docs/en/limits#rate-limits). Bursting above that cap, for example creating hundreds of sandboxes in one minute, returns `429` until the window resets.

**Solution:** Read `Retry-After-{throttler}` from the error headers, wait, then retry with backoff. Pace concurrent creates to stay under the sandbox-create limit, or contact [support@daytona.io](mailto:support@daytona.io) for a higher quota. See [rate limit retry](https://www.daytona.io/docs/en/troubleshooting/#rate-limit-retry) and [rate limit errors](https://www.daytona.io/docs/en/limits#rate-limit-errors).

## [\#](https://www.daytona.io/docs/en/troubleshooting/\#error-handling) Error handling

[Section titled “Error handling”](https://www.daytona.io/docs/en/troubleshooting/#error-handling)

The Daytona SDKs raise subclasses of `DaytonaError` for API, daemon, proxy, and transport failures. Catch the precise class or catch `DaytonaError` for a general handler.

- [Python](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1544)
- [TypeScript](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1545)
- [Ruby](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1546)
- [Go](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1547)
- [Java](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1548)

```
from daytona import Daytona, DaytonaError, DaytonaNotFoundError, DaytonaRateLimitError

daytona = Daytona()

try:

    sandbox = daytona.get("missing-sandbox")

except DaytonaNotFoundError as e:

    print(e.status_code, e.message)

except DaytonaRateLimitError as e:

    print(e.headers.get("retry-after-sandbox-create"))

except DaytonaError as e:

    print(e.status_code, e.code, e.source, e.message)
```

```
import {

  Daytona,

  DaytonaError,

  DaytonaNotFoundError,

  DaytonaRateLimitError,

} from '@daytona/sdk'

const daytona = new Daytona()

try {

  const sandbox = await daytona.get('missing-sandbox')

} catch (error) {

  if (error instanceof DaytonaNotFoundError) {

    console.log(error.statusCode, error.message)

  } else if (error instanceof DaytonaRateLimitError) {

    console.log(error.headers?.get('retry-after-sandbox-create'))

  } else if (error instanceof DaytonaError) {

    console.log(error.statusCode, error.code, error.source, error.message)

  } else {

    throw error

  }

}
```

```
require 'daytona'

daytona = Daytona::Daytona.new

begin

  sandbox = daytona.get('missing-sandbox')

rescue Daytona::Sdk::NotFoundError => e

  puts "#{e.status_code} #{e.message}"

rescue Daytona::Sdk::RateLimitError => e

  puts e.headers['retry-after-sandbox-create']

rescue Daytona::Sdk::Error => e

  puts "#{e.status_code} #{e.code} #{e.source} #{e.message}"

end
```

```
import (

  "errors"

  "fmt"

  "log"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  sdkerrors "github.com/daytona/clients/sdk-go/pkg/errors"

)

sandbox, err := client.Get(ctx, "missing-sandbox")

if err != nil {

  var daytonaErr *sdkerrors.DaytonaError

  if errors.As(err, &daytonaErr) {

    fmt.Println(daytonaErr.StatusCode, daytonaErr.Code, daytonaErr.Source, daytonaErr.Message)

    if errors.Is(err, sdkerrors.ErrNotFound) {

      fmt.Println("not found")

    }

    if errors.Is(err, sdkerrors.ErrRateLimit) {

      fmt.Println(daytonaErr.Headers.Get("retry-after-sandbox-create"))

    }

    return

  }

  log.Fatal(err)

}

_ = sandbox
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.exception.DaytonaException;

import io.daytona.sdk.exception.DaytonaNotFoundException;

import io.daytona.sdk.exception.DaytonaRateLimitException;

Daytona daytona = new Daytona();

try {

    Sandbox sandbox = daytona.get("missing-sandbox");

} catch (DaytonaNotFoundException e) {

    System.out.println(e.getStatusCode() + " " + e.getMessage());

} catch (DaytonaRateLimitException e) {

    System.out.println(e.getHeaders().get("retry-after-sandbox-create"));

} catch (DaytonaException e) {

    System.out.println(e.getStatusCode() + " " + e.getCode() + " " + e.getSource() + " " + e.getMessage());

}
```

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#authentication) Authentication

[Section titled “Authentication”](https://www.daytona.io/docs/en/troubleshooting/#authentication)

**Symptom:** API calls return `401` / `DaytonaAuthenticationError` or `403` / `DaytonaForbiddenError`, sometimes with a message about an invalid authentication context, even when an API key looks valid.

**Cause:** The key is missing, revoked, scoped to a different organization, or lacks the permission required for the operation. SDKs and the API bind requests to an organization; using a key from one org while targeting another, or omitting required organization context, produces auth failures. Dashboard sign-in issues (SSO, email alias requirements) are separate from API key auth.

**Solution:**

1. Create or rotate a key in [API Keys ↗](https://app.daytona.io/dashboard/keys) for the organization you intend to use
2. Set **`DAYTONA_API_KEY`** (or the SDK config equivalent) to that key
3. Confirm the key has the [permissions](https://www.daytona.io/docs/en/api-keys#permissions--scopes) required for the call
4. For wrong-organization or membership issues in the Dashboard, see [account](https://www.daytona.io/docs/en/troubleshooting/#account)
5. For SSO or account sign-in problems in the Dashboard, contact [support@daytona.io](mailto:support@daytona.io)

See [API keys](https://www.daytona.io/docs/en/api-keys) and [organizations](https://www.daytona.io/docs/en/organizations).

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#error-attributes) Error attributes

[Section titled “Error attributes”](https://www.daytona.io/docs/en/troubleshooting/#error-attributes)

| **Attribute** | **Description** |
| --- | --- |
| **`message`** | Human-readable description. Varies per response; do not match on exact text. |
| **`status_code`** | HTTP status when the error came from a Daytona service. `None` / unset for pure client-side failures. |
| **`code`** | Machine-readable code from the response envelope when present (for example `FILE_NOT_FOUND`). |
| **`source`** | Originating service: `DAYTONA_API`, `DAYTONA_DAEMON`, or `DAYTONA_PROXY`. Unset when the response has no envelope. |
| **`headers`** | Response headers (includes rate-limit headers on 429). Empty for client-side errors. |

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#http-status-codes) HTTP status codes

[Section titled “HTTP status codes”](https://www.daytona.io/docs/en/troubleshooting/#http-status-codes)

| **Status** | **SDK class** | **When it is raised** | **Typical response** |
| --- | --- | --- | --- |
| **`400`** | **`DaytonaBadRequestError`** | Malformed or invalid request | Fix parameters; do not retry as-is |
| **`401`** | **`DaytonaAuthenticationError`** | Missing or invalid credentials | Refresh API key / auth; do not retry with the same key |
| **`403`** | **`DaytonaForbiddenError`** | Authenticated caller lacks permission | Check API key scopes and organization membership |
| **`404`** | **`DaytonaNotFoundError`** | Resource does not exist | Create or look up a different ID; do not retry |
| **`408`** | **`DaytonaTimeoutError`** | Request timed out | Retry idempotent reads; decide whether to recover/create |
| **`409`** | **`DaytonaConflictError`** | Conflicts with current resource state | Refresh state, then decide |
| **`410`** | **`DaytonaGoneError`** | Resource existed but is permanently gone | Do not retry the same operation; recreate if needed |
| **`422`** | **`DaytonaUnprocessableEntityError`** | Well-formed request that is semantically invalid | Fix parameters; do not retry as-is |
| **`429`** | **`DaytonaRateLimitError`** | Organization rate limit exceeded | Wait **`Retry-After-{throttler}`**, then retry with backoff |
| **`500`** | **`DaytonaInternalServerError`** | Unexpected server failure | Retry with backoff; escalate if persistent |
| **`502`** | **`DaytonaBadGatewayError`** | Upstream dependency rejected or dropped the request | Retry with backoff |
| **`503`** | **`DaytonaServiceUnavailableError`** | Service temporarily refusing traffic | Retry with backoff |
| **`504`** | **`DaytonaTimeoutError`** | Gateway timed out | Retry idempotent reads; decide whether to recover/create |

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#daemon-error-codes) Daemon error codes

[Section titled “Daemon error codes”](https://www.daytona.io/docs/en/troubleshooting/#daemon-error-codes)

| **Code** | **SDK class** | **HTTP class** | **Meaning** |
| --- | --- | --- | --- |
| **`GIT_AUTH_FAILED`** | **`DaytonaGitAuthFailedError`** | Authentication (`401`) | Git credentials rejected by the remote |
| **`GIT_REPO_NOT_FOUND`** | **`DaytonaGitRepoNotFoundError`** | Not found (`404`) | Git repository does not exist |
| **`GIT_BRANCH_NOT_FOUND`** | **`DaytonaGitBranchNotFoundError`** | Not found (`404`) | Git branch does not exist |
| **`GIT_BRANCH_EXISTS`** | **`DaytonaGitBranchExistsError`** | Conflict (`409`) | Branch name already exists |
| **`GIT_PUSH_REJECTED`** | **`DaytonaGitPushRejectedError`** | Conflict (`409`) | Push rejected (non-fast-forward / stale ref) |
| **`GIT_DIRTY_WORKTREE`** | **`DaytonaGitDirtyWorktreeError`** | Conflict (`409`) | Worktree has uncommitted changes |
| **`GIT_MERGE_CONFLICT`** | **`DaytonaGitMergeConflictError`** | Conflict (`409`) | Merge conflicts need resolution |
| **`FILE_NOT_FOUND`** | **`DaytonaFileNotFoundError`** | Not found (`404`) | Filesystem entry not found |
| **`FILE_ACCESS_DENIED`** | **`DaytonaFileAccessDeniedError`** | Forbidden (`403`) | Insufficient filesystem permissions |
| **`INVALID_FILE_PATH`** | **`DaytonaInvalidFilePathError`** | Bad request (`400`) | Invalid filesystem path (TypeScript SDK) |
| **`FILE_READ_FAILED`** | **`DaytonaFileReadFailedError`** | Internal server (`500`) | Filesystem read failed (TypeScript SDK) |
| **`LSP_SERVER_NOT_INITIALIZED`** | **`DaytonaLspServerNotInitializedError`** | Bad request (`400`) | LSP server must be started first |
| **`PROCESS_EXECUTION_TIMEOUT`** | **`DaytonaProcessExecutionTimeoutError`** | Timeout | Process exceeded its execution timeout |
| **`PROCESS_NOT_FOUND`** | **`DaytonaProcessNotFoundError`** | Not found (`404`) | Process is not running |
| **`SESSION_ENDED`** | **`DaytonaSessionEndedError`** | Gone (`410`) | Shell session has ended |
| **`COMMAND_ALREADY_COMPLETED`** | **`DaytonaCommandAlreadyCompletedError`** | Gone (`410`) | Shell command already finished |
| **`A11Y_UNAVAILABLE`** | **`DaytonaA11yUnavailableError`** | Service unavailable (`503`) | Accessibility (AT-SPI) bus not reachable |
| **`RECORDING_STILL_ACTIVE`** | **`DaytonaRecordingStillActiveError`** | Conflict (`409`) | Recording still running; stop it first |
| **`RECORDING_FFMPEG_NOT_FOUND`** | **`DaytonaRecordingFfmpegNotFoundError`** | Service unavailable (`503`) | `ffmpeg` not installed; required for recording |

> **Full reference**: [Python SDK errors](https://www.daytona.io/docs/en/python-sdk/common/errors), [TypeScript SDK errors](https://www.daytona.io/docs/en/typescript-sdk/errors), [Go SDK errors](https://www.daytona.io/docs/en/go-sdk/errors).

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#client-side-errors) Client-side errors

[Section titled “Client-side errors”](https://www.daytona.io/docs/en/troubleshooting/#client-side-errors)

| **SDK class** | **When it is raised** | **Typical response** |
| --- | --- | --- |
| **`DaytonaConnectionError`** | Cannot connect or the connection drops mid-request | Retry with backoff |
| **`DaytonaConnectionTimeoutError`** | Transport connect/read timeout | Retry with backoff; raise client timeout |
| **`DaytonaInvalidArgumentError`** | SDK rejected arguments locally before sending a request (TypeScript) | Fix arguments; do not retry as-is |
| **`DaytonaTimeoutError`** | Client wait deadline on lifecycle helpers (for example `start`) | Raise timeout or recover/recreate |

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#rate-limit-retry) Rate limit retry

[Section titled “Rate limit retry”](https://www.daytona.io/docs/en/troubleshooting/#rate-limit-retry)

- [Python](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1549)
- [TypeScript](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1550)
- [Go](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1551)
- [Ruby](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1552)
- [Java](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1553)

```
import time

from daytona import Daytona, DaytonaRateLimitError

daytona = Daytona()

def create_with_retry(max_retries: int = 5):

    for attempt in range(max_retries):

        try:

            return daytona.create()

        except DaytonaRateLimitError as e:

            if attempt == max_retries - 1:

                raise

            retry_after = e.headers.get("retry-after-sandbox-create")

            delay = int(retry_after) if retry_after else 2 ** attempt

            time.sleep(delay)
```

```
import { Daytona, DaytonaRateLimitError } from '@daytona/sdk'

const daytona = new Daytona()

async function createWithRetry(maxRetries = 5) {

  for (let attempt = 0; attempt < maxRetries; attempt++) {

    try {

      return await daytona.create()

    } catch (error) {

      if (!(error instanceof DaytonaRateLimitError) || attempt === maxRetries - 1) {

        throw error

      }

      const retryAfter = error.headers?.get('retry-after-sandbox-create')

      const delay = retryAfter

        ? parseInt(retryAfter) * 1000

        : Math.pow(2, attempt) * 1000

      await new Promise((resolve) => setTimeout(resolve, delay))

    }

  }

}
```

```
package main

import (

  "context"

  "errors"

  "fmt"

  "strconv"

  "time"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  sdkerrors "github.com/daytona/clients/sdk-go/pkg/errors"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func createWithRetry(client *daytona.Client, maxRetries int) (*daytona.Sandbox, error) {

  ctx := context.Background()

  for attempt := 0; attempt < maxRetries; attempt++ {

    sandbox, err := client.Create(ctx, types.SnapshotParams{})

    if err == nil {

      return sandbox, nil

    }

    var rateLimitErr *sdkerrors.DaytonaRateLimitError

    if !errors.As(err, &rateLimitErr) || attempt == maxRetries-1 {

      return nil, err

    }

    delay := time.Duration(1<<attempt) * time.Second

    if retryAfter := rateLimitErr.Headers.Get("retry-after-sandbox-create"); retryAfter != "" {

      if seconds, parseErr := strconv.Atoi(retryAfter); parseErr == nil {

        delay = time.Duration(seconds) * time.Second

      }

    }

    fmt.Println("rate limited, waiting", delay)

    time.Sleep(delay)

  }

  return nil, fmt.Errorf("exhausted retries")

}
```

```
require 'daytona'

daytona = Daytona::Daytona.new

def create_with_retry(daytona, max_retries = 5)

  max_retries.times do |attempt|

    begin

      return daytona.create

    rescue Daytona::Sdk::RateLimitError => e

      raise if attempt == max_retries - 1

      retry_after = e.headers['retry-after-sandbox-create']

      delay = retry_after ? retry_after.to_i : 2**attempt

      sleep delay

    end

  end

end
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.exception.DaytonaRateLimitException;

Daytona daytona = new Daytona();

Sandbox createWithRetry(int maxRetries) throws InterruptedException {

    for (int attempt = 0; attempt < maxRetries; attempt++) {

        try {

            return daytona.create();

        } catch (DaytonaRateLimitException e) {

            if (attempt == maxRetries - 1) {

                throw e;

            }

            String retryAfter = e.getHeaders().get("retry-after-sandbox-create");

            long delaySeconds = retryAfter != null

                ? Long.parseLong(retryAfter)

                : (1L << attempt);

            Thread.sleep(delaySeconds * 1000);

        }

    }

    throw new IllegalStateException("exhausted retries");

}
```

### [\#](https://www.daytona.io/docs/en/troubleshooting/\#sdk-timeouts) SDK timeouts

[Section titled “SDK timeouts”](https://www.daytona.io/docs/en/troubleshooting/#sdk-timeouts)

- [Python](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1554)
- [TypeScript](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1555)
- [Ruby](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1556)
- [Go](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1557)
- [Java](https://www.daytona.io/docs/en/troubleshooting/#tab-panel-1558)

```
from daytona import Daytona

daytona = Daytona()

sandbox = daytona.get("my-sandbox")

# Wait up to 40 seconds for recover to reach started

if sandbox.recoverable:

    sandbox.recover(timeout=40)

# Wait up to 60 seconds for start

sandbox.start(timeout=60)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.get('my-sandbox')

// Wait up to 40 seconds for recover to reach started

if (sandbox.recoverable) {

  await sandbox.recover(40)

}

// Wait up to 60 seconds for start

await sandbox.start(60)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.get('my-sandbox')

# Wait up to 40 seconds for recover to reach started

sandbox.recover(40) if sandbox.state.to_s == 'error'

# Wait up to 60 seconds for start

sandbox.start(60)
```

```
sandbox, err := client.Get(ctx, "my-sandbox")

if err != nil {

  log.Fatal(err)

}

// Wait up to 60 seconds for start

err = sandbox.StartWithTimeout(ctx, 60*time.Second)

if err != nil {

  log.Fatal(err)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

Daytona daytona = new Daytona();

Sandbox sandbox = daytona.get("my-sandbox");

// Wait up to 60 seconds for start

sandbox.start(60);
```