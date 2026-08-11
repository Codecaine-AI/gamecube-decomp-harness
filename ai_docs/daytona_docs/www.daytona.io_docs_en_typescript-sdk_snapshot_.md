---
url: "https://www.daytona.io/docs/en/typescript-sdk/snapshot/"
title: "Snapshot | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/snapshot.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#snapshotservice) SnapshotService

[Section titled “SnapshotService”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#snapshotservice)

Service for managing Daytona Snapshots. Can be used to list, get, create and delete Snapshots.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#new-snapshotservice) new SnapshotService()

[Section titled “new SnapshotService()”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#new-snapshotservice)

```
new SnapshotService(

   clientConfig: Configuration,

   snapshotsApi: SnapshotsApi,

   objectStorageApi: ObjectStorageApi,

   defaultRegionId?: string): SnapshotService
```

**Parameters**:

- `clientConfig` _Configuration_
- `snapshotsApi` _SnapshotsApi_
- `objectStorageApi` _ObjectStorageApi_
- `defaultRegionId?` _string_

**Returns**:

- `SnapshotService`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#activate) activate()

[Section titled “activate()”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#activate)

```
activate(snapshot: Snapshot): Promise<Snapshot>
```

Activates a snapshot.

**Parameters**:

- `snapshot` _Snapshot_ \- Snapshot to activate

**Returns**:

- `Promise<Snapshot>` \- The activated Snapshot instance

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#create)

```
create(params: CreateSnapshotParams, options: {

  onLogs: (chunk: string) => void;

  timeout: number;

}): Promise<Snapshot>
```

Creates and registers a new snapshot from the given Image definition.

**Parameters**:

- `params` _CreateSnapshotParams_ \- Parameters for snapshot creation.
- `options` _Options for the create operation._
- `onLogs?` _(chunk: string) => void_ \- This callback function handles snapshot creation logs.
- `timeout?` _number_ \- Default is no timeout. Timeout in seconds (0 means no timeout).

**Returns**:

- `Promise<Snapshot>`

**Example:**

```
const image = Image.debianSlim('3.12').pipInstall('numpy');

await daytona.snapshot.create({ name: 'my-snapshot', image: image }, { onLogs: console.log });
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#delete)

```
delete(snapshot: Snapshot): Promise<void>
```

Deletes a Snapshot.

**Parameters**:

- `snapshot` _Snapshot_ \- Snapshot to delete

**Returns**:

- `Promise<void>`

**Throws**:

If the Snapshot does not exist or cannot be deleted

**Example:**

```
const daytona = new Daytona();

const snapshot = await daytona.snapshot.get("snapshot-name");

await daytona.snapshot.delete(snapshot);

console.log("Snapshot deleted successfully");
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#get)

```
get(name: string): Promise<Snapshot>
```

Gets a Snapshot by its name.

**Parameters**:

- `name` _string_ \- Name of the Snapshot to retrieve

**Returns**:

- `Promise<Snapshot>` \- The requested Snapshot

**Throws**:

If the Snapshot does not exist or cannot be accessed

**Example:**

```
const daytona = new Daytona();

const snapshot = await daytona.snapshot.get("snapshot-name");

console.log(`Snapshot ${snapshot.name} is in state ${snapshot.state}`);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#list)

```
list(page?: number, limit?: number): Promise<PaginatedSnapshots>
```

List paginated list of Snapshots.

**Parameters**:

- `page?` _number_ \- Page number for pagination (starting from 1)
- `limit?` _number_ \- Maximum number of items per page

**Returns**:

- `Promise<PaginatedSnapshots>` \- Paginated list of Snapshots

**Example:**

```
const daytona = new Daytona();

const { items, total, page: currentPage, totalPages } = await daytona.snapshot.list(2, 10);

console.log(`Page ${currentPage} of ${totalPages} (${total} snapshots total)`);

items.forEach(snapshot => console.log(`${snapshot.name} (${snapshot.imageName})`));
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#paginatedsnapshots) PaginatedSnapshots

[Section titled “PaginatedSnapshots”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#paginatedsnapshots)

Represents a paginated list of Daytona Snapshots.

**Properties**:

- `items` _Snapshot\[\]_ \- List of Snapshot instances in the current page.

- `page` _number_ \- Current page number.
  - _Inherited from_: `PaginatedSnapshotsDto.page`
- `total` _number_ \- Total number of Snapshots across all pages.
  - _Inherited from_: `PaginatedSnapshotsDto.total`
- `totalPages` _number_ \- Total number of pages available.
  - _Inherited from_: `PaginatedSnapshotsDto.totalPages`

**Extends:**

- `Omit`<`PaginatedSnapshotsDto`, `"items"`>

## [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#createsnapshotparams) CreateSnapshotParams

[Section titled “CreateSnapshotParams”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#createsnapshotparams)

```
type CreateSnapshotParams = {

  entrypoint: string[];

  image: string | Image;

  name: string;

  regionId: string;

  resources: Resources;

  sandboxClass: SandboxClass;

};
```

Parameters for creating a new snapshot.

**Type declaration**:

- `entrypoint?` _string\[\]_
- `image` _string \| Image_
- `name` _string_
- `regionId?` _string_
- `resources?` _Resources_
- `sandboxClass?` _SandboxClass_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/snapshot/\#snapshot) Snapshot

[Section titled “Snapshot”](https://www.daytona.io/docs/en/typescript-sdk/snapshot/#snapshot)

```
type Snapshot = SnapshotDto & {

  __brand: "Snapshot";

};
```

Represents a Daytona Snapshot which is a pre-configured sandbox.

**Type declaration**:

- `\_\_brand` _“Snapshot”_