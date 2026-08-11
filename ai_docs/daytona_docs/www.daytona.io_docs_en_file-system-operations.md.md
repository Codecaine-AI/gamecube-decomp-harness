---
url: "https://www.daytona.io/docs/en/file-system-operations.md"
title: undefined
---

# File System Operations

File system operations are available through the `fs` module of a sandbox. Each sandbox has its own isolated filesystem, and operations run through the Daytona API, so your application manages files in a sandbox directly, without executing shell commands inside it.

The `fs` module covers listing directories, reading file metadata, creating directories, uploading and downloading files, setting permissions, searching file contents, and moving, renaming, or deleting files. Uploads and downloads can stream to and from local paths, so large files transfer without being loaded into memory.

## Basic operations

Daytona provides methods to interact with the file system in sandboxes. You can perform various operations like listing files, creating directories, reading and writing files, and more.

File operations assume you are operating in the sandbox user's home directory (e.g. `workspace` implies `/home/[username]/workspace`). Use a leading `/` when providing absolute paths.

### List files and directories

List files and directories in a sandbox by providing the path to the directory.


```python
# List files in a directory
files = sandbox.fs.list_files("workspace")

for file in files:
    print(f"Name: {file.name}")
    print(f"Is directory: {file.is_dir}")
    print(f"Size: {file.size}")
    print(f"Modified: {file.mod_time}")
```


```typescript
// List files in a directory
const files = await sandbox.fs.listFiles('workspace')

files.forEach(file => {
  console.log(`Name: ${file.name}`)
  console.log(`Is directory: ${file.isDir}`)
  console.log(`Size: ${file.size}`)
  console.log(`Modified: ${file.modTime}`)
})
```


```ruby
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


```go
// List files in a directory
files, err := sandbox.FileSystem.ListFiles(ctx, "workspace")
if err != nil {
	log.Fatal(err)
}

for _, file := range files {
	fmt.Printf("Name: %s\n", file.Name)
	fmt.Printf("Is directory: %t\n", file.IsDirectory)
	fmt.Printf("Size: %d\n", file.Size)
	fmt.Printf("Modified: %s\n", file.ModifiedTime)
}
```


```java
import io.daytona.sdk.model.FileInfo;
import java.util.List;

List<FileInfo> files = sandbox.fs.listFiles("workspace");
for (FileInfo file : files) {
    System.out.println("Name: " + file.getName());
    System.out.println("Is directory: " + file.getIsDir());
    System.out.println("Size: " + file.getSize());
    System.out.println("Modified: " + file.getModTime());
}
```


```bash
# List one directory level (default depth=1)
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files?path=workspace'

# List recursively: depth=2 includes immediate children
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files?path=workspace&depth=2'
```


### Get directory or file information

Get directory or file information by providing the path to the directory or file.


```python
# Get file metadata
info = sandbox.fs.get_file_info("workspace/data/file.txt")
print(f"Size: {info.size} bytes")
print(f"Modified: {info.mod_time}")
print(f"Mode: {info.mode}")

# Check if path is a directory
info = sandbox.fs.get_file_info("workspace/data")
if info.is_dir:
    print("Path is a directory")
```


```typescript
// Get file details
const info = await sandbox.fs.getFileDetails('app/config.json')
console.log(`Size: ${info.size}, Modified: ${info.modifiedAt ?? info.modTime}`)
```


```ruby
# Get file metadata
info = sandbox.fs.get_file_info("workspace/data/file.txt")
puts "Size: #{info.size} bytes"
puts "Modified: #{info.mod_time}"
puts "Mode: #{info.mode}"

# Check if path is a directory
info = sandbox.fs.get_file_info("workspace/data")
puts "Path is a directory" if info.is_dir
```


```go
// Get file metadata
info, err := sandbox.FileSystem.GetFileInfo(ctx, "workspace/data/file.txt")
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Size: %d bytes\n", info.Size)
fmt.Printf("Modified: %s\n", info.ModifiedTime)
fmt.Printf("Mode: %s\n", info.Mode)

