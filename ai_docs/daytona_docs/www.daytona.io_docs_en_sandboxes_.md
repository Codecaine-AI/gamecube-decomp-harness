---
url: "https://www.daytona.io/docs/en/sandboxes/"
title: "Sandboxes | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/sandboxes/#_top)

# Sandboxes

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/sandboxes.md)Open

Daytona provides **full composable computers** — **sandboxes** — for AI agents.

Sandboxes are isolated runtime environments you can manage programmatically to run code. Each sandbox runs in isolation, giving it a dedicated kernel, filesystem, network stack, and allocated vCPU, RAM, and disk. Agents and developers get access to a full composable computer where they can install packages, run servers, compile code, and manage processes.

Sandboxes run as **Linux containers** by default. Daytona also provides [VM sandboxes](https://www.daytona.io/docs/en/sandboxes/#vm-sandboxes) with a dedicated **Linux VM** or **Windows** operating system, and [GPU sandboxes](https://www.daytona.io/docs/en/sandboxes/#gpu-sandboxes) with **NVIDIA GPU** acceleration for model inference, fine-tuning, and CUDA-accelerated compute.

[Container\\
Default Linux container runtime for running processes and executing code.\\
<90msDynamic buildsDocker images](https://www.daytona.io/docs/en/sandboxes/#create-sandboxes) [Linux VM\\
Linux OS runtime in a virtual machine for running Linux-specific tools and workflows.\\
ForkPause/resumeMemory snapshots](https://www.daytona.io/docs/en/sandboxes/#vm-sandboxes) [Windows\\
Windows OS runtime in a virtual machine for running Windows applications and tooling.\\
ForkPause/resumeMemory snapshots](https://www.daytona.io/docs/en/sandboxes/#vm-sandboxes) [GPU\\
NVIDIA GPU runtime for model inference, fine-tuning, and CUDA-accelerated compute.\\
H100/H200RTXEphemeral](https://www.daytona.io/docs/en/sandboxes/#gpu-sandboxes)

## [\#](https://www.daytona.io/docs/en/sandboxes/\#create-sandboxes) Create sandboxes

[Section titled “Create sandboxes”](https://www.daytona.io/docs/en/sandboxes/#create-sandboxes)

Create a sandbox.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1047)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1048)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1049)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1050)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1051)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1052)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1053)

```
from daytona import Daytona

daytona = Daytona()

sandbox = daytona.create()
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create()
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  _, _ = client.Create(ctx, nil)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox sandbox = daytona.create();

        }

    }

}
```

```
daytona create [flags]
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{}'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#snapshots) Snapshots

[Section titled “Snapshots”](https://www.daytona.io/docs/en/sandboxes/#snapshots)

Create a sandbox from a [default snapshot](https://www.daytona.io/docs/en/snapshots#default-snapshots).

| **Snapshot** | **vCPU** | **Memory** | **Storage** | **GPU** | **Sandbox Class** |
| --- | --- | --- | --- | --- | --- |
| **`daytona-small`** | 1 | 1GiB | 3GiB |  | Container |
| **`daytona-medium`** | 2 | 4GiB | 8GiB |  | Container |
| **`daytona-large`** | 4 | 8GiB | 10GiB |  | Container |
| **`daytona-gpu`** | 1 | 1GiB | 1GiB | 1 | GPU |
| **`daytona-vm-small`** | 1 | 1GiB | 3GiB |  | Linux VM |
| **`daytona-vm-medium`** | 2 | 4GiB | 8GiB |  | Linux VM |
| **`daytona-vm-large`** | 4 | 8GiB | 10GiB |  | Linux VM |
| **`windows-small`** | 1 | 4GiB | 30GiB |  | Windows |
| **`windows-medium`** | 2 | 8GiB | 50GiB |  | Windows |
| **`windows-large`** | 4 | 16GiB | 50GiB |  | Windows |

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Select a **`snapshot`**
4. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1054)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1055)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1056)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1057)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1058)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1059)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1060)

```
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="daytona-small",

    )

)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'daytona-small',

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'daytona-small'

  )

)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  params := types.SnapshotParams{

    Snapshot: "daytona-small",

  }

  _, _ = client.Create(ctx, params)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("daytona-small");

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
daytona create --snapshot daytona-small
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "snapshot": "daytona-small"

}'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#resources) Resources

[Section titled “Resources”](https://www.daytona.io/docs/en/sandboxes/#resources)

Create a sandbox with custom resources.

Sandboxes have **1 vCPU**, **1GB RAM**, and **3GiB disk** by default. Organizations get a maximum sandbox resource limit of **4 vCPUs**, **8GB RAM**, and **10GB disk**.

| **Resource** | **Unit** | **Default** | **Minimum** | **Maximum** |
| --- | --- | --- | --- | --- |
| CPU | vCPU | **`1`** | **`1`** | **`4`** |
| Memory | GiB | **`1`** | **`1`** | **`8`** |
| Disk | GiB | **`3`** | **`1`** | **`10`** |

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Enter a base **`image`**
4. Set **`resources`** ( **`cpu`**, **`memory`**, **`disk`**) to the values within your organization’s limits
5. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1061)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1062)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1063)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1064)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1065)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1066)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1067)

```
from daytona import Daytona, CreateSandboxFromImageParams, Image, Resources

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromImageParams(

        image="ubuntu:22.04",

        resources=Resources(cpu=2, memory=4, disk=8),

    )

)
```

```
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  image: Image.base('ubuntu:22.04'),

  resources: { cpu: 2, memory: 4, disk: 8 },

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromImageParams.new(

    image: Daytona::Image.base('ubuntu:22.04'),

    resources: Daytona::Resources.new(

      cpu: 2,

      memory: 4,

      disk: 8

    )

  )

)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  _, _ = client.Create(ctx, types.ImageParams{

    Image: "ubuntu:22.04",

    Resources: &types.Resources{

      CPU:    2,

      Memory: 4,

      Disk:   8,

    },

  })

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromImageParams;

import io.daytona.sdk.model.Resources;

final class CreateSandboxResources {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();

            params.setImage("ubuntu:22.04");

            Resources resources = new Resources();

            resources.setCpu(2);

            resources.setMemory(4);

            resources.setDisk(8);

            params.setResources(resources);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
daytona create --cpu 2 --memory 4 --disk 8
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "image": "ubuntu:22.04",

  "cpu": 2,

  "memory": 4,

  "disk": 8

}'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#languages) Languages

[Section titled “Languages”](https://www.daytona.io/docs/en/sandboxes/#languages)

Create a sandbox with a specific language runtime.

Daytona sandboxes support **Python**, **TypeScript**, and **JavaScript** programming language runtimes for direct code execution inside the sandbox. The `language` parameter controls which programming language runtime is used for the sandbox. If omitted, it defaults to `python`.

- **`python`**
- **`typescript`**
- **`javascript`**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1068)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1069)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1070)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1071)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1072)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1073)

```
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

# Python runtime (default)

sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="python"))

response = sandbox.process.code_run('print("Hello from Python")')

print(response.result)

# TypeScript runtime

sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="typescript"))

response = sandbox.process.code_run('console.log("Hello from TypeScript")')

print(response.result)

# JavaScript runtime

sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="javascript"))

response = sandbox.process.code_run('console.log("Hello from JavaScript")')

print(response.result)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

// Python runtime (default)

let sandbox = await daytona.create({ language: 'python' })

let response = await sandbox.process.codeRun('print("Hello from Python")')

console.log(response.result)

// TypeScript runtime

sandbox = await daytona.create({ language: 'typescript' })

response = await sandbox.process.codeRun('console.log("Hello from TypeScript")')

console.log(response.result)

// JavaScript runtime

sandbox = await daytona.create({ language: 'javascript' })

response = await sandbox.process.codeRun('console.log("Hello from JavaScript")')

console.log(response.result)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# Python runtime (default)

sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(

  language: Daytona::CodeLanguage::PYTHON

))

response = sandbox.process.code_run(code: 'print("Hello from Python")')

puts response.result

# TypeScript runtime

sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(

  language: Daytona::CodeLanguage::TYPESCRIPT

))

response = sandbox.process.code_run(code: 'console.log("Hello from TypeScript")')

puts response.result

# JavaScript runtime

sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(

  language: Daytona::CodeLanguage::JAVASCRIPT

))

response = sandbox.process.code_run(code: 'console.log("Hello from JavaScript")')

puts response.result
```

```
package main

import (

  "context"

  "fmt"

  "log"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, err := daytona.NewClient()

  if err != nil {

    log.Fatal(err)

  }

  ctx := context.Background()

  // Python runtime (default)

  sandbox, err := client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{Language: types.CodeLanguagePython},

  })

  if err != nil {

    log.Fatal(err)

  }

  result, err := sandbox.Process.CodeRun(ctx, `print("Hello from Python")`)

  if err != nil {

    log.Fatal(err)

  }

  fmt.Println(result.Result)

  // TypeScript runtime

  sandbox, err = client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{Language: types.CodeLanguageTypeScript},

  })

  if err != nil {

    log.Fatal(err)

  }

  result, err = sandbox.Process.CodeRun(ctx, `console.log("Hello from TypeScript")`)

  if err != nil {

    log.Fatal(err)

  }

  fmt.Println(result.Result)

  // JavaScript runtime

  sandbox, err = client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{Language: types.CodeLanguageJavaScript},

  })

  if err != nil {

    log.Fatal(err)

  }

  result, err = sandbox.Process.CodeRun(ctx, `console.log("Hello from JavaScript")`)

  if err != nil {

    log.Fatal(err)

  }

  fmt.Println(result.Result)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

