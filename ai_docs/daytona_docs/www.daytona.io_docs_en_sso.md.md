---
url: "https://www.daytona.io/docs/en/sso.md"
title: undefined
---

# Organization SSO

Organization SSO (Single Sign-On) lets collaborative organizations sign members in through an OpenID Connect identity provider. Members authenticate with that provider, and Daytona creates or links their account and joins them to the organization with the roles you configure.

You register the provider once, share an organization SSO link with members, and Daytona handles provisioning, membership, and confirmation. Supported identity providers include **Google Workspace**, **Microsoft Entra ID**, **Okta**, **Auth0**, **Keycloak**, **OneLogin**, and any custom OIDC-compliant identity provider. Existing Daytona logins continue to work alongside the organization SSO.

Managing identity providers requires the **`manage:sso`** permission. Organization owners and members with the **SSO Admin** assignment can open the SSO page. See [roles](https://www.daytona.io/docs/en/organizations.md#roles).

:::note
SSO is available on the Enterprise plan for collaborative organizations.
:::

## Configure an identity provider

Configure an OIDC identity provider for your organization. Select an identity provider template:

- [Google Workspace](#google-workspace)
- [Microsoft Entra ID](#microsoft-entra-id)
- [Okta](#okta)
- [Auth0](#auth0)
- [Keycloak](#keycloak)
- [OneLogin](#onelogin)
- [Custom OIDC](#custom-oidc)

### Configuration options

| **Option** | **Description** |
| ---------- | --------------- |
| **`name`** | Display name for the identity provider |
| **`oidcConfig.issuerUrl`** | OIDC issuer URL. Daytona fetches **`{issuerUrl}/.well-known/openid-configuration`** for discovery |
| **`oidcConfig.clientId`** | OAuth client ID from your identity provider |
| **`oidcConfig.clientSecret`** | OAuth client secret from your identity provider |
| **`oidcConfig.scope`** | OAuth scopes. Default: **`openid email profile`** |
| **`emailDomains`** | Domains allowed for this identity provider. Required unless **`allowAnyDomain`** is **`true`**. Each domain must be owned by a first-party verified organization member |
| **`allowAnyDomain`** | When **`true`**, accepts any email domain returned by the identity provider. Use only for trusted identity providers that strictly control who can authenticate. Default: **`false`** |
| **`trustEmailVerified`** | When **`true`**, skips the **`email_verified`** claim check (**Skip email verification check** in the dashboard). Required for providers such as **Microsoft Entra ID** that do not return **`email_verified`**. Default: **`false`** |
| **`defaultAssignedRoleIds`** | Organization role IDs assigned when a user joins via SSO (**Default role assignments** in the dashboard). Empty grants membership with no resource permissions. Default: **`[]`** |
| **`enabled`** | Whether the identity provider accepts sign-ins. Default: **`true`** |

A domain can be claimed by at most one identity provider across Daytona. Claiming a domain requires at least one organization member with a first-party verified email on that domain. Email addresses verified only through SSO do not satisfy domain ownership.

### Google Workspace

Configure Google Workspace as an OIDC identity provider for your organization.

1. **Prerequisite**: 

    OAuth client in Google Cloud Console with the Authorization Code grant
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **Google Workspace**
5. Copy the **Callback URI** and add it to the OAuth client's authorized redirect URIs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Google Workspace",
  "oidcConfig": {
    "issuerUrl": "https://accounts.google.com",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": false,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


### Microsoft Entra ID

Configure Microsoft Entra ID as an OIDC identity provider for your organization.

1. **Prerequisite**: 

    Web application in Microsoft Entra ID with the Authorization Code grant and a client secret. Add **`email`** as an optional claim for the ID token and UserInfo response, and ensure each user has a populated mail attribute. Enable **Skip email verification check** (**`trustEmailVerified: true`**) because Entra ID does not normally return **`email_verified`**. Use the tenant-specific v2.0 issuer **`https://login.microsoftonline.com/{tenant-id}/v2.0`** instead of the multi-tenant **`common`** or **`organizations`** issuer
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **Microsoft Entra ID**
5. Copy the **Callback URI** and add it to the application's redirect URIs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**

:::note
Fallback to **`preferred_username`** or **`upn`** when **`email`** is absent is planned. Returning the standard **`email`** claim remains the supported approach.
:::


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Microsoft Entra ID",
  "oidcConfig": {
    "issuerUrl": "https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": true,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


### Okta

Configure Okta as an OIDC identity provider for your organization.

1. **Prerequisite**: 

    OpenID Connect web application in Okta with the Authorization Code grant and client secret authentication. Map the user's email address to the standard OIDC **`email`** claim
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **Okta**
5. Copy the **Callback URI** and add it to Sign-in redirect URIs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Okta",
  "oidcConfig": {
    "issuerUrl": "https://your-domain.okta.com",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": false,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


### Auth0

Configure Auth0 as an OIDC identity provider for your organization.

1. **Prerequisite**: 

    Regular Web Application in Auth0 with the Authorization Code grant
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **Auth0**
5. Copy the **Callback URI** and add it to Allowed Callback URLs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Auth0",
  "oidcConfig": {
    "issuerUrl": "https://your-tenant.auth0.com",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": false,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


### Keycloak

Configure Keycloak as an OIDC identity provider for your organization.

1. **Prerequisite**: 

    OpenID Connect client in Keycloak with the Authorization Code flow and client authentication (client secret)
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **Keycloak**
5. Copy the **Callback URI** and add it to Valid redirect URIs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Keycloak",
  "oidcConfig": {
    "issuerUrl": "https://keycloak.example.com/realms/your-realm",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": false,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


### OneLogin

Configure OneLogin as an OIDC identity provider for your organization.

1. **Prerequisite**: 

    OpenID Connect application in OneLogin with the Authorization Code grant and client secret authentication
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **OneLogin**
5. Copy the **Callback URI** and add it to Redirect URIs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "OneLogin",
  "oidcConfig": {
    "issuerUrl": "https://your-domain.onelogin.com/oidc/2",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": false,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


### Custom OIDC

Configure any OIDC-compliant identity provider that is not covered by the templates above.

1. **Prerequisite**: 

    OpenID Connect web application in your identity provider with the Authorization Code grant and client secret authentication. Discovery must be available at **`{issuer-url}/.well-known/openid-configuration`**
2. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
3. Click **Add Provider**
4. Select **Custom OIDC**
5. Copy the **Callback URI** and add it to the identity provider's allowed redirect URLs. The URI must match exactly: **`https://app.daytona.io/api/auth/sso/callback`**
6. Enter the [configuration](#configuration-options)
7. Optionally click **Test** next to **Issuer URL** to verify OIDC discovery
8. Click **Create**

Missing **`email`** fails with **`missing_email`**. Missing or false **`email_verified`** (when **Skip email verification check** is off) fails with **`email_not_verified`**.


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Custom OIDC",
  "oidcConfig": {
    "issuerUrl": "https://your-idp.example.com",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "scope": "openid email profile"
  },
  "emailDomains": ["company.com"],
  "allowAnyDomain": false,
  "trustEmailVerified": false,
  "defaultAssignedRoleIds": ["00000000-0000-0000-0000-000000000001"],
  "enabled": true
}'
```


## Sign in with SSO

Share the organization SSO login URL with members. The URL is shown on the SSO page for each configured provider: **`https://app.daytona.io/api/auth/sso/org/ORGANIZATION_ID`**

When a user signs in through the organization's identity provider for the first time:

- If no Daytona account exists for that email, Daytona creates the account and joins the user to the organization with the identity provider's **`defaultAssignedRoleIds`** (JIT provisioning)
- If a Daytona account already exists for that email, Daytona does not auto-link the SSO identity. The account owner must [confirm the link](#link-an-existing-account) from account settings

Subsequent sign-ins through a linked SSO identity also ensure organization membership.

## Link an existing account

When SSO sign-in matches an existing Daytona account that is not yet linked to that IdP, Daytona creates a pending link request and redirects the user to account settings. The account owner must sign in with an existing method and confirm the request.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/user/account-settings)
2. Under **Single sign-on link requests**, review the pending request
3. Click **Link this SSO** to allow future sign-ins through that IdP, or **Dismiss** to reject it

Pending SSO link requests are separate from [linked accounts](https://www.daytona.io/docs/en/linked-accounts.md) (Google and GitHub).

## List identity providers

List identity providers for an organization.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```


## Get identity provider

Get an identity provider by ID.


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers/IDENTITY_PROVIDER_ID' \
  --header 'Authorization: Bearer YOUR_API_KEY'
```


## Update an identity provider

Update an identity provider's configuration.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
2. Open the actions menu on the provider row
3. Click **Edit**
4. Update the configuration and click **Save Changes**


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers/IDENTITY_PROVIDER_ID' \
  --request PATCH \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{
  "name": "Company Okta",
  "emailDomains": ["company.com"],
  "trustEmailVerified": false,
  "enabled": true
}'
```


## Delete an identity provider

Delete an identity provider. Existing Daytona accounts remain, but users can no longer sign in through that IdP until it is reconfigured and linked again.

1. Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sso)
2. Open the actions menu on the provider row
3. Click **Delete**
4. Confirm the deletion


```bash
curl 'https://app.daytona.io/api/organizations/ORGANIZATION_ID/identity-providers/IDENTITY_PROVIDER_ID' \
  --request DELETE \
  --header 'Authorization: Bearer YOUR_API_KEY'
```