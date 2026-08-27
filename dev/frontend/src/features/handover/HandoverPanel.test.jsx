import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      can_record_payment: true,
      actor: 'Phạm Thị Kế Toán',
    },
    installments: [],
  },
})

const mockFetch = (initialState, extra = () => null) => {
  let currentState = initialState
  const fetchMock = vi.fn((url, options = {}) => {
    const custom = extra(url, options, currentState)
    if (custom) return custom

    const path = String(url)
    if (path.endsWith('/deliverables')) {
      return response({ data: { contract_id: 'HD-001', deliverables: [], all_ready: false } })
    }
    if (path.endsWith('/checklist')) {
      return response({ data: checklist })
    }
    if (path.endsWith('/checklist-fingerprint')) {
      return response({ data: { count: 1, fingerprint: 'fp-1' } })
    }
    if (path.endsWith('/debt-request') && options.method === 'POST') {
      const payload = JSON.parse(options.body || '{}')
      currentState = stateFor({
        requestStatus: 'pending',
        commitmentAttachment: payload.commitment_attachment || null,
      })
      return response({
        data: {
          request_id: 'REQ-1',
          status: 'pending',
          remaining: 5_000_000,
        },
      })
    }
    if (path.endsWith('/debt-request/approve') && options.method === 'POST') {
      currentState = stateFor({ requestStatus: 'approved', canSubmitAcceptance: true })
      return response({ data: { ok: true, status: 'approved', gate_open: true } })
    }
    if (path.endsWith('/submit-acceptance') && options.method === 'POST') {
      return response({ data: { node_finalized: false, delivered: true, remaining: 5_000_000 } })
    }
    return response(currentState)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('HandoverPanel payment method select', () => {
  it('uses the custom select inside the payment modal and keeps the value contract', async () => {
    mockFetch(stateFor({ remaining: 5_000_000 }))

    render(
      <HandoverPanel taskNodeId="task-1" addToast={vi.fn()} onChanged={vi.fn()} isDirector />
    )

    fireEvent.click(await screen.findByRole('button', { name: /ghi nhận thanh toán/i }))

    const paymentTrigger = () => document.body.querySelector('.ui-select__trigger')
    await waitFor(() => expect(paymentTrigger()?.textContent).toContain('Tiền mặt'))
    expect(document.body.querySelectorAll('select')).toHaveLength(0)

    fireEvent.click(paymentTrigger())
    fireEvent.click(screen.getByRole('option', { name: 'Chuyển khoản' }))

    expect(paymentTrigger()).toHaveTextContent('Chuyển khoản')
  })
})

describe('HandoverPanel debt request and gate flow', () => {
  it('renders locked state when contract still has debt', async () => {
    mockFetch(stateFor({ remaining: 5_000_000 }))

    render(<HandoverPanel taskNodeId="TN-K06" />)

    expect(await screen.findByText(/Khóa nợ/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xin duyệt nợ/i })).toBeInTheDocument()
  })

  it('allows staff to create a debt request with reason', async () => {
    mockFetch(stateFor({ remaining: 5_000_000 }))

    render(<HandoverPanel taskNodeId="TN-K06" />)

    fireEvent.click(await screen.findByRole('button', { name: /Xin duyệt nợ/i }))

    const reasonInput = screen.getByPlaceholderText(/Nêu rõ vì sao cho nợ/i)
    fireEvent.change(reasonInput, { target: { value: 'Khách cần hồ sơ để vay ngân hàng' } })

    const dateInput = screen.getByLabelText(/Hạn thanh toán cam kết/i)
    fireEvent.change(dateInput, { target: { value: '2026-09-15' } })

    const submitBtn = screen.getByRole('button', { name: /Gửi yêu cầu/i })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
