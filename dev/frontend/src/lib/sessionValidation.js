import { apiFetch } from './api'

const SESSION_ENDPOINT = '/api/auth/me'
const SESSION_VALIDATION_TIMEOUT_MS = 12000
const SESSION_RETRY_DELAYS_MS = [1000, 2500]

const wait = (delayMs) => new Promise(resolve => setTimeout(resolve, delayMs))

export async function validateSession({
  request = apiFetch,
  ensureAccessToken,
  sleep = wait,
  onRetry,
  attempts = SESSION_RETRY_DELAYS_MS.length + 1,
  timeout = SESSION_VALIDATION_TIMEOUT_MS,
} = {}) {
  let lastError

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      onRetry?.(attempt)
      await sleep(SESSION_RETRY_DELAYS_MS[attempt - 1] || SESSION_RETRY_DELAYS_MS.at(-1))
    }

    try {
      if (ensureAccessToken) await ensureAccessToken()
      return await request(SESSION_ENDPOINT, { timeout })
    } catch (error) {
      lastError = error
      if (error?.status === 401) throw error
    }
  }

  throw lastError
}
