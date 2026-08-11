---
url: "https://www.daytona.io/docs/en/declarative-builder/"
title: "Declarative Builder | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/declarative-builder/#_top)

# Declarative Builder

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/declarative-builder.md)Open

Declarative Builder provides a powerful, code-first approach to defining dependencies for Daytona sandboxes. Instead of importing images from a container registry, you can programmatically define them using the Daytona SDK.

The declarative builder system supports two primary workflows:

- [**Declarative images**](https://www.daytona.io/docs/en/declarative-builder/#build-declarative-images): build images on demand when creating sandboxes
- [**Pre-built snapshots**](https://www.daytona.io/docs/en/declarative-builder/#create-pre-built-snapshots): create and register ready-to-use [snapshots](https://www.daytona.io/docs/snapshots)

## [\#](https://www.daytona.io/docs/en/declarative-builder/\#build-declarative-images) Build declarative images

[Section titled “Build declarative images”](https://www.daytona.io/docs/en/declarative-builder/#build-declarative-images)

Create a declarative image by defining the dependencies for the sandbox.

Declarative images are cached for 24 hours, and are automatically reused when running the same script. Thus, subsequent runs on the same runner will be almost instantaneous.

- [Container](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-256)
- [GPU](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-257)

Create a container sandbox from a declarative image.

- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-222)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-223)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-224)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-225)
- [Java](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-226)

```
# Define a declarative image with python packages

declarative_image = (

  Image.debian_slim("3.12")

  .pip_install(["requests", "pytest"])

  .workdir("/home/daytona")

)

# Create a new sandbox with the declarative image and stream the build logs

sandbox = daytona.create(

  CreateSandboxFromImageParams(image=declarative_image),

  timeout=0,

  on_snapshot_create_logs=print,

)
```

```
// Define a declarative image with python packages

const declarativeImage = Image.debianSlim('3.12')

  .pipInstall(['requests', 'pytest'])

  .workdir('/home/daytona')

// Create a new sandbox with the declarative image and stream the build logs

const sandbox = await daytona.create(

  {

    image: declarativeImage,

  },

  {

    timeout: 0,

    onSnapshotCreateLogs: console.log,

  }

)
```

```
# Define a simple declarative image with Python packages

declarative_image = Daytona::Image

  .debian_slim('3.12')

  .pip_install(['requests', 'pytest'])

  .workdir('/home/daytona')

# Create a new Sandbox with the declarative image and stream the build logs

sandbox = daytona.create(

  Daytona::CreateSandboxFromImageParams.new(image: declarative_image),

  on_snapshot_create_logs: proc { |chunk| puts chunk }

)
```

```
// Define a declarative image with python packages

version := "3.12"

declarativeImage := daytona.DebianSlim(&version).

  PipInstall([]string{"requests", "pytest"}).

  Workdir("/home/daytona")

// Create a new sandbox with the declarative image and stream the build logs

logChan := make(chan string)

go func() {

  for log := range logChan {

    fmt.Print(log)

  }

}()

sandbox, err := client.Create(ctx, types.ImageParams{

  Image: declarativeImage,

}, options.WithTimeout(0), options.WithLogChannel(logChan))

if err != nil {

  // handle error

}
```

```
// Define a declarative image with python packages

Image declarativeImage = Image.debianSlim("3.12")

    .pipInstall("requests", "pytest")

    .workdir("/home/daytona");

// Create a new sandbox with the declarative image and stream the build logs

CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();

params.setImage(declarativeImage);

Sandbox sandbox = daytona.create(params, 0L, System.out::println);
```

Create a GPU sandbox from a declarative image.

- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-227)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-228)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-229)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-230)
- [Java](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-231)

```
# Define a declarative image with python packages

declarative_image = (

  Image.debian_slim("3.12")

  .pip_install(["requests", "pytest"])

  .workdir("/home/daytona")

)

# Create a GPU sandbox with the declarative image and stream the build logs

sandbox = daytona.create(

  CreateSandboxFromImageParams(

    image=declarative_image,

    auto_delete_interval=0,

    resources=Resources(gpu=1),

  ),

  timeout=0,

  on_snapshot_create_logs=print,

)
```

```
// Define a declarative image with python packages

const declarativeImage = Image.debianSlim('3.12')

  .pipInstall(['requests', 'pytest'])

  .workdir('/home/daytona')

// Create a GPU sandbox with the declarative image and stream the build logs

const sandbox = await daytona.create(

  {

    image: declarativeImage,

    autoDeleteInterval: 0,

    resources: { gpu: 1 },

  },

  {

    timeout: 0,

    onSnapshotCreateLogs: console.log,

  }

)
```

