import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import HandoverPanel from './HandoverPanel'

const response = (body, ok = true, status = 200) => Promise.resolve({
  ok,
  status,
  json: () => Promise.resolve(body),
})

const checklist = [{
  id: 'CL-1',
  name: 'Ảnh biên bản bàn giao có chữ ký khách hàng',
  status: 'pending',
  status_label: 'Chưa thực hiện',
  require_evidence: true,
}]

const stateFor = ({
  remaining = 5_000_000,
  requestStatus = null,
  canSubmitAcceptance = false,
  nodeStatus = 'in_progress',
  commitmentAttachment = null,
} = {}) => ({
  data: {
    task_node_id: 'TN-K06',
    contract_id: 'HD-001',
    node_status: nodeStatus,
    business_status: requestStatus === 'pending'
      ? 'debt_request_pending'
      : (requestStatus === 'approved' ? 'in_progress' : 'debt_locked'),
    is_finished: false,
    debt_request: requestStatus ? {
      id: 'REQ-1',
      status: requestStatus,
      remaining_amount_snapshot: remaining,
      reason: 'Khách cần hồ sơ để vay ngân hàng',
      promised_payment_date: '2026-09-15',
      commitment_attachment: commitmentAttachment,
    } : null,
    can_request_debt: remaining > 0 && !requestStatus,
    can_submit_acceptance: canSubmitAcceptance,
    debt: {
      total_value: 10_000_000,
      paid: 10_000_000 - remaining,
      remaining,
      percent: remaining <= 0.009 ? 100 : 50,
      pending_amount: 0,
      is_settled: remaining <= 0.009,
      gate_open: remaining <= 0.009 || requestStatus === 'approved',
      has_override: requestStatus === 'approved',
      override_reason: requestStatus === 'approved' ? 'Khách cần hồ sơ để vay ngân hàng' : null,
    },
    gate: { is_open: true },
    lane_a: {
      label: 'Giao hồ sơ cho khách',
      desc: 'Giao hồ sơ và lấy chữ ký',
      done: false,
      can_do: remaining <= 0.009 || requestStatus === 'approved',
      actor: 'Nguyễn Văn A',
    },
    lane_b: {
      label: 'Thu đủ tiền hợp đồng',
      desc: 'Theo dõi công nợ',
      done: remaining <= 0.009,
      can_record_payment: false,
      actor: 'Phạm Thị Kế Toán',
    },
    installments: [],
  },
})

