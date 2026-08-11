---
url: "https://www.daytona.io/docs/en/typescript-sdk/volume/"
title: "Volume | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/volume/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/volume.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#volumeservice) VolumeService

[Section titled “VolumeService”](https://www.daytona.io/docs/en/typescript-sdk/volume/#volumeservice)

Service for managing Daytona Volumes.

This service provides methods to list, get, create, and delete Volumes.

Volumes can be mounted to Sandboxes with an optional subpath parameter to mount
only a specific S3 prefix within the volume. When no subpath is specified,
the entire volume is mounted.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/volume/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#new-volumeservice) new VolumeService()

[Section titled “new VolumeService()”](https://www.daytona.io/docs/en/typescript-sdk/volume/#new-volumeservice)

```
new VolumeService(volumesApi: VolumesApi): VolumeService
```

**Parameters**:

- `volumesApi` _VolumesApi_

**Returns**:

- `VolumeService`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/volume/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/typescript-sdk/volume/#create)

```
create(name: string): Promise<Volume>
```

Creates a new Volume with the specified name.

**Parameters**:

- `name` _string_ \- Name for the new Volume

**Returns**:

- `Promise<Volume>` \- The newly created Volume

**Throws**:

If the Volume cannot be created

**Example:**

```
const daytona = new Daytona();

const volume = await daytona.volume.create("my-data-volume");

console.log(`Created volume ${volume.name} with ID ${volume.id}`);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/typescript-sdk/volume/#delete)

```
delete(volume: Volume): Promise<void>
```

Deletes a Volume.

**Parameters**:

- `volume` _Volume_ \- Volume to delete

**Returns**:

- `Promise<void>`

**Throws**:

If the Volume does not exist or cannot be deleted

**Example:**

```
const daytona = new Daytona();

const volume = await daytona.volume.get("volume-name");

await daytona.volume.delete(volume);

console.log("Volume deleted successfully");
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/typescript-sdk/volume/#get)

```
get(name: string, create: boolean): Promise<Volume>
```

Gets a Volume by its name.

**Parameters**:

- `name` _string_ \- Name of the Volume to retrieve
- `create` _boolean = false_ \- Whether to create the Volume if it does not exist

**Returns**:

- `Promise<Volume>` \- The requested Volume

**Throws**:

If the Volume does not exist or cannot be accessed

**Example:**

```
const daytona = new Daytona();

const volume = await daytona.volume.get("volume-name", true);

console.log(`Volume ${volume.name} is in state ${volume.state}`);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/typescript-sdk/volume/#list)

```
list(): Promise<Volume[]>
```

Lists all available Volumes.

**Returns**:

- `Promise<Volume[]>` \- List of all Volumes accessible to the user

**Example:**

```
const daytona = new Daytona();

const volumes = await daytona.volume.list();

console.log(`Found ${volumes.length} volumes`);

volumes.forEach(vol => console.log(`${vol.name} (${vol.id})`));
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/volume/\#volume) Volume

[Section titled “Volume”](https://www.daytona.io/docs/en/typescript-sdk/volume/#volume)

```
type Volume = VolumeDto & {

  __brand: "Volume";

};
```

Represents a Daytona Volume which is a shared storage volume for Sandboxes.

**Type declaration**:

- `\_\_brand` _“Volume”_