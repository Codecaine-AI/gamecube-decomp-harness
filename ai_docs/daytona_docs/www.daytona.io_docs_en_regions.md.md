---
url: "https://www.daytona.io/docs/en/regions.md"
title: undefined
---

\# Regions

Every Daytona sandbox runs in a \*\*region\*\*: a geographic or logical grouping of compute infrastructure. When creating a sandbox, you can target a specific region, and Daytona schedules the workload on available capacity within that region.

\## Shared regions

Regions managed by Daytona and available to all organizations:

\| \*\*Region\*\* \| \*\*Target\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\- \|
\| United States \| \*\*\`us\`\*\* \|
\| Europe \| \*\*\`eu\`\*\* \|

\`\`\`python
from daytona import Daytona, DaytonaConfig

\# Configure Daytona to use the US region
config = DaytonaConfig(
 target="us"
)

\# Initialize the Daytona client with the specified configuration
daytona = Daytona(config)

\# Create a sandbox in the US region
sandbox = daytona.create()
\`\`\`

\`\`\`typescript
import { Daytona } from '@daytona/sdk'

// Configure Daytona to use the US region
const daytona = new Daytona({
 target: 'us',
})

// Create a sandbox in the US region
const sandbox = await daytona.create()
\`\`\`

\`\`\`ruby
require 'daytona'

\# Configure Daytona to use the US region
config = Daytona::Config.new(
 target: 'us'
)

\# Initialize the Daytona client with the specified configuration
daytona = Daytona::Daytona.new(config)

\# Create a sandbox in the US region
sandbox = daytona.create
\`\`\`

\`\`\`go
package main

import (
 "context"

 "github.com/daytona/clients/sdk-go/pkg/daytona"
 "github.com/daytona/clients/sdk-go/pkg/types"
)

func main() {
 // Configure Daytona to use the US region
 client, \_ := daytona.NewClientWithConfig(&types.DaytonaConfig{
 Target: "us",
 })

 // Create a sandbox in the US region
 ctx := context.Background()
 \_, \_ = client.Create(ctx, nil)
}
\`\`\`

\`\`\`java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.DaytonaConfig;
import io.daytona.sdk.Sandbox;

public class App {
 public static void main(String\[\] args) {
 // Configure Daytona to use the US region
 DaytonaConfig config = new DaytonaConfig.Builder()
 .apiKey(System.getenv("DAYTONA\_API\_KEY"))
 .target("us")
 .build();

 try (Daytona daytona = new Daytona(config)) {
 // Create a sandbox in the US region
 Sandbox sandbox = daytona.create();
 }
 }
}
\`\`\`

\`\`\`bash
\# Create a sandbox in the US region
curl 'https://app.daytona.io/api/sandbox' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "target": "us"
}'
\`\`\`

List regions managed by Daytona and available to all organizations:

\`\`\`bash
curl 'https://app.daytona.io/api/shared-regions' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Dedicated regions

Dedicated regions are managed by Daytona and provisioned exclusively for an organization. The infrastructure is not shared with other organizations, and Daytona operates it as a managed service.

:::note
Contact \[sales@daytona.io\](mailto:sales@daytona.io) to set up a dedicated region for your organization.
:::

\## Custom regions

Custom regions run on compute that your organization provides and manages. Attach your own machines through \[bring your own compute (BYOC)\](https://www.daytona.io/docs/en/bring-your-own-compute.md) to control data locality, compliance, and infrastructure configuration, and scale capacity independently within each region.

Custom regions have no limits on concurrent resource usage: capacity is bounded only by the compute you attach.