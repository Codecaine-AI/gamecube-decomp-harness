---
url: "https://www.daytona.io/docs/en/limits/"
title: "Limits | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/limits/#_top)

# Limits

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/limits.md)Open

[Daytona Limits ↗](https://app.daytona.io/dashboard/limits) provide an overview of your organization’s [current usage](https://www.daytona.io/docs/en/limits/#current-usage), [resources](https://www.daytona.io/docs/en/limits/#resources), [sandbox limits](https://www.daytona.io/docs/en/limits/#sandbox-limits), and [rate limits](https://www.daytona.io/docs/en/limits/#rate-limits). Daytona uses a [tier-based](https://www.daytona.io/docs/en/limits/#tiers) system where organizations are placed into tiers based on verification status, with each tier providing access to a specific compute pool and rate limits. For information on spending and wallet management, see [billing](https://www.daytona.io/docs/en/billing).

## [\#](https://www.daytona.io/docs/en/limits/\#current-usage) Current usage

[Section titled “Current usage”](https://www.daytona.io/docs/en/limits/#current-usage)

Current usage provides a summary of your organization’s resource usage, tier and region.

## [\#](https://www.daytona.io/docs/en/limits/\#resources) Resources

[Section titled “Resources”](https://www.daytona.io/docs/en/limits/#resources)

Resources are shared across all running sandboxes. The number of sandboxes you can run at once depends on their individual usage. Organizations are automatically placed into a tier based on verification status and have access to a compute pool consisting of:

- **Compute**: the total CPU cores available
- **Memory**: the total RAM available
- **Storage**: the total disk space available

## [\#](https://www.daytona.io/docs/en/limits/\#sandbox-limits) Sandbox limits

[Section titled “Sandbox limits”](https://www.daytona.io/docs/en/limits/#sandbox-limits)

Sandbox limits provides an overview of resource limits per sandbox.

- **Compute**: the maximum number of vCPUs per sandbox
- **Memory**: the maximum amount of memory per sandbox in GiB
- **Storage**: the maximum amount of storage per sandbox in GiB

Sandboxes count against these limits based on their [lifecycle state](https://www.daytona.io/docs/sandboxes#sandbox-lifecycle): stopped, paused, archived, and deleted sandboxes free reserved CPU and memory, while disk quota depends on the sandbox type and state.

## [\#](https://www.daytona.io/docs/en/limits/\#disk-quota) Disk quota

[Section titled “Disk quota”](https://www.daytona.io/docs/en/limits/#disk-quota)

Disk quota and [sandbox billing](https://www.daytona.io/docs/en/billing#sandbox-billing) are separate: a sandbox can be billed for reserved disk without counting against your organization’s storage limit. The table below details which states occupy disk quota for [container sandboxes](https://www.daytona.io/docs/en/sandboxes#create-sandboxes) and [VM sandboxes](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes).

| **State** | **Container Sandbox** | **VM Sandbox**<br>**(Linux VM and Windows)** | **Description** |
| --- | --- | --- | --- |
| Stopped | ✓ | ✗ | Stopped container sandboxes occupy disk quota until archived. Stopped VM sandboxes free the quota: their state is offloaded to a storage layer, which keeps resume fast while releasing quota. |
| Paused | ✗ | ✗ | Paused VM sandboxes free the disk quota. Supported for [**VM sandboxes**](https://www.daytona.io/docs/en/sandboxes#vm-sandboxes) only. |
| Archived | ✗ | ✗ | [**Archiving**](https://www.daytona.io/docs/en/sandboxes#archive-sandboxes) moves the container filesystem to object storage, frees the quota, and stops billing. Supported for [**container sandboxes**](https://www.daytona.io/docs/en/sandboxes#create-sandboxes) only. VM sandboxes have no archive state because stopping or pausing them already frees the quota. |

## [\#](https://www.daytona.io/docs/en/limits/\#rate-limits) Rate limits

[Section titled “Rate limits”](https://www.daytona.io/docs/en/limits/#rate-limits)

Rate limits control how many API requests you can make within a specific time window. These limits are applied based on your tier, authentication status, and the type of operation you’re performing. Rate limits for general authenticated requests are tracked per organization.

| **Tier** | **General Requests (per min)** | **Sandbox Creation (per min)** | **Sandbox Lifecycle (per min)** |
| --- | --- | --- | --- |
| Tier 1 | 10,000 | 300 | 10,000 |
| Tier 2 | 20,000 | 400 | 20,000 |
| Tier 3 | 40,000 | 500 | 40,000 |
| Tier 4 | 50,000 | 600 | 50,000 |
| Enterprise | Custom | Custom | Custom |

### [\#](https://www.daytona.io/docs/en/limits/\#rate-limit-headers) Rate limit headers

[Section titled “Rate limit headers”](https://www.daytona.io/docs/en/limits/#rate-limit-headers)

Daytona includes rate limit information in API response headers. Header names include a suffix based on which rate limit is triggered (e.g., `-anonymous`, `-authenticated`, `-sandbox-create`, `-sandbox-lifecycle`):

| Header Pattern | Description |
| --- | --- |
| **`X-RateLimit-Limit-{throttler}`** | Maximum number of requests allowed in the time window |
| **`X-RateLimit-Remaining-{throttler}`** | Number of requests remaining in the current window |
| **`X-RateLimit-Reset-{throttler}`** | Time in seconds until the rate limit window resets |
| **`Retry-After-{throttler}`** | Time in seconds to wait before retrying (included when limit is exceeded) |

### [\#](https://www.daytona.io/docs/en/limits/\#rate-limit-errors) Rate limit errors

[Section titled “Rate limit errors”](https://www.daytona.io/docs/en/limits/#rate-limit-errors)

Daytona [Python](https://www.daytona.io/docs/python-sdk), [TypeScript](https://www.daytona.io/docs/en/typescript-sdk), [Ruby](https://www.daytona.io/docs/ruby-sdk) and [Go](https://www.daytona.io/docs/go-sdk) SDKs raise or throw a `DaytonaRateLimitError` exception (Python) or error (TypeScript, Ruby and Go) when you exceed a rate limit.

The rate limit error response is a JSON object with the following properties:

- **`statusCode`**: the HTTP status code of the error
- **`message`**: the error message
- **`error`**: the error type

```
{

  "statusCode": 429,

  "message": "Rate limit exceeded",

  "error": "Too Many Requests"

}
```

All errors include [**`headers`**](https://www.daytona.io/docs/en/limits/#rate-limit-headers) and status code properties, allowing access to rate limit headers directly from the error object. Headers support case-insensitive access:

- [TypeScript](https://www.daytona.io/docs/en/limits/#tab-panel-612)
- [Python](https://www.daytona.io/docs/en/limits/#tab-panel-613)
- [Ruby](https://www.daytona.io/docs/en/limits/#tab-panel-614)
- [Go](https://www.daytona.io/docs/en/limits/#tab-panel-615)

```
try {

  await daytona.create()

} catch (error) {

  if (error instanceof DaytonaRateLimitError) {

    console.log(error.headers?.get('x-ratelimit-remaining-sandbox-create'))

    console.log(error.headers?.get('X-RateLimit-Remaining-Sandbox-Create')) // also works

  }

}
```

```
try:

  daytona.create(snapshot="my-snapshot")

except DaytonaRateLimitError as e:

  print(e.headers['x-ratelimit-remaining-sandbox-create'])

  print(e.headers['X-RateLimit-Remaining-Sandbox-Create'])  # also works
```

```
begin

  daytona.create

rescue Daytona::Sdk::Error => e

  puts "Error: #{e.message}"

end
```

```
sandbox, err := daytona.Create(ctx, nil)

if err != nil {

  var rateLimitErr *errors.DaytonaRateLimitError

  if errors.As(err, &rateLimitErr) {

    fmt.Println(rateLimitErr.Headers.Get("x-ratelimit-remaining-sandbox-create"))

    fmt.Println(rateLimitErr.Headers.Get("X-RateLimit-Remaining-Sandbox-Create")) // also works

  }

}
```

## [\#](https://www.daytona.io/docs/en/limits/\#tiers) Tiers

[Section titled “Tiers”](https://www.daytona.io/docs/en/limits/#tiers)

Limits are applied to your organization’s default region. To unlock higher limits, complete the following verification steps in the [Daytona Dashboard ↗](https://app.daytona.io/dashboard/limits):

| **Tier** | **Resources (vCPU / RAM / Storage)** | **Access Requirements** |
| --- | --- | --- |
| Tier 1 | 10 / 10GiB / 30GiB | Email verified |
| Tier 2 | 100 / 200GiB / 300GiB | Credit card linked, $25 top-up |
| Tier 3 | 250 / 500GiB / 2000GiB | $500 top-up |
| Tier 4 | 500 / 1000GiB / 5000GiB | $2000 top-up every 30 days |
| Custom | Custom | Contact [support@daytona.io](mailto:support@daytona.io) |

## [\#](https://www.daytona.io/docs/en/limits/\#limits) Limits

[Section titled “Limits”](https://www.daytona.io/docs/en/limits/#limits)

Limits provide an overview of tiers and their corresponding resource and rate limits.

| **Tier** | **Compute (vCPU)** | **Memory (GiB)** | **Storage (GiB)** | **API Requests (minutes)** | **Sandbox Creation (minutes)** | **Sandbox Lifecycle (minutes)** |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | 10 | 20 | 30 | 10,000 | 300 | 10,000 |
| **2** | 100 | 200 | 300 | 20,000 | 400 | 20,000 |
| **3** | 250 | 500 | 2,000 | 40,000 | 500 | 40,000 |
| **4** | 500 | 1,000 | 5,000 | 50,000 | 600 | 50,000 |
| **Enterprise** | Custom | Custom | Custom | Custom | Custom | Custom |

## [\#](https://www.daytona.io/docs/en/limits/\#best-practices) Best practices

[Section titled “Best practices”](https://www.daytona.io/docs/en/limits/#best-practices)

To work effectively within rate limits, always handle `429` errors gracefully with proper retry logic. When you receive a rate limit error, implement exponential backoff—wait progressively longer between retries (1s, 2s, 4s, 8s, etc.) to avoid overwhelming the API.

The following snippet demonstrates how to create a sandbox with retry logic using the TypeScript SDK:

```
async function createSandboxWithRetry() {

  let retries = 0

  const maxRetries = 5

  while (retries < maxRetries) {

    try {

      return await daytona.create({ snapshot: 'my-snapshot' })

    } catch (error) {

      if (error instanceof DaytonaRateLimitError && retries < maxRetries - 1) {

        // Use Retry-After header if available, otherwise exponential backoff

        const retryAfter = error.headers?.get('retry-after-sandbox-create')

        const delay = retryAfter

          ? parseInt(retryAfter) * 1000

          : Math.pow(2, retries) * 1000

        await new Promise(resolve => setTimeout(resolve, delay))

        retries++

      } else {

        throw error

      }

    }

  }

}
```

**Monitor [rate limit headers](https://www.daytona.io/docs/en/limits/#rate-limit-headers)** (e.g., `X-RateLimit-Remaining-{throttler}`, `X-RateLimit-Reset-{throttler}`) to track your consumption and implement proactive throttling before hitting limits. These headers are available on all error objects via the `headers` property.

**Cache API responses** that don’t frequently change, such as [sandbox lists](https://www.daytona.io/docs/sandboxes#list-sandboxes) (when relatively static), [available regions](https://www.daytona.io/docs/regions), and [snapshot information](https://www.daytona.io/docs/snapshots). This reduces unnecessary API calls and helps you stay well within your limits.

**Batch and optimize operations** by creating multiple sandboxes in parallel (within rate limits) rather than sequentially. Consider reusing existing sandboxes when possible instead of creating new ones for every task.

**Efficiently manage sandbox lifecycle** to reduce API calls. [Archive sandboxes](https://www.daytona.io/docs/sandboxes#archive-sandboxes) instead of deleting and recreating them, stop sandboxes when not in use rather than deleting them, and leverage [auto-stop intervals](https://www.daytona.io/docs/sandboxes#auto-stop-interval) to automatically manage running sandboxes without manual intervention.

**Implement request queuing** to prevent bursts that exceed limits, and use [webhooks](https://www.daytona.io/docs/webhooks) instead of polling for state changes to avoid unnecessary API calls. Set up monitoring and alerts for `429` errors in your application logs so you can proactively address rate limiting issues before they impact your users.