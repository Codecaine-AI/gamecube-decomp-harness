---
url: "https://www.daytona.io/docs/en/java-sdk/snapshot/"
title: "SnapshotService | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/snapshot/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/snapshot.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#snapshotservice) SnapshotService

[Section titled “SnapshotService”](https://www.daytona.io/docs/en/java-sdk/snapshot/#snapshotservice)

Service for managing Daytona Snapshots.

Provides operations to create, list, retrieve, and delete snapshots.

### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/snapshot/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#create)

```
public Snapshot create(String name, String imageName)
```

Creates a snapshot from an existing image reference.

**Parameters**:

- `name` _String_ \- snapshot name
- `imageName` _String_ \- source image name or tag

**Returns**:

- `Snapshot` \- created `Snapshot`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the API request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#create-1) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#create-1)

```
public Snapshot create(String name, String imageName, SandboxClass sandboxClass)
```

Creates a snapshot from an existing image reference with a target sandbox class.

**Parameters**:

- `name` _String_ \- snapshot name
- `imageName` _String_ \- source image name or tag
- `sandboxClass` _SandboxClass_ \- target sandbox class; `null` for default

**Returns**:

- `Snapshot` \- created `Snapshot`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the API request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#create-2) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#create-2)

```
public Snapshot create(String name, Image image, Consumer<String> onLogs)
```

Creates a snapshot from a declarative `Image` with optional build log streaming.

**Parameters**:

- `name` _String_ \- snapshot name
- `image` _Image_ \- declarative image definition
- `onLogs` _Consumer<String>_ \- callback for build log lines; `null` to skip streaming

**Returns**:

- `Snapshot` \- created `Snapshot` in active or error state

**Throws**:

- `DaytonaException` \- if the API request fails or the build fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#create-3) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#create-3)

```
public Snapshot create(String name, Image image, io.daytona.sdk.model.Resources resources, Consumer<String> onLogs)
```

Creates a snapshot from a declarative `Image` with resources and optional build log streaming.

**Parameters**:

- `name` _String_ \- snapshot name
- `image` _Image_ \- declarative image definition
- `resources` _io.daytona.sdk.model.Resources_ \- CPU/GPU/memory/disk resources; `null` for defaults
- `onLogs` _Consumer<String>_ \- callback for build log lines; `null` to skip streaming

**Returns**:

- `Snapshot` \- created `Snapshot` in active or error state

**Throws**:

- `DaytonaException` \- if the API request fails or the build fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#create-4) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#create-4)

```
public Snapshot create(String name, Image image, io.daytona.sdk.model.Resources resources, SandboxClass sandboxClass, Consumer<String> onLogs)
```

Creates a snapshot from a declarative `Image` with resources, sandbox class, and optional build log streaming.

**Parameters**:

- `name` _String_ \- snapshot name
- `image` _Image_ \- declarative image definition
- `resources` _io.daytona.sdk.model.Resources_ \- CPU/GPU/memory/disk resources; `null` for defaults
- `sandboxClass` _SandboxClass_ \- target sandbox class; `null` for default
- `onLogs` _Consumer<String>_ \- callback for build log lines; `null` to skip streaming

**Returns**:

- `Snapshot` \- created `Snapshot` in active or error state

**Throws**:

- `DaytonaException` \- if the API request fails or the build fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#list)

```
public PaginatedSnapshots list(Integer page, Integer limit)
```

Lists snapshots with pagination.

```
try (Daytona daytona = new Daytona()) {

PaginatedSnapshots page = daytona.snapshot().list(2, 10);

System.out.printf("Page %d of %d (%d snapshots total)%n",

page.getPage(), page.getTotalPages(), page.getTotal());

for (var snapshot : page.getItems()) {

System.out.println(snapshot.getName() + " (" + snapshot.getImageName() + ")");

}

}
```

**Parameters**:

- `page` _Integer_ \- page number starting from 1; defaults to 1 when `null`
- `limit` _Integer_ \- maximum number of items per page; defaults to 10 when `null`

**Returns**:

- `PaginatedSnapshots` \- paginated snapshot result

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the API request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#get)

```
public Snapshot get(String nameOrId)
```

Retrieves a snapshot by name or ID.

**Parameters**:

- `nameOrId` _String_ \- snapshot name or identifier

**Returns**:

- `Snapshot` \- matching `Snapshot`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if no snapshot is found or request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/snapshot/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/java-sdk/snapshot/#delete)

```
public void delete(String id)
```

Deletes a snapshot by ID.

**Parameters**:

- `id` _String_ \- snapshot identifier

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if deletion fails