Daytona daytona = new Daytona();

// Python runtime (default)

CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

params.setLanguage("python");

Sandbox sandbox = daytona.create(params);

ExecuteResponse response = sandbox.process.codeRun("print(\"Hello from Python\")");

System.out.println(response.getResult());

// TypeScript runtime

params = new CreateSandboxFromSnapshotParams();

params.setLanguage("typescript");

sandbox = daytona.create(params);

response = sandbox.process.codeRun("console.log(\"Hello from TypeScript\")");

System.out.println(response.getResult());

// JavaScript runtime

params = new CreateSandboxFromSnapshotParams();

params.setLanguage("javascript");

sandbox = daytona.create(params);

response = sandbox.process.codeRun("console.log(\"Hello from JavaScript\")");

System.out.println(response.getResult());
```

```
# Python runtime (default)

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "language": "python"

}'

# TypeScript runtime

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "language": "typescript"

}'

# JavaScript runtime

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "language": "javascript"

}'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#regions) Regions

[Section titled “Regions”](https://www.daytona.io/docs/en/sandboxes/#regions)

Create a sandbox in a specific [region](https://www.daytona.io/docs/en/regions).

| **Region** | **Target** |
| --- | --- |
| United States | **`us`** |
| Europe | **`eu`** |

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1074)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1075)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1076)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1077)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1078)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1079)

```
from daytona import Daytona, DaytonaConfig

daytona = Daytona(DaytonaConfig(target="us"))

sandbox = daytona.create()
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona({ target: 'us' })

const sandbox = await daytona.create()
```

```
require 'daytona'

daytona = Daytona::Daytona.new(Daytona::Config.new(target: 'us'))

sandbox = daytona.create
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClientWithConfig(&types.DaytonaConfig{

    Target: "us",

  })

  ctx := context.Background()

  _, _ = client.Create(ctx, nil)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.DaytonaConfig;

import io.daytona.sdk.Sandbox;

public class App {

    public static void main(String[] args) {

        DaytonaConfig config = new DaytonaConfig.Builder()

                .apiKey(System.getenv("DAYTONA_API_KEY"))

                .target("us")

                .build();

        try (Daytona daytona = new Daytona(config)) {

            Sandbox sandbox = daytona.create();

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "target": "us"

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#vm-sandboxes) VM sandboxes

[Section titled “VM sandboxes”](https://www.daytona.io/docs/en/sandboxes/#vm-sandboxes)

Daytona provides **VM sandboxes** for workloads that require a full virtual machine with a dedicated **Linux VM** or **Windows** operating system.

VM sandboxes are distinct from container sandboxes and support VM-only capabilities:

- [Fork sandboxes](https://www.daytona.io/docs/en/sandboxes/#fork-sandboxes)
- [Pause/resume sandboxes](https://www.daytona.io/docs/en/sandboxes/#pause--resume-sandboxes)
- [Create snapshot from sandbox](https://www.daytona.io/docs/en/sandboxes/#create-snapshot-from-sandbox)

- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1310)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1311)

- [Create from snapshot](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1300)
- [Create from custom snapshot](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1301)

Create a Linux VM sandbox from a default snapshot.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)

2. Click **Create Sandbox**

3. Select a Linux VM snapshot:
   - **`daytona-vm-small`**
   - **`daytona-vm-medium`**
   - **`daytona-vm-large`**
4. Click **Create**


- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1080)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1081)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1082)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1083)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1084)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1085)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1086)

```
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="daytona-vm-small"))
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({ snapshot: 'daytona-vm-small' })
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'daytona-vm-small'

  )

)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  params := types.SnapshotParams{

    Snapshot: "daytona-vm-small",

  }

  _, _ = client.Create(ctx, params)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("daytona-vm-small");

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
daytona create --snapshot daytona-vm-small
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "snapshot": "daytona-vm-small"

}'
```

Create a Linux VM sandbox from a custom snapshot.

1. Create a snapshot from a base **`image`**
2. Set sandbox class to **`LINUX_VM`**
3. Create a Linux VM sandbox from the snapshot

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1087)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1088)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1089)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1090)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1091)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1092)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1093)

```
from daytona import (

    Daytona,

    CreateSnapshotParams,

    CreateSandboxFromSnapshotParams,

    SandboxClass,

)

daytona = Daytona()

# 1. Create a VM snapshot (linux-vm class)

daytona.snapshot.create(

    CreateSnapshotParams(

        name="my-vm-snapshot",

        image="ubuntu:22.04",

        sandbox_class=SandboxClass.LINUX_VM,

    )

)

# 2. Create a VM sandbox from the snapshot

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="my-vm-snapshot"))
```

```
import { Daytona, SandboxClass } from "@daytona/sdk";

const daytona = new Daytona();

// 1. Create a VM snapshot (linux-vm class)

await daytona.snapshot.create({

  name: "my-vm-snapshot",

  image: "ubuntu:22.04",

  sandboxClass: SandboxClass.LINUX_VM,

});

// 2. Create a VM sandbox from the snapshot

const sandbox = await daytona.create({ snapshot: "my-vm-snapshot" });
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# 1. Create a VM snapshot (linux-vm class)

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(

    name: 'my-vm-snapshot',

    image: 'ubuntu:22.04',

    sandbox_class: DaytonaApiClient::SandboxClass::LINUX_VM

  )

)

# 2. Create a VM sandbox from the snapshot

sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'my-vm-snapshot'))
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  // 1. Create a VM snapshot (linux-vm class)

  sandboxClass := types.SandboxClassLinuxVM

  _, logCh, _ := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

    Name:         "my-vm-snapshot",

    Image:        "ubuntu:22.04",

    SandboxClass: &sandboxClass,

  })

  for range logCh {

  }

  // 2. Create a VM sandbox from the snapshot

  _, _ = client.Create(ctx, types.SnapshotParams{

    Snapshot: "my-vm-snapshot",

  })

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.api.client.model.SandboxClass;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // 1. Create a VM snapshot (linux-vm class)

            daytona.snapshot().create("my-vm-snapshot", "ubuntu:22.04", SandboxClass.LINUX_VM);

            // 2. Create a VM sandbox from the snapshot

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("my-vm-snapshot");

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
# 1. Create a VM snapshot (linux-vm class)

daytona snapshot create my-vm-snapshot --image ubuntu:22.04 --sandbox-class linux-vm

# 2. Create a VM sandbox from the snapshot

daytona create --snapshot my-vm-snapshot
```

```
# 1. Create a VM snapshot (linux-vm class)

curl https://app.daytona.io/api/snapshots \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

    "name": "my-vm-snapshot",

    "imageName": "ubuntu:22.04",

    "sandboxClass": "linux-vm"

  }'

# 2. Create a VM sandbox from the snapshot

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

    "snapshot": "my-vm-snapshot"

  }'
```

Create a Windows sandbox.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)

2. Click **Create Sandbox**

3. Select a Windows snapshot:
   - **`windows-small`**
   - **`windows-medium`**
   - **`windows-large`**
4. Click **Create**


- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1094)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1095)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1096)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1097)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1098)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1099)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1100)

```
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="windows-small",

    )

)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: 'windows-small',

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'windows-small'

  )

)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  params := types.SnapshotParams{

    Snapshot: "windows-small",

  }

  _, _ = client.Create(ctx, params)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("windows-small");

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
daytona create --snapshot windows-small
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "snapshot": "windows-small"

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#gpu-sandboxes) GPU sandboxes

[Section titled “GPU sandboxes”](https://www.daytona.io/docs/en/sandboxes/#gpu-sandboxes)

Daytona provides **GPU sandboxes** for workloads that require NVIDIA GPU acceleration, such as model inference, fine-tuning, and CUDA-accelerated compute. GPU sandboxes are ephemeral and support up to **16 vCPUs**, **192GB RAM**, and **512GB disk**. Supported GPU types:

- **NVIDIA H100**
- **NVIDIA H200**
- **NVIDIA RTX Pro 6000**
- **NVIDIA RTX 4090**
- **NVIDIA RTX 5090**

> Due to possible events of temporary GPU scarcity, the target/region requested for GPU sandboxes is ignored by default. If you need access to a specific geographical location, contact us at [support@daytona.io](mailto:support@daytona.io).

- [Create from snapshot](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1302)
- [Create with custom resources](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1303)

Create a GPU sandbox from a default snapshot.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Select a **`daytona-gpu`** snapshot
4. Select **`ephemeral`** or set **`auto-delete interval`** to **`0`**
5. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1101)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1102)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1103)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1104)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1105)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1106)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1107)

```
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromSnapshotParams(

        snapshot="daytona-gpu",

        auto_delete_interval=0,

    ),

)
```

```
import { Daytona } from "@daytona/sdk";

const daytona = new Daytona()

const sandbox = await daytona.create({

  snapshot: "daytona-gpu",

  ephemeral: true,

});
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'daytona-gpu',

    ephemeral: true

  )

)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  params := types.SnapshotParams{

    Snapshot: "daytona-gpu",

    SandboxBaseParams: types.SandboxBaseParams{

      Ephemeral: true,

    },

  }

  _, _ = client.Create(ctx, params)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("daytona-gpu");

            params.setAutoDeleteInterval(0);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
daytona create --snapshot daytona-gpu --auto-delete 0
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "snapshot": "daytona-gpu",

  "autoDeleteInterval": 0

}'
```