// Check if path is a directory
info, err = sandbox.FileSystem.GetFileInfo(ctx, "workspace/data")
if err != nil {
	log.Fatal(err)
}
if info.IsDirectory {
	fmt.Println("Path is a directory")
}
```


```java
import io.daytona.sdk.model.FileInfo;

FileInfo info = sandbox.fs.getFileDetails("workspace/data/file.txt");
System.out.println("Size: " + info.getSize() + " bytes");
System.out.println("Modified: " + info.getModTime());
System.out.println("Mode: " + info.getMode());

info = sandbox.fs.getFileDetails("workspace/data");
if (Boolean.TRUE.equals(info.getIsDir())) {
    System.out.println("Path is a directory");
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/info?path='
```


### Create directories

Create a directory by providing the path and permissions to set on the directory.


```python
# Create with specific permissions
sandbox.fs.create_folder("workspace/new-dir", "755")
```


```typescript
// Create with specific permissions
await sandbox.fs.createFolder('workspace/new-dir', '755')
```


```ruby
# Create a directory with standard permissions
sandbox.fs.create_folder("workspace/data", "755")

# Create a private directory
sandbox.fs.create_folder("workspace/secrets", "700")
```


```go
// Create with specific permissions
err := sandbox.FileSystem.CreateFolder(ctx, "workspace/new-dir",
	options.WithMode("755"),
)
if err != nil {
	log.Fatal(err)
}
```


```java
sandbox.fs.createFolder("workspace/new-dir", "755");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/folder?path=&mode=' \
  --request POST
```


### Upload files

Daytona provides methods to upload a single or multiple files in sandboxes.

#### Upload a single file

Upload a single file by providing the content to upload and the path to the file to upload it to.


```python
# Upload from memory (small files)
content = b"Hello, World!"
sandbox.fs.upload_file(content, "remote_file.txt")

# Upload from a local file path (streams large files)
sandbox.fs.upload_file("local_file.txt", "remote_file.txt")
```


```typescript
// Upload a single file
const fileContent = Buffer.from('Hello, World!')
await sandbox.fs.uploadFile(fileContent, 'data.txt')
```


```ruby
# Upload a text file from string content
content = "Hello, World!"
sandbox.fs.upload_file(content, "tmp/hello.txt")

# Upload a local file
sandbox.fs.upload_file("local_file.txt", "tmp/file.txt")

# Upload binary data
data = { key: "value" }.to_json
sandbox.fs.upload_file(data, "tmp/config.json")
```


```go
// Upload from a local file path
err := sandbox.FileSystem.UploadFile(ctx, "local_file.txt", "remote_file.txt")
if err != nil {
	log.Fatal(err)
}

// Or upload from byte content
content := []byte("Hello, World!")
err = sandbox.FileSystem.UploadFile(ctx, content, "hello.txt")
if err != nil {
	log.Fatal(err)
}
```


```java
import java.nio.charset.StandardCharsets;

byte[] fileContent = "Hello, World!".getBytes(StandardCharsets.UTF_8);
sandbox.fs.uploadFile(fileContent, "data.txt");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/upload?path=' \
  --request POST \
  --header 'Content-Type: multipart/form-data' \
  --form 'file='
```


#### Upload multiple files

Upload multiple files by providing the content to upload and their destination paths.


```python
# Upload multiple files at once
files_to_upload = []

with open("file1.txt", "rb") as f1:
    files_to_upload.append(FileUpload(
        source=f1.read(),
        destination="data/file1.txt",
    ))

with open("file2.txt", "rb") as f2:
    files_to_upload.append(FileUpload(
        source=f2.read(),
        destination="data/file2.txt",
    ))

with open("settings.json", "rb") as f3:
    files_to_upload.append(FileUpload(
        source=f3.read(),
        destination="config/settings.json",
    ))

sandbox.fs.upload_files(files_to_upload)
```


```typescript
// Upload multiple files at once
const files = [
  {
    source: Buffer.from('Content of file 1'),
    destination: 'data/file1.txt',
  },
  {
    source: Buffer.from('Content of file 2'),
    destination: 'data/file2.txt',
  },
  {
    source: Buffer.from('{"key": "value"}'),
    destination: 'config/settings.json',
  },
]

await sandbox.fs.uploadFiles(files)
```


```ruby
# Upload multiple files
files = [
  FileUpload.new("Content of file 1", "/tmp/file1.txt"),
  FileUpload.new("workspace/data/file2.txt", "/tmp/file2.txt"),
  FileUpload.new('{"key": "value"}', "/tmp/config.json")
]

sandbox.fs.upload_files(files)
```


```go
// Upload multiple files by calling UploadFile for each
filesToUpload := []struct {
	source      string
	destination string
}{
	{"file1.txt", "data/file1.txt"},
	{"file2.txt", "data/file2.txt"},
	{"settings.json", "config/settings.json"},
}

for _, f := range filesToUpload {
	err := sandbox.FileSystem.UploadFile(ctx, f.source, f.destination)
	if err != nil {
		log.Fatal(err)
	}
}
```


```java
import java.nio.charset.StandardCharsets;

sandbox.fs.uploadFile("Hello, World!".getBytes(StandardCharsets.UTF_8), "data/file1.txt");
sandbox.fs.uploadFile("More content".getBytes(StandardCharsets.UTF_8), "data/file2.txt");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/bulk-upload' \
  --request POST
```


#### Stream uploads

For large files, use streaming upload methods to avoid loading the entire file into memory.


```python
with open("large_dataset.csv", "rb") as f:
    sandbox.fs.upload_file_stream(f, "workspace/dataset.csv")
```


```typescript
import { createReadStream } from 'node:fs'

await sandbox.fs.uploadFileStream(
  createReadStream('large_dataset.csv'),
  'workspace/dataset.csv'
)
```


```ruby
File.open("large_dataset.csv", "rb") do |f|
  sandbox.fs.upload_file_stream(f, "workspace/dataset.csv")
end
```


```go
f, err := os.Open("large_dataset.csv")
if err != nil {
	log.Fatal(err)
}
defer f.Close()

err = sandbox.FileSystem.UploadFileStream(ctx, f, "workspace/dataset.csv")
if err != nil {
	log.Fatal(err)
}
```


```java
import java.io.FileInputStream;
import java.nio.file.Path;

try (var in = new FileInputStream(Path.of("large_dataset.csv").toFile())) {
    sandbox.fs.uploadFileStream(in, "workspace/dataset.csv");
}
```


### Download files

Daytona provides methods to download files from sandboxes.

#### Download a single file

Download a single file by providing the path to the file to download.


```python
from daytona import DaytonaNotFoundError

try:
    content = sandbox.fs.download_file("file1.txt")
except DaytonaNotFoundError as error:
    print(f"Missing file: {error}")
else:
    with open("local_file.txt", "wb") as f:
        f.write(content)

    print(content.decode("utf-8"))

# Stream a large file to disk without loading it into memory
sandbox.fs.download_file("workspace/large-file.bin", "local_copy.bin")
```


```typescript
import { DaytonaNotFoundError } from '@daytona/sdk'

try {
  const downloadedFile = await sandbox.fs.downloadFile('file1.txt')
  console.log('File content:', downloadedFile.toString())
} catch (error) {
  if (error instanceof DaytonaNotFoundError) {
    console.error(`Missing file: ${error.message}`)
  } else {
    throw error
  }
}
```


```ruby
# Download and get file content
content = sandbox.fs.download_file("workspace/data/file.txt")
puts content

# Download and save a file locally
sandbox.fs.download_file("workspace/data/file.txt", "local_copy.txt")
size_mb = File.size("local_copy.txt") / 1024.0 / 1024.0
puts "Size of the downloaded file: #{size_mb} MB"
```


```go
// Download and get contents in memory
content, err := sandbox.FileSystem.DownloadFile(ctx, "file1.txt", nil)
if err != nil {
	log.Fatal(err)
}
fmt.Println(string(content))

// Download and save to a local file
localPath := "local_file.txt"
content, err = sandbox.FileSystem.DownloadFile(ctx, "file1.txt", &localPath)
if err != nil {
	log.Fatal(err)
}
```


```java
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

byte[] content = sandbox.fs.downloadFile("file1.txt");
System.out.println(new String(content, StandardCharsets.UTF_8));

Files.write(Path.of("local_file.txt"), content);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/download?path='
```


#### Download multiple files

Download multiple files by providing the paths to the files to download.


```python
# Download multiple files at once
files_to_download = [
    FileDownloadRequest(source="data/file1.txt"), # No destination - download to memory
    FileDownloadRequest(source="data/file2.txt", destination="local_file2.txt"), # Download to local file
]

results = sandbox.fs.download_files(files_to_download)

for result in results:
    if result.error:
        print(f"Error downloading {result.source}: {result.error}")
        if result.error_details:
            print(
                f"  status={result.error_details.status_code} "
                f"code={result.error_details.error_code}"
            )
    elif result.result:
        print(f"Downloaded {result.source} to {result.result}")
```


```typescript
// Download multiple files at once
const files = [
  { source: 'data/file1.txt' }, // No destination - download to memory
  { source: 'data/file2.txt', destination: 'local_file2.txt' }, // Download to local file
]

const results = await sandbox.fs.downloadFiles(files)

results.forEach(result => {
  if (result.error) {
    console.error(`Error downloading ${result.source}: ${result.error}`)
    if (result.errorDetails) {
      console.error(
        `  status=${result.errorDetails.statusCode} code=${result.errorDetails.errorCode}`
      )
    }
  } else if (result.result) {
    console.log(`Downloaded ${result.source} to ${result.result}`)
  }
})
```


```ruby
# Download multiple files by calling download_file for each
files_to_download = [
  { remote: "data/file1.txt", local: nil },              # Download to memory
  { remote: "data/file2.txt", local: "local_file2.txt" } # Download to local file
]

files_to_download.each do |f|
  if f[:local]
    sandbox.fs.download_file(f[:remote], f[:local])
    puts "Downloaded #{f[:remote]} to #{f[:local]}"
  else
    content = sandbox.fs.download_file(f[:remote])
    puts "Downloaded #{f[:remote]} to memory (#{content.size} bytes)"
  end
end
```


```go
// Download multiple files by calling DownloadFile for each
filesToDownload := []struct {
	remotePath string
	localPath  *string
}{
	{"data/file1.txt", nil},                           // Download to memory
	{"data/file2.txt", ptrString("local_file2.txt")},  // Download to local file
}

for _, f := range filesToDownload {
	content, err := sandbox.FileSystem.DownloadFile(ctx, f.remotePath, f.localPath)
	if err != nil {
		fmt.Printf("Error downloading %s: %v\n", f.remotePath, err)
		continue
	}
	if f.localPath == nil {
		fmt.Printf("Downloaded %s to memory (%d bytes)\n", f.remotePath, len(content))
	} else {
		fmt.Printf("Downloaded %s to %s\n", f.remotePath, *f.localPath)
	}
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/bulk-download' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "paths": [
    ""
  ]
}'
```


#### Stream downloads

For large files, use streaming download methods to avoid loading the entire file into memory.


```python
with open("local_copy.bin", "wb") as f:
    for chunk in sandbox.fs.download_file_stream("workspace/large-file.bin"):
        f.write(chunk)
