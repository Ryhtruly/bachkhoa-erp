import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PendingApprovals from './PendingApprovals'
import { ToastProvider } from '../../contexts/ToastContext'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}))

const mockRow = {
  id: 'PT-2026-001',
  transaction_type: 'Thu',
  status: 'Chờ duyệt',
  contract_id: 'HD-001',
  category_code: 'Thu tiền hợp đồng',
  amount: 5000000,
  payer_payee_name: 'Công ty ABC',
  created_at: '2026-09-15T00:00:00Z',
  created_by_user_id: 'ketoan',
  creator_name: 'Kế toán viên',
  description: 'Khách thanh toán đợt 1',
}

describe('PendingApprovals Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders field header with refined label and polished hint', async () => {
    const { apiFetch } = await import('../../lib/api')
    apiFetch.mockResolvedValueOnce({
      data: [mockRow],
    })

    render(
      <ToastProvider>
        <PendingApprovals />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Công ty ABC')).toBeInTheDocument()
    })

    // Click to open approval modal
    fireEvent.click(screen.getByText('Công ty ABC'))

    expect(screen.getByText('Lý do từ chối')).toBeInTheDocument()
    const hint = screen.getByText(/Chỉ cần khi từ chối/i)
    expect(hint).toBeInTheDocument()
    expect(hint.closest('.approvals__hint')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('VD: bill mờ không đọc được số tiền')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-describedby', 'approvals-reject-hint')
  })

  it('validates reason requirement on rejection', async () => {
    const { apiFetch } = await import('../../lib/api')
    apiFetch.mockResolvedValueOnce({
      data: [mockRow],
    })

    render(
      <ToastProvider>
        <PendingApprovals />
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Công ty ABC').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Công ty ABC')[0])

    const rejectBtn = screen.getByRole('button', { name: /Từ chối/i })
    fireEvent.click(rejectBtn)

    // Reason must be at least 5 chars
    await waitFor(() => {
      expect(screen.getByText('Từ chối phải ghi lý do')).toBeInTheDocument()
    })
  })
})
