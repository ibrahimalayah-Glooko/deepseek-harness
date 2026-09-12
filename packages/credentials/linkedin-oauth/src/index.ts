/**
 * "Sign in with LinkedIn" authorization flow: registers one `ctx.authorization`
 * flow that runs LinkedIn's OpenID Connect grant (this package's "open
 * connector" — OIDC, authorization code plus PKCE) through a short-lived local
 * redirect listener, and commits the resulting tokens as a `GrantRecord`.
 *
 * ```ts
 * ctx.plugin(LinkedInOAuth, {
 *   clientId: 'xxxx',
 *   clientSecret: 'xxxx',
 *   redirectUri: 'http://127.0.0.1:3005/callback', // must match the LinkedIn app registration
 * })
 * ```
 *
 * @module @deepseek-ai/dsh-linkedin-oauth
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { awaitCallback, buildAuthorizeUrl, DEFAULT_SCOPE, exchangeCode, generatePkce, generateState } from './oidc.ts'
import type { LinkedInGrant } from './oidc.ts'

export { AUTHORIZE_URL, TOKEN_URL, type LinkedInGrant } from './oidc.ts'

export const name = 'linkedin-oauth'

/** Services this plugin registers a flow and commits records through. */
export const inject = ['authorization', 'credentials']

/** Plugin config: the LinkedIn app registration this flow signs into. */
export interface Config {
  /** LinkedIn app client id. */
  clientId: string
  /** LinkedIn app client secret. */
  clientSecret: string
  /**
   * Redirect URI registered with the LinkedIn app; its port and path are what
   * the local redirect listener binds to. Defaults to
   * `http://127.0.0.1:3005/callback`.
   */
  redirectUri?: string
  /** OAuth scope requested; defaults to `openid profile email`. */
  scope?: string
}

export const Config: Schema<Config> = Schema.object({
  clientId: Schema.string().required(),
  clientSecret: Schema.string().required(),
  redirectUri: Schema.string().default('http://127.0.0.1:3005/callback'),
  scope: Schema.string().default(DEFAULT_SCOPE),
})

/** The credential record this flow writes, scoped to this package so a second LinkedIn integration cannot collide with it. */
export const LINKEDIN_ACCOUNT_KEY = credentialKey('linkedin-oauth', 'account')

/**
 * Mount the "Sign in with LinkedIn" authorization flow.
 * @param ctx - Cordis context carrying `ctx.authorization` and `ctx.credentials`.
 * @param config - the LinkedIn app registration and redirect this flow signs into.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.authorization.registerFlow({
    key: LINKEDIN_ACCOUNT_KEY,
    label: 'LinkedIn',
    methods: [{ id: 'oidc', label: 'Sign in with LinkedIn' }],
    async run(session: AuthorizationSession) {
      const { verifier, challenge } = generatePkce()
      const state = generateState()
      /* v8 ignore start -- Cordis applies the Config schema's defaults before apply(); this only protects a
         direct apply() caller that skips validation. */
      const redirectUri = config.redirectUri ?? 'http://127.0.0.1:3005/callback'
      const scope = config.scope ?? DEFAULT_SCOPE
      /* v8 ignore stop */
      const authorizeUrl = buildAuthorizeUrl({ clientId: config.clientId, redirectUri, scope, state, challenge })

      // Started before the notice so the listener is already bound when the
      // human's browser reaches it, never after.
      const pending = awaitCallback(redirectUri, session.signal)
      session.notify({ message: 'Continue in your browser to sign in with LinkedIn', url: authorizeUrl })
      const callback = await pending
      if (callback.state !== state) {
        throw new HarnessError(
          'LinkedIn redirect state did not match the request that started it', 'LINKEDIN_STATE_MISMATCH')
      }

      const grant: LinkedInGrant = await exchangeCode({
        code: callback.code,
        verifier,
        redirectUri,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        signal: session.signal,
      })

      await ctx.credentials.modifyRecord(LINKEDIN_ACCOUNT_KEY, () =>
        Promise.resolve({ kind: 'grant', payload: grant }))
    },
  }), 'linkedin-oauth.registerFlow()')
}
