import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App.jsx'

const nativeFetch = window.fetch.bind(window)
window.fetch = (input, init = {}) => {
  const requestUrl = typeof input === 'string' ? input : input?.url || ''
  const isInternalApi = requestUrl.startsWith('/api/') || requestUrl.startsWith(window.location.origin + '/api/')
  const token = window.localStorage.getItem('bachkhoa_access_token')
  if (!isInternalApi || !token) return nativeFetch(input, init)

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  return nativeFetch(input, { ...init, headers })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
