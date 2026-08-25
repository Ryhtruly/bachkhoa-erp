import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

import AdvanceRequestScreen from './AdvanceRequestScreen'

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
})

describe('AdvanceRequestScreen data integrity', () => {
  it('does not show fabricated employees or contracts when APIs return no options', async () => {
    apiFetchMock.mockResolvedValue([])

    render(<AdvanceRequestScreen isDirector={false} user={{ username: 'tester' }} />)

    const createButton = await screen.findByRole('button', { name: /Lập đề xuất tạm ứng/i })
    fireEvent.click(createButton)

    const employeeSelect = screen.getByRole('button', { name: /Chưa có nhân sự khả dụng/ })
    expect(employeeSelect).toBeDisabled()
    expect(screen.queryByText('Nguyễn Văn A (Nhân viên đo vẽ)')).not.toBeInTheDocument()

    const contractSelect = screen.getByRole('button', { name: /Chưa có hợp đồng khả dụng/ })
    expect(contractSelect).toBeDisabled()
    expect(screen.queryByText('377/BK-2026 — Lê hữu trí')).not.toBeInTheDocument()
  })

  it('shows a retryable error when the advance list cannot be loaded', async () => {
    apiFetchMock.mockRejectedValue(new Error('Network unavailable'))

    render(<AdvanceRequestScreen isDirector user={{ username: 'tester' }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải danh sách tạm ứng')
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(apiFetchMock).toHaveBeenCalled()
  })
})
