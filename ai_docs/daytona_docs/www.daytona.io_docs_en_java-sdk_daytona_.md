---
url: "https://www.daytona.io/docs/en/java-sdk/daytona/"
title: "Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/daytona/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/daytona.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#daytona) Daytona

[Section titled “Daytona”](https://www.daytona.io/docs/en/java-sdk/daytona/#daytona)

Main class for interacting with the Daytona API.

Provides methods to create, retrieve, and list Sandboxes, and exposes service accessors for
Snapshots and Volumes.

Implements `AutoCloseable` for deterministic HTTP resource cleanup.

**Properties**:

- `CODE_TOOLBOX_LANGUAGE_LABEL` _String_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/daytona/#constructors)

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#new-daytona) new Daytona()

[Section titled “new Daytona()”](https://www.daytona.io/docs/en/java-sdk/daytona/#new-daytona)

```
public Daytona()
```

Creates a client using environment variables.

Reads `DAYTONA_API_KEY`, `DAYTONA_API_URL`, and `DAYTONA_TARGET`.

**Throws**:

- `DaytonaException` \- if required authentication is missing

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#new-daytona-1) new Daytona()

[Section titled “new Daytona()”](https://www.daytona.io/docs/en/java-sdk/daytona/#new-daytona-1)

```
public Daytona(DaytonaConfig config)
```

Creates a client with explicit configuration.

**Parameters**:

- `config` _DaytonaConfig_ \- SDK configuration containing API key and endpoint settings

**Throws**:

- `DaytonaException` \- if configuration is invalid or missing credentials

### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/daytona/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/daytona/#create)

```
public Sandbox create()
```

Creates a Sandbox with default parameters and timeout.

**Returns**:

- `Sandbox` \- created and started `Sandbox`

**Throws**:

- `DaytonaException` \- if creation or startup fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#create-1) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/daytona/#create-1)

```
public Sandbox create(CreateSandboxFromSnapshotParams params)
```

Creates a Sandbox from snapshot-oriented parameters using default timeout.

**Parameters**:

- `params` _CreateSandboxFromSnapshotParams_ \- snapshot creation parameters

**Returns**:

- `Sandbox` \- created and started `Sandbox`

**Throws**:

- `DaytonaException` \- if creation or startup fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#create-2) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/daytona/#create-2)

```
public Sandbox create(CreateSandboxFromImageParams params)
```

Creates a Sandbox from image-oriented parameters using default timeout.

**Parameters**:

- `params` _CreateSandboxFromImageParams_ \- image creation parameters

**Returns**:

- `Sandbox` \- created and started `Sandbox`

**Throws**:

- `DaytonaException` \- if creation or startup fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#create-3) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/daytona/#create-3)

```
public Sandbox create(CreateSandboxFromSnapshotParams params, long timeoutSeconds)
```

Creates a Sandbox from snapshot parameters.

**Parameters**:

- `params` _CreateSandboxFromSnapshotParams_ \- snapshot creation parameters including env vars, labels, and lifecycle options
- `timeoutSeconds` _long_ \- maximum seconds to wait for the Sandbox to reach `started`

**Returns**:

- `Sandbox` \- created and started `Sandbox`

**Throws**:

- `DaytonaException` \- if creation fails or the Sandbox does not start in time

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#create-4) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/daytona/#create-4)

```
public Sandbox create(CreateSandboxFromImageParams params, long timeoutSeconds)
```

Creates a Sandbox from image parameters.

**Parameters**:

- `params` _CreateSandboxFromImageParams_ \- image creation parameters including image source and optional resources
- `timeoutSeconds` _long_ \- maximum seconds to wait for the Sandbox to reach `started`

**Returns**:

- `Sandbox` \- created and started `Sandbox`

**Throws**:

- `DaytonaException` \- if creation fails or the Sandbox does not start in time

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#create-5) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/daytona/#create-5)

```
public Sandbox create(CreateSandboxFromImageParams params, long timeoutSeconds, java.util.function.Consumer<String> onSnapshotCreateLogs)
```

Creates a new Sandbox from a declarative image with build log streaming.

**Parameters**:

- `params` _CreateSandboxFromImageParams_ \- creation parameters including the image definition
- `timeoutSeconds` _long_ \- maximum seconds to wait for the Sandbox to reach `started`
- `onSnapshotCreateLogs` _java.util.function.Consumer<String>_ \- callback for build log lines; `null` to skip streaming

**Returns**:

- `Sandbox` \- created and started `Sandbox`

**Throws**:

- `DaytonaException` \- if creation fails or the Sandbox does not start in time

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/java-sdk/daytona/#get)

```
public Sandbox get(String sandboxIdOrName)
```

Retrieves a Sandbox by ID or name.

**Parameters**:

- `sandboxIdOrName` _String_ \- Sandbox identifier or name

**Returns**:

- `Sandbox` \- resolved `Sandbox`

**Throws**:

- `DaytonaException` \- if the Sandbox is not found or request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/java-sdk/daytona/#list)

```
public Iterable<Sandbox> list()
```

Iterates over all Sandboxes (no filter, default sort).

Returns a lazily-paged `Iterable`; see `#list(ListSandboxesQuery)` for details
on partial hydration and Stream usage.

**Returns**:

- `Iterable\<Sandbox\>` \- iterable over Sandboxes

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#list-1) list()

[Section titled “list()”](https://www.daytona.io/docs/en/java-sdk/daytona/#list-1)

```
public Iterable<Sandbox> list(ListSandboxesQuery query)
```

Iterates over Sandboxes matching the given query.

The returned `Iterable` lazily fetches pages from the API as iteration proceeds.
Sandboxes are hydrated from the list endpoint, so fields marked “Not returned by
`Daytona.list`” on `Sandbox` (env, networkBlockAll, networkAllowList, volumes,
buildInfo, backupCreatedAt) remain `null` until `Sandbox#refreshData()` is called.
For a `Stream` variant see `#listStream(ListSandboxesQuery)`.

```
ListSandboxesQuery query = new ListSandboxesQuery();

query.setLabels(Map.of("env", "dev"));

for (Sandbox sandbox : daytona.list(query)) {

System.out.println(sandbox.getId());

}
```

**Parameters**:

- `query` _ListSandboxesQuery_ \- optional filters, sorting, and per-page size

**Returns**:

- `Iterable\<Sandbox\>` \- iterable over Sandboxes

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#liststream) listStream()

[Section titled “listStream()”](https://www.daytona.io/docs/en/java-sdk/daytona/#liststream)

```
public Stream<Sandbox> listStream()
```

Streams all Sandboxes (no filter, default sort).

The returned stream should be closed (use try-with-resources).

**Returns**:

- `Stream\<Sandbox\>` \- stream of Sandboxes

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#liststream-1) listStream()

[Section titled “listStream()”](https://www.daytona.io/docs/en/java-sdk/daytona/#liststream-1)

```
public Stream<Sandbox> listStream(ListSandboxesQuery query)
```

Streams Sandboxes matching the given query.

The returned stream should be closed (use try-with-resources).

```
try (Stream<Sandbox> stream = daytona.listStream(query)) {

stream.filter(sb -> "started".equals(sb.getState()))

.limit(5)

.forEach(sb -> System.out.println(sb.getId()));

}
```

**Parameters**:

- `query` _ListSandboxesQuery_ \- optional filters, sorting, and per-page size

**Returns**:

- `Stream\<Sandbox\>` \- stream of Sandboxes

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#snapshot) snapshot()

[Section titled “snapshot()”](https://www.daytona.io/docs/en/java-sdk/daytona/#snapshot)

```
public SnapshotService snapshot()
```

Returns Snapshot management service.

**Returns**:

- `SnapshotService` \- snapshot service instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#volume) volume()

[Section titled “volume()”](https://www.daytona.io/docs/en/java-sdk/daytona/#volume)

```
public VolumeService volume()
```

Returns Volume management service.

**Returns**:

- `VolumeService` \- volume service instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#secret) secret()

[Section titled “secret()”](https://www.daytona.io/docs/en/java-sdk/daytona/#secret)

```
public SecretService secret()
```

Returns Secret management service.

**Returns**:

- `SecretService` \- secret service instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/daytona/\#close) close()

[Section titled “close()”](https://www.daytona.io/docs/en/java-sdk/daytona/#close)

```
public void close()
```

Closes this client and releases underlying HTTP resources.