/**
 * LinkedIn OpenID Connect protocol mechanics: PKCE generation, the
 * authorization URL, the local redirect listener, and the code/token
 * exchange. Pure translation between this module's inputs and LinkedIn's wire
 * format; nothing here talks to the authorization seam.
 * @module @deepseek-ai/dsh-linkedin-oauth/oidc
 */

import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HarnessError } from '@deepseek-ai/dsh-llm'

/** LinkedIn's OpenID Connect authorization endpoint. Protocol constant, never configurable. */
export const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization'

/** LinkedIn's OpenID Connect token endpoint. Protocol constant, never configurable. */
export const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

/** Scope requested when a deployment does not override it: sign-in plus the basic OpenID Connect profile claims. */
export const DEFAULT_SCOPE = 'openid profile email'

/** One PKCE (RFC 7636) pair: the secret verifier kept by this process, and the S256 challenge sent to LinkedIn. */
export interface PkcePair {
  verifier: string
  challenge: string
}

/**
 * Generate a fresh PKCE verifier/challenge pair with the S256 method LinkedIn requires.
 * @returns the pair; the verifier never leaves this process before the token exchange.
 */
export function generatePkce(): PkcePair {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** Generate the opaque anti-CSRF value echoed back verbatim by LinkedIn's redirect. */
export function generateState(): string {
  return randomBytes(16).toString('base64url')
}

/** Inputs to {@link buildAuthorizeUrl}. */
export interface AuthorizeUrlParams {
  clientId: string
  redirectUri: string
  scope: string
  state: string
  challenge: string
}

/**
 * Build the URL a human opens to sign in with LinkedIn.
 * @param params - client, redirect, scope, anti-CSRF state, and PKCE challenge.
 * @returns the full authorization URL.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', params.scope)
  url.searchParams.set('code_challenge', params.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

/** The authorization code and echoed state LinkedIn's redirect carried. */
export interface CallbackResult {
  code: string
  state: string
}

/**
 * Listen for LinkedIn's redirect on the exact host, port, and path named by
 * `redirectUri`, resolve with the query it carried, and close the listener
 * either way. The response body is a static confirmation page; nothing here
 * reads or writes a session cookie or any other browser state.
 * @param redirectUri - the registered redirect URI; its port and path are what the listener binds.
 * @param signal - aborts the wait — a withdrawn or cancelled attempt closes the listener without a response.
 * @param onListening - test hook reporting the bound port; unused in production, where `redirectUri` already names a fixed port.
 * @returns the authorization code and state LinkedIn sent back.
 * @throws HarnessError with code `LINKEDIN_AUTHORIZATION_DENIED` when the human declined on LinkedIn's page, or
 *   `LINKEDIN_NO_CODE` when the redirect carried neither.
 */
export function awaitCallback(
  redirectUri: string,
  signal: AbortSignal,
  onListening?: (port: number) => void,
): Promise<CallbackResult> {
  const target = new URL(redirectUri)
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      /* v8 ignore next -- Node always sets `req.url` for a real request; this
         protects a hand-built request the test suite does not construct. */
      const requestUrl = new URL(req.url ?? '/', target.origin)
      if (requestUrl.pathname !== target.pathname) {
        res.writeHead(404).end()
        return
      }
      const code = requestUrl.searchParams.get('code')
      const state = requestUrl.searchParams.get('state')
      const error = requestUrl.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(error === null
        ? '<html><body>Signed in with LinkedIn. You can close this tab.</body></html>'
        : '<html><body>LinkedIn sign-in was not completed. You can close this tab.</body></html>')
      server.close()
      if (error !== null) {
        reject(new HarnessError(`LinkedIn returned an authorization error: ${error}`, 'LINKEDIN_AUTHORIZATION_DENIED'))
      } else if (code === null || state === null) {
        reject(new HarnessError('LinkedIn redirect carried no authorization code', 'LINKEDIN_NO_CODE'))
      } else {
        resolve({ code, state })
      }
    })
    const onAbort = (): void => {
      server.close()
      reject(signal.reason as Error)
    }
    server.once('error', (error) => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
    server.once('close', () => { signal.removeEventListener('abort', onAbort) })
    signal.addEventListener('abort', onAbort, { once: true })
    server.listen(Number(target.port), target.hostname, () => {
      onListening?.((server.address() as AddressInfo).port)
    })
  })
}

/** The OpenID Connect token response this flow commits as its credential record, kept verbatim for its owner. */
export interface LinkedInGrant {
  accessToken: string
  idToken: string
  expiresAt: number
  scope: string
}

/** LinkedIn's token endpoint response shape; only the fields this module reads. */
interface TokenResponse {
  access_token: string
  id_token?: string
  expires_in: number
  scope?: string
  error?: string
  error_description?: string
}

/** Inputs to {@link exchangeCode}. */
export interface ExchangeCodeParams {
  code: string
  verifier: string
  redirectUri: string
  clientId: string
  clientSecret: string
  signal: AbortSignal
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
}

/**
 * Exchange an authorization code for LinkedIn's OpenID Connect tokens.
 * @param params - the code, PKCE verifier, and client credentials that authenticate the exchange.
 * @returns the access token, id token, and expiry this flow commits as the credential record.
 * @throws HarnessError with code `LINKEDIN_TOKEN_EXCHANGE_FAILED` when LinkedIn rejects the exchange, or
 *   `LINKEDIN_NO_ID_TOKEN` when the response omits the OpenID Connect id token.
 */
export async function exchangeCode(params: ExchangeCodeParams): Promise<LinkedInGrant> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.verifier,
  })
  const doFetch = params.fetchImpl ?? fetch
  const response = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: params.signal,
  })
  const payload = await response.json() as TokenResponse
  if (!response.ok || payload.error !== undefined) {
    throw new HarnessError(
      payload.error_description ?? `LinkedIn token exchange failed with status ${response.status}`,
      'LINKEDIN_TOKEN_EXCHANGE_FAILED',
    )
  }
  if (payload.id_token === undefined) {
    throw new HarnessError('LinkedIn token response carried no OpenID Connect id token', 'LINKEDIN_NO_ID_TOKEN')
  }
  return {
    accessToken: payload.access_token,
    idToken: payload.id_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
    scope: payload.scope ?? '',
  }
}
