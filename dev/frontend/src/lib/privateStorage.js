import { getAccessToken } from './api'

const PRIVATE_OBJECT_PREFIXES = ['avatars/', 'contracts/']

export function isPrivateObjectKey(value) {
  return typeof value === 'string' && PRIVATE_OBJECT_PREFIXES.some(prefix => value.startsWith(prefix))
}

export function privateObjectEndpoint(objectKey) {
  return `/api/employee-portal/file?object_key=${encodeURIComponent(objectKey)}`
}

export async function fetchPrivateObjectBlob(objectKey) {
  if (!isPrivateObjectKey(objectKey)) throw new Error('Đường dẫn tệp nội bộ không hợp lệ')
  const token = getAccessToken()
  const response = await fetch(privateObjectEndpoint(objectKey), {
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
