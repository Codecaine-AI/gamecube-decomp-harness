---
url: "https://www.daytona.io/docs/en/ruby-sdk/snapshot/"
title: "SnapshotService | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/snapshot.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#snapshotservice) SnapshotService

[Section titled “SnapshotService”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#snapshotservice)

SnapshotService class for Daytona SDK.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#new-snapshotservice) new SnapshotService()

[Section titled “new SnapshotService()”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#new-snapshotservice)

```
def initialize(snapshots_api:, object_storage_api:, default_region_id: nil, otel_state: nil)
```

**Parameters**:

- `snapshots_api` _DaytonaApiClient:SnapshotsApi_ \- The snapshots API client
- `object_storage_api` _DaytonaApiClient:ObjectStorageApi_ \- The object storage API client
- `default_region_id` _String, nil_ \- Default region ID for snapshot creation
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `SnapshotService` \- a new instance of SnapshotService

### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#list)

```
def list(page: nil, limit: nil)
```

List all Snapshots.

**Parameters**:

- `page` _Integer, Nil_ -
- `limit` _Integer, Nil_ -

**Returns**:

- `Daytona:PaginatedResource` \- Paginated list of all Snapshots

**Raises**:

- `Daytona:Sdk:Error` -

**Examples:**

```
daytona = Daytona::Daytona.new

page = daytona.snapshot.list(page: 2, limit: 10)

puts "Page #{page.page} of #{page.total_pages} (#{page.total} snapshots total)"

page.items.each { |snapshot| puts "#{snapshot.name} (#{snapshot.image_name})" }
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#delete)

```
def delete(snapshot)
```

Delete a Snapshot.

**Parameters**:

- `snapshot` _Daytona:Snapshot_ \- Snapshot to delete

**Returns**:

- `void`

**Examples:**

```
daytona = Daytona::Daytona.new

snapshot = daytona.snapshot.get("demo")

daytona.snapshot.delete(snapshot)

puts "Snapshot deleted"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#get)

```
def get(name)
```

Get a Snapshot by name.

**Parameters**:

- `name` _String_ \- Name of the Snapshot to get

**Returns**:

- `Daytona:Snapshot` \- The Snapshot object

**Examples:**

```
daytona = Daytona::Daytona.new

snapshot = daytona.snapshot.get("demo")

puts "#{snapshot.name} (#{snapshot.image_name})"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#create)

```
def create(params, on_logs: nil)
```

Creates and registers a new snapshot from the given Image definition.

**Parameters**:

- `params` _Daytona:CreateSnapshotParams_ \- Parameters for snapshot creation
- `on_logs` _Proc, Nil_ \- Callback proc handling snapshot creation logs

**Returns**:

- `Daytona:Snapshot` \- The created snapshot

**Examples:**

```
image = Image.debianSlim('3.12').pipInstall('numpy')

params = CreateSnapshotParams.new(name: 'my-snapshot', image: image)

snapshot = daytona.snapshot.create(params) do |chunk|

  print chunk

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/snapshot/\#activate) activate()

[Section titled “activate()”](https://www.daytona.io/docs/en/ruby-sdk/snapshot/#activate)

```
def activate(snapshot)
```

Activate a snapshot

**Parameters**:

- `snapshot` _Daytona:Snapshot_ \- The snapshot instance

**Returns**:

- `Daytona:Snapshot`