import { describe, expect, it } from 'vitest'

import { isTerminalSurveyStatus } from '../lib/dossierStatus'

describe('isTerminalSurveyStatus', () => {
  it('locks completed survey dossiers', () => {
    expect(isTerminalSurveyStatus('Hoàn thành')).toBe(true)
    expect(isTerminalSurveyStatus('Nộp thành công')).toBe(true)
    expect(isTerminalSurveyStatus('Đang thực hiện')).toBe(false)
  })
})
