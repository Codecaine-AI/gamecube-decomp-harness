---
url: "https://www.daytona.io/docs/en/organizations.md"
title: undefined
---

\# Organizations

Daytona provides organizations as a way to group resources and enable collaboration. Users can work individually in their personal organization or together in a collaborative organization.

Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard) to manage your organizations, or use the \[API\](https://www.daytona.io/docs/en/tools/api.md#daytona/tag/organizations) to manage them programmatically.

\## Personal vs Collaborative

Every Daytona user starts with a personal organization, ideal for solo use and experimentation. Collaborative organizations are created manually and designed for company-wide collaboration with shared access and controls.

\| \*\*Feature\*\* \| \*\*Personal organization\*\* \| \*\*Collaborative organization\*\* \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| \*\*Creation\*\* \| Automatic on signup \| Manually by a user \|
\| \*\*Members\*\* \| Single user only \| Multiple users (invite-based) \|
\| \*\*Access Control\*\* \| No roles or permissions \| Roles with granular resource-based assignments \|
\| \*\*Billing\*\* \| Tied to individual user \| Shared across team members \|
\| \*\*Use Case\*\* \| Personal testing, small projects \| Company/team development and production \|
\| \*\*Quota Scope\*\* \| Per user \| Shared across all members \|
\| \*\*Deletable\*\* \| No \| Yes (by Owner) \|

Users can switch between their personal and collaborative organizations by using the dropdown in the \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard) sidebar. Each organization has its own sandboxes, API keys, and resource quotas.

\## Create organization