Create a GPU sandbox with custom GPU resources: units and types.

1. Create a sandbox from an **`image`**

2. Set the **`auto-delete interval`** to **`0`** (ephemeral)

3. Set the **`GPU`** to the number of GPU units

4. Specify the **`GPU type`**(s):

The GPU type field accepts a single value or an ordered list of preferred types.

Daytona uses the first available type in the order you provide. This lets you fall back from a preferred GPU to an alternative when the first choice is not available.
   - **`H100`**
   - **`H200`**
   - **`RTX-PRO-6000`**
   - **`RTX-4090`**
   - **`RTX-5090`**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1108)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1109)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1110)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1111)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1112)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1113)

```
from daytona import Daytona, CreateSandboxFromImageParams, Image, Resources, GpuType

daytona = Daytona()

sandbox = daytona.create(

    CreateSandboxFromImageParams(

        image=Image.debian_slim("3.12"),

        auto_delete_interval=0,

        resources=Resources(

            gpu=1,

            gpu_type=[GpuType.H100, GpuType.RTX_PRO_6000],

        ),

    )

)
```

```
import { Daytona, GpuType, Image } from "@daytona/sdk";

const daytona = new Daytona()

const sandbox = await daytona.create({

  image: Image.debianSlim("3.12"),

  autoDeleteInterval: 0,

  resources: {

    gpu: 1,

    gpuType: [GpuType.H100, GpuType.RTX_PRO_6000],

  },

});
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromImageParams.new(

    image: Daytona::Image.debian_slim('3.12'),

    auto_delete_interval: 0,

    resources: Daytona::Resources.new(

      gpu: 1,

      gpu_type: [Daytona::GpuType::H100, Daytona::GpuType::RTX_PRO_6000]

    )

  )

)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  autoDelete := 0

  _, _ = client.Create(ctx, types.ImageParams{

    Image: "python:3.12",

    SandboxBaseParams: types.SandboxBaseParams{

      AutoDeleteInterval: &autoDelete,

    },

    Resources: &types.Resources{

      GPU:     1,

      GpuType: []types.GpuType{types.GpuTypeH100, types.GpuTypeRtxPro6000},

    },

  })

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromImageParams;

import io.daytona.sdk.model.Resources;

import io.daytona.api.client.model.GpuType;

import java.util.List;

final class CreateGpuSandbox {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();

            params.setImage("python:3.12");

            params.setAutoDeleteInterval(0);

            Resources resources = new Resources();

            resources.setGpu(1);

            resources.setGpuType(List.of(GpuType.H100, GpuType.RTX_PRO_6000));

            params.setResources(resources);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "image": "python:3.12",

  "autoDeleteInterval": 0,

  "gpu": 1,

  "gpuType": ["H100", "RTX-PRO-6000"]

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#ephemeral-sandboxes) Ephemeral sandboxes

[Section titled “Ephemeral sandboxes”](https://www.daytona.io/docs/en/sandboxes/#ephemeral-sandboxes)

Create an ephemeral sandbox. Ephemeral sandboxes are automatically deleted when stopped.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Set **Ephemeral** to **`True`** or set the [auto-delete interval](https://www.daytona.io/docs/en/sandboxes/#auto-delete-interval) to **`0`**
4. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1114)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1115)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1116)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1117)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1118)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1119)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1120)

```
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

params = CreateSandboxFromSnapshotParams(

    ephemeral=True,

    auto_stop_interval=5,

)

sandbox = daytona.create(params)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({

  ephemeral: true,

  autoStopInterval: 5,

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

params = Daytona::CreateSandboxFromSnapshotParams.new(

  ephemeral: true,

  auto_stop_interval: 5

)

sandbox = daytona.create(params)
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  autoStopInterval := 5

  params := types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{

      Language:         types.CodeLanguagePython,

      Ephemeral:        true,

      AutoStopInterval: &autoStopInterval,

    },

  }

  _, _ = client.Create(ctx, params)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setAutoDeleteInterval(0);

            params.setAutoStopInterval(5);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
daytona create --auto-delete 0 --auto-stop 5
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "autoDeleteInterval": 0,

  "autoStopInterval": 5

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#linked-sandboxes) Linked sandboxes

[Section titled “Linked sandboxes”](https://www.daytona.io/docs/en/sandboxes/#linked-sandboxes)

Create a linked sandbox. Linked sandboxes attach ephemeral child sandboxes to a parent. Daytona schedules each child on the same runner as the parent and joins them into a shared link network so the group can communicate over local connections.

- **Lifecycle**

Linked sandboxes are always ephemeral and cannot be persisted or resumed after stop. The [auto-delete interval](https://www.daytona.io/docs/en/sandboxes/#auto-delete-interval) must be exactly `0` on create; this is enforced, not a default. The [auto-stop interval](https://www.daytona.io/docs/en/sandboxes/#auto-stop-interval) sets the idle period in minutes after which the child sandbox stops. Once stopped, linked children are auto-deleted. Deleting the parent deletes all of its linked children (cascade). One parent may have many linked children (1:N).

- **Networking**

Linked sandboxes share an internal link network. Connections work in both directions: the parent can reach each child and each child can reach the parent. Every sandbox on the link network is registered under its sandbox name and ID as DNS aliases, so either works as the host. For example: `telnet LINKED_SANDBOX_ID 5555` from the parent reaches port `5555` on the linked child sandbox.


1. Create a parent sandbox
2. Create one or more child sandboxes that reference the parent’s sandbox ID.

This records the relationship on the child sandbox as the linked sandbox ID. Omitting the linked sandbox parameter yields an unlinked sandbox.

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1121)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1122)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1123)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1124)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1125)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1126)

```
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

parent = daytona.create()

child = daytona.create(

    CreateSandboxFromSnapshotParams(

        linked_sandbox=parent.id,

        ephemeral=True,

    )

)

# The link network registers each sandbox under its name as a DNS alias

response = child.process.exec(f"curl http://{parent.name}:3000/")
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const parent = await daytona.create()

const child = await daytona.create({

  linkedSandbox: parent.id,

  ephemeral: true,

})

// The link network registers each sandbox under its name as a DNS alias

const response = await child.process.executeCommand(

  `curl http://${parent.name}:3000/`

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

parent = daytona.create

child = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    linked_sandbox: parent.id,

    ephemeral: true

  )

)

# The link network registers each sandbox under its name and ID as DNS aliases.

# The Ruby SDK does not expose the sandbox name, so address the parent by ID.

response = child.process.exec(command: "curl http://#{parent.id}:3000/")
```

```
package main

import (

  "context"

  "fmt"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  parent, _ := client.Create(ctx, types.SnapshotParams{})

  child, _ := client.Create(ctx, types.SnapshotParams{

    SandboxBaseParams: types.SandboxBaseParams{

      LinkedSandbox: parent.ID,

      Ephemeral:     true,

    },

  })

  // The link network registers each sandbox under its name as a DNS alias

  response, _ := child.Process.ExecuteCommand(ctx, fmt.Sprintf("curl http://%s:3000/", parent.Name))

  fmt.Println(response.Result)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox parent = daytona.create();

            CreateSandboxFromSnapshotParams childParams = new CreateSandboxFromSnapshotParams();

            childParams.setLinkedSandbox(parent.getId());

            childParams.setAutoDeleteInterval(0); // linked sandboxes must be ephemeral

            Sandbox child = daytona.create(childParams);

            // The link network registers each sandbox under its name as a DNS alias

            ExecuteResponse response = child.getProcess()

                    .executeCommand("curl http://" + parent.getName() + ":3000/");

        }

    }

}
```

```
# Create parent sandbox

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{}'

# Create linked child sandbox (replace PARENT_SANDBOX_ID with the id from the first response)

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "linkedSandbox": "PARENT_SANDBOX_ID",

  "autoDeleteInterval": 0

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#start-sandboxes) Start sandboxes

[Section titled “Start sandboxes”](https://www.daytona.io/docs/en/sandboxes/#start-sandboxes)

Start a sandbox.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the start icon ( **▶**) next to the sandbox you want to start

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1127)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1128)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1129)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1130)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1131)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1132)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1133)

```
sandbox.start()
```

```
await sandbox.start()
```

```
sandbox.start
```

```
sandbox.Start(ctx)
```

```
sandbox.start();
```

```
daytona start [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/start' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#get-sandbox) Get sandbox

[Section titled “Get sandbox”](https://www.daytona.io/docs/en/sandboxes/#get-sandbox)

Get a sandbox by ID or name.

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1134)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1135)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1136)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1137)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1138)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1139)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1140)

```
sandbox = daytona.get("my-sandbox-id-or-name")
```

```
const sandbox = await daytona.get('my-sandbox-id-or-name')
```

```
sandbox = daytona.get('my-sandbox-id-or-name')
```

```
sandbox, err := client.Get(ctx, "my-sandbox-id-or-name")
```

```
Sandbox sandbox = daytona.get("my-sandbox-id-or-name");
```

```
daytona info [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#list-sandboxes) List sandboxes

[Section titled “List sandboxes”](https://www.daytona.io/docs/en/sandboxes/#list-sandboxes)

List sandboxes.

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1141)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1142)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1143)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1144)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1145)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1146)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1147)

