---
url: "https://www.daytona.io/docs/en/ruby-sdk/image/"
title: "Image | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/image/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/image.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#image) Image

[Section titled “Image”](https://www.daytona.io/docs/en/ruby-sdk/image/#image)

Represents an image definition for a Daytona sandbox.
Do not construct this class directly. Instead use one of its static factory methods,
such as `Image.base()`, `Image.debian_slim()`, or `Image.from_dockerfile()`.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/image/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#new-image) new Image()

[Section titled “new Image()”](https://www.daytona.io/docs/en/ruby-sdk/image/#new-image)

```
def initialize(dockerfile: nil, context_list: [])
```

**Parameters**:

- `dockerfile` _String, nil_ \- The Dockerfile content
- `context_list` _Array<Context>_ \- List of context files

**Returns**:

- `Image` \- a new instance of Image

### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/image/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#dockerfile) dockerfile()

[Section titled “dockerfile()”](https://www.daytona.io/docs/en/ruby-sdk/image/#dockerfile)

```
def dockerfile()
```

**Returns**:

- `String, nil` \- The generated Dockerfile for the image

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#context_list) context\_list()

[Section titled “context\_list()”](https://www.daytona.io/docs/en/ruby-sdk/image/#context_list)

```
def context_list()
```

**Returns**:

- `Array\<Context\>` \- List of context files for the image

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#pip_install) pip\_install()

[Section titled “pip\_install()”](https://www.daytona.io/docs/en/ruby-sdk/image/#pip_install)

```
def pip_install(*packages, find_links: nil, index_url: nil, extra_index_urls: nil, pre: false, extra_options: '')
```

Adds commands to install packages using pip

**Parameters**:

- `packages` _Array<String>_ \- The packages to install
- `find_links` _Array<String>, nil_ \- The find-links to use
- `index_url` _String, nil_ \- The index URL to use
- `extra_index_urls` _Array<String>, nil_ \- The extra index URLs to use
- `pre` _Boolean_ \- Whether to install pre-release packages
- `extra_options` _String_ \- Additional options to pass to pip

**Returns**:

- `Image` \- The image with the pip install commands added

**Examples:**

```
image = Image.debian_slim("3.12").pip_install("requests", "pandas")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#pip_install_from_requirements) pip\_install\_from\_requirements()

[Section titled “pip\_install\_from\_requirements()”](https://www.daytona.io/docs/en/ruby-sdk/image/#pip_install_from_requirements)

```
def pip_install_from_requirements(requirements_txt, find_links: nil, index_url: nil, extra_index_urls: nil, pre: false, extra_options: '')
```

Installs dependencies from a requirements.txt file

**Parameters**:

- `requirements_txt` _String_ \- The path to the requirements.txt file
- `find_links` _Array<String>, nil_ \- The find-links to use
- `index_url` _String, nil_ \- The index URL to use
- `extra_index_urls` _Array<String>, nil_ \- The extra index URLs to use
- `pre` _Boolean_ \- Whether to install pre-release packages
- `extra_options` _String_ \- Additional options to pass to pip

**Returns**:

- `Image` \- The image with the pip install commands added

**Raises**:

- `Sdk:Error` \- If the requirements file does not exist

**Examples:**

```
image = Image.debian_slim("3.12").pip_install_from_requirements("requirements.txt")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#pip_install_from_pyproject) pip\_install\_from\_pyproject()

[Section titled “pip\_install\_from\_pyproject()”](https://www.daytona.io/docs/en/ruby-sdk/image/#pip_install_from_pyproject)

```
def pip_install_from_pyproject(pyproject_toml, optional_dependencies: [], find_links: nil, index_url: nil, extra_index_url: nil, pre: false, extra_options: '')
```

Installs dependencies from a pyproject.toml file

**Parameters**:

- `pyproject_toml` _String_ \- The path to the pyproject.toml file
- `optional_dependencies` _Array<String>_ \- The optional dependencies to install
- `find_links` _String, nil_ \- The find-links to use
- `index_url` _String, nil_ \- The index URL to use
- `extra_index_url` _String, nil_ \- The extra index URL to use
- `pre` _Boolean_ \- Whether to install pre-release packages
- `extra_options` _String_ \- Additional options to pass to pip

**Returns**:

- `Image` \- The image with the pip install commands added

**Raises**:

- `Sdk:Error` \- If pyproject.toml parsing is not supported

**Examples:**

```
image = Image.debian_slim("3.12").pip_install_from_pyproject("pyproject.toml", optional_dependencies: ["dev"])
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#add_local_file) add\_local\_file()

[Section titled “add\_local\_file()”](https://www.daytona.io/docs/en/ruby-sdk/image/#add_local_file)

```
def add_local_file(local_path, remote_path)
```

Adds a local file to the image

**Parameters**:

- `local_path` _String_ \- The path to the local file
- `remote_path` _String_ \- The path to the file in the image

**Returns**:

- `Image` \- The image with the local file added

**Examples:**

```
image = Image.debian_slim("3.12").add_local_file("package.json", "/home/daytona/package.json")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#add_local_dir) add\_local\_dir()

[Section titled “add\_local\_dir()”](https://www.daytona.io/docs/en/ruby-sdk/image/#add_local_dir)

```
def add_local_dir(local_path, remote_path)
```

Adds a local directory to the image

**Parameters**:

- `local_path` _String_ \- The path to the local directory
- `remote_path` _String_ \- The path to the directory in the image

**Returns**:

- `Image` \- The image with the local directory added

**Examples:**

```
image = Image.debian_slim("3.12").add_local_dir("src", "/home/daytona/src")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#run_commands) run\_commands()

[Section titled “run\_commands()”](https://www.daytona.io/docs/en/ruby-sdk/image/#run_commands)

```
def run_commands(*commands)
```

Runs commands in the image

**Parameters**:

- `commands` _Array<String>_ \- The commands to run

**Returns**:

- `Image` \- The image with the commands added

**Examples:**

```
image = Image.debian_slim("3.12").run_commands('echo "Hello, world!"', 'echo "Hello again!"')
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#env) env()

[Section titled “env()”](https://www.daytona.io/docs/en/ruby-sdk/image/#env)

```
def env(env_vars)
```

Sets environment variables in the image

**Parameters**:

- `env_vars` _Hash<String, String>_ \- The environment variables to set

**Returns**:

- `Image` \- The image with the environment variables added

**Raises**:

- `Sdk:Error` -

**Examples:**

```
image = Image.debian_slim("3.12").env({"PROJECT_ROOT" => "/home/daytona"})
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#workdir) workdir()

[Section titled “workdir()”](https://www.daytona.io/docs/en/ruby-sdk/image/#workdir)

```
def workdir(path)
```

Sets the working directory in the image

**Parameters**:

- `path` _String_ \- The path to the working directory

**Returns**:

- `Image` \- The image with the working directory added

**Examples:**

```
image = Image.debian_slim("3.12").workdir("/home/daytona")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#entrypoint) entrypoint()

[Section titled “entrypoint()”](https://www.daytona.io/docs/en/ruby-sdk/image/#entrypoint)

```
def entrypoint(entrypoint_commands)
```

Sets the entrypoint for the image

**Parameters**:

- `entrypoint_commands` _Array<String>_ \- The commands to set as the entrypoint

**Returns**:

- `Image` \- The image with the entrypoint added

**Examples:**

```
image = Image.debian_slim("3.12").entrypoint(["/bin/bash"])
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#cmd) cmd()

[Section titled “cmd()”](https://www.daytona.io/docs/en/ruby-sdk/image/#cmd)

```
def cmd(cmd)
```

Sets the default command for the image

**Parameters**:

- `cmd` _Array<String>_ \- The commands to set as the default command

**Returns**:

- `Image` \- The image with the default command added

**Examples:**

```
image = Image.debian_slim("3.12").cmd(["/bin/bash"])
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/image/\#dockerfile_commands) dockerfile\_commands()

[Section titled “dockerfile\_commands()”](https://www.daytona.io/docs/en/ruby-sdk/image/#dockerfile_commands)

```
def dockerfile_commands(dockerfile_commands, context_dir: nil)
```

Adds arbitrary Dockerfile-like commands to the image

**Parameters**:

- `dockerfile_commands` _Array<String>_ \- The commands to add to the Dockerfile
- `context_dir` _String, nil_ \- The path to the context directory

**Returns**:

- `Image` \- The image with the Dockerfile commands added

**Examples:**

```
image = Image.debian_slim("3.12").dockerfile_commands(["RUN echo 'Hello, world!'"])
```