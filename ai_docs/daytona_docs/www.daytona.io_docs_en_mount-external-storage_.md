---
url: "https://www.daytona.io/docs/en/mount-external-storage/"
title: "Mount External Storage | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/mount-external-storage/#_top)

# Mount External Storage

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/mount-external-storage.md)Open

Mount object storage (Amazon S3, Cloudflare R2, Tigris, Supabase Storage, Google Cloud Storage, Azure Blob), cloud storage like Box, and filesystems like Archil and MesaFS into a Daytona sandbox as a regular directory. The sandbox reads from and writes to the bucket as if it were a local directory, so existing tools, scripts, and agents work without changes. This is useful for bringing in datasets, model weights, or build artifacts that already live in your own cloud account.

External storage mounts and [Daytona Volumes](https://www.daytona.io/docs/en/volumes/) are complementary FUSE-based mechanisms — both expose remote object storage as a regular sandbox directory, both can be shared across sandboxes, and both persist beyond any individual sandbox’s lifetime. The main distinction is **where the data physically lives**: Daytona Volumes are hosted on Daytona’s own S3-compatible object store, while external mounts connect to a bucket or filesystem hosted on another provider (Amazon S3, Cloudflare R2, Tigris, Supabase Storage, GCS, Azure Blob, Box, Archil, MesaFS).

External storage is mounted using FUSE. Daytona supports two approaches, and each provider section below shows both — pick whichever fits your workflow:

- **Pre-built snapshot** — build a [snapshot](https://www.daytona.io/docs/en/snapshots/) once with the FUSE tool (`mount-s3`, `gcsfuse`, `blobfuse2`, `rclone`) built-in, then launch every sandbox from that snapshot. Cold starts are fast and predictable. Best for production.
- **Runtime install** — launch a default sandbox and `apt-get install` the FUSE tool when the sandbox starts. Adds time to sandbox startup, but you don’t manage snapshots. Best for quick experiments.

Both approaches end with the same mount command and the same usage — the only difference is when the FUSE tool gets installed.

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-an-amazon-s3-bucket) Mount an Amazon S3 bucket

[Section titled “Mount an Amazon S3 bucket”](https://www.daytona.io/docs/en/mount-external-storage/#mount-an-amazon-s3-bucket)

Mount an S3 bucket using [Mountpoint for Amazon S3 ↗](https://github.com/awslabs/mountpoint-s3) — AWS’s official FUSE client, optimized for high throughput on S3.

**Credentials** — set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your local environment. The snippets below pass them into the sandbox via `envVars`, and `mount-s3` reads them from there.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot)

Build a snapshot with `mount-s3` preinstalled, then launch all S3-enabled sandboxes from that snapshot. This removes per-sandbox package install work, keeps cold starts predictable, and gives you a reusable baseline image for production workloads.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot)

Create a reusable snapshot that installs `mount-s3` and its system dependencies. After it finishes, every sandbox launched from `fuse-s3` already has the mount binary available.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-634)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-635)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-636)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-637)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-638)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb "

    "&& rm /tmp/mount-s3.deb",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-s3", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' +

    '&& rm /tmp/mount-s3.deb',

)

await daytona.snapshot.create(

  { name: 'fuse-s3', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

    '&& wget -O /tmp/mount-s3.deb ' \

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' \

    '&& rm /tmp/mount-s3.deb'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-s3', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget").

  Run(`arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && ` +

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && ` +

    `sudo apt-get install -y /tmp/mount-s3.deb && rm /tmp/mount-s3.deb`)

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-s3",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

                    "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                        + "&& wget -O /tmp/mount-s3.deb "

                        + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                        + "&& sudo apt-get install -y /tmp/mount-s3.deb "

                        + "&& rm /tmp/mount-s3.deb"

                );

            daytona.snapshot().create("fuse-s3", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount)

Pass AWS credentials as environment variables on sandbox creation. `mount-s3` reads them automatically.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-639)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-640)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-641)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-642)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-643)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-s3",

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["AWS_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["AWS_SECRET_ACCESS_KEY"],

        },

    )

)

mount_path = "/home/daytona/s3"

# mount-s3 daemonizes by default and reads AWS_* from the environment

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"mount-s3 my-bucket {mount_path}")

# Read and write through the mount as if it were a local directory

sandbox.process.exec(f"echo 'hello from Daytona' > {mount_path}/hello.txt")

response = sandbox.process.exec(f"cat {mount_path}/hello.txt")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'fuse-s3',

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,

  },

})

const mountPath = '/home/daytona/s3'

// mount-s3 daemonizes by default and reads AWS_* from the environment

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`mount-s3 my-bucket ${mountPath}`)

// Read and write through the mount as if it were a local directory

await sandbox.process.executeCommand(`echo 'hello from Daytona' > ${mountPath}/hello.txt`)

const response = await sandbox.process.executeCommand(`cat ${mountPath}/hello.txt`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-s3',

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('AWS_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('AWS_SECRET_ACCESS_KEY')

    }

  )

)

mount_path = '/home/daytona/s3'

# mount-s3 daemonizes by default and reads AWS_* from the environment

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "mount-s3 my-bucket #{mount_path}")

# Read and write through the mount as if it were a local directory

sandbox.process.exec(command: "echo 'hello from Daytona' > #{mount_path}/hello.txt")

response = sandbox.process.exec(command: "cat #{mount_path}/hello.txt")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-s3",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("AWS_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("AWS_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/s3"

// mount-s3 daemonizes by default and reads AWS_* from the environment

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mount-s3 my-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

// Read and write through the mount as if it were a local directory

if _, err := sandbox.Process.ExecuteCommand(ctx, "echo 'hello from Daytona' > "+mountPath+"/hello.txt"); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "cat "+mountPath+"/hello.txt")

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-s3");

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("AWS_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("AWS_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/s3";

            // mount-s3 daemonizes by default and reads AWS_* from the environment

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand("mount-s3 my-bucket " + mountPath);

            // Read and write through the mount as if it were a local directory

            sandbox.getProcess().executeCommand(

                "echo 'hello from Daytona' > " + mountPath + "/hello.txt");

            ExecuteResponse response = sandbox.getProcess().executeCommand(

                "cat " + mountPath + "/hello.txt");

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install)

Start from a default sandbox and install `mount-s3` during startup before running the mount command. This is useful for quick testing and temporary environments where you do not want to maintain a custom snapshot, with the tradeoff of slower cold starts.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-644)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-645)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-646)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-647)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-648)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxBaseParams(

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["AWS_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["AWS_SECRET_ACCESS_KEY"],

        },

    )

)

# Install mount-s3 at runtime

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"

)

sandbox.process.exec(

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb"

)

# Mount and use

mount_path = "/home/daytona/s3"

sandbox.process.exec(f"mkdir -p {mount_path} && mount-s3 my-bucket {mount_path}")

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY!,

  },

})

// Install mount-s3 at runtime

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

)

await sandbox.process.executeCommand(

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb',

)

// Mount and use

const mountPath = '/home/daytona/s3'

await sandbox.process.executeCommand(`mkdir -p ${mountPath} && mount-s3 my-bucket ${mountPath}`)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxBaseParams.new(

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('AWS_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('AWS_SECRET_ACCESS_KEY')

    }

  )

)

# Install mount-s3 at runtime

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget'

)

sandbox.process.exec(

  command: 'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

           '&& wget -O /tmp/mount-s3.deb ' \

           '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

           '&& sudo apt-get install -y /tmp/mount-s3.deb'

)

# Mount and use

mount_path = '/home/daytona/s3'

sandbox.process.exec(command: "mkdir -p #{mount_path} && mount-s3 my-bucket #{mount_path}")

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("AWS_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("AWS_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

// Install mount-s3 at runtime

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && `+

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && `+

    `sudo apt-get install -y /tmp/mount-s3.deb`); err != nil {

  log.Fatal(err)

}

// Mount and use

mountPath := "/home/daytona/s3"

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mkdir -p "+mountPath+" && mount-s3 my-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("AWS_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("AWS_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            // Install mount-s3 at runtime

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget");

            sandbox.getProcess().executeCommand(

                "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                    + "&& wget -O /tmp/mount-s3.deb "

                    + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                    + "&& sudo apt-get install -y /tmp/mount-s3.deb");

            // Mount and use

            String mountPath = "/home/daytona/s3";

            sandbox.getProcess().executeCommand(

                "mkdir -p " + mountPath + " && mount-s3 my-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-cloudflare-r2-bucket) Mount a Cloudflare R2 bucket

[Section titled “Mount a Cloudflare R2 bucket”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-cloudflare-r2-bucket)

Cloudflare R2 is S3-compatible, so the same `mount-s3` tool works. Pass an explicit `--endpoint-url` pointing at your R2 account.

**Credentials** — set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` in your local environment. R2 is S3-compatible, so the snippets below pass your R2 keys into the sandbox via `envVars` under the `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` names that `mount-s3` expects.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-1) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-1)

Build a snapshot with `mount-s3` preinstalled, then launch all R2-enabled sandboxes from that snapshot. The mount flow stays identical to S3 except for the R2 `--endpoint-url`, and startup remains fast because installation is done once at snapshot build time.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-1) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-1)

Create a reusable snapshot that installs the same `mount-s3` tool used for S3. R2 remains S3-compatible, so this snapshot is identical to S3 setup and only the runtime mount command changes.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-649)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-650)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-651)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-652)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-653)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb "

    "&& rm /tmp/mount-s3.deb",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-r2", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' +

    '&& rm /tmp/mount-s3.deb',

)

await daytona.snapshot.create(

  { name: 'fuse-r2', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

    '&& wget -O /tmp/mount-s3.deb ' \

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' \

    '&& rm /tmp/mount-s3.deb'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-r2', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget").

  Run(`arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && ` +

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && ` +

    `sudo apt-get install -y /tmp/mount-s3.deb && rm /tmp/mount-s3.deb`)

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-r2",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

                    "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                        + "&& wget -O /tmp/mount-s3.deb "

                        + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                        + "&& sudo apt-get install -y /tmp/mount-s3.deb "

                        + "&& rm /tmp/mount-s3.deb"

                );

            daytona.snapshot().create("fuse-r2", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-1) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-1)

Pass your R2 credentials into the sandbox as `AWS_*` environment variables and mount with the R2 endpoint URL. This keeps the authentication flow compatible with `mount-s3` while targeting your Cloudflare account.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-654)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-655)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-656)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-657)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-658)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# R2 credentials live in your Cloudflare dashboard under R2 > Manage API Tokens

account_id = os.environ["R2_ACCOUNT_ID"]

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-r2",

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["R2_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["R2_SECRET_ACCESS_KEY"],

        },

    )

)

mount_path = "/home/daytona/r2"

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(

    f"mount-s3 --endpoint-url https://{account_id}.r2.cloudflarestorage.com "

    f"my-r2-bucket {mount_path}"

)

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// R2 credentials live in your Cloudflare dashboard under R2 > Manage API Tokens

const accountId = process.env.R2_ACCOUNT_ID!

const sandbox = await daytona.create({

  snapshot: 'fuse-r2',

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,

  },

})

const mountPath = '/home/daytona/r2'

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(

  `mount-s3 --endpoint-url https://${accountId}.r2.cloudflarestorage.com ` +

    `my-r2-bucket ${mountPath}`,

)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# R2 credentials live in your Cloudflare dashboard under R2 > Manage API Tokens

account_id = ENV.fetch('R2_ACCOUNT_ID')

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-r2',

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('R2_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('R2_SECRET_ACCESS_KEY')

    }

  )

)

mount_path = '/home/daytona/r2'

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(

  command: "mount-s3 --endpoint-url https://#{account_id}.r2.cloudflarestorage.com " \

           "my-r2-bucket #{mount_path}"

)

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

// R2 credentials live in your Cloudflare dashboard under R2 > Manage API Tokens

accountID := os.Getenv("R2_ACCOUNT_ID")

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-r2",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("R2_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("R2_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/r2"

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mount-s3 --endpoint-url https://"+accountID+".r2.cloudflarestorage.com "+

    "my-r2-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // R2 credentials live in your Cloudflare dashboard under R2 > Manage API Tokens

            String accountId = System.getenv("R2_ACCOUNT_ID");

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-r2");

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("R2_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("R2_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/r2";

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "mount-s3 --endpoint-url https://" + accountId + ".r2.cloudflarestorage.com "

                    + "my-r2-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-1) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-1)

Start from a default sandbox and install `mount-s3` during startup, then mount your bucket with the R2 `--endpoint-url`. This path is convenient for prototyping or one-off tasks, but each new sandbox pays the package installation cost.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-659)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-660)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-661)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-662)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-663)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

account_id = os.environ["R2_ACCOUNT_ID"]

sandbox = daytona.create(

    CreateSandboxBaseParams(

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["R2_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["R2_SECRET_ACCESS_KEY"],

        },

    )

)

# Install mount-s3

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"

)

sandbox.process.exec(

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb"

)

# Mount with R2 endpoint

mount_path = "/home/daytona/r2"

sandbox.process.exec(

    f"mkdir -p {mount_path} && "

    f"mount-s3 --endpoint-url https://{account_id}.r2.cloudflarestorage.com "

    f"my-r2-bucket {mount_path}"

)

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const accountId = process.env.R2_ACCOUNT_ID!

const sandbox = await daytona.create({

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,

  },

})

// Install mount-s3

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

)

await sandbox.process.executeCommand(

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb',

)

// Mount with R2 endpoint

const mountPath = '/home/daytona/r2'

await sandbox.process.executeCommand(

  `mkdir -p ${mountPath} && ` +

    `mount-s3 --endpoint-url https://${accountId}.r2.cloudflarestorage.com ` +

    `my-r2-bucket ${mountPath}`,

)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

account_id = ENV.fetch('R2_ACCOUNT_ID')

sandbox = daytona.create(

  Daytona::CreateSandboxBaseParams.new(

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('R2_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('R2_SECRET_ACCESS_KEY')

    }

  )

)

# Install mount-s3

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget'

)

sandbox.process.exec(

  command: 'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

           '&& wget -O /tmp/mount-s3.deb ' \

           '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

           '&& sudo apt-get install -y /tmp/mount-s3.deb'

)

# Mount with R2 endpoint

mount_path = '/home/daytona/r2'

sandbox.process.exec(

  command: "mkdir -p #{mount_path} && " \

           "mount-s3 --endpoint-url https://#{account_id}.r2.cloudflarestorage.com " \

           "my-r2-bucket #{mount_path}"

)

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

accountID := os.Getenv("R2_ACCOUNT_ID")

