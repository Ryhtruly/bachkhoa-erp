import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../contexts/ToastContext'
import DebtCollection from './DebtCollection'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('../lib/api', () => ({
  apiFetch: apiFetchMock,
  getAccessToken: vi.fn(() => null),
}))

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

    render(
      <ToastProvider>
        <DebtCollection user={{ username: 'admin' }} />
      </ToastProvider>,
    )

    expect(await screen.findByText('Cần ưu tiên')).toBeInTheDocument()
    expect(document.querySelector('.debt__total-card--danger strong')).toHaveTextContent('1 hồ sơ')
    expect(screen.getByText('Chưa bàn giao')).toBeInTheDocument()
    expect(document.querySelector('.debt__total-card--waiting strong')).toHaveTextContent('1 hồ sơ đang chờ')
    expect(screen.getByText('Theo dữ liệu đã tải')).toBeInTheDocument()
  })
})

describe('DebtCollection override warning', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue({
      data: [{
        contract_id: 'HD-001',
        customer_name: 'Nguyễn Văn A',
        service_type: 'Cấp đổi',
        total_value: 10_000_000,
        paid: 5_000_000,
        pending: 0,
        remaining: 5_000_000,
        is_delivered: false,
        has_handover_debt_approval: true,
        handover_debt_reason: 'Khách cần nhận hồ sơ gấp',
        is_financially_settled: false,
        installments: [],
      }],
      meta: { total: 1, total_remaining: 5_000_000 },
    })
  })

  it('marks an outstanding approved-override contract with the red alert class and reason', async () => {
    const { container } = render(
      <ToastProvider>
        <DebtCollection user={{ username: 'admin' }} isDirector />
      </ToastProvider>,
    )

    expect(await screen.findByText('Khách cần nhận hồ sơ gấp')).toBeInTheDocument()
    expect(container.querySelector('.debt__card.is-override-alert')).toBeInTheDocument()
    expect(screen.getByText(/Đã duyệt giao khi còn nợ/i)).toBeInTheDocument()
  })

  it('turns the same approved-override card green only after accounting settles the real balance', async () => {
    apiFetchMock.mockResolvedValue({
      data: [{
        contract_id: 'HD-001',
        customer_name: 'Nguyễn Văn A',
        service_type: 'Cấp đổi',
        total_value: 10_000_000,
        paid: 10_000_000,
        pending: 0,
        remaining: 0,
        is_delivered: true,
        has_handover_debt_approval: true,
        handover_debt_reason: 'Khách cần nhận hồ sơ gấp',
        is_financially_settled: true,
        financial_status: 'settled_after_handover_override',
        installments: [],
      }],
      meta: { total: 0, total_remaining: 0, settled_after_override: 1 },
    })

    const { container } = render(
      <ToastProvider>
        <DebtCollection user={{ username: 'admin' }} isDirector />
      </ToastProvider>,
    )

    expect((await screen.findAllByText(/Đã thu đủ tiền hợp đồng/i)).length).toBeGreaterThan(0)
    expect(container.querySelector('.debt__card.is-settled-after-override')).toBeInTheDocument()
    expect(container.querySelector('.debt__card.is-override-alert')).not.toBeInTheDocument()
  })
})
