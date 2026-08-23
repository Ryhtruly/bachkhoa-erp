import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

import DebtCollection from './DebtCollection'

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
  vi.useRealTimers()
})

describe('DebtCollection summary hierarchy', () => {
  it('highlights actionable debt risk alongside the total balance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-23T12:00:00Z'))

    apiFetchMock.mockResolvedValue({
      meta: { total: 3, total_remaining: 184370120 },
      data: [
        {
          contract_id: '003/BK-2026',
          customer_name: 'Khách quá hạn',
          service_type: 'Đo vẽ',
          total_value: 100000000,
          paid: 10000000,
          remaining: 90000000,
          is_delivered: true,
          delivered_at: '2026-08-01',
        },
        {
          contract_id: '004/BK-2026',
          customer_name: 'Khách chờ bàn giao',
          service_type: 'Thiết kế',
          total_value: 50000000,
          paid: 0,
          remaining: 50000000,
          is_delivered: false,
        },
        {
          contract_id: '005/BK-2026',
          customer_name: 'Khách vừa bàn giao',
          service_type: 'Tách thửa',
          total_value: 50000000,
          paid: 5000000,
          remaining: 45000000,
          is_delivered: true,
          delivered_at: '2026-08-22',
        },
      ],
    })

    render(<DebtCollection />)

    expect(await screen.findByText('Cần ưu tiên')).toBeInTheDocument()
    expect(document.querySelector('.debt__total-card--danger strong')).toHaveTextContent('1 hồ sơ')
    expect(screen.getByText('Chưa bàn giao')).toBeInTheDocument()
    expect(document.querySelector('.debt__total-card--waiting strong')).toHaveTextContent('1 hồ sơ đang chờ')
    expect(screen.getByText('Theo dữ liệu đã tải')).toBeInTheDocument()
  })
})
