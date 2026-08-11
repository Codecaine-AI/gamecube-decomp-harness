---
url: "https://www.daytona.io/docs/en/ruby-sdk/sandbox/"
title: "Sandbox | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/sandbox.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#sandbox) Sandbox

[Section titled “Sandbox”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#sandbox)

Internal — obtain sandboxes via Daytona::Daytona#create, Daytona::Daytona#get,
or Daytona::Daytona#list rather than constructing directly.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#new-sandbox) new Sandbox()

[Section titled “new Sandbox()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#new-sandbox)

```
def initialize(sandbox_dto:, config:, sandbox_api:, subscription_manager:, otel_state: nil, analytics_api_url_provider: nil)
```

Internal — obtain sandboxes via Daytona::Daytona#create, Daytona::Daytona#get,
or Daytona::Daytona#list rather than constructing directly.

**Returns**:

- `Sandbox` \- a new instance of Sandbox

### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#id) id()

[Section titled “id()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#id)

```
def id()
```

**Returns**:

- `String` \- The ID of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#organization_id) organization\_id()

[Section titled “organization\_id()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#organization_id)

```
def organization_id()
```

**Returns**:

- `String` \- The organization ID of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#snapshot) snapshot()

[Section titled “snapshot()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#snapshot)

```
def snapshot()
```

**Returns**:

- `String` \- The snapshot used for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#user) user()

[Section titled “user()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#user)

```
def user()
```

**Returns**:

- `String` \- The user associated with the project

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#env) env()

[Section titled “env()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#env)

```
def env()
```

**Returns**:

- `Hash\<String, String\>, nil` \- Environment variables for the sandbox.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#labels) labels()

[Section titled “labels()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#labels)

```
def labels()
```

**Returns**:

- `Hash\<String, String\>` \- Labels for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#public) public()

[Section titled “public()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#public)

```
def public()
```

**Returns**:

- `Boolean` \- Whether the sandbox http preview is public

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#network_block_all) network\_block\_all()

[Section titled “network\_block\_all()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#network_block_all)

```
def network_block_all()
```

**Returns**:

- `Boolean, nil` \- Whether to block all network access for the sandbox.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#network_allow_list) network\_allow\_list()

[Section titled “network\_allow\_list()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#network_allow_list)

```
def network_allow_list()
```

**Returns**:

- `String, nil` \- Comma-separated list of allowed CIDR network addresses for the sandbox.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#domain_allow_list) domain\_allow\_list()

[Section titled “domain\_allow\_list()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#domain_allow_list)

```
def domain_allow_list()
```

**Returns**:

- `String, nil` \- Comma-separated list of allowed domains for the sandbox.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#target) target()

[Section titled “target()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#target)

```
def target()
```

**Returns**:

- `String` \- The target environment for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#cpu) cpu()

[Section titled “cpu()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#cpu)

```
def cpu()
```

**Returns**:

- `Float` \- The CPU quota for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#gpu) gpu()

[Section titled “gpu()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#gpu)

```
def gpu()
```

**Returns**:

- `Float` \- The GPU quota for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#memory) memory()

[Section titled “memory()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#memory)

```
def memory()
```

**Returns**:

- `Float` \- The memory quota for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#disk) disk()

[Section titled “disk()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#disk)

```
def disk()
```

**Returns**:

- `Float` \- The disk quota for the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#state) state()

[Section titled “state()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#state)

```
def state()
```

**Returns**:

- `DaytonaApiClient:SandboxState` \- The state of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#desired_state) desired\_state()

[Section titled “desired\_state()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#desired_state)

```
def desired_state()
```

**Returns**:

- `DaytonaApiClient:SandboxDesiredState` \- The desired state of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#error_reason) error\_reason()

[Section titled “error\_reason()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#error_reason)

```
def error_reason()
```

**Returns**:

- `String` \- The error reason of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#backup_state) backup\_state()

[Section titled “backup\_state()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#backup_state)

```
def backup_state()
```

**Returns**:

- `String` \- The state of the backup

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#backup_created_at) backup\_created\_at()

[Section titled “backup\_created\_at()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#backup_created_at)

```
def backup_created_at()
```

**Returns**:

- `String, nil` \- The creation timestamp of the last backup.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_stop_interval) auto\_stop\_interval()

[Section titled “auto\_stop\_interval()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_stop_interval)

```
def auto_stop_interval()
```

**Returns**:

- `Float` \- Auto-stop interval in minutes (0 means disabled)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_pause_interval) auto\_pause\_interval()

[Section titled “auto\_pause\_interval()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_pause_interval)

```
def auto_pause_interval()
```

**Returns**:

- `Float` \- Auto-pause interval in minutes (0 means disabled)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_archive_interval) auto\_archive\_interval()

[Section titled “auto\_archive\_interval()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_archive_interval)

```
def auto_archive_interval()
```

**Returns**:

- `Float` \- Auto-archive interval in minutes

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_delete_interval) auto\_delete\_interval()

[Section titled “auto\_delete\_interval()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_delete_interval)

```
def auto_delete_interval()
```

(negative value means disabled, 0 means delete immediately upon stopping)

**Returns**:

- `Float` \- Auto-delete interval in minutes

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#volumes) volumes()

[Section titled “volumes()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#volumes)

```
def volumes()
```

**Returns**:

- `Array\<DaytonaApiClient:SandboxVolume\>, nil` \- Volumes attached to the sandbox.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#build_info) build\_info()

[Section titled “build\_info()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#build_info)

```
def build_info()
```

**Returns**:

- `DaytonaApiClient:BuildInfo, nil` \- Build information for the sandbox if it was
created from a dynamic build.
Not returned by list results; call #refresh on each item to populate.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_destroy_at) auto\_destroy\_at()

[Section titled “auto\_destroy\_at()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_destroy_at)

```
def auto_destroy_at()
```

**Returns**:

- `String, nil` \- When the sandbox will be automatically destroyed (nil if no TTL is set)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#created_at) created\_at()

[Section titled “created\_at()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#created_at)

```
def created_at()
```

**Returns**:

- `String` \- The creation timestamp of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#updated_at) updated\_at()

[Section titled “updated\_at()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#updated_at)

```
def updated_at()
```

**Returns**:

- `String` \- The last update timestamp of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#last_activity_at) last\_activity\_at()

[Section titled “last\_activity\_at()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#last_activity_at)

```
def last_activity_at()
```

**Returns**:

- `String` \- The last activity timestamp of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#daemon_version) daemon\_version()

[Section titled “daemon\_version()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#daemon_version)

```
def daemon_version()
```

**Returns**:

- `String` \- The version of the daemon running in the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#toolbox_proxy_url) toolbox\_proxy\_url()

[Section titled “toolbox\_proxy\_url()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#toolbox_proxy_url)

```
def toolbox_proxy_url()
```

**Returns**:

- `String` \- The toolbox proxy URL used to reach the sandbox’s toolbox API

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#config) config()

[Section titled “config()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#config)

```
def config()
```

**Returns**:

- `Daytona:Config`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#sandbox_api) sandbox\_api()

[Section titled “sandbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#sandbox_api)

```
def sandbox_api()
```

**Returns**:

- `DaytonaApiClient:SandboxApi`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#process) process()

[Section titled “process()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#process)

```
def process()
```

**Returns**:

- `Daytona:Process`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#fs) fs()

[Section titled “fs()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#fs)

```
def fs()
```

**Returns**:

- `Daytona:FileSystem`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#git) git()

[Section titled “git()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#git)

```
def git()
```

**Returns**:

- `Daytona:Git`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#computer_use) computer\_use()

[Section titled “computer\_use()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#computer_use)

```
def computer_use()
```

**Returns**:

- `Daytona:ComputerUse`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#code_interpreter) code\_interpreter()

[Section titled “code\_interpreter()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#code_interpreter)

```
def code_interpreter()
```

**Returns**:

- `Daytona:CodeInterpreter`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#archive) archive()

[Section titled “archive()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#archive)

```
def archive()
```

Archives the sandbox, making it inactive and preserving its state. When sandboxes are
archived, the entire filesystem state is moved to cost-effective object storage, making it
possible to keep sandboxes available for an extended period. The tradeoff between archived
and stopped states is that starting an archived sandbox takes more time, depending on its size.
Sandbox must be stopped before archiving.

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_archive_interval-1) auto\_archive\_interval=()

[Section titled “auto\_archive\_interval=()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_archive_interval-1)

```
def auto_archive_interval=(interval)
```

Sets the auto-archive interval for the Sandbox.
The Sandbox will automatically archive after being continuously stopped for the specified interval.

**Parameters**:

- `interval` _Integer_ -

**Returns**:

- `Integer`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_delete_interval-1) auto\_delete\_interval=()

[Section titled “auto\_delete\_interval=()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_delete_interval-1)

```
def auto_delete_interval=(interval)
```

Sets the auto-delete interval for the Sandbox.
The Sandbox will automatically delete after being continuously stopped for the specified interval.

**Parameters**:

- `interval` _Integer_ -

**Returns**:

- `Integer`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#update_network_settings) update\_network\_settings()

[Section titled “update\_network\_settings()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#update_network_settings)

```
def update_network_settings(network_block_all: nil, network_allow_list: nil, domain_allow_list: nil)
```

Updates outbound network policy on the runner (block all, restore access, or CIDR allow list).

**Parameters**:

- `network_block_all` _Boolean, nil_ -
- `network_allow_list` _String, nil_ -
- `domain_allow_list` _String, nil_ -

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#update_secrets) update\_secrets()

[Section titled “update\_secrets()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#update_secrets)

```
def update_secrets(secrets)
```

Replaces the set of organization vault secrets mounted in the Sandbox. Pass an empty
hash to detach all secrets. Rotated, attached or detached secrets take effect for
outbound requests within seconds. New environment variables are only visible to
processes spawned after the update; a Sandbox created without any secrets must be
restarted for newly attached secrets to work.

**Parameters**:

- `secrets` _Hash<String, String>_ \- Mapping of environment variable name to
organization vault secret name

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` -

**Examples:**

```
sandbox.update_secrets({ 'API_KEY' => 'my-vault-secret' })
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_stop_interval-1) auto\_stop\_interval=()

[Section titled “auto\_stop\_interval=()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_stop_interval-1)

```
def auto_stop_interval=(interval)
```

Sets the auto-stop interval for the Sandbox.
The Sandbox will automatically stop after being idle (no new events) for the specified interval.
Events include any state changes or interactions with the Sandbox through the SDK.
Interactions using Sandbox Previews are not included.

**Parameters**:

- `interval` _Integer_ -

**Returns**:

- `Integer`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#auto_pause_interval-1) auto\_pause\_interval=()

[Section titled “auto\_pause\_interval=()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#auto_pause_interval-1)

```
def auto_pause_interval=(interval)
```

Sets the auto-pause interval for the Sandbox.
The Sandbox will automatically pause after being idle (no new events) for the specified interval.
Events include any state changes or interactions with the Sandbox through the SDK.
Interactions using Sandbox Previews are not included.

**Parameters**:

- `interval` _Integer_ -

**Returns**:

- `Integer`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#ttl_minutes) ttl\_minutes=()

[Section titled “ttl\_minutes=()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#ttl_minutes)

```
def ttl_minutes=(minutes)
```

Sets the TTL (time to live) for the Sandbox.
The TTL is re-anchored from the current time. When it elapses the Sandbox is destroyed,
regardless of its current state. Use 0 to disable.

**Parameters**:

- `minutes` _Integer_ -

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#create_ssh_access) create\_ssh\_access()

[Section titled “create\_ssh\_access()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#create_ssh_access)

```
def create_ssh_access(expires_in_minutes)
```

Creates an SSH access token for the sandbox.

**Parameters**:

- `expires_in_minutes` _Integer_ \- TThe number of minutes the SSH access token will be valid for

**Returns**:

- `DaytonaApiClient:SshAccessDto`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#delete)

```
def delete(timeout = DEFAULT_TIMEOUT, wait: false)
```

Deletes the Sandbox.

By default returns as soon as the deletion request is accepted (matching
origin/main behavior). Pass +wait: true+ to block until the Sandbox
reaches the +destroyed+ state.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).
Only meaningful when +wait+ is true.
- `wait` _Boolean_ \- When +true+, block until the Sandbox is destroyed.

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#get_user_home_dir) get\_user\_home\_dir()

[Section titled “get\_user\_home\_dir()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#get_user_home_dir)

```
def get_user_home_dir()
```

Gets the user’s home directory path for the logged in user inside the Sandbox.

**Returns**:

- `String` \- The absolute path to the Sandbox user’s home directory for the logged in user

**Examples:**

```
user_home_dir = sandbox.get_user_home_dir

puts "Sandbox user home: #{user_home_dir}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#get_work_dir) get\_work\_dir()

[Section titled “get\_work\_dir()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#get_work_dir)

```
def get_work_dir()
```

Gets the working directory path inside the Sandbox.

**Returns**:

- `String` \- The absolute path to the Sandbox working directory. Uses the WORKDIR specified
in the Dockerfile if present, or falling back to the user’s home directory if not.

**Examples:**

```
work_dir = sandbox.get_work_dir

puts "Sandbox working directory: #{work_dir}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#update_env) update\_env()

[Section titled “update\_env()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#update_env)

```
def update_env(env: nil, unset: nil)
```

Updates the Sandbox daemon’s process environment. Newly spawned processes, sessions
and PTYs inherit the change; already-running processes keep their existing environment.

**Parameters**:

- `env` _Hash<String, String>, nil_ \- Env vars to set in the daemon’s process environment
- `unset` _Array<String>, nil_ \- Environment variable names to remove

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` -

**Examples:**

```
sandbox.update_env(env: { 'FOO' => 'bar' }, unset: ['OLD_VAR'])
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#get_metrics_latest) get\_metrics\_latest()

[Section titled “get\_metrics\_latest()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#get_metrics_latest)

```
def get_metrics_latest()
```

Gets the most recent resource usage sample directly from the Sandbox daemon.

Unlike #get\_metrics, which returns aggregated historical samples, this returns the
single current reading without going through the telemetry backend.

**Returns**:

- `Daytona:SandboxMetrics`

**Examples:**

```
m = sandbox.get_metrics_latest

puts "CPU used: #{m.cpu_used_pct}%"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#get_metrics) get\_metrics()

[Section titled “get\_metrics()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#get_metrics)

```
def get_metrics(start_time = nil, end_time = nil)
```

Gets historical time-series resource usage metrics for the Sandbox.

**Parameters**:

- `start_time` _Time, nil_ \- Start of the range. Defaults to the Sandbox creation time.
- `end_time` _Time, nil_ \- End of the range. Defaults to the current time.

**Returns**:

- `Array\<Daytona:SandboxMetrics\>` \- Time-ordered usage samples.

**Examples:**

```
sandbox.get_metrics.each { |m| puts "#{m.timestamp}: #{m.cpu_used_pct}%" }
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#labels-1) labels=()

[Section titled “labels=()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#labels-1)

```
def labels=(labels)
```

Sets labels for the Sandbox.

**Parameters**:

- `labels` _Hash<String, String>_ -

**Returns**:

- `Hash\<String, String\>`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#preview_url) preview\_url()

[Section titled “preview\_url()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#preview_url)

```
def preview_url(port)
```

Retrieves the preview link for the sandbox at the specified port. If the port is closed,
it will be opened automatically. For private sandboxes, a token is included to grant access
to the URL.

**Parameters**:

- `port` _Integer_ -

**Returns**:

- `DaytonaApiClient:PortPreviewUrl`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#download_url) download\_url()

[Section titled “download\_url()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#download_url)

```
def download_url(path, ttl_seconds: nil)
```

Creates a pre-signed URL for downloading a file from the Sandbox.

The URL works with any HTTP client without auth headers and stays valid across
sandbox restarts (downloads succeed only while the sandbox is running). The signing
key is cached locally for up to 15 seconds; if the key was rotated from another
client, URLs may be rejected until the cache refreshes.

**Parameters**:

- `path` _String_ \- Path to the file in the Sandbox.
- `ttl_seconds` _Integer, nil_ \- How long the URL stays valid, in seconds.
Defaults to 3600. Zero or negative means the URL never expires.

**Returns**:

- `String` \- Pre-signed download URL.

**Raises**:

- `Daytona:Sdk:Error` \- if the signing key cannot be fetched.

**Examples:**

```
url = sandbox.download_url('/home/user/report.pdf')

# curl "$url" -o report.pdf
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#upload_url) upload\_url()

[Section titled “upload\_url()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#upload_url)

```
def upload_url(path, ttl_seconds: nil)
```

Creates a pre-signed URL for uploading a file to the Sandbox.

Send a POST request with the file as multipart/form-data. The URL works with any
HTTP client without auth headers. The signing key is cached locally for up to
15 seconds; if the key was rotated from another client, URLs may be rejected
until the cache refreshes.

**Parameters**:

- `path` _String_ \- Destination path for the uploaded file in the Sandbox.
- `ttl_seconds` _Integer, nil_ \- How long the URL stays valid, in seconds.
Defaults to 3600. Zero or negative means the URL never expires.

**Returns**:

- `String` \- Pre-signed upload URL.

**Raises**:

- `Daytona:Sdk:Error` \- if the signing key cannot be fetched.

**Examples:**

```
url = sandbox.upload_url('/home/user/data.bin')

# curl -X POST -F "file=@local.bin" "$url"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#rotate_signing_key) rotate\_signing\_key()

[Section titled “rotate\_signing\_key()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#rotate_signing_key)

```
def rotate_signing_key()
```

Rotates the sandbox signing key, invalidating all previously signed URLs.

**Returns**:

- `void`

**Raises**:

- `DaytonaApiClient:ApiError` \- if the signing key rotation request fails.

**Examples:**

```
sandbox.rotate_signing_key

puts 'All previously signed URLs are now invalid.'
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#create_signed_preview_url) create\_signed\_preview\_url()

[Section titled “create\_signed\_preview\_url()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#create_signed_preview_url)

```
def create_signed_preview_url(port, expires_in_seconds = nil)
```

Creates a signed preview URL for the sandbox at the specified port.

**Parameters**:

- `port` _Integer_ \- The port to open the preview link on
- `expires_in_seconds` _Integer, nil_ \- The number of seconds the signed preview URL
will be valid for. Defaults to 60 seconds.

**Returns**:

- `DaytonaApiClient:SignedPortPreviewUrl` \- The signed preview URL response object

**Examples:**

```
signed_url = sandbox.create_signed_preview_url(3000, 120)

puts "Signed URL: #{signed_url.url}"

puts "Token: #{signed_url.token}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#expire_signed_preview_url) expire\_signed\_preview\_url()

[Section titled “expire\_signed\_preview\_url()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#expire_signed_preview_url)

```
def expire_signed_preview_url(port, token)
```

Expires a signed preview URL for the sandbox at the specified port.

**Parameters**:

- `port` _Integer_ \- The port to expire the signed preview URL on
- `token` _String_ \- The token to expire

**Returns**:

- `void`

**Examples:**

```
sandbox.expire_signed_preview_url(3000, "token-value")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#refresh) refresh()

[Section titled “refresh()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#refresh)

```
def refresh()
```

Refresh the Sandbox data from the API.

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#refresh_activity) refresh\_activity()

[Section titled “refresh\_activity()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#refresh_activity)

```
def refresh_activity()
```

Refreshes the sandbox activity to reset the timer for automated lifecycle management actions.

This method updates the sandbox’s last activity timestamp without changing its state.
It is useful for keeping long-running sessions alive while there is still user activity.

**Returns**:

- `void`

**Examples:**

```
sandbox.refresh_activity
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#revoke_ssh_access) revoke\_ssh\_access()

[Section titled “revoke\_ssh\_access()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#revoke_ssh_access)

```
def revoke_ssh_access(token)
```

Revokes an SSH access token for the sandbox.

**Parameters**:

- `token` _String_ -

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#start) start()

[Section titled “start()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#start)

```
def start(timeout = DEFAULT_TIMEOUT)
```

Starts the Sandbox and waits for it to be ready.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#recover) recover()

[Section titled “recover()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#recover)

```
def recover(timeout = DEFAULT_TIMEOUT)
```

Recovers the Sandbox from a recoverable error and waits for it to be ready.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).

**Returns**:

- `void`

**Examples:**

```
sandbox = daytona.get('my-sandbox-id')

sandbox.recover(timeout: 40)  # Wait up to 40 seconds

puts 'Sandbox recovered successfully'
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#stop) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#stop)

```
def stop(timeout = DEFAULT_TIMEOUT, force: false)
```

Stops the Sandbox and waits for it to be stopped.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).
- `force` _Boolean_ \- If true, uses SIGKILL instead of SIGTERM (defaults to false).

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#resize) resize()

[Section titled “resize()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#resize)

```
def resize(resources, timeout = DEFAULT_TIMEOUT)
```

Resizes the Sandbox resources.

Changes the CPU, memory, or disk allocation. Resizing a started sandbox accepts
only CPU and memory increases. Disk resize requires a stopped sandbox; disk can
only grow. GPU is not resizable — to change GPU, create a new sandbox.

**Parameters**:

- `resources` _Daytona:Resources_ \- New resource configuration (cpu, memory, disk only)
- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s)

**Returns**:

- `void`

**Raises**:

- `Sdk:Error` \- If resources.gpu or resources.gpu\_type is set

**Examples:**

```
sandbox.resize(Daytona::Resources.new(cpu: 4, memory: 8))
```

```
sandbox.stop

sandbox.resize(Daytona::Resources.new(cpu: 2, memory: 4, disk: 30))
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#wait_for_resize_complete) wait\_for\_resize\_complete()

[Section titled “wait\_for\_resize\_complete()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#wait_for_resize_complete)

```
def wait_for_resize_complete(timeout = DEFAULT_TIMEOUT)
```

Waits for the Sandbox resize operation to complete.
Polls the Sandbox status until the state is no longer ‘resizing’.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s)

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#create_lsp_server) create\_lsp\_server()

[Section titled “create\_lsp\_server()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#create_lsp_server)

```
def create_lsp_server(language_id:, path_to_project:)
```

Creates a new Language Server Protocol (LSP) server instance.
The LSP server provides language-specific features like code completion,
diagnostics, and more.

**Parameters**:

- `language_id` _Symbol_ \- The language server type (e.g., Daytona::LspServer::Language::PYTHON)
- `path_to_project` _String_ \- Path to the project root directory. Relative paths are resolved
based on the sandbox working directory.

**Returns**:

- `Daytona:LspServer`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#validate_ssh_access) validate\_ssh\_access()

[Section titled “validate\_ssh\_access()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#validate_ssh_access)

```
def validate_ssh_access(token)
```

Validates an SSH access token for the sandbox.

**Parameters**:

- `token` _String_ -

**Returns**:

- `DaytonaApiClient:SshAccessValidationDto`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#wait_for_sandbox_start) wait\_for\_sandbox\_start()

[Section titled “wait\_for\_sandbox\_start()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#wait_for_sandbox_start)

```
def wait_for_sandbox_start(timeout = DEFAULT_TIMEOUT)
```

Waits for the Sandbox to reach the ‘started’ state. Polls the Sandbox status until it
reaches the ‘started’ state or encounters an error.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#wait_for_sandbox_stop) wait\_for\_sandbox\_stop()

[Section titled “wait\_for\_sandbox\_stop()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#wait_for_sandbox_stop)

```
def wait_for_sandbox_stop(timeout = DEFAULT_TIMEOUT)
```

Waits for the Sandbox to reach the ‘stopped’ state. Polls the Sandbox status until it
reaches the ‘stopped’ state or encounters an error.
Treats destroyed as stopped to cover ephemeral sandboxes that are automatically deleted after stopping.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#fork) fork()

[Section titled “fork()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#fork)

```
def fork(name: nil, timeout: DEFAULT_TIMEOUT)
```

Forks the Sandbox, creating a new Sandbox with an identical filesystem.
The forked Sandbox is a copy-on-write clone of the original. It starts
with the same disk contents but operates independently from that point on.

**Parameters**:

- `name` _String, nil_ \- Optional name for the forked Sandbox
- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s)

**Returns**:

- `Daytona:Sandbox` \- The forked Sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#create_snapshot) create\_snapshot()

[Section titled “create\_snapshot()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#create_snapshot)

```
def create_snapshot(name:, timeout: DEFAULT_TIMEOUT)
```

Creates a snapshot from the current state of the Sandbox.
The Sandbox will temporarily enter a ‘snapshotting’ state and return to its previous state when complete.

**Parameters**:

- `name` _String_ \- Name for the new snapshot
- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s)

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#experimental_fork) experimental\_fork()

[Section titled “experimental\_fork()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#experimental_fork)

```
def experimental_fork(name: nil, timeout: DEFAULT_TIMEOUT)
```

Deprecated: Use +fork+ instead. This method will be removed in a future version.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#experimental_create_snapshot) experimental\_create\_snapshot()

[Section titled “experimental\_create\_snapshot()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#experimental_create_snapshot)

```
def experimental_create_snapshot(name:, timeout: DEFAULT_TIMEOUT)
```

Deprecated: Use +create\_snapshot+ instead. This method will be removed in a future version.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/sandbox/\#pause) pause()

[Section titled “pause()”](https://www.daytona.io/docs/en/ruby-sdk/sandbox/#pause)

```
def pause(timeout: DEFAULT_TIMEOUT)
```

Pauses the Sandbox, freezing all running processes.
Completes when the Sandbox has left the +pausing+ state (paused, stopped,
archived, etc.); error states still raise.

**Parameters**:

- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s)

**Returns**:

- `void`