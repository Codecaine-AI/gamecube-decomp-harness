---
url: "https://www.daytona.io/docs/en/python-sdk/sync/object-storage/"
title: "ObjectStorage | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/sync/object-storage/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/sync/object-storage.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/object-storage/\#objectstorage) ObjectStorage

[Section titled “ObjectStorage”](https://www.daytona.io/docs/en/python-sdk/sync/object-storage/#objectstorage)

```
class ObjectStorage()
```

ObjectStorage class for interacting with object storage services.

**Attributes**:

- `endpoint_url` _str_ \- The endpoint URL for the object storage service.
- `aws_access_key_id` _str_ \- The access key ID for the object storage service.
- `aws_secret_access_key` _str_ \- The secret access key for the object storage service.
- `aws_session_token` _str_ \- The session token for the object storage service. Used for temporary credentials.
- `bucket_name` _str_ \- The name of the bucket to use. Defaults to “daytona-volume-builds”.
- `region` _str_ \- The region of the storage backend.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/object-storage/\#objectstorageupload) ObjectStorage.upload

[Section titled “ObjectStorage.upload”](https://www.daytona.io/docs/en/python-sdk/sync/object-storage/#objectstorageupload)

```
@with_instrumentation()

def upload(path: str,

           organization_id: str,

           archive_base_path: str | None = None) -> str
```

Uploads a file to the object storage service.

**Arguments**:

- `path` _str_ \- The path to the file to upload.
- `organization_id` _str_ \- The organization ID to use.
- `archive_base_path` _str_ \- The base path to use for the archive.

**Returns**:

- `str` \- The hash of the uploaded file.