sandbox, err := client.Create(ctx, types.SnapshotParams{

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("R2_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("R2_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

// Install mount-s3

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && `+

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && `+

    `sudo apt-get install -y /tmp/mount-s3.deb`); err != nil {

  log.Fatal(err)

}

// Mount with R2 endpoint

mountPath := "/home/daytona/r2"

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mkdir -p "+mountPath+" && "+

    "mount-s3 --endpoint-url https://"+accountID+".r2.cloudflarestorage.com "+

    "my-r2-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            String accountId = System.getenv("R2_ACCOUNT_ID");

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("R2_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("R2_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            // Install mount-s3

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget");

            sandbox.getProcess().executeCommand(

                "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                    + "&& wget -O /tmp/mount-s3.deb "

                    + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                    + "&& sudo apt-get install -y /tmp/mount-s3.deb");

            // Mount with R2 endpoint

            String mountPath = "/home/daytona/r2";

            sandbox.getProcess().executeCommand(

                "mkdir -p " + mountPath + " && "

                    + "mount-s3 --endpoint-url https://" + accountId + ".r2.cloudflarestorage.com "

                    + "my-r2-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-tigris-bucket) Mount a Tigris bucket

[Section titled “Mount a Tigris bucket”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-tigris-bucket)

Mount a Tigris bucket with the same `mount-s3` tool used for S3. Pass `--endpoint-url https://t3.storage.dev`, because Tigris uses one global endpoint with no per-account subdomain. Tigris also supports bucket snapshots and copy-on-write forks through request headers, so each sandbox can use an isolated writable bucket without duplicating source data.

**Credentials** — set `TIGRIS_STORAGE_ACCESS_KEY_ID` and `TIGRIS_STORAGE_SECRET_ACCESS_KEY` in your local environment. The snippets below pass these into the sandbox via `envVars` under the `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` names that `mount-s3` expects.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-2) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-2)

Build a snapshot with `mount-s3` preinstalled, then launch Tigris sandboxes from that snapshot. The mount flow matches S3 except for the Tigris `--endpoint-url`, and startup stays fast because installation happens once during snapshot build.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-2) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-2)

Create a reusable snapshot that installs `mount-s3`. Because Tigris is S3-compatible, this setup matches S3 and only the runtime mount command changes.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-664)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-665)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-666)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-667)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-668)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb "

    "&& rm /tmp/mount-s3.deb",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-tigris", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' +

    '&& rm /tmp/mount-s3.deb',

)

await daytona.snapshot.create(

  { name: 'fuse-tigris', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

    '&& wget -O /tmp/mount-s3.deb ' \

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' \

    '&& rm /tmp/mount-s3.deb'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-tigris', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget").

  Run(`arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && ` +

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && ` +

    `sudo apt-get install -y /tmp/mount-s3.deb && rm /tmp/mount-s3.deb`)

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-tigris",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

                    "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                        + "&& wget -O /tmp/mount-s3.deb "

                        + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                        + "&& sudo apt-get install -y /tmp/mount-s3.deb "

                        + "&& rm /tmp/mount-s3.deb"

                );

            daytona.snapshot().create("fuse-tigris", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-2) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-2)

Pass Tigris credentials into the sandbox as `AWS_*` environment variables, then mount with the Tigris endpoint URL. This keeps authentication compatible with `mount-s3` while targeting your Tigris account.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-669)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-670)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-671)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-672)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-673)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-tigris",

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["TIGRIS_STORAGE_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["TIGRIS_STORAGE_SECRET_ACCESS_KEY"],

        },

    )

)

mount_path = "/home/daytona/tigris"

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(

    f"mount-s3 --endpoint-url https://t3.storage.dev "

    f"my-tigris-bucket {mount_path}"

)

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'fuse-tigris',

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY!,

  },

})

const mountPath = '/home/daytona/tigris'

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(

  `mount-s3 --endpoint-url https://t3.storage.dev ` +

    `my-tigris-bucket ${mountPath}`,

)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-tigris',

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('TIGRIS_STORAGE_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('TIGRIS_STORAGE_SECRET_ACCESS_KEY')

    }

  )

)

mount_path = '/home/daytona/tigris'

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(

  command: 'mount-s3 --endpoint-url https://t3.storage.dev ' \

           "my-tigris-bucket #{mount_path}"

)

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-tigris",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("TIGRIS_STORAGE_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/tigris"

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mount-s3 --endpoint-url https://t3.storage.dev "+

    "my-tigris-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-tigris");

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("TIGRIS_STORAGE_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/tigris";

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "mount-s3 --endpoint-url https://t3.storage.dev "

                    + "my-tigris-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-2) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-2)

Start from a default sandbox, install `mount-s3` during startup, then mount with the Tigris `--endpoint-url`. This path is convenient for prototyping or one-off tasks, but each new sandbox repeats package installation.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-674)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-675)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-676)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-677)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-678)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxBaseParams(

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["TIGRIS_STORAGE_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["TIGRIS_STORAGE_SECRET_ACCESS_KEY"],

        },

    )

)

# Install mount-s3

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"

)

sandbox.process.exec(

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb"

)

# Mount with Tigris endpoint

mount_path = "/home/daytona/tigris"

sandbox.process.exec(

    f"mkdir -p {mount_path} && "

    f"mount-s3 --endpoint-url https://t3.storage.dev "

    f"my-tigris-bucket {mount_path}"

)

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY!,

  },

})

// Install mount-s3

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

)

await sandbox.process.executeCommand(

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb',

)

// Mount with Tigris endpoint

const mountPath = '/home/daytona/tigris'

await sandbox.process.executeCommand(

  `mkdir -p ${mountPath} && ` +

    `mount-s3 --endpoint-url https://t3.storage.dev ` +

    `my-tigris-bucket ${mountPath}`,

)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxBaseParams.new(

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('TIGRIS_STORAGE_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('TIGRIS_STORAGE_SECRET_ACCESS_KEY')

    }

  )

)

# Install mount-s3

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget'

)

sandbox.process.exec(

  command: 'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

           '&& wget -O /tmp/mount-s3.deb ' \

           '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

           '&& sudo apt-get install -y /tmp/mount-s3.deb'

)

# Mount with Tigris endpoint

mount_path = '/home/daytona/tigris'

sandbox.process.exec(

  command: "mkdir -p #{mount_path} && " \

           'mount-s3 --endpoint-url https://t3.storage.dev ' \

           "my-tigris-bucket #{mount_path}"

)

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("TIGRIS_STORAGE_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

// Install mount-s3

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && `+

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && `+

    `sudo apt-get install -y /tmp/mount-s3.deb`); err != nil {

  log.Fatal(err)

}

// Mount with Tigris endpoint

mountPath := "/home/daytona/tigris"

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mkdir -p "+mountPath+" && "+

    "mount-s3 --endpoint-url https://t3.storage.dev "+

    "my-tigris-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("TIGRIS_STORAGE_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            // Install mount-s3

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget");

            sandbox.getProcess().executeCommand(

                "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                    + "&& wget -O /tmp/mount-s3.deb "

                    + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                    + "&& sudo apt-get install -y /tmp/mount-s3.deb");

            // Mount with Tigris endpoint

            String mountPath = "/home/daytona/tigris";

            sandbox.getProcess().executeCommand(

                "mkdir -p " + mountPath + " && "

                    + "mount-s3 --endpoint-url https://t3.storage.dev "

                    + "my-tigris-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-copy-on-write-fork-per-sandbox) Mount a copy-on-write fork per sandbox

[Section titled “Mount a copy-on-write fork per sandbox”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-copy-on-write-fork-per-sandbox)

A Tigris bucket fork is a new bucket created from a snapshot of a source bucket. The fork shares underlying storage with the source until written to — new writes go only to the fork, and the source bucket and other forks are unaffected. Fork creation is constant-time regardless of source bucket size.

This pattern fits Daytona sandboxes when each sandbox needs a writable copy of a shared dataset (model weights, fixtures, golden data) without duplicating it on every launch.

**Prerequisite** — the source bucket must be created with snapshots enabled. This is a one-time setup, done outside the per-sandbox flow:

```
import { createBucket } from '@tigrisdata/storage'

await createBucket('my-source-bucket', { enableSnapshot: true })
```

In any S3 SDK, send a `CreateBucket` request with the header `X-Tigris-Enable-Snapshot: true`.

The `@tigrisdata/agent-kit` package wraps this workflow as `createForks()`. It snapshots the source bucket and creates one or more forks in a single call. Passing `credentials: { role: 'Editor' }` also creates a scoped access key per fork, so each sandbox can read and write only its own fork bucket instead of the full account.

```
import { createForks, teardownForks } from '@tigrisdata/agent-kit'

import { Daytona } from '@daytona/sdk'

const SOURCE_BUCKET = 'my-source-bucket'

// 1. Snapshot the source and create a fork with a scoped access key

const { data: forkSet, error } = await createForks(SOURCE_BUCKET, 1, {

  credentials: { role: 'Editor' },

})

if (error) throw error

const fork = forkSet.forks[0]

// 2. Launch the sandbox with the fork's scoped credentials

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'fuse-tigris',

  envVars: {

    AWS_ACCESS_KEY_ID: fork.credentials!.accessKeyId,

    AWS_SECRET_ACCESS_KEY: fork.credentials!.secretAccessKey,

  },

})

// 3. Mount the fork bucket

const mountPath = '/home/daytona/tigris'

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(

  `mount-s3 --endpoint-url https://t3.storage.dev ${fork.bucket} ${mountPath}`,

)

try {

  const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

  console.log(response.result)

} finally {

  await daytona.delete(sandbox)

  await teardownForks(forkSet) // revokes the scoped key and deletes the fork bucket

}
```

To run the same workflow from a language without an `agent-kit` equivalent, use any S3 SDK and send the headers documented below. Send `X-Tigris-Snapshot: true` on `CreateBucket` for the source name, then capture `X-Tigris-Snapshot-Version` from the response. Next, send `CreateBucket` for the fork name with `X-Tigris-Fork-Source-Bucket` and `X-Tigris-Fork-Source-Bucket-Snapshot`. Mount the fork with the same `mount-s3` snippets shown above, replacing the bucket name with the fork bucket.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#reference-tigris-specific-headers) Reference: Tigris-specific headers

[Section titled “Reference: Tigris-specific headers”](https://www.daytona.io/docs/en/mount-external-storage/#reference-tigris-specific-headers)

These headers drive snapshot and fork operations over the S3 API. Use them with any AWS SDK (boto3, aws-sdk-go-v2, aws-sdk-java-v2, aws-sdk-ruby) by attaching a request interceptor.

| Header | Sent on | Purpose |
| --- | --- | --- |
| **`X-Tigris-Enable-Snapshot: true`** | **`CreateBucket`** (new source) | Enable snapshots on a new bucket. Required before snapshotting it. |
| **`X-Tigris-Snapshot: true`** | **`CreateBucket`** (existing source name) | Take a snapshot of the bucket. Optional **`; name=<label>`** suffix labels it. |
| **`X-Tigris-Snapshot-Version`** | Response to snapshot create | Snapshot version ID returned to the caller — pass to fork creation. |
| **`X-Tigris-Fork-Source-Bucket`** | **`CreateBucket`** (new fork name) | Source bucket to fork from. |
| **`X-Tigris-Fork-Source-Bucket-Snapshot`** | **`CreateBucket`** (new fork name) | Source snapshot version to fork from. |

Source: [**`tigrisdata/storage`**](https://github.com/tigrisdata/storage). See **`shared/headers.ts`** for the full header set.

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-supabase-storage-bucket) Mount a Supabase Storage bucket

[Section titled “Mount a Supabase Storage bucket”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-supabase-storage-bucket)

Mount a Supabase Storage bucket with the same `mount-s3` tool used for S3. Supabase Storage is [S3-compatible ↗](https://supabase.com/docs/guides/storage/s3/compatibility) and serves each project at `https://<project_ref>.storage.supabase.co/storage/v1/s3`, so pass that endpoint with `--endpoint-url`, the project’s region with `--region`, and `--force-path-style`. The path-style flag is required — Supabase serves all buckets from the project hostname rather than per-bucket subdomains, so `mount-s3`’s default virtual-hosted-style addressing (which prepends the bucket name to the endpoint hostname) fails during TLS negotiation.

**Credentials** — in the [Supabase dashboard ↗](https://supabase.com/dashboard/project/_/storage/s3), enable **S3 protocol connection** on your project’s **Storage** \> **S3** page and generate a pair of S3 access keys. Set `SUPABASE_PROJECT_REF` (the `<project_ref>` subdomain of the endpoint shown on that page), `SUPABASE_REGION` (the project’s region, e.g. `us-east-1`), `SUPABASE_S3_ACCESS_KEY_ID`, and `SUPABASE_S3_SECRET_ACCESS_KEY` in your local environment. The snippets below pass the keys into the sandbox via `envVars` under the `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` names that `mount-s3` expects. S3 access keys grant full access to every bucket in the project and bypass [Row Level Security ↗](https://supabase.com/docs/guides/storage/security/access-control) policies, so treat them as server-side secrets.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-3) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-3)

Build a snapshot with `mount-s3` preinstalled, then launch Supabase-enabled sandboxes from that snapshot. The mount flow matches S3 except for the Supabase `--endpoint-url`, `--region`, and `--force-path-style` flags, and startup stays fast because installation happens once during snapshot build.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-3) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-3)

Create a reusable snapshot that installs `mount-s3`. Because Supabase Storage is S3-compatible, this setup matches S3 and only the runtime mount command changes.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-679)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-680)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-681)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-682)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-683)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb "

    "&& rm /tmp/mount-s3.deb",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-supabase", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' +

    '&& rm /tmp/mount-s3.deb',

)

await daytona.snapshot.create(

  { name: 'fuse-supabase', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

    '&& wget -O /tmp/mount-s3.deb ' \

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

    '&& sudo apt-get install -y /tmp/mount-s3.deb ' \

    '&& rm /tmp/mount-s3.deb'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-supabase', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget").

  Run(`arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && ` +

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && ` +

    `sudo apt-get install -y /tmp/mount-s3.deb && rm /tmp/mount-s3.deb`)

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-supabase",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget",

                    "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                        + "&& wget -O /tmp/mount-s3.deb "

                        + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                        + "&& sudo apt-get install -y /tmp/mount-s3.deb "

                        + "&& rm /tmp/mount-s3.deb"

                );

            daytona.snapshot().create("fuse-supabase", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-3) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-3)

Pass your Supabase S3 access keys into the sandbox as `AWS_*` environment variables, then mount with the project’s S3 endpoint, region, and path-style addressing. This keeps authentication compatible with `mount-s3` while targeting your Supabase project.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-684)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-685)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-686)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-687)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-688)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# S3 endpoint, region, and access keys live in your Supabase dashboard under Storage > S3

project_ref = os.environ["SUPABASE_PROJECT_REF"]

region = os.environ["SUPABASE_REGION"]

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-supabase",

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["SUPABASE_S3_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"],

        },

    )

)

mount_path = "/home/daytona/supabase"

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(

    f"mount-s3 --endpoint-url https://{project_ref}.storage.supabase.co/storage/v1/s3 "

    f"--region {region} --force-path-style "

    f"my-supabase-bucket {mount_path}"

)

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// S3 endpoint, region, and access keys live in your Supabase dashboard under Storage > S3

const projectRef = process.env.SUPABASE_PROJECT_REF!

const region = process.env.SUPABASE_REGION!

const sandbox = await daytona.create({

  snapshot: 'fuse-supabase',

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.SUPABASE_S3_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,

  },

})

const mountPath = '/home/daytona/supabase'

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(

  `mount-s3 --endpoint-url https://${projectRef}.storage.supabase.co/storage/v1/s3 ` +

    `--region ${region} --force-path-style ` +

    `my-supabase-bucket ${mountPath}`,

)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# S3 endpoint, region, and access keys live in your Supabase dashboard under Storage > S3

project_ref = ENV.fetch('SUPABASE_PROJECT_REF')

region = ENV.fetch('SUPABASE_REGION')

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-supabase',

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('SUPABASE_S3_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('SUPABASE_S3_SECRET_ACCESS_KEY')

    }

  )

)

