import { getAccessToken } from './api'

const PRIVATE_OBJECT_PREFIXES = ['avatars/', 'contracts/']
const PRIVATE_PREFIX_NAMES = ['avatars', 'contracts']

export function extractPrivateKey(value) {
  if (typeof value !== 'string' || !value.trim()) return null

  for (const prefix of PRIVATE_OBJECT_PREFIXES) {
    if (value.startsWith(prefix)) return value
  }

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null

    const segments = url.pathname.split('/').filter(Boolean)
    const prefixIndex = segments.findIndex(seg => PRIVATE_PREFIX_NAMES.includes(seg))

    if (prefixIndex >= 1) {
      const rawKey = segments.slice(prefixIndex).join('/')
      try {
        return decodeURIComponent(rawKey)
      } catch {
        return rawKey
      }
    }
  } catch {
    return null
  }

  return null
}

export function isPrivateObjectKey(value) {
  return extractPrivateKey(value) !== null
}

export function privateObjectEndpoint(objectKey) {
  return `/api/employee-portal/file?object_key=${encodeURIComponent(objectKey)}`
}

export async function fetchPrivateObjectBlob(objectKey) {
  const extracted = extractPrivateKey(objectKey)
  if (!extracted) throw new Error('Đường dẫn tệp nội bộ không hợp lệ')
  const token = getAccessToken()
  const response = await fetch(privateObjectEndpoint(extracted), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('Không thể mở tệp nội bộ')
  return response.blob()
}

export async function openPrivateObject(objectKey) {
  const viewer = window.open('', '_blank', 'noopener,noreferrer')
  try {
    const blob = await fetchPrivateObjectBlob(objectKey)
    const objectUrl = URL.createObjectURL(blob)
    if (viewer) viewer.location.href = objectUrl
    else window.open(objectUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (error) {
    viewer?.close()
    throw error
  }
}
