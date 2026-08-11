---
url: "https://www.daytona.io/docs/en/ruby-sdk/file-system/"
title: "FileSystem | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/file-system/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/file-system.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#filesystem) FileSystem

[Section titled “FileSystem”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#filesystem)

Main class for a new FileSystem instance.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#new-filesystem) new FileSystem()

[Section titled “new FileSystem()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#new-filesystem)

```
def initialize(sandbox_id:, toolbox_api:, otel_state: nil)
```

Initializes a new FileSystem instance.

**Parameters**:

- `sandbox_id` _String_ \- The Sandbox ID
- `toolbox_api` _DaytonaToolboxApiClient:FileSystemApi_ \- API client for Sandbox operations
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `FileSystem` \- a new instance of FileSystem

### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#sandbox_id) sandbox\_id()

[Section titled “sandbox\_id()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#sandbox_id)

```
def sandbox_id()
```

**Returns**:

- `String` \- The Sandbox ID

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#toolbox_api) toolbox\_api()

[Section titled “toolbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#toolbox_api)

```
def toolbox_api()
```

**Returns**:

- `DaytonaToolboxApiClient:FileSystemApi` \- API client for Sandbox operations

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#create_folder) create\_folder()

[Section titled “create\_folder()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#create_folder)

```
def create_folder(path, mode)
```

Creates a new directory in the Sandbox at the specified path with the given
permissions.

**Parameters**:

- `path` _String_ \- Path where the folder should be created. Relative paths are resolved based
on the sandbox working directory.
- `mode` _String_ \- Folder permissions in octal format (e.g., “755” for rwxr-xr-x).

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Create a directory with standard permissions

sandbox.fs.create_folder("workspace/data", "755")

# Create a private directory

sandbox.fs.create_folder("workspace/secrets", "700")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#delete_file) delete\_file()

[Section titled “delete\_file()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#delete_file)

```
def delete_file(path, recursive: false)
```

Deletes a file from the Sandbox.

**Parameters**:

- `path` _String_ \- Path to the file to delete. Relative paths are resolved based on the sandbox working directory.
- `recursive` _Boolean_ \- If the file is a directory, this must be true to delete it.

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Delete a file

sandbox.fs.delete_file("workspace/data/old_file.txt")

# Delete a directory recursively

sandbox.fs.delete_file("workspace/old_dir", recursive: true)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#get_file_info) get\_file\_info()

[Section titled “get\_file\_info()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#get_file_info)

```
def get_file_info(path)
```

Gets detailed information about a file or directory, including its
size, permissions, and timestamps.

**Parameters**:

- `path` _String_ \- Path to the file or directory. Relative paths are resolved based
on the sandbox working directory.

**Returns**:

- `DaytonaApiClient:FileInfo` \- Detailed file information

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Get file metadata

info = sandbox.fs.get_file_info("workspace/data/file.txt")

puts "Size: #{info.size} bytes"

puts "Modified: #{info.mod_time}"

puts "Mode: #{info.mode}"

# Check if path is a directory

info = sandbox.fs.get_file_info("workspace/data")

puts "Path is a directory" if info.is_dir
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#list_files) list\_files()

[Section titled “list\_files()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#list_files)

```
def list_files(path, depth: nil)
```

Lists files and directories in a given path and returns their information, similar to the ls -l command.

**Parameters**:

- `path` _String_ \- Path to the directory to list contents from. Relative paths are resolved
based on the sandbox working directory.
- `depth` _Integer, nil_ \- How many levels deep to list. depth=1 (default) lists the
directory’s entries, depth=2 also includes their children, and so on. Must be >= 1.
Each returned FileInfo carries a full path field.

**Returns**:

- `Array\<DaytonaApiClient:FileInfo\>` \- List of file and directory information

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# List directory contents

files = sandbox.fs.list_files("workspace/data")

# Print files and their sizes

files.each do |file|

  puts "#{file.name}: #{file.size} bytes" unless file.is_dir

end

# List only directories

dirs = files.select(&:is_dir)

puts "Subdirectories: #{dirs.map(&:name).join(', ')}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#download_file) download\_file()

[Section titled “download\_file()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#download_file)

```
def download_file(remote_path, local_path = nil)
```

Downloads a file from the Sandbox. Returns the file contents as a string.
This method is useful when you want to load the file into memory without saving it to disk.
It can only be used for smaller files.

**Parameters**:

- `remote_path` _String_ \- Path to the file in the Sandbox. Relative paths are resolved based
on the sandbox working directory.
- `local_path` _String, nil_ \- Optional path to save the file locally. If provided, the file will be saved to disk.

**Returns**:

- `File, nil` \- The file if local\_path is nil, otherwise nil

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Download and get file content

content = sandbox.fs.download_file("workspace/data/file.txt")

puts content

# Download and save a file locally

sandbox.fs.download_file("workspace/data/file.txt", "local_copy.txt")

size_mb = File.size("local_copy.txt") / 1024.0 / 1024.0

puts "Size of the downloaded file: #{size_mb} MB"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#download_file_stream) download\_file\_stream()

[Section titled “download\_file\_stream()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#download_file_stream)

```
def download_file_stream(remote_path, timeout: 30 * 60, on_progress: nil, cancel_event: nil)
```

Downloads a single file from the Sandbox as a stream without buffering the entire
file into memory. Yields file content in chunks to the given block, or returns an
Enumerator if no block is given.

**Parameters**:

- `remote_path` _String_ \- Path to the file in the Sandbox. Relative paths are resolved
based on the sandbox working directory.
- `timeout` _Integer_ \- Timeout for the download operation in seconds. 0 means no timeout.
Default is 30 minutes.
- `on_progress` _Proc, nil_ \- Optional callback invoked with a Daytona::DownloadProgress
struct containing bytes\_received (Integer) and total\_bytes (Integer or nil).
- `cancel_event` _#set?, nil_ \- Optional cancellation token (anything responding to +set?+;
the standard library’s +Concurrent::Event+ or a small ad-hoc object both work). When set
during streaming, the next chunk raises Daytona::Sdk::Error and the underlying HTTP
connection is torn down.

**Returns**:

- `Enumerator, nil` \- An Enumerator yielding chunks if no block given, nil otherwise

**Raises**:

- `Daytona:Sdk:Error` \- If the file does not exist, the operation fails, or
+cancel\_event+ is set during streaming

**Examples:**

```
File.open("local_copy.bin", "wb") do |f|

  sandbox.fs.download_file_stream("workspace/large-file.bin") { |chunk| f.write(chunk) }

end
```

```
content = sandbox.fs.download_file_stream("workspace/data.json").reduce(:+)

puts content
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#upload_file) upload\_file()

[Section titled “upload\_file()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#upload_file)

```
def upload_file(source, remote_path)
```

Uploads a file to the specified path in the Sandbox. If a file already exists at
the destination path, it will be overwritten.

**Parameters**:

- `source` _String, IO_ \- File contents as a string/bytes or a local file path or IO object.
- `remote_path` _String_ \- Path to the destination file. Relative paths are resolved based on
the sandbox working directory.

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Upload a text file from string content

content = "Hello, World!"

sandbox.fs.upload_file(content, "tmp/hello.txt")

# Upload a local file

sandbox.fs.upload_file("local_file.txt", "tmp/file.txt")

# Upload binary data

data = { key: "value" }.to_json

sandbox.fs.upload_file(data, "tmp/config.json")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#upload_file_stream) upload\_file\_stream()

[Section titled “upload\_file\_stream()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#upload_file_stream)

```
def upload_file_stream(source, remote_path, timeout: 30 * 60, on_progress: nil, cancel_event: nil)
```

Streams +source+ to the Sandbox without buffering its contents in memory, with
optional progress reporting.

**Parameters**:

- `source` _String, IO_ \- A local file path or any IO-like object responding to
+read(n)+. Strings that don’t reference an existing file are uploaded as their
raw bytes (still streamed, just from memory).
- `remote_path` _String_ \- Destination path in the Sandbox.
- `timeout` _Integer_ \- Timeout in seconds. 0 means no timeout. Default 30 minutes.
- `on_progress` _Proc, nil_ \- Optional callback invoked with a
+Daytona::UploadProgress+ struct as libcurl reports bytes actually uploaded.
- `cancel_event` _#set?, nil_ \- Optional cancellation token. When set while
staging a non-file source or during the libcurl upload, the operation raises
Daytona::Sdk::Error and the in-progress upload is aborted (no destination file
is left on the sandbox thanks to the daemon’s atomic-rename behaviour).

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails or +cancel\_event+ is set.

**Examples:**

```
File.open("large.bin", "rb") do |f|

  sandbox.fs.upload_file_stream(f, "tmp/large.bin",

    on_progress: ->(p) { puts "#{p.bytes_sent} bytes sent" })

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#upload_files) upload\_files()

[Section titled “upload\_files()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#upload_files)

```
def upload_files(files)
```

Uploads multiple files to the Sandbox. If files already exist at the destination paths,
they will be overwritten.

**Parameters**:

- `files` _Array<FileUpload>_ \- List of files to upload.

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Upload multiple files

files = [\
\
  FileUpload.new("Content of file 1", "/tmp/file1.txt"),\
\
  FileUpload.new("workspace/data/file2.txt", "/tmp/file2.txt"),\
\
  FileUpload.new('{"key": "value"}', "/tmp/config.json")\
\
]

sandbox.fs.upload_files(files)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#find_files) find\_files()

[Section titled “find\_files()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#find_files)

```
def find_files(path, pattern)
```

Searches for files containing a pattern, similar to the grep command.

**Parameters**:

- `path` _String_ \- Path to the file or directory to search. If the path is a directory,
the search will be performed recursively. Relative paths are resolved based
on the sandbox working directory.
- `pattern` _String_ \- Search pattern to match against file contents.

**Returns**:

- `Array\<DaytonaApiClient:Match\>` \- List of matches found in files

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Search for TODOs in Ruby files

matches = sandbox.fs.find_files("workspace/src", "TODO:")

matches.each do |match|

  puts "#{match.file}:#{match.line}: #{match.content.strip}"

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#search_files) search\_files()

[Section titled “search\_files()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#search_files)

```
def search_files(path, pattern)
```

Searches for files and directories whose names match the specified pattern.
The pattern can be a simple string or a glob pattern.

**Parameters**:

- `path` _String_ \- Path to the root directory to start search from. Relative paths are resolved
based on the sandbox working directory.
- `pattern` _String_ \- Pattern to match against file names. Supports glob
patterns (e.g., “\*.rb” for Ruby files).

**Returns**:

- `DaytonaApiClient:SearchFilesResponse`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Find all Ruby files

result = sandbox.fs.search_files("workspace", "*.rb")

result.files.each { |file| puts file }

# Find files with specific prefix

result = sandbox.fs.search_files("workspace/data", "test_*")

puts "Found #{result.files.length} test files"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#move_files) move\_files()

[Section titled “move\_files()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#move_files)

```
def move_files(source, destination)
```

Moves or renames a file or directory. The parent directory of the destination must exist.

**Parameters**:

- `source` _String_ \- Path to the source file or directory. Relative paths are resolved
based on the sandbox working directory.
- `destination` _String_ \- Path to the destination. Relative paths are resolved based on
the sandbox working directory.

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Rename a file

sandbox.fs.move_files(

  "workspace/data/old_name.txt",

  "workspace/data/new_name.txt"

)

# Move a file to a different directory

sandbox.fs.move_files(

  "workspace/data/file.txt",

  "workspace/archive/file.txt"

)

# Move a directory

sandbox.fs.move_files(

  "workspace/old_dir",

  "workspace/new_dir"

)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#replace_in_files) replace\_in\_files()

[Section titled “replace\_in\_files()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#replace_in_files)

```
def replace_in_files(files:, pattern:, new_value:)
```

Performs search and replace operations across multiple files.

**Parameters**:

- `files` _Array<String>_ \- List of file paths to perform replacements in. Relative paths are
resolved based on the sandbox working directory.
- `pattern` _String_ \- Pattern to search for.
- `new_value` _String_ \- Text to replace matches with.

**Returns**:

- `Array\<DaytonaApiClient:ReplaceResult\>` \- List of results indicating replacements made in each file

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Replace in specific files

results = sandbox.fs.replace_in_files(

  files: ["workspace/src/file1.rb", "workspace/src/file2.rb"],

  pattern: "old_function",

  new_value: "new_function"

)

# Print results

results.each do |result|

  if result.success

    puts "#{result.file}: #{result.success}"

  else

    puts "#{result.file}: #{result.error}"

  end

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/file-system/\#set_file_permissions) set\_file\_permissions()

[Section titled “set\_file\_permissions()”](https://www.daytona.io/docs/en/ruby-sdk/file-system/#set_file_permissions)

```
def set_file_permissions(path:, mode: nil, owner: nil, group: nil)
```

Sets permissions and ownership for a file or directory. Any of the parameters can be nil
to leave that attribute unchanged.

**Parameters**:

- `path` _String_ \- Path to the file or directory. Relative paths are resolved based on
the sandbox working directory.
- `mode` _String, nil_ \- File mode/permissions in octal format (e.g., “644” for rw-r—r—).
- `owner` _String, nil_ \- User owner of the file.
- `group` _String, nil_ \- Group owner of the file.

**Returns**:

- `void`

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
# Make a file executable

sandbox.fs.set_file_permissions(

  path: "workspace/scripts/run.sh",

  mode: "755"  # rwxr-xr-x

)

# Change file owner

sandbox.fs.set_file_permissions(

  path: "workspace/data/file.txt",

  owner: "daytona",

  group: "daytona"

)
```