Daytona provides options to create organizations in \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/) or programmatically using the \[API\](https://www.daytona.io/docs/en/tools/api.md#daytona/tag/organizations).

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/)
2\. Expand the dropdown at the top-left corner of the sidebar to view your organizations
3\. Click the \*\*Create Organization\*\* button
4\. Enter the organization name
5\. Select a \[region\](https://www.daytona.io/docs/en/regions.md)
6\. Click \*\*Create\*\*

\`\`\`bash
curl 'https://app.daytona.io/api/organizations' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "My Organization",
 "defaultRegionId": "us"
}'
\`\`\`

\## List organizations

List all organizations the authenticated user belongs to.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Get by ID

Get an organization by ID.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Leave organization

Leave an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/)
2\. Expand the dropdown at the top-left corner of the sidebar to view your organizations
3\. Select the organization you want to leave
4\. Click \*\*Settings\*\* in the sidebar
5\. Click \*\*Leave Organization\*\*
6\. Confirm by clicking the \*\*Leave\*\* button

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/leave' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Delete organization

Delete an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/)
2\. Expand the dropdown at the top-left corner of the sidebar to view your organizations
3\. Select the organization you want to delete
4\. Click \*\*Settings\*\* in the sidebar
5\. Click \*\*Delete Organization\*\*
6\. Confirm the deletion by typing the organization name and clicking the \*\*Delete\*\* button

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID' \
 --request DELETE \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Roles

Users within an organization can have one of two different roles:

1\. \*\*Owners\*\* have full administrative access to the organization and its resources. Organization owners can perform administrative actions.
2\. \*\*Members\*\* have no administrative access to the organization, while their access to organization resources is based on \[\*\*Assignments\*\*\](#role-assignments).

\### Role assignments

The list of available role assignments includes:

\| Assignment \| Description \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| \*\*\`Viewer (required)\`\*\* \| Grants read access to all resources in the organization \|
\| \*\*\`Developer\`\*\* \| Grants the ability to create sandboxes and keys in the organization \|
\| \*\*\`Sandboxes Admin\`\*\* \| Grants admin access to sandboxes in the organization \|
\| \*\*\`Snapshots Admin\`\*\* \| Grants admin access to snapshots in the organization \|
\| \*\*\`Registries Admin\`\*\* \| Grants admin access to registries in the organization \|
\| \*\*\`Volumes Admin\`\*\* \| Grants admin access to volumes in the organization \|
\| \*\*\`Super Admin\`\*\* \| Grants full access to all resources in the organization \|
\| \*\*\`SSO Admin\`\*\* \| Grants permission to manage the organization's \[SSO\](https://www.daytona.io/docs/en/sso.md) identity providers \|
\| \*\*\`Auditor\`\*\* \| Grants access to audit logs in the organization \|
\| \*\*\`Infrastructure Admin\`\*\* \| Grants admin access to infrastructure in the organization \|

\### Create role

Create a new role in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/roles' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "Maintainer",
 "description": "Can manage all resources",
 "permissions": \["write:sandboxes", "delete:sandboxes"\]
}'
\`\`\`

\### List roles

List all roles in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/roles' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update role

Update a role in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/roles/ROLE\_ID' \
 --request PUT \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "name": "Maintainer",
 "description": "Can manage all resources",
 "permissions": \["write:sandboxes", "delete:sandboxes"\]
}'
\`\`\`

\### Delete role

Delete a role in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/roles/ROLE\_ID' \
 --request DELETE \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Members

Daytona provides methods to manage members in an organization.

\### List members

List all members in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/users' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Invite members

Invite a new user to an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/members)
2\. Click the \*\*Invite Member\*\* button
3\. Enter the email address of the user you want to invite
4\. \[Select a role\](#roles) for the new user. If you select the \*\*\`Member\`\*\* role, define their \[assignments\](#role-assignments)

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/invitations' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "email": "mail@example.com",
 "role": "member",
 "assignedRoleIds": \["00000000-0000-0000-0000-000000000001"\]
}'
\`\`\`

\### Remove members

Remove a user from an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/members)
2\. Click the \*\*Remove\*\* button next to the user you want to remove
3\. Confirm the removal by clicking the \*\*Remove\*\* button

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/users/USER\_ID' \
 --request DELETE \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update access

Update the access of a member in an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/members)
2\. Click the three-dot menu on the member row
3\. Click \*\*Change Role\*\* or \*\*Manage Assignments\*\*
4\. Update the role or assignments and click \*\*Save\*\*

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/users/USER\_ID/access' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "role": "member",
 "assignedRoleIds": \["00000000-0000-0000-0000-000000000001"\]
}'
\`\`\`

\## Invitations

Manage invitations in an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/user/invitations)
2\. Expand the dropdown at the bottom of the sidebar to view pending invitations to join other organizations.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/invitations' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Get invitations count

Get the number of invitations in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/invitations/count' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Accept invitation

Accept a pending organization invitation.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/)
2\. Click your profile at the bottom-left of the sidebar
3\. Click \*\*Invitations\*\*
4\. Click the checkmark button on the invitation row

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/invitations/INVITATION\_ID/accept' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

Once a user accepts an invitation to join an organization, they get access to resource quotas assigned to that organization and they may proceed by issuing a new \[API key\](https://www.daytona.io/docs/en/api-keys.md) and creating sandboxes.

\### Decline invitation

Decline a pending organization invitation.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/)
2\. Click your profile at the bottom-left of the sidebar
3\. Click \*\*Invitations\*\*
4\. Click the X button on the invitation row
5\. Confirm by clicking the \*\*Decline\*\* button

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/invitations/INVITATION\_ID/decline' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### List pending

List pending invitations for an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/invitations' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update invitation

Update an invitation for an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/members)
2\. Scroll to the \*\*Invitations\*\* table
3\. Click the three-dot menu on the invitation row
4\. Click \*\*Edit\*\*
5\. Update the role or assignments and click \*\*Update\*\*

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/invitations/INVITATION\_ID' \
 --request PUT \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "role": "member",
 "assignedRoleIds": \["00000000-0000-0000-0000-000000000001"\],
 "expiresAt": "2030-01-01T00:00:00.000Z"
}'
\`\`\`

\### Cancel invitation

Cancel an invitation for an organization.

1\. Go to \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/members)
2\. Scroll to the \*\*Invitations\*\* table
3\. Click the three-dot menu on the invitation row
4\. Click \*\*Cancel\*\*
5\. Confirm by clicking the \*\*Confirm\*\* button

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/invitations/INVITATION\_ID/cancel' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Regions

Each organization has a default \[region\](https://www.daytona.io/docs/en/regions.md) that determines where sandboxes are created when no specific target is provided. Regions represent geographic or logical groupings of compute infrastructure. Organizations can update their default region, manage per-region resource quotas, and query region quota information for individual sandboxes.

For more information on available region types, see the \[Regions\](https://www.daytona.io/docs/en/regions.md) guide.

\### Set default region

Set the default region.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/default-region' \
 --request PATCH \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "defaultRegionId": "us"
}'
\`\`\`

\### Update region quota

Update the resource quota for an organization in a specific region. \`totalCpuQuota\`, \`totalMemoryQuota\`, \`totalDiskQuota\`, and \`totalGpuQuota\` are required; per-sandbox limits and allowed GPU types are optional.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/quota/REGION\_ID' \
 --request PATCH \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "totalCpuQuota": 100,
 "totalMemoryQuota": 200,
 "totalDiskQuota": 500,
 "totalGpuQuota": 0
}'
\`\`\`

\### List available sandbox classes

List the sandbox classes available to an organization. Each entry includes the region ID, the sandbox class, whether GPUs are available, and the allowed GPU types.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/available-sandbox-classes' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\## Organization settings

The settings page in the \[Daytona Dashboard ↗\](https://app.daytona.io/dashboard/settings) allows you to view the organization ID and name, and optionally delete the organization if you don't need it anymore. This action is irreversible, so please proceed with caution. Personal organizations are there by default and cannot be deleted.

\## Advanced operations

Daytona provides methods to perform advanced operations on an organization.

\### Usage overview

Get the usage overview for an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/usage' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update organization quota

Update the resource quota for an organization. All fields are optional; omitted fields are left unchanged.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/quota' \
 --request PATCH \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "maxCpuPerSandbox": 4,
 "maxMemoryPerSandbox": 8,
 "maxDiskPerSandbox": 10,
 "snapshotQuota": 100,
 "volumeQuota": 100,
 "secretQuota": 100
}'
\`\`\`

\### Suspend organization

Suspend an organization. \`reason\` and \`until\` are required. \`suspensionCleanupGracePeriodHours\` sets the number of hours before suspended resources are cleaned up.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/suspend' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "reason": "Payment overdue",
 "until": "2030-01-01T00:00:00.000Z",
 "suspensionCleanupGracePeriodHours": 24
}'
\`\`\`

\### Unsuspend organization

Remove the suspension from an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/unsuspend' \
 --request POST \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update preview warning

Enable or disable the preview URL warning page that the proxy shows for sandboxes in an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/preview-warning' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "previewWarningEnabled": false
}'
\`\`\`

\### Update sandbox default limited network egress

Update the sandbox default limited network egress for an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/sandbox-default-limited-network-egress' \
 --request POST \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "sandboxDefaultLimitedNetworkEgress": true
}'
\`\`\`

\### Update experimental configuration

Update the experimental configuration for an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/experimental-config' \
 --request PUT \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "otel": {
 "endpoint": "http://otel-collector:4317",
 "headers": {
 "api-key": "XXX"
 }
 }
}'
\`\`\`

\## OpenTelemetry configuration

Manage the OpenTelemetry (OTEL) configuration for an organization. The configuration consists of a collector endpoint and optional headers sent with each export request.

\### Get OTEL configuration

Get the OTEL configuration for an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/otel-config' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Get OTEL configuration by sandbox auth token

Get the OTEL configuration of the organization that owns a sandbox, identified by the sandbox auth token.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/otel-config/by-sandbox-auth-token/SANDBOX\_AUTH\_TOKEN' \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`

\### Update OTEL configuration

Update the OTEL configuration for an organization. \`endpoint\` is required; \`headers\` is optional.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/otel-config' \
 --request PUT \
 --header 'Content-Type: application/json' \
 --header 'Authorization: Bearer YOUR\_API\_KEY' \
 --data '{
 "endpoint": "http://otel-collector:4317",
 "headers": {
 "x-api-key": "my-api-key"
 }
}'
\`\`\`

\### Delete OTEL configuration

Delete the OTEL configuration for an organization.

\`\`\`bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION\_ID/otel-config' \
 --request DELETE \
 --header 'Authorization: Bearer YOUR\_API\_KEY'
\`\`\`