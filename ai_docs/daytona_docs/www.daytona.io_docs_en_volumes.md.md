---
url: "https://www.daytona.io/docs/en/volumes.md"
title: undefined
---

# Volumes

Volumes are FUSE-based mounts that provide shared file access across Daytona sandboxes. They enable sandboxes to read from large files instantly - no need to upload files manually to each sandbox. Volume data is stored in an S3-compatible object store.

A sandbox reads and writes a mounted volume like any local directory, and the contents persist independently of the sandbox lifecycle. Use volumes to share datasets, model weights, build caches, or application state between sandboxes, scope per-user or per-tenant data with a `subpath`, and combine multiple volumes in the same sandbox at different mount paths.

- multiple volumes can be mounted to a single sandbox
- a single volume can be mounted to multiple sandboxes

## Create volumes

Create a volume.

For persistent per-user, per-tenant, or per-workspace storage, use one shared volume per use case, environment, or project (for example a volume for staging and another for production), and set a dedicated `subpath` when you create each sandbox. The sandbox sees only that prefix inside the volume; it cannot access sibling subpaths.

This is the default pattern we recommend because it:

- stays within the per-organization volume [limits](#pricing--limits)
- avoids mounting a separate volume for every user or sandbox
- continues to provide strong isolation at the mount boundary

1. Go to [Daytona Volumes ↗](https://app.daytona.io/dashboard/volumes)
2. Click the **Create Volume** button
3. Enter the volume name


```python
from daytona import Daytona

daytona = Daytona()
volume = daytona.volume.create("my-awesome-volume")
```


```typescript
import { Daytona } from "@daytona/sdk";

const daytona = new Daytona();
const volume = await daytona.volume.create("my-awesome-volume");
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
volume = daytona.volume.create("my-awesome-volume")
```


```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
)

func main() {
	client, err := daytona.NewClient()
	if err != nil {
		log.Fatal(err)
	}
	volume, err := client.Volume.Create(context.Background(), "my-awesome-volume")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Volume ID: %s\n", volume.ID)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.model.Volume;

public class App {
    public static void main(String[] args) {
        try (Daytona daytona = new Daytona()) {
            Volume volume = daytona.volume().create("my-awesome-volume");
        }
    }
}
```


```shell
daytona volume create my-awesome-volume
```


```bash
curl 'https://app.daytona.io/api/volumes' \
  --request POST \
  --header 'Authorization: Bearer <API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "my-awesome-volume"
}'
```


## Wait for a volume to be ready

Wait until a newly created volume reaches the `ready` state before mounting it to a sandbox. Mounting a volume that is still provisioning returns an error.


```python
import time

from daytona import Daytona

daytona = Daytona()
volume = daytona.volume.create("my-awesome-volume")

while volume.state != "ready":
    time.sleep(1)
    volume = daytona.volume.get("my-awesome-volume")
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
let volume = await daytona.volume.create('my-awesome-volume')

while (volume.state !== 'ready') {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  volume = await daytona.volume.get('my-awesome-volume')
}
```


```go
import (
	"context"
	"log"
	"time"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
)

ctx := context.Background()
client, err := daytona.NewClient()
if err != nil {
	log.Fatal(err)
}

volume, err := client.Volume.Create(ctx, "my-awesome-volume")
if err != nil {
	log.Fatal(err)
}

volume, err = client.Volume.WaitForReady(ctx, volume, 2*time.Minute)
if err != nil {
	log.Fatal(err)
}
```


## Mount volumes

Mount a volume to a sandbox at sandbox creation time. 

For per-user or multi-tenant data, pass `subpath` so only the specified folder inside the volume is visible at `mount_path`. Mount the entire volume (omit `subpath`) when every sandbox that uses that volume should see the same tree. The volume must be in the `ready` state.

Volume mount paths must meet the following requirements:

- **Must be absolute paths**: mount paths must start with `/` (e.g., `/home/daytona/volume`)
- **Cannot be root directory**: cannot mount to `/` or `//`
- **No relative path components**: cannot contain `/../`, `/./`, or end with `/..` or `/.`
- **No consecutive slashes**: cannot contain multiple consecutive slashes like `//` (except at the beginning)
- **Cannot mount to system directories**: the following system directories are prohibited: `/proc`, `/sys`, `/dev`, `/boot`, `/etc`, `/bin`, `/sbin`, `/lib`, `/lib64`

When you set `subpath`, the value must meet the following requirements:

- **No leading slash**: subpaths are S3 key prefixes and must not start with `/`
- **No path traversal**: cannot contain `..`
- **No consecutive slashes**: cannot contain `//`


```python
from daytona import CreateSandboxFromSnapshotParams, Daytona, VolumeMount

daytona = Daytona()

# Create a new volume or get an existing one
volume = daytona.volume.get("my-awesome-volume", create=True)

mount_dir = "/home/daytona/volume"

# Recommended for per-user / per-tenant data: one volume, unique subpath per sandbox
params = CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[VolumeMount(volume_id=volume.id, mount_path=mount_dir, subpath="users/alice")],
)
sandbox = daytona.create(params)

# Entire volume at mount path (omit subpath) when all sandboxes should share the same tree
params_full = CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[VolumeMount(volume_id=volume.id, mount_path=mount_dir)],
)
sandbox_shared = daytona.create(params_full)
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const volume = await daytona.volume.get('my-awesome-volume', true)
const mountDir = '/home/daytona/volume'

// Recommended for per-user / per-tenant data: one volume, unique subpath per sandbox
const sandbox = await daytona.create({
  language: 'typescript',
  volumes: [
    { volumeId: volume.id, mountPath: mountDir, subpath: 'users/alice' },
  ],
})

// Entire volume at mount path (omit subpath) when all sandboxes should share the same tree
const sandboxShared = await daytona.create({
  language: 'typescript',
  volumes: [{ volumeId: volume.id, mountPath: mountDir }],
})
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
volume = daytona.volume.get('my-awesome-volume', create: true)
mount_dir = '/home/daytona/volume'

# Recommended for per-user / per-tenant data: one volume, unique subpath per sandbox
params = Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [DaytonaApiClient::SandboxVolume.new(
    volume_id: volume.id,
    mount_path: mount_dir,
    subpath: 'users/alice'
  )]
)
sandbox = daytona.create(params)

# Entire volume at mount path (omit subpath) when all sandboxes should share the same tree
params_shared = Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [DaytonaApiClient::SandboxVolume.new(volume_id: volume.id, mount_path: mount_dir)]
)
sandbox_shared = daytona.create(params_shared)
```


```go
import (
	"context"
	"log"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

client, err := daytona.NewClient()
if err != nil {
	log.Fatal(err)
}

// Create a new volume or get an existing one
volume, err := client.Volume.Get(context.Background(), "my-awesome-volume")
if err != nil {
	// If volume doesn't exist, create it
	volume, err = client.Volume.Create(context.Background(), "my-awesome-volume")
	if err != nil {
		log.Fatal(err)
	}
}

mountDir := "/home/daytona/volume"

// Recommended for per-user / per-tenant data: one volume, unique subpath per sandbox
subpath := "users/alice"
sandbox, err := client.Create(context.Background(), types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes: []types.VolumeMount{
			{VolumeID: volume.ID, MountPath: mountDir, Subpath: &subpath},
		},
	},
})
if err != nil {
	log.Fatal(err)
}

// Entire volume at mount path (omit Subpath) when all sandboxes should share the same tree
_, err = client.Create(context.Background(), types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes: []types.VolumeMount{
			{VolumeID: volume.ID, MountPath: mountDir},
		},
	},
})
if err != nil {
	log.Fatal(err)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.exception.DaytonaNotFoundException;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;
import io.daytona.sdk.model.Volume;
import io.daytona.sdk.model.VolumeMount;

import java.util.Collections;

public class App {
    public static void main(String[] args) {
        try (Daytona daytona = new Daytona()) {
            Volume volume;
            try {
                volume = daytona.volume().getByName("my-awesome-volume");
            } catch (DaytonaNotFoundException e) {
                volume = daytona.volume().create("my-awesome-volume");
            }

            String mountDir = "/home/daytona/volume";

            // io.daytona.sdk.model.VolumeMount has no subpath field; use the API for subpath mounts.
            // Mount the entire volume at mountPath:
            CreateSandboxFromSnapshotParams paramsFull = new CreateSandboxFromSnapshotParams();
            paramsFull.setLanguage("python");
            VolumeMount mountFull = new VolumeMount();
            mountFull.setVolumeId(volume.getId());
            mountFull.setMountPath(mountDir);
            paramsFull.setVolumes(Collections.singletonList(mountFull));
            Sandbox sandboxShared = daytona.create(paramsFull);
        }
    }
}
```


```shell
daytona volume create my-awesome-volume
daytona create --volume my-awesome-volume:/home/daytona/volume
```

The `--volume` flag accepts `VOLUME_ID_OR_NAME:MOUNT_PATH` only. For a **subpath** mount, use a [SDK](#mount-volumes) or the [API](#mount-volumes) and set `subpath` on the volume entry.


```bash
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Authorization: Bearer <API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
  "volumes": [
    {
      "volumeId": "<VOLUME_ID>",
      "mountPath": "/home/daytona/volume",
      "subpath": "users/alice"
    }
  ]
}'
```

Omit `subpath` to mount the full volume at `mountPath`.


## Work with volumes

Read from and write to a volume just like any other directory in the sandbox file system. Files written to the volume persist beyond the lifecycle of any individual sandbox.


```python
# Write to a file in the mounted volume using the Sandbox file system API
sandbox.fs.upload_file(b"Hello from Daytona volume!", "/home/daytona/volume/example.txt")

# When you're done with the sandbox, you can remove it
# The volume will persist even after the sandbox is removed
sandbox.delete()
```


```typescript
// Write to a file in the mounted volume using the Sandbox file system API
await sandbox.fs.uploadFile(
  Buffer.from('Hello from Daytona volume!'),
  '/home/daytona/volume/example.txt'
)

// When you're done with the sandbox, you can remove it
// The volume will persist even after the sandbox is removed
await daytona.delete(sandbox)
```


```ruby
# Write to a file in the mounted volume using the Sandbox file system API
sandbox.fs.upload_file('Hello from Daytona volume!', '/home/daytona/volume/example.txt')

# When you're done with the sandbox, you can remove it
# The volume will persist even after the sandbox is removed
daytona.delete(sandbox)
```


```go
import (
    "context"
    "log"
)

// Write to a file in the mounted volume
err := sandbox.FileSystem.UploadFile(context.Background(), []byte("Hello from Daytona volume!"), "/home/daytona/volume/example.txt")
if err != nil {
    log.Fatal(err)
}

// When you're done with the sandbox, you can remove it
// The volume will persist even after the sandbox is removed
err = sandbox.Delete(context.Background())
if err != nil {
	log.Fatal(err)
}
```


```java
import java.nio.charset.StandardCharsets;

// Write to a file in the mounted volume using the Sandbox file system API
sandbox.fs.uploadFile(
    "Hello from Daytona volume!".getBytes(StandardCharsets.UTF_8),
    "/home/daytona/volume/example.txt");

// When you're done with the sandbox, you can remove it
// The volume will persist even after the sandbox is removed
sandbox.delete();
```


## Get a volume by name

Get a volume by its name.


```python
daytona.volume.get("my-awesome-volume", create=True)
```


```typescript
await daytona.volume.get('my-awesome-volume', true)
```


```ruby
daytona.volume.get('my-awesome-volume', create: true)
```


```go
volume, err := client.Volume.Get(ctx, "my-awesome-volume")
```


```java
daytona.volume().getByName("my-awesome-volume");
```


```shell
daytona volume get my-awesome-volume
```


```bash
curl 'https://app.daytona.io/api/volumes/by-name/my-awesome-volume' \
  --header 'Authorization: Bearer <API_KEY>'
```


## Get a volume by ID

Get a volume by its ID.


```bash
curl 'https://app.daytona.io/api/volumes/<VOLUME_ID>' \
  --header 'Authorization: Bearer <API_KEY>'
```


## List volumes

List all volumes.


```python
daytona.volume.list()
```


```typescript
await daytona.volume.list()
```


```ruby
daytona.volume.list
```


```go
volumes, err := client.Volume.List(ctx)
```


```java
daytona.volume().list();
```


```shell
daytona volume list
```


```bash
curl 'https://app.daytona.io/api/volumes' \
  --header 'Authorization: Bearer <API_KEY>'
```


## Delete volumes

Delete a volume. Deletion is asynchronous: the volume moves through `pending_delete` and `deleting` before it is removed. Deleted volumes cannot be recovered.

A volume can be deleted only when it is in the `ready` or `error` state and is not mounted by any active sandbox. Attempting to delete a volume that is still in use returns a `409` error.


```python
daytona.volume.delete(volume)
```


```typescript
await daytona.volume.delete(volume)
```


```ruby
daytona.volume.delete(volume)
```


```go
err := client.Volume.Delete(ctx, volume)
```


```java
daytona.volume().delete(volume.getId());
```


```shell
daytona volume delete <VOLUME_ID_OR_NAME>
```


```bash
curl 'https://app.daytona.io/api/volumes/<VOLUME_ID>' \
  --request DELETE \
  --header 'Authorization: Bearer <API_KEY>'
```


## Share data between sandboxes

Share data across sandboxes by mounting the same volume in each one. 

A producer sandbox writes to the volume and is then deleted; a separately created consumer sandbox mounts the same volume by ID and reads the data. Volume contents persist independently of any individual sandbox.

Sandboxes that mount the same volume see writes immediately, but FUSE-backed volumes are not transactional. If two sandboxes write to the same path concurrently, the last write wins. Coordinate access in your application when ordering matters.


```python
from daytona import CreateSandboxFromSnapshotParams, Daytona, VolumeMount

daytona = Daytona()
volume = daytona.volume.get("shared-data", create=True)
mount_dir = "/home/daytona/volume"

# Producer: write data into the volume, then delete the sandbox
producer = daytona.create(CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[VolumeMount(volume_id=volume.id, mount_path=mount_dir)],
))
producer.fs.upload_file(b"shared payload", f"{mount_dir}/payload.bin")
producer.delete()

# Consumer: a separate sandbox mounts the same volume by ID and reads the data
consumer = daytona.create(CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[VolumeMount(volume_id=volume.id, mount_path=mount_dir)],
))
data = consumer.fs.download_file(f"{mount_dir}/payload.bin")
print(data.decode())
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const volume = await daytona.volume.get('shared-data', true)
const mountDir = '/home/daytona/volume'

// Producer: write data into the volume, then delete the sandbox
const producer = await daytona.create({
  language: 'typescript',
  volumes: [{ volumeId: volume.id, mountPath: mountDir }],
})
await producer.fs.uploadFile(Buffer.from('shared payload'), `${mountDir}/payload.bin`)
await daytona.delete(producer)

// Consumer: a separate sandbox mounts the same volume by ID and reads the data
const consumer = await daytona.create({
  language: 'typescript',
  volumes: [{ volumeId: volume.id, mountPath: mountDir }],
})
const data = await consumer.fs.downloadFile(`${mountDir}/payload.bin`)
console.log(data.toString())
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
volume = daytona.volume.get('shared-data', create: true)
mount_dir = '/home/daytona/volume'

mount = DaytonaApiClient::SandboxVolume.new(volume_id: volume.id, mount_path: mount_dir)

# Producer: write data into the volume, then delete the sandbox
producer = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [mount]
))
producer.fs.upload_file('shared payload', "#{mount_dir}/payload.bin")
daytona.delete(producer)

# Consumer: a separate sandbox mounts the same volume by ID and reads the data
consumer = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [mount]
))
data = consumer.fs.download_file("#{mount_dir}/payload.bin")
puts data
```


```go
import (
	"context"
	"fmt"
	"log"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

ctx := context.Background()
client, err := daytona.NewClient()
if err != nil {
	log.Fatal(err)
}

volume, err := client.Volume.Get(ctx, "shared-data")
if err != nil {
	volume, err = client.Volume.Create(ctx, "shared-data")
	if err != nil {
		log.Fatal(err)
	}
}

mountDir := "/home/daytona/volume"
mount := types.VolumeMount{VolumeID: volume.ID, MountPath: mountDir}

// Producer: write data into the volume, then delete the sandbox
producer, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes:  []types.VolumeMount{mount},
	},
})
if err != nil {
	log.Fatal(err)
}
if err := producer.FileSystem.UploadFile(ctx, []byte("shared payload"), mountDir+"/payload.bin"); err != nil {
	log.Fatal(err)
}
if err := producer.Delete(ctx); err != nil {
	log.Fatal(err)
}

// Consumer: a separate sandbox mounts the same volume by ID and reads the data
consumer, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes:  []types.VolumeMount{mount},
	},
})
if err != nil {
	log.Fatal(err)
}
data, err := consumer.FileSystem.DownloadFile(ctx, mountDir+"/payload.bin", nil)
if err != nil {
	log.Fatal(err)
}
fmt.Println(string(data))
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.exception.DaytonaNotFoundException;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;
import io.daytona.sdk.model.Volume;
import io.daytona.sdk.model.VolumeMount;

import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class App {
    public static void main(String[] args) {
        try (Daytona daytona = new Daytona()) {
            Volume volume;
            try {
                volume = daytona.volume().getByName("shared-data");
            } catch (DaytonaNotFoundException e) {
                volume = daytona.volume().create("shared-data");
            }

            String mountDir = "/home/daytona/volume";

            VolumeMount mount = new VolumeMount();
            mount.setVolumeId(volume.getId());
            mount.setMountPath(mountDir);

            // Producer: write data into the volume, then delete the sandbox
            CreateSandboxFromSnapshotParams producerParams = new CreateSandboxFromSnapshotParams();
            producerParams.setLanguage("python");
            producerParams.setVolumes(Collections.singletonList(mount));
            Sandbox producer = daytona.create(producerParams);
            producer.fs.uploadFile(
                "shared payload".getBytes(StandardCharsets.UTF_8),
                mountDir + "/payload.bin");
            producer.delete();

            // Consumer: a separate sandbox mounts the same volume by ID and reads the data
            CreateSandboxFromSnapshotParams consumerParams = new CreateSandboxFromSnapshotParams();
            consumerParams.setLanguage("python");
            consumerParams.setVolumes(Collections.singletonList(mount));
            Sandbox consumer = daytona.create(consumerParams);
            byte[] data = consumer.fs.downloadFile(mountDir + "/payload.bin");
            System.out.println(new String(data, StandardCharsets.UTF_8));
        }
    }
}
```


## Mount multiple volumes to one sandbox

Mount more than one volume to a single sandbox by passing entries in the `volumes` list. Use this pattern to combine shared assets, models, or datasets in one volume with separate per-application or per-user state in another, exposed at distinct mount paths.


```python
from daytona import CreateSandboxFromSnapshotParams, Daytona, VolumeMount

daytona = Daytona()
shared_assets = daytona.volume.get("shared-assets", create=True)
logs = daytona.volume.get("logs", create=True)

sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[
        VolumeMount(volume_id=shared_assets.id, mount_path="/home/daytona/assets"),
        VolumeMount(volume_id=logs.id, mount_path="/home/daytona/logs"),
    ],
))
```


```typescript
const sharedAssets = await daytona.volume.get('shared-assets', true)
const logs = await daytona.volume.get('logs', true)

const sandbox = await daytona.create({
  language: 'typescript',
  volumes: [
    { volumeId: sharedAssets.id, mountPath: '/home/daytona/assets' },
    { volumeId: logs.id, mountPath: '/home/daytona/logs' },
  ],
})
```


```ruby
shared_assets = daytona.volume.get('shared-assets', create: true)
logs = daytona.volume.get('logs', create: true)

params = Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [
    DaytonaApiClient::SandboxVolume.new(volume_id: shared_assets.id, mount_path: '/home/daytona/assets'),
    DaytonaApiClient::SandboxVolume.new(volume_id: logs.id, mount_path: '/home/daytona/logs')
  ]
)
sandbox = daytona.create(params)
```


```go
sharedAssets, err := client.Volume.Get(ctx, "shared-assets")
if err != nil {
	sharedAssets, err = client.Volume.Create(ctx, "shared-assets")
	if err != nil {
		log.Fatal(err)
	}
}
logs, err := client.Volume.Get(ctx, "logs")
if err != nil {
	logs, err = client.Volume.Create(ctx, "logs")
	if err != nil {
		log.Fatal(err)
	}
}

sandbox, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes: []types.VolumeMount{
			{VolumeID: sharedAssets.ID, MountPath: "/home/daytona/assets"},
			{VolumeID: logs.ID, MountPath: "/home/daytona/logs"},
		},
	},
})
if err != nil {
	log.Fatal(err)
}
```


```java
Volume sharedAssets;
try {
    sharedAssets = daytona.volume().getByName("shared-assets");
} catch (DaytonaNotFoundException e) {
    sharedAssets = daytona.volume().create("shared-assets");
}

Volume logs;
try {
    logs = daytona.volume().getByName("logs");
} catch (DaytonaNotFoundException e) {
    logs = daytona.volume().create("logs");
}

VolumeMount assetsMount = new VolumeMount();
assetsMount.setVolumeId(sharedAssets.getId());
assetsMount.setMountPath("/home/daytona/assets");

VolumeMount logsMount = new VolumeMount();
logsMount.setVolumeId(logs.getId());
logsMount.setMountPath("/home/daytona/logs");

CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
params.setLanguage("python");
params.setVolumes(java.util.Arrays.asList(assetsMount, logsMount));
Sandbox sandbox = daytona.create(params);
```


## Multi-tenant isolation with subpaths

Isolate per-tenant or per-user data inside a single shared volume by setting a unique `subpath` on each sandbox's volume mount. Each sandbox sees only files under its assigned subpath at `mount_path` and cannot read or write sibling subpaths within the same volume. This is the recommended pattern for multi-tenant workloads because it stays within the [per-organization volume limit](#pricing--limits) instead of creating one volume per tenant.

Isolation is enforced at the FUSE mount boundary. Each sandbox sees its assigned subpath as the volume root, so a sandbox mounted at `users/alice` cannot reach `users/bob` through relative paths such as `../bob`.


```python
from daytona import CreateSandboxFromSnapshotParams, Daytona, VolumeMount

daytona = Daytona()
volume = daytona.volume.get("tenants", create=True)
mount_dir = "/home/daytona/data"

# Tenant A
alice_sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[VolumeMount(volume_id=volume.id, mount_path=mount_dir, subpath="users/alice")],
))
alice_sandbox.fs.upload_file(b"alice's data", f"{mount_dir}/notes.txt")

# Tenant B sees only its own subpath; alice's notes.txt is invisible
bob_sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    language="python",
    volumes=[VolumeMount(volume_id=volume.id, mount_path=mount_dir, subpath="users/bob")],
))
bob_sandbox.fs.upload_file(b"bob's data", f"{mount_dir}/notes.txt")
```


```typescript
const volume = await daytona.volume.get('tenants', true)
const mountDir = '/home/daytona/data'

// Tenant A
const aliceSandbox = await daytona.create({
  language: 'typescript',
  volumes: [{ volumeId: volume.id, mountPath: mountDir, subpath: 'users/alice' }],
})
await aliceSandbox.fs.uploadFile(Buffer.from("alice's data"), `${mountDir}/notes.txt`)

// Tenant B sees only its own subpath; alice's notes.txt is invisible
const bobSandbox = await daytona.create({
  language: 'typescript',
  volumes: [{ volumeId: volume.id, mountPath: mountDir, subpath: 'users/bob' }],
})
await bobSandbox.fs.uploadFile(Buffer.from("bob's data"), `${mountDir}/notes.txt`)
```


```ruby
volume = daytona.volume.get('tenants', create: true)
mount_dir = '/home/daytona/data'

# Tenant A
alice_params = Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [DaytonaApiClient::SandboxVolume.new(
    volume_id: volume.id, mount_path: mount_dir, subpath: 'users/alice'
  )]
)
alice_sandbox = daytona.create(alice_params)
alice_sandbox.fs.upload_file("alice's data", "#{mount_dir}/notes.txt")

# Tenant B sees only its own subpath; alice's notes.txt is invisible
bob_params = Daytona::CreateSandboxFromSnapshotParams.new(
  language: Daytona::CodeLanguage::PYTHON,
  volumes: [DaytonaApiClient::SandboxVolume.new(
    volume_id: volume.id, mount_path: mount_dir, subpath: 'users/bob'
  )]
)
bob_sandbox = daytona.create(bob_params)
bob_sandbox.fs.upload_file("bob's data", "#{mount_dir}/notes.txt")
```


```go
volume, err := client.Volume.Get(ctx, "tenants")
if err != nil {
	volume, err = client.Volume.Create(ctx, "tenants")
	if err != nil {
		log.Fatal(err)
	}
}
mountDir := "/home/daytona/data"

// Tenant A
aliceSubpath := "users/alice"
aliceSandbox, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes: []types.VolumeMount{
			{VolumeID: volume.ID, MountPath: mountDir, Subpath: &aliceSubpath},
		},
	},
})
if err != nil {
	log.Fatal(err)
}
if err := aliceSandbox.FileSystem.UploadFile(ctx, []byte("alice's data"), mountDir+"/notes.txt"); err != nil {
	log.Fatal(err)
}

// Tenant B sees only its own subpath; alice's notes.txt is invisible
bobSubpath := "users/bob"
bobSandbox, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Language: types.CodeLanguagePython,
		Volumes: []types.VolumeMount{
			{VolumeID: volume.ID, MountPath: mountDir, Subpath: &bobSubpath},
		},
	},
})
if err != nil {
	log.Fatal(err)
}
if err := bobSandbox.FileSystem.UploadFile(ctx, []byte("bob's data"), mountDir+"/notes.txt"); err != nil {
	log.Fatal(err)
}
```


The Java SDK and CLI do not currently expose `subpath`. Use the REST API directly when you need subpath mounts from those clients.

```bash
# Tenant A
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Authorization: Bearer <API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
  "volumes": [
    {
      "volumeId": "<VOLUME_ID>",
      "mountPath": "/home/daytona/data",
      "subpath": "users/alice"
    }
  ]
}'

# Tenant B
curl 'https://app.daytona.io/api/sandbox' \
  --request POST \
  --header 'Authorization: Bearer <API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
  "volumes": [
    {
      "volumeId": "<VOLUME_ID>",
      "mountPath": "/home/daytona/data",
      "subpath": "users/bob"
    }
  ]
}'
```


## Limitations

Since volumes are FUSE-based mounts, they can not be used for applications that require block storage access (like database tables). Volumes are generally slower for both read and write operations compared to the local sandbox file system.

## Pricing & Limits

Daytona volumes are included at no additional cost. Each organization can create up to 100 volumes, and volume data does not count against your storage quota.

You can view your current volume usage in the [Daytona Volumes ↗](https://app.daytona.io/dashboard/volumes).