```


```typescript
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const stream = await sandbox.fs.downloadFileStream('workspace/large-file.bin')
await pipeline(stream, createWriteStream('local_copy.bin'))
```


```ruby
File.open("local_copy.bin", "wb") do |f|
  sandbox.fs.download_file_stream("workspace/large-file.bin") { |chunk| f.write(chunk) }
end
```


```go
stream, err := sandbox.FileSystem.DownloadFileStream(ctx, "workspace/large-file.bin")
if err != nil {
	log.Fatal(err)
}
defer stream.Close()

out, err := os.Create("local_copy.bin")
if err != nil {
	log.Fatal(err)
}
defer out.Close()

_, err = io.Copy(out, stream)
if err != nil {
	log.Fatal(err)
}
```


```java
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Path;

try (InputStream in = sandbox.fs.downloadFileStream("workspace/large-file.bin");
     var out = new FileOutputStream(Path.of("local_copy.bin").toFile())) {
    in.transferTo(out);
}
```


### Delete files

Delete a file or directory by providing the path to the file or directory to delete. 

Pass `recursive: true` to delete a directory recursively.


```python
sandbox.fs.delete_file("workspace/file.txt")

# Delete a directory recursively
sandbox.fs.delete_file("workspace/old_dir", recursive=True)
```


```typescript
await sandbox.fs.deleteFile('workspace/file.txt')