const mockFetch = (initialState, extra = () => null) => {
  let state = initialState
  const fetchMock = vi.fn((url, options = {}) => {
    const extraResult = extra(String(url), options, (next) => { state = next })
    if (extraResult) return extraResult
    if (String(url).endsWith('/deliverables')) return response({ data: { items: [] } })
    return response(state)
  })
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('HandoverPanel K06', () => {
  it('tải format bàn giao bằng request có xác thực', async () => {
    window.localStorage.setItem('bachkhoa_access_token', 'token-k08')
    const fetchMock = mockFetch(stateFor())
    vi.stubGlobal('fetch', fetchMock)

    render(<HandoverPanel taskNodeId="TN-K06" checklist={checklist} isDirector />)

    expect(await screen.findByText('Giao hồ sơ cho khách')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/handover/TN-K06',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-k08' }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('khóa checklist và chỉ hiện Xin duyệt nợ khi nhân viên còn công nợ', async () => {
    vi.stubGlobal('fetch', mockFetch(stateFor()))

    render(<HandoverPanel taskNodeId="TN-K06" checklist={checklist} isDirector={false} />)

    expect(await screen.findByRole('button', { name: 'Xin duyệt nợ' })).toBeEnabled()
    expect(screen.getByText(checklist[0].name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nộp checklist' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nộp nghiệm thu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt nợ' })).not.toBeInTheDocument()
  })

  it('gửi yêu cầu nợ theo đúng task node và chuyển sang trạng thái chờ duyệt', async () => {
    const pendingState = stateFor({ requestStatus: 'pending' })
    const fetchMock = mockFetch(stateFor(), (url, options, setState) => {
      if (url.endsWith('/debt-requests') && options.method === 'POST') {
        setState(pendingState)
        return response({ status: 'success', data: pendingState.data.debt_request })
      }
      return null
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<HandoverPanel taskNodeId="TN-K06" checklist={checklist} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Xin duyệt nợ' }))
    fireEvent.change(screen.getByLabelText('Lý do bàn giao khi còn nợ'), {
      target: { value: 'Khách cần hồ sơ để vay ngân hàng' },
    })
    fireEvent.change(screen.getByLabelText('Ngày hẹn thanh toán'), {
      target: { value: '2026-09-15' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/handover/TN-K06/debt-requests',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    ))
    expect(await screen.findByText('Chờ Giám đốc duyệt nợ')).toBeInTheDocument()
  })

  it('duyệt nợ mở checklist và không còn bước Nộp nghiệm thu riêng', async () => {
    vi.stubGlobal('fetch', mockFetch(stateFor({ requestStatus: 'approved' })))

    render(<HandoverPanel taskNodeId="TN-K06" checklist={checklist} />)

    expect(await screen.findByRole('button', { name: 'Nộp checklist' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nộp nghiệm thu' })).not.toBeInTheDocument()
    expect(screen.queryByText('Chờ nghiệm thu')).not.toBeInTheDocument()
    expect(screen.getByText(/Đã duyệt ngoại lệ cho nợ/i)).toBeInTheDocument()
  })

  it('không gọi API nộp nghiệm thu riêng khi checklist đã đủ', async () => {
    const readyChecklist = [{ ...checklist[0], status: 'pending_approval', status_label: 'Chờ duyệt' }]
    const fetchMock = mockFetch(
      stateFor({ requestStatus: 'approved', canSubmitAcceptance: true }),
      (url, options) => (
        url.endsWith('/submit-acceptance') && options.method === 'POST'
          ? response({ status: 'success', data: { status: 'submitted' } })
          : null
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<HandoverPanel taskNodeId="TN-K06" checklist={readyChecklist} />)
    expect(await screen.findByText('Giao hồ sơ cho khách')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nộp nghiệm thu' })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/submit-acceptance'))).toBe(false)
  })

  it('Giám đốc duyệt đúng yêu cầu đang chờ, không duyệt thẳng cả hợp đồng', async () => {
    const fetchMock = mockFetch(
      stateFor({ requestStatus: 'pending' }),
      (url, options) => (
        url.endsWith('/debt-requests/REQ-1/review') && options.method === 'POST'
          ? response({ status: 'success', data: { status: 'approved' } })
          : null
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<HandoverPanel taskNodeId="TN-K06" checklist={checklist} isDirector readOnly />)
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt nợ' }))
    fireEvent.change(screen.getByPlaceholderText(/Ghi chú phê duyệt/i), {
      target: { value: 'Đồng ý bàn giao trước' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận duyệt nợ' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/handover/debt-requests/REQ-1/review',
      expect.objectContaining({ method: 'POST' }),
    ))
  })

  it('Giám đốc xem được file cam kết qua đường dẫn bảo vệ', async () => {
    vi.stubGlobal('fetch', mockFetch(stateFor({
      requestStatus: 'pending',
      commitmentAttachment: {
        id: 'FILE-1',
        filename: 'cam-ket-tra-no.pdf',
        content_type: 'application/pdf',
        url: '/api/handover/debt-requests/REQ-1/commitment',
      },
    })))

    render(<HandoverPanel taskNodeId="TN-K06" checklist={checklist} isDirector readOnly />)

    expect(await screen.findByText('File cam kết')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cam-ket-tra-no\.pdf/i })).toBeInTheDocument()
  })
})
