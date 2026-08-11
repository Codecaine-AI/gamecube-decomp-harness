---
url: "https://www.daytona.io/docs/en/sandboxes.md"
title: undefined
---

\# Sandboxes

Daytona provides \*\*full composable computers\*\* — \*\*sandboxes\*\* — for AI agents.

Sandboxes are isolated runtime environments you can manage programmatically to run code. Each sandbox runs in isolation, giving it a dedicated kernel, filesystem, network stack, and allocated vCPU, RAM, and disk. Agents and developers get access to a full composable computer where they can install packages, run servers, compile code, and manage processes.

Sandboxes run as \*\*Linux containers\*\* by default. Daytona also provides \[VM sandboxes\](#vm-sandboxes) with a dedicated \*\*Linux VM\*\* or \*\*Windows\*\* operating system, and \[GPU sandboxes\](#gpu-sandboxes) with \*\*NVIDIA GPU\*\* acceleration for model inference, fine-tuning, and CUDA-accelerated compute.

\## Create sandboxes

Create a sandbox.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona

daytona = Daytona()
sandbox = daytona.create()
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create()
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 \_, \_ = client.Create(ctx, nil)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 Sandbox sandbox = daytona.create();
 }
 }
}
\`\`\`

\`\`\`bash
daytona create \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{}'
\`\`\`

\### Snapshots

Create a sandbox from a \[default snapshot\](https://www.daytona.io/docs/en/snapshots.md#default-snapshots).

\| \*\*Snapshot\*\* \| \*\*vCPU\*\* \| \*\*Memory\*\* \| \*\*Storage\*\* \| \*\*GPU\*\* \| \*\*Sandbox Class\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| \*\*\`daytona-small\`\*\* \| 1 \| 1GiB \| 3GiB \| \| Container \|
\| \*\*\`daytona-medium\`\*\* \| 2 \| 4GiB \| 8GiB \| \| Container \|
\| \*\*\`daytona-large\`\*\* \| 4 \| 8GiB \| 10GiB \| \| Container \|
\| \*\*\`daytona-gpu\`\*\* \| 1 \| 1GiB \| 1GiB \| 1 \| GPU \|
\| \*\*\`daytona-vm-small\`\*\* \| 1 \| 1GiB \| 3GiB \| \| Linux VM \|
\| \*\*\`daytona-vm-medium\`\*\* \| 2 \| 4GiB \| 8GiB \| \| Linux VM \|
\| \*\*\`daytona-vm-large\`\*\* \| 4 \| 8GiB \| 10GiB \| \| Linux VM \|
\| \*\*\`windows-small\`\*\* \| 1 \| 4GiB \| 30GiB \| \| Windows \|
\| \*\*\`windows-medium\`\*\* \| 2 \| 8GiB \| 50GiB \| \| Windows \|
\| \*\*\`windows-large\`\*\* \| 4 \| 16GiB \| 50GiB \| \| Windows \|

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Select a \*\*\`snapshot\`\*\*
4\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sandbox = daytona.create(
 CreateSandboxFromSnapshotParams(
 snapshot="daytona-small",
 )
)
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create({
 snapshot: 'daytona-small',
})
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'daytona-small'
 )
)
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 params := types.SnapshotParams{
 Snapshot: "daytona-small",
 }
 \_, \_ = client.Create(ctx, params)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("daytona-small");
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
daytona create --snapshot daytona-small
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "snapshot": "daytona-small"
}'
\`\`\`

\### Resources

Create a sandbox with custom resources.

Sandboxes have \*\*1 vCPU\*\*, \*\*1GB RAM\*\*, and \*\*3GiB disk\*\* by default. Organizations get a maximum sandbox resource limit of \*\*4 vCPUs\*\*, \*\*8GB RAM\*\*, and \*\*10GB disk\*\*.

\| \*\*Resource\*\* \| \*\*Unit\*\* \| \*\*Default\*\* \| \*\*Minimum\*\* \| \*\*Maximum\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\- \|
\| CPU \| vCPU \| \*\*\`1\`\*\* \| \*\*\`1\`\*\* \| \*\*\`4\`\*\* \|
\| Memory \| GiB \| \*\*\`1\`\*\* \| \*\*\`1\`\*\* \| \*\*\`8\`\*\* \|
\| Disk \| GiB \| \*\*\`3\`\*\* \| \*\*\`1\`\*\* \| \*\*\`10\`\*\* \|

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Enter a base \*\*\`image\`\*\*
4\. Set \*\*\`resources\`\*\* (\*\*\`cpu\`\*\*, \*\*\`memory\`\*\*, \*\*\`disk\`\*\*) to the values within your organization's limits
5\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromImageParams, Image, Resources

daytona = Daytona()
sandbox = daytona.create(
 CreateSandboxFromImageParams(
 image="ubuntu:22.04",
 resources=Resources(cpu=2, memory=4, disk=8),
 )
)
\`\`\`

\`\`\`typescript
import { Daytona, Image } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create({
 image: Image.base('ubuntu:22.04'),
 resources: { cpu: 2, memory: 4, disk: 8 },
})
\`\`\`

\`\`\`ruby
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
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 \_, \_ = client.Create(ctx, types.ImageParams{
 Image: "ubuntu:22.04",
 Resources: &types.Resources{
 CPU: 2,
 Memory: 4,
 Disk: 8,
 },
 })
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromImageParams;
import io.daytona.sdk.model.Resources;

final class CreateSandboxResources {
 public static void main(String\[\] args) {
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
\`\`\`

\`\`\`bash
daytona create --cpu 2 --memory 4 --disk 8
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "image": "ubuntu:22.04",
 "cpu": 2,
 "memory": 4,
 "disk": 8
}'
\`\`\`

\### Languages

Create a sandbox with a specific language runtime.

Daytona sandboxes support \*\*Python\*\*, \*\*TypeScript\*\*, and \*\*JavaScript\*\* programming language runtimes for direct code execution inside the sandbox. The \`language\` parameter controls which programming language runtime is used for the sandbox. If omitted, it defaults to \`python\`.

\- \*\*\`python\`\*\*
\- \*\*\`typescript\`\*\*
\- \*\*\`javascript\`\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()

\# Python runtime (default)
sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="python"))
response = sandbox.process.code\_run('print("Hello from Python")')
print(response.result)

\# TypeScript runtime
sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="typescript"))
response = sandbox.process.code\_run('console.log("Hello from TypeScript")')
print(response.result)

\# JavaScript runtime
sandbox = daytona.create(CreateSandboxFromSnapshotParams(language="javascript"))
response = sandbox.process.code\_run('console.log("Hello from JavaScript")')
print(response.result)
\`\`\`

\`\`\`typescript
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
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new

\# Python runtime (default)
sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
 language: Daytona::CodeLanguage::PYTHON
))
response = sandbox.process.code\_run(code: 'print("Hello from Python")')
puts response.result

\# TypeScript runtime
sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
 language: Daytona::CodeLanguage::TYPESCRIPT
))
response = sandbox.process.code\_run(code: 'console.log("Hello from TypeScript")')
puts response.result

\# JavaScript runtime
sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
 language: Daytona::CodeLanguage::JAVASCRIPT
))
response = sandbox.process.code\_run(code: 'console.log("Hello from JavaScript")')
puts response.result
\`\`\`

\`\`\`go
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
 result, err := sandbox.Process.CodeRun(ctx, \`print("Hello from Python")\`)
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
 result, err = sandbox.Process.CodeRun(ctx, \`console.log("Hello from TypeScript")\`)
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
 result, err = sandbox.Process.CodeRun(ctx, \`console.log("Hello from JavaScript")\`)
 if err != nil {
 log.Fatal(err)
 }
 fmt.Println(result.Result)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;
import io.daytona.sdk.model.ExecuteResponse;

Daytona daytona = new Daytona();

// Python runtime (default)
CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
params.setLanguage("python");
Sandbox sandbox = daytona.create(params);
ExecuteResponse response = sandbox.process.codeRun("print(\\"Hello from Python\\")");
System.out.println(response.getResult());

// TypeScript runtime
params = new CreateSandboxFromSnapshotParams();
params.setLanguage("typescript");
sandbox = daytona.create(params);
response = sandbox.process.codeRun("console.log(\\"Hello from TypeScript\\")");
System.out.println(response.getResult());

// JavaScript runtime
params = new CreateSandboxFromSnapshotParams();
params.setLanguage("javascript");
sandbox = daytona.create(params);
response = sandbox.process.codeRun("console.log(\\"Hello from JavaScript\\")");
System.out.println(response.getResult());
\`\`\`

\`\`\`bash
\# Python runtime (default)
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "language": "python"
}'

\# TypeScript runtime
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "language": "typescript"
}'

\# JavaScript runtime
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "language": "javascript"
}'
\`\`\`

\### Regions

Create a sandbox in a specific \[region\](https://www.daytona.io/docs/en/regions.md).

\| \*\*Region\*\* \| \*\*Target\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\- \|
\| United States \| \*\*\`us\`\*\* \|
\| Europe \| \*\*\`eu\`\*\* \|

\`\`\`python
from daytona import Daytona, DaytonaConfig

daytona = Daytona(DaytonaConfig(target="us"))
sandbox = daytona.create()
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona({ target: 'us' })
const sandbox = await daytona.create()
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new(Daytona::Config.new(target: 'us'))
sandbox = daytona.create
\`\`\`

\`\`\`go
package main

import (
 "context"

 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClientWithConfig(&types.DaytonaConfig{
 Target: "us",
 })
 ctx := context.Background()
 \_, \_ = client.Create(ctx, nil)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.DaytonaConfig;
import io.daytona.sdk.Sandbox;

public class App {
 public static void main(String\[\] args) {
 DaytonaConfig config = new DaytonaConfig.Builder()
 .apiKey(System.getenv("DAYTONA\_API\_KEY"))
 .target("us")
 .build();

 try (Daytona daytona = new Daytona(config)) {
 Sandbox sandbox = daytona.create();
 }
 }
}
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "target": "us"
}'
\`\`\`

\## VM sandboxes

Daytona provides \*\*VM sandboxes\*\* for workloads that require a full virtual machine with a dedicated \*\*Linux VM\*\* or \*\*Windows\*\* operating system.

VM sandboxes are distinct from container sandboxes and support VM-only capabilities:

\- \[Fork sandboxes\](#fork-sandboxes)
\- \[Pause/resume sandboxes\](#pause--resume-sandboxes)
\- \[Create snapshot from sandbox\](#create-snapshot-from-sandbox)

:::note\[Limitations\]
VM sandboxes can currently only be created from existing VM snapshots. Dynamic builds through the declarative builder are supported for container sandboxes only.
:::

Create a Linux VM sandbox from a default snapshot.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Select a Linux VM snapshot:

 \- \*\*\`daytona-vm-small\`\*\*
 \- \*\*\`daytona-vm-medium\`\*\*
 \- \*\*\`daytona-vm-large\`\*\*

4\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="daytona-vm-small"))
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create({ snapshot: 'daytona-vm-small' })
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'daytona-vm-small'
 )
)
\`\`\`

\`\`\`go
package main

import (
 "context"

 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 params := types.SnapshotParams{
 Snapshot: "daytona-vm-small",
 }
 \_, \_ = client.Create(ctx, params)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("daytona-vm-small");
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
daytona create --snapshot daytona-vm-small
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "snapshot": "daytona-vm-small"
}'
\`\`\`

Create a Linux VM sandbox from a custom snapshot.

1\. Create a snapshot from a base \*\*\`image\`\*\*
2\. Set sandbox class to \*\*\`LINUX\_VM\`\*\*
3\. Create a Linux VM sandbox from the snapshot

\`\`\`python
from daytona import (
 Daytona,
 CreateSnapshotParams,
 CreateSandboxFromSnapshotParams,
 SandboxClass,
)

daytona = Daytona()

\# 1\. Create a VM snapshot (linux-vm class)
daytona.snapshot.create(
 CreateSnapshotParams(
 name="my-vm-snapshot",
 image="ubuntu:22.04",
 sandbox\_class=SandboxClass.LINUX\_VM,
 )
)

\# 2\. Create a VM sandbox from the snapshot
sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="my-vm-snapshot"))
\`\`\`

\`\`\`typescript
import { Daytona, SandboxClass } from "@daytona/sdk";

const daytona = new Daytona();

// 1\. Create a VM snapshot (linux-vm class)
await daytona.snapshot.create({
 name: "my-vm-snapshot",
 image: "ubuntu:22.04",
 sandboxClass: SandboxClass.LINUX\_VM,
});

// 2\. Create a VM sandbox from the snapshot
const sandbox = await daytona.create({ snapshot: "my-vm-snapshot" });
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new

\# 1\. Create a VM snapshot (linux-vm class)
daytona.snapshot.create(
 Daytona::CreateSnapshotParams.new(
 name: 'my-vm-snapshot',
 image: 'ubuntu:22.04',
 sandbox\_class: DaytonaApiClient::SandboxClass::LINUX\_VM
 )
)

\# 2\. Create a VM sandbox from the snapshot
sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'my-vm-snapshot'))
\`\`\`

\`\`\`go
package main

import (
 "context"

 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()

 // 1\. Create a VM snapshot (linux-vm class)
 sandboxClass := types.SandboxClassLinuxVM
 \_, logCh, \_ := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{
 Name: "my-vm-snapshot",
 Image: "ubuntu:22.04",
 SandboxClass: &sandboxClass,
 })
 for range logCh {
 }

 // 2\. Create a VM sandbox from the snapshot
 \_, \_ = client.Create(ctx, types.SnapshotParams{
 Snapshot: "my-vm-snapshot",
 })
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.api.client.model.SandboxClass;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 // 1\. Create a VM snapshot (linux-vm class)
 daytona.snapshot().create("my-vm-snapshot", "ubuntu:22.04", SandboxClass.LINUX\_VM);

 // 2\. Create a VM sandbox from the snapshot
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("my-vm-snapshot");
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
\# 1\. Create a VM snapshot (linux-vm class)
daytona snapshot create my-vm-snapshot --image ubuntu:22.04 --sandbox-class linux-vm

\# 2\. Create a VM sandbox from the snapshot
daytona create --snapshot my-vm-snapshot
\`\`\`

\`\`\`bash
\# 1\. Create a VM snapshot (linux-vm class)
curl https://app.daytona.io/api/snapshots \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-vm-snapshot",
 "imageName": "ubuntu:22.04",
 "sandboxClass": "linux-vm"
 }'

\# 2\. Create a VM sandbox from the snapshot
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "snapshot": "my-vm-snapshot"
 }'
\`\`\`

Create a Windows sandbox.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Select a Windows snapshot:

 \- \*\*\`windows-small\`\*\*
 \- \*\*\`windows-medium\`\*\*
 \- \*\*\`windows-large\`\*\*

4\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sandbox = daytona.create(
 CreateSandboxFromSnapshotParams(
 snapshot="windows-small",
 )
)
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create({
 snapshot: 'windows-small',
})
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'windows-small'
 )
)
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 params := types.SnapshotParams{
 Snapshot: "windows-small",
 }
 \_, \_ = client.Create(ctx, params)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("windows-small");
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
daytona create --snapshot windows-small
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "snapshot": "windows-small"
}'
\`\`\`

\## GPU sandboxes

Daytona provides \*\*GPU sandboxes\*\* for workloads that require NVIDIA GPU acceleration, such as model inference, fine-tuning, and CUDA-accelerated compute. GPU sandboxes are ephemeral and support up to \*\*16 vCPUs\*\*, \*\*192GB RAM\*\*, and \*\*512GB disk\*\*. Supported GPU types:

\- \*\*NVIDIA H100\*\*
\- \*\*NVIDIA H200\*\*
\- \*\*NVIDIA RTX Pro 6000\*\*
\- \*\*NVIDIA RTX 4090\*\*
\- \*\*NVIDIA RTX 5090\*\*

\> Due to possible events of temporary GPU scarcity, the target/region requested for GPU sandboxes is ignored by default. If you need access to a specific geographical location, contact us at support@daytona.io.

Create a GPU sandbox from a default snapshot.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Select a \*\*\`daytona-gpu\`\*\* snapshot
4\. Select \*\*\`ephemeral\`\*\* or set \*\*\`auto-delete interval\`\*\* to \*\*\`0\`\*\*
5\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sandbox = daytona.create(
 CreateSandboxFromSnapshotParams(
 snapshot="daytona-gpu",
 auto\_delete\_interval=0,
 ),
)
\`\`\`

\`\`\`typescript
import { Daytona } from "@daytona/sdk";

const daytona = new Daytona()
const sandbox = await daytona.create({
 snapshot: "daytona-gpu",
 ephemeral: true,
});
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'daytona-gpu',
 ephemeral: true
 )
)
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 params := types.SnapshotParams{
 Snapshot: "daytona-gpu",
 SandboxBaseParams: types.SandboxBaseParams{
 Ephemeral: true,
 },
 }
 \_, \_ = client.Create(ctx, params)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("daytona-gpu");
 params.setAutoDeleteInterval(0);
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
daytona create --snapshot daytona-gpu --auto-delete 0
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "snapshot": "daytona-gpu",
 "autoDeleteInterval": 0
}'
\`\`\`

Create a GPU sandbox with custom GPU resources: units and types.

1\. Create a sandbox from an \*\*\`image\`\*\*
2\. Set the \*\*\`auto-delete interval\`\*\* to \*\*\`0\`\*\* (ephemeral)
3\. Set the \*\*\`GPU\`\*\* to the number of GPU units
4\. Specify the \*\*\`GPU type\`\*\*(s):

 The GPU type field accepts a single value or an ordered list of preferred types.

 Daytona uses the first available type in the order you provide. This lets you fall back from a preferred GPU to an alternative when the first choice is not available.

 \- \*\*\`H100\`\*\*
 \- \*\*\`H200\`\*\*
 \- \*\*\`RTX-PRO-6000\`\*\*
 \- \*\*\`RTX-4090\`\*\*
 \- \*\*\`RTX-5090\`\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromImageParams, Image, Resources, GpuType

daytona = Daytona()
sandbox = daytona.create(
 CreateSandboxFromImageParams(
 image=Image.debian\_slim("3.12"),
 auto\_delete\_interval=0,
 resources=Resources(
 gpu=1,
 gpu\_type=\[GpuType.H100, GpuType.RTX\_PRO\_6000\],
 ),
 )
)
\`\`\`

\`\`\`typescript
import { Daytona, GpuType, Image } from "@daytona/sdk";

const daytona = new Daytona()
const sandbox = await daytona.create({
 image: Image.debianSlim("3.12"),
 autoDeleteInterval: 0,
 resources: {
 gpu: 1,
 gpuType: \[GpuType.H100, GpuType.RTX\_PRO\_6000\],
 },
});
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(
 Daytona::CreateSandboxFromImageParams.new(
 image: Daytona::Image.debian\_slim('3.12'),
 auto\_delete\_interval: 0,
 resources: Daytona::Resources.new(
 gpu: 1,
 gpu\_type: \[Daytona::GpuType::H100, Daytona::GpuType::RTX\_PRO\_6000\]
 )
 )
)
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()
 autoDelete := 0
 \_, \_ = client.Create(ctx, types.ImageParams{
 Image: "python:3.12",
 SandboxBaseParams: types.SandboxBaseParams{
 AutoDeleteInterval: &autoDelete,
 },
 Resources: &types.Resources{
 GPU: 1,
 GpuType: \[\]types.GpuType{types.GpuTypeH100, types.GpuTypeRtxPro6000},
 },
 })
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromImageParams;
import io.daytona.sdk.model.Resources;
import io.daytona.api.client.model.GpuType;
import java.util.List;

final class CreateGpuSandbox {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();
 params.setImage("python:3.12");
 params.setAutoDeleteInterval(0);
 Resources resources = new Resources();
 resources.setGpu(1);
 resources.setGpuType(List.of(GpuType.H100, GpuType.RTX\_PRO\_6000));
 params.setResources(resources);
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "image": "python:3.12",
 "autoDeleteInterval": 0,
 "gpu": 1,
 "gpuType": \["H100", "RTX-PRO-6000"\]
}'
\`\`\`

\## Ephemeral sandboxes

Create an ephemeral sandbox. Ephemeral sandboxes are automatically deleted when stopped.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Set \*\*Ephemeral\*\* to \*\*\`True\`\*\* or set the \[auto-delete interval\](#auto-delete-interval) to \*\*\`0\`\*\*
4\. Click \*\*Create\*\*

\`\`\`python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
params = CreateSandboxFromSnapshotParams(
 ephemeral=True,
 auto\_stop\_interval=5,
)
sandbox = daytona.create(params)
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()
const sandbox = await daytona.create({
 ephemeral: true,
 autoStopInterval: 5,
})
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new
params = Daytona::CreateSandboxFromSnapshotParams.new(
 ephemeral: true,
 auto\_stop\_interval: 5
)
sandbox = daytona.create(params)
\`\`\`

\`\`\`go
package main

import (
 "context"
 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()

 autoStopInterval := 5
 params := types.SnapshotParams{
 SandboxBaseParams: types.SandboxBaseParams{
 Language: types.CodeLanguagePython,
 Ephemeral: true,
 AutoStopInterval: &autoStopInterval,
 },
 }
 \_, \_ = client.Create(ctx, params)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setAutoDeleteInterval(0);
 params.setAutoStopInterval(5);
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
daytona create --auto-delete 0 --auto-stop 5
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "autoDeleteInterval": 0,
 "autoStopInterval": 5
}'
\`\`\`

\## Linked sandboxes

Create a linked sandbox. Linked sandboxes attach ephemeral child sandboxes to a parent. Daytona schedules each child on the same runner as the parent and joins them into a shared link network so the group can communicate over local connections.

\- \*\*Lifecycle\*\*

 Linked sandboxes are always ephemeral and cannot be persisted or resumed after stop. The \[auto-delete interval\](#auto-delete-interval) must be exactly \`0\` on create; this is enforced, not a default. The \[auto-stop interval\](#auto-stop-interval) sets the idle period in minutes after which the child sandbox stops. Once stopped, linked children are auto-deleted. Deleting the parent deletes all of its linked children (cascade). One parent may have many linked children (1:N).

\- \*\*Networking\*\*

 Linked sandboxes share an internal link network. Connections work in both directions: the parent can reach each child and each child can reach the parent. Every sandbox on the link network is registered under its sandbox name and ID as DNS aliases, so either works as the host. For example: \`telnet LINKED\_SANDBOX\_ID 5555\` from the parent reaches port \`5555\` on the linked child sandbox.

1\. Create a parent sandbox
2\. Create one or more child sandboxes that reference the parent's sandbox ID.

This records the relationship on the child sandbox as the linked sandbox ID. Omitting the linked sandbox parameter yields an unlinked sandbox.

\`\`\`python
from daytona import CreateSandboxFromSnapshotParams, Daytona

daytona = Daytona()

parent = daytona.create()

child = daytona.create(
 CreateSandboxFromSnapshotParams(
 linked\_sandbox=parent.id,
 ephemeral=True,
 )
)

\# The link network registers each sandbox under its name as a DNS alias
response = child.process.exec(f"curl http://{parent.name}:3000/")
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

const parent = await daytona.create()

const child = await daytona.create({
 linkedSandbox: parent.id,
 ephemeral: true,
})

// The link network registers each sandbox under its name as a DNS alias
const response = await child.process.executeCommand(
 \`curl http://${parent.name}:3000/\`
)
\`\`\`

\`\`\`ruby
require 'daytona'

daytona = Daytona::Daytona.new

parent = daytona.create

child = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 linked\_sandbox: parent.id,
 ephemeral: true
 )
)

\# The link network registers each sandbox under its name and ID as DNS aliases.
\# The Ruby SDK does not expose the sandbox name, so address the parent by ID.
response = child.process.exec(command: "curl http://#{parent.id}:3000/")
\`\`\`

\`\`\`go
package main

import (
 "context"
 "fmt"

 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 client, \_ := daytona.NewClient()
 ctx := context.Background()

 parent, \_ := client.Create(ctx, types.SnapshotParams{})

 child, \_ := client.Create(ctx, types.SnapshotParams{
 SandboxBaseParams: types.SandboxBaseParams{
 LinkedSandbox: parent.ID,
 Ephemeral: true,
 },
 })

 // The link network registers each sandbox under its name as a DNS alias
 response, \_ := child.Process.ExecuteCommand(ctx, fmt.Sprintf("curl http://%s:3000/", parent.Name))
 fmt.Println(response.Result)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;
import io.daytona.sdk.model.ExecuteResponse;

public class App {
 public static void main(String\[\] args) {
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
\`\`\`

\`\`\`bash
\# Create parent sandbox
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{}'

\# Create linked child sandbox (replace PARENT\_SANDBOX\_ID with the id from the first response)
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "linkedSandbox": "PARENT\_SANDBOX\_ID",
 "autoDeleteInterval": 0
}'
\`\`\`

\## Start sandboxes

Start a sandbox.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the start icon (\*\*▶\*\*) next to the sandbox you want to start

\`\`\`python
sandbox.start()
\`\`\`

\`\`\`typescript
await sandbox.start()
\`\`\`

\`\`\`ruby
sandbox.start
\`\`\`

\`\`\`go
sandbox.Start(ctx)
\`\`\`

\`\`\`java
sandbox.start();
\`\`\`

\`\`\`bash
daytona start \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/start' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Get sandbox

Get a sandbox by ID or name.

\`\`\`python
sandbox = daytona.get("my-sandbox-id-or-name")
\`\`\`

\`\`\`typescript
const sandbox = await daytona.get('my-sandbox-id-or-name')
\`\`\`

\`\`\`ruby
sandbox = daytona.get('my-sandbox-id-or-name')
\`\`\`

\`\`\`go
sandbox, err := client.Get(ctx, "my-sandbox-id-or-name")
\`\`\`

\`\`\`java
Sandbox sandbox = daytona.get("my-sandbox-id-or-name");
\`\`\`

\`\`\`bash
daytona info \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## List sandboxes

List sandboxes.

\`\`\`python
for sandbox in daytona.list():
 print(sandbox.id)
\`\`\`

\`\`\`typescript
for await (const sandbox of daytona.list()) {
 console.log(sandbox.id)
}
\`\`\`

\`\`\`ruby
daytona.list.each { \|sandbox\| puts sandbox.id }
\`\`\`

\`\`\`go
iter := client.List(ctx, nil)
defer iter.Close()
for iter.Next() {
 sandbox := iter.Value()
 fmt.Println(sandbox.ID)
}
if err := iter.Err(); err != nil {
 log.Fatal(err)
}
\`\`\`

\`\`\`java
Iterator\> iter = daytona.list();
while (iter.hasNext()) {
 Map sandbox = iter.next();
 System.out.println(sandbox.get("id"));
}
\`\`\`

\`\`\`bash
daytona list \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Stop sandboxes

Stop a sandbox. The sandbox moves to the \*\*stopped\*\* state when shutdown completes. While a stop is in progress, the sandbox is in the \*\*stopping\*\* state and does not accept new requests.

Stopping terminates the running container. The filesystem is preserved, but memory state is not. Container sandboxes do not support pause; stop is the way to shut down a container sandbox when it is not in use.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the stop icon (\*\*⏹\*\*) next to the sandbox you want to stop

\`\`\`python
sandbox.stop()
\`\`\`

\`\`\`typescript
await sandbox.stop()
\`\`\`

\`\`\`ruby
sandbox.stop
\`\`\`

\`\`\`go
sandbox.Stop(ctx)
\`\`\`

\`\`\`java
sandbox.stop();
\`\`\`

\`\`\`bash
daytona stop \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

Stopping shuts down the virtual machine while preserving the filesystem. Memory state is cleared. To preserve running process state without consuming CPU, use \[\*\*pause / resume\*\*\](#pause--resume-sandboxes).

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the stop icon (\*\*⏹\*\*) next to the sandbox you want to stop

\`\`\`python
sandbox.stop()
\`\`\`

\`\`\`typescript
await sandbox.stop()
\`\`\`

\`\`\`ruby
sandbox.stop
\`\`\`

\`\`\`go
sandbox.Stop(ctx)
\`\`\`

\`\`\`java
sandbox.stop();
\`\`\`

\`\`\`bash
daytona stop \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

Stopping shuts down the virtual machine while preserving the filesystem. Memory state is cleared. To preserve running process state without consuming CPU, use \[\*\*pause / resume\*\*\](#pause--resume-sandboxes).

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the stop icon (\*\*⏹\*\*) next to the sandbox you want to stop

\`\`\`python
sandbox.stop()
\`\`\`

\`\`\`typescript
await sandbox.stop()
\`\`\`

\`\`\`ruby
sandbox.stop
\`\`\`

\`\`\`go
sandbox.Stop(ctx)
\`\`\`

\`\`\`java
sandbox.stop();
\`\`\`

\`\`\`bash
daytona stop \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/stop' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

:::note\[Force stop\]
If you need a faster shutdown, use force stop (\`force=true\` / \`--force\`) to terminate the sandbox immediately. Force stop is ungraceful and should be used when quick termination is more important than process cleanup. Avoid force stop for normal shutdowns where the process should flush buffers, write final state, or run cleanup.
:::

\## Archive sandboxes

Archive a sandbox.

Archive moves a stopped sandbox's filesystem to object storage and frees disk quota.

1\. Ensure the sandbox is \*\*stopped\*\*
2\. \*\*Archive\*\* the sandbox
3\. Wait for the sandbox to reach the \*\*archived\*\* state
4\. \*\*Start\*\* the sandbox again when you need to use it

\`\`\`python
sandbox.archive()
\`\`\`

\`\`\`typescript
await sandbox.archive()
\`\`\`

\`\`\`ruby
sandbox.archive
\`\`\`

\`\`\`go
sandbox.Archive(ctx)
\`\`\`

\`\`\`bash
daytona archive \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/archive' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

Archive is not supported for Linux VM sandboxes. Stopping a Linux VM sandbox already offloads filesystem state and releases disk quota, so a separate archive step is not needed.

Archive is not supported for Windows sandboxes. Stopping a Windows sandbox already offloads filesystem state and releases disk quota, so a separate archive step is not needed.

\## Pause / resume sandboxes

Pause and resume a sandbox.

Pause is not supported for container sandboxes. The filesystem can be preserved on stop, but memory state is not. Use \[\*\*stop\*\*\](#stop-sandboxes) to shut down a container sandbox when it is not in use.

The filesystem and memory state are preserved, and CPU is no longer consumed.

1\. Ensure the Linux VM sandbox is \*\*started\*\*
2\. \*\*Pause\*\* the Linux VM sandbox
3\. Wait for the Linux VM sandbox to reach the \*\*paused\*\* state
4\. \*\*Resume\*\* (start) the Linux VM sandbox again when you need to resume it

\`\`\`python
sandbox.pause()
\`\`\`

\`\`\`typescript
await sandbox.pause()
\`\`\`

\`\`\`ruby
sandbox.pause
\`\`\`

\`\`\`go
sandbox.Pause(ctx)
\`\`\`

\`\`\`java
sandbox.pause();
\`\`\`

\`\`\`bash
daytona pause \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/pause' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

The filesystem and memory state are preserved, and CPU is no longer consumed.

1\. Ensure the Windows sandbox is \*\*started\*\*
2\. \*\*Pause\*\* the Windows sandbox
3\. Wait for the Windows sandbox to reach the \*\*paused\*\* state
4\. \*\*Resume\*\* (start) the Windows sandbox again when you need to resume it

\`\`\`python
sandbox.pause()
\`\`\`

\`\`\`typescript
await sandbox.pause()
\`\`\`

\`\`\`ruby
sandbox.pause
\`\`\`

\`\`\`go
sandbox.Pause(ctx)
\`\`\`

\`\`\`java
sandbox.pause();
\`\`\`

\`\`\`bash
daytona pause \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/pause' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Recover sandboxes

Recover a sandbox.

1\. Ensure the sandbox is in \*\*error\*\* state
2\. Check that the sandbox is \*\*recoverable\*\*
3\. Resolve any underlying issue that requires user intervention
4\. \*\*Recover\*\* the sandbox and wait for it to be ready

\`\`\`python
\# Check if the sandbox is recoverable
if sandbox.recoverable:
 sandbox.recover()
\`\`\`

\`\`\`python
sandbox.recover()
\`\`\`

\`\`\`typescript
// Check if the sandbox is recoverable
if (sandbox.recoverable) {
 await sandbox.recover()
}
\`\`\`

\`\`\`typescript
await sandbox.recover()
\`\`\`

\`\`\`ruby
\# Check if the sandbox is in an error state before recovering
if sandbox.state == 'error'
 sandbox.recover
end
\`\`\`

\`\`\`ruby
sandbox.recover
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/recover' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/recover' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Resize sandboxes

Resizing updates the sandbox resource allocation (\`cpu\`, \`memory\`, and \`disk\`) for that sandbox. CPU and memory control compute capacity for running workloads, while disk controls persistent filesystem capacity.

On a running sandbox, you can increase CPU and memory without interruption. To decrease CPU or memory, or to increase disk capacity, stop the sandbox first. Disk size can only be increased and cannot be decreased.

1\. Choose the new \*\*CPU\*\*, \*\*memory\*\*, and \*\*disk\*\* values within your organization's limits
2\. Ensure the sandbox is \*\*stopped\*\* if you need to decrease CPU or memory, or increase disk
3\. \*\*Resize\*\* the sandbox with the new resource values
4\. \*\*Start\*\* the sandbox

\`\`\`python
\# Resize a started sandbox (CPU and memory can be increased)
sandbox.resize(Resources(cpu=2, memory=4))

\# Resize a stopped sandbox (CPU and memory can change, disk can only increase)
sandbox.stop()
sandbox.resize(Resources(cpu=4, memory=8, disk=20))
sandbox.start()
\`\`\`

\`\`\`typescript
// Resize a started sandbox (CPU and memory can be increased)
await sandbox.resize({ cpu: 2, memory: 4 })

// Resize a stopped sandbox (CPU and memory can change, disk can only increase)
await sandbox.stop()
await sandbox.resize({ cpu: 4, memory: 8, disk: 20 })
await sandbox.start()
\`\`\`

\`\`\`ruby
\# Resize a started sandbox (CPU and memory can be increased)
sandbox.resize(Daytona::Resources.new(cpu: 2, memory: 4))

\# Resize a stopped sandbox (CPU and memory can change, disk can only increase)
sandbox.stop
sandbox.resize(Daytona::Resources.new(cpu: 4, memory: 8, disk: 20))
sandbox.start
\`\`\`

\`\`\`go
// Resize a started sandbox (CPU and memory can be increased)
err := sandbox.Resize(ctx, &types.Resources{CPU: 2, Memory: 4})

// Resize a stopped sandbox (CPU and memory can change, disk can only increase)
err = sandbox.Stop(ctx)
err = sandbox.Resize(ctx, &types.Resources{CPU: 4, Memory: 8, Disk: 20})
err = sandbox.Start(ctx)
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/resize' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "cpu": 2,
 "memory": 4,
 "disk": 20
}'
\`\`\`

To verify CPU and memory limits inside the sandbox after resizing, read \`cgroup\` values directly. Tools such as \`nproc\`, \`free\`, \`top\`, \`htop\`, \`/proc/cpuinfo\`, and \`/proc/meminfo\` read host-level values and do not reflect sandbox resource limits.

\`\`\`bash
cat /sys/fs/cgroup/cpu.max # "" (cores = quota / period)
cat /sys/fs/cgroup/memory.max # bytes
df -h / # disk
\`\`\`

\## Label sandboxes

Set sandbox labels.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Click \*\*Add Labels\*\*
4\. Enter the labels in key-value pairs

\`\`\`python
sandbox.set\_labels({
 "team": "platform",
 "env": "staging",
})
\`\`\`

\`\`\`typescript
await sandbox.setLabels({
 team: 'platform',
 env: 'staging',
})
\`\`\`

\`\`\`ruby
sandbox.labels = {
 team: 'platform',
 env: 'staging'
}
\`\`\`

\`\`\`go
err := sandbox.SetLabels(ctx, map\[string\]string{
 "team": "platform",
 "env": "staging",
})
\`\`\`

\`\`\`java
Map labels = new HashMap<>();
labels.put("team", "platform");
labels.put("env", "staging");
sandbox.setLabels(labels);
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/labels' \
 --request PUT \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "labels": {
 "team": "platform",
 "env": "staging"
 }
}'
\`\`\`

\## Delete sandboxes

Delete a sandbox.

By default \`delete\` is fire-and-forget: it returns as soon as the API accepts the deletion request, without waiting for the sandbox to be destroyed. Pass the \`wait\` flag to block until the sandbox reaches the destroyed state.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the \*\*Delete\*\* button next to the sandbox you want to delete.

\`\`\`python
sandbox.delete()

\# Block until the sandbox is destroyed
sandbox.delete(timeout=60, wait=True)
\`\`\`

\`\`\`typescript
await sandbox.delete()

// Block until the sandbox is destroyed
await sandbox.delete(60, true)
\`\`\`

\`\`\`ruby
sandbox.delete

\# Block until the sandbox is destroyed
sandbox.delete(60, wait: true)
\`\`\`

\`\`\`go
err = sandbox.Delete(ctx)

// Block until the sandbox is destroyed
err = sandbox.DeleteAndWait(ctx, 60\*time.Second)
\`\`\`

\`\`\`java
sandbox.delete();

// Block until the sandbox is destroyed
sandbox.delete(60, true);
\`\`\`

\`\`\`bash
daytona delete \[SANDBOX\_ID\] \| \[SANDBOX\_NAME\] \[flags\]
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}' \
 --request DELETE \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Create snapshot from sandbox

Create a snapshot from a running or stopped sandbox.

Container sandboxes capture filesystem state only (\*\*cold snapshot\*\*):

\| \*\*Snapshot type\*\* \| \*\*Include memory\*\* \| \*\*Snapshot contents\*\* \| \*\*Required sandbox state\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| Cold \| \*\*\`false\`\*\* (default) \| Filesystem only \| Stopped \|



\`\`\`python
sandbox.\_experimental\_create\_snapshot("my-snapshot")
\`\`\`

\`\`\`typescript
await sandbox.\_experimental\_createSnapshot('my-snapshot')
\`\`\`

\`\`\`ruby
sandbox.experimental\_create\_snapshot(name: 'my-snapshot')
\`\`\`

\`\`\`go
err := sandbox.ExperimentalCreateSnapshot(ctx, "my-snapshot")
if err != nil {
 return err
}
\`\`\`

\`\`\`java
sandbox.experimentalCreateSnapshot("my-snapshot");
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-snapshot",
 "includeMemory": false
}'
\`\`\`

Linux VM sandboxes capture filesystem state only (\*\*cold snapshot\*\*) or filesystem and memory state (\*\*hot snapshot\*\*) through the \`includeMemory\` parameter:

\| \*\*Snapshot type\*\* \| \*\*Include memory\*\* \| \*\*Snapshot contents\*\* \| \*\*Required sandbox state\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| Cold \| \*\*\`false\`\*\* (default) \| Filesystem only \| Stopped \|
\| Hot \| \*\*\`true\`\*\* \| Filesystem and memory \| Started \|



\`\`\`python
\# Cold snapshot (filesystem only, sandbox stopped)
sandbox.\_experimental\_create\_snapshot("my-snapshot")

\# Hot snapshot (filesystem and memory, sandbox running)
sandbox.\_experimental\_create\_snapshot("my-vm-snapshot", include\_memory=True)
\`\`\`

\`\`\`typescript
// Cold snapshot (filesystem only, sandbox stopped)
await sandbox.\_experimental\_createSnapshot('my-snapshot')

// Hot snapshot (filesystem and memory, sandbox running)
await sandbox.\_experimental\_createSnapshot('my-vm-snapshot', 60, true)
\`\`\`

\`\`\`ruby
\# Cold snapshot (filesystem only, sandbox stopped)
sandbox.experimental\_create\_snapshot(name: 'my-snapshot')

\# Hot snapshot (filesystem and memory, sandbox running)
sandbox.experimental\_create\_snapshot(name: 'my-vm-snapshot', include\_memory: true)
\`\`\`

\`\`\`go
// Cold snapshot (filesystem only, sandbox stopped)
err := sandbox.ExperimentalCreateSnapshot(ctx, "my-snapshot")
if err != nil {
 return err
}

// Hot snapshot (filesystem and memory, sandbox running)
err = sandbox.ExperimentalCreateSnapshotWithMemory(ctx, "my-vm-snapshot", 60\*time.Second)
if err != nil {
 return err
}
\`\`\`

\`\`\`java
// Cold snapshot (filesystem only, sandbox stopped)
sandbox.experimentalCreateSnapshot("my-snapshot");

// Hot snapshot (filesystem and memory, sandbox running)
sandbox.experimentalCreateSnapshot("my-vm-snapshot", 60, true);
\`\`\`

\`\`\`bash
\# Cold snapshot (filesystem only, sandbox stopped)
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-snapshot",
 "includeMemory": false
}'

\# Hot snapshot (filesystem and memory, sandbox running)
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-vm-snapshot",
 "includeMemory": true
}'
\`\`\`

Windows sandboxes capture filesystem state only (\*\*cold snapshot\*\*) or filesystem and memory state (\*\*hot snapshot\*\*) through the \`includeMemory\` parameter:

\| \*\*Snapshot type\*\* \| \*\*Include memory\*\* \| \*\*Snapshot contents\*\* \| \*\*Required sandbox state\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| Cold \| \*\*\`false\`\*\* (default) \| Filesystem only \| Stopped \|
\| Hot \| \*\*\`true\`\*\* \| Filesystem and memory \| Started \|



\`\`\`python
\# Cold snapshot (filesystem only, sandbox stopped)
sandbox.\_experimental\_create\_snapshot("my-snapshot")

\# Hot snapshot (filesystem and memory, sandbox running)
sandbox.\_experimental\_create\_snapshot("my-vm-snapshot", include\_memory=True)
\`\`\`

\`\`\`typescript
// Cold snapshot (filesystem only, sandbox stopped)
await sandbox.\_experimental\_createSnapshot('my-snapshot')

// Hot snapshot (filesystem and memory, sandbox running)
await sandbox.\_experimental\_createSnapshot('my-vm-snapshot', 60, true)
\`\`\`

\`\`\`ruby
\# Cold snapshot (filesystem only, sandbox stopped)
sandbox.experimental\_create\_snapshot(name: 'my-snapshot')

\# Hot snapshot (filesystem and memory, sandbox running)
sandbox.experimental\_create\_snapshot(name: 'my-vm-snapshot', include\_memory: true)
\`\`\`

\`\`\`go
// Cold snapshot (filesystem only, sandbox stopped)
err := sandbox.ExperimentalCreateSnapshot(ctx, "my-snapshot")
if err != nil {
 return err
}

// Hot snapshot (filesystem and memory, sandbox running)
err = sandbox.ExperimentalCreateSnapshotWithMemory(ctx, "my-vm-snapshot", 60\*time.Second)
if err != nil {
 return err
}
\`\`\`

\`\`\`java
// Cold snapshot (filesystem only, sandbox stopped)
sandbox.experimentalCreateSnapshot("my-snapshot");

// Hot snapshot (filesystem and memory, sandbox running)
sandbox.experimentalCreateSnapshot("my-vm-snapshot", 60, true);
\`\`\`

\`\`\`bash
\# Cold snapshot (filesystem only, sandbox stopped)
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-snapshot",
 "includeMemory": false
}'

\# Hot snapshot (filesystem and memory, sandbox running)
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/snapshot' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-vm-snapshot",
 "includeMemory": true
}'
\`\`\`

\## Fork sandboxes

Fork a sandbox.

Forking is not supported for container sandboxes. Use \[\*\*create snapshot from sandbox\*\*\](#create-snapshot-from-sandbox) to capture filesystem state, then create a new sandbox from that snapshot.

Forking creates a duplicate of a Linux VM sandbox's filesystem and memory state in a new sandbox. The forked sandbox is fully independent: it can be started, stopped, and deleted without affecting the original.

Daytona tracks the parent-child relationship in a fork tree, so you can trace a fork's lineage back to the sandbox it was created from. You can fork a fork to build branches. The parent sandbox cannot be deleted while it has active fork children.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the three-dot menu (\*\*⋮\*\*) next to the started Linux VM sandbox you want to fork
3\. Select \*\*Fork\*\*

\`\`\`python
\# Fork sandbox through the Sandbox instance
forked = sandbox.fork(name="my-forked-sandbox")
\`\`\`

\`\`\`typescript
// Fork sandbox through the Sandbox instance
const forkedSandbox = await sandbox.fork({ name: "my-forked-sandbox" });

// Or use the Daytona helper method
const forkedSandbox = await daytona.fork(sandbox, { name: "my-forked-sandbox" });
\`\`\`

\`\`\`ruby
\# Fork sandbox through the Sandbox instance
forkedSandbox = sandbox.fork(name: "my-forked-sandbox")
\`\`\`

\`\`\`go
// Fork sandbox through the Sandbox instance
name := "my-forked-sandbox"
forkedSandbox, err := sandbox.Fork(ctx, &name)
if err != nil {
 return err
}
\`\`\`

\`\`\`java
// Fork sandbox through the Sandbox instance
Sandbox forkedSandbox = sandbox.fork("my-forked-sandbox", 60);
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/fork' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-forked-sandbox"
}'
\`\`\`

Query fork relationships:

\`\`\`bash
\# List direct fork children of a sandbox
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/forks' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'

\# Get the parent sandbox of a fork
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/parent' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'

\# Get the full ancestor chain (parent, grandparent, and so on)
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ancestors' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

Forking creates a duplicate of a Windows sandbox's filesystem and memory state in a new sandbox. The forked sandbox is fully independent: it can be started, stopped, and deleted without affecting the original.

Daytona tracks the parent-child relationship in a fork tree, so you can trace a fork's lineage back to the sandbox it was created from. You can fork a fork to build branches. The parent sandbox cannot be deleted while it has active fork children.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click the three-dot menu (\*\*⋮\*\*) next to the started Windows sandbox you want to fork
3\. Select \*\*Fork\*\*

\`\`\`python
\# Fork sandbox through the Sandbox instance
forked = sandbox.fork(name="my-forked-sandbox")
\`\`\`

\`\`\`typescript
// Fork sandbox through the Sandbox instance
const forkedSandbox = await sandbox.fork({ name: "my-forked-sandbox" });

// Or use the Daytona helper method
const forkedSandbox = await daytona.fork(sandbox, { name: "my-forked-sandbox" });
\`\`\`

\`\`\`ruby
\# Fork sandbox through the Sandbox instance
forkedSandbox = sandbox.fork(name: "my-forked-sandbox")
\`\`\`

\`\`\`go
// Fork sandbox through the Sandbox instance
name := "my-forked-sandbox"
forkedSandbox, err := sandbox.Fork(ctx, &name)
if err != nil {
 return err
}
\`\`\`

\`\`\`java
// Fork sandbox through the Sandbox instance
Sandbox forkedSandbox = sandbox.fork("my-forked-sandbox", 60);
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/fork' \
 --request POST \
 --header 'X-Daytona-Organization-ID: YOUR\_ORGANIZATION\_ID' \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "my-forked-sandbox"
}'
\`\`\`

Query fork relationships:

\`\`\`bash
\# List direct fork children of a sandbox
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/forks' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'

\# Get the parent sandbox of a fork
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/parent' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'

\# Get the full ancestor chain (parent, grandparent, and so on)
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ancestors' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Sandbox lifecycle

\| \*\*Lifecycle feature\*\* \| \*\*Container\*\* \| \*\*Linux VM\*\* \| \*\*Windows\*\* \| \*\*GPU\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\- \|
\| Start sandboxes \| ✓ \| ✓ \| ✓ \| ✓ \|
\| Stop sandboxes \| ✓ \| ✓ \| ✓ \| ✓ \|
\| Pause / resume sandboxes \| ✗ \| ✓ \| ✓ \| ✗ \|
\| Archive sandboxes \| ✓ \| ✗ \| ✗ \| ✗ \|
\| Fork sandboxes \| ✗ \| ✓ \| ✓ \| ✗ \|
\| Snapshot from sandbox

(filesystem only) \| ✓ \| ✓ \| ✓ \| ✓ \|
\| Snapshot from sandbox

(filesystem + memory) \| ✗ \| ✓ \| ✓ \| ✗ \|

A sandbox can have several different states. Each state reflects the status of your sandbox.

\| \*\*State\*\* \| \*\*Description\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| Creating \| The sandbox is provisioning and will be ready to use. \|
\| Pulling Snapshot \| The sandbox is pulling a \[\*\*snapshot\*\*\](https://www.daytona.io/docs/en/snapshots.md) to provide a base environment. \|
\| Building Snapshot \| The sandbox is building a \[\*\*snapshot\*\*\](https://www.daytona.io/docs/en/snapshots.md) to provide a base environment. \|
\| Pending Build \| The sandbox build is pending and will start shortly. \|
\| Build Failed \| The sandbox build failed and needs to be retried. \|
\| Starting \| The sandbox is starting and will be ready to use. \|
\| Started \| The sandbox has started and is ready to use. \|
\| Stopping \| The sandbox is stopping and will no longer accept requests. \|
\| Stopped \| The sandbox has stopped and is no longer running. Container sandboxes keep their filesystem on the runner. VM sandboxes offload filesystem state to nearby storage. \|
\| Pausing \| The VM sandbox is pausing while its filesystem and memory state are preserved. \|
\| Paused \| The VM sandbox is paused with filesystem and memory state preserved. State is offloaded to nearby storage. \|
\| Resuming \| The VM sandbox is resuming from a paused state and will be ready to use. \|
\| Archiving \| The container sandbox filesystem is being moved to object storage. \|
\| Archived \| The container sandbox filesystem is stored in object storage. \|
\| Restoring \| The sandbox is being restored and will be ready to use shortly. \|
\| Resizing \| The sandbox is being resized to a new set of resources. \|
\| Snapshotting \| The sandbox is creating a \[\*\*snapshot\*\*\](https://www.daytona.io/docs/en/snapshots.md) of its filesystem and memory. \|
\| Forking \| The sandbox is being forked into a new independent sandbox. \|
\| Deleting \| The sandbox is deleting and will be removed. \|
\| Deleted \| The sandbox has been deleted and no longer exists. \|
\| Error \| The sandbox is in an error state and needs to be recovered. \|
\| Unknown \| The default sandbox state before it is created. \|

The diagram demonstrates the states and possible transitions between them.

\##### State transitions

A sandbox can transition between states in response to various actions. The following table lists the initial state, target state, and trigger for the transition.

\| \*\*Initial state\*\* \| \*\*Target state\*\* \| \*\*Trigger\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| Unknown \| Pulling Snapshot \| The base snapshot is being pulled to provide the sandbox environment. \|
\| Unknown \| Building Snapshot \| The sandbox uses a declarative image build, which begins building. \|
\| Pending Build \| Building Snapshot \| The queued image build starts. \|
\| Building Snapshot \| Build Failed \| The image build fails or times out. \|
\| Pulling Snapshot \| Creating \| The snapshot is available and the sandbox container is created. \|
\| Building Snapshot \| Creating \| The snapshot finishes building and the sandbox container is created. \|
\| Creating \| Started \| The sandbox container finishes initializing and is running. \|
\| Stopped \| Starting \| A start is requested and the sandbox boots. \|
\| Stopped \| Restoring \| A start is requested and the sandbox is restored from a backup. \|
\| Archived \| Restoring \| A start is requested and the archived filesystem is restored from object storage. \|
\| Restoring \| Started \| The restore completes and the sandbox is running. \|
\| Starting \| Started \| The sandbox is running and ready to accept requests. \|
\| Started \| Stopping \| A stop is requested, or the auto-stop interval is exceeded. \|
\| Stopping \| Stopped \| The sandbox process exits and its memory state is cleared. \|
\| Started \| Pausing \| A pause is requested, or the auto-pause interval is exceeded. \|
\| Pausing \| Paused \| The filesystem and memory state are preserved. \|
\| Paused \| Resuming \| A start is requested on a paused sandbox. \|
\| Paused \| Stopping \| A stop is requested on a paused sandbox. \|
\| Resuming \| Started \| The sandbox resumes from memory and is running. \|
\| Stopped \| Archiving \| An archive is requested, or the auto-archive interval is exceeded. \|
\| Archiving \| Archived \| The backup completes and the filesystem is moved to object storage. \|
\| Started \| Resizing \| CPU or memory is increased on a running sandbox. \|
\| Stopped \| Resizing \| Resources are changed on a stopped sandbox. \|
\| Resizing \| Started \| The running sandbox returns to service after resizing. \|
\| Resizing \| Stopped \| The stopped sandbox completes resizing. \|
\| Started \| Snapshotting \| A snapshot of the filesystem and memory is created. \|
\| Stopped \| Snapshotting \| A snapshot of the filesystem is created. \|
\| Snapshotting \| Started \| The snapshot completes and the sandbox returns to service. \|
\| Snapshotting \| Stopped \| The snapshot completes and the sandbox remains stopped. \|
\| Started \| Forking \| The sandbox is forked into a new independent sandbox. \|
\| Forking \| Started \| The fork completes and the sandbox returns to service. \|
\| Started \| Deleting \| A delete is requested, or the auto-delete interval is exceeded. \|
\| Stopped \| Deleting \| A delete is requested. \|
\| Archived \| Deleted \| An archived sandbox is deleted directly without being restored. \|
\| Deleting \| Deleted \| The sandbox is removed and its resources are released. \|
\| Started \| Error \| An operation fails or times out. \|
\| Error \| Restoring \| A recover is requested for a recoverable error and the sandbox is restored. \|
\| Error \| Archiving \| An errored sandbox with a completed backup is archived to preserve its state. \|

\## Automated lifecycle management

Sandboxes can be managed automatically based on user-defined deadlines. Inactivity and stopped-time intervals stop, pause, archive, or delete a sandbox when it is idle. Wall-clock TTL destroys a sandbox after a fixed deadline regardless of state.

\- \*\*\[Auto-stop interval\](#auto-stop-interval)\*\*: stop a sandbox after a specified period of inactivity
\- \*\*\[Auto-pause interval\](#auto-pause-interval)\*\*: pause a VM sandbox after a specified period of inactivity
\- \*\*\[Auto-archive interval\](#auto-archive-interval)\*\*: archive a sandbox after a specified period of inactivity
\- \*\*\[Auto-delete interval\](#auto-delete-interval)\*\*: delete a sandbox after a specified period of inactivity
\- \*\*\[Wall-clock TTL\](#wall-clock-ttl)\*\*: destroy a sandbox after a fixed wall-clock deadline, regardless of state
\- \*\*\[Update sandbox last activity\](#update-sandbox-last-activity)\*\*: signal activity to reset the inactivity timer
\- \*\*\[Running indefinitely\](#running-indefinitely)\*\*: run a sandbox indefinitely

\### Auto-stop interval

The auto-stop interval sets the amount of time after which a running sandbox is automatically stopped. The auto-stop triggers even if there are internal processes running in the sandbox.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Set \*\*\`auto-stop\`\*\* interval to the desired value in minutes
 \- \*\*\`0\`\*\*: disables the auto-stop functionality, allowing the sandbox to run indefinitely
 \- if not set, the default interval of 15 minutes is used
4\. Click \*\*Create\*\*

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="my-snapshot",
 # Disables the auto-stop feature - default is 15 minutes
 auto\_stop\_interval=0,
))
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'my-snapshot',
 // Disables the auto-stop feature - default is 15 minutes
 autoStopInterval: 0,
})
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'my-snapshot',
 # Disables the auto-stop feature - default is 15 minutes
 auto\_stop\_interval: 0
 )
)
\`\`\`

\`\`\`go
// Create a sandbox with auto-stop disabled
autoStopInterval := 0
params := types.SnapshotParams{
 Snapshot: "my-snapshot",
 SandboxBaseParams: types.SandboxBaseParams{
 AutoStopInterval: &autoStopInterval,
 },
}
sandbox, err := client.Create(ctx, params)
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("my-snapshot");
 // Disables the auto-stop feature - default is 15 minutes
 params.setAutoStopInterval(0);
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autostop/{interval}' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

The system differentiates between "internal processes" and "active user interaction". Merely having a script or background task running is not sufficient to keep the sandbox alive.

\##### What resets the timer

The inactivity timer resets only for specific external interactions:

\- Updates to \[sandbox lifecycle states\](#sandbox-lifecycle)
\- Network requests through \[sandbox previews\](https://www.daytona.io/docs/en/preview.md)
\- Active \[SSH connections\](https://www.daytona.io/docs/en/ssh-access.md)
\- API requests to the \[Daytona Toolbox SDK\](https://www.daytona.io/docs/en/tools/api.md#daytona-toolbox)

\##### What does not reset the timer

The following do not reset the timer:

\- SDK requests that are not toolbox actions
\- Background scripts (e.g., \`npm run dev\` run as a fire-and-forget command)
\- Long-running tasks without external interaction
\- Processes that don't involve active monitoring

If you run a long-running task like LLM inference that takes more than 15 minutes to complete without any external interaction, the sandbox may auto-stop mid-process because the process itself doesn't count as "activity", therefore the timer is not reset.

\### Auto-pause interval

The auto-pause interval sets the amount of time after which an idle VM sandbox is automatically \[paused\](#pause--resume-sandboxes). Auto-pause applies only to \[VM sandboxes\](#vm-sandboxes) and is mutually exclusive with the \[auto-stop interval\](#auto-stop-interval): at most one of the two intervals may be non-zero. Ephemeral sandboxes cannot have auto-pause enabled.

The interval is set in minutes:

\- \*\*\`0\`\*\*: disables the auto-pause functionality
\- if neither auto-pause nor auto-stop is set, non-ephemeral sandbox classes that support pausing default to an auto-pause interval of 60 minutes with auto-stop disabled

The sandbox pauses after no new events occur for the specified interval. Events include sandbox state changes and interactions with the sandbox through the SDK. Interactions through \[sandbox previews\](https://www.daytona.io/docs/en/preview.md) do not reset the timer.

Auto-pause is not supported for container sandboxes. Use \[\*\*auto-stop\*\*\](#auto-stop-interval) to stop a container sandbox after a period of inactivity.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Select a Linux VM snapshot
4\. Set \*\*\`auto-pause\`\*\* interval to the desired value in minutes
 \- \*\*\`0\`\*\*: disables the auto-pause functionality
 \- if neither auto-pause nor auto-stop is set, the default interval of 60 minutes is used with auto-stop disabled
5\. Click \*\*Create\*\*

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="daytona-vm-small",
 # Auto-pause after 1 hour of inactivity
 auto\_pause\_interval=60,
))

\# Update the auto-pause interval on an existing sandbox
sandbox.set\_auto\_pause\_interval(60)

\# Disable auto-pause
sandbox.set\_auto\_pause\_interval(0)
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'daytona-vm-small',
 // Auto-pause after 1 hour of inactivity
 autoPauseInterval: 60,
})

// Update the auto-pause interval on an existing sandbox
await sandbox.setAutoPauseInterval(60)

// Disable auto-pause
await sandbox.setAutoPauseInterval(0)
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'daytona-vm-small',
 # Auto-pause after 1 hour of inactivity
 auto\_pause\_interval: 60
 )
)

\# Update the auto-pause interval on an existing sandbox
sandbox.auto\_pause\_interval = 60

\# Disable auto-pause
sandbox.auto\_pause\_interval = 0
\`\`\`

\`\`\`go
// Auto-pause after 1 hour of inactivity
autoPauseInterval := 60
params := types.SnapshotParams{
 Snapshot: "daytona-vm-small",
 SandboxBaseParams: types.SandboxBaseParams{
 AutoPauseInterval: &autoPauseInterval,
 },
}
sandbox, err := client.Create(ctx, params)
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
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
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autopause/{interval}' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Select a Windows snapshot
4\. Set \*\*\`auto-pause\`\*\* interval to the desired value in minutes
 \- \*\*\`0\`\*\*: disables the auto-pause functionality
 \- if neither auto-pause nor auto-stop is set, the default interval of 60 minutes is used with auto-stop disabled
5\. Click \*\*Create\*\*

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="windows-small",
 # Auto-pause after 1 hour of inactivity
 auto\_pause\_interval=60,
))

\# Update the auto-pause interval on an existing sandbox
sandbox.set\_auto\_pause\_interval(60)

\# Disable auto-pause
sandbox.set\_auto\_pause\_interval(0)
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'windows-small',
 // Auto-pause after 1 hour of inactivity
 autoPauseInterval: 60,
})

// Update the auto-pause interval on an existing sandbox
await sandbox.setAutoPauseInterval(60)

// Disable auto-pause
await sandbox.setAutoPauseInterval(0)
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'windows-small',
 # Auto-pause after 1 hour of inactivity
 auto\_pause\_interval: 60
 )
)

\# Update the auto-pause interval on an existing sandbox
sandbox.auto\_pause\_interval = 60

\# Disable auto-pause
sandbox.auto\_pause\_interval = 0
\`\`\`

\`\`\`go
// Auto-pause after 1 hour of inactivity
autoPauseInterval := 60
params := types.SnapshotParams{
 Snapshot: "windows-small",
 SandboxBaseParams: types.SandboxBaseParams{
 AutoPauseInterval: &autoPauseInterval,
 },
}
sandbox, err := client.Create(ctx, params)
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
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
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autopause/{interval}' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

Auto-pause is not supported for GPU sandboxes. GPU sandboxes are ephemeral and cannot have auto-pause enabled.

\### Auto-archive interval

The auto-archive interval sets the amount of time after which a continuously stopped sandbox is automatically archived. Auto-archive applies only to container sandboxes. VM sandboxes are excluded.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Set \*\*\`auto-archive\`\*\* interval to the desired value in minutes
 \- \*\*\`0\`\*\*: the maximum interval of 30 days is used
 \- if not set, the default interval of 7 days is used
4\. Click \*\*Create\*\*

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="my-snapshot",
 # Auto-archive after a sandbox has been stopped for 1 hour
 auto\_archive\_interval=60,
))
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'my-snapshot',
 // Auto-archive after a sandbox has been stopped for 1 hour
 autoArchiveInterval: 60,
})
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'my-snapshot',
 # Auto-archive after a sandbox has been stopped for 1 hour
 auto\_archive\_interval: 60
 )
)
\`\`\`

\`\`\`go
// Create a sandbox with auto-archive after 1 hour
autoArchiveInterval := 60
params := types.SnapshotParams{
 Snapshot: "my-snapshot",
 SandboxBaseParams: types.SandboxBaseParams{
 AutoArchiveInterval: &autoArchiveInterval,
 },
}
sandbox, err := client.Create(ctx, params)
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("my-snapshot");
 // Auto-archive after a sandbox has been stopped for 1 hour
 params.setAutoArchiveInterval(60);
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autoarchive/{interval}' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Auto-delete interval

The auto-delete interval sets the amount of time after which a continuously stopped sandbox is automatically deleted.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Set \*\*\`auto-delete\`\*\* to the desired value in minutes
 \- \`-1\`: disables the auto-delete functionality
 \- \`0\`: the sandbox is deleted immediately after it is stopped
 \- if not set, the sandbox is not deleted automatically
4\. Click \*\*Create\*\*

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="my-snapshot",
 # Auto-delete after a sandbox has been stopped for 1 hour
 auto\_delete\_interval=60,
))

\# Delete the sandbox immediately after it has been stopped
sandbox.set\_auto\_delete\_interval(0)

\# Disable auto-deletion
sandbox.set\_auto\_delete\_interval(-1)
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'my-snapshot',
 // Auto-delete after a sandbox has been stopped for 1 hour
 autoDeleteInterval: 60,
})

// Delete the sandbox immediately after it has been stopped
await sandbox.setAutoDeleteInterval(0)

// Disable auto-deletion
await sandbox.setAutoDeleteInterval(-1)
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'my-snapshot',
 # Auto-delete after a sandbox has been stopped for 1 hour
 auto\_delete\_interval: 60
 )
)

\# Delete the sandbox immediately after it has been stopped
sandbox.auto\_delete\_interval = 0

\# Disable auto-deletion
sandbox.auto\_delete\_interval = -1
\`\`\`

\`\`\`go
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
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
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
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/autodelete/{interval}' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Wall-clock TTL

The wall-clock TTL (time-to-live) sets a hard upper bound on how long a sandbox may exist. Unlike the \[auto-delete interval\](#auto-delete-interval), which counts time only while the sandbox is stopped, TTL runs as wall-clock time from creation (or from the moment you last set it) and destroys the sandbox in any state: started, stopped, paused, or archived.

Set \`ttl\_minutes\` when creating a sandbox, or update it later. The value is in minutes:

\- \*\*\`0\`\*\*: disables the TTL
\- if not set, the sandbox has no TTL deadline

Calling \`set\_ttl\` after creation resets the deadline from the current moment. Use wall-clock TTL for agent sessions, CI jobs, and any sandbox that must not outlive a fixed deadline.

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="my-snapshot",
 # Destroy the sandbox 2 hours after creation, regardless of state
 ttl\_minutes=120,
))

\# Reset the deadline to 1 hour from now
sandbox.set\_ttl(60)

\# Disable the TTL
sandbox.set\_ttl(0)
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'my-snapshot',
 // Destroy the sandbox 2 hours after creation, regardless of state
 ttlMinutes: 120,
})

// Reset the deadline to 1 hour from now
await sandbox.setTtl(60)

// Disable the TTL
await sandbox.setTtl(0)
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'my-snapshot',
 # Destroy the sandbox 2 hours after creation, regardless of state
 ttl\_minutes: 120
 )
)

\# Reset the deadline to 1 hour from now
sandbox.ttl\_minutes = 60

\# Disable the TTL
sandbox.ttl\_minutes = 0
\`\`\`

\`\`\`go
// Destroy the sandbox 2 hours after creation, regardless of state
ttlMinutes := 120
params := types.SnapshotParams{
 Snapshot: "my-snapshot",
 SandboxBaseParams: types.SandboxBaseParams{
 TtlMinutes: &ttlMinutes,
 },
}
sandbox, err := client.Create(ctx, params)
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
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
\`\`\`

\`\`\`bash
\# Destroy the sandbox 2 hours after creation, regardless of state
daytona create --ttl 120
\`\`\`

\`\`\`bash
\# Create with a 2-hour wall-clock TTL
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "snapshot": "my-snapshot",
 "ttlMinutes": 120
}'

\# Reset the deadline to 1 hour from now
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ttl/60' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'

\# Disable the TTL
curl 'https://app.daytona.io/api/sandbox/{sandboxIdOrName}/ttl/0' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update sandbox last activity

Update a sandbox's last activity timestamp.

This updates the sandbox's recorded activity time without changing its runtime state. It is useful when your workflow is driven by external systems or background orchestration that may not reset inactivity tracking.

\`\`\`python
sandbox.refresh\_activity()
\`\`\`

\`\`\`typescript
await sandbox.refreshActivity()
\`\`\`

\`\`\`ruby
sandbox.refresh\_activity
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/last-activity' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Running indefinitely

Run sandboxes indefinitely.

By default, Daytona sandboxes auto-stop after 15 minutes of inactivity. To keep a sandbox running without interruption from inactivity, set the auto-stop interval to \`0\` when creating a new sandbox. Disabling auto-stop does not disable \[wall-clock TTL\](#wall-clock-ttl): if \`ttl\_minutes\` is set, the sandbox is still destroyed when that deadline elapses.

1\. Go to \[Daytona Sandboxes ↗\](https://app.daytona.io/dashboard/sandboxes)
2\. Click \*\*Create Sandbox\*\*
3\. Set \*\*\`auto-stop\`\*\* to \*\*\`0\`\*\*
4\. Click \*\*Create\*\*

\`\`\`python
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
 snapshot="my\_awesome\_snapshot",
 # Disables the auto-stop feature - default is 15 minutes
 auto\_stop\_interval=0,
))
\`\`\`

\`\`\`typescript
const sandbox = await daytona.create({
 snapshot: 'my\_awesome\_snapshot',
 // Disables the auto-stop feature - default is 15 minutes
 autoStopInterval: 0,
})
\`\`\`

\`\`\`ruby
sandbox = daytona.create(
 Daytona::CreateSandboxFromSnapshotParams.new(
 snapshot: 'my\_awesome\_snapshot',
 # Disables the auto-stop feature - default is 15 minutes
 auto\_stop\_interval: 0
 )
)
\`\`\`

\`\`\`go
// Disables the auto-stop feature - default is 15 minutes
autoStopInterval := 0
params := types.SnapshotParams{
 Snapshot: "my\_awesome\_snapshot",
 SandboxBaseParams: types.SandboxBaseParams{
 AutoStopInterval: &autoStopInterval,
 },
}
sandbox, err := client.Create(ctx, params)
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

public class App {
 public static void main(String\[\] args) {
 try (Daytona daytona = new Daytona()) {
 CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
 params.setSnapshot("my\_awesome\_snapshot");
 // Disables the auto-stop feature - default is 15 minutes
 params.setAutoStopInterval(0);
 Sandbox sandbox = daytona.create(params);
 }
 }
}
\`\`\`