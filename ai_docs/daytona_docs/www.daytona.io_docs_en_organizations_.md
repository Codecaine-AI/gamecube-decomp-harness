---
url: "https://www.daytona.io/docs/en/organizations/"
title: "Organizations | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/organizations/#_top)

# Organizations

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/organizations.md)Open

Daytona provides organizations as a way to group resources and enable collaboration. Users can work individually in their personal organization or together in a collaborative organization.

Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard) to manage your organizations, or use the [API](https://www.daytona.io/docs/en/tools/api/#daytona/tag/organizations) to manage them programmatically.

## [\#](https://www.daytona.io/docs/en/organizations/\#personal-vs-collaborative) Personal vs Collaborative

[Section titled “Personal vs Collaborative”](https://www.daytona.io/docs/en/organizations/#personal-vs-collaborative)

Every Daytona user starts with a personal organization, ideal for solo use and experimentation. Collaborative organizations are created manually and designed for company-wide collaboration with shared access and controls.

| **Feature** | **Personal organization** | **Collaborative organization** |
| --- | --- | --- |
| **Creation** | Automatic on signup | Manually by a user |
| **Members** | Single user only | Multiple users (invite-based) |
| **Access Control** | No roles or permissions | Roles with granular resource-based assignments |
| **Billing** | Tied to individual user | Shared across team members |
| **Use Case** | Personal testing, small projects | Company/team development and production |
| **Quota Scope** | Per user | Shared across all members |
| **Deletable** | No | Yes (by Owner) |

Users can switch between their personal and collaborative organizations by using the dropdown in the [Daytona Dashboard ↗](https://app.daytona.io/dashboard) sidebar. Each organization has its own sandboxes, API keys, and resource quotas.

## [\#](https://www.daytona.io/docs/en/organizations/\#create-organization) Create organization

[Section titled “Create organization”](https://www.daytona.io/docs/en/organizations/#create-organization)

Daytona provides options to create organizations in [Daytona Dashboard ↗](https://app.daytona.io/dashboard/) or programmatically using the [API](https://www.daytona.io/docs/en/tools/api/#daytona/tag/organizations).

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/)
2. Expand the dropdown at the top-left corner of the sidebar to view your organizations
3. Click the **Create Organization** button
4. Enter the organization name
5. Select a [region](https://www.daytona.io/docs/en/regions)
6. Click **Create**

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-807)

```
curl 'https://app.daytona.io/api/organizations' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "My Organization",

  "defaultRegionId": "us"

}'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#list-organizations) List organizations

[Section titled “List organizations”](https://www.daytona.io/docs/en/organizations/#list-organizations)

List all organizations the authenticated user belongs to.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-808)

```
curl 'https://app.daytona.io/api/organizations' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#get-by-id) Get by ID

[Section titled “Get by ID”](https://www.daytona.io/docs/en/organizations/#get-by-id)

Get an organization by ID.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-809)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#leave-organization) Leave organization

[Section titled “Leave organization”](https://www.daytona.io/docs/en/organizations/#leave-organization)

Leave an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/)
2. Expand the dropdown at the top-left corner of the sidebar to view your organizations
3. Select the organization you want to leave
4. Click **Settings** in the sidebar
5. Click **Leave Organization**
6. Confirm by clicking the **Leave** button

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-810)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/leave' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#delete-organization) Delete organization

[Section titled “Delete organization”](https://www.daytona.io/docs/en/organizations/#delete-organization)

Delete an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/)
2. Expand the dropdown at the top-left corner of the sidebar to view your organizations
3. Select the organization you want to delete
4. Click **Settings** in the sidebar
5. Click **Delete Organization**
6. Confirm the deletion by typing the organization name and clicking the **Delete** button

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-811)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID' \

  --request DELETE \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#roles) Roles

[Section titled “Roles”](https://www.daytona.io/docs/en/organizations/#roles)

Users within an organization can have one of two different roles:

1. **Owners** have full administrative access to the organization and its resources. Organization owners can perform administrative actions.
2. **Members** have no administrative access to the organization, while their access to organization resources is based on [**Assignments**](https://www.daytona.io/docs/en/organizations/#role-assignments).

### [\#](https://www.daytona.io/docs/en/organizations/\#role-assignments) Role assignments

[Section titled “Role assignments”](https://www.daytona.io/docs/en/organizations/#role-assignments)

The list of available role assignments includes:

| Assignment | Description |
| --- | --- |
| **`Viewer (required)`** | Grants read access to all resources in the organization |
| **`Developer`** | Grants the ability to create sandboxes and keys in the organization |
| **`Sandboxes Admin`** | Grants admin access to sandboxes in the organization |
| **`Snapshots Admin`** | Grants admin access to snapshots in the organization |
| **`Registries Admin`** | Grants admin access to registries in the organization |
| **`Volumes Admin`** | Grants admin access to volumes in the organization |
| **`Super Admin`** | Grants full access to all resources in the organization |
| **`SSO Admin`** | Grants permission to manage the organization’s [SSO](https://www.daytona.io/docs/en/sso) identity providers |
| **`Auditor`** | Grants access to audit logs in the organization |
| **`Infrastructure Admin`** | Grants admin access to infrastructure in the organization |

### [\#](https://www.daytona.io/docs/en/organizations/\#create-role) Create role

[Section titled “Create role”](https://www.daytona.io/docs/en/organizations/#create-role)

Create a new role in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-812)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/roles' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "Maintainer",

  "description": "Can manage all resources",

  "permissions": ["write:sandboxes", "delete:sandboxes"]

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#list-roles) List roles

[Section titled “List roles”](https://www.daytona.io/docs/en/organizations/#list-roles)

List all roles in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-813)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/roles' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-role) Update role

[Section titled “Update role”](https://www.daytona.io/docs/en/organizations/#update-role)

Update a role in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-814)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/roles/ROLE_ID' \

  --request PUT \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "name": "Maintainer",

  "description": "Can manage all resources",

  "permissions": ["write:sandboxes", "delete:sandboxes"]

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#delete-role) Delete role

[Section titled “Delete role”](https://www.daytona.io/docs/en/organizations/#delete-role)

Delete a role in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-815)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/roles/ROLE_ID' \

  --request DELETE \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#members) Members

[Section titled “Members”](https://www.daytona.io/docs/en/organizations/#members)

Daytona provides methods to manage members in an organization.

### [\#](https://www.daytona.io/docs/en/organizations/\#list-members) List members

[Section titled “List members”](https://www.daytona.io/docs/en/organizations/#list-members)

List all members in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-816)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/users' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#invite-members) Invite members

[Section titled “Invite members”](https://www.daytona.io/docs/en/organizations/#invite-members)

Invite a new user to an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/members)
2. Click the **Invite Member** button
3. Enter the email address of the user you want to invite
4. [Select a role](https://www.daytona.io/docs/en/organizations/#roles) for the new user. If you select the **`Member`** role, define their [assignments](https://www.daytona.io/docs/en/organizations/#role-assignments)

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-817)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/invitations' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "email": "mail@example.com",

  "role": "member",

  "assignedRoleIds": ["00000000-0000-0000-0000-000000000001"]

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#remove-members) Remove members

[Section titled “Remove members”](https://www.daytona.io/docs/en/organizations/#remove-members)

Remove a user from an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/members)
2. Click the **Remove** button next to the user you want to remove
3. Confirm the removal by clicking the **Remove** button

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-818)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/users/USER_ID' \

  --request DELETE \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-access) Update access

[Section titled “Update access”](https://www.daytona.io/docs/en/organizations/#update-access)

Update the access of a member in an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/members)
2. Click the three-dot menu on the member row
3. Click **Change Role** or **Manage Assignments**
4. Update the role or assignments and click **Save**

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-819)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/users/USER_ID/access' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "role": "member",

  "assignedRoleIds": ["00000000-0000-0000-0000-000000000001"]

}'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#invitations) Invitations

[Section titled “Invitations”](https://www.daytona.io/docs/en/organizations/#invitations)

Manage invitations in an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/user/invitations)
2. Expand the dropdown at the bottom of the sidebar to view pending invitations to join other organizations.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-820)

```
curl 'https://app.daytona.io/api/organizations/invitations' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#get-invitations-count) Get invitations count

[Section titled “Get invitations count”](https://www.daytona.io/docs/en/organizations/#get-invitations-count)

Get the number of invitations in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-821)

```
curl 'https://app.daytona.io/api/organizations/invitations/count' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#accept-invitation) Accept invitation

[Section titled “Accept invitation”](https://www.daytona.io/docs/en/organizations/#accept-invitation)

Accept a pending organization invitation.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/)
2. Click your profile at the bottom-left of the sidebar
3. Click **Invitations**
4. Click the checkmark button on the invitation row

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-822)

```
curl 'https://app.daytona.io/api/organizations/invitations/INVITATION_ID/accept' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

Once a user accepts an invitation to join an organization, they get access to resource quotas assigned to that organization and they may proceed by issuing a new [API key](https://www.daytona.io/docs/en/api-keys) and creating sandboxes.

### [\#](https://www.daytona.io/docs/en/organizations/\#decline-invitation) Decline invitation

[Section titled “Decline invitation”](https://www.daytona.io/docs/en/organizations/#decline-invitation)

Decline a pending organization invitation.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/)
2. Click your profile at the bottom-left of the sidebar
3. Click **Invitations**
4. Click the X button on the invitation row
5. Confirm by clicking the **Decline** button

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-823)

```
curl 'https://app.daytona.io/api/organizations/invitations/INVITATION_ID/decline' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#list-pending) List pending

[Section titled “List pending”](https://www.daytona.io/docs/en/organizations/#list-pending)

List pending invitations for an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-824)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/invitations' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-invitation) Update invitation

[Section titled “Update invitation”](https://www.daytona.io/docs/en/organizations/#update-invitation)

Update an invitation for an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/members)
2. Scroll to the **Invitations** table
3. Click the three-dot menu on the invitation row
4. Click **Edit**
5. Update the role or assignments and click **Update**

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-825)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/invitations/INVITATION_ID' \

  --request PUT \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "role": "member",

  "assignedRoleIds": ["00000000-0000-0000-0000-000000000001"],

  "expiresAt": "2030-01-01T00:00:00.000Z"

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#cancel-invitation) Cancel invitation

