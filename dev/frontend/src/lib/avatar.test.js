import { describe, expect, it } from 'vitest'

import { avatarUrlFor } from './avatar'

describe('avatarUrlFor', () => {
  it('keeps only browser-loadable HTTP avatar URLs', () => {
    expect(avatarUrlFor('https://cdn.example.test/avatars/e-1.png')).toBe('https://cdn.example.test/avatars/e-1.png')
    expect(avatarUrlFor('')).toBeNull()
    expect(avatarUrlFor('javascript:alert(1)')).toBeNull()
    expect(avatarUrlFor('not a url')).toBeNull()
  })
})
