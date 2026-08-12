import { describe, expect, it } from 'vitest'

import { timelineMilestones } from './ContractTimeline'

describe('timelineMilestones', () => {
  it('keeps every authoritative submission attempt in order', () => {
    expect(timelineMilestones({
      ready_at: '2026-08-01T08:00:00Z',
      started_at: '2026-08-01T09:00:00Z',
      completed_at: '2026-08-03T10:00:00Z',
      deadline_at: '2026-08-04T17:00:00Z',
      submissions: [{ attempt_no: 1, submitted_at: '2026-08-01T12:00:00Z' }],
    }).map((item) => item.label)).toEqual(['Sẵn sàng', 'Bắt đầu', 'Nộp #1', 'Hoàn tất', 'Hạn xử lý'])
  })
})
