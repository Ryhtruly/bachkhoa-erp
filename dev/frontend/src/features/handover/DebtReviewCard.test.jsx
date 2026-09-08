import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import DebtReviewCard from './DebtReviewCard'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

const pendingState = {
  debt: { remaining: 5_000_000 },
  debt_request: {
    id: 'REQ-1',
    status: 'pending',
    requester_name: 'Nguyễn Văn A',
    remaining_amount_snapshot: 5_000_000,
    reason: 'Khách cần nhận hồ sơ để vay ngân hàng',
    promised_payment_date: '2026-09-15',
  },
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DebtReviewCard', () => {
  it('chỉ hiện yêu cầu đang chờ và focus đúng request từ chuông', async () => {
    apiFetch.mockResolvedValueOnce({ data: pendingState })
    render(<DebtReviewCard taskNodeId="TN-K06" targetRequestId="REQ-1" focusNonce={4} />)

    const card = await screen.findByTestId('debt-review-card')
    await waitFor(() => expect(card).toHaveFocus())
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText(/Khách cần nhận hồ sơ/)).toBeInTheDocument()
  })

  it('từ chối bắt buộc nhập lý do rồi gửi đúng request', async () => {
    apiFetch.mockResolvedValueOnce({ data: pendingState })
    apiFetch.mockResolvedValueOnce({ data: { status: 'rejected' } })
    apiFetch.mockResolvedValueOnce({ data: { ...pendingState, debt_request: null } })
    render(<DebtReviewCard taskNodeId="TN-K06" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Không duyệt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận không duyệt' }))
    expect(screen.getByText(/Vui lòng nhập lý do/i)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Ghi rõ lý do không duyệt/i), {
      target: { value: 'Chưa có cam kết thanh toán đủ tin cậy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận không duyệt' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      '/api/handover/debt-requests/REQ-1/review',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decision: 'rejected',
          review_note: 'Chưa có cam kết thanh toán đủ tin cậy',
        }),
      }),
    ))
  })
})