```
for sandbox in daytona.list():

    print(sandbox.id)
```

```
for await (const sandbox of daytona.list()) {

  console.log(sandbox.id)

}
```

```
daytona.list.each { |sandbox| puts sandbox.id }
```

```
iter := client.List(ctx, nil)

defer iter.Close()

for iter.Next() {

    sandbox := iter.Value()

    fmt.Println(sandbox.ID)

}

if err := iter.Err(); err != nil {

    log.Fatal(err)

}
```

```
Iterator<Map<String, Object>> iter = daytona.list();

while (iter.hasNext()) {

    Map<String, Object> sandbox = iter.next();

    System.out.println(sandbox.get("id"));

}
```

```
daytona list [flags]
```

```
curl 'https://app.daytona.io/api/sandbox' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#stop-sandboxes) Stop sandboxes

[Section titled “Stop sandboxes”](https://www.daytona.io/docs/en/sandboxes/#stop-sandboxes)

Stop a sandbox. The sandbox moves to the **stopped** state when shutdown completes. While a stop is in progress, the sandbox is in the **stopping** state and does not accept new requests.

- [Container](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1304)
- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1305)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1306)

Stopping terminates the running container. The filesystem is preserved, but memory state is not. Container sandboxes do not support pause; stop is the way to shut down a container sandbox when it is not in use.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the stop icon ( **⏹**) next to the sandbox you want to stop

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1148)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1149)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1150)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1151)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1152)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1153)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1154)

```
sandbox.stop()
```

```
await sandbox.stop()
```

```
sandbox.stop
```

```
sandbox.Stop(ctx)
```

```
sandbox.stop();
```

```
daytona stop [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

Stopping shuts down the virtual machine while preserving the filesystem. Memory state is cleared. To preserve running process state without consuming CPU, use [**pause / resume**](https://www.daytona.io/docs/en/sandboxes/#pause--resume-sandboxes).

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the stop icon ( **⏹**) next to the sandbox you want to stop

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1155)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1156)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1157)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1158)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1159)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1160)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1161)

```
sandbox.stop()
```

```
await sandbox.stop()
```

```
sandbox.stop
```

```
sandbox.Stop(ctx)
```

```
sandbox.stop();
```

```
daytona stop [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

Stopping shuts down the virtual machine while preserving the filesystem. Memory state is cleared. To preserve running process state without consuming CPU, use [**pause / resume**](https://www.daytona.io/docs/en/sandboxes/#pause--resume-sandboxes).

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the stop icon ( **⏹**) next to the sandbox you want to stop

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1162)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1163)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1164)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1165)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1166)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1167)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1168)

```
sandbox.stop()
```

```
await sandbox.stop()
```

```
sandbox.stop
```

```
sandbox.Stop(ctx)
```

```
sandbox.stop();
```

```
daytona stop [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#archive-sandboxes) Archive sandboxes

[Section titled “Archive sandboxes”](https://www.daytona.io/docs/en/sandboxes/#archive-sandboxes)

Archive a sandbox.

- [Container](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1287)
- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1288)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1289)

Archive moves a stopped sandbox’s filesystem to object storage and frees disk quota.

1. Ensure the sandbox is **stopped**
2. **Archive** the sandbox
3. Wait for the sandbox to reach the **archived** state
4. **Start** the sandbox again when you need to use it

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1169)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1170)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1171)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1172)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1173)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1174)

```
sandbox.archive()
```

```
await sandbox.archive()
```

```
sandbox.archive
```

```
sandbox.Archive(ctx)
```

```
daytona archive [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/archive' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

Archive is not supported for Linux VM sandboxes. Stopping a Linux VM sandbox already offloads filesystem state and releases disk quota, so a separate archive step is not needed.

Archive is not supported for Windows sandboxes. Stopping a Windows sandbox already offloads filesystem state and releases disk quota, so a separate archive step is not needed.

## [\#](https://www.daytona.io/docs/en/sandboxes/\#pause--resume-sandboxes) Pause / resume sandboxes

[Section titled “Pause / resume sandboxes”](https://www.daytona.io/docs/en/sandboxes/#pause--resume-sandboxes)

Pause and resume a sandbox.

- [Container](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1307)
- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1308)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1309)

Pause is not supported for container sandboxes. The filesystem can be preserved on stop, but memory state is not. Use [**stop**](https://www.daytona.io/docs/en/sandboxes/#stop-sandboxes) to shut down a container sandbox when it is not in use.

The filesystem and memory state are preserved, and CPU is no longer consumed.

1. Ensure the Linux VM sandbox is **started**
2. **Pause** the Linux VM sandbox
3. Wait for the Linux VM sandbox to reach the **paused** state
4. **Resume** (start) the Linux VM sandbox again when you need to resume it

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1175)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1176)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1177)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1178)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1179)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1180)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1181)

```
sandbox.pause()
```

```
await sandbox.pause()
```

```
sandbox.pause
```

```
sandbox.Pause(ctx)
```

```
sandbox.pause();
```

```
daytona pause [SANDBOX_ID] | [SANDBOX_NAME]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/pause' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

The filesystem and memory state are preserved, and CPU is no longer consumed.

1. Ensure the Windows sandbox is **started**
2. **Pause** the Windows sandbox
3. Wait for the Windows sandbox to reach the **paused** state
4. **Resume** (start) the Windows sandbox again when you need to resume it

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1182)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1183)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1184)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1185)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1186)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1187)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1188)

```
sandbox.pause()
```

```
await sandbox.pause()
```

```
sandbox.pause
```

```
sandbox.Pause(ctx)
```

```
sandbox.pause();
```

```
daytona pause [SANDBOX_ID] | [SANDBOX_NAME]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/pause' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#recover-sandboxes) Recover sandboxes

[Section titled “Recover sandboxes”](https://www.daytona.io/docs/en/sandboxes/#recover-sandboxes)

Recover a sandbox.

1. Ensure the sandbox is in **error** state
2. Check that the sandbox is **recoverable**
3. Resolve any underlying issue that requires user intervention
4. **Recover** the sandbox and wait for it to be ready

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1189)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1190)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1191)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1192)

```
# Check if the sandbox is recoverable

if sandbox.recoverable:

    sandbox.recover()
```

```
sandbox.recover()
```

```
// Check if the sandbox is recoverable

if (sandbox.recoverable) {

  await sandbox.recover()

}
```

```
await sandbox.recover()
```

```
# Check if the sandbox is in an error state before recovering

if sandbox.state == 'error'

  sandbox.recover

end
```

```
sandbox.recover
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/recover' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/recover' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#resize-sandboxes) Resize sandboxes

[Section titled “Resize sandboxes”](https://www.daytona.io/docs/en/sandboxes/#resize-sandboxes)

Resizing updates the sandbox resource allocation (`cpu`, `memory`, and `disk`) for that sandbox. CPU and memory control compute capacity for running workloads, while disk controls persistent filesystem capacity.

On a running sandbox, you can increase CPU and memory without interruption. To decrease CPU or memory, or to increase disk capacity, stop the sandbox first. Disk size can only be increased and cannot be decreased.

1. Choose the new **CPU**, **memory**, and **disk** values within your organization’s limits
2. Ensure the sandbox is **stopped** if you need to decrease CPU or memory, or increase disk
3. **Resize** the sandbox with the new resource values
4. **Start** the sandbox

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1193)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1194)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1195)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1196)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1197)

```
# Resize a started sandbox (CPU and memory can be increased)

sandbox.resize(Resources(cpu=2, memory=4))

# Resize a stopped sandbox (CPU and memory can change, disk can only increase)

sandbox.stop()

sandbox.resize(Resources(cpu=4, memory=8, disk=20))

sandbox.start()
```

```
// Resize a started sandbox (CPU and memory can be increased)

await sandbox.resize({ cpu: 2, memory: 4 })

// Resize a stopped sandbox (CPU and memory can change, disk can only increase)

await sandbox.stop()

await sandbox.resize({ cpu: 4, memory: 8, disk: 20 })

await sandbox.start()
```

```
# Resize a started sandbox (CPU and memory can be increased)

sandbox.resize(Daytona::Resources.new(cpu: 2, memory: 4))

# Resize a stopped sandbox (CPU and memory can change, disk can only increase)

sandbox.stop

sandbox.resize(Daytona::Resources.new(cpu: 4, memory: 8, disk: 20))

sandbox.start
```

```
// Resize a started sandbox (CPU and memory can be increased)

err := sandbox.Resize(ctx, &types.Resources{CPU: 2, Memory: 4})

// Resize a stopped sandbox (CPU and memory can change, disk can only increase)

err = sandbox.Stop(ctx)

err = sandbox.Resize(ctx, &types.Resources{CPU: 4, Memory: 8, Disk: 20})

err = sandbox.Start(ctx)
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/resize' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "cpu": 2,

  "memory": 4,

  "disk": 20

}'
```

To verify CPU and memory limits inside the sandbox after resizing, read `cgroup` values directly. Tools such as `nproc`, `free`, `top`, `htop`, `/proc/cpuinfo`, and `/proc/meminfo` read host-level values and do not reflect sandbox resource limits.

