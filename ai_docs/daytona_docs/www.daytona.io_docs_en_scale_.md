---
url: "https://www.daytona.io/docs/en/scale/"
title: "Scale | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/scale/#_top)

# Scale

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/scale.md)Open

Daytona sandboxes are designed to be created and operated at high volume. A single sandbox scales up by resizing its reserved resources, a fleet scales out by running many sandboxes at once, and each sandbox runs multiple processes concurrently.

Unlike request-based execution environments, a sandbox is a long-lived computer: processes are not terminated after a request completes, so running services, open connections, and background workers persist until the sandbox stops.

Scale operates along three dimensions:

| **Dimension** | **What scales** | **Mechanisms** |
| --- | --- | --- |
| Sandbox (vertical) | vCPU, RAM, and disk of a single sandbox | • [**Custom resources**](https://www.daytona.io/docs/en/sandboxes#resources)<br> • [**Resize**](https://www.daytona.io/docs/en/sandboxes#resize-sandboxes) |
| Fleet (horizontal) | Number of sandboxes running at the same time | • [**Snapshot fan-out**](https://www.daytona.io/docs/en/snapshots)<br> • [**Fork**](https://www.daytona.io/docs/en/sandboxes#fork-sandboxes)<br> • [**Linked sandboxes**](https://www.daytona.io/docs/en/sandboxes#linked-sandboxes) |
| Workload (concurrency) | Concurrent processes inside a single sandbox | • [**Sessions**](https://www.daytona.io/docs/en/process-code-execution#session-operations)<br> • [**Async commands**](https://www.daytona.io/docs/en/process-code-execution#session-operations)<br> • [**PTY sessions**](https://www.daytona.io/docs/en/pty) |

## [\#](https://www.daytona.io/docs/en/scale/\#sandbox-scaling) Sandbox scaling

[Section titled “Sandbox scaling”](https://www.daytona.io/docs/en/scale/#sandbox-scaling)

Sandbox scaling changes the resources of a single sandbox: **vCPU**, **memory**, and **disk**. Resources are reserved when the sandbox is created and can be changed later by resizing.

Resources are set differently depending on how the sandbox is created:

- **From an image**: set **`resources`** on the create parameters
- **From a snapshot**: the sandbox inherits the resources defined on the snapshot

Resizing changes the allocation of an existing sandbox. On a running sandbox, CPU and memory can be increased without interruption. Decreasing CPU or memory, or increasing disk, requires the sandbox to be stopped first. Disk can only grow, and GPU allocation cannot be resized. Every allocation must stay within your organization’s per-sandbox limits.

- [Custom resources](https://www.daytona.io/docs/en/scale/#tab-panel-1357)
- [Resize](https://www.daytona.io/docs/en/scale/#tab-panel-1358)

Reserve CPU, memory, and disk when creating a sandbox from an image.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1312)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1313)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1314)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1315)
- [Java](https://www.daytona.io/docs/en/scale/#tab-panel-1316)
- [CLI](https://www.daytona.io/docs/en/scale/#tab-panel-1317)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1318)

```
from daytona import CreateSandboxFromImageParams, Daytona, Resources

daytona = Daytona()

# Reserve 2 vCPUs, 4GiB of RAM, and 8GiB of disk for the sandbox

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

// Reserve 2 vCPUs, 4GiB of RAM, and 8GiB of disk for the sandbox

const sandbox = await daytona.create({

  image: Image.base('ubuntu:22.04'),

  resources: { cpu: 2, memory: 4, disk: 8 },

})
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# Reserve 2 vCPUs, 4GiB of RAM, and 8GiB of disk for the sandbox

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

  // Reserve 2 vCPUs, 4GiB of RAM, and 8GiB of disk for the sandbox

  sandbox, err := client.Create(ctx, types.ImageParams{

    Image: "ubuntu:22.04",

    Resources: &types.Resources{

      CPU:    2,

      Memory: 4,

      Disk:   8,

    },

  })

  if err != nil {

    // handle error

  }

  _ = sandbox

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromImageParams;

import io.daytona.sdk.model.Resources;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();

            params.setImage("ubuntu:22.04");

            // Reserve 2 vCPUs, 4GiB of RAM, and 8GiB of disk for the sandbox

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
# Reserve 2 vCPUs, 4GiB of RAM, and 8GiB of disk for the sandbox

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

Change the resource allocation of an existing sandbox.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1319)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1320)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1321)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1322)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1323)

```
from daytona import Daytona, Resources

daytona = Daytona()

sandbox = daytona.get("my-sandbox")

# CPU and memory can be increased while the sandbox is running

sandbox.resize(Resources(cpu=4, memory=8))

# Decreasing CPU or memory, or increasing disk, requires a stopped sandbox

sandbox.stop()

sandbox.resize(Resources(cpu=2, memory=4, disk=20))

sandbox.start()
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.get('my-sandbox')

// CPU and memory can be increased while the sandbox is running

await sandbox.resize({ cpu: 4, memory: 8 })

// Decreasing CPU or memory, or increasing disk, requires a stopped sandbox

await sandbox.stop()

await sandbox.resize({ cpu: 2, memory: 4, disk: 20 })

await sandbox.start()
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.get('my-sandbox')

# CPU and memory can be increased while the sandbox is running

sandbox.resize(Daytona::Resources.new(cpu: 4, memory: 8))

# Decreasing CPU or memory, or increasing disk, requires a stopped sandbox

sandbox.stop

sandbox.resize(Daytona::Resources.new(cpu: 2, memory: 4, disk: 20))

sandbox.start
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

  sandbox, err := client.Get(ctx, "my-sandbox")

  if err != nil {

    // handle error

  }

  // CPU and memory can be increased while the sandbox is running

  err = sandbox.Resize(ctx, &types.Resources{CPU: 4, Memory: 8})

  if err != nil {

    // handle error

  }

  // Decreasing CPU or memory, or increasing disk, requires a stopped sandbox

  err = sandbox.Stop(ctx)

  if err != nil {

    // handle error

  }

  err = sandbox.Resize(ctx, &types.Resources{CPU: 2, Memory: 4, Disk: 20})

  if err != nil {

    // handle error

  }

  err = sandbox.Start(ctx)

  if err != nil {

    // handle error

  }

}
```

```
# CPU and memory can be increased while the sandbox is running

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/resize' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "cpu": 4,

  "memory": 8

}'

# Decreasing CPU or memory, or increasing disk, requires a stopped sandbox

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/resize' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "cpu": 2,

  "memory": 4,

  "disk": 20

}'

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/start' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/scale/\#fleet-scaling) Fleet scaling

[Section titled “Fleet scaling”](https://www.daytona.io/docs/en/scale/#fleet-scaling)

Fleet scaling raises the number of sandboxes running at the same time. The unit of scale is the sandbox itself: instead of packing unrelated workloads into one environment, create one sandbox per user, task, or agent.

Sandboxes are isolated from each other, so a fleet scales linearly: each new sandbox adds capacity without contention, and a failure in one sandbox does not affect the others.

The mechanisms differ in what state each new sandbox starts with:

| **Mechanism** | **Starting state** | **Use** |
| --- | --- | --- |
| [**Snapshot fan-out**](https://www.daytona.io/docs/en/snapshots) | Filesystem from the snapshot; hot snapshots add memory state | Any number of identical environments from one prepared snapshot |
| [**Fork**](https://www.daytona.io/docs/en/sandboxes#fork-sandboxes) | Filesystem and memory of a running VM sandbox | Branch a live environment into independent copies |
| [**Linked sandboxes**](https://www.daytona.io/docs/en/sandboxes#linked-sandboxes) | Fresh environment, co-located with a parent on the same runner | Coordinated groups with a local network between parent and children |

- [Snapshot fan-out](https://www.daytona.io/docs/en/scale/#tab-panel-1359)
- [Fork](https://www.daytona.io/docs/en/scale/#tab-panel-1360)
- [Linked sandboxes](https://www.daytona.io/docs/en/scale/#tab-panel-1361)

**Snapshot fan-out** is the default pattern: prepare the environment once, capture it as a snapshot, and create any number of sandboxes from it. Each sandbox starts with the environment intact, with nothing to reinstall. Sandboxes created from a [hot snapshot](https://www.daytona.io/docs/en/snapshots#create-snapshot-from-sandbox) start with processes already running.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1324)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1325)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1326)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1327)
- [Java](https://www.daytona.io/docs/en/scale/#tab-panel-1328)
- [CLI](https://www.daytona.io/docs/en/scale/#tab-panel-1329)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1330)

```
import asyncio

from daytona import AsyncDaytona, CreateSandboxFromSnapshotParams

async def run_task(daytona: AsyncDaytona, shard: int) -> str:

    # Each task gets its own isolated, ephemeral sandbox

    sandbox = await daytona.create(

        CreateSandboxFromSnapshotParams(snapshot="my-env-snapshot", ephemeral=True)

    )

    response = await sandbox.process.exec(f"python3 run.py --shard {shard}")

    # Stop deletes the ephemeral sandbox

    await sandbox.stop()

    return response.result

async def main():

    async with AsyncDaytona() as daytona:

        # Create and run 20 sandboxes concurrently from the same snapshot

        results = await asyncio.gather(*(run_task(daytona, i) for i in range(20)))

        print(results)

asyncio.run(main())
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

async function runTask(shard: number): Promise<string> {

  // Each task gets its own isolated, ephemeral sandbox

  const sandbox = await daytona.create({

    snapshot: 'my-env-snapshot',

    ephemeral: true,

  })

  const response = await sandbox.process.executeCommand(

    `python3 run.py --shard ${shard}`

  )

  // Stop deletes the ephemeral sandbox

  await sandbox.stop()

  return response.result

}

// Create and run 20 sandboxes concurrently from the same snapshot

const results = await Promise.all(

  Array.from({ length: 20 }, (_, i) => runTask(i))

)

console.log(results)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

# Create and run 20 sandboxes concurrently from the same snapshot

results = 20.times.map do |shard|

  Thread.new do

    # Each task gets its own isolated, ephemeral sandbox

    sandbox = daytona.create(

      Daytona::CreateSandboxFromSnapshotParams.new(

        snapshot: 'my-env-snapshot',

        ephemeral: true

      )

    )

    response = sandbox.process.exec(command: "python3 run.py --shard #{shard}")

    # Stop deletes the ephemeral sandbox

    sandbox.stop

    response.result

  end

end.map(&:value)

puts results
```

```
package main

import (

  "context"

  "fmt"

  "sync"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  client, _ := daytona.NewClient()

  ctx := context.Background()

  results := make([]string, 20)

  var wg sync.WaitGroup

  // Create and run 20 sandboxes concurrently from the same snapshot

  for i := 0; i < 20; i++ {

    wg.Add(1)

    go func(shard int) {

      defer wg.Done()

      // Each task gets its own isolated, ephemeral sandbox

      sandbox, err := client.Create(ctx, types.SnapshotParams{

        Snapshot: "my-env-snapshot",

        SandboxBaseParams: types.SandboxBaseParams{

          Ephemeral: true,

        },

      })

      if err != nil {

        return

      }

      response, err := sandbox.Process.ExecuteCommand(

        ctx, fmt.Sprintf("python3 run.py --shard %d", shard),

      )

      if err != nil {

        return

      }

      // Stop deletes the ephemeral sandbox

      _ = sandbox.Stop(ctx)

      results[shard] = response.Result

    }(i)

  }

  wg.Wait()

  fmt.Println(results)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.ArrayList;

import java.util.List;

import java.util.concurrent.CompletableFuture;

import java.util.stream.IntStream;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            // Create and run 20 sandboxes concurrently from the same snapshot

            List<CompletableFuture<String>> futures = IntStream.range(0, 20)

                .mapToObj(shard -> CompletableFuture.supplyAsync(() -> {

                    CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

                    params.setSnapshot("my-env-snapshot");

                    params.setAutoDeleteInterval(0); // ephemeral

                    // Each task gets its own isolated, ephemeral sandbox

                    Sandbox sandbox = daytona.create(params);

                    ExecuteResponse response = sandbox.getProcess()

                        .executeCommand("python3 run.py --shard " + shard);

                    // Stop deletes the ephemeral sandbox

                    sandbox.stop();

                    return response.getResult();

                }))

                .toList();

            List<String> results = new ArrayList<>();

            for (CompletableFuture<String> future : futures) {

                results.add(future.join());

            }

            System.out.println(results);

        }

    }

}
```

```
# Create sandboxes from the same snapshot (run concurrently as needed)

for i in $(seq 0 19); do

  daytona create --snapshot my-env-snapshot --auto-delete 0 &

done

wait
```

```
# Create each sandbox from the same snapshot (issue requests concurrently as needed)

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "snapshot": "my-env-snapshot",

  "autoDeleteInterval": 0

}'
```

**Forking** duplicates a running VM sandbox, filesystem and memory included, into an independent sandbox. Where snapshot fan-out distributes a prepared baseline, forks branch live state: each fork continues from the exact point the original was at. Forking is supported for [VM sandboxes](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes) only.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1331)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1332)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1333)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1334)
- [Java](https://www.daytona.io/docs/en/scale/#tab-panel-1335)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1336)

```
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="daytona-vm-small"))

# Prepare live state once: running processes, loaded caches, open connections

sandbox.process.exec("python3 warmup.py")

# Each fork continues from the same live state, fully independent

forks = [sandbox.fork(name=f"agent-{i}") for i in range(5)]
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create({ snapshot: 'daytona-vm-small' })

// Prepare live state once: running processes, loaded caches, open connections

await sandbox.process.executeCommand('python3 warmup.py')

// Each fork continues from the same live state, fully independent

const forks = await Promise.all(

  Array.from({ length: 5 }, (_, i) =>

    sandbox.fork({ name: `agent-${i}` })

  )

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'daytona-vm-small')

)

# Prepare live state once: running processes, loaded caches, open connections

sandbox.process.exec(command: 'python3 warmup.py')

# Each fork continues from the same live state, fully independent

forks = 5.times.map { |i| sandbox.fork(name: "agent-#{i}") }
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

  sandbox, err := client.Create(ctx, types.SnapshotParams{

    Snapshot: "daytona-vm-small",

  })

  if err != nil {

    // handle error

  }

  // Prepare live state once: running processes, loaded caches, open connections

  _, err = sandbox.Process.ExecuteCommand(ctx, "python3 warmup.py")

  if err != nil {

    // handle error

  }

  // Each fork continues from the same live state, fully independent

  forks := make([]*daytona.Sandbox, 5)

  for i := 0; i < 5; i++ {

    name := fmt.Sprintf("agent-%d", i)

    forks[i], err = sandbox.Fork(ctx, &name)

    if err != nil {

      // handle error

    }

  }

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import java.util.ArrayList;

import java.util.List;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

            params.setSnapshot("daytona-vm-small");

            Sandbox sandbox = daytona.create(params);

            // Prepare live state once: running processes, loaded caches, open connections

            sandbox.getProcess().executeCommand("python3 warmup.py");

            // Each fork continues from the same live state, fully independent

            List<Sandbox> forks = new ArrayList<>();

            for (int i = 0; i < 5; i++) {

                forks.add(sandbox.fork("agent-" + i, 60));

            }

        }

    }

}
```

```
# Fork a running VM sandbox (repeat for each independent copy)

curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/fork' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "agent-0"

}'
```

**Linked sandboxes** attach ephemeral child sandboxes to a parent. Children are scheduled on the same runner as the parent and share a link network, so the group communicates over local connections. One parent may have many children, and deleting the parent deletes all of them.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1337)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1338)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1339)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1340)
- [Java](https://www.daytona.io/docs/en/scale/#tab-panel-1341)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1342)

```
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

parent = daytona.create()

# Children are co-located with the parent and share a link network

children = [\
\
    daytona.create(\
\
        CreateSandboxFromSnapshotParams(\
\
            linked_sandbox=parent.id,\
\
            ephemeral=True,\
\
        )\
\
    )\
\
    for _ in range(3)\
\
]

# Each sandbox on the link network is reachable by name or ID

response = children[0].process.exec(f"curl http://{parent.name}:3000/")
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const parent = await daytona.create()

// Children are co-located with the parent and share a link network

const children = await Promise.all(

  Array.from({ length: 3 }, () =>

    daytona.create({

      linkedSandbox: parent.id,

      ephemeral: true,

    })

  )

)

// Each sandbox on the link network is reachable by name or ID

const response = await children[0].process.executeCommand(

  `curl http://${parent.name}:3000/`

)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

parent = daytona.create

# Children are co-located with the parent and share a link network

children = 3.times.map do

  daytona.create(

    Daytona::CreateSandboxFromSnapshotParams.new(

      linked_sandbox: parent.id,

      ephemeral: true

    )

  )

end

# The link network registers each sandbox under its name and ID as DNS aliases.

# The Ruby SDK does not expose the sandbox name, so address the parent by ID.

response = children[0].process.exec(command: "curl http://#{parent.id}:3000/")
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

  parent, err := client.Create(ctx, types.SnapshotParams{})

  if err != nil {

    // handle error

  }

  // Children are co-located with the parent and share a link network

  children := make([]*daytona.Sandbox, 3)

  for i := 0; i < 3; i++ {

    children[i], err = client.Create(ctx, types.SnapshotParams{

      SandboxBaseParams: types.SandboxBaseParams{

        LinkedSandbox: parent.ID,

        Ephemeral:     true,

      },

    })

    if err != nil {

      // handle error

    }

  }

  // Each sandbox on the link network is reachable by name or ID

  response, err := children[0].Process.ExecuteCommand(

    ctx, fmt.Sprintf("curl http://%s:3000/", parent.Name),

  )

  if err != nil {

    // handle error

  }

  fmt.Println(response.Result)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import io.daytona.sdk.model.ExecuteResponse;

import java.util.ArrayList;

import java.util.List;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox parent = daytona.create();

            // Children are co-located with the parent and share a link network

            List<Sandbox> children = new ArrayList<>();

            for (int i = 0; i < 3; i++) {

                CreateSandboxFromSnapshotParams childParams = new CreateSandboxFromSnapshotParams();

                childParams.setLinkedSandbox(parent.getId());

                childParams.setAutoDeleteInterval(0); // linked sandboxes must be ephemeral

                children.add(daytona.create(childParams));

            }

            // Each sandbox on the link network is reachable by name or ID

            ExecuteResponse response = children.get(0).getProcess()

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

# Create linked child sandboxes (replace PARENT_SANDBOX_ID; repeat for each child)

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "linkedSandbox": "PARENT_SANDBOX_ID",

  "autoDeleteInterval": 0

}'
```

## [\#](https://www.daytona.io/docs/en/scale/\#workload-concurrency) Workload concurrency

[Section titled “Workload concurrency”](https://www.daytona.io/docs/en/scale/#workload-concurrency)

Workload concurrency runs multiple processes inside a single sandbox. A single sandbox can run an API server, a database, and background workers side by side: all processes share the sandbox’s filesystem and network, and exposed ports are reachable through [previews](https://www.daytona.io/docs/en/preview).

A sandbox runs concurrent processes through [sessions](https://www.daytona.io/docs/en/process-code-execution#session-operations). Each session is an independent shell with its own state: working directory, environment variables, and command history.

Commands within a session run sequentially, so parallelism comes from running multiple sessions. Commands started with `run_async` return immediately and run in the background, and [PTY sessions](https://www.daytona.io/docs/en/pty) add interactive terminals.

- [Concurrent sessions](https://www.daytona.io/docs/en/scale/#tab-panel-1355)
- [Background commands](https://www.daytona.io/docs/en/scale/#tab-panel-1356)

Run multiple independent shells in the same sandbox so processes can execute in parallel.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1343)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1344)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1345)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1346)
- [Java](https://www.daytona.io/docs/en/scale/#tab-panel-1347)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1348)

```
from daytona import Daytona, SessionExecuteRequest

daytona = Daytona()

sandbox = daytona.create()

# Each session is an independent shell inside the same sandbox

sandbox.process.create_session("server")

sandbox.process.create_session("worker")

# The server runs in the background while the worker session stays free

sandbox.process.execute_session_command("server", SessionExecuteRequest(

    command="python3 -m http.server 8000",

    run_async=True,

))

response = sandbox.process.execute_session_command("worker", SessionExecuteRequest(

    command="curl -s http://localhost:8000",

))

print(response.output)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create()

// Each session is an independent shell inside the same sandbox

await sandbox.process.createSession('server')

await sandbox.process.createSession('worker')

// The server runs in the background while the worker session stays free

await sandbox.process.executeSessionCommand('server', {

  command: 'python3 -m http.server 8000',

  runAsync: true,

})

const response = await sandbox.process.executeSessionCommand('worker', {

  command: 'curl -s http://localhost:8000',

})

console.log(response.output)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create

# Each session is an independent shell inside the same sandbox

sandbox.process.create_session('server')

sandbox.process.create_session('worker')

# The server runs in the background while the worker session stays free

sandbox.process.execute_session_command(

  session_id: 'server',

  req: Daytona::SessionExecuteRequest.new(

    command: 'python3 -m http.server 8000',

    run_async: true

  )

)

response = sandbox.process.execute_session_command(

  session_id: 'worker',

  req: Daytona::SessionExecuteRequest.new(

    command: 'curl -s http://localhost:8000'

  )

)

puts response.output
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

  sandbox, err := client.Create(ctx, types.SnapshotParams{})

  if err != nil {

    // handle error

  }

  // Each session is an independent shell inside the same sandbox

  err = sandbox.Process.CreateSession(ctx, "server")

  if err != nil {

    // handle error

  }

  err = sandbox.Process.CreateSession(ctx, "worker")

  if err != nil {

    // handle error

  }

  // The server runs in the background while the worker session stays free

  _, err = sandbox.Process.ExecuteSessionCommand(

    ctx, "server", "python3 -m http.server 8000", true, false,

  )

  if err != nil {

    // handle error

  }

  response, err := sandbox.Process.ExecuteSessionCommand(

    ctx, "worker", "curl -s http://localhost:8000", false, false,

  )

  if err != nil {

    // handle error

  }

  fmt.Println(response["stdout"])

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.SessionExecuteRequest;

import io.daytona.sdk.model.SessionExecuteResponse;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox sandbox = daytona.create();

            // Each session is an independent shell inside the same sandbox

            sandbox.getProcess().createSession("server");

            sandbox.getProcess().createSession("worker");

            // The server runs in the background while the worker session stays free

            sandbox.getProcess().executeSessionCommand(

                "server",

                new SessionExecuteRequest("python3 -m http.server 8000", true)

            );

            SessionExecuteResponse response = sandbox.getProcess().executeSessionCommand(

                "worker",

                new SessionExecuteRequest("curl -s http://localhost:8000", false)

            );

            System.out.println(response.getOutput());

        }

    }

}
```

```
# Create independent sessions

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{"sessionId": "server"}'

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{"sessionId": "worker"}'