// Delete a directory recursively
await sandbox.fs.deleteFile('workspace/old_dir', true)
```


```ruby
# Delete a file
sandbox.fs.delete_file("workspace/data/old_file.txt")

# Delete a directory recursively
sandbox.fs.delete_file("workspace/old_dir", recursive: true)
```


```go
// Delete a file
err := sandbox.FileSystem.DeleteFile(ctx, "workspace/file.txt", false)
if err != nil {
	log.Fatal(err)
}

// Delete a directory recursively
err = sandbox.FileSystem.DeleteFile(ctx, "workspace/old_dir", true)
if err != nil {
	log.Fatal(err)
}
```


```java
sandbox.fs.deleteFile("workspace/file.txt");
```


```bash
# Delete a file
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files?path=workspace/file.txt' \
  --request DELETE

# Delete a directory recursively
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files?path=workspace/old_dir&recursive=true' \
  --request DELETE
```


## Advanced operations

Daytona provides advanced file system operations such as file permissions, search by file name, content search and replace, and move files.

### File permissions

Set file permissions, ownership, and group for a file or directory by providing the path to the file or directory and the permissions to set.


```python
# Set file permissions
sandbox.fs.set_file_permissions("workspace/file.txt", "644")

# Get file permissions
file_info = sandbox.fs.get_file_info("workspace/file.txt")
print(f"Permissions: {file_info.permissions}")
```


```typescript
// Set file permissions
await sandbox.fs.setFilePermissions('workspace/file.txt', { mode: '644' })

// Get file permissions
const fileInfo = await sandbox.fs.getFileDetails('workspace/file.txt')
console.log(`Permissions: ${fileInfo.permissions}`)
```


```ruby
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


```go
// Set file permissions
err := sandbox.FileSystem.SetFilePermissions(ctx, "workspace/file.txt",
	options.WithPermissionMode("644"),
)
if err != nil {
	log.Fatal(err)
}

// Set owner and group
err = sandbox.FileSystem.SetFilePermissions(ctx, "workspace/file.txt",
	options.WithOwner("daytona"),
	options.WithGroup("daytona"),
)
if err != nil {
	log.Fatal(err)
}

// Get file info to check permissions
fileInfo, err := sandbox.FileSystem.GetFileInfo(ctx, "workspace/file.txt")
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Mode: %s\n", fileInfo.Mode)
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/permissions?path=' \
  --request POST
```


### Search files by pattern

Search for files and directories by name using glob patterns (for example `*.py`). This is distinct from `find_files` / `findFiles`, which searches file contents.


```python
result = sandbox.fs.search_files("workspace", "*.py")
for file in result.files:
    print(file)
```


```typescript
const result = await sandbox.fs.searchFiles('workspace', '*.ts')
result.files.forEach(file => console.log(file))
```


```ruby
result = sandbox.fs.search_files("workspace", "*.rb")
result.files.each { |file| puts file }
```


```go
result, err := sandbox.FileSystem.SearchFiles(ctx, "workspace", "*.go")
if err != nil {
	log.Fatal(err)
}
files := result.(map[string]any)["files"].([]string)
for _, file := range files {
	fmt.Println(file)
}
```


```java
import java.util.List;
import java.util.Map;

Map<String, Object> result = sandbox.fs.searchFiles("workspace", "*.java");
@SuppressWarnings("unchecked")
List<String> files = (List<String>) result.get("files");
for (String file : files) {
    System.out.println(file);
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/search?path=workspace&pattern=*.py'
```


### Find and replace text in files

Find and replace text in files by providing the path to the directory to search in and the pattern to search for.


```python
# Search for text in files by providing the path to the directory to search in and the pattern to search for
results = sandbox.fs.find_files(
    path="workspace/src",
    pattern="text-of-interest"
)
for match in results:
    print(f"Absolute file path: {match.file}")
    print(f"Line number: {match.line}")
    print(f"Line content: {match.content}")
    print("\n")

# Replace text in files
sandbox.fs.replace_in_files(
    files=["workspace/file1.txt", "workspace/file2.txt"],
    pattern="old_text",
    new_value="new_text"
)
```


```typescript
// Search for text in files; if a folder is specified, the search is recursive
const results = await sandbox.fs.findFiles('workspace/src', 'text-of-interest')
results.forEach(match => {
  console.log('Absolute file path:', match.file)
  console.log('Line number:', match.line)
  console.log('Line content:', match.content)
})

// Replace text in files
await sandbox.fs.replaceInFiles(
    ["workspace/file1.txt", "workspace/file2.txt"],
    "old_text",
    "new_text"
)
```


```ruby
# Search for TODOs in Ruby files
matches = sandbox.fs.find_files("workspace/src", "TODO:")
matches.each do |match|
  puts "#{match.file}:#{match.line}: #{match.content.strip}"
end

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


```go
// Search for text in files
result, err := sandbox.FileSystem.FindFiles(ctx, "workspace/src", "text-of-interest")
if err != nil {
	log.Fatal(err)
}
matches := result.([]map[string]any)
for _, match := range matches {
	fmt.Printf("Absolute file path: %s\n", match["file"])
	fmt.Printf("Line number: %v\n", match["line"])
	fmt.Printf("Line content: %s\n\n", match["content"])
}

// Replace text in files
_, err = sandbox.FileSystem.ReplaceInFiles(ctx,
	[]string{"workspace/file1.txt", "workspace/file2.txt"},
	"old_text",
	"new_text",
)
if err != nil {
	log.Fatal(err)
}
```


```java
import java.util.Arrays;
import java.util.List;
import java.util.Map;

List<Map<String, Object>> results = sandbox.fs.findFiles("workspace/src", "text-of-interest");
for (Map<String, Object> match : results) {
    System.out.println("Absolute file path: " + match.get("file"));
    System.out.println("Line number: " + match.get("line"));
    System.out.println("Line content: " + match.get("content"));
    System.out.println();
}

sandbox.fs.replaceInFiles(
    Arrays.asList("workspace/file1.txt", "workspace/file2.txt"),
    "old_text",
    "new_text"
);
```


Find text in files:

```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/find?path=&pattern='
```

Replace text in files:

```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/replace' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "files": [
    ""
  ],
  "newValue": "",
  "pattern": ""
}'
```


### Move or rename directory or file

Move or rename a directory or file by providing the path to the file or directory (source) and the new path to the file or directory (destination).


```python
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


```typescript
// Move a file to a new location
await sandbox.fs.moveFiles('app/temp/data.json', 'app/data/data.json')
```


```ruby
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


```go
// Rename a file
err := sandbox.FileSystem.MoveFiles(ctx, "workspace/data/old_name.txt", "workspace/data/new_name.txt")
if err != nil {
	log.Fatal(err)
}

// Move a file to a different directory
err = sandbox.FileSystem.MoveFiles(ctx, "workspace/data/file.txt", "workspace/archive/file.txt")
if err != nil {
	log.Fatal(err)
}

// Move a directory
err = sandbox.FileSystem.MoveFiles(ctx, "workspace/old_dir", "workspace/new_dir")
if err != nil {
	log.Fatal(err)
}
```


```java
sandbox.fs.moveFiles("workspace/data/old_name.txt", "workspace/data/new_name.txt");

sandbox.fs.moveFiles("workspace/data/file.txt", "workspace/archive/file.txt");

sandbox.fs.moveFiles("workspace/old_dir", "workspace/new_dir");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/files/move?source=&destination=' \
  --request POST
```