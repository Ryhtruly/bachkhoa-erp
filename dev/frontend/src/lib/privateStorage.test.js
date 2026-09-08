import { describe, expect, it } from 'vitest'
import { extractPrivateKey, isPrivateObjectKey } from './privateStorage'

describe('extractPrivateKey', () => {
  it('preserves direct private keys beginning with avatars/ or contracts/', () => {
    expect(extractPrivateKey('avatars/emp-1/avatar.png')).toBe('avatars/emp-1/avatar.png')
    expect(extractPrivateKey('contracts/2026/001.pdf')).toBe('contracts/2026/001.pdf')
    expect(isPrivateObjectKey('avatars/emp-1/avatar.png')).toBe(true)
    expect(isPrivateObjectKey('contracts/2026/001.pdf')).toBe(true)
  })

  it('normalizes legacy path-style storage URLs with bucket prefix to decoded object key', () => {
    expect(extractPrivateKey('http://localhost:9000/bachkhoa-erp-local/avatars/emp-1/old.png'))
      .toBe('avatars/emp-1/old.png')
    expect(extractPrivateKey('http://localhost:9000/bucket/contracts/c-1/signed.pdf'))
      .toBe('contracts/c-1/signed.pdf')
    expect(extractPrivateKey('https://minio.looptech.vn/storage/team-bucket/avatars/emp%201/avatar%20photo.png'))
      .toBe('avatars/emp 1/avatar photo.png')
  })

  it('treats normal public URLs whose path starts /avatars/... or /contracts/... as non-private', () => {
    expect(extractPrivateKey('https://cdn.example.test/avatars/e-1.png')).toBeNull()
    expect(extractPrivateKey('https://cdn.example.test/contracts/sample.pdf')).toBeNull()
    expect(isPrivateObjectKey('https://cdn.example.test/avatars/e-1.png')).toBe(false)
    expect(isPrivateObjectKey('https://cdn.example.test/contracts/sample.pdf')).toBe(false)
  })

  it('returns null for unrelated public URLs or non-HTTP inputs', () => {
    expect(extractPrivateKey('https://ui-avatars.com/api/?name=An')).toBeNull()
    expect(extractPrivateKey('javascript:alert(1)')).toBeNull()
    expect(extractPrivateKey('not a url')).toBeNull()
    expect(extractPrivateKey('')).toBeNull()
    expect(extractPrivateKey(null)).toBeNull()
    expect(extractPrivateKey(undefined)).toBeNull()
  })
})
