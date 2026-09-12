import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App.jsx'
import { applyTheme, getInitialTheme } from './lib/theme'
import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
} from './lib/api'

applyTheme(getInitialTheme())

const nativeFetch = window.fetch.bind(window)
const configuredApiOrigin = new URL(
  import.meta.env.VITE_API_URL || window.location.origin,
  window.location.origin,
).origin
const AUTH_PATHS_WITHOUT_REFRESH = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
])

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === 'string' ? input : input?.url || ''
  const parsedUrl = new URL(requestUrl, window.location.origin)
  const isInternalApi = parsedUrl.pathname.startsWith('/api/')
    && (requestUrl.startsWith('/api/') || parsedUrl.origin === configuredApiOrigin)
  const path = parsedUrl.pathname
  if (!isInternalApi || AUTH_PATHS_WITHOUT_REFRESH.has(path) || init.__skipGlobalAuthRefresh) {
    return nativeFetch(input, init)
  }

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
  const token = getAccessToken()
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  const requestInit = {
    ...init,
    credentials: init.credentials || 'include',
    headers,
  }
  const response = await nativeFetch(input, requestInit)
  if (response.status !== 401 || typeof input !== 'string') return response

  try {
    await refreshAccessToken()
  } catch (error) {
    if (error?.status === 401) {
      clearAccessToken()
      window.dispatchEvent(new Event('bachkhoa:unauthorized'))
    }
    return response
  }

  const refreshedToken = getAccessToken()
  if (!refreshedToken) return response
  const retryHeaders = new Headers(headers)
  retryHeaders.set('Authorization', `Bearer ${refreshedToken}`)
  return nativeFetch(input, {
    ...requestInit,
    headers: retryHeaders,
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