mount_path = '/home/daytona/supabase'

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(

  command: "mount-s3 --endpoint-url https://#{project_ref}.storage.supabase.co/storage/v1/s3 " \

           "--region #{region} --force-path-style " \

           "my-supabase-bucket #{mount_path}"

)

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

// S3 endpoint, region, and access keys live in your Supabase dashboard under Storage > S3

projectRef := os.Getenv("SUPABASE_PROJECT_REF")

region := os.Getenv("SUPABASE_REGION")

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-supabase",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("SUPABASE_S3_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("SUPABASE_S3_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/supabase"

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mount-s3 --endpoint-url https://"+projectRef+".storage.supabase.co/storage/v1/s3 "+

    "--region "+region+" --force-path-style "+

    "my-supabase-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // S3 endpoint, region, and access keys live in your Supabase dashboard under Storage > S3

            String projectRef = System.getenv("SUPABASE_PROJECT_REF");

            String region = System.getenv("SUPABASE_REGION");

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-supabase");

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("SUPABASE_S3_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("SUPABASE_S3_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/supabase";

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "mount-s3 --endpoint-url https://" + projectRef + ".storage.supabase.co/storage/v1/s3 "

                    + "--region " + region + " --force-path-style "

                    + "my-supabase-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-3) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-3)

Start from a default sandbox, install `mount-s3` during startup, then mount with the Supabase `--endpoint-url`, `--region`, and `--force-path-style` flags. This path is convenient for prototyping or one-off tasks, but each new sandbox repeats package installation.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-689)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-690)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-691)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-692)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-693)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

project_ref = os.environ["SUPABASE_PROJECT_REF"]

region = os.environ["SUPABASE_REGION"]

sandbox = daytona.create(

    CreateSandboxBaseParams(

        env_vars={

            "AWS_ACCESS_KEY_ID": os.environ["SUPABASE_S3_ACCESS_KEY_ID"],

            "AWS_SECRET_ACCESS_KEY": os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"],

        },

    )

)

# Install mount-s3

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"

)

sandbox.process.exec(

    'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" '

    '&& wget -O /tmp/mount-s3.deb '

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" '

    "&& sudo apt-get install -y /tmp/mount-s3.deb"

)

# Mount with Supabase endpoint

mount_path = "/home/daytona/supabase"

sandbox.process.exec(

    f"mkdir -p {mount_path} && "

    f"mount-s3 --endpoint-url https://{project_ref}.storage.supabase.co/storage/v1/s3 "

    f"--region {region} --force-path-style "

    f"my-supabase-bucket {mount_path}"

)

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const projectRef = process.env.SUPABASE_PROJECT_REF!

const region = process.env.SUPABASE_REGION!

const sandbox = await daytona.create({

  envVars: {

    AWS_ACCESS_KEY_ID: process.env.SUPABASE_S3_ACCESS_KEY_ID!,

    AWS_SECRET_ACCESS_KEY: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,

  },

})

// Install mount-s3

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget',

)

await sandbox.process.executeCommand(

  'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' +

    '&& wget -O /tmp/mount-s3.deb ' +

    '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' +

    '&& sudo apt-get install -y /tmp/mount-s3.deb',

)

// Mount with Supabase endpoint

const mountPath = '/home/daytona/supabase'

await sandbox.process.executeCommand(

  `mkdir -p ${mountPath} && ` +

    `mount-s3 --endpoint-url https://${projectRef}.storage.supabase.co/storage/v1/s3 ` +

    `--region ${region} --force-path-style ` +

    `my-supabase-bucket ${mountPath}`,

)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

project_ref = ENV.fetch('SUPABASE_PROJECT_REF')

region = ENV.fetch('SUPABASE_REGION')

sandbox = daytona.create(

  Daytona::CreateSandboxBaseParams.new(

    env_vars: {

      'AWS_ACCESS_KEY_ID' => ENV.fetch('SUPABASE_S3_ACCESS_KEY_ID'),

      'AWS_SECRET_ACCESS_KEY' => ENV.fetch('SUPABASE_S3_SECRET_ACCESS_KEY')

    }

  )

)

# Install mount-s3

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget'

)

sandbox.process.exec(

  command: 'arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" ' \

           '&& wget -O /tmp/mount-s3.deb ' \

           '"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" ' \

           '&& sudo apt-get install -y /tmp/mount-s3.deb'

)

# Mount with Supabase endpoint

mount_path = '/home/daytona/supabase'

sandbox.process.exec(

  command: "mkdir -p #{mount_path} && " \

           "mount-s3 --endpoint-url https://#{project_ref}.storage.supabase.co/storage/v1/s3 " \

           "--region #{region} --force-path-style " \

           "my-supabase-bucket #{mount_path}"

)

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

projectRef := os.Getenv("SUPABASE_PROJECT_REF")

region := os.Getenv("SUPABASE_REGION")

sandbox, err := client.Create(ctx, types.SnapshotParams{

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "AWS_ACCESS_KEY_ID":     os.Getenv("SUPABASE_S3_ACCESS_KEY_ID"),

      "AWS_SECRET_ACCESS_KEY": os.Getenv("SUPABASE_S3_SECRET_ACCESS_KEY"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

// Install mount-s3

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `arch="$(dpkg --print-architecture | sed s/amd64/x86_64/)" && `+

    `wget -O /tmp/mount-s3.deb "https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb" && `+

    `sudo apt-get install -y /tmp/mount-s3.deb`); err != nil {

  log.Fatal(err)

}

// Mount with Supabase endpoint

mountPath := "/home/daytona/supabase"

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "mkdir -p "+mountPath+" && "+

    "mount-s3 --endpoint-url https://"+projectRef+".storage.supabase.co/storage/v1/s3 "+

    "--region "+region+" --force-path-style "+

    "my-supabase-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            String projectRef = System.getenv("SUPABASE_PROJECT_REF");

            String region = System.getenv("SUPABASE_REGION");

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setEnvVars(Map.of(

                "AWS_ACCESS_KEY_ID", System.getenv("SUPABASE_S3_ACCESS_KEY_ID"),

                "AWS_SECRET_ACCESS_KEY", System.getenv("SUPABASE_S3_SECRET_ACCESS_KEY")

            ));

            Sandbox sandbox = daytona.create(params);

            // Install mount-s3

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates wget");

            sandbox.getProcess().executeCommand(

                "arch=\"$(dpkg --print-architecture | sed s/amd64/x86_64/)\" "

                    + "&& wget -O /tmp/mount-s3.deb "

                    + "\"https://s3.amazonaws.com/mountpoint-s3-release/latest/${arch}/mount-s3.deb\" "

                    + "&& sudo apt-get install -y /tmp/mount-s3.deb");

            // Mount with Supabase endpoint

            String mountPath = "/home/daytona/supabase";

            sandbox.getProcess().executeCommand(

                "mkdir -p " + mountPath + " && "

                    + "mount-s3 --endpoint-url https://" + projectRef + ".storage.supabase.co/storage/v1/s3 "

                    + "--region " + region + " --force-path-style "

                    + "my-supabase-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-google-cloud-storage-bucket) Mount a Google Cloud Storage bucket

[Section titled “Mount a Google Cloud Storage bucket”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-google-cloud-storage-bucket)

Mount a GCS bucket using [gcsfuse ↗](https://github.com/GoogleCloudPlatform/gcsfuse) — Google’s official FUSE client.

**Credentials** — `gcsfuse` reads a service account JSON key file. The snippets below read the key from a local path on your host and upload it into the sandbox via `sandbox.fs`.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-4) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-4)

Build a snapshot with `gcsfuse` preinstalled, then launch all GCS-enabled sandboxes from that snapshot. This avoids repeating apt repository setup and package installation for every sandbox, which makes startup behavior more consistent.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-4) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-4)

Create a reusable snapshot that installs `gcsfuse` plus its apt repository configuration. After this step, GCS-enabled sandboxes can mount immediately without repeating package setup.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-694)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-695)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-696)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-697)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-698)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg",

    "sudo mkdir -p /etc/apt/keyrings "

    "&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg "

    "| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg",

    'echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] '

    'https://packages.cloud.google.com/apt gcsfuse-bookworm main" '

    "| sudo tee /etc/apt/sources.list.d/gcsfuse.list",

    "sudo apt-get update && sudo apt-get install -y gcsfuse",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-gcs", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg',

  'sudo mkdir -p /etc/apt/keyrings ' +

    '&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg ' +

    '| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg',

  'echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] ' +

    'https://packages.cloud.google.com/apt gcsfuse-bookworm main" ' +

    '| sudo tee /etc/apt/sources.list.d/gcsfuse.list',

  'sudo apt-get update && sudo apt-get install -y gcsfuse',

)

await daytona.snapshot.create(

  { name: 'fuse-gcs', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg',

    'sudo mkdir -p /etc/apt/keyrings ' \

    '&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg ' \

    '| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg',

    'echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] ' \

    'https://packages.cloud.google.com/apt gcsfuse-bookworm main" ' \

    '| sudo tee /etc/apt/sources.list.d/gcsfuse.list',

    'sudo apt-get update && sudo apt-get install -y gcsfuse'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-gcs', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg").

  Run("sudo mkdir -p /etc/apt/keyrings && " +

    "curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | " +

    "sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg").

  Run(`echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] ` +

    `https://packages.cloud.google.com/apt gcsfuse-bookworm main" | ` +

    `sudo tee /etc/apt/sources.list.d/gcsfuse.list`).

  Run("sudo apt-get update && sudo apt-get install -y gcsfuse")

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-gcs",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg",

                    "sudo mkdir -p /etc/apt/keyrings "

                        + "&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg "

                        + "| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg",

                    "echo \"deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] "

                        + "https://packages.cloud.google.com/apt gcsfuse-bookworm main\" "

                        + "| sudo tee /etc/apt/sources.list.d/gcsfuse.list",

                    "sudo apt-get update && sudo apt-get install -y gcsfuse"

                );

            daytona.snapshot().create("fuse-gcs", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-4) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-4)

`gcsfuse` authenticates to GCS with a service account JSON key. Upload it into the sandbox via `sandbox.fs` and point `gcsfuse` at it with `--key-file`.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-699)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-700)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-701)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-702)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-703)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

service_account_key = os.environ["GCS_SERVICE_ACCOUNT_KEY"].encode()

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="fuse-gcs"))

mount_path = "/home/daytona/gcs"

key_path = "/home/daytona/.gcs-key.json"

# Upload the key file into the sandbox

sandbox.fs.upload_file(service_account_key, key_path)

sandbox.process.exec(f"chmod 600 {key_path}")

# Mount the bucket

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"gcsfuse --key-file={key_path} my-gcs-bucket {mount_path}")

# Use the mount

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

const serviceAccountKey = Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY!)

const sandbox = await daytona.create({ snapshot: 'fuse-gcs' })

const mountPath = '/home/daytona/gcs'

const keyPath = '/home/daytona/.gcs-key.json'

// Upload the key file into the sandbox

await sandbox.fs.uploadFile(serviceAccountKey, keyPath)

await sandbox.process.executeCommand(`chmod 600 ${keyPath}`)

// Mount the bucket

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`gcsfuse --key-file=${keyPath} my-gcs-bucket ${mountPath}`)

// Use the mount

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

service_account_key = ENV.fetch('GCS_SERVICE_ACCOUNT_KEY')

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'fuse-gcs')

)

mount_path = '/home/daytona/gcs'

key_path = '/home/daytona/.gcs-key.json'

# Upload the key file into the sandbox

sandbox.fs.upload_file(service_account_key, key_path)

sandbox.process.exec(command: "chmod 600 #{key_path}")

# Mount the bucket

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "gcsfuse --key-file=#{key_path} my-gcs-bucket #{mount_path}")

# Use the mount

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

// GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

serviceAccountKey := []byte(os.Getenv("GCS_SERVICE_ACCOUNT_KEY"))

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-gcs",

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/gcs"

keyPath := "/home/daytona/.gcs-key.json"

// Upload the key file into the sandbox

if err := sandbox.FileSystem.UploadFile(ctx, serviceAccountKey, keyPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "chmod 600 "+keyPath); err != nil {

  log.Fatal(err)

}

// Mount the bucket

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "gcsfuse --key-file="+keyPath+" my-gcs-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

// Use the mount

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

            byte[] serviceAccountKey = System.getenv("GCS_SERVICE_ACCOUNT_KEY")

                .getBytes(StandardCharsets.UTF_8);

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-gcs");

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/gcs";

            String keyPath = "/home/daytona/.gcs-key.json";

            // Upload the key file into the sandbox

            sandbox.fs.uploadFile(serviceAccountKey, keyPath);

            sandbox.getProcess().executeCommand("chmod 600 " + keyPath);

            // Mount the bucket

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "gcsfuse --key-file=" + keyPath + " my-gcs-bucket " + mountPath);

            // Use the mount

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-4) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-4)

Start from a default sandbox and install `gcsfuse` when the sandbox starts, then upload the service account key and mount the bucket. This is the fastest way to iterate on setup, but every sandbox repeats install and key staging steps.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-704)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-705)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-706)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-707)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-708)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

# GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

service_account_key = os.environ["GCS_SERVICE_ACCOUNT_KEY"].encode()

sandbox = daytona.create(CreateSandboxBaseParams())

# Install gcsfuse from the bookworm repo (works on Trixie)

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg"

)

sandbox.process.exec(

    "sudo mkdir -p /etc/apt/keyrings "

    "&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg "

    "| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg"

)

sandbox.process.exec(

    'echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] '

    'https://packages.cloud.google.com/apt gcsfuse-bookworm main" '

    "| sudo tee /etc/apt/sources.list.d/gcsfuse.list "

    "&& sudo apt-get update && sudo apt-get install -y gcsfuse"

)

# Upload the key and mount

mount_path = "/home/daytona/gcs"

key_path = "/home/daytona/.gcs-key.json"

sandbox.fs.upload_file(service_account_key, key_path)

sandbox.process.exec(f"chmod 600 {key_path}")

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"gcsfuse --key-file={key_path} my-gcs-bucket {mount_path}")

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

const serviceAccountKey = Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY!)

const sandbox = await daytona.create()

// Install gcsfuse from the bookworm repo (works on Trixie)

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg',

)

await sandbox.process.executeCommand(

  'sudo mkdir -p /etc/apt/keyrings ' +

    '&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg ' +

    '| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg',

)

