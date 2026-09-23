import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LegalSubmissions from './LegalSubmissions'

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

vi.mock('../components/ui', () => ({
  DataTable: ({ data, columns, emptyText }) => (
    <div>
      {data.length === 0 ? <span>{emptyText}</span> : data.map((row) => (
        <div key={row.id} data-testid="legal-row">
          {columns.map((column) => (
            <span key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</span>
          ))}
        </div>
      ))}
    </div>
  ),
  Modal: ({ open, children, footer }) => open ? <div role="dialog">{children}{footer}</div> : null,
  StatCard: ({ label, value }) => <span>{label}: {value}</span>,
  StatsGrid: ({ children }) => <div>{children}</div>,
  FilterBar: () => null,
  Badge: ({ children }) => <span>{children}</span>,
}))

vi.mock('../features/legal-dossier/LegalDossierActions', () => ({ default: () => null }))
vi.mock('../features/legal-dossier/DossierDocuments', () => ({ default: () => null }))
vi.mock('../features/contracts/DocumentCabinet', () => ({ default: () => null }))

const dossier = {
  id: 'd-010',
  contract_id: '010/BK-2026',
  dossier_name: 'Hồ sơ pháp lý HĐ 010',
  service_line_name: 'Kiểm tra hiện trạng',
  status: 'ASSIGNED',
  status_label: 'Đã phân công',
  submission_count: 0,
  latest_receipt_code: null,
  assigned_employee_name: 'Lê Quang Huy',
}

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/catalog/service-packages')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    if (url.includes('/api/legal-submissions/stats')) return Promise.resolve({ ok: true, json: async () => ({ data: { total: 0 } }) })
    if (url.includes('/api/legal-submissions/?')) return Promise.resolve({ ok: true, json: async () => ({ data: [], meta: { total: 0, total_pages: 1 } }) })
    if (url.endsWith('/api/legal-dossiers/?status=All')) return Promise.resolve({ ok: true, json: async () => ({ data: [dossier] }) })
    if (url.endsWith('/api/legal-dossiers/d-010')) return Promise.resolve({ ok: true, json: async () => ({ status: 'success', data: dossier }) })
    return Promise.resolve({ ok: false, json: async () => ({}) })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LegalSubmissions', () => {
  it('hiển thị hồ sơ nền ngay sau khi node Soạn thảo được bắt đầu, dù chưa có lần nộp', async () => {
    render(<LegalSubmissions />)

    expect(await screen.findByText('Hồ sơ pháp lý HĐ 010')).toBeInTheDocument()
    expect(screen.getByText('Chưa nộp')).toBeInTheDocument()
    expect(screen.getByText('Đã phân công')).toBeInTheDocument()
  })

  it('mở đúng chi tiết legal_dossiers thay vì gọi nhầm legal_submissions', async () => {
    render(<LegalSubmissions />)
    await screen.findByText('Hồ sơ pháp lý HĐ 010')
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết' }))

    await waitFor(() => expect(screen.getByText(/Hồ sơ nền đã được tạo từ node Soạn thảo/)).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/legal-dossiers/d-010'))
  })
})
