import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../contexts/ToastContext'
import DebtCollection from './DebtCollection'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn(), getAccessToken: vi.fn(() => null) }))

import { apiFetch } from '../lib/api'

describe('DebtCollection override warning', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({
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
    apiFetch.mockResolvedValue({
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
