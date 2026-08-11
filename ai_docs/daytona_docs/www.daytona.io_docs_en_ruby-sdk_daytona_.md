---
url: "https://www.daytona.io/docs/en/ruby-sdk/daytona/"
title: "Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/daytona/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/daytona.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#daytona) Daytona

[Section titled “Daytona”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#daytona)

Daytona class for Daytona SDK.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#new-daytona) new Daytona()

[Section titled “new Daytona()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#new-daytona)

```
def initialize(config = Config.new)
```

**Parameters**:

- `config` _Daytona:Config_ \- Configuration options. Defaults to Daytona::Config.new

**Returns**:

- `Daytona` \- a new instance of Daytona

### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#config) config()

[Section titled “config()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#config)

```
def config()
```

**Returns**:

- `Daytona:Config`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#api_client) api\_client()

[Section titled “api\_client()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#api_client)

```
def api_client()
```

**Returns**:

- `DaytonaApiClient`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#sandbox_api) sandbox\_api()

[Section titled “sandbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#sandbox_api)

```
def sandbox_api()
```

**Returns**:

- `DaytonaApiClient:SandboxApi`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#volume) volume()

[Section titled “volume()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#volume)

```
def volume()
```

**Returns**:

- `Daytona:VolumeService`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#secret) secret()

[Section titled “secret()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#secret)

```
def secret()
```

**Returns**:

- `Daytona:SecretService`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#object_storage_api) object\_storage\_api()

[Section titled “object\_storage\_api()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#object_storage_api)

```
def object_storage_api()
```

**Returns**:

- `DaytonaApiClient:ObjectStorageApi`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#snapshots_api) snapshots\_api()

[Section titled “snapshots\_api()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#snapshots_api)

```
def snapshots_api()
```

**Returns**:

- `DaytonaApiClient:SnapshotsApi`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#snapshot) snapshot()

[Section titled “snapshot()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#snapshot)

```
def snapshot()
```

**Returns**:

- `Daytona:SnapshotService`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#close) close()

[Section titled “close()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#close)

```
def close()
```

Shuts down OTel providers, flushing any pending telemetry data.

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#create)

```
def create(params = nil, on_snapshot_create_logs: nil)
```

Creates a sandbox with the specified parameters

**Parameters**:

- `params` _Daytona:CreateSandboxFromSnapshotParams, Daytona:CreateSandboxFromImageParams, Nil_ \- Sandbox creation parameters

**Returns**:

- `Daytona:Sandbox` \- The created sandbox

**Raises**:

- `Daytona:Sdk:Error` \- If auto\_stop\_interval, auto\_pause\_interval, auto\_archive\_interval, or ttl\_minutes is negative,
or if auto\_stop\_interval and auto\_pause\_interval are both non-zero

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#delete)

```
def delete(sandbox, wait: false)
```

Deletes a Sandbox.

**Parameters**:

- `sandbox` _Daytona:Sandbox_ -
- `wait` _Boolean_ \- When +true+, block until the Sandbox is destroyed.

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#get)

```
def get(id)
```

Gets a Sandbox by its ID.

**Parameters**:

- `id` _String_ -

**Returns**:

- `Daytona:Sandbox`

**Raises**:

- `Daytona:Sdk:Error` -

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#list)

```
def list(query = nil)
```

Iterates over Sandboxes matching the given query.

**Parameters**:

- `query` _Daytona:ListSandboxesQuery, nil_ \- Optional filters, sorting, and per-page size.

**Returns**:

- `Enumerator\<Daytona:Sandbox\>`

**Raises**:

- `Daytona:Sdk:Error` -

**Examples:**

```
daytona.list(Daytona::ListSandboxesQuery.new(labels: { 'env' => 'dev' })).each do |sandbox|

  puts sandbox.id

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#start) start()

[Section titled “start()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#start)

```
def start(sandbox, timeout = Sandbox::DEFAULT_TIMEOUT)
```

Starts a Sandbox and waits for it to be ready.

**Parameters**:

- `sandbox` _Daytona:Sandbox_ -
- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/daytona/\#stop) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/ruby-sdk/daytona/#stop)

```
def stop(sandbox, timeout = Sandbox::DEFAULT_TIMEOUT)
```

Stops a Sandbox and waits for it to be stopped.

**Parameters**:

- `sandbox` _Daytona:Sandbox_ -
- `timeout` _Numeric_ \- Maximum wait time in seconds (defaults to 60 s).

**Returns**:

- `void`