```
cat /sys/fs/cgroup/cpu.max      # "<quota> <period>" (cores = quota / period)

cat /sys/fs/cgroup/memory.max   # bytes

df -h /                         # disk
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#label-sandboxes) Label sandboxes

[Section titled “Label sandboxes”](https://www.daytona.io/docs/en/sandboxes/#label-sandboxes)

Set sandbox labels.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Click **Add Labels**
4. Enter the labels in key-value pairs

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1198)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1199)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1200)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1201)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1202)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1203)

```
sandbox.set_labels({

    "team": "platform",

    "env": "staging",

})
```

```
await sandbox.setLabels({

  team: 'platform',

  env: 'staging',

})
```

```
sandbox.labels = {

  team: 'platform',

  env: 'staging'

}
```

```
err := sandbox.SetLabels(ctx, map[string]string{

  "team": "platform",

  "env":  "staging",

})
```

```
Map<String, String> labels = new HashMap<>();

labels.put("team", "platform");

labels.put("env", "staging");

sandbox.setLabels(labels);
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/labels' \

  --request PUT \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "labels": {

    "team": "platform",

    "env": "staging"

  }

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#delete-sandboxes) Delete sandboxes

[Section titled “Delete sandboxes”](https://www.daytona.io/docs/en/sandboxes/#delete-sandboxes)

Delete a sandbox.

By default `delete` is fire-and-forget: it returns as soon as the API accepts the deletion request, without waiting for the sandbox to be destroyed. Pass the `wait` flag to block until the sandbox reaches the destroyed state.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the **Delete** button next to the sandbox you want to delete.

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1204)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1205)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1206)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1207)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1208)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1209)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1210)

```
sandbox.delete()

# Block until the sandbox is destroyed

sandbox.delete(timeout=60, wait=True)
```

```
await sandbox.delete()

// Block until the sandbox is destroyed

await sandbox.delete(60, true)
```

```
sandbox.delete

# Block until the sandbox is destroyed

sandbox.delete(60, wait: true)
```

```
err = sandbox.Delete(ctx)

// Block until the sandbox is destroyed

err = sandbox.DeleteAndWait(ctx, 60*time.Second)
```

```
sandbox.delete();

// Block until the sandbox is destroyed

sandbox.delete(60, true);
```

```
daytona delete [SANDBOX_ID] | [SANDBOX_NAME] [flags]
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}' \

  --request DELETE \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#create-snapshot-from-sandbox) Create snapshot from sandbox

[Section titled “Create snapshot from sandbox”](https://www.daytona.io/docs/en/sandboxes/#create-snapshot-from-sandbox)

Create a snapshot from a running or stopped sandbox.

- [Container](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1290)
- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1291)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1292)

Container sandboxes capture filesystem state only ( **cold snapshot**):

| **Snapshot type** | **Include memory** | **Snapshot contents** | **Required sandbox state** |
| --- | --- | --- | --- |
| Cold | **`false`** (default) | Filesystem only | Stopped |

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1211)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1212)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1213)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1214)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1215)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1216)

```
sandbox._experimental_create_snapshot("my-snapshot")
```

```
await sandbox._experimental_createSnapshot('my-snapshot')
```

```
sandbox.experimental_create_snapshot(name: 'my-snapshot')
```

```
err := sandbox.ExperimentalCreateSnapshot(ctx, "my-snapshot")

if err != nil {

    return err

}
```

```
sandbox.experimentalCreateSnapshot("my-snapshot");
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-snapshot",

  "includeMemory": false

}'
```

Linux VM sandboxes capture filesystem state only ( **cold snapshot**) or filesystem and memory state ( **hot snapshot**) through the `includeMemory` parameter:

| **Snapshot type** | **Include memory** | **Snapshot contents** | **Required sandbox state** |
| --- | --- | --- | --- |
| Cold | **`false`** (default) | Filesystem only | Stopped |
| Hot | **`true`** | Filesystem and memory | Started |

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1217)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1218)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1219)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1220)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1221)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1222)

```
# Cold snapshot (filesystem only, sandbox stopped)

sandbox._experimental_create_snapshot("my-snapshot")

# Hot snapshot (filesystem and memory, sandbox running)

sandbox._experimental_create_snapshot("my-vm-snapshot", include_memory=True)
```

```
// Cold snapshot (filesystem only, sandbox stopped)

await sandbox._experimental_createSnapshot('my-snapshot')

// Hot snapshot (filesystem and memory, sandbox running)

await sandbox._experimental_createSnapshot('my-vm-snapshot', 60, true)
```

```
# Cold snapshot (filesystem only, sandbox stopped)

sandbox.experimental_create_snapshot(name: 'my-snapshot')

# Hot snapshot (filesystem and memory, sandbox running)

sandbox.experimental_create_snapshot(name: 'my-vm-snapshot', include_memory: true)
```

```
// Cold snapshot (filesystem only, sandbox stopped)

err := sandbox.ExperimentalCreateSnapshot(ctx, "my-snapshot")

if err != nil {

    return err

}

// Hot snapshot (filesystem and memory, sandbox running)

err = sandbox.ExperimentalCreateSnapshotWithMemory(ctx, "my-vm-snapshot", 60*time.Second)

if err != nil {

    return err

}
```

```
// Cold snapshot (filesystem only, sandbox stopped)

sandbox.experimentalCreateSnapshot("my-snapshot");

// Hot snapshot (filesystem and memory, sandbox running)

sandbox.experimentalCreateSnapshot("my-vm-snapshot", 60, true);
```

```
# Cold snapshot (filesystem only, sandbox stopped)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-snapshot",

  "includeMemory": false

}'

# Hot snapshot (filesystem and memory, sandbox running)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-vm-snapshot",

  "includeMemory": true

}'
```

Windows sandboxes capture filesystem state only ( **cold snapshot**) or filesystem and memory state ( **hot snapshot**) through the `includeMemory` parameter:

| **Snapshot type** | **Include memory** | **Snapshot contents** | **Required sandbox state** |
| --- | --- | --- | --- |
| Cold | **`false`** (default) | Filesystem only | Stopped |
| Hot | **`true`** | Filesystem and memory | Started |

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1223)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1224)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1225)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1226)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1227)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1228)

```
# Cold snapshot (filesystem only, sandbox stopped)

sandbox._experimental_create_snapshot("my-snapshot")

# Hot snapshot (filesystem and memory, sandbox running)

sandbox._experimental_create_snapshot("my-vm-snapshot", include_memory=True)
```

```
// Cold snapshot (filesystem only, sandbox stopped)

await sandbox._experimental_createSnapshot('my-snapshot')

// Hot snapshot (filesystem and memory, sandbox running)

await sandbox._experimental_createSnapshot('my-vm-snapshot', 60, true)
```

```
# Cold snapshot (filesystem only, sandbox stopped)

sandbox.experimental_create_snapshot(name: 'my-snapshot')

# Hot snapshot (filesystem and memory, sandbox running)

sandbox.experimental_create_snapshot(name: 'my-vm-snapshot', include_memory: true)
```

```
// Cold snapshot (filesystem only, sandbox stopped)

err := sandbox.ExperimentalCreateSnapshot(ctx, "my-snapshot")

if err != nil {

    return err

}

// Hot snapshot (filesystem and memory, sandbox running)

err = sandbox.ExperimentalCreateSnapshotWithMemory(ctx, "my-vm-snapshot", 60*time.Second)

if err != nil {

    return err

}
```

```
// Cold snapshot (filesystem only, sandbox stopped)

sandbox.experimentalCreateSnapshot("my-snapshot");

// Hot snapshot (filesystem and memory, sandbox running)

sandbox.experimentalCreateSnapshot("my-vm-snapshot", 60, true);
```

```
# Cold snapshot (filesystem only, sandbox stopped)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-snapshot",

  "includeMemory": false

}'

# Hot snapshot (filesystem and memory, sandbox running)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-vm-snapshot",

  "includeMemory": true

}'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#fork-sandboxes) Fork sandboxes

[Section titled “Fork sandboxes”](https://www.daytona.io/docs/en/sandboxes/#fork-sandboxes)

Fork a sandbox.

- [Container](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1293)
- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1294)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1295)

Forking is not supported for container sandboxes. Use [**create snapshot from sandbox**](https://www.daytona.io/docs/en/sandboxes/#create-snapshot-from-sandbox) to capture filesystem state, then create a new sandbox from that snapshot.

Forking creates a duplicate of a Linux VM sandbox’s filesystem and memory state in a new sandbox. The forked sandbox is fully independent: it can be started, stopped, and deleted without affecting the original.

Daytona tracks the parent-child relationship in a fork tree, so you can trace a fork’s lineage back to the sandbox it was created from. You can fork a fork to build branches. The parent sandbox cannot be deleted while it has active fork children.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the three-dot menu ( **⋮**) next to the started Linux VM sandbox you want to fork
3. Select **Fork**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1229)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1230)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1231)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1232)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1233)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1234)

```
# Fork sandbox through the Sandbox instance

forked = sandbox.fork(name="my-forked-sandbox")
```

```
// Fork sandbox through the Sandbox instance

const forkedSandbox = await sandbox.fork({ name: "my-forked-sandbox" });

// Or use the Daytona helper method

const forkedSandbox = await daytona.fork(sandbox, { name: "my-forked-sandbox" });
```

```
# Fork sandbox through the Sandbox instance

forkedSandbox = sandbox.fork(name: "my-forked-sandbox")
```