# Start the server in the background

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/server/exec' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "command": "python3 -m http.server 8000",

  "runAsync": true

}'

# Run a command in the worker session

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/worker/exec' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "command": "curl -s http://localhost:8000"

}'
```

Start a command asynchronously, then poll its status by command ID.

- [Python](https://www.daytona.io/docs/en/scale/#tab-panel-1349)
- [TypeScript](https://www.daytona.io/docs/en/scale/#tab-panel-1350)
- [Ruby](https://www.daytona.io/docs/en/scale/#tab-panel-1351)
- [Go](https://www.daytona.io/docs/en/scale/#tab-panel-1352)
- [Java](https://www.daytona.io/docs/en/scale/#tab-panel-1353)
- [API](https://www.daytona.io/docs/en/scale/#tab-panel-1354)

```
from daytona import Daytona, SessionExecuteRequest

daytona = Daytona()

sandbox = daytona.create()

sandbox.process.create_session("build")

# Async commands return immediately with a command ID

command = sandbox.process.execute_session_command("build", SessionExecuteRequest(

    command="make build",

    run_async=True,

))

# Check on the command later by its ID

status = sandbox.process.get_session_command("build", command.cmd_id)

print(status.exit_code)
```

```
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const sandbox = await daytona.create()

await sandbox.process.createSession('build')

