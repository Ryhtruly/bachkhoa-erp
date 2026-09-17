import { describe, expect, it, vi } from 'vitest'

import { validateSession } from './sessionValidation'

describe('validateSession', () => {
  it('renews the cookie-backed session before requesting /me after a page reload', async () => {
    const request = vi.fn().mockResolvedValue({ username: 'staff' })
    const ensureAccessToken = vi.fn().mockResolvedValue('fresh-token')

    await expect(validateSession({ request, ensureAccessToken })).resolves.toEqual({ username: 'staff' })

    expect(ensureAccessToken).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/auth/me', { timeout: 12000 })
  })

  it('retries a transient timeout before accepting a recovered session', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce({ status: 408, message: 'timeout' })
      .mockResolvedValueOnce({ username: 'staff' })
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(validateSession({ request, sleep })).resolves.toEqual({ username: 'staff' })

    expect(request).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not retry when the server rejects the session with 401', async () => {
    const unauthorized = { status: 401, message: 'expired' }
    const request = vi.fn().mockRejectedValue(unauthorized)
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(validateSession({ request, sleep })).rejects.toBe(unauthorized)

    expect(request).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('returns the last transient error after the retry budget is exhausted', async () => {
    const timeout = { status: 408, message: 'timeout' }
    const request = vi.fn().mockRejectedValue(timeout)
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(validateSession({ request, sleep })).rejects.toBe(timeout)

    expect(request).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
