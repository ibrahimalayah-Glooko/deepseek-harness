import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  AUTHORIZE_URL,
  awaitCallback,
  buildAuthorizeUrl,
  DEFAULT_SCOPE,
  exchangeCode,
  generatePkce,
  generateState,
  TOKEN_URL,
} from '../src/oidc.ts'

describe('generatePkce', () => {
  it('derives the S256 challenge from the verifier', () => {
    const { verifier, challenge } = generatePkce()
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('produces a fresh pair each call', () => {
    const first = generatePkce()
    const second = generatePkce()
    expect(first.verifier).not.toBe(second.verifier)
  })
})

describe('generateState', () => {
  it('produces a fresh opaque value each call', () => {
    expect(generateState()).not.toBe(generateState())
  })
})

describe('buildAuthorizeUrl', () => {
  it('names LinkedIn\'s authorization endpoint with every required parameter', () => {
    const url = new URL(buildAuthorizeUrl({
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:3005/callback',
      scope: DEFAULT_SCOPE,
      state: 'state-1',
      challenge: 'challenge-1',
    }))
    expect(url.origin + url.pathname).toBe(AUTHORIZE_URL)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3005/callback')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('scope')).toBe(DEFAULT_SCOPE)
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})

describe('awaitCallback', () => {
  it('resolves with the code and state a redirect carried, and closes the listener', async () => {
    const controller = new AbortController()
    let port: number | undefined
    const pending = awaitCallback('http://127.0.0.1:0/callback', controller.signal, (bound) => { port = bound })
    await vi.waitFor(() => { expect(port).toBeDefined() })
    const response = await fetch(`http://127.0.0.1:${port}/callback?code=auth-code&state=state-1`)
    expect(response.status).toBe(200)
    await expect(pending).resolves.toEqual({ code: 'auth-code', state: 'state-1' })
  })

  it('rejects with LINKEDIN_AUTHORIZATION_DENIED when LinkedIn reports an error', async () => {
    const controller = new AbortController()
    let port: number | undefined
    const pending = awaitCallback('http://127.0.0.1:0/callback', controller.signal, (bound) => { port = bound })
    const rejection = expect(pending).rejects.toMatchObject({ code: 'LINKEDIN_AUTHORIZATION_DENIED' })
    await vi.waitFor(() => { expect(port).toBeDefined() })
    await fetch(`http://127.0.0.1:${port}/callback?error=access_denied`)
    await rejection
  })

  it('rejects with LINKEDIN_NO_CODE when the redirect carries neither a code nor an error', async () => {
    const controller = new AbortController()
    let port: number | undefined
    const pending = awaitCallback('http://127.0.0.1:0/callback', controller.signal, (bound) => { port = bound })
    const rejection = expect(pending).rejects.toMatchObject({ code: 'LINKEDIN_NO_CODE' })
    await vi.waitFor(() => { expect(port).toBeDefined() })
    await fetch(`http://127.0.0.1:${port}/callback`)
    await rejection
  })

  it('rejects and closes the listener when the signal aborts first', async () => {
    const controller = new AbortController()
    let port: number | undefined
    const pending = awaitCallback('http://127.0.0.1:0/callback', controller.signal, (bound) => { port = bound })
    await vi.waitFor(() => { expect(port).toBeDefined() })
    controller.abort(new Error('withdrawn'))
    await expect(pending).rejects.toThrow('withdrawn')
    await expect(fetch(`http://127.0.0.1:${port}/callback?code=x&state=y`)).rejects.toThrow()
  })

  it('answers a request for another path with 404 and keeps waiting for the real callback', async () => {
    const controller = new AbortController()
    let port: number | undefined
    const pending = awaitCallback('http://127.0.0.1:0/callback', controller.signal, (bound) => { port = bound })
    await vi.waitFor(() => { expect(port).toBeDefined() })
    const stray = await fetch(`http://127.0.0.1:${port}/favicon.ico`)
    expect(stray.status).toBe(404)
    await fetch(`http://127.0.0.1:${port}/callback?code=auth-code&state=state-1`)
    await expect(pending).resolves.toEqual({ code: 'auth-code', state: 'state-1' })
  })

  it('rejects when the port is already bound', async () => {
    const holderController = new AbortController()
    let port: number | undefined
    const holder = awaitCallback('http://127.0.0.1:0/callback', holderController.signal, (bound) => { port = bound })
    await vi.waitFor(() => { expect(port).toBeDefined() })
    await expect(awaitCallback(`http://127.0.0.1:${port}/callback`, new AbortController().signal)).rejects.toThrow()
    holderController.abort(new Error('test cleanup'))
    await expect(holder).rejects.toThrow()
  })
})

describe('exchangeCode', () => {
  const params = {
    code: 'auth-code',
    verifier: 'verifier-1',
    redirectUri: 'http://127.0.0.1:3005/callback',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    signal: new AbortController().signal,
  }

  it('posts the grant to LinkedIn\'s token endpoint and returns the parsed grant', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(url).toBe(TOKEN_URL)
      expect(init?.method).toBe('POST')
      const body = new URLSearchParams(init?.body as string)
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('code')).toBe('auth-code')
      expect(body.get('code_verifier')).toBe('verifier-1')
      expect(body.get('client_secret')).toBe('secret-1')
      return new Response(JSON.stringify({
        access_token: 'access-1', id_token: 'id-1', expires_in: 3600, scope: DEFAULT_SCOPE,
      }), { status: 200 })
    })

    const grant = await exchangeCode({ ...params, fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(grant.accessToken).toBe('access-1')
    expect(grant.idToken).toBe('id-1')
    expect(grant.scope).toBe(DEFAULT_SCOPE)
    expect(grant.expiresAt).toBeGreaterThan(Date.now())
  })

  it('throws LINKEDIN_TOKEN_EXCHANGE_FAILED when LinkedIn rejects the exchange', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      error: 'invalid_grant', error_description: 'the code has expired',
    }), { status: 400 })) as unknown as typeof fetch

    await expect(exchangeCode({ ...params, fetchImpl }))
      .rejects.toMatchObject({ code: 'LINKEDIN_TOKEN_EXCHANGE_FAILED', message: 'the code has expired' })
  })

  it('throws LINKEDIN_NO_ID_TOKEN when the response carries no id token', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      access_token: 'access-1', expires_in: 3600,
    }), { status: 200 })) as unknown as typeof fetch

    await expect(exchangeCode({ ...params, fetchImpl }))
      .rejects.toMatchObject({ code: 'LINKEDIN_NO_ID_TOKEN' })
  })

  it('throws LINKEDIN_TOKEN_EXCHANGE_FAILED when the body carries an error despite a 200 status', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      error: 'invalid_scope',
    }), { status: 200 })) as unknown as typeof fetch

    await expect(exchangeCode({ ...params, fetchImpl }))
      .rejects.toMatchObject({ code: 'LINKEDIN_TOKEN_EXCHANGE_FAILED', message: 'LinkedIn token exchange failed with status 200' })
  })

  it('defaults an omitted grant scope to an empty string', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      access_token: 'access-1', id_token: 'id-1', expires_in: 3600,
    }), { status: 200 })) as unknown as typeof fetch

    const grant = await exchangeCode({ ...params, fetchImpl })

    expect(grant.scope).toBe('')
  })

  it('falls back to the global fetch when no fetchImpl is injected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'access-1', id_token: 'id-1', expires_in: 3600, scope: DEFAULT_SCOPE,
    }), { status: 200 }))

    const grant = await exchangeCode(params)

    expect(fetchSpy).toHaveBeenCalledWith(TOKEN_URL, expect.any(Object))
    expect(grant.accessToken).toBe('access-1')
    fetchSpy.mockRestore()
  })
})
