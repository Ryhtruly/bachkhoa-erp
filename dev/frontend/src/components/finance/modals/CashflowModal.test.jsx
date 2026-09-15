import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiFetchMock, addToastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  addToastMock: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))
vi.mock('../../ui', () => ({
  Modal: ({ open, children, title }) => (open ? <div><h1>{title}</h1>{children}</div> : null),
  FormGrid: ({ children }) => <div>{children}</div>,
  FormRow: ({ label, required, hint, children }) => (
    <div>
      <label>{label}{required ? ' *' : ''}{children}</label>
      {hint && <span>{hint}</span>}
    </div>
  ),
  Dropdown: ({ options, value, onChange, disabled, required }) => (
    <select value={value || ''} onChange={event => onChange(event.target.value)} disabled={disabled} required={required}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}))

import CashflowModal from './CashflowModal'

const contracts = [
  { id: 'CONTRACT-A', customer_id: 'customer-a', customer_name: 'Khách hàng A', service_type: 'Đo đạc A' },
  { id: 'CONTRACT-B', customer_id: 'customer-b', customer_name: 'Khách hàng B', service_type: 'Đo đạc B' },
]

const projects = [
  { id: 'PROJECT-A', contract_id: 'CONTRACT-A', customer_id: 'customer-a', label: 'CONTRACT-A — Hạng mục A' },
  { id: 'PROJECT-B', contract_id: 'CONTRACT-B', customer_id: 'customer-b', label: 'CONTRACT-B — Hạng mục B' },
]

function renderModal() {
  apiFetchMock.mockImplementation((url, options) => {
    if (options?.method === 'POST') return Promise.resolve({ id: 'PC-TEST-001' })
    if (url.endsWith('/finance/contracts')) return Promise.resolve(contracts)
    if (url.endsWith('/finance/projects')) return Promise.resolve(projects)
    if (url.endsWith('/finance/employees')) return Promise.resolve([])
    return Promise.resolve([])
  })

  return render(
    <CashflowModal
      open
      defaultType="Chi"
      isDirector
      user={{ id: 'director-1', full_name: 'Giám đốc' }}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CashflowModal contract linkage', () => {
  it('keeps optional linkage hidden until enabled and filters by customer then contract', async () => {
    renderModal()

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByText('Hợp đồng liên kết')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Liên kết với hợp đồng/i }))
    expect(screen.getByText('Hợp đồng liên kết')).toBeInTheDocument()

    const counterparty = screen.getByPlaceholderText('Chọn hoặc nhập tên người nhận...')
    fireEvent.change(counterparty, { target: { value: 'Khách hàng A' } })

    const contractSelect = screen.getByLabelText(/Hợp đồng liên kết/)
    expect(contractSelect).toHaveValue('')
    expect(within(contractSelect).getByRole('option', { name: /CONTRACT-A/ })).toBeInTheDocument()
    expect(within(contractSelect).queryByRole('option', { name: /CONTRACT-B/ })).not.toBeInTheDocument()

    fireEvent.change(contractSelect, { target: { value: 'CONTRACT-A' } })
    const projectSelect = screen.getByLabelText(/Hồ sơ \/ Dự án/)
    expect(within(projectSelect).getByRole('option', { name: /CONTRACT-A — Hạng mục A/ })).toBeInTheDocument()
    expect(within(projectSelect).queryByRole('option', { name: /CONTRACT-B — Hạng mục B/ })).not.toBeInTheDocument()
    expect(projectSelect).toHaveValue('')
  })

  it('locks linkage on for contract-required expense categories', async () => {
    renderModal()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())

    const categorySelect = screen.getAllByLabelText(/Hạng mục/)[0]
    fireEvent.change(categorySelect, { target: { value: 'Chi hoàn trả khách hàng' } })

    const checkbox = screen.getByRole('checkbox', { name: /Liên kết với hợp đồng/i })
    expect(checkbox).toBeChecked()
    expect(checkbox).toBeDisabled()
    expect(screen.getByLabelText(/Hợp đồng liên kết/)).toBeInTheDocument()
  })

  it('submits null linkage ids when the optional checkbox remains off', async () => {
    renderModal()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '100000' } })
    fireEvent.change(screen.getByPlaceholderText('Chọn hoặc nhập tên người nhận...'), {
      target: { value: 'Nhà cung cấp tự do' },
    })
    fireEvent.change(screen.getByPlaceholderText('Nhập chi tiết diễn giải giao dịch...'), {
      target: { value: 'Chi ngoài hợp đồng' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận phiếu chi' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/finance/cashflow/create',
      expect.objectContaining({ method: 'POST' }),
    ))
    const [, request] = apiFetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    const submitted = JSON.parse(request.body)
    expect(submitted.contract_id).toBeNull()
    expect(submitted.project_id).toBeNull()
    expect(submitted.category).toBe('Chi tiếp khách & Giao tế')
    expect(submitted.category).not.toContain('Chi ngoài hợp đồng')
    expect(submitted.description).toBe('Chi ngoài hợp đồng')
  })
})
