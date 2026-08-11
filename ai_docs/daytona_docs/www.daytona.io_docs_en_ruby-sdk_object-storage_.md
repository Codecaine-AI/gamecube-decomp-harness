---
url: "https://www.daytona.io/docs/en/ruby-sdk/object-storage/"
title: "ObjectStorage | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/object-storage.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#objectstorage) ObjectStorage

[Section titled “ObjectStorage”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#objectstorage)

Initialize ObjectStorage with S3-compatible credentials

### [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#new-objectstorage) new ObjectStorage()

[Section titled “new ObjectStorage()”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#new-objectstorage)

```
def initialize(endpoint_url:, aws_access_key_id:, aws_secret_access_key:, aws_session_token:, region:, bucket_name: DEFAULT_BUCKET_NAME)
```

Initialize ObjectStorage with S3-compatible credentials

**Parameters**:

- `endpoint_url` _String_ \- The endpoint URL for the object storage service
- `aws_access_key_id` _String_ \- The access key ID for the object storage service
- `aws_secret_access_key` _String_ \- The secret access key for the object storage service
- `aws_session_token` _String_ \- The session token for the object storage service
- `bucket_name` _String_ \- The name of the bucket to use (defaults to “daytona-volume-builds”)
- `region` _String_ \- Region of the storage backend

**Returns**:

- `ObjectStorage` \- a new instance of ObjectStorage

### [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#bucket_name) bucket\_name()

[Section titled “bucket\_name()”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#bucket_name)

```
def bucket_name()
```

**Returns**:

- `String` \- The name of the S3 bucket used for object storage

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#s3_client) s3\_client()

[Section titled “s3\_client()”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#s3_client)

```
def s3_client()
```

**Returns**:

- `Aws:S3:Client` \- The S3 client

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/object-storage/\#upload) upload()

[Section titled “upload()”](https://www.daytona.io/docs/en/ruby-sdk/object-storage/#upload)

```
def upload(path, organization_id, archive_base_path = nil)
```

Uploads a file to the object storage service

**Parameters**:

- `path` _String_ \- The path to the file to upload
- `organization_id` _String_ \- The organization ID to use
- `archive_base_path` _String, nil_ \- The base path to use for the archive

**Returns**:

- `String` \- The hash of the uploaded file

**Raises**:

- `Errno:ENOENT` \- If the path does not exist