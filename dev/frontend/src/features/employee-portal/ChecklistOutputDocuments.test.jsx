import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { apiFetch } from '../../lib/api'
import ChecklistOutputDocuments from './ChecklistOutputDocuments'

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CAU_HINH = [{
  template_id: 'TPL_BAN_KY_THUAT_GOC',
  min_count: 1,
  required_before_submit: true,
  needs_director_approval: true,
}]

const mockApi = ({ documents, missing = [], sourceDocs = [] } = {}) => {
  apiFetch.mockImplementation((url) => {
    if (url.includes('/output-status')) {
      return Promise.resolve({
        can_submit: missing.length === 0,
        missing,
        documents: documents ?? [{
          template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
          min_count: 1, current_count: 0,
          required_before_submit: true, needs_director_approval: true,
        }],
      })
    }
    if (url.includes('/source-documents')) return Promise.resolve({ data: sourceDocs })
    return Promise.resolve({ status: 'success', data: {} })
  })
}

const dung = (props = {}) => render(
  <ChecklistOutputDocuments
    taskNodeId="TN-K02"
    checklistResultId="CR-1"
    outputDocuments={CAU_HINH}
    contractId="003/BK-2026"
    {...props}
  />
)

it('mục checklist thường không hiện khu tài liệu đầu ra', () => {
  mockApi()
  const { container } = dung({ outputDocuments: [] })
  expect(container).toBeEmptyDOMElement()
  // Không cấu hình thì cũng không gọi máy chủ.
  expect(apiFetch).not.toHaveBeenCalled()
})

it('hiện đúng tên loại giấy, số cần/đã có và nhãn chờ duyệt', async () => {
  mockApi({ missing: ['Bản kỹ thuật gốc (cần 1, đang có 0)'] })
  dung()

  expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
  expect(screen.getByText('0/1')).toBeInTheDocument()
  expect(screen.getByText('Bắt buộc')).toBeInTheDocument()
  expect(screen.getByText('Chờ Giám đốc duyệt')).toBeInTheDocument()
  expect(screen.getByText(/Còn thiếu:/)).toBeInTheDocument()
})

it('upload tài liệu mới chỉ gọi endpoint upload đúng một lần', async () => {
  mockApi()
  const { container } = dung()
  await screen.findByText('Bản kỹ thuật gốc')

  const input = container.querySelector('.cod__file')
  fireEvent.change(input, {
    target: { files: [new File(['x'], 'ban-ky-thuat.pdf', { type: 'application/pdf' })] },
  })

  await waitFor(() => {
    const uploads = apiFetch.mock.calls.filter(
      ([url, opts]) => url.endsWith('/output-documents') && opts?.method === 'POST'
    )
    expect(uploads).toHaveLength(1)
  })
})

it('dùng lại tài liệu cũ KHÔNG gọi upload — chỉ tạo quan hệ', async () => {
  mockApi({ sourceDocs: [{ id: 'DOC-K02', file_name: 'ban-ky-thuat-goc.pdf' }] })
  dung()
  await screen.findByText('Bản kỹ thuật gốc')

  fireEvent.click(screen.getByRole('button', { name: /Dùng lại/ }))
  fireEvent.click(await screen.findByRole('button', { name: /ban-ky-thuat-goc\.pdf/ }))

  await waitFor(() => {
    const gan = apiFetch.mock.calls.filter(
      ([url, opts]) => /\/output-documents\/DOC-K02$/.test(url) && opts?.method === 'POST'
    )
    expect(gan).toHaveLength(1)
  })
  // Không có lời gọi upload nào (endpoint upload kết thúc bằng /output-documents).
  const uploads = apiFetch.mock.calls.filter(
    ([url, opts]) => url.endsWith('/output-documents') && opts?.method === 'POST'
  )
  expect(uploads).toHaveLength(0)
})

it('đã đủ tài liệu thì hiện “Đã đủ”, không hiện dòng còn thiếu', async () => {
  mockApi({
    documents: [{
      template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
      min_count: 1, current_count: 1,
      required_before_submit: true, needs_director_approval: false,
    }],
  })
  dung()

  expect(await screen.findByText('Đã đủ')).toBeInTheDocument()
  expect(screen.getByText('1/1')).toBeInTheDocument()
  expect(screen.queryByText(/Còn thiếu:/)).not.toBeInTheDocument()
})

it('chỉ hiện loại tài liệu Giám đốc đã cấu hình, không hiện loại lạ', async () => {
  mockApi({
    documents: [
      { template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc', min_count: 1, current_count: 0 },
      { template_id: 'TPL_LA', slot_name: 'Giấy lạ không cấu hình', min_count: 1, current_count: 0 },
    ],
  })
  dung()

  await screen.findByText('Bản kỹ thuật gốc')
  expect(screen.queryByText('Giấy lạ không cấu hình')).not.toBeInTheDocument()
})

it('chỉ xem thì không có nút tải lên', async () => {
  mockApi()
  dung({ editable: false })

  await screen.findByText('Bản kỹ thuật gốc')
  expect(screen.queryByRole('button', { name: /Tải lên/ })).not.toBeInTheDocument()
})
