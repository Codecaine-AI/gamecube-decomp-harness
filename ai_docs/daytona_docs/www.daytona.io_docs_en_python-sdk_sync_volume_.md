---
url: "https://www.daytona.io/docs/en/python-sdk/sync/volume/"
title: "Volume | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/sync/volume/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/sync/volume.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volume) Volume

[Section titled “Volume”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volume)

```
class Volume(VolumeDto)
```

Represents a Daytona Volume which is a shared storage volume for Sandboxes.

**Attributes**:

- `id` _str_ \- Unique identifier for the Volume.
- `name` _str_ \- Name of the Volume.
- `organization_id` _str_ \- Organization ID of the Volume.
- `state` _str_ \- State of the Volume.
- `created_at` _str_ \- Date and time when the Volume was created.
- `updated_at` _str_ \- Date and time when the Volume was last updated.
- `last_used_at` _str_ \- Date and time when the Volume was last used.

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volumeservice) VolumeService

[Section titled “VolumeService”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volumeservice)

```
class VolumeService()
```

Service for managing Daytona Volumes. Can be used to list, get, create and delete Volumes.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volumeservicelist) VolumeService.list

[Section titled “VolumeService.list”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volumeservicelist)

```
def list() -> list[Volume]
```

List all Volumes.

**Returns**:

- `list[Volume]` \- List of all Volumes.

**Example**:

```
daytona = Daytona()

volumes = daytona.volume.list()

for volume in volumes:

    print(f"{volume.name} ({volume.id})")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volumeserviceget) VolumeService.get

[Section titled “VolumeService.get”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volumeserviceget)

```
@with_instrumentation()

def get(name: str, create: bool = False) -> Volume
```

Get a Volume by name.

**Arguments**:

- `name` _str_ \- Name of the Volume to get.
- `create` _bool_ \- If True, create a new Volume if it doesn’t exist.

**Returns**:

- `Volume` \- The Volume object.

**Example**:

```
daytona = Daytona()

volume = daytona.volume.get("test-volume-name", create=True)

print(f"{volume.name} ({volume.id})")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volumeservicecreate) VolumeService.create

[Section titled “VolumeService.create”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volumeservicecreate)

```
@with_instrumentation()

def create(name: str) -> Volume
```

Create a new Volume.

**Arguments**:

- `name` _str_ \- Name of the Volume to create.

**Returns**:

- `Volume` \- The Volume object.

**Example**:

```
daytona = Daytona()

volume = daytona.volume.create("test-volume")

print(f"{volume.name} ({volume.id}); state: {volume.state}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volumeservicedelete) VolumeService.delete

[Section titled “VolumeService.delete”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volumeservicedelete)

```
@with_instrumentation()

def delete(volume: Volume) -> None
```

Delete a Volume.

**Arguments**:

- `volume` _Volume_ \- Volume to delete.

**Example**:

```
daytona = Daytona()

volume = daytona.volume.get("test-volume")

daytona.volume.delete(volume)

print("Volume deleted")
```

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/volume/\#volumemount) VolumeMount

[Section titled “VolumeMount”](https://www.daytona.io/docs/en/python-sdk/sync/volume/#volumemount)

```
class VolumeMount(ApiVolumeMount, AsyncApiVolumeMount)
```

Represents a Volume mount configuration for a Sandbox.

**Attributes**:

- `volume_id` _str_ \- ID or name of the volume to mount.
- `mount_path` _str_ \- Path where the volume will be mounted in the sandbox.
- `subpath` _str \| None_ \- Optional S3 subpath/prefix within the volume to mount.
When specified, only this prefix will be accessible. When omitted,
the entire volume is mounted.