```
// Fork sandbox through the Sandbox instance

name := "my-forked-sandbox"

forkedSandbox, err := sandbox.Fork(ctx, &name)

if err != nil {

    return err

}
```

```
// Fork sandbox through the Sandbox instance

Sandbox forkedSandbox = sandbox.fork("my-forked-sandbox", 60);
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/fork' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-forked-sandbox"

}'
```

Query fork relationships:

```
# List direct fork children of a sandbox

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/forks' \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Get the parent sandbox of a fork

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/parent' \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Get the full ancestor chain (parent, grandparent, and so on)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ancestors' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

Forking creates a duplicate of a Windows sandbox’s filesystem and memory state in a new sandbox. The forked sandbox is fully independent: it can be started, stopped, and deleted without affecting the original.

Daytona tracks the parent-child relationship in a fork tree, so you can trace a fork’s lineage back to the sandbox it was created from. You can fork a fork to build branches. The parent sandbox cannot be deleted while it has active fork children.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click the three-dot menu ( **⋮**) next to the started Windows sandbox you want to fork
3. Select **Fork**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1235)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1236)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1237)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1238)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1239)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1240)

```
# Fork sandbox through the Sandbox instance

forked = sandbox.fork(name="my-forked-sandbox")
```

```
// Fork sandbox through the Sandbox instance

const forkedSandbox = await sandbox.fork({ name: "my-forked-sandbox" });

// Or use the Daytona helper method

const forkedSandbox = await daytona.fork(sandbox, { name: "my-forked-sandbox" });
```

```
# Fork sandbox through the Sandbox instance

forkedSandbox = sandbox.fork(name: "my-forked-sandbox")
```

```
// Fork sandbox through the Sandbox instance

name := "my-forked-sandbox"

forkedSandbox, err := sandbox.Fork(ctx, &name)

if err != nil {

    return err

}
```

```
// Fork sandbox through the Sandbox instance

Sandbox forkedSandbox = sandbox.fork("my-forked-sandbox", 60);
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/fork' \

  --request POST \

  --header 'X-Daytona-Organization-ID: YOUR_ORGANIZATION_ID' \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "my-forked-sandbox"

}'
```

Query fork relationships:

```
# List direct fork children of a sandbox

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/forks' \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Get the parent sandbox of a fork

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/parent' \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Get the full ancestor chain (parent, grandparent, and so on)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ancestors' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/sandboxes/\#sandbox-lifecycle) Sandbox lifecycle

