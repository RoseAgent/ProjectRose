import { describe, it, expect, vi, beforeEach } from 'vitest'

const stored: { token: string | null } = { token: null }

vi.mock('../../lib/dopplerSession', () => ({
  DOPPLER_API_HOST: 'https://api.doppler.com',
  loadDopplerToken: vi.fn(async () => stored.token),
  saveDopplerToken: vi.fn(async (t: string) => { stored.token = t }),
  clearDopplerToken: vi.fn(async () => { stored.token = null })
}))

import { dopplerSignIn, dopplerSignOut, getDopplerAuthStatus, dopplerListProjects, dopplerListConfigs } from '../dopplerAuthService'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  stored.token = null
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('dopplerSignIn', () => {
  it('generates a code, polls through 409s, and stores the token', async () => {
    let authorizeCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v3/auth/cli/generate/2')) {
        return jsonResponse({ code: 'ABCD-1234', auth_url: 'https://dashboard.doppler.com/auth?x=1', polling_code: 'poll-1' })
      }
      if (url.includes('/v3/auth/cli/authorize')) {
        authorizeCalls++
        // Pending twice, then approved.
        if (authorizeCalls < 3) return jsonResponse({}, 409)
        return jsonResponse({ token: 'dp.ct.issued-token' })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }))

    await dopplerSignIn()
    expect(stored.token).toBe('dp.ct.issued-token')
    expect(authorizeCalls).toBe(3)
  }, 15_000)

  it('surfaces Doppler error messages from a denied poll', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v3/auth/cli/generate/2')) {
        return jsonResponse({ code: 'ABCD', auth_url: 'https://dashboard.doppler.com/auth', polling_code: 'poll-2' })
      }
      return jsonResponse({ messages: ['Access denied by user'] }, 403)
    }))
    await expect(dopplerSignIn()).rejects.toThrow('Access denied by user')
    expect(stored.token).toBeNull()
  }, 15_000)
})

describe('sign-out and status', () => {
  it('revokes and clears the stored token', async () => {
    stored.token = 'dp.ct.old'
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await dopplerSignOut()
    expect(stored.token).toBeNull()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v3/auth/cli/revoke')
    expect(await getDopplerAuthStatus()).toEqual({ loggedIn: false })
  })
})

describe('project / config enumeration', () => {
  it('lists project slugs and config names with the stored token', async () => {
    stored.token = 'dp.ct.live'
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v3/projects')) {
        return jsonResponse({ projects: [{ slug: 'backend', name: 'Backend' }, { name: 'frontend' }] })
      }
      if (url.includes('/v3/configs')) {
        expect(url).toContain('project=backend')
        return jsonResponse({ configs: [{ name: 'dev' }, { name: 'prd' }] })
      }
      throw new Error(`unexpected fetch: ${url}`)
    }))
    expect(await dopplerListProjects()).toEqual(['backend', 'frontend'])
    expect(await dopplerListConfigs('backend')).toEqual(['dev', 'prd'])
  })

  it('requires sign-in', async () => {
    await expect(dopplerListProjects()).rejects.toThrow('Not signed in')
  })
})
