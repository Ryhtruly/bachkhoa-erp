import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import DebtRequestAction from './DebtRequestAction'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const state = (status = null) => ({
  debt: { remaining: 5_000_000, gate_open: status === 'approved' },
  debt_request: status ? {
    id: 'REQ-1', status, reason: 'Khách hẹn trả sau', promised_payment_date: '2026-09-15',
  } : null,
  can_request_debt: status === null,
  can_submit_acceptance: status === 'approved',
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DebtRequestAction', () => {
  it('bắt buộc nhập lý do trước khi gửi yêu cầu', async () => {
    apiFetch.mockResolvedValueOnce({ data: state() })
    render(<DebtRequestAction taskNodeId="TN-K06" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Xin duyệt nợ' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Lý do xin duyệt nợ/i), {
      target: { value: 'Khách cần nhận hồ sơ để hoàn tất khoản vay' },
    })
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu' })).toBeDisabled()
  })

  it('hiện trạng thái chờ và không cho gửi trùng', async () => {
    apiFetch.mockResolvedValueOnce({ data: state('pending') })
    render(<DebtRequestAction taskNodeId="TN-K06" />)

    const button = await screen.findByRole('button', { name: 'Chờ duyệt nợ' })
    expect(button).toBeDisabled()
  })

  it('trả state K06 về workspace để điều khiển riêng nút nghiệm thu', async () => {
    const onStateChange = vi.fn()
    apiFetch.mockResolvedValueOnce({ data: state() })
    render(<DebtRequestAction taskNodeId="TN-K06" onStateChange={onStateChange} />)

    await waitFor(() => expect(onStateChange).toHaveBeenCalledWith(state()))
  })

  it('hiện nút disabled có tooltip khi hợp đồng đã thu đủ tiền', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        debt: { remaining: 0, is_settled: true, gate_open: true },
        debt_request: null,
        can_request_debt: false,
        can_submit_acceptance: true,
      },
    })
    render(<DebtRequestAction taskNodeId="TN-K06" />)

    const button = await screen.findByRole('button', { name: 'Xin duyệt nợ' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Hợp đồng đã thu đủ 100% tiền — không cần xin duyệt nợ')
  })

  it('hiện nút disabled khi đã được duyệt nợ', async () => {
    apiFetch.mockResolvedValueOnce({
      data: {
        debt: { remaining: 2_000_000, is_settled: false, gate_open: true },
        debt_request: { status: 'approved' },
        can_request_debt: false,
        can_submit_acceptance: true,
      },
    })
    render(<DebtRequestAction taskNodeId="TN-K06" />)

    const button = await screen.findByRole('button', { name: 'Đã duyệt nợ' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Đã được Giám đốc duyệt cho nợ')
  })
})

