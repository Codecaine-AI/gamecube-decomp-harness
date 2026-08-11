---
url: "https://www.daytona.io/docs/en/java-sdk/secret-service/"
title: "SecretService | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/secret-service/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/secret-service.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#secretservice) SecretService

[Section titled “SecretService”](https://www.daytona.io/docs/en/java-sdk/secret-service/#secretservice)

Service for managing organization-scoped Daytona Secrets.

Secrets can be created, listed, retrieved, updated, and deleted, and referenced when creating a
Sandbox via the `secrets` field on the create-sandbox parameters. The plaintext `value`
is write-only and is never returned by the API; the Sandbox only ever sees the Secret’s opaque
placeholder, and the real value is substituted at the network egress layer for the Secret’s allowed
hosts.

### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/secret-service/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/secret-service/#create)

```
public Secret create(CreateSecretParams params)
```

Creates a new Secret.

**Parameters**:

- `params` _CreateSecretParams_ \- creation parameters; `name` must match `^[a-zA-Z_][a-zA-Z0-9_-]*$` and be unique within the organization

**Returns**:

- `Secret` \- created `Secret` (without the plaintext `value`)

**Throws**:

- `io.daytona.sdk.exception.DaytonaConflictException` \- if a Secret with the same name already exists
- `io.daytona.sdk.exception.DaytonaException` \- if creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/java-sdk/secret-service/#list)

```
public ListSecretsResponse list()
```

Lists Secrets in the organization one page at a time, using default query parameters.

```
try (Daytona daytona = new Daytona()) {

ListSecretsResponse page = daytona.secret().list();

System.out.printf("Fetched %d of %d secrets%n", page.getItems().size(), page.getTotal());

for (var secret : page.getItems()) {

System.out.println(secret.getName() + " (" + secret.getId() + ")");

}

}
```

**Returns**:

- `ListSecretsResponse` \- page of Secrets; `nextCursor` is `null` when there are no more pages

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the API request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#list-1) list()

[Section titled “list()”](https://www.daytona.io/docs/en/java-sdk/secret-service/#list-1)

```
public ListSecretsResponse list(ListSecretsQuery query)
```

Lists Secrets in the organization one page at a time. Pass the `nextCursor` from a
previous response as the query `cursor` to fetch the next page.

```
try (Daytona daytona = new Daytona()) {

ListSecretsQuery query = new ListSecretsQuery();

query.setLimit(50);

while (true) {

ListSecretsResponse page = daytona.secret().list(query);

System.out.printf("Fetched %d of %d secrets%n", page.getItems().size(), page.getTotal());

for (var secret : page.getItems()) {

System.out.println(secret.getName() + " (" + secret.getId() + ")");

}

if (page.getNextCursor() == null) {

break;

}

query.setCursor(page.getNextCursor());

}

}
```

**Parameters**:

- `query` _ListSecretsQuery_ \- optional filter, sort, and pagination parameters; may be `null`

**Returns**:

- `ListSecretsResponse` \- page of Secrets; `nextCursor` is `null` when there are no more pages

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the API request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/java-sdk/secret-service/#get)

```
public Secret get(String secretId)
```

Retrieves a Secret by ID.

**Parameters**:

- `secretId` _String_ \- Secret identifier

**Returns**:

- `Secret` \- matching `Secret`

**Throws**:

- `io.daytona.sdk.exception.DaytonaNotFoundException` \- if no Secret with the given ID exists
- `io.daytona.sdk.exception.DaytonaException` \- if the request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#update) update()

[Section titled “update()”](https://www.daytona.io/docs/en/java-sdk/secret-service/#update)

```
public Secret update(String secretId, UpdateSecretParams params)
```

Updates an existing Secret. Omitted (`null`) fields are left unchanged.

**Parameters**:

- `secretId` _String_ \- Secret identifier
- `params` _UpdateSecretParams_ \- fields to update

**Returns**:

- `Secret` \- updated `Secret`

**Throws**:

- `io.daytona.sdk.exception.DaytonaNotFoundException` \- if no Secret with the given ID exists
- `io.daytona.sdk.exception.DaytonaException` \- if the request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/secret-service/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/java-sdk/secret-service/#delete)

```
public void delete(String secretId)
```

Deletes a Secret by ID.

**Parameters**:

- `secretId` _String_ \- Secret identifier

**Throws**:

- `io.daytona.sdk.exception.DaytonaNotFoundException` \- if no Secret with the given ID exists
- `io.daytona.sdk.exception.DaytonaException` \- if deletion fails