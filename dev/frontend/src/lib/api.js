const ACCESS_TOKEN_KEY = 'bachkhoa_access_token'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function clearAccessToken() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
}

export async function apiFetch(path, options = {}) {
  const { headers: callerHeaders, ...fetchOptions } = options
  const headers = { ...(callerHeaders || {}) }
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, { ...fetchOptions, headers })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken()
      window.dispatchEvent(new Event('bachkhoa:unauthorized'))
    }

    throw new ApiError(
      response.status,
      body?.detail || body?.message || response.statusText || 'Yêu cầu thất bại',
    )
  }

  return body
}