[Section titled “Cancel invitation”](https://www.daytona.io/docs/en/organizations/#cancel-invitation)

Cancel an invitation for an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/members)
2. Scroll to the **Invitations** table
3. Click the three-dot menu on the invitation row
4. Click **Cancel**
5. Confirm by clicking the **Confirm** button

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-826)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/invitations/INVITATION_ID/cancel' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#regions) Regions

[Section titled “Regions”](https://www.daytona.io/docs/en/organizations/#regions)

Each organization has a default [region](https://www.daytona.io/docs/en/regions) that determines where sandboxes are created when no specific target is provided. Regions represent geographic or logical groupings of compute infrastructure. Organizations can update their default region, manage per-region resource quotas, and query region quota information for individual sandboxes.

For more information on available region types, see the [Regions](https://www.daytona.io/docs/en/regions) guide.

### [\#](https://www.daytona.io/docs/en/organizations/\#set-default-region) Set default region

[Section titled “Set default region”](https://www.daytona.io/docs/en/organizations/#set-default-region)

Set the default region.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-827)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/default-region' \

  --request PATCH \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "defaultRegionId": "us"

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-region-quota) Update region quota

[Section titled “Update region quota”](https://www.daytona.io/docs/en/organizations/#update-region-quota)

Update the resource quota for an organization in a specific region. `totalCpuQuota`, `totalMemoryQuota`, `totalDiskQuota`, and `totalGpuQuota` are required; per-sandbox limits and allowed GPU types are optional.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-828)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/quota/REGION_ID' \

  --request PATCH \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "totalCpuQuota": 100,

  "totalMemoryQuota": 200,

  "totalDiskQuota": 500,

  "totalGpuQuota": 0

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#list-available-sandbox-classes) List available sandbox classes

[Section titled “List available sandbox classes”](https://www.daytona.io/docs/en/organizations/#list-available-sandbox-classes)

List the sandbox classes available to an organization. Each entry includes the region ID, the sandbox class, whether GPUs are available, and the allowed GPU types.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-829)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/available-sandbox-classes' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#organization-settings) Organization settings

[Section titled “Organization settings”](https://www.daytona.io/docs/en/organizations/#organization-settings)

The settings page in the [Daytona Dashboard ↗](https://app.daytona.io/dashboard/settings) allows you to view the organization ID and name, and optionally delete the organization if you don’t need it anymore. This action is irreversible, so please proceed with caution. Personal organizations are there by default and cannot be deleted.

## [\#](https://www.daytona.io/docs/en/organizations/\#advanced-operations) Advanced operations

[Section titled “Advanced operations”](https://www.daytona.io/docs/en/organizations/#advanced-operations)

Daytona provides methods to perform advanced operations on an organization.

### [\#](https://www.daytona.io/docs/en/organizations/\#usage-overview) Usage overview

[Section titled “Usage overview”](https://www.daytona.io/docs/en/organizations/#usage-overview)

Get the usage overview for an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-830)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/usage' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-organization-quota) Update organization quota

[Section titled “Update organization quota”](https://www.daytona.io/docs/en/organizations/#update-organization-quota)

Update the resource quota for an organization. All fields are optional; omitted fields are left unchanged.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-831)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/quota' \

  --request PATCH \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "maxCpuPerSandbox": 4,

  "maxMemoryPerSandbox": 8,

  "maxDiskPerSandbox": 10,

  "snapshotQuota": 100,

  "volumeQuota": 100,

  "secretQuota": 100

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#suspend-organization) Suspend organization

[Section titled “Suspend organization”](https://www.daytona.io/docs/en/organizations/#suspend-organization)

Suspend an organization. `reason` and `until` are required. `suspensionCleanupGracePeriodHours` sets the number of hours before suspended resources are cleaned up.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-832)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/suspend' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "reason": "Payment overdue",

  "until": "2030-01-01T00:00:00.000Z",

  "suspensionCleanupGracePeriodHours": 24

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#unsuspend-organization) Unsuspend organization

[Section titled “Unsuspend organization”](https://www.daytona.io/docs/en/organizations/#unsuspend-organization)

Remove the suspension from an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-833)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/unsuspend' \

  --request POST \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-preview-warning) Update preview warning

[Section titled “Update preview warning”](https://www.daytona.io/docs/en/organizations/#update-preview-warning)

Enable or disable the preview URL warning page that the proxy shows for sandboxes in an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-834)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/preview-warning' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "previewWarningEnabled": false

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-sandbox-default-limited-network-egress) Update sandbox default limited network egress

[Section titled “Update sandbox default limited network egress”](https://www.daytona.io/docs/en/organizations/#update-sandbox-default-limited-network-egress)

Update the sandbox default limited network egress for an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-835)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/sandbox-default-limited-network-egress' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "sandboxDefaultLimitedNetworkEgress": true

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-experimental-configuration) Update experimental configuration

[Section titled “Update experimental configuration”](https://www.daytona.io/docs/en/organizations/#update-experimental-configuration)

Update the experimental configuration for an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-836)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/experimental-config' \

  --request PUT \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "otel": {

    "endpoint": "http://otel-collector:4317",

    "headers": {

      "api-key": "XXX"

    }

  }

}'
```

## [\#](https://www.daytona.io/docs/en/organizations/\#opentelemetry-configuration) OpenTelemetry configuration

[Section titled “OpenTelemetry configuration”](https://www.daytona.io/docs/en/organizations/#opentelemetry-configuration)

Manage the OpenTelemetry (OTEL) configuration for an organization. The configuration consists of a collector endpoint and optional headers sent with each export request.

### [\#](https://www.daytona.io/docs/en/organizations/\#get-otel-configuration) Get OTEL configuration

[Section titled “Get OTEL configuration”](https://www.daytona.io/docs/en/organizations/#get-otel-configuration)

Get the OTEL configuration for an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-837)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/otel-config' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#get-otel-configuration-by-sandbox-auth-token) Get OTEL configuration by sandbox auth token

[Section titled “Get OTEL configuration by sandbox auth token”](https://www.daytona.io/docs/en/organizations/#get-otel-configuration-by-sandbox-auth-token)

Get the OTEL configuration of the organization that owns a sandbox, identified by the sandbox auth token.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-838)

```
curl 'https://app.daytona.io/api/organizations/otel-config/by-sandbox-auth-token/SANDBOX_AUTH_TOKEN' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#update-otel-configuration) Update OTEL configuration

[Section titled “Update OTEL configuration”](https://www.daytona.io/docs/en/organizations/#update-otel-configuration)

Update the OTEL configuration for an organization. `endpoint` is required; `headers` is optional.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-839)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/otel-config' \

  --request PUT \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "endpoint": "http://otel-collector:4317",

  "headers": {

    "x-api-key": "my-api-key"

  }

}'
```

### [\#](https://www.daytona.io/docs/en/organizations/\#delete-otel-configuration) Delete OTEL configuration

[Section titled “Delete OTEL configuration”](https://www.daytona.io/docs/en/organizations/#delete-otel-configuration)

Delete the OTEL configuration for an organization.

- [API](https://www.daytona.io/docs/en/organizations/#tab-panel-840)

```
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/otel-config' \

  --request DELETE \

  --header 'Authorization: Bearer YOUR_API_KEY'
```