---
description: "\"Sign in with LinkedIn\" authorization flow: LinkedIn's OpenID Connect grant, obtained through the authorization seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-linkedin-oauth

English

## Summary

`dsh-linkedin-oauth` registers one `ctx.authorization` flow — `linkedin-oauth/account` — that signs a human into LinkedIn through OpenID Connect: authorization code plus PKCE, run through a short-lived local redirect listener. Continuing the resolved attempt commits the access token, id token, and expiry as a `GrantRecord` through `ctx.credentials`; nothing above this package sees the token payload. Mount it once with a LinkedIn app's client id, client secret, and registered redirect URI, and any surface that runs `ctx.authorization.begin({ key: LINKEDIN_ACCOUNT_KEY, interaction })` can offer "Sign in with LinkedIn".

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

```ts
ctx.plugin(LinkedInOAuth, {
  clientId: 'xxxx',
  clientSecret: 'xxxx',
  redirectUri: 'http://127.0.0.1:3005/callback', // must match the LinkedIn app's registered redirect
})
```

The plugin requires `ctx.authorization` and `ctx.credentials` mounted (`dsh-authorization` and a credential-record provider such as `dsh-credentials-local`). `redirectUri` and `scope` default to `http://127.0.0.1:3005/callback` and `openid profile email`; a deployment overriding `redirectUri` must register the same URI with its LinkedIn app.

A surface starts the sign-in with the standard authorization seam call:

```ts
import { LINKEDIN_ACCOUNT_KEY } from '@deepseek-ai/dsh-linkedin-oauth'

const outcome = await ctx.authorization.begin({ key: LINKEDIN_ACCOUNT_KEY, interaction })
```

`interaction.notify()` receives the LinkedIn authorization URL to open; the flow itself asks no questions.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Registers the flow: builds the authorize URL, awaits the redirect, exchanges the code, commits the record |
| [`src/oidc.ts`](src/oidc.ts) | LinkedIn's OpenID Connect protocol mechanics: PKCE, the authorize URL, the local redirect listener, the token exchange |

### Design

PKCE and an anti-CSRF `state` are generated per attempt; the local listener binds the exact host, port, and path named by `redirectUri` and closes itself once it has answered the one redirect it exists to receive, or when the attempt's signal aborts first. A returned `state` that does not match the one this attempt sent fails the attempt before any token exchange runs, rather than trusting a redirect that could belong to a stale or concurrent attempt. The id token is stored verbatim in the committed `GrantRecord`; this package does not verify its signature or decode its claims — a consumer that needs LinkedIn's identity claims verifies the token itself.

</details>

No invariant companion is published because the only observable relation this package owns — a registered flow's key committing a record before `run()` resolves — is already enforced by `dsh-authorization`'s `NOT_COMMITTED` check on every attempt; this package holds no other independent mutable relation to audit.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this package is a poor fit or needs special care. They are current package constraints, not a task backlog.

- **The id token is not verified.** The flow stores LinkedIn's id token as-is; a consumer that trusts its claims must verify its signature against LinkedIn's JWKS itself.
- **The redirect listener is single-attempt.** It answers the one redirect it is waiting for and closes; a browser reload during sign-in abandons the attempt, matching `dsh-authorization`'s own limit.
- **Nothing revokes on sign-out.** Removing the record (`ctx.credentials.deleteRecord(LINKEDIN_ACCOUNT_KEY)`) forgets it locally without telling LinkedIn.