await sandbox.process.executeCommand(

  'echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] ' +

    'https://packages.cloud.google.com/apt gcsfuse-bookworm main" ' +

    '| sudo tee /etc/apt/sources.list.d/gcsfuse.list ' +

    '&& sudo apt-get update && sudo apt-get install -y gcsfuse',

)

// Upload the key and mount

const mountPath = '/home/daytona/gcs'

const keyPath = '/home/daytona/.gcs-key.json'

await sandbox.fs.uploadFile(serviceAccountKey, keyPath)

await sandbox.process.executeCommand(`chmod 600 ${keyPath}`)

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`gcsfuse --key-file=${keyPath} my-gcs-bucket ${mountPath}`)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

service_account_key = ENV.fetch('GCS_SERVICE_ACCOUNT_KEY')

sandbox = daytona.create(Daytona::CreateSandboxBaseParams.new)

# Install gcsfuse from the bookworm repo (works on Trixie)

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg'

)

sandbox.process.exec(

  command: 'sudo mkdir -p /etc/apt/keyrings ' \

           '&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg ' \

           '| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg'

)

sandbox.process.exec(

  command: 'echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] ' \

           'https://packages.cloud.google.com/apt gcsfuse-bookworm main" ' \

           '| sudo tee /etc/apt/sources.list.d/gcsfuse.list ' \

           '&& sudo apt-get update && sudo apt-get install -y gcsfuse'

)

# Upload the key and mount

mount_path = '/home/daytona/gcs'

key_path = '/home/daytona/.gcs-key.json'

sandbox.fs.upload_file(service_account_key, key_path)

sandbox.process.exec(command: "chmod 600 #{key_path}")

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "gcsfuse --key-file=#{key_path} my-gcs-bucket #{mount_path}")

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

// GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

serviceAccountKey := []byte(os.Getenv("GCS_SERVICE_ACCOUNT_KEY"))

sandbox, err := client.Create(ctx, types.SnapshotParams{})

if err != nil {

  log.Fatal(err)

}

// Install gcsfuse from the bookworm repo (works on Trixie)

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo mkdir -p /etc/apt/keyrings && "+

    "curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | "+

    "sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `echo "deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] `+

    `https://packages.cloud.google.com/apt gcsfuse-bookworm main" | `+

    `sudo tee /etc/apt/sources.list.d/gcsfuse.list && `+

    `sudo apt-get update && sudo apt-get install -y gcsfuse`); err != nil {

  log.Fatal(err)

}

// Upload the key and mount

mountPath := "/home/daytona/gcs"

keyPath := "/home/daytona/.gcs-key.json"

if err := sandbox.FileSystem.UploadFile(ctx, serviceAccountKey, keyPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "chmod 600 "+keyPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "gcsfuse --key-file="+keyPath+" my-gcs-bucket "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // GCS_SERVICE_ACCOUNT_KEY holds the full service account JSON as a string

            byte[] serviceAccountKey = System.getenv("GCS_SERVICE_ACCOUNT_KEY")

                .getBytes(StandardCharsets.UTF_8);

            Sandbox sandbox = daytona.create(new CreateSandboxFromSnapshotParams());

            // Install gcsfuse from the bookworm repo (works on Trixie)

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg");

            sandbox.getProcess().executeCommand(

                "sudo mkdir -p /etc/apt/keyrings "

                    + "&& curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg "

                    + "| sudo gpg --dearmor -o /etc/apt/keyrings/gcsfuse.gpg");

            sandbox.getProcess().executeCommand(

                "echo \"deb [signed-by=/etc/apt/keyrings/gcsfuse.gpg] "

                    + "https://packages.cloud.google.com/apt gcsfuse-bookworm main\" "

                    + "| sudo tee /etc/apt/sources.list.d/gcsfuse.list "

                    + "&& sudo apt-get update && sudo apt-get install -y gcsfuse");

            // Upload the key and mount

            String mountPath = "/home/daytona/gcs";

            String keyPath = "/home/daytona/.gcs-key.json";

            sandbox.fs.uploadFile(serviceAccountKey, keyPath);

            sandbox.getProcess().executeCommand("chmod 600 " + keyPath);

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "gcsfuse --key-file=" + keyPath + " my-gcs-bucket " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-an-azure-blob-container) Mount an Azure Blob container

[Section titled “Mount an Azure Blob container”](https://www.daytona.io/docs/en/mount-external-storage/#mount-an-azure-blob-container)

Mount an Azure Blob container using [blobfuse2 ↗](https://github.com/Azure/azure-storage-fuse) — Microsoft’s official FUSE client.

**Credentials** — set `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, and `AZURE_STORAGE_ACCOUNT_KEY` in your local environment. The snippets below pass them into the sandbox via `envVars`, and `blobfuse2` reads them from its YAML config.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-5) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-5)

Build a snapshot with `blobfuse2` and required FUSE compatibility setup preinstalled, then launch all Azure-enabled sandboxes from that snapshot. This is the recommended path for stable environments because dependency and compatibility work runs once during snapshot creation.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-5) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-5)

Create a reusable snapshot that installs `blobfuse2`, configures required FUSE dependencies, and applies the Trixie compatibility steps. This ensures Azure mounts work out of the box in sandboxes launched from `fuse-azure`.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-709)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-710)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-711)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-712)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-713)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget",

    # Microsoft's apt repo (use bookworm packages on Trixie)

    "wget -qO- https://packages.microsoft.com/keys/microsoft.asc "

    "| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg",

    'echo "deb [arch=$(dpkg --print-architecture) '\
\
    'signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] '

    'https://packages.microsoft.com/debian/12/prod bookworm main" '

    "| sudo tee /etc/apt/sources.list.d/microsoft-prod.list",

    "sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3",

    # libfuse3.so.3 compat symlink for Trixie (see :::caution above)

    'src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null '

    "| sort -V | tail -1) "

    '&& sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" '

    "&& sudo ldconfig",

    "sudo touch /etc/fuse.conf "

    '&& grep -qxF "user_allow_other" /etc/fuse.conf '

    '|| echo "user_allow_other" | sudo tee -a /etc/fuse.conf',

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-azure", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget',

  // Microsoft's apt repo (use bookworm packages on Trixie)

  'wget -qO- https://packages.microsoft.com/keys/microsoft.asc ' +

    '| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg',

  'echo "deb [arch=$(dpkg --print-architecture) ' +\
\
    'signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] ' +

    'https://packages.microsoft.com/debian/12/prod bookworm main" ' +

    '| sudo tee /etc/apt/sources.list.d/microsoft-prod.list',

  'sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3',

  // libfuse3.so.3 compat symlink for Trixie (see :::caution above)

  'src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null ' +

    '| sort -V | tail -1) ' +

    '&& sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" ' +

    '&& sudo ldconfig',

  'sudo touch /etc/fuse.conf ' +

    '&& grep -qxF "user_allow_other" /etc/fuse.conf ' +

    '|| echo "user_allow_other" | sudo tee -a /etc/fuse.conf',

)

await daytona.snapshot.create(

  { name: 'fuse-azure', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget',

    # Microsoft's apt repo (use bookworm packages on Trixie)

    'wget -qO- https://packages.microsoft.com/keys/microsoft.asc ' \

    '| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg',

    'echo "deb [arch=$(dpkg --print-architecture) ' \\
\
    'signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] ' \

    'https://packages.microsoft.com/debian/12/prod bookworm main" ' \

    '| sudo tee /etc/apt/sources.list.d/microsoft-prod.list',

    'sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3',

    # libfuse3.so.3 compat symlink for Trixie

    'src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null ' \

    '| sort -V | tail -1) ' \

    '&& sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" ' \

    '&& sudo ldconfig',

    'sudo touch /etc/fuse.conf ' \

    '&& grep -qxF "user_allow_other" /etc/fuse.conf ' \

    '|| echo "user_allow_other" | sudo tee -a /etc/fuse.conf'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-azure', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget").

  // Microsoft's apt repo (use bookworm packages on Trixie)

  Run("wget -qO- https://packages.microsoft.com/keys/microsoft.asc | " +

    "sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg").

  Run(`echo "deb [arch=$(dpkg --print-architecture) ` +\
\
    `signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] ` +

    `https://packages.microsoft.com/debian/12/prod bookworm main" | ` +

    `sudo tee /etc/apt/sources.list.d/microsoft-prod.list`).

  Run("sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3").

  // libfuse3.so.3 compat symlink for Trixie

  Run(`src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null | sort -V | tail -1) && ` +

    `sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" && sudo ldconfig`).

  Run(`sudo touch /etc/fuse.conf && grep -qxF "user_allow_other" /etc/fuse.conf || ` +

    `echo "user_allow_other" | sudo tee -a /etc/fuse.conf`)

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-azure",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget",

                    // Microsoft's apt repo (use bookworm packages on Trixie)

                    "wget -qO- https://packages.microsoft.com/keys/microsoft.asc "

                        + "| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg",

                    "echo \"deb [arch=$(dpkg --print-architecture) "\
\
                        + "signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] "

                        + "https://packages.microsoft.com/debian/12/prod bookworm main\" "

                        + "| sudo tee /etc/apt/sources.list.d/microsoft-prod.list",

                    "sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3",

                    // libfuse3.so.3 compat symlink for Trixie

                    "src=$(find /usr/lib /lib -name \"libfuse3.so.3.*\" -type f 2>/dev/null "

                        + "| sort -V | tail -1) "

                        + "&& sudo ln -sfn \"$src\" \"$(dirname \"$src\")/libfuse3.so.3\" "

                        + "&& sudo ldconfig",

                    "sudo touch /etc/fuse.conf "

                        + "&& grep -qxF \"user_allow_other\" /etc/fuse.conf "

                        + "|| echo \"user_allow_other\" | sudo tee -a /etc/fuse.conf"

                );

            daytona.snapshot().create("fuse-azure", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-5) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-5)

`blobfuse2` reads its configuration from a YAML file. Build it with your account credentials and upload it into the sandbox.

The YAML below tells `blobfuse2` three things: **where to connect** (the `azstorage:` block — your storage account, the container you want to mount, the endpoint URL, and the auth method), **what to enable** (the `components:` list — the FUSE interface itself, a content cache, a metadata cache, and the Azure backend), and **how to log**. The cache components use sensible defaults when listed without their own top-level config blocks; add explicit `block_cache:` / `attr_cache:` blocks later if you need to tune cache sizes or timeouts. Note that in Azure terminology, a “container” is the equivalent of an S3 bucket — it’s specified inside the YAML rather than passed as a command-line argument.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-714)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-715)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-716)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-717)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-718)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="fuse-azure"))

mount_path = "/home/daytona/azure"

config_path = "/home/daytona/.blobfuse2.yaml"

account = os.environ["AZURE_STORAGE_ACCOUNT"]

container = os.environ["AZURE_STORAGE_CONTAINER"]

account_key = os.environ["AZURE_STORAGE_ACCOUNT_KEY"]

config = f"""\

allow-other: true

logging:

  type: syslog

  level: log_warning

components:

  - libfuse

  - block_cache

  - attr_cache

  - azstorage

azstorage:

  type: block

  account-name: {account}

  container: {container}

  endpoint: https://{account}.blob.core.windows.net

  auth-type: key

  account-key: {account_key}

"""

sandbox.fs.upload_file(config.encode(), config_path)

sandbox.process.exec(f"chmod 600 {config_path}")

# Mount the container

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"blobfuse2 mount --config-file={config_path} {mount_path}")

# Use the mount

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({ snapshot: 'fuse-azure' })

const mountPath = '/home/daytona/azure'

const configPath = '/home/daytona/.blobfuse2.yaml'

const account = process.env.AZURE_STORAGE_ACCOUNT!

const container = process.env.AZURE_STORAGE_CONTAINER!

const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!

const config = `allow-other: true

logging:

  type: syslog

  level: log_warning

components:

  - libfuse

  - block_cache

  - attr_cache

  - azstorage

azstorage:

  type: block

  account-name: ${account}

  container: ${container}

  endpoint: https://${account}.blob.core.windows.net

  auth-type: key

  account-key: ${accountKey}

`

await sandbox.fs.uploadFile(Buffer.from(config), configPath)

await sandbox.process.executeCommand(`chmod 600 ${configPath}`)

// Mount the container

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`blobfuse2 mount --config-file=${configPath} ${mountPath}`)

// Use the mount

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'fuse-azure')

)

mount_path = '/home/daytona/azure'

config_path = '/home/daytona/.blobfuse2.yaml'

account = ENV.fetch('AZURE_STORAGE_ACCOUNT')

container = ENV.fetch('AZURE_STORAGE_CONTAINER')

account_key = ENV.fetch('AZURE_STORAGE_ACCOUNT_KEY')

config = <<~YAML

  allow-other: true

  logging:

    type: syslog

    level: log_warning

  components:

    - libfuse

    - block_cache

    - attr_cache

    - azstorage

  azstorage:

    type: block

    account-name: #{account}

    container: #{container}

    endpoint: https://#{account}.blob.core.windows.net

    auth-type: key

    account-key: #{account_key}

YAML

sandbox.fs.upload_file(config, config_path)

sandbox.process.exec(command: "chmod 600 #{config_path}")

# Mount the container

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "blobfuse2 mount --config-file=#{config_path} #{mount_path}")

# Use the mount

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-azure",

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/azure"

configPath := "/home/daytona/.blobfuse2.yaml"

account := os.Getenv("AZURE_STORAGE_ACCOUNT")

container := os.Getenv("AZURE_STORAGE_CONTAINER")

accountKey := os.Getenv("AZURE_STORAGE_ACCOUNT_KEY")

config := fmt.Sprintf(`allow-other: true

logging:

  type: syslog

  level: log_warning

components:

  - libfuse

  - block_cache

  - attr_cache

  - azstorage

azstorage:

  type: block

  account-name: %s

  container: %s

  endpoint: https://%s.blob.core.windows.net

  auth-type: key

  account-key: %s

`, account, container, account, accountKey)

if err := sandbox.FileSystem.UploadFile(ctx, []byte(config), configPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "chmod 600 "+configPath); err != nil {

  log.Fatal(err)

}

// Mount the container

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "blobfuse2 mount --config-file="+configPath+" "+mountPath); err != nil {

  log.Fatal(err)

}

// Use the mount

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-azure");

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/azure";

            String configPath = "/home/daytona/.blobfuse2.yaml";

            String account = System.getenv("AZURE_STORAGE_ACCOUNT");

            String container = System.getenv("AZURE_STORAGE_CONTAINER");

            String accountKey = System.getenv("AZURE_STORAGE_ACCOUNT_KEY");

            String config = "allow-other: true\n"

                + "logging:\n"

                + "  type: syslog\n"

                + "  level: log_warning\n"

                + "components:\n"

                + "  - libfuse\n"

                + "  - block_cache\n"

                + "  - attr_cache\n"

                + "  - azstorage\n"

                + "azstorage:\n"

                + "  type: block\n"

                + "  account-name: " + account + "\n"

                + "  container: " + container + "\n"

                + "  endpoint: https://" + account + ".blob.core.windows.net\n"

                + "  auth-type: key\n"

                + "  account-key: " + accountKey + "\n";

            sandbox.fs.uploadFile(config.getBytes(StandardCharsets.UTF_8), configPath);

            sandbox.getProcess().executeCommand("chmod 600 " + configPath);

            // Mount the container

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "blobfuse2 mount --config-file=" + configPath + " " + mountPath);

            // Use the mount

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-5) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-5)

