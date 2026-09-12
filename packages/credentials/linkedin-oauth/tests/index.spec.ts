import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { AuthorizationInteraction } from '@deepseek-ai/dsh-authorization'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import { MemoryCredentials } from './memory.ts'

const { awaitCallback, exchangeCode, generateState } = vi.hoisted(() => ({
  awaitCallback: vi.fn(),
  exchangeCode: vi.fn(),
  generateState: vi.fn(() => 'fixed-state'),
}))

vi.mock('../src/oidc.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/oidc.ts')>(),
  awaitCallback,
  exchangeCode,
  generateState,
}))

const LinkedInOAuth = await import('../src/index.ts')
const { LINKEDIN_ACCOUNT_KEY, Config } = LinkedInOAuth

/** An interaction that records every notice and answers no prompt. */
function surface(): AuthorizationInteraction & { notices: unknown[] } {
  const notices: unknown[] = []
  return {
    notices,
    notify: (notice) => { notices.push(notice) },
    prompt: () => Promise.reject(new Error('this flow prompts nothing')),
  }
}

async function harness(config: Parameters<typeof LinkedInOAuth.apply>[1] = {
  clientId: 'client-1', clientSecret: 'secret-1',
}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(MemoryCredentials)
  await ctx.plugin(AuthorizationService)
  await ctx.plugin(LinkedInOAuth, config)
  return ctx
}

describe('LinkedIn OAuth flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a "Sign in with LinkedIn" flow for the account key', async () => {
    const ctx = await harness()
    expect(ctx.authorization.describe(LINKEDIN_ACCOUNT_KEY)).toEqual({
      key: LINKEDIN_ACCOUNT_KEY,
      label: 'LinkedIn',
      methods: [{ id: 'oidc', label: 'Sign in with LinkedIn' }],
      inFlight: false,
    })
  })

  it('notifies the authorize URL, exchanges the matching state\'s code, and commits the grant', async () => {
    awaitCallback.mockResolvedValueOnce({ code: 'auth-code', state: 'fixed-state' })
    exchangeCode.mockImplementationOnce(async () => ({
      accessToken: 'access-1', idToken: 'id-1', expiresAt: 1_900_000_000_000, scope: 'openid profile email',
    }))
    const ctx = await harness()

    const surfaceHandle = surface()
    const outcome = await ctx.authorization.begin({ key: LINKEDIN_ACCOUNT_KEY, interaction: surfaceHandle })

    expect(outcome).toEqual({ status: 'authorized' })
    expect(surfaceHandle.notices).toEqual([{
      message: 'Continue in your browser to sign in with LinkedIn',
      url: expect.stringContaining('https://www.linkedin.com/oauth/v2/authorization?') as unknown as string,
    }])
    expect(exchangeCode).toHaveBeenCalledWith(expect.objectContaining({
      code: 'auth-code', clientId: 'client-1', clientSecret: 'secret-1',
    }))
    expect(await ctx.credentials.readRecord(LINKEDIN_ACCOUNT_KEY)).toEqual({
      kind: 'grant',
      payload: { accessToken: 'access-1', idToken: 'id-1', expiresAt: 1_900_000_000_000, scope: 'openid profile email' },
    })
  })

  it('fails the attempt when the callback state does not match the request that started it', async () => {
    awaitCallback.mockResolvedValueOnce({ code: 'auth-code', state: 'not-the-state-we-sent' })
    const ctx = await harness()

    await expect(ctx.authorization.begin({ key: LINKEDIN_ACCOUNT_KEY, interaction: surface() }))
      .rejects.toMatchObject({ code: 'LINKEDIN_STATE_MISMATCH' })
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('uses an explicitly configured redirect and scope instead of the defaults', async () => {
    awaitCallback.mockResolvedValueOnce({ code: 'auth-code', state: 'fixed-state' })
    exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-1', idToken: 'id-1', expiresAt: 1_900_000_000_000, scope: 'openid',
    })
    const ctx = await harness({
      clientId: 'client-1', clientSecret: 'secret-1', redirectUri: 'http://127.0.0.1:9009/cb', scope: 'openid',
    })

    await ctx.authorization.begin({ key: LINKEDIN_ACCOUNT_KEY, interaction: surface() })

    expect(awaitCallback).toHaveBeenCalledWith('http://127.0.0.1:9009/cb', expect.anything())
    expect(exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: 'http://127.0.0.1:9009/cb' }))
  })

  it('defaults the redirect and scope when the config omits them', () => {
    const config = Config({ clientId: 'client-1', clientSecret: 'secret-1' })
    expect(config.redirectUri).toBe('http://127.0.0.1:3005/callback')
    expect(config.scope).toBe('openid profile email')
  })
})