// Async commands return immediately with a command ID

const command = await sandbox.process.executeSessionCommand('build', {

  command: 'make build',

  runAsync: true,

})

// Check on the command later by its ID

const status = await sandbox.process.getSessionCommand('build', command.cmdId!)

console.log(status.exitCode)
```

```
require 'daytona'

daytona = Daytona::Daytona.new

sandbox = daytona.create

sandbox.process.create_session('build')

# Async commands return immediately with a command ID

command = sandbox.process.execute_session_command(

  session_id: 'build',

  req: Daytona::SessionExecuteRequest.new(

    command: 'make build',

    run_async: true

  )

)

# Check on the command later by its ID

status = sandbox.process.get_session_command(

  session_id: 'build',

  command_id: command.cmd_id

)

puts status.exit_code
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

  sandbox, err := client.Create(ctx, types.SnapshotParams{})

  if err != nil {

    // handle error

  }

  err = sandbox.Process.CreateSession(ctx, "build")

  if err != nil {

    // handle error

  }

  // Async commands return immediately with a command ID

  command, err := sandbox.Process.ExecuteSessionCommand(

    ctx, "build", "make build", true, false,

  )

  if err != nil {

    // handle error

  }

  cmdID := command["id"].(string)

  // Check on the command later by its ID

  status, err := sandbox.Process.GetSessionCommand(ctx, "build", cmdID)

  if err != nil {

    // handle error

  }

  fmt.Println(status["exitCode"])

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.Command;

import io.daytona.sdk.model.SessionExecuteRequest;

import io.daytona.sdk.model.SessionExecuteResponse;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox sandbox = daytona.create();

            sandbox.getProcess().createSession("build");

            // Async commands return immediately with a command ID

            SessionExecuteResponse command = sandbox.getProcess().executeSessionCommand(

                "build",

                new SessionExecuteRequest("make build", true)

            );

            // Check on the command later by its ID

            Command status = sandbox.getProcess().getSessionCommand(

                "build",

                command.getCmdId()

            );

            System.out.println(status.getExitCode());

        }

    }

}
```

```
# Create a session

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{"sessionId": "build"}'

# Start a background command (returns command ID immediately)

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/build/exec' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "command": "make build",

  "runAsync": true

}'

# Check command status by ID

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/build/command/{commandId}'
```

## [\#](https://www.daytona.io/docs/en/scale/\#capacity-and-throughput) Capacity and throughput

[Section titled “Capacity and throughput”](https://www.daytona.io/docs/en/scale/#capacity-and-throughput)

Fleet size and creation rate operate within your organization’s limits. Both are [tier-based](https://www.daytona.io/docs/en/limits#tiers) and raised by verification steps or by contacting support.

| **Control** | **What it limits** | **Scope** |
| --- | --- | --- |
| [**Compute pool**](https://www.daytona.io/docs/en/limits#resources) | Total vCPU, RAM, and storage across all running sandboxes | Organization, per region and sandbox class |
| [**Per-sandbox limits**](https://www.daytona.io/docs/en/limits) | Maximum vCPU, RAM, and storage of a single sandbox | Sandbox |
| [**Rate limits**](https://www.daytona.io/docs/en/limits#rate-limits) | Sandbox creation, lifecycle operations, and API requests per minute | Organization |

To scale beyond the shared compute pool, [bring your own compute (BYOC)](https://www.daytona.io/docs/en/bring-your-own-compute) attaches your own runner nodes in custom regions, which have no concurrent resource usage limits.

### [\#](https://www.daytona.io/docs/en/scale/\#reclaiming-capacity) Reclaiming capacity

[Section titled “Reclaiming capacity”](https://www.daytona.io/docs/en/scale/#reclaiming-capacity)

The compute pool is shared by running sandboxes only: stopped, paused, and archived sandboxes free their reserved CPU and memory back to the pool. A fleet can therefore be much larger than the pool, as long as the concurrently running subset fits.

Reclamation runs automatically. [Ephemeral sandboxes](https://www.daytona.io/docs/en/sandboxes#ephemeral-sandboxes) delete themselves on stop, and the [auto-stop, auto-pause, and auto-delete intervals](https://www.daytona.io/docs/en/sandboxes#automated-lifecycle-management) reclaim capacity from idle sandboxes without manual intervention. See [persistence](https://www.daytona.io/docs/en/persistence#retention-and-lifecycle) for details.

### [\#](https://www.daytona.io/docs/en/scale/\#operating-at-scale) Operating at scale

[Section titled “Operating at scale”](https://www.daytona.io/docs/en/scale/#operating-at-scale)

At high creation rates, two practices keep an application within its rate limits.

- Handle [rate limit errors](https://www.daytona.io/docs/en/limits#rate-limit-errors): the SDKs raise **`DaytonaRateLimitError`** when a limit is exceeded, and the returned headers indicate how long to wait before retrying the request.
- Use [webhooks](https://www.daytona.io/docs/en/webhooks) to track sandbox state changes instead of polling. Webhooks deliver state changes as they happen, so no requests are spent checking for status.