[Section titled “Sandbox lifecycle”](https://www.daytona.io/docs/en/sandboxes/#sandbox-lifecycle)

| **Lifecycle feature** | **Container** | **Linux VM** | **Windows** | **GPU** |
| --- | --- | --- | --- | --- |
| Start sandboxes | ✓ | ✓ | ✓ | ✓ |
| Stop sandboxes | ✓ | ✓ | ✓ | ✓ |
| Pause / resume sandboxes | ✗ | ✓ | ✓ | ✗ |
| Archive sandboxes | ✓ | ✗ | ✗ | ✗ |
| Fork sandboxes | ✗ | ✓ | ✓ | ✗ |
| Snapshot from sandbox <br>(filesystem only) | ✓ | ✓ | ✓ | ✓ |
| Snapshot from sandbox <br>(filesystem + memory) | ✗ | ✓ | ✓ | ✗ |

A sandbox can have several different states. Each state reflects the status of your sandbox.

| **State** | **Description** |
| --- | --- |
| Creating | The sandbox is provisioning and will be ready to use. |
| Pulling Snapshot | The sandbox is pulling a [**snapshot**](https://www.daytona.io/docs/en/snapshots) to provide a base environment. |
| Building Snapshot | The sandbox is building a [**snapshot**](https://www.daytona.io/docs/en/snapshots) to provide a base environment. |
| Pending Build | The sandbox build is pending and will start shortly. |
| Build Failed | The sandbox build failed and needs to be retried. |
| Starting | The sandbox is starting and will be ready to use. |
| Started | The sandbox has started and is ready to use. |
| Stopping | The sandbox is stopping and will no longer accept requests. |
| Stopped | The sandbox has stopped and is no longer running. Container sandboxes keep their filesystem on the runner. VM sandboxes offload filesystem state to nearby storage. |
| Pausing | The VM sandbox is pausing while its filesystem and memory state are preserved. |
| Paused | The VM sandbox is paused with filesystem and memory state preserved. State is offloaded to nearby storage. |
| Resuming | The VM sandbox is resuming from a paused state and will be ready to use. |
| Archiving | The container sandbox filesystem is being moved to object storage. |
| Archived | The container sandbox filesystem is stored in object storage. |
| Restoring | The sandbox is being restored and will be ready to use shortly. |
| Resizing | The sandbox is being resized to a new set of resources. |
| Snapshotting | The sandbox is creating a [**snapshot**](https://www.daytona.io/docs/en/snapshots) of its filesystem and memory. |
| Forking | The sandbox is being forked into a new independent sandbox. |
| Deleting | The sandbox is deleting and will be removed. |
| Deleted | The sandbox has been deleted and no longer exists. |
| Error | The sandbox is in an error state and needs to be recovered. |
| Unknown | The default sandbox state before it is created. |

Show more

The diagram demonstrates the states and possible transitions between them.

![Sandbox lifecycle diagram](https://www.daytona.io/docs/_astro/sandbox-states.CPW4fTyb.svg)

##### [\#](https://www.daytona.io/docs/en/sandboxes/\#state-transitions) State transitions

[Section titled “State transitions”](https://www.daytona.io/docs/en/sandboxes/#state-transitions)

A sandbox can transition between states in response to various actions. The following table lists the initial state, target state, and trigger for the transition.

| **Initial state** | **Target state** | **Trigger** |
| --- | --- | --- |
| Unknown | Pulling Snapshot | The base snapshot is being pulled to provide the sandbox environment. |
| Unknown | Building Snapshot | The sandbox uses a declarative image build, which begins building. |
| Pending Build | Building Snapshot | The queued image build starts. |
| Building Snapshot | Build Failed | The image build fails or times out. |
| Pulling Snapshot | Creating | The snapshot is available and the sandbox container is created. |
| Building Snapshot | Creating | The snapshot finishes building and the sandbox container is created. |
| Creating | Started | The sandbox container finishes initializing and is running. |
| Stopped | Starting | A start is requested and the sandbox boots. |
| Stopped | Restoring | A start is requested and the sandbox is restored from a backup. |
| Archived | Restoring | A start is requested and the archived filesystem is restored from object storage. |
| Restoring | Started | The restore completes and the sandbox is running. |
| Starting | Started | The sandbox is running and ready to accept requests. |
| Started | Stopping | A stop is requested, or the auto-stop interval is exceeded. |
| Stopping | Stopped | The sandbox process exits and its memory state is cleared. |
| Started | Pausing | A pause is requested, or the auto-pause interval is exceeded. |
| Pausing | Paused | The filesystem and memory state are preserved. |
| Paused | Resuming | A start is requested on a paused sandbox. |
| Paused | Stopping | A stop is requested on a paused sandbox. |
| Resuming | Started | The sandbox resumes from memory and is running. |
| Stopped | Archiving | An archive is requested, or the auto-archive interval is exceeded. |
| Archiving | Archived | The backup completes and the filesystem is moved to object storage. |
| Started | Resizing | CPU or memory is increased on a running sandbox. |
| Stopped | Resizing | Resources are changed on a stopped sandbox. |
| Resizing | Started | The running sandbox returns to service after resizing. |
| Resizing | Stopped | The stopped sandbox completes resizing. |
| Started | Snapshotting | A snapshot of the filesystem and memory is created. |
| Stopped | Snapshotting | A snapshot of the filesystem is created. |
| Snapshotting | Started | The snapshot completes and the sandbox returns to service. |
| Snapshotting | Stopped | The snapshot completes and the sandbox remains stopped. |
| Started | Forking | The sandbox is forked into a new independent sandbox. |
| Forking | Started | The fork completes and the sandbox returns to service. |
| Started | Deleting | A delete is requested, or the auto-delete interval is exceeded. |
| Stopped | Deleting | A delete is requested. |
| Archived | Deleted | An archived sandbox is deleted directly without being restored. |
| Deleting | Deleted | The sandbox is removed and its resources are released. |
| Started | Error | An operation fails or times out. |
| Error | Restoring | A recover is requested for a recoverable error and the sandbox is restored. |
| Error | Archiving | An errored sandbox with a completed backup is archived to preserve its state. |

Show more

## [\#](https://www.daytona.io/docs/en/sandboxes/\#automated-lifecycle-management) Automated lifecycle management

[Section titled “Automated lifecycle management”](https://www.daytona.io/docs/en/sandboxes/#automated-lifecycle-management)

Sandboxes can be managed automatically based on user-defined deadlines. Inactivity and stopped-time intervals stop, pause, archive, or delete a sandbox when it is idle. Wall-clock TTL destroys a sandbox after a fixed deadline regardless of state.

- **[Auto-stop interval](https://www.daytona.io/docs/en/sandboxes/#auto-stop-interval)**: stop a sandbox after a specified period of inactivity
- **[Auto-pause interval](https://www.daytona.io/docs/en/sandboxes/#auto-pause-interval)**: pause a VM sandbox after a specified period of inactivity
- **[Auto-archive interval](https://www.daytona.io/docs/en/sandboxes/#auto-archive-interval)**: archive a sandbox after a specified period of inactivity
- **[Auto-delete interval](https://www.daytona.io/docs/en/sandboxes/#auto-delete-interval)**: delete a sandbox after a specified period of inactivity
- **[Wall-clock TTL](https://www.daytona.io/docs/en/sandboxes/#wall-clock-ttl)**: destroy a sandbox after a fixed wall-clock deadline, regardless of state
- **[Update sandbox last activity](https://www.daytona.io/docs/en/sandboxes/#update-sandbox-last-activity)**: signal activity to reset the inactivity timer
- **[Running indefinitely](https://www.daytona.io/docs/en/sandboxes/#running-indefinitely)**: run a sandbox indefinitely

### [\#](https://www.daytona.io/docs/en/sandboxes/\#auto-stop-interval) Auto-stop interval

[Section titled “Auto-stop interval”](https://www.daytona.io/docs/en/sandboxes/#auto-stop-interval)

The auto-stop interval sets the amount of time after which a running sandbox is automatically stopped. The auto-stop triggers even if there are internal processes running in the sandbox.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Set **`auto-stop`** interval to the desired value in minutes

   - **`0`**: disables the auto-stop functionality, allowing the sandbox to run indefinitely
   - if not set, the default interval of 15 minutes is used
4. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1241)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1242)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1243)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1244)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1245)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1246)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="my-snapshot",

    # Disables the auto-stop feature - default is 15 minutes

    auto_stop_interval=0,

))
```

```
const sandbox = await daytona.create({

  snapshot: 'my-snapshot',

  // Disables the auto-stop feature - default is 15 minutes

  autoStopInterval: 0,

})
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'my-snapshot',

    # Disables the auto-stop feature - default is 15 minutes

    auto_stop_interval: 0

  )

)
```

```
// Create a sandbox with auto-stop disabled

autoStopInterval := 0

params := types.SnapshotParams{

    Snapshot: "my-snapshot",

    SandboxBaseParams: types.SandboxBaseParams{

        AutoStopInterval: &autoStopInterval,

    },

}

sandbox, err := client.Create(ctx, params)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("my-snapshot");

            // Disables the auto-stop feature - default is 15 minutes

            params.setAutoStopInterval(0);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autostop/{interval}' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

The system differentiates between “internal processes” and “active user interaction”. Merely having a script or background task running is not sufficient to keep the sandbox alive.

##### [\#](https://www.daytona.io/docs/en/sandboxes/\#what-resets-the-timer) What resets the timer

[Section titled “What resets the timer”](https://www.daytona.io/docs/en/sandboxes/#what-resets-the-timer)

The inactivity timer resets only for specific external interactions:

- Updates to [sandbox lifecycle states](https://www.daytona.io/docs/en/sandboxes/#sandbox-lifecycle)
- Network requests through [sandbox previews](https://www.daytona.io/docs/en/preview)
- Active [SSH connections](https://www.daytona.io/docs/en/ssh-access)
- API requests to the [Daytona Toolbox SDK](https://www.daytona.io/docs/en/tools/api/#daytona-toolbox)

##### [\#](https://www.daytona.io/docs/en/sandboxes/\#what-does-not-reset-the-timer) What does not reset the timer

[Section titled “What does not reset the timer”](https://www.daytona.io/docs/en/sandboxes/#what-does-not-reset-the-timer)

The following do not reset the timer:

- SDK requests that are not toolbox actions
- Background scripts (e.g., `npm run dev` run as a fire-and-forget command)
- Long-running tasks without external interaction
- Processes that don’t involve active monitoring

If you run a long-running task like LLM inference that takes more than 15 minutes to complete without any external interaction, the sandbox may auto-stop mid-process because the process itself doesn’t count as “activity”, therefore the timer is not reset.

### [\#](https://www.daytona.io/docs/en/sandboxes/\#auto-pause-interval) Auto-pause interval

[Section titled “Auto-pause interval”](https://www.daytona.io/docs/en/sandboxes/#auto-pause-interval)

The auto-pause interval sets the amount of time after which an idle VM sandbox is automatically [paused](https://www.daytona.io/docs/en/sandboxes/#pause--resume-sandboxes). Auto-pause applies only to [VM sandboxes](https://www.daytona.io/docs/en/sandboxes/#vm-sandboxes) and is mutually exclusive with the [auto-stop interval](https://www.daytona.io/docs/en/sandboxes/#auto-stop-interval): at most one of the two intervals may be non-zero. Ephemeral sandboxes cannot have auto-pause enabled.

The interval is set in minutes:

- **`0`**: disables the auto-pause functionality
- if neither auto-pause nor auto-stop is set, non-ephemeral sandbox classes that support pausing default to an auto-pause interval of 60 minutes with auto-stop disabled

The sandbox pauses after no new events occur for the specified interval. Events include sandbox state changes and interactions with the sandbox through the SDK. Interactions through [sandbox previews](https://www.daytona.io/docs/en/preview) do not reset the timer.

- [Container](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1296)
- [Linux VM](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1297)
- [Windows](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1298)
- [GPU](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1299)

Auto-pause is not supported for container sandboxes. Use [**auto-stop**](https://www.daytona.io/docs/en/sandboxes/#auto-stop-interval) to stop a container sandbox after a period of inactivity.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Select a Linux VM snapshot
4. Set **`auto-pause`** interval to the desired value in minutes

   - **`0`**: disables the auto-pause functionality
   - if neither auto-pause nor auto-stop is set, the default interval of 60 minutes is used with auto-stop disabled
5. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1247)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1248)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1249)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1250)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1251)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1252)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="daytona-vm-small",

    # Auto-pause after 1 hour of inactivity

    auto_pause_interval=60,

))

# Update the auto-pause interval on an existing sandbox

sandbox.set_auto_pause_interval(60)

# Disable auto-pause

sandbox.set_auto_pause_interval(0)
```

```
const sandbox = await daytona.create({

  snapshot: 'daytona-vm-small',

  // Auto-pause after 1 hour of inactivity

  autoPauseInterval: 60,

})

// Update the auto-pause interval on an existing sandbox

await sandbox.setAutoPauseInterval(60)

// Disable auto-pause

await sandbox.setAutoPauseInterval(0)
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'daytona-vm-small',

    # Auto-pause after 1 hour of inactivity

    auto_pause_interval: 60

  )

)

# Update the auto-pause interval on an existing sandbox

sandbox.auto_pause_interval = 60

# Disable auto-pause

sandbox.auto_pause_interval = 0
```

```
// Auto-pause after 1 hour of inactivity

autoPauseInterval := 60

params := types.SnapshotParams{

    Snapshot: "daytona-vm-small",

    SandboxBaseParams: types.SandboxBaseParams{

        AutoPauseInterval: &autoPauseInterval,

    },

}

sandbox, err := client.Create(ctx, params)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("daytona-vm-small");

            // Auto-pause after 1 hour of inactivity

            params.setAutoPauseInterval(60);

            Sandbox sandbox = daytona.create(params);

            // Update the auto-pause interval on an existing sandbox

            sandbox.setAutoPauseInterval(60);

            // Disable auto-pause

            sandbox.setAutoPauseInterval(0);

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autopause/{interval}' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Select a Windows snapshot
4. Set **`auto-pause`** interval to the desired value in minutes

   - **`0`**: disables the auto-pause functionality
   - if neither auto-pause nor auto-stop is set, the default interval of 60 minutes is used with auto-stop disabled
5. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1253)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1254)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1255)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1256)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1257)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1258)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="windows-small",

    # Auto-pause after 1 hour of inactivity

    auto_pause_interval=60,

))

# Update the auto-pause interval on an existing sandbox

sandbox.set_auto_pause_interval(60)

# Disable auto-pause

sandbox.set_auto_pause_interval(0)
```

```
const sandbox = await daytona.create({

  snapshot: 'windows-small',

  // Auto-pause after 1 hour of inactivity

  autoPauseInterval: 60,

})

// Update the auto-pause interval on an existing sandbox

await sandbox.setAutoPauseInterval(60)

// Disable auto-pause

await sandbox.setAutoPauseInterval(0)
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'windows-small',

    # Auto-pause after 1 hour of inactivity

    auto_pause_interval: 60

  )

)

# Update the auto-pause interval on an existing sandbox

sandbox.auto_pause_interval = 60

# Disable auto-pause

sandbox.auto_pause_interval = 0
```

```
// Auto-pause after 1 hour of inactivity

autoPauseInterval := 60

params := types.SnapshotParams{

    Snapshot: "windows-small",

    SandboxBaseParams: types.SandboxBaseParams{

        AutoPauseInterval: &autoPauseInterval,

    },

}

sandbox, err := client.Create(ctx, params)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("windows-small");

            // Auto-pause after 1 hour of inactivity

            params.setAutoPauseInterval(60);

            Sandbox sandbox = daytona.create(params);

            // Update the auto-pause interval on an existing sandbox

            sandbox.setAutoPauseInterval(60);

            // Disable auto-pause

            sandbox.setAutoPauseInterval(0);

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autopause/{interval}' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

Auto-pause is not supported for GPU sandboxes. GPU sandboxes are ephemeral and cannot have auto-pause enabled.

### [\#](https://www.daytona.io/docs/en/sandboxes/\#auto-archive-interval) Auto-archive interval