```
# Define a simple declarative image with Python packages

declarative_image = Daytona::Image

  .debian_slim('3.12')

  .pip_install(['requests', 'pytest'])

  .workdir('/home/daytona')

# Create a GPU Sandbox with the declarative image and stream the build logs

sandbox = daytona.create(

  Daytona::CreateSandboxFromImageParams.new(

    image: declarative_image,

    auto_delete_interval: 0,

    resources: Daytona::Resources.new(gpu: 1)

  ),

  on_snapshot_create_logs: proc { |chunk| puts chunk }

)
```

```
// Define a declarative image with python packages

version := "3.12"

declarativeImage := daytona.DebianSlim(&version).

  PipInstall([]string{"requests", "pytest"}).

  Workdir("/home/daytona")

// Create a GPU sandbox with the declarative image and stream the build logs

autoDelete := 0

logChan := make(chan string)

go func() {

  for log := range logChan {

    fmt.Print(log)

  }

}()

sandbox, err := client.Create(ctx, types.ImageParams{

  Image: declarativeImage,

  SandboxBaseParams: types.SandboxBaseParams{

    AutoDeleteInterval: &autoDelete,

  },

  Resources: &types.Resources{

    GPU: 1,

  },

}, options.WithTimeout(0), options.WithLogChannel(logChan))

if err != nil {

  // handle error

}
```

```
// Define a declarative image with python packages

Image declarativeImage = Image.debianSlim("3.12")

    .pipInstall("requests", "pytest")

    .workdir("/home/daytona");

// Create a GPU sandbox with the declarative image and stream the build logs

CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();

params.setImage(declarativeImage);

params.setAutoDeleteInterval(0);

Resources resources = new Resources();

resources.setGpu(1);

params.setResources(resources);

Sandbox sandbox = daytona.create(params, 0L, System.out::println);
```

## [\#](https://www.daytona.io/docs/en/declarative-builder/\#create-pre-built-snapshots) Create pre-built snapshots

[Section titled “Create pre-built snapshots”](https://www.daytona.io/docs/en/declarative-builder/#create-pre-built-snapshots)

Create a pre-built snapshot by building a declarative image and registering it as a [snapshot](https://www.daytona.io/docs/en/snapshots).

- [Container](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-258)
- [Linux VM](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-259)
- [GPU](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-260)

1. Create a container snapshot from a declarative image
2. Create a sandbox from that snapshot

- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-232)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-233)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-234)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-235)
- [Java](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-236)

```
# Define the declarative image for the snapshot

image = (

  Image.debian_slim("3.12")

  .pip_install(["numpy", "pandas"])

  .workdir("/home/daytona")

)

# Create and register the snapshot, streaming the build logs

daytona.snapshot.create(

  CreateSnapshotParams(name="my-snapshot", image=image),

  on_logs=print,

)

# Create a new sandbox from the pre-built snapshot

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="my-snapshot"))
```

```
// Define the declarative image for the snapshot

const image = Image.debianSlim('3.12')

  .pipInstall(['numpy', 'pandas'])

  .workdir('/home/daytona')

// Create and register the snapshot, streaming the build logs

await daytona.snapshot.create(

  {

    name: 'my-snapshot',

    image,

  },

  {

    onLogs: console.log,

  }

)

// Create a new sandbox from the pre-built snapshot

const sandbox = await daytona.create({ snapshot: 'my-snapshot' })
```

```
# Define the declarative image for the snapshot

image = Daytona::Image

  .debian_slim('3.12')

  .pip_install(['numpy', 'pandas'])

  .workdir('/home/daytona')

# Create and register the snapshot, streaming the build logs

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(name: 'my-snapshot', image: image),

  on_logs: proc { |chunk| print chunk }

)

# Create a new sandbox from the pre-built snapshot

sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'my-snapshot'))
```

```
// Define the declarative image for the snapshot

version := "3.12"

image := daytona.DebianSlim(&version).

  PipInstall([]string{"numpy", "pandas"}).

  Workdir("/home/daytona")

// Create and register the snapshot, streaming the build logs

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "my-snapshot",

  Image: image,

})

if err != nil {

  // handle error

}

for log := range logChan {

  fmt.Print(log)

}

// Create a new sandbox from the pre-built snapshot

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: snapshot.Name,

})

if err != nil {

  // handle error

}
```

