import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SubmissionReceiptPanel from './SubmissionReceiptPanel'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: () => 'jwt',
}))

const { apiFetch } = await import('../../lib/api')

describe('SubmissionReceiptPanel trong không gian làm việc nhân viên (Employee Workspace)', () => {
  it('Node theo dõi N02 kế thừa trọn vẹn thông tin biên nhận từ bên nộp N01', async () => {
    apiFetch.mockReset()
    apiFetch.mockImplementation((url) => {
      if (url.includes('by-task-node')) {
        return Promise.resolve({
          data: {
            id: 'sub-af821c',
            receipt_code: 'BN-CUGHI-2026/0099',
            submitted_agency: 'Chi nhánh VP ĐKĐĐ Củ Chi',
            received_date: '2026-09-23',
            expected_return_date: '2026-10-15',
            gov_status: 'Đang chi nhánh',
          },
        })
      }
      return Promise.reject(new Error('404'))
    })

    render(
      <SubmissionReceiptPanel
        taskNodeId="task-n02-af821c"
        tracking={true}
        readOnly={false}
        addToast={vi.fn()}
      />,
    )

    // Hiển thị tiêu đề theo dõi cơ quan
    expect(await screen.findByText(/Biên nhận & theo dõi cơ quan/i)).toBeInTheDocument()

    // Hiển thị số biên nhận và nhãn kế thừa từ bước nộp
    expect(screen.getByText('BN-CUGHI-2026/0099')).toBeInTheDocument()
    expect(screen.getByText('(kế thừa từ bước nộp)')).toBeInTheDocument()

    // Hiển thị badge trạng thái cơ quan
    expect(screen.getByText('Đang chi nhánh')).toBeInTheDocument()

    // Hiển thị nơi nộp, ngày nhận, ngày hẹn trả
    expect(screen.getByText(/Chi nhánh VP ĐKĐĐ Củ Chi/)).toBeInTheDocument()
    expect(screen.getByText(/23\/09\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/15\/10\/2026/)).toBeInTheDocument()

    // Nút tra cứu Cổng DVC và nút Cập nhật
    expect(screen.getByRole('button', { name: /Tra cứu tại Cổng DVC/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cập nhật/i })).toBeInTheDocument()
  })

  it('Node theo dõi N02 khi bước nộp N01 chưa có biên nhận thì hiển thị chờ bước nộp', async () => {
    apiFetch.mockReset()
    apiFetch.mockImplementation((url) => {
      if (url.includes('by-task-node')) {
        return Promise.resolve({
          data: {
            id: 'sub-af821c',
            receipt_code: null,
            gov_status: 'Đang chi nhánh',
          },
        })
      }
      return Promise.reject(new Error('404'))
    })

    render(
      <SubmissionReceiptPanel
        taskNodeId="task-n02-af821c"
        tracking={true}
        readOnly={false}
        addToast={vi.fn()}
      />,
    )

    expect(await screen.findByText('Chưa có số biên nhận')).toBeInTheDocument()
    // Không tự động bật form chỉnh sửa khi là bước theo dõi và chưa có mã
    expect(screen.queryByPlaceholderText(/Nhập số biên nhận/i)).not.toBeInTheDocument()
  })
})