Start from a default sandbox and install `blobfuse2` during startup before writing the config and mounting the container. This is useful for quick validation and experiments, with the tradeoff of slower cold starts and repeated setup on each sandbox launch.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-719)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-720)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-721)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-722)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-723)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

sandbox = daytona.create(CreateSandboxBaseParams())

# Install blobfuse2

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget"

)

sandbox.process.exec(

    "wget -qO- https://packages.microsoft.com/keys/microsoft.asc "

    "| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg"

)

sandbox.process.exec(

    'echo "deb [arch=$(dpkg --print-architecture) '\
\
    'signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] '

    'https://packages.microsoft.com/debian/12/prod bookworm main" '

    "| sudo tee /etc/apt/sources.list.d/microsoft-prod.list "

    "&& sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3"

)

# libfuse3.so.3 compat symlink for Trixie

sandbox.process.exec(

    'src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null '

    "| sort -V | tail -1) "

    '&& sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" '

    "&& sudo ldconfig"

)

# Build config and mount

mount_path = "/home/daytona/azure"

config_path = "/home/daytona/.blobfuse2.yaml"

account = os.environ["AZURE_STORAGE_ACCOUNT"]

container = os.environ["AZURE_STORAGE_CONTAINER"]

account_key = os.environ["AZURE_STORAGE_ACCOUNT_KEY"]

config = f"""\

allow-other: true

components:

  - libfuse

  - block_cache

  - attr_cache

  - azstorage

azstorage:

  type: block

  account-name: {account}

  container: {container}

  endpoint: https://{account}.blob.core.windows.net

  auth-type: key

  account-key: {account_key}

"""

sandbox.fs.upload_file(config.encode(), config_path)

sandbox.process.exec(f"chmod 600 {config_path}")

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"blobfuse2 mount --config-file={config_path} {mount_path}")

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create()

// Install blobfuse2

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget',

)

await sandbox.process.executeCommand(

  'wget -qO- https://packages.microsoft.com/keys/microsoft.asc ' +

    '| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg',

)

await sandbox.process.executeCommand(

  'echo "deb [arch=$(dpkg --print-architecture) ' +\
\
    'signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] ' +

    'https://packages.microsoft.com/debian/12/prod bookworm main" ' +

    '| sudo tee /etc/apt/sources.list.d/microsoft-prod.list ' +

    '&& sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3',

)

// libfuse3.so.3 compat symlink for Trixie

await sandbox.process.executeCommand(

  'src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null ' +

    '| sort -V | tail -1) ' +

    '&& sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" ' +

    '&& sudo ldconfig',

)

// Build config and mount

const mountPath = '/home/daytona/azure'

const configPath = '/home/daytona/.blobfuse2.yaml'

const account = process.env.AZURE_STORAGE_ACCOUNT!

const container = process.env.AZURE_STORAGE_CONTAINER!

const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY!

const config = `allow-other: true

components:

  - libfuse

  - block_cache

  - attr_cache

  - azstorage

azstorage:

  type: block

  account-name: ${account}

  container: ${container}

  endpoint: https://${account}.blob.core.windows.net

  auth-type: key

  account-key: ${accountKey}

`

await sandbox.fs.uploadFile(Buffer.from(config), configPath)

await sandbox.process.executeCommand(`chmod 600 ${configPath}`)

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`blobfuse2 mount --config-file=${configPath} ${mountPath}`)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(Daytona::CreateSandboxBaseParams.new)

# Install blobfuse2

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget'

)

sandbox.process.exec(

  command: 'wget -qO- https://packages.microsoft.com/keys/microsoft.asc ' \

           '| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg'

)

sandbox.process.exec(

  command: 'echo "deb [arch=$(dpkg --print-architecture) ' \\
\
           'signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] ' \

           'https://packages.microsoft.com/debian/12/prod bookworm main" ' \

           '| sudo tee /etc/apt/sources.list.d/microsoft-prod.list ' \

           '&& sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3'

)

# libfuse3.so.3 compat symlink for Trixie

sandbox.process.exec(

  command: 'src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null ' \

           '| sort -V | tail -1) ' \

           '&& sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" ' \

           '&& sudo ldconfig'

)

# Build config and mount

mount_path = '/home/daytona/azure'

config_path = '/home/daytona/.blobfuse2.yaml'

account = ENV.fetch('AZURE_STORAGE_ACCOUNT')

container = ENV.fetch('AZURE_STORAGE_CONTAINER')

account_key = ENV.fetch('AZURE_STORAGE_ACCOUNT_KEY')

config = <<~YAML

  allow-other: true

  components:

    - libfuse

    - block_cache

    - attr_cache

    - azstorage

  azstorage:

    type: block

    account-name: #{account}

    container: #{container}

    endpoint: https://#{account}.blob.core.windows.net

    auth-type: key

    account-key: #{account_key}

YAML

sandbox.fs.upload_file(config, config_path)

sandbox.process.exec(command: "chmod 600 #{config_path}")

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "blobfuse2 mount --config-file=#{config_path} #{mount_path}")

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{})

if err != nil {

  log.Fatal(err)

}

// Install blobfuse2

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "wget -qO- https://packages.microsoft.com/keys/microsoft.asc | "+

    "sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `echo "deb [arch=$(dpkg --print-architecture) `+\
\
    `signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] `+

    `https://packages.microsoft.com/debian/12/prod bookworm main" | `+

    `sudo tee /etc/apt/sources.list.d/microsoft-prod.list && `+

    `sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3`); err != nil {

  log.Fatal(err)

}

// libfuse3.so.3 compat symlink for Trixie

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `src=$(find /usr/lib /lib -name "libfuse3.so.3.*" -type f 2>/dev/null | sort -V | tail -1) && `+

    `sudo ln -sfn "$src" "$(dirname "$src")/libfuse3.so.3" && sudo ldconfig`); err != nil {

  log.Fatal(err)

}

// Build config and mount

mountPath := "/home/daytona/azure"

configPath := "/home/daytona/.blobfuse2.yaml"

account := os.Getenv("AZURE_STORAGE_ACCOUNT")

container := os.Getenv("AZURE_STORAGE_CONTAINER")

accountKey := os.Getenv("AZURE_STORAGE_ACCOUNT_KEY")

config := fmt.Sprintf(`allow-other: true

components:

  - libfuse

  - block_cache

  - attr_cache

  - azstorage

azstorage:

  type: block

  account-name: %s

  container: %s

  endpoint: https://%s.blob.core.windows.net

  auth-type: key

  account-key: %s

`, account, container, account, accountKey)

if err := sandbox.FileSystem.UploadFile(ctx, []byte(config), configPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "chmod 600 "+configPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "blobfuse2 mount --config-file="+configPath+" "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox sandbox = daytona.create(new CreateSandboxFromSnapshotParams());

            // Install blobfuse2

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends ca-certificates curl gnupg wget");

            sandbox.getProcess().executeCommand(

                "wget -qO- https://packages.microsoft.com/keys/microsoft.asc "

                    + "| sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg");

            sandbox.getProcess().executeCommand(

                "echo \"deb [arch=$(dpkg --print-architecture) "\
\
                    + "signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] "

                    + "https://packages.microsoft.com/debian/12/prod bookworm main\" "

                    + "| sudo tee /etc/apt/sources.list.d/microsoft-prod.list "

                    + "&& sudo apt-get update && sudo apt-get install -y blobfuse2 fuse3");

            // libfuse3.so.3 compat symlink for Trixie

            sandbox.getProcess().executeCommand(

                "src=$(find /usr/lib /lib -name \"libfuse3.so.3.*\" -type f 2>/dev/null "

                    + "| sort -V | tail -1) "

                    + "&& sudo ln -sfn \"$src\" \"$(dirname \"$src\")/libfuse3.so.3\" "

                    + "&& sudo ldconfig");

            // Build config and mount

            String mountPath = "/home/daytona/azure";

            String configPath = "/home/daytona/.blobfuse2.yaml";

            String account = System.getenv("AZURE_STORAGE_ACCOUNT");

            String container = System.getenv("AZURE_STORAGE_CONTAINER");

            String accountKey = System.getenv("AZURE_STORAGE_ACCOUNT_KEY");

            String config = "allow-other: true\n"

                + "components:\n"

                + "  - libfuse\n"

                + "  - block_cache\n"

                + "  - attr_cache\n"

                + "  - azstorage\n"

                + "azstorage:\n"

                + "  type: block\n"

                + "  account-name: " + account + "\n"

                + "  container: " + container + "\n"

                + "  endpoint: https://" + account + ".blob.core.windows.net\n"

                + "  auth-type: key\n"

                + "  account-key: " + accountKey + "\n";

            sandbox.fs.uploadFile(config.getBytes(StandardCharsets.UTF_8), configPath);

            sandbox.getProcess().executeCommand("chmod 600 " + configPath);

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "blobfuse2 mount --config-file=" + configPath + " " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-box-folder) Mount a Box folder

[Section titled “Mount a Box folder”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-box-folder)

Mount a Box folder using [rclone ↗](https://rclone.org/box/) — Box has no official Linux FUSE client, and rclone’s Box backend is the standard way to expose Box content as a mounted directory.

rclone supports two Box authentication methods: **OAuth**, which works with any Box account (personal, developer, or business) and requires a one-time browser authorization on your local machine, and **JWT server authentication** for enterprise-owned Platform Apps, which is browser-free but requires a Box admin to authorize the app.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#install-rclone) Install rclone

[Section titled “Install rclone”](https://www.daytona.io/docs/en/mount-external-storage/#install-rclone)

rclone must be present in the sandbox before mounting. This step is auth-agnostic — the same setup serves every Box authentication method, so it is documented once here.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-6) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-6)

Create a reusable snapshot that installs rclone and its FUSE dependency. Debian’s packaged rclone lags far behind current releases, so the snippets below use rclone’s official install script, which installs the latest stable binary.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-724)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-725)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-726)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-727)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-728)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip",

    "curl -fsSL https://rclone.org/install.sh | sudo bash",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-box", image=image),

    on_logs=print,

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip',

  'curl -fsSL https://rclone.org/install.sh | sudo bash',

)

await daytona.snapshot.create(

  { name: 'fuse-box', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip',

    'curl -fsSL https://rclone.org/install.sh | sudo bash'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-box', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip").

  Run("curl -fsSL https://rclone.org/install.sh | sudo bash")

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-box",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip",

                    "curl -fsSL https://rclone.org/install.sh | sudo bash"

                );

            daytona.snapshot().create("fuse-box", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-6) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-6)

To skip snapshot management, install rclone at sandbox startup instead — create a default sandbox and run the install commands before registering the remote. This adds time to every sandbox startup, but requires no snapshot maintenance. The mount flow is identical for both install paths.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-729)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-730)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-731)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-732)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-733)

```
from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

sandbox = daytona.create(CreateSandboxBaseParams())

# Install rclone at runtime

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip"

)

sandbox.process.exec("curl -fsSL https://rclone.org/install.sh | sudo bash")

response = sandbox.process.exec("rclone version")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create()

// Install rclone at runtime

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip',

)

await sandbox.process.executeCommand('curl -fsSL https://rclone.org/install.sh | sudo bash')

const response = await sandbox.process.executeCommand('rclone version')

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(Daytona::CreateSandboxBaseParams.new)

# Install rclone at runtime

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip'

)

sandbox.process.exec(command: 'curl -fsSL https://rclone.org/install.sh | sudo bash')

response = sandbox.process.exec(command: 'rclone version')

puts response.result
```

```
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

sandbox, err := client.Create(ctx, types.SnapshotParams{})

if err != nil {

  log.Fatal(err)

}

// Install rclone at runtime

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "curl -fsSL https://rclone.org/install.sh | sudo bash"); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "rclone version")

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox sandbox = daytona.create(new CreateSandboxFromSnapshotParams());

            // Install rclone at runtime

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                    + "&& sudo apt-get install -y --no-install-recommends ca-certificates curl fuse3 unzip");

            sandbox.getProcess().executeCommand(

                "curl -fsSL https://rclone.org/install.sh | sudo bash");

            ExecuteResponse response = sandbox.getProcess().executeCommand("rclone version");

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-with-oauth) Mount with OAuth

[Section titled “Mount with OAuth”](https://www.daytona.io/docs/en/mount-external-storage/#mount-with-oauth)

Authorize once on your local machine with a browser, then every sandbox mounts headlessly with the resulting token. No enterprise plan or admin approval is involved.

**Credentials** — create an [OAuth 2.0 app ↗](https://developer.box.com/guides/authentication/oauth2/oauth2-setup/) in the Box Developer Console with the redirect URI set to `http://127.0.0.1:53682/` — the fixed local port rclone listens on while authorizing. Install [rclone ↗](https://rclone.org/install/) on your local machine and run:

```
rclone authorize box YOUR_CLIENT_ID YOUR_CLIENT_SECRET
```