[Section titled “Auto-archive interval”](https://www.daytona.io/docs/en/sandboxes/#auto-archive-interval)

The auto-archive interval sets the amount of time after which a continuously stopped sandbox is automatically archived. Auto-archive applies only to container sandboxes. VM sandboxes are excluded.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Set **`auto-archive`** interval to the desired value in minutes

   - **`0`**: the maximum interval of 30 days is used
   - if not set, the default interval of 7 days is used
4. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1259)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1260)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1261)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1262)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1263)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1264)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="my-snapshot",

    # Auto-archive after a sandbox has been stopped for 1 hour

    auto_archive_interval=60,

))
```

```
const sandbox = await daytona.create({

  snapshot: 'my-snapshot',

  // Auto-archive after a sandbox has been stopped for 1 hour

  autoArchiveInterval: 60,

})
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'my-snapshot',

    # Auto-archive after a sandbox has been stopped for 1 hour

    auto_archive_interval: 60

  )

)
```

```
// Create a sandbox with auto-archive after 1 hour

autoArchiveInterval := 60

params := types.SnapshotParams{

    Snapshot: "my-snapshot",

    SandboxBaseParams: types.SandboxBaseParams{

        AutoArchiveInterval: &autoArchiveInterval,

    },

}

sandbox, err := client.Create(ctx, params)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("my-snapshot");

            // Auto-archive after a sandbox has been stopped for 1 hour

            params.setAutoArchiveInterval(60);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autoarchive/{interval}' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#auto-delete-interval) Auto-delete interval

[Section titled “Auto-delete interval”](https://www.daytona.io/docs/en/sandboxes/#auto-delete-interval)

The auto-delete interval sets the amount of time after which a continuously stopped sandbox is automatically deleted.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Set **`auto-delete`** to the desired value in minutes

   - `-1`: disables the auto-delete functionality
   - `0`: the sandbox is deleted immediately after it is stopped
   - if not set, the sandbox is not deleted automatically
4. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1265)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1266)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1267)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1268)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1269)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1270)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="my-snapshot",

    # Auto-delete after a sandbox has been stopped for 1 hour

    auto_delete_interval=60,

))

# Delete the sandbox immediately after it has been stopped

sandbox.set_auto_delete_interval(0)

# Disable auto-deletion

sandbox.set_auto_delete_interval(-1)
```

```
const sandbox = await daytona.create({

  snapshot: 'my-snapshot',

  // Auto-delete after a sandbox has been stopped for 1 hour

  autoDeleteInterval: 60,

})

// Delete the sandbox immediately after it has been stopped

await sandbox.setAutoDeleteInterval(0)

// Disable auto-deletion

await sandbox.setAutoDeleteInterval(-1)
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'my-snapshot',

    # Auto-delete after a sandbox has been stopped for 1 hour

    auto_delete_interval: 60

  )

)

# Delete the sandbox immediately after it has been stopped

sandbox.auto_delete_interval = 0

# Disable auto-deletion

sandbox.auto_delete_interval = -1
```

```
// Create a sandbox with auto-delete after 1 hour

autoDeleteInterval := 60

params := types.SnapshotParams{

    Snapshot: "my-snapshot",

    SandboxBaseParams: types.SandboxBaseParams{

        AutoDeleteInterval: &autoDeleteInterval,

    },

}

sandbox, err := client.Create(ctx, params)

// Delete the sandbox immediately after it has been stopped

zeroInterval := 0

err = sandbox.SetAutoDeleteInterval(ctx, &zeroInterval)

// Disable auto-deletion

disableInterval := -1

err = sandbox.SetAutoDeleteInterval(ctx, &disableInterval)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("my-snapshot");

            // Auto-delete after a sandbox has been stopped for 1 hour

            params.setAutoDeleteInterval(60);

            Sandbox sandbox = daytona.create(params);

            // Delete the sandbox immediately after it has been stopped

            sandbox.setAutoDeleteInterval(0);

            // Disable auto-deletion

            sandbox.setAutoDeleteInterval(-1);

        }

    }

}
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autodelete/{interval}' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#wall-clock-ttl) Wall-clock TTL

[Section titled “Wall-clock TTL”](https://www.daytona.io/docs/en/sandboxes/#wall-clock-ttl)

The wall-clock TTL (time-to-live) sets a hard upper bound on how long a sandbox may exist. Unlike the [auto-delete interval](https://www.daytona.io/docs/en/sandboxes/#auto-delete-interval), which counts time only while the sandbox is stopped, TTL runs as wall-clock time from creation (or from the moment you last set it) and destroys the sandbox in any state: started, stopped, paused, or archived.

Set `ttl_minutes` when creating a sandbox, or update it later. The value is in minutes:

- **`0`**: disables the TTL
- if not set, the sandbox has no TTL deadline

Calling `set_ttl` after creation resets the deadline from the current moment. Use wall-clock TTL for agent sessions, CI jobs, and any sandbox that must not outlive a fixed deadline.

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1271)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1272)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1273)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1274)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1275)
- [CLI](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1276)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1277)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="my-snapshot",

    # Destroy the sandbox 2 hours after creation, regardless of state

    ttl_minutes=120,

))

# Reset the deadline to 1 hour from now

sandbox.set_ttl(60)

# Disable the TTL

sandbox.set_ttl(0)
```

```
const sandbox = await daytona.create({

  snapshot: 'my-snapshot',

  // Destroy the sandbox 2 hours after creation, regardless of state

  ttlMinutes: 120,

})

// Reset the deadline to 1 hour from now

await sandbox.setTtl(60)

// Disable the TTL

await sandbox.setTtl(0)
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'my-snapshot',

    # Destroy the sandbox 2 hours after creation, regardless of state

    ttl_minutes: 120

  )

)

# Reset the deadline to 1 hour from now

sandbox.ttl_minutes = 60

# Disable the TTL

sandbox.ttl_minutes = 0
```

```
// Destroy the sandbox 2 hours after creation, regardless of state

ttlMinutes := 120

params := types.SnapshotParams{

    Snapshot: "my-snapshot",

    SandboxBaseParams: types.SandboxBaseParams{

        TtlMinutes: &ttlMinutes,

    },

}

sandbox, err := client.Create(ctx, params)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("my-snapshot");

            // Destroy the sandbox 2 hours after creation, regardless of state

            params.setTtlMinutes(120);

            Sandbox sandbox = daytona.create(params);

            // Reset the deadline to 1 hour from now

            sandbox.setTtl(60);

            // Disable the TTL

            sandbox.setTtl(0);

        }

    }

}
```

```
# Destroy the sandbox 2 hours after creation, regardless of state

daytona create --ttl 120
```

```
# Create with a 2-hour wall-clock TTL

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "snapshot": "my-snapshot",

  "ttlMinutes": 120

}'

# Reset the deadline to 1 hour from now

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ttl/60' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Disable the TTL

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ttl/0' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#update-sandbox-last-activity) Update sandbox last activity

[Section titled “Update sandbox last activity”](https://www.daytona.io/docs/en/sandboxes/#update-sandbox-last-activity)

Update a sandbox’s last activity timestamp.

This updates the sandbox’s recorded activity time without changing its runtime state. It is useful when your workflow is driven by external systems or background orchestration that may not reset inactivity tracking.

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1278)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1279)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1280)
- [API](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1281)

```
sandbox.refresh_activity()
```

```
await sandbox.refreshActivity()
```

```
sandbox.refresh_activity
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/last-activity' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/sandboxes/\#running-indefinitely) Running indefinitely

[Section titled “Running indefinitely”](https://www.daytona.io/docs/en/sandboxes/#running-indefinitely)

Run sandboxes indefinitely.

By default, Daytona sandboxes auto-stop after 15 minutes of inactivity. To keep a sandbox running without interruption from inactivity, set the auto-stop interval to `0` when creating a new sandbox. Disabling auto-stop does not disable [wall-clock TTL](https://www.daytona.io/docs/en/sandboxes/#wall-clock-ttl): if `ttl_minutes` is set, the sandbox is still destroyed when that deadline elapses.

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Click **Create Sandbox**
3. Set **`auto-stop`** to **`0`**
4. Click **Create**

- [Python](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1282)
- [TypeScript](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1283)
- [Ruby](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1284)
- [Go](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1285)
- [Java](https://www.daytona.io/docs/en/sandboxes/#tab-panel-1286)

```
sandbox = daytona.create(CreateSandboxFromSnapshotParams(

    snapshot="my_awesome_snapshot",

    # Disables the auto-stop feature - default is 15 minutes

    auto_stop_interval=0,

))
```

```
const sandbox = await daytona.create({

  snapshot: 'my_awesome_snapshot',

  // Disables the auto-stop feature - default is 15 minutes

  autoStopInterval: 0,

})
```

```
sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'my_awesome_snapshot',

    # Disables the auto-stop feature - default is 15 minutes

    auto_stop_interval: 0

  )

)
```

```
// Disables the auto-stop feature - default is 15 minutes

autoStopInterval := 0

params := types.SnapshotParams{

    Snapshot: "my_awesome_snapshot",

    SandboxBaseParams: types.SandboxBaseParams{

        AutoStopInterval: &autoStopInterval,

    },

}

sandbox, err := client.Create(ctx, params)
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("my_awesome_snapshot");

            // Disables the auto-stop feature - default is 15 minutes

            params.setAutoStopInterval(0);

            Sandbox sandbox = daytona.create(params);

        }

    }

}
```