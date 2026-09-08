import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GiayDuocMien from './GiayDuocMien'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'token'),
}))

const traVe = data => {
  apiFetch.mockImplementation(async url => {
    if (url.includes('/k01-status')) return { status: 'success', data }
    throw new Error(`Unexpected ${url}`)
  })
}

describe('GiayDuocMien — Giám đốc phải thấy mình đang cho qua cái gì', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('nêu rõ số giấy nhân viên xin bỏ và hậu quả của mỗi lựa chọn', async () => {
    traVe({ waiver_pending: ['Giấy tờ hôn nhân', 'Sổ hộ khẩu'], waived: [] })
    render(<GiayDuocMien serviceLineId="SL-1" />)

    expect(await screen.findByText(/Nhân viên xin bỏ 2 loại giấy/)).toBeInTheDocument()
    expect(screen.getByText('Giấy tờ hôn nhân')).toBeInTheDocument()
    expect(screen.getByText('Sổ hộ khẩu')).toBeInTheDocument()
    // Không nói rõ hậu quả thì Giám đốc bấm "Duyệt đạt" như mọi lần.
    expect(screen.getByText(/Duyệt đạt là đồng ý bỏ những giấy này/)).toBeInTheDocument()
    expect(screen.getByText(/lý do bạn ghi sẽ là câu nhân viên mang đi gọi khách/)).toBeInTheDocument()
  })

  it('tách phiếu chờ quyết khỏi giấy đã miễn từ trước', async () => {
    traVe({ waiver_pending: ['Giấy uỷ quyền'], waived: ['Giấy tờ nguồn gốc đất'] })
    render(<GiayDuocMien serviceLineId="SL-1" />)

    expect(await screen.findByText(/Nhân viên xin bỏ 1 loại giấy/)).toBeInTheDocument()
    expect(screen.getByText(/Đã miễn trước đó · 1 loại/)).toBeInTheDocument()
  })

  it('không có gì được bỏ thì không chiếm chỗ trên panel', async () => {
    traVe({ waiver_pending: [], waived: [] })
    const { container } = render(<GiayDuocMien serviceLineId="SL-1" />)

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container.querySelector('.wf-mien')).toBeNull()
  })

  it('đọc hụt thì báo lỗi chứ không im lặng coi như không có phiếu nào', async () => {
    apiFetch.mockRejectedValue(new Error('mất kết nối'))
    render(<GiayDuocMien serviceLineId="SL-1" />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