A browser window opens for Box login; after you approve, rclone prints a single-line token JSON. Set `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, and `BOX_RCLONE_TOKEN` (the printed JSON) in your local environment. The snippets below pass them into the sandbox via `envVars`. Alternatively, run `rclone authorize box` with no arguments to authorize rclone’s own built-in Box app — then no `client_id`/`client_secret` exist at all, so omit those two values from the snippets and pass only `BOX_RCLONE_TOKEN`. The tradeoff is that all rclone users worldwide share that app’s Box rate limits, so use your own app for production workloads.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-6) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-6)

Pass the OAuth app credentials and token into the sandbox as environment variables, register them as an rclone remote, and mount it. `--non-interactive` makes a bad token fail fast instead of waiting for a browser login that can never happen inside a sandbox, and `--vfs-cache-mode writes` is required because Box only accepts whole-file uploads. rclone refreshes the access token automatically for the lifetime of the sandbox. If you installed rclone at runtime instead of launching from the `fuse-box` snapshot, create the sandbox with the same `envVars`, run the install commands first, and continue identically from the remote registration step.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-734)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-735)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-736)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-737)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-738)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-box",

        env_vars={

            "BOX_CLIENT_ID": os.environ["BOX_CLIENT_ID"],

            "BOX_CLIENT_SECRET": os.environ["BOX_CLIENT_SECRET"],

            "BOX_RCLONE_TOKEN": os.environ["BOX_RCLONE_TOKEN"],

        },

    )

)

mount_path = "/home/daytona/box"

# Register the remote; rclone refreshes the token automatically from here on

sandbox.process.exec(

    'rclone config create mybox box client_id="$BOX_CLIENT_ID" '

    'client_secret="$BOX_CLIENT_SECRET" token="$BOX_RCLONE_TOKEN" --non-interactive'

)

# Mount the remote

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"rclone mount mybox: {mount_path} --daemon --vfs-cache-mode writes")

# Use the mount

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'fuse-box',

  envVars: {

    BOX_CLIENT_ID: process.env.BOX_CLIENT_ID!,

    BOX_CLIENT_SECRET: process.env.BOX_CLIENT_SECRET!,

    BOX_RCLONE_TOKEN: process.env.BOX_RCLONE_TOKEN!,

  },

})

const mountPath = '/home/daytona/box'

// Register the remote; rclone refreshes the token automatically from here on

await sandbox.process.executeCommand(

  'rclone config create mybox box client_id="$BOX_CLIENT_ID" ' +

    'client_secret="$BOX_CLIENT_SECRET" token="$BOX_RCLONE_TOKEN" --non-interactive',

)

// Mount the remote

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`rclone mount mybox: ${mountPath} --daemon --vfs-cache-mode writes`)

// Use the mount

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-box',

    env_vars: {

      'BOX_CLIENT_ID' => ENV.fetch('BOX_CLIENT_ID'),

      'BOX_CLIENT_SECRET' => ENV.fetch('BOX_CLIENT_SECRET'),

      'BOX_RCLONE_TOKEN' => ENV.fetch('BOX_RCLONE_TOKEN')

    }

  )

)

mount_path = '/home/daytona/box'

# Register the remote; rclone refreshes the token automatically from here on

sandbox.process.exec(

  command: 'rclone config create mybox box client_id="$BOX_CLIENT_ID" ' \

           'client_secret="$BOX_CLIENT_SECRET" token="$BOX_RCLONE_TOKEN" --non-interactive'

)

# Mount the remote

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "rclone mount mybox: #{mount_path} --daemon --vfs-cache-mode writes")

# Use the mount

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-box",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "BOX_CLIENT_ID":     os.Getenv("BOX_CLIENT_ID"),

      "BOX_CLIENT_SECRET": os.Getenv("BOX_CLIENT_SECRET"),

      "BOX_RCLONE_TOKEN":  os.Getenv("BOX_RCLONE_TOKEN"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/box"

// Register the remote; rclone refreshes the token automatically from here on

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `rclone config create mybox box client_id="$BOX_CLIENT_ID" `+

    `client_secret="$BOX_CLIENT_SECRET" token="$BOX_RCLONE_TOKEN" --non-interactive`); err != nil {

  log.Fatal(err)

}

// Mount the remote

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "rclone mount mybox: "+mountPath+" --daemon --vfs-cache-mode writes"); err != nil {

  log.Fatal(err)

}

// Use the mount

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-box");

            params.setEnvVars(Map.of(

                "BOX_CLIENT_ID", System.getenv("BOX_CLIENT_ID"),

                "BOX_CLIENT_SECRET", System.getenv("BOX_CLIENT_SECRET"),

                "BOX_RCLONE_TOKEN", System.getenv("BOX_RCLONE_TOKEN")

            ));

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/box";

            // Register the remote; rclone refreshes the token automatically from here on

            sandbox.getProcess().executeCommand(

                "rclone config create mybox box client_id=\"$BOX_CLIENT_ID\" "

                    + "client_secret=\"$BOX_CLIENT_SECRET\" token=\"$BOX_RCLONE_TOKEN\" --non-interactive");

            // Mount the remote

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "rclone mount mybox: " + mountPath + " --daemon --vfs-cache-mode writes");

            // Use the mount

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-with-jwt-server-authentication) Mount with JWT server authentication

[Section titled “Mount with JWT server authentication”](https://www.daytona.io/docs/en/mount-external-storage/#mount-with-jwt-server-authentication)

JWT server authentication is fully non-interactive — the app authenticates with a signed assertion instead of a user login, so tokens can be minted unattended, which suits fleets of sandboxes sharing one identity. It requires an app owned by a Box enterprise: a free [developer account ↗](https://developer.box.com/) works, but on a personal account the generated config contains `"enterpriseID": "0"` and authentication fails.

**Credentials** — create a [Platform App with JWT authentication ↗](https://developer.box.com/guides/authentication/jwt/jwt-setup/) in the Box Developer Console — select **JWT**, not the Client Credentials Grant the console recommends, because rclone’s Box backend only supports JWT for server authentication. Go to **Configuration** → **Add and Manage Public Keys**, and click **Generate a Public/Private Keypair** — this downloads the app’s config JSON (keypair generation requires 2FA on your Box account). Then have a Box admin [authorize the app ↗](https://developer.box.com/guides/authorization/) for your enterprise. Set `BOX_CONFIG_JSON` in your local environment to the full contents of that JSON file. The snippets below read it from there and upload it into the sandbox via `sandbox.fs`.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-7) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-7)

Upload the JWT config into the sandbox, register it as an rclone remote, and mount the remote. `rclone config create` fetches an access token via JWT during remote creation, so a bad key or an unauthorized app fails at this step rather than at mount time. Unlike OAuth tokens, there is nothing to rotate or hand out per sandbox — every sandbox uploads the same config file and mints its own tokens.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-739)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-740)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-741)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-742)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-743)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

# BOX_CONFIG_JSON holds the full Platform App config JSON as a string

box_config = os.environ["BOX_CONFIG_JSON"].encode()

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="fuse-box"))

mount_path = "/home/daytona/box"

config_path = "/home/daytona/.box-config.json"

# Upload the config file into the sandbox

sandbox.fs.upload_file(box_config, config_path)

sandbox.process.exec(f"chmod 600 {config_path}")

# Register the remote (fetches an access token via JWT)

sandbox.process.exec(

    f"rclone config create mybox box box_config_file={config_path} "

    "box_sub_type=enterprise --non-interactive"

)

# Mount the remote

sandbox.process.exec(f"mkdir -p {mount_path}")

sandbox.process.exec(f"rclone mount mybox: {mount_path} --daemon --vfs-cache-mode writes")

# Use the mount

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// BOX_CONFIG_JSON holds the full Platform App config JSON as a string

const boxConfig = Buffer.from(process.env.BOX_CONFIG_JSON!)

const sandbox = await daytona.create({ snapshot: 'fuse-box' })

const mountPath = '/home/daytona/box'

const configPath = '/home/daytona/.box-config.json'

// Upload the config file into the sandbox

await sandbox.fs.uploadFile(boxConfig, configPath)

await sandbox.process.executeCommand(`chmod 600 ${configPath}`)

// Register the remote (fetches an access token via JWT)

await sandbox.process.executeCommand(

  `rclone config create mybox box box_config_file=${configPath} ` +

    'box_sub_type=enterprise --non-interactive',

)

// Mount the remote

await sandbox.process.executeCommand(`mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(`rclone mount mybox: ${mountPath} --daemon --vfs-cache-mode writes`)

// Use the mount

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# BOX_CONFIG_JSON holds the full Platform App config JSON as a string

box_config = ENV.fetch('BOX_CONFIG_JSON')

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'fuse-box')

)

mount_path = '/home/daytona/box'

config_path = '/home/daytona/.box-config.json'

# Upload the config file into the sandbox

sandbox.fs.upload_file(box_config, config_path)

sandbox.process.exec(command: "chmod 600 #{config_path}")

# Register the remote (fetches an access token via JWT)

sandbox.process.exec(

  command: "rclone config create mybox box box_config_file=#{config_path} " \

           'box_sub_type=enterprise --non-interactive'

)

# Mount the remote

sandbox.process.exec(command: "mkdir -p #{mount_path}")

sandbox.process.exec(command: "rclone mount mybox: #{mount_path} --daemon --vfs-cache-mode writes")

# Use the mount

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

// BOX_CONFIG_JSON holds the full Platform App config JSON as a string

boxConfig := []byte(os.Getenv("BOX_CONFIG_JSON"))

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-box",

})

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/box"

configPath := "/home/daytona/.box-config.json"

// Upload the config file into the sandbox

if err := sandbox.FileSystem.UploadFile(ctx, boxConfig, configPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "chmod 600 "+configPath); err != nil {

  log.Fatal(err)

}

// Register the remote (fetches an access token via JWT)

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "rclone config create mybox box box_config_file="+configPath+

    " box_sub_type=enterprise --non-interactive"); err != nil {

  log.Fatal(err)

}

// Mount the remote

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "rclone mount mybox: "+mountPath+" --daemon --vfs-cache-mode writes"); err != nil {

  log.Fatal(err)

}

// Use the mount

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // BOX_CONFIG_JSON holds the full Platform App config JSON as a string

            byte[] boxConfig = System.getenv("BOX_CONFIG_JSON")

                .getBytes(StandardCharsets.UTF_8);

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-box");

            Sandbox sandbox = daytona.create(params);

            String mountPath = "/home/daytona/box";

            String configPath = "/home/daytona/.box-config.json";

            // Upload the config file into the sandbox

            sandbox.fs.uploadFile(boxConfig, configPath);

            sandbox.getProcess().executeCommand("chmod 600 " + configPath);

            // Register the remote (fetches an access token via JWT)

            sandbox.getProcess().executeCommand(

                "rclone config create mybox box box_config_file=" + configPath

                    + " box_sub_type=enterprise --non-interactive");

            // Mount the remote

            sandbox.getProcess().executeCommand("mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "rclone mount mybox: " + mountPath + " --daemon --vfs-cache-mode writes");

            // Use the mount

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-an-archil-disk) Mount an Archil disk

[Section titled “Mount an Archil disk”](https://www.daytona.io/docs/en/mount-external-storage/#mount-an-archil-disk)

[Archil ↗](https://archil.com/) is an infinite, elastic, POSIX file system that automatically synchronizes to object storage like S3, R2, and Azure Blob. You should use Archil when you need to mount a bucket to your Daytona sandbox, but need higher out-of-the-box performance than traditional FUSE mounts. Archil achieves higher performance by using shared SSD read and write caching in front of your object storage bucket. Archil disks are mounted as regular directories, scale to whatever your sandbox writes (you pay only for what you use), and can be [mounted by many sandboxes at once ↗](https://docs.archil.com/concepts/shared-disks), making them a natural fit for parallel agents that share state.

**Credentials** — set `ARCHIL_MOUNT_TOKEN` (a disk-scoped [mount token ↗](https://docs.archil.com/concepts/disk-users#disk-token-authorization) generated from the disk’s **Details** page in the [Archil console ↗](https://console.archil.com/)), `ARCHIL_REGION` (the disk’s region, e.g. `aws-us-east-1`), and `ARCHIL_DISK` (the owner-qualified disk name, e.g. `myorg/my-disk`, or disk ID like `dsk-0123456789abcdef`) in your local environment. The snippets below pass them into the sandbox via `envVars`, and the `archil` CLI reads them from there.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-7) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-7)

Build a snapshot with the `archil` CLI preinstalled, then launch Archil-enabled sandboxes from that snapshot. You still authenticate and mount at runtime, but installation is no longer part of each sandbox startup sequence.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-6) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-6)

Create a reusable snapshot that installs the `archil` CLI. The `daytonaio/sandbox` base image ships Debian Trixie which doesn’t include `libfuse2`, and the `archil` CLI links against it, so we apt-install it before the Archil installer. On Trixie the package is named `libfuse2t64`; installing `libfuse2` also works because it is a transitional package that pulls in `libfuse2t64`.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-744)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-745)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-746)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-747)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-748)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates",

    "curl -fsSL https://archil.com/install | sh",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-archil", image=image),

    on_logs=lambda chunk: print(chunk, end="", flush=True),

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates',

  'curl -fsSL https://archil.com/install | sh',

)

await daytona.snapshot.create(

  { name: 'fuse-archil', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'sudo apt-get update ' \

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates',

    'curl -fsSL https://archil.com/install | sh'

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-archil', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates").

  Run("curl -fsSL https://archil.com/install | sh")

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-archil",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "sudo apt-get update "

                        + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates",

                    "curl -fsSL https://archil.com/install | sh"

                );

            daytona.snapshot().create("fuse-archil", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-8) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-8)

Pass `ARCHIL_MOUNT_TOKEN`, `ARCHIL_REGION`, and `ARCHIL_DISK` to the sandbox via `envVars`. Your code then mounts the disk at `/home/daytona/archil` and hands ownership to the `daytona` user so non-root processes can read and write through the mount. The `chown` step works on exclusive (non-shared) mounts only; on mounts created with `--shared` or `--read-only` it fails with `Read-only file system`. See [Shared and read-only mounts](https://www.daytona.io/docs/en/mount-external-storage/#shared-and-read-only-mounts).

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-749)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-750)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-751)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-752)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-753)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

mount_path = "/home/daytona/archil"

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-archil",

        env_vars={

            "ARCHIL_MOUNT_TOKEN": os.environ["ARCHIL_MOUNT_TOKEN"],

            "ARCHIL_REGION": os.environ["ARCHIL_REGION"],

            "ARCHIL_DISK": os.environ["ARCHIL_DISK"],

        },

    )

)

sandbox.process.exec(f"sudo mkdir -p {mount_path}")

sandbox.process.exec(

    f"sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "

    f"$ARCHIL_DISK {mount_path} --region $ARCHIL_REGION"

)

# Exclusive mounts only; on --shared or --read-only mounts this fails

# with "Read-only file system" (see "Shared and read-only mounts" below)

sandbox.process.exec(f"sudo chown daytona:daytona {mount_path}")

# Read and write through the mount as if it were a local directory

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const mountPath = '/home/daytona/archil'

const sandbox = await daytona.create({

  snapshot: 'fuse-archil',

  envVars: {

    ARCHIL_MOUNT_TOKEN: process.env.ARCHIL_MOUNT_TOKEN!,

    ARCHIL_REGION: process.env.ARCHIL_REGION!,

    ARCHIL_DISK: process.env.ARCHIL_DISK!,

  },

})

