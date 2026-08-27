import { getAccessToken } from './api'

const PRIVATE_OBJECT_PREFIXES = ['avatars/', 'contracts/']

export function extractPrivateKey(value) {
  if (typeof value !== 'string') return null
  for (const prefix of PRIVATE_OBJECT_PREFIXES) {
    if (value.startsWith(prefix)) return value
    const idx = value.indexOf(`/${prefix}`)
    if (idx !== -1) return value.slice(idx + 1)
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
