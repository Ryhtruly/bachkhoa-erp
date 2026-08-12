import { describe, expect, it } from 'vitest'

import { isTerminalLegalStatus } from '../lib/dossierStatus'

describe('isTerminalLegalStatus', () => {
  it('locks completed legal dossiers', () => {
    expect(isTerminalLegalStatus('Hoàn thành')).toBe(true)
    expect(isTerminalLegalStatus('Đang chi nhánh')).toBe(false)
  })
})
