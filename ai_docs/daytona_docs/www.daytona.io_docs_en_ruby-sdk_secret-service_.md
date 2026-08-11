---
url: "https://www.daytona.io/docs/en/ruby-sdk/secret-service/"
title: "SecretService | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/secret-service.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#secretservice) SecretService

[Section titled “SecretService”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#secretservice)

Service for managing organization-scoped Daytona Secrets. Can be used to list, get, create,
update and delete Secrets.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#new-secretservice) new SecretService()

[Section titled “new SecretService()”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#new-secretservice)

```
def initialize(secret_api, otel_state: nil)
```

Service for managing organization-scoped Daytona Secrets. Can be used to list, get, create,
update and delete Secrets.

A Secret stores a plaintext +value+ that is never returned by the API. When a Secret is
referenced while creating a Sandbox, the corresponding env var holds an opaque +placeholder+
that is resolved to the real value only for the Secret’s allowed +hosts+.

**Parameters**:

- `secret_api` _DaytonaApiClient:SecretApi_ -
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `SecretService` \- a new instance of SecretService

### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#create)

```
def create(name, value, description: nil, hosts: nil)
```

Create a new Secret.

**Parameters**:

- `name` _String_ \- Name of the Secret. Must match +^\[a-zA-Z\_\]\[a-zA-Z0-9\_-\]\*$+ and be unique
within the organization (a duplicate name raises a 409 error).
- `value` _String_ \- Plaintext value of the Secret. Write-only; never returned by the API.
- `description` _String, nil_ \- Optional description of the Secret.
- `hosts` _Array<String>, nil_ \- Allowed hosts this Secret may be sent to. Accepts exact
hostnames and +\*.+ wildcards (no ports).

**Returns**:

- `Daytona:Secret`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#delete)

```
def delete(secret_id)
```

Delete a Secret.

**Parameters**:

- `secret_id` _String_ -

**Returns**:

- `void`

**Raises**:

- `DaytonaApiClient:ApiError` \- If no Secret with the given ID exists (404).

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#get)

```
def get(secret_id)
```

Get a Secret by ID.

**Parameters**:

- `secret_id` _String_ -

**Returns**:

- `Daytona:Secret`

**Raises**:

- `DaytonaApiClient:ApiError` \- If no Secret with the given ID exists (404).

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#list)

```
def list(cursor: nil, limit: nil, name: nil, sort: nil, order: nil)
```

List Secrets with cursor-based pagination.

**Parameters**:

- `cursor` _String, nil_ \- Pagination cursor from a previous response.
- `limit` _Integer, nil_ \- Number of results per page (1-200, defaults to 100).
- `name` _String, nil_ \- Filter by partial name match.
- `sort` _String, nil_ \- Field to sort by: +name+, +createdAt+ or +updatedAt+
(defaults to +createdAt+).
- `order` _String, nil_ \- Direction to sort by: +asc+ or +desc+ (defaults to +desc+).

**Returns**:

- `Daytona:ListSecretsResponse`

**Raises**:

- `Daytona:Sdk:Error` -

**Examples:**

```
daytona = Daytona::Daytona.new

cursor = nil

loop do

  page = daytona.secret.list(cursor:, limit: 100)

  puts "Fetched #{page.items.length} of #{page.total} secrets"

  page.items.each { |secret| puts "#{secret.name} (#{secret.id})" }

  cursor = page.next_cursor

  break if cursor.nil?

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret-service/\#update) update()

[Section titled “update()”](https://www.daytona.io/docs/en/ruby-sdk/secret-service/#update)

```
def update(secret_id, value: nil, description: nil, hosts: nil)
```

Update a Secret.

**Parameters**:

- `secret_id` _String_ -
- `value` _String, nil_ \- New plaintext value. Write-only; never returned by the API.
- `description` _String, nil_ \- New description of the Secret.
- `hosts` _Array<String>, nil_ \- Allowed hosts this Secret may be sent to. Accepts exact
hostnames and +\*.+ wildcards (no ports).

**Returns**:

- `Daytona:Secret`

**Raises**:

- `DaytonaApiClient:ApiError` \- If no Secret with the given ID exists (404).