await sandbox.process.executeCommand(`sudo mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(

  `sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount ` +

    `$ARCHIL_DISK ${mountPath} --region $ARCHIL_REGION`,

)

// Exclusive mounts only; on --shared or --read-only mounts this fails

// with "Read-only file system" (see "Shared and read-only mounts" below)

await sandbox.process.executeCommand(`sudo chown daytona:daytona ${mountPath}`)

// Read and write through the mount as if it were a local directory

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

mount_path = '/home/daytona/archil'

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-archil',

    env_vars: {

      'ARCHIL_MOUNT_TOKEN' => ENV.fetch('ARCHIL_MOUNT_TOKEN'),

      'ARCHIL_REGION' => ENV.fetch('ARCHIL_REGION'),

      'ARCHIL_DISK' => ENV.fetch('ARCHIL_DISK')

    }

  )

)

sandbox.process.exec(command: "sudo mkdir -p #{mount_path}")

sandbox.process.exec(

  command: "sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount " \

           "$ARCHIL_DISK #{mount_path} --region $ARCHIL_REGION"

)

# Exclusive mounts only; on --shared or --read-only mounts this fails

# with "Read-only file system" (see "Shared and read-only mounts" below)

sandbox.process.exec(command: "sudo chown daytona:daytona #{mount_path}")

# Read and write through the mount as if it were a local directory

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/archil"

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-archil",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "ARCHIL_MOUNT_TOKEN": os.Getenv("ARCHIL_MOUNT_TOKEN"),

      "ARCHIL_REGION":      os.Getenv("ARCHIL_REGION"),

      "ARCHIL_DISK":        os.Getenv("ARCHIL_DISK"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "sudo mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "+

    "$ARCHIL_DISK "+mountPath+" --region $ARCHIL_REGION"); err != nil {

  log.Fatal(err)

}

// Exclusive mounts only; on --shared or --read-only mounts this fails

// with "Read-only file system" (see "Shared and read-only mounts" below)

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo chown daytona:daytona "+mountPath); err != nil {

  log.Fatal(err)

}

// Read and write through the mount as if it were a local directory

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            String mountPath = "/home/daytona/archil";

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-archil");

            params.setEnvVars(Map.of(

                "ARCHIL_MOUNT_TOKEN", System.getenv("ARCHIL_MOUNT_TOKEN"),

                "ARCHIL_REGION", System.getenv("ARCHIL_REGION"),

                "ARCHIL_DISK", System.getenv("ARCHIL_DISK")

            ));

            Sandbox sandbox = daytona.create(params);

            sandbox.getProcess().executeCommand("sudo mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "

                + "$ARCHIL_DISK " + mountPath + " --region $ARCHIL_REGION");

            // Exclusive mounts only; on --shared or --read-only mounts this fails

            // with "Read-only file system" (see "Shared and read-only mounts" below)

            sandbox.getProcess().executeCommand("sudo chown daytona:daytona " + mountPath);

            // Read and write through the mount as if it were a local directory

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

To let multiple sandboxes mount the **same** disk concurrently, add `--shared` to `archil mount`. Shared mounts change how permissions and writes behave; see [Shared and read-only mounts](https://www.daytona.io/docs/en/mount-external-storage/#shared-and-read-only-mounts).

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-7) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-7)

Start from a default sandbox and install the `archil` CLI during startup before mounting the disk. This is useful when iterating quickly on mount behavior, with the tradeoff of slower cold starts for each sandbox.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-754)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-755)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-756)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-757)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-758)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

mount_path = "/home/daytona/archil"

sandbox = daytona.create(

    CreateSandboxBaseParams(

        env_vars={

            "ARCHIL_MOUNT_TOKEN": os.environ["ARCHIL_MOUNT_TOKEN"],

            "ARCHIL_REGION": os.environ["ARCHIL_REGION"],

            "ARCHIL_DISK": os.environ["ARCHIL_DISK"],

        },

    )

)

sandbox.process.exec(

    "sudo apt-get update "

    "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates"

)

sandbox.process.exec("curl -fsSL https://archil.com/install | sh")

sandbox.process.exec(f"sudo mkdir -p {mount_path}")

sandbox.process.exec(

    f"sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "

    f"$ARCHIL_DISK {mount_path} --region $ARCHIL_REGION"

)

# Exclusive mounts only; on --shared or --read-only mounts this fails

# with "Read-only file system" (see "Shared and read-only mounts" below)

sandbox.process.exec(f"sudo chown daytona:daytona {mount_path}")

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const mountPath = '/home/daytona/archil'

const sandbox = await daytona.create({

  envVars: {

    ARCHIL_MOUNT_TOKEN: process.env.ARCHIL_MOUNT_TOKEN!,

    ARCHIL_REGION: process.env.ARCHIL_REGION!,

    ARCHIL_DISK: process.env.ARCHIL_DISK!,

  },

})

await sandbox.process.executeCommand(

  'sudo apt-get update ' +

    '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates',

)

await sandbox.process.executeCommand('curl -fsSL https://archil.com/install | sh')

await sandbox.process.executeCommand(`sudo mkdir -p ${mountPath}`)

await sandbox.process.executeCommand(

  `sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount ` +

    `$ARCHIL_DISK ${mountPath} --region $ARCHIL_REGION`,

)

// Exclusive mounts only; on --shared or --read-only mounts this fails

// with "Read-only file system" (see "Shared and read-only mounts" below)

await sandbox.process.executeCommand(`sudo chown daytona:daytona ${mountPath}`)

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

mount_path = '/home/daytona/archil'

sandbox = daytona.create(

  Daytona::CreateSandboxBaseParams.new(

    env_vars: {

      'ARCHIL_MOUNT_TOKEN' => ENV.fetch('ARCHIL_MOUNT_TOKEN'),

      'ARCHIL_REGION' => ENV.fetch('ARCHIL_REGION'),

      'ARCHIL_DISK' => ENV.fetch('ARCHIL_DISK')

    }

  )

)

sandbox.process.exec(

  command: 'sudo apt-get update ' \

           '&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates'

)

sandbox.process.exec(command: 'curl -fsSL https://archil.com/install | sh')

sandbox.process.exec(command: "sudo mkdir -p #{mount_path}")

sandbox.process.exec(

  command: "sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount " \

           "$ARCHIL_DISK #{mount_path} --region $ARCHIL_REGION"

)

# Exclusive mounts only; on --shared or --read-only mounts this fails

# with "Read-only file system" (see "Shared and read-only mounts" below)

sandbox.process.exec(command: "sudo chown daytona:daytona #{mount_path}")

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

mountPath := "/home/daytona/archil"

sandbox, err := client.Create(ctx, types.SnapshotParams{

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "ARCHIL_MOUNT_TOKEN": os.Getenv("ARCHIL_MOUNT_TOKEN"),

      "ARCHIL_REGION":      os.Getenv("ARCHIL_REGION"),

      "ARCHIL_DISK":        os.Getenv("ARCHIL_DISK"),

    },

  },

})

if err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo apt-get update && sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "curl -fsSL https://archil.com/install | sh"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "sudo mkdir -p "+mountPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "+

    "$ARCHIL_DISK "+mountPath+" --region $ARCHIL_REGION"); err != nil {

  log.Fatal(err)

}

// Exclusive mounts only; on --shared or --read-only mounts this fails

// with "Read-only file system" (see "Shared and read-only mounts" below)

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "sudo chown daytona:daytona "+mountPath); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxBaseParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            String mountPath = "/home/daytona/archil";

            CreateSandboxBaseParams params = new CreateSandboxBaseParams();

            params.setEnvVars(Map.of(

                "ARCHIL_MOUNT_TOKEN", System.getenv("ARCHIL_MOUNT_TOKEN"),

                "ARCHIL_REGION", System.getenv("ARCHIL_REGION"),

                "ARCHIL_DISK", System.getenv("ARCHIL_DISK")

            ));

            Sandbox sandbox = daytona.create(params);

            sandbox.getProcess().executeCommand(

                "sudo apt-get update "

                + "&& sudo apt-get install -y --no-install-recommends libfuse2 ca-certificates");

            sandbox.getProcess().executeCommand(

                "curl -fsSL https://archil.com/install | sh");

            sandbox.getProcess().executeCommand("sudo mkdir -p " + mountPath);

            sandbox.getProcess().executeCommand(

                "sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "

                + "$ARCHIL_DISK " + mountPath + " --region $ARCHIL_REGION");

            // Exclusive mounts only; on --shared or --read-only mounts this fails

            // with "Read-only file system" (see "Shared and read-only mounts" below)

            sandbox.getProcess().executeCommand("sudo chown daytona:daytona " + mountPath);

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#shared-and-read-only-mounts) Shared and read-only mounts

[Section titled “Shared and read-only mounts”](https://www.daytona.io/docs/en/mount-external-storage/#shared-and-read-only-mounts)

The `--shared` and `--read-only` flags produce the same mount behavior: the entire mount is read-only, including `chmod` and `chown`, until `archil checkout <path>` grants a write delegation for that path. This has two consequences for the snippets above:

- **`sudo chown daytona:daytona <mountPath>`** fails with “Read-only file system” on any **`--shared`** or **`--read-only`** mount. On a writable shared mount:

1. Run **`sudo archil checkout <mountPath>`**
2. Run **`chown`**
3. Run **`sudo archil checkin <mountPath>`**

- Ownership and permissions come from the metadata stored on the Archil disk, not from the mount. If a root process wrote files with a restrictive umask, every mount shows them as **`root:root`** with mode **`600`**, and the **`daytona`** user cannot read them.

1. **Fix permissions at the source (recommended)**

Write with `umask 022` or run `chmod -R a+rX` after writing, so files are readable from the start. For existing data, apply a one-time fix from any client with a writable shared mount:


```
sudo --preserve-env=ARCHIL_MOUNT_TOKEN archil mount "$ARCHIL_DISK" /mnt/fix --region "$ARCHIL_REGION" --shared

sudo archil checkout /mnt/fix/data

sudo chmod -R a+rX /mnt/fix/data

sudo archil checkin /mnt/fix/data
```

The permission bits persist on the disk, so every subsequent read-only mount shows the corrected modes.

2. **Re-export with `bindfs` (when the source data cannot be changed)**

Inside the sandbox, mount a read-only view of the Archil mount that remaps ownership to the **`daytona`** user:


```
sudo apt-get install -y bindfs

mkdir -p /home/daytona/archil-view

sudo bindfs --force-user=daytona --force-group=daytona --perms=a+rX \

  /home/daytona/archil /home/daytona/archil-view
```

The **`archil`** CLI requires root to mount and has no uid, gid, or umask override flags, so there is no way to remap ownership at mount time.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#common-pitfalls) Common pitfalls

[Section titled “Common pitfalls”](https://www.daytona.io/docs/en/mount-external-storage/#common-pitfalls)

Archil works on Tier 3 and Tier 4 sandboxes with default network settings (full egress) without additional configuration. The following failure modes look like Daytona blocking egress but have other causes:

- **Missing `libfuse2`.** The `daytonaio/sandbox` base image ships Debian Trixie, which does not include `libfuse2`, and the `archil` CLI links against it. Install `libfuse2t64` (the Trixie package name; `libfuse2` is a transitional package that pulls it in) before running the Archil installer, or bake both into a [pre-built snapshot](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-6).
- **Egress allowlists break Archil.** A sandbox with a [`domainAllowList`](https://www.daytona.io/docs/en/network-limits) cannot mount Archil disks: the Archil control plane is reached as a bare IP address on port `8100`, which a domain allowlist cannot express. The installer also downloads from `s3.amazonaws.com/archil-client/`, which must be reachable at install time. A [`networkAllowList`](https://www.daytona.io/docs/en/network-limits) (CIDR) can pin Archil’s mount and control IP addresses, but those addresses change, so this is fragile and not recommended. Use full egress for sandboxes that mount Archil disks.
- **`api.archil.com` is not a valid endpoint.** The hostname does not resolve (NXDOMAIN), so allowlisting or testing against it fails regardless of network settings. Archil endpoints are region-specific; for `aws-us-east-1` they are `mount.green.us-east-1.aws.prod.archil.com:8100` and `control.green.us-east-1.aws.prod.archil.com:443`. See [Archil troubleshooting ↗](https://docs.archil.com/reference/troubleshooting).
- **The disk is exclusively mounted elsewhere.** An exclusive mount holds a delegation lock on the disk. Mounting from another sandbox fails until the first client unmounts or runs `archil checkin`, or the new mount passes `--shared` (or `--force` to break a stale lock). This is an Archil delegation conflict, not an egress failure.

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#mount-a-mesafs-filesystem) Mount a MesaFS filesystem

[Section titled “Mount a MesaFS filesystem”](https://www.daytona.io/docs/en/mount-external-storage/#mount-a-mesafs-filesystem)

[MesaFS ↗](https://mesa.dev/) is an agent-native versioned filesystem from Mesa, purpose-built for the same workloads Daytona sandboxes run — parallel agent swarms, shared working memory, structured artifacts, and long-lived state across runs. With MesaFS, instead of mounting a cloud bucket, you mount a Mesa **repository**: a Git-compatible versioned working directory with sub-50ms reads/writes, instant fork/branch operations, and unlimited concurrent writers.

The Mesa setup follows the same pattern as the bucket providers but uses the Mesa CLI rather than a FUSE-specific tool: install the CLI in your sandbox, authenticate with your API key, and run `mesa mount --daemonize` to mount your repos at `/home/daytona/mesa/mnt/<org>/<repo>`.

**Credentials** — set `MESA_API_KEY` and `MESA_ORG` (your Mesa organization slug) in your local environment. The snippets below pass them into the sandbox via `envVars`, and the Mesa CLI reads them from there.

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#pre-built-snapshot-8) Pre-built snapshot

[Section titled “Pre-built snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#pre-built-snapshot-8)

Build a snapshot with the Mesa CLI preinstalled, then launch Mesa-enabled sandboxes from that snapshot. You still authenticate and mount at runtime, but installation is no longer part of each sandbox startup sequence.

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#build-a-snapshot-7) Build a snapshot

[Section titled “Build a snapshot”](https://www.daytona.io/docs/en/mount-external-storage/#build-a-snapshot-7)

Create a reusable snapshot that installs the Mesa CLI and enables the FUSE `user_allow_other` setting. Sandboxes launched from `fuse-mesa` can then authenticate and mount repos without repeating install work.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-759)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-760)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-761)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-762)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-763)

```
from daytona import CreateSnapshotParams, Daytona, Image

daytona = Daytona()

image = (

  Image.base("daytonaio/sandbox")

  .run_commands(

    "curl -fsSL https://mesa.dev/install.sh | sh",

    "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",

  )

)

daytona.snapshot.create(

    CreateSnapshotParams(name="fuse-mesa", image=image),

    on_logs=lambda chunk: print(chunk, end="", flush=True),

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const image = Image.base('daytonaio/sandbox').runCommands(

  'curl -fsSL https://mesa.dev/install.sh | sh',

  "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",

)

await daytona.snapshot.create(

  { name: 'fuse-mesa', image },

  { onLogs: console.log },

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

image = Daytona::Image

  .base('daytonaio/sandbox')

  .run_commands(

    'curl -fsSL https://mesa.dev/install.sh | sh',

    "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf"

  )

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'fuse-mesa', image: image),

  on_logs: proc { |chunk| print(chunk) }

)
```

```
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

image := daytona.Base("daytonaio/sandbox").

  Run("curl -fsSL https://mesa.dev/install.sh | sh").

  Run(`sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf`)

_, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "fuse-mesa",

  Image: image,

})

if err != nil {

  log.Fatal(err)

}

for line := range logChan {

  fmt.Print(line)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Image;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Image image = Image.base("daytonaio/sandbox")

                .runCommands(

                    "curl -fsSL https://mesa.dev/install.sh | sh",

                    "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf"

                );

            daytona.snapshot().create("fuse-mesa", image, System.out::println);

        }

    }

}
```

#### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#launch-and-mount-9) Launch and mount

[Section titled “Launch and mount”](https://www.daytona.io/docs/en/mount-external-storage/#launch-and-mount-9)

Pass `MESA_API_KEY` and your Mesa organization slug to the sandbox via `envVars`. Your code then writes a TOML config into the sandbox, authenticates the Mesa CLI, and mounts your repos at `/home/daytona/mesa/mnt/<org>/<repo>`.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-764)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-765)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-766)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-767)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-768)

```
import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

org = os.environ["MESA_ORG"]

repo = "my-workspace"

mount_path = f"/home/daytona/mesa/mnt/{org}/{repo}"

config_path = "/home/daytona/.config/mesa/config.toml"

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-mesa",

        env_vars={

            "MESA_API_KEY": os.environ["MESA_API_KEY"],

            "MESA_ORG": org,

        },

    )

)

config = f'''mount-point = "/home/daytona/mesa/mnt"

[secrets]

backend = "plaintext-file"

[organizations.{org}]

'''

sandbox.process.exec(f"mkdir -p $(dirname {config_path})")

sandbox.fs.upload_file(config.encode(), config_path)

sandbox.process.exec("mesa auth set-key --org $MESA_ORG $MESA_API_KEY")

sandbox.process.exec("mesa mount --daemonize")

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const org = process.env.MESA_ORG!

const repo = 'my-workspace'

const mountPath = `/home/daytona/mesa/mnt/${org}/${repo}`

const configPath = '/home/daytona/.config/mesa/config.toml'

const sandbox = await daytona.create({

  snapshot: 'fuse-mesa',

  envVars: {

    MESA_API_KEY: process.env.MESA_API_KEY!,

    MESA_ORG: org,

  },

})

const config = `mount-point = "/home/daytona/mesa/mnt"

[secrets]

backend = "plaintext-file"

[organizations.${org}]

`

await sandbox.process.executeCommand(`mkdir -p $(dirname ${configPath})`)

await sandbox.fs.uploadFile(Buffer.from(config), configPath)

await sandbox.process.executeCommand('mesa auth set-key --org $MESA_ORG $MESA_API_KEY')

await sandbox.process.executeCommand('mesa mount --daemonize')

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

org = ENV.fetch('MESA_ORG')

repo = 'my-workspace'

mount_path = "/home/daytona/mesa/mnt/#{org}/#{repo}"

config_path = '/home/daytona/.config/mesa/config.toml'

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'fuse-mesa',

    env_vars: {

      'MESA_API_KEY' => ENV.fetch('MESA_API_KEY'),

      'MESA_ORG' => org

    }

  )

)

config = <<~TOML

  mount-point = "/home/daytona/mesa/mnt"

  [secrets]

  backend = "plaintext-file"

  [organizations.#{org}]

TOML

sandbox.process.exec(command: "mkdir -p $(dirname #{config_path})")

sandbox.fs.upload_file(config, config_path)

sandbox.process.exec(command: 'mesa auth set-key --org $MESA_ORG $MESA_API_KEY')

sandbox.process.exec(command: 'mesa mount --daemonize')

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

org := os.Getenv("MESA_ORG")

repo := "my-workspace"

mountPath := fmt.Sprintf("/home/daytona/mesa/mnt/%s/%s", org, repo)

configPath := "/home/daytona/.config/mesa/config.toml"

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: "fuse-mesa",

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "MESA_API_KEY": os.Getenv("MESA_API_KEY"),

      "MESA_ORG":     org,

    },

  },

})

if err != nil {

  log.Fatal(err)

}

config := fmt.Sprintf(`mount-point = "/home/daytona/mesa/mnt"

[secrets]

backend = "plaintext-file"

[organizations.%s]

`, org)

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p $(dirname "+configPath+")"); err != nil {

  log.Fatal(err)

}

if err := sandbox.FileSystem.UploadFile(ctx, []byte(config), configPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mesa auth set-key --org $MESA_ORG $MESA_API_KEY"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mesa mount --daemonize"); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            String org = System.getenv("MESA_ORG");

            String repo = "my-workspace";

            String mountPath = "/home/daytona/mesa/mnt/" + org + "/" + repo;

            String configPath = "/home/daytona/.config/mesa/config.toml";

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("fuse-mesa");

            params.setEnvVars(Map.of(

                "MESA_API_KEY", System.getenv("MESA_API_KEY"),

                "MESA_ORG", org

            ));

            Sandbox sandbox = daytona.create(params);

            String config = "mount-point = \"/home/daytona/mesa/mnt\"\n\n"

                + "[secrets]\n"

                + "backend = \"plaintext-file\"\n\n"

                + "[organizations." + org + "]\n";

            sandbox.getProcess().executeCommand("mkdir -p $(dirname " + configPath + ")");

            sandbox.fs.uploadFile(config.getBytes(StandardCharsets.UTF_8), configPath);

            sandbox.getProcess().executeCommand(

                "mesa auth set-key --org $MESA_ORG $MESA_API_KEY");

            sandbox.getProcess().executeCommand("mesa mount --daemonize");

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#runtime-install-8) Runtime install

[Section titled “Runtime install”](https://www.daytona.io/docs/en/mount-external-storage/#runtime-install-8)

Start from a default sandbox and install the Mesa CLI during startup before configuring auth and running `mesa mount --daemonize`. This is useful when iterating quickly on mount behavior, with the tradeoff of slower cold starts for each sandbox.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-769)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-770)
- [Ruby](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-771)
- [Go](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-772)
- [Java](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-773)

```
import os

from daytona import CreateSandboxBaseParams, Daytona

daytona = Daytona()

org = os.environ["MESA_ORG"]

repo = "my-workspace"

mount_path = f"/home/daytona/mesa/mnt/{org}/{repo}"

config_path = "/home/daytona/.config/mesa/config.toml"

sandbox = daytona.create(

    CreateSandboxBaseParams(

        env_vars={

            "MESA_API_KEY": os.environ["MESA_API_KEY"],

            "MESA_ORG": org,

        },

    )

)

sandbox.process.exec("curl -fsSL https://mesa.dev/install.sh | sh")

sandbox.process.exec(

    "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf"

)

config = f'''mount-point = "/home/daytona/mesa/mnt"

[secrets]

backend = "plaintext-file"

[organizations.{org}]

'''

sandbox.process.exec(f"mkdir -p $(dirname {config_path})")

sandbox.fs.upload_file(config.encode(), config_path)

sandbox.process.exec("mesa auth set-key --org $MESA_ORG $MESA_API_KEY")

sandbox.process.exec("mesa mount --daemonize")

response = sandbox.process.exec(f"ls {mount_path}")

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const org = process.env.MESA_ORG!

const repo = 'my-workspace'

const mountPath = `/home/daytona/mesa/mnt/${org}/${repo}`

const configPath = '/home/daytona/.config/mesa/config.toml'

const sandbox = await daytona.create({

  envVars: {

    MESA_API_KEY: process.env.MESA_API_KEY!,

    MESA_ORG: org,

  },

})

await sandbox.process.executeCommand('curl -fsSL https://mesa.dev/install.sh | sh')

await sandbox.process.executeCommand(

  "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf",

)

const config = `mount-point = "/home/daytona/mesa/mnt"

[secrets]

backend = "plaintext-file"

[organizations.${org}]

`

await sandbox.process.executeCommand(`mkdir -p $(dirname ${configPath})`)

await sandbox.fs.uploadFile(Buffer.from(config), configPath)

await sandbox.process.executeCommand('mesa auth set-key --org $MESA_ORG $MESA_API_KEY')

await sandbox.process.executeCommand('mesa mount --daemonize')

const response = await sandbox.process.executeCommand(`ls ${mountPath}`)

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

org = ENV.fetch('MESA_ORG')

repo = 'my-workspace'

mount_path = "/home/daytona/mesa/mnt/#{org}/#{repo}"

config_path = '/home/daytona/.config/mesa/config.toml'

sandbox = daytona.create(

  Daytona::CreateSandboxBaseParams.new(

    env_vars: {

      'MESA_API_KEY' => ENV.fetch('MESA_API_KEY'),

      'MESA_ORG' => org

    }

  )

)

sandbox.process.exec(command: 'curl -fsSL https://mesa.dev/install.sh | sh')

sandbox.process.exec(

  command: "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf"

)

config = <<~TOML

  mount-point = "/home/daytona/mesa/mnt"

  [secrets]

  backend = "plaintext-file"

  [organizations.#{org}]

TOML

sandbox.process.exec(command: "mkdir -p $(dirname #{config_path})")

sandbox.fs.upload_file(config, config_path)

sandbox.process.exec(command: 'mesa auth set-key --org $MESA_ORG $MESA_API_KEY')

sandbox.process.exec(command: 'mesa mount --daemonize')

response = sandbox.process.exec(command: "ls #{mount_path}")

puts response.result
```

```
import (

  "context"

  "fmt"

  "log"

  "os"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

ctx := context.Background()

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

org := os.Getenv("MESA_ORG")

repo := "my-workspace"

mountPath := fmt.Sprintf("/home/daytona/mesa/mnt/%s/%s", org, repo)

configPath := "/home/daytona/.config/mesa/config.toml"

sandbox, err := client.Create(ctx, types.SnapshotParams{

  SandboxBaseParams: types.SandboxBaseParams{

    EnvVars: map[string]string{

      "MESA_API_KEY": os.Getenv("MESA_API_KEY"),

      "MESA_ORG":     org,

    },

  },

})

if err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  "curl -fsSL https://mesa.dev/install.sh | sh"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx,

  `sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf`); err != nil {

  log.Fatal(err)

}

config := fmt.Sprintf(`mount-point = "/home/daytona/mesa/mnt"

[secrets]

backend = "plaintext-file"

[organizations.%s]

`, org)

if _, err := sandbox.Process.ExecuteCommand(ctx, "mkdir -p $(dirname "+configPath+")"); err != nil {

  log.Fatal(err)

}

if err := sandbox.FileSystem.UploadFile(ctx, []byte(config), configPath); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mesa auth set-key --org $MESA_ORG $MESA_API_KEY"); err != nil {

  log.Fatal(err)

}

if _, err := sandbox.Process.ExecuteCommand(ctx, "mesa mount --daemonize"); err != nil {

  log.Fatal(err)

}

response, err := sandbox.Process.ExecuteCommand(ctx, "ls "+mountPath)

if err != nil {

  log.Fatal(err)

}

fmt.Println(response.Result)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.nio.charset.StandardCharsets;

import java.util.Map;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            String org = System.getenv("MESA_ORG");

            String repo = "my-workspace";

            String mountPath = "/home/daytona/mesa/mnt/" + org + "/" + repo;

            String configPath = "/home/daytona/.config/mesa/config.toml";

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setEnvVars(Map.of(

                "MESA_API_KEY", System.getenv("MESA_API_KEY"),

                "MESA_ORG", org

            ));

            Sandbox sandbox = daytona.create(params);

            sandbox.getProcess().executeCommand(

                "curl -fsSL https://mesa.dev/install.sh | sh");

            sandbox.getProcess().executeCommand(

                "sudo sed -i 's/^#user_allow_other/user_allow_other/' /etc/fuse.conf");

            String config = "mount-point = \"/home/daytona/mesa/mnt\"\n\n"

                + "[secrets]\n"

                + "backend = \"plaintext-file\"\n\n"

                + "[organizations." + org + "]\n";

            sandbox.getProcess().executeCommand("mkdir -p $(dirname " + configPath + ")");

            sandbox.fs.uploadFile(config.getBytes(StandardCharsets.UTF_8), configPath);

            sandbox.getProcess().executeCommand(

                "mesa auth set-key --org $MESA_ORG $MESA_API_KEY");

            sandbox.getProcess().executeCommand("mesa mount --daemonize");

            ExecuteResponse response = sandbox.getProcess().executeCommand("ls " + mountPath);

            System.out.println(response.getResult());

        }

    }

}
```

### [\#](https://www.daytona.io/docs/en/mount-external-storage/\#production-scoped-ephemeral-keys) Production: scoped ephemeral keys

[Section titled “Production: scoped ephemeral keys”](https://www.daytona.io/docs/en/mount-external-storage/#production-scoped-ephemeral-keys)

For non-test workloads, Mesa recommends minting a **short-lived, scoped API key per sandbox session** rather than passing your long-lived `MESA_API_KEY` into the sandbox. Use the [Mesa SDK ↗](https://docs.mesa.dev/) on your trusted host to derive an ephemeral key from your long-lived one — the long-lived key never leaves your host process. Mesa SDKs are available for TypeScript, Python, and Rust; for other languages, use the [Mesa REST API ↗](https://docs.mesa.dev/content/api-reference/overview) directly.

- [Python](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-774)
- [TypeScript](https://www.daytona.io/docs/en/mount-external-storage/#tab-panel-775)

```
import asyncio

import os

from daytona import CreateSandboxFromSnapshotParams, Daytona

from mesa_sdk import Mesa

async def mint_ephemeral_key() -> str:

    async with Mesa(api_key=os.environ["MESA_API_KEY"], org=os.environ["MESA_ORG"]) as mesa:

        key = await mesa.api_keys.create(

            name="sandbox-session",

            scopes=["read", "write"],

            expires_in_seconds=3600,

        )

        return key.key

ephemeral_key = asyncio.run(mint_ephemeral_key())

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="fuse-mesa",

        env_vars={

            "MESA_API_KEY": ephemeral_key,

            "MESA_ORG": os.environ["MESA_ORG"],

        },

    )

)
```

```
import { Daytona } from '@daytona/sdk'

import { Mesa } from '@mesadev/sdk'

const mesa = new Mesa({ apiKey: process.env.MESA_API_KEY!, org: process.env.MESA_ORG! })

const ephemeralKey = await mesa.apiKeys.create({

  name: 'sandbox-session',

  scopes: ['read', 'write'],

  expires_in_seconds: 3600,

})

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'fuse-mesa',

  envVars: {

    MESA_API_KEY: ephemeralKey.key,

    MESA_ORG: process.env.MESA_ORG!,

  },

})
```

The rest of the launch flow (writing the TOML config, `mesa auth set-key`, `mesa mount --daemonize`) is unchanged — the sandbox doesn’t know whether the key it received is long-lived or ephemeral.

For repo-scoped or path-scoped keys, see Mesa’s [auth and permissions guide ↗](https://docs.mesa.dev/content/getting-started/auth-and-permissions). For the full integration recipe, see Mesa’s [Daytona guide ↗](https://docs.mesa.dev/content/integration-guides/daytona).

## [\#](https://www.daytona.io/docs/en/mount-external-storage/\#unmount) Unmount

[Section titled “Unmount”](https://www.daytona.io/docs/en/mount-external-storage/#unmount)

When a sandbox is deleted via `daytona.delete(sandbox)`, the container teardown automatically removes any active FUSE mounts and shuts down their daemons. For normal cleanup, this is all you need — no manual unmount required.

To free a mount path **during** a sandbox’s lifetime (for example, to remount with different credentials or before persisting a workspace archive), relocate the mount onto a throwaway path:

```
sudo mkdir -p /tmp/.fuse-defunct-$$

sudo mount --move <your-mount-path> /tmp/.fuse-defunct-$$
```

After this, your original mount path is free for remounting. The FUSE daemon stays alive serving the mount at the new path; both the relocated mount and the daemon are cleaned up automatically when the sandbox is deleted.

This works for any FUSE-based mount — verified against `mount-s3`, `gcsfuse`, and `blobfuse2`.