```
// Define the declarative image for the snapshot

Image image = Image.debianSlim("3.12")

    .pipInstall("numpy", "pandas")

    .workdir("/home/daytona");

// Create and register the snapshot, streaming the build logs

Snapshot snapshot = daytona.snapshot().create("my-snapshot", image, System.out::println);

// Create a new sandbox from the pre-built snapshot

CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

params.setSnapshot("my-snapshot");

Sandbox sandbox = daytona.create(params);
```

1. Create a Linux VM snapshot from a declarative image
2. Create a sandbox from that snapshot

- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-237)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-238)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-239)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-240)
- [Java](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-241)

```
# Define the declarative image for the VM snapshot

image = (

  Image.debian_slim("3.12")

  .pip_install(["numpy", "pandas"])

  .workdir("/home/daytona")

)

# Create and register the VM snapshot, streaming the build logs

daytona.snapshot.create(

  CreateSnapshotParams(

    name="my-vm-snapshot",

    image=image,

    sandbox_class=SandboxClass.LINUX_VM,

  ),

  on_logs=print,

)

# Create a new VM sandbox from the pre-built snapshot

sandbox = daytona.create(CreateSandboxFromSnapshotParams(snapshot="my-vm-snapshot"))
```

```
// Define the declarative image for the VM snapshot

const image = Image.debianSlim('3.12')

  .pipInstall(['numpy', 'pandas'])

  .workdir('/home/daytona')

// Create and register the VM snapshot, streaming the build logs

await daytona.snapshot.create(

  {

    name: 'my-vm-snapshot',

    image,

    sandboxClass: SandboxClass.LINUX_VM,

  },

  {

    onLogs: console.log,

  }

)

// Create a new VM sandbox from the pre-built snapshot

const sandbox = await daytona.create({ snapshot: 'my-vm-snapshot' })
```

```
# Define the declarative image for the VM snapshot

image = Daytona::Image

  .debian_slim('3.12')

  .pip_install(['numpy', 'pandas'])

  .workdir('/home/daytona')

# Create and register the VM snapshot, streaming the build logs

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(

    name: 'my-vm-snapshot',

    image: image,

    sandbox_class: DaytonaApiClient::SandboxClass::LINUX_VM

  ),

  on_logs: proc { |chunk| print chunk }

)

# Create a new VM sandbox from the pre-built snapshot

sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(snapshot: 'my-vm-snapshot'))
```

```
// Define the declarative image for the VM snapshot

version := "3.12"

image := daytona.DebianSlim(&version).

  PipInstall([]string{"numpy", "pandas"}).

  Workdir("/home/daytona")

// Create and register the VM snapshot, streaming the build logs

sandboxClass := types.SandboxClassLinuxVM

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:         "my-vm-snapshot",

  Image:        image,

  SandboxClass: &sandboxClass,

})

if err != nil {

  // handle error

}

for log := range logChan {

  fmt.Print(log)

}

// Create a new VM sandbox from the pre-built snapshot

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: snapshot.Name,

})

if err != nil {

  // handle error

}
```

```
// Define the declarative image for the VM snapshot

Image image = Image.debianSlim("3.12")

    .pipInstall("numpy", "pandas")

    .workdir("/home/daytona");

// Create and register the VM snapshot, streaming the build logs

Snapshot snapshot = daytona.snapshot().create(

    "my-vm-snapshot", image, null, SandboxClass.LINUX_VM, System.out::println);

// Create a new VM sandbox from the pre-built snapshot

CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

params.setSnapshot("my-vm-snapshot");

Sandbox sandbox = daytona.create(params);
```

1. Create a GPU snapshot from a declarative image
2. Create a sandbox from that snapshot

- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-242)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-243)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-244)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-245)
- [Java](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-246)

```
# Define the declarative image for the GPU snapshot

image = (

  Image.debian_slim("3.12")

  .pip_install(["numpy", "pandas"])

  .workdir("/home/daytona")

)

# Create and register the GPU snapshot, streaming the build logs

daytona.snapshot.create(

  CreateSnapshotParams(

    name="my-gpu-snapshot",

    image=image,

    resources=Resources(gpu=1),

  ),

  on_logs=print,

)

# Create a new GPU sandbox from the pre-built snapshot

sandbox = daytona.create(

  CreateSandboxFromSnapshotParams(

    snapshot="my-gpu-snapshot",

    auto_delete_interval=0,

  )

)
```

```
// Define the declarative image for the GPU snapshot

const image = Image.debianSlim('3.12')

  .pipInstall(['numpy', 'pandas'])

  .workdir('/home/daytona')

// Create and register the GPU snapshot, streaming the build logs

await daytona.snapshot.create(

  {

    name: 'my-gpu-snapshot',

    image,

    resources: { gpu: 1 },

  },

  {

    onLogs: console.log,

  }

)

// Create a new GPU sandbox from the pre-built snapshot

const sandbox = await daytona.create({

  snapshot: 'my-gpu-snapshot',

  autoDeleteInterval: 0,

})
```

```
# Define the declarative image for the GPU snapshot

image = Daytona::Image

  .debian_slim('3.12')

  .pip_install(['numpy', 'pandas'])

  .workdir('/home/daytona')

# Create and register the GPU snapshot, streaming the build logs

daytona.snapshot.create(

  Daytona::CreateSnapshotParams.new(

    name: 'my-gpu-snapshot',

    image: image,

    resources: Daytona::Resources.new(gpu: 1)

  ),

  on_logs: proc { |chunk| print chunk }

)

# Create a new GPU sandbox from the pre-built snapshot

sandbox = daytona.create(

  Daytona::CreateSandboxFromSnapshotParams.new(

    snapshot: 'my-gpu-snapshot',

    auto_delete_interval: 0

  )

)
```

```
// Define the declarative image for the GPU snapshot

version := "3.12"

image := daytona.DebianSlim(&version).

  PipInstall([]string{"numpy", "pandas"}).

  Workdir("/home/daytona")

// Create and register the GPU snapshot, streaming the build logs

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

  Name:  "my-gpu-snapshot",

  Image: image,

  Resources: &types.Resources{

    GPU: 1,

  },

})

if err != nil {

  // handle error

}

for log := range logChan {

  fmt.Print(log)

}

// Create a new GPU sandbox from the pre-built snapshot

autoDelete := 0

sandbox, err := client.Create(ctx, types.SnapshotParams{

  Snapshot: snapshot.Name,

  SandboxBaseParams: types.SandboxBaseParams{

    AutoDeleteInterval: &autoDelete,

  },

})

if err != nil {

  // handle error

}
```

```
// Define the declarative image for the GPU snapshot

Image image = Image.debianSlim("3.12")

    .pipInstall("numpy", "pandas")

    .workdir("/home/daytona");

Resources resources = new Resources();

resources.setGpu(1);

// Create and register the GPU snapshot, streaming the build logs

Snapshot snapshot = daytona.snapshot().create(

    "my-gpu-snapshot", image, resources, System.out::println);

// Create a new GPU sandbox from the pre-built snapshot

CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();

params.setSnapshot("my-gpu-snapshot");

params.setAutoDeleteInterval(0);

Sandbox sandbox = daytona.create(params);
```

## [\#](https://www.daytona.io/docs/en/declarative-builder/\#image-configuration) Image configuration

[Section titled “Image configuration”](https://www.daytona.io/docs/en/declarative-builder/#image-configuration)

Daytona provides an option to define images programmatically. Chain the methods below to build a complete image definition in a single fluent call.

1. **Select a base image**

Start from any registry image with `Image.base()`, or use `Image.debian_slim()` for a Python-ready Debian image.

2. **Install Python packages**

Add packages with `pip_install()`, or install from `requirements.txt` or `pyproject.toml` using `pip_install_from_requirements()` and `pip_install_from_pyproject()`.

3. **Add files and directories**

Copy local files into the image with `add_local_file()` and `add_local_dir()`.

4. **Configure environment**

Set environment variables and the working directory with `env()` and `workdir()`.

5. **Install system packages**

Use `run_commands()` to install OS-level CLI tools and libraries not available through `pip`. Chain `apt-get update`, install, and cache cleanup with `&&` in a single command to minimize Docker layers.

6. **Add additional runtimes**

Install secondary language runtimes in a single chained `RUN` instruction. The example below adds Node.js 20 alongside Python.

7. **Set up a non-root user**

Run all installation steps as `root` first, then create the user, fix ownership of the working directory, and switch with the `USER` directive. Commands that write to system locations after switching users will fail with permission errors.

8. **Configure startup**

Set the container entrypoint and default command with `entrypoint()` and `cmd()`.


- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-247)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-248)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-249)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-250)
- [Java](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-251)

```
image = (

  # 1. Base image

  Image.debian_slim("3.12")

  # 2. Python packages

  .pip_install(["requests", "pandas"])

  # 3. Local files

  .add_local_file("package.json", "/home/daytona/package.json")

  .add_local_dir("src", "/home/daytona/src")

  # 4. Environment

  .env({"PROJECT_ROOT": "/home/daytona"})

  .workdir("/home/daytona")

  # 5. System packages

  .run_commands(

    "apt-get update "

    "&& apt-get install -y --no-install-recommends git curl ffmpeg jq "

    "&& rm -rf /var/lib/apt/lists/*"

  )

  # 6. Additional runtime

  .run_commands(

    "apt-get update "

    "&& apt-get install -y --no-install-recommends curl ca-certificates "

    "&& curl -fsSL https://deb.nodesource.com/setup_20.x | bash - "

    "&& apt-get install -y nodejs "

    "&& rm -rf /var/lib/apt/lists/*"

  )

  # 7. Non-root user

  .run_commands(

    "groupadd -r daytona && useradd -r -g daytona -m -d /home/daytona daytona",

    "chown -R daytona:daytona /home/daytona",

  )

  .dockerfile_commands(["USER daytona"])

  # 8. Startup

  .entrypoint(["/bin/bash"])

  .cmd(["/bin/bash"])

)
```

```
// 1. Base image

const image = Image.debianSlim('3.12')

  // 2. Python packages

  .pipInstall(['requests', 'pandas'])

  // 3. Local files

  .addLocalFile('package.json', '/home/daytona/package.json')

  .addLocalDir('src', '/home/daytona/src')

  // 4. Environment

  .env({ PROJECT_ROOT: '/home/daytona' })

  .workdir('/home/daytona')

  // 5. System packages

  .runCommands(

    'apt-get update ' +

      '&& apt-get install -y --no-install-recommends git curl ffmpeg jq ' +

      '&& rm -rf /var/lib/apt/lists/*',

  )

  // 6. Additional runtime

  .runCommands(

    'apt-get update ' +

      '&& apt-get install -y --no-install-recommends curl ca-certificates ' +

      '&& curl -fsSL https://deb.nodesource.com/setup_20.x | bash - ' +

      '&& apt-get install -y nodejs ' +

      '&& rm -rf /var/lib/apt/lists/*',

  )

  // 7. Non-root user

  .runCommands(

    'groupadd -r daytona && useradd -r -g daytona -m -d /home/daytona daytona',

    'chown -R daytona:daytona /home/daytona',

  )

  .dockerfileCommands(['USER daytona'])

  // 8. Startup

  .entrypoint(['/bin/bash'])

  .cmd(['/bin/bash'])
```

```
image = Daytona::Image

  # 1. Base image

  .debian_slim('3.12')

  # 2. Python packages

  .pip_install(['requests', 'pandas'])

  # 3. Local files

  .add_local_file('package.json', '/home/daytona/package.json')

  .add_local_dir('src', '/home/daytona/src')

  # 4. Environment

  .env({ 'PROJECT_ROOT' => '/home/daytona' })

  .workdir('/home/daytona')

  # 5. System packages

  .run_commands(

    'apt-get update ' \

    '&& apt-get install -y --no-install-recommends git curl ffmpeg jq ' \

    '&& rm -rf /var/lib/apt/lists/*'

  )

  # 6. Additional runtime

  .run_commands(

    'apt-get update ' \

    '&& apt-get install -y --no-install-recommends curl ca-certificates ' \

    '&& curl -fsSL https://deb.nodesource.com/setup_20.x | bash - ' \

    '&& apt-get install -y nodejs ' \

    '&& rm -rf /var/lib/apt/lists/*'

  )

  # 7. Non-root user

  .run_commands(

    'groupadd -r daytona && useradd -r -g daytona -m -d /home/daytona daytona',

    'chown -R daytona:daytona /home/daytona'

  )

  .dockerfile_commands(['USER daytona'])

  # 8. Startup

  .entrypoint(['/bin/bash'])

  .cmd(['/bin/bash'])
```

```
version := "3.12"

// 1. Base image

image := daytona.DebianSlim(&version).

  // 2. Python packages

  PipInstall([]string{"requests", "pandas"}).

  // 3. Local files

  AddLocalFile("package.json", "/home/daytona/package.json").

  AddLocalDir("src", "/home/daytona/src").

  // 4. Environment

  Env("PROJECT_ROOT", "/home/daytona").

  Workdir("/home/daytona").

  // 5. System packages

  AptGet([]string{"git", "curl", "ffmpeg", "jq"}).

  // 6. Additional runtime

  Run("apt-get update " +

    "&& apt-get install -y --no-install-recommends curl ca-certificates " +

    "&& curl -fsSL https://deb.nodesource.com/setup_20.x | bash - " +

    "&& apt-get install -y nodejs " +

    "&& rm -rf /var/lib/apt/lists/*").

  // 7. Non-root user

  Run("groupadd -r daytona && useradd -r -g daytona -m -d /home/daytona daytona").

  Run("chown -R daytona:daytona /home/daytona").

  User("daytona").

  // 8. Startup

  Entrypoint([]string{"/bin/bash"}).

  Cmd([]string{"/bin/bash"})
```

```
// 1. Base image

Image image = Image.debianSlim("3.12")

    // 2. Python packages

    .pipInstall("requests", "pandas")

    // 3. Local files

    .addLocalFile("package.json", "/home/daytona/package.json")

    .addLocalDir("src", "/home/daytona/src")

    // 4. Environment

    .env(java.util.Map.of("PROJECT_ROOT", "/home/daytona"))

    .workdir("/home/daytona")

    // 5. System packages

    .runCommands(

        "apt-get update "

            + "&& apt-get install -y --no-install-recommends git curl ffmpeg jq "

            + "&& rm -rf /var/lib/apt/lists/*"

    )

    // 6. Additional runtime

    .runCommands(

        "apt-get update "

            + "&& apt-get install -y --no-install-recommends curl ca-certificates "

            + "&& curl -fsSL https://deb.nodesource.com/setup_20.x | bash - "

            + "&& apt-get install -y nodejs "

            + "&& rm -rf /var/lib/apt/lists/*"

    )

    // 7. Non-root user

    .runCommands(

        "groupadd -r daytona && useradd -r -g daytona -m -d /home/daytona daytona",

        "chown -R daytona:daytona /home/daytona"

    )

    .dockerfileCommands("USER daytona")

    // 8. Startup

    .entrypoint("/bin/bash")

    .cmd("/bin/bash");
```

### [\#](https://www.daytona.io/docs/en/declarative-builder/\#dockerfile-integration) Dockerfile integration

[Section titled “Dockerfile integration”](https://www.daytona.io/docs/en/declarative-builder/#dockerfile-integration)

Integrate Dockerfiles and custom Dockerfile commands.

- [Python](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-252)
- [TypeScript](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-253)
- [Ruby](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-254)
- [Go](https://www.daytona.io/docs/en/declarative-builder/#tab-panel-255)

```
# Add custom Dockerfile commands

image = Image.debian_slim("3.12").dockerfile_commands(["RUN echo 'Hello, world!'"])

# Use an existing Dockerfile

image = Image.from_dockerfile("Dockerfile")

# Extend an existing Dockerfile

image = Image.from_dockerfile("app/Dockerfile").pip_install(["numpy"])
```

```
// Add custom Dockerfile commands

const image = Image.debianSlim('3.12').dockerfileCommands(['RUN echo "Hello, world!"'])

// Use an existing Dockerfile

const image = Image.fromDockerfile('Dockerfile')

// Extend an existing Dockerfile

const image = Image.fromDockerfile("app/Dockerfile").pipInstall(['numpy'])
```

```
# Add custom Dockerfile commands

image = Daytona::Image.debian_slim('3.12').dockerfile_commands(['RUN echo "Hello, world!"'])

# Use an existing Dockerfile

image = Daytona::Image.from_dockerfile('Dockerfile')

# Extend an existing Dockerfile

image = Daytona::Image.from_dockerfile('app/Dockerfile').pip_install(['numpy'])
```

```
// Note: In Go, FromDockerfile takes the Dockerfile content as a string

content, err := os.ReadFile("Dockerfile")

if err != nil {

  // handle error

}

image := daytona.FromDockerfile(string(content))

// Extend an existing Dockerfile with additional commands

content, err = os.ReadFile("app/Dockerfile")

if err != nil {

  // handle error

}

image := daytona.FromDockerfile(string(content)).

  PipInstall([]string{"numpy"})
```