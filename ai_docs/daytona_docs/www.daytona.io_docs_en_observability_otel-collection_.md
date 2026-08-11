---
url: "https://www.daytona.io/docs/en/observability/otel-collection/"
title: "OpenTelemetry Collection | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/observability/otel-collection/#_top)

# OpenTelemetry Collection

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/observability/otel-collection.md)Open

OpenTelemetry collection exports distributed traces, logs, and metrics from Daytona SDK operations and sandbox runtimes to your observability stack. Data is sent over the OpenTelemetry Protocol (OTLP) to any OTLP-compatible collector or backend.

Daytona supports two independent telemetry paths:

- [**Sandbox telemetry**](https://www.daytona.io/docs/en/observability/otel-collection/#configure-sandbox-collection): collects traces, logs, and metrics from inside sandboxes, including CPU, memory, and filesystem metrics, application logs, and HTTP spans
- [**SDK tracing**](https://www.daytona.io/docs/en/observability/otel-collection/#sdk-tracing): instruments Daytona API operations and SDK calls in your application process

You can enable one or both. SDK tracing covers the control path from your application into Daytona. Sandbox telemetry covers what runs inside the sandbox. Together they provide end-to-end visibility across both sides.

## [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#configure-sandbox-collection) Configure sandbox collection

[Section titled “Configure sandbox collection”](https://www.daytona.io/docs/en/observability/otel-collection/#configure-sandbox-collection)

Configure a sandbox collection endpoint.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/settings)

2. Navigate to **OpenTelemetry** section (visible to organization owners)

3. Configure the following fields:
   - **OTLP Endpoint**: OpenTelemetry collector endpoint

     Example: **`https://otel-collector.example.com`**

   - **Headers**: authentication headers as key/value pairs

     Example: **`api-key` = `YOUR_API_KEY`**

- [API](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-789)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/otel-config' \

  --request PUT \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "endpoint": "https://otel-collector.example.com",

  "headers": {

    "api-key": "YOUR_COLLECTOR_API_KEY"

  }

}'
```

All sandboxes automatically export their telemetry data to the specified OTLP endpoint.

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#collected-data) Collected data

[Section titled “Collected data”](https://www.daytona.io/docs/en/observability/otel-collection/#collected-data)

View collected telemetry for a sandbox.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard)
2. Navigate to **Sandboxes** section
3. Open the **Sandbox Details** sheet for any sandbox
4. Use the **Logs**, **Traces**, and **Metrics** tabs to inspect the collected telemetry data

- [Python](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-790)
- [TypeScript](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-791)
- [Ruby](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-792)
- [Go](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-793)
- [Java](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-794)
- [API](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-795)

```
# Historical resource metrics (CPU, memory, disk)

samples = sandbox.get_metrics()

for s in samples:

    print(f"{s.timestamp}: CPU {s.cpu_used_pct}%")
```

```
// Historical resource metrics (CPU, memory, disk)

const samples = await sandbox.getMetrics()

for (const s of samples) {

  console.log(`${s.timestamp.toISOString()} CPU: ${s.cpuUsedPct}%`)

}
```

```
# Historical resource metrics (CPU, memory, disk)

sandbox.get_metrics.each { |m| puts "#{m.timestamp}: #{m.cpu_used_pct}%" }
```

```
// Historical resource metrics (CPU, memory, disk)

samples, err := sandbox.GetMetrics(ctx, nil, nil)

if err != nil {

    return err

}

for _, m := range samples {

    fmt.Printf("%s CPU: %.1f%%\n", m.Timestamp.Format(time.RFC3339), m.CPUUsedPct)

}
```

```
// Historical resource metrics (CPU, memory, disk)

List<SandboxMetrics> samples = sandbox.getMetrics(null, null);

for (SandboxMetrics s : samples) {

    System.out.println(s.getTimestamp() + " CPU: " + s.getCpuUsedPct() + "%");

}
```

```
# Logs

curl 'https://app.daytona.io/api/sandbox/{sandboxId}/telemetry/logs?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z' \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Traces

curl 'https://app.daytona.io/api/sandbox/{sandboxId}/telemetry/traces?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z' \

  --header 'Authorization: Bearer YOUR_API_KEY'

# Metrics

curl 'https://app.daytona.io/api/sandbox/{sandboxId}/telemetry/metrics?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

**Metrics:**

- `daytona.sandbox.cpu.utilization`: CPU usage percentage (0-100%)
- `daytona.sandbox.cpu.limit`: CPU cores limit
- `daytona.sandbox.memory.utilization`: Memory usage percentage (0-100%)
- `daytona.sandbox.memory.usage`: Memory used in bytes
- `daytona.sandbox.memory.limit`: Memory limit in bytes
- `daytona.sandbox.filesystem.utilization`: Disk usage percentage (0-100%)
- `daytona.sandbox.filesystem.usage`: Disk space used in bytes
- `daytona.sandbox.filesystem.available`: Disk space available in bytes
- `daytona.sandbox.filesystem.total`: Total disk space in bytes

**Traces:**

- HTTP requests and responses
- Custom spans from your application code

**Logs:**

- Application logs (stdout/stderr)
- System logs
- Runtime errors and warnings

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#resource-labels) Resource labels

[Section titled “Resource labels”](https://www.daytona.io/docs/en/observability/otel-collection/#resource-labels)

All sandbox telemetry is automatically annotated with the following OTel resource attributes:

- **`daytona_organization_id`**: the organization the sandbox belongs to
- **`daytona_region_id`**: the region the sandbox is running in
- **`daytona_snapshot`**: the snapshot used to create the sandbox

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#custom-resource-labels) Custom resource labels

[Section titled “Custom resource labels”](https://www.daytona.io/docs/en/observability/otel-collection/#custom-resource-labels)

Attach custom resource labels on a sandbox. Labels are a comma-separated list of `key=value` pairs. The labels are added as OTel resource attributes to all traces, logs, and metrics emitted by the sandbox. Use them to filter and group telemetry by custom dimensions in your observability platform.

1. Set the **`DAYTONA_SANDBOX_OTEL_EXTRA_LABELS`** environment variable on a sandbox:

```
DAYTONA_SANDBOX_OTEL_EXTRA_LABELS="team=backend,env=staging,app=my-service"
```

## [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#organization-metrics) Organization metrics

[Section titled “Organization metrics”](https://www.daytona.io/docs/en/observability/otel-collection/#organization-metrics)

In addition to per-sandbox telemetry, Daytona exports organization-level resource metrics to your configured OTLP endpoint. These metrics are pushed every 60 seconds and provide a high-level view of resource consumption and quotas across your organization.

Organization metrics are exported automatically when you have a [sandbox collection endpoint configured](https://www.daytona.io/docs/en/observability/otel-collection/#configure-sandbox-collection). No additional setup is required. The same OTLP endpoint receives both sandbox telemetry and organization metrics.

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#exported-metrics) Exported metrics

[Section titled “Exported metrics”](https://www.daytona.io/docs/en/observability/otel-collection/#exported-metrics)

| **Metric** | **Unit** | **Description** |
| --- | --- | --- |
| **`daytona.sandbox.used_cpu`** | CPU cores | Total CPU currently consumed by active sandboxes |
| **`daytona.sandbox.used_ram`** | GiB | Total memory currently consumed by active sandboxes |
| **`daytona.sandbox.used_storage`** | GiB | Total disk currently consumed by sandboxes |
| **`daytona.sandbox.total_cpu`** | CPU cores | Total CPU quota for the organization |
| **`daytona.sandbox.total_ram`** | GiB | Total memory quota for the organization |
| **`daytona.sandbox.total_storage`** | GiB | Total disk quota for the organization |

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#metric-attributes) Metric attributes

[Section titled “Metric attributes”](https://www.daytona.io/docs/en/observability/otel-collection/#metric-attributes)

Each metric includes the following attributes for filtering and grouping:

- **`organization.id`** (resource attribute): the organization the metrics belong to
- **`region.id`** (data point attribute): the region the resource usage and quota applies to

## [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#sdk-tracing) SDK tracing

[Section titled “SDK tracing”](https://www.daytona.io/docs/en/observability/otel-collection/#sdk-tracing)

SDK tracing instruments Daytona SDK operations in your application process and exports them as OpenTelemetry traces. When enabled, the SDK creates spans for calls your application makes into Daytona, then sends those traces over OTLP to your observability backend.

Send traces to any OTLP-compatible backend:

- [New Relic](https://www.daytona.io/docs/en/observability/otel-collection/#new-relic)
- [Jaeger](https://www.daytona.io/docs/en/observability/otel-collection/#jaeger-local)
- [Grafana Cloud](https://www.daytona.io/docs/en/observability/otel-collection/#grafana-cloud)
- [Datadog](https://www.daytona.io/docs/en/observability/otel-collection/#datadog)

1. Pass the **`otelEnabled`** flag when initializing the Daytona client, or set the **`DAYTONA_OTEL_ENABLED`** environment variable to **`true`**:

```
export DAYTONA_OTEL_ENABLED=true
```

- [Python](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-796)
- [TypeScript](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-797)
- [Ruby](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-798)
- [Go](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-799)

```
from daytona import Daytona, DaytonaConfig

# Using async context manager (recommended)

async with Daytona(DaytonaConfig(otel_enabled=True)) as daytona:

    sandbox = await daytona.create()

    # All operations will be traced

# OpenTelemetry traces are flushed on close
```

Or without context manager:

```
daytona = Daytona(DaytonaConfig(otel_enabled=True))

try:

    sandbox = await daytona.create()

    # All operations will be traced

finally:

    await daytona.close()  # Flushes traces
```

```
import { Daytona } from '@daytona/sdk'

// Using async dispose (recommended)

await using daytona = new Daytona({ otelEnabled: true })

const sandbox = await daytona.create()

// All operations will be traced

// Traces are automatically flushed on dispose
```

Or with explicit disposal:

```
const daytona = new Daytona({ otelEnabled: true })

try {

  const sandbox = await daytona.create()

  // All operations will be traced

} finally {

  await daytona[Symbol.asyncDispose]()  // Flushes traces

}
```

```
require 'daytona'

config = Daytona::Config.new(otel_enabled: true)

daytona = Daytona::Daytona.new(config)

sandbox = daytona.create

# All operations will be traced

daytona.close # Flushes traces
```

Or with `ensure` block:

```
daytona = Daytona::Daytona.new(

  Daytona::Config.new(otel_enabled: true)

)

begin

  sandbox = daytona.create

  # All operations will be traced

ensure

  daytona.close # Flushes traces

end
```

```
import (

    "context"

    "log"

    "github.com/daytona/clients/sdk-go/pkg/daytona"

    "github.com/daytona/clients/sdk-go/pkg/types"

)

client, err := daytona.NewClientWithConfig(&types.DaytonaConfig{

    OtelEnabled: true,

})

if err != nil {

    log.Fatal(err)

}

defer client.Close(context.Background()) // Flushes traces

sandbox, err := client.Create(context.Background(), nil)

// All operations will be traced
```

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#configure-otlp-exporter) Configure OTLP exporter

[Section titled “Configure OTLP exporter”](https://www.daytona.io/docs/en/observability/otel-collection/#configure-otlp-exporter)

The SDK uses standard OpenTelemetry environment variables for configuration.

```
# OTLP endpoint (without the /v1/traces path)

OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net:4317

# Authentication headers (format: key1=value1,key2=value2)

OTEL_EXPORTER_OTLP_HEADERS="api-key=your-api-key-here"
```

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#new-relic) New Relic

[Section titled “New Relic”](https://www.daytona.io/docs/en/observability/otel-collection/#new-relic)

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net:4317

OTEL_EXPORTER_OTLP_HEADERS="api-key=YOUR_NEW_RELIC_LICENSE_KEY"
```

See the [New Relic dashboard example](https://github.com/daytona/clients/tree/main/examples/otel-dashboards/new-relic) for detailed setup steps.

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#jaeger-local) Jaeger (local)

[Section titled “Jaeger (local)”](https://www.daytona.io/docs/en/observability/otel-collection/#jaeger-local)

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#grafana-cloud) Grafana Cloud

[Section titled “Grafana Cloud”](https://www.daytona.io/docs/en/observability/otel-collection/#grafana-cloud)

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-<region>.grafana.net/otlp

OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <BASE64_ENCODED_CREDENTIALS>"
```

1. Go to [Grafana Cloud Portal](https://grafana.com/)
2. Open **Connections**
3. Click **Add new connection**
4. Search for **OpenTelemetry (OTLP)**
5. Follow the wizard to create an access token. The endpoint and headers are provided in the instrumentation instructions. See the [Grafana dashboard example](https://github.com/daytona/clients/tree/main/examples/otel-dashboards/grafana) for detailed setup steps.

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#datadog) Datadog

[Section titled “Datadog”](https://www.daytona.io/docs/en/observability/otel-collection/#datadog)

Datadog exposes a native OTLP intake endpoint, so you can send telemetry directly to Datadog without a Datadog Agent.

```
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.datadoghq.com

OTEL_EXPORTER_OTLP_HEADERS="dd-api-key=YOUR_DATADOG_API_KEY"

OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

1. Enter the OTLP endpoint for your Datadog site and add a single header **`dd-api-key`** with your Datadog API key:

| **Datadog Site** | **OTLP Endpoint** |
| --- | --- |
| US1 ( **`datadoghq.com`**) | **`https://otlp.datadoghq.com`** |
| EU ( **`datadoghq.eu`**) | **`https://otlp.datadoghq.eu`** |
| US3 | **`https://otlp.us3.datadoghq.com`** |
| US5 | **`https://otlp.us5.datadoghq.com`** |
| AP1 | **`https://otlp.ap1.datadoghq.com`** |

Use the base endpoint without a `/v1/...` path. The path is appended automatically.

2. Generate an API key under **Datadog** \> **Organization Settings** \> **API Keys**. See the [Datadog dashboard example](https://github.com/daytona/clients/tree/main/examples/otel-dashboards/datadog) for an importable dashboard and verification steps.

Metrics appear under **Metrics** \> **Summary** (search for `daytona.sandbox`), where you can also confirm the exact tag keys (for example, `service`, `region.id`).

## [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#example) Example

[Section titled “Example”](https://www.daytona.io/docs/en/observability/otel-collection/#example)

Complete example of OpenTelemetry tracing with the Daytona SDK:

- [Python](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-800)
- [TypeScript](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-801)
- [Ruby](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-802)
- [Go](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-803)

```
import asyncio

import os

from daytona import Daytona, DaytonaConfig

# Set OTEL configuration

os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://otlp.nr-data.net:4317"

os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = "api-key=YOUR_API_KEY"

async def main():

    # Initialize Daytona with OTEL enabled

    async with Daytona(DaytonaConfig(otel_enabled=True)) as daytona:

        # Create a sandbox - this operation will be traced

        sandbox = await daytona.create()

        print(f"Created sandbox: {sandbox.id}")

        # Execute code - this operation will be traced

        result = await sandbox.process.code_run("""

import numpy as np

print(f"NumPy version: {np.__version__}")

""")

        print(f"Execution result: {result.result}")

        # Upload a file - this operation will be traced

        await sandbox.fs.upload_file("local.txt", "/home/daytona/remote.txt")

        # Delete sandbox - this operation will be traced

        await daytona.delete(sandbox)

    # Traces are automatically flushed when exiting the context manager

if __name__ == "__main__":

    asyncio.run(main())
```

```
// Set OTEL configuration

process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otlp.nr-data.net:4317"

process.env.OTEL_EXPORTER_OTLP_HEADERS = "api-key=YOUR_API_KEY"

import { Daytona } from '@daytona/sdk'

async function main() {

  // Initialize Daytona with OTEL enabled

  await using daytona = new Daytona({ otelEnabled: true })

  // Create a sandbox - this operation will be traced

  const sandbox = await daytona.create()

  console.log(`Created sandbox: ${sandbox.id}`)

  // Execute code - this operation will be traced

  const result = await sandbox.process.codeRun(`

import numpy as np

print(f"NumPy version: {np.__version__}")

  `)

  console.log(`Execution result: ${result.result}`)

  // Upload a file - this operation will be traced

  await sandbox.fs.uploadFile('local.txt', '/home/daytona/remote.txt')

  // Delete sandbox - this operation will be traced

  await daytona.delete(sandbox)

  // Traces are automatically flushed when the daytona instance is disposed

}

main().catch(console.error)
```

```
require 'daytona'

# Set OTEL configuration

ENV["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://otlp.nr-data.net:4317"

ENV["OTEL_EXPORTER_OTLP_HEADERS"] = "api-key=YOUR_API_KEY"

# Initialize Daytona with OTEL enabled

config = Daytona::Config.new(otel_enabled: true)

daytona = Daytona::Daytona.new(config)

begin

  # Create a sandbox - this operation will be traced

  sandbox = daytona.create

  puts "Created sandbox: #{sandbox.id}"

  # Execute code - this operation will be traced

  result = sandbox.process.code_run("

import numpy as np

print(f'NumPy version: {np.__version__}')

  ")

  puts "Execution result: #{result.result}"

  # Upload a file - this operation will be traced

  sandbox.fs.upload_file("local.txt", "/home/daytona/remote.txt")

  # Delete sandbox - this operation will be traced

  daytona.delete(sandbox)

ensure

  daytona.close # Flushes traces

end
```

```
package main

import (

    "context"

    "fmt"

    "log"

    "os"

    "github.com/daytona/clients/sdk-go/pkg/daytona"

    "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

    // Set OTEL configuration

    os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://otlp.nr-data.net:4317")

    os.Setenv("OTEL_EXPORTER_OTLP_HEADERS", "api-key=YOUR_API_KEY")

    ctx := context.Background()

    // Initialize Daytona with OTEL enabled

    client, err := daytona.NewClientWithConfig(&types.DaytonaConfig{

        OtelEnabled: true,

    })

    if err != nil {

      log.Fatal(err)

    }

    defer client.Close(ctx) // Flushes traces on exit

    // Create a sandbox - this operation will be traced

    sandbox, err := client.Create(ctx, nil)

    if err != nil {

      log.Fatal(err)

    }

    fmt.Printf("Created sandbox: %s\n", sandbox.ID)

    // Execute code - this operation will be traced

    result, err := sandbox.Process.CodeRun(ctx, &types.CodeRunParams{

        Code: `

import numpy as np

print(f"NumPy version: {np.__version__}")

        `,

    })

    if err != nil {

      log.Fatal(err)

    }

    fmt.Printf("Execution result: %s\n", result.Result)

    // Upload a file - this operation will be traced

    err = sandbox.Fs.UploadFile(ctx, "local.txt", "/home/daytona/remote.txt")

    if err != nil {

      log.Fatal(err)

    }

    // Delete sandbox - this operation will be traced

    err = client.Delete(ctx, sandbox, nil)

    if err != nil {

      log.Fatal(err)

    }

    // Traces are flushed when client.Close is called via defer

}
```

## [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#traced-operations) Traced operations

[Section titled “Traced operations”](https://www.daytona.io/docs/en/observability/otel-collection/#traced-operations)

The Daytona SDK automatically instruments the following operations:

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#sdk-operations) SDK operations

[Section titled “SDK operations”](https://www.daytona.io/docs/en/observability/otel-collection/#sdk-operations)

- `create()`: sandbox creation and initialization
- `get()`: retrieving sandbox instances
- `list()`: listing sandboxes
- `start()`: starting sandboxes
- `stop()`: stopping sandboxes
- `delete()`: deleting sandboxes
- All sandbox, snapshot and volume operations

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#http-requests) HTTP requests

[Section titled “HTTP requests”](https://www.daytona.io/docs/en/observability/otel-collection/#http-requests)

- All API calls to the Daytona backend
- Request duration and response status codes
- Error information for failed requests

### [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#trace-attributes) Trace attributes

[Section titled “Trace attributes”](https://www.daytona.io/docs/en/observability/otel-collection/#trace-attributes)

Each trace includes the following metadata:

- Service name and version
- HTTP method, URL, and status code
- Request and response duration
- Error details (if applicable)

## [\#](https://www.daytona.io/docs/en/observability/otel-collection/\#troubleshooting) Troubleshooting

[Section titled “Troubleshooting”](https://www.daytona.io/docs/en/observability/otel-collection/#troubleshooting)

Verify the exporter before digging into application code:

1. Check that environment variables are set correctly
2. Verify your OTLP endpoint is reachable
3. Confirm API keys and headers are valid
4. Check your observability platform for incoming traces
5. Look for connection errors in application logs

- [Traces not appearing](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-804)
- [Connection refused](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-805)
- [Authentication](https://www.daytona.io/docs/en/observability/otel-collection/#tab-panel-806)

**Symptom:** SDK operations run successfully, but no traces appear in the observability backend.

**Cause:** Tracing is disabled, the OTLP endpoint or headers are wrong, or the Daytona client exits without flushing pending spans.

**Solution:**

1. Ensure **`otelEnabled: true`** is set in the Daytona client configuration, or set **`DAYTONA_OTEL_ENABLED=true`**
2. Verify the OTLP endpoint and headers match your backend
3. Close or dispose the Daytona instance so traces flush before the process exits

See [**SDK tracing**](https://www.daytona.io/docs/en/observability/otel-collection/#sdk-tracing).

**Symptom:** The application logs connection errors when exporting traces. The OTLP exporter cannot reach the collector.

**Cause:** The OTLP endpoint URL is incorrect, the collector is unreachable from the application host, or a firewall blocks outbound traffic to the collector.

**Solution:**

1. Verify the OTLP endpoint URL is correct
2. Ensure the endpoint is accessible from your application
3. Check firewall rules if running in a restricted environment

See [**configure OTLP exporter**](https://www.daytona.io/docs/en/observability/otel-collection/#configure-otlp-exporter).

**Symptom:** Trace export fails with authentication or authorization errors from the OTLP backend.

**Cause:** The API key or header format does not match what the provider expects. `OTEL_EXPORTER_OTLP_HEADERS` must be a comma-separated list of `key=value` pairs.

**Solution:**

1. Verify the API key format matches your provider’s requirements
2. Check that **`OTEL_EXPORTER_OTLP_HEADERS`** uses the correct `key=value` format

See the backend guides under [**SDK tracing**](https://www.daytona.io/docs/en/observability/otel-collection/#sdk-tracing).