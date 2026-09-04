import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

const CAU_HINH_FLAT = [
  {
    template_id: 'TPL_BAN_KY_THUAT_GOC',
    min_count: 1,
    required_before_submit: true,
    needs_director_approval: false,
  },
  {
    template_id: 'TPL_ANH_CHUP',
    min_count: 1,
    required_before_submit: true,
    needs_director_approval: false,
  },
]

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
  const uploads = apiFetch.mock.calls.filter(
    ([url, opts]) => url.endsWith('/output-documents') && opts?.method === 'POST'
  )
  expect(uploads).toHaveLength(0)
})

it('đã đủ tài liệu thì hiện "Đã đủ", không hiện dòng còn thiếu', async () => {
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

describe('Trạng thái tài liệu từ reviewByTemplate', () => {
  it('tờ đã duyệt hiển thị nhãn "Đã duyệt" và ẩn nút tải lên', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'approved' } } })

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tải lên/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dùng lại/ })).not.toBeInTheDocument()
  })

  it('tờ đã duyệt hiển thị thông báo bảo vệ', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'approved' } } })

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
    expect(screen.getByText(/Đã duyệt — không thể thay thế/)).toBeInTheDocument()
  })

  it('tờ bị từ chối hiển thị nhãn "Bị từ chối" và lý do', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'rejected', rejection_reason: 'Ảnh mờ không đọc được' } } })

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
    expect(screen.getByText('Bị từ chối')).toBeInTheDocument()
    expect(screen.getByText(/Ảnh mờ không đọc được/)).toBeInTheDocument()
  })

  it('tờ chờ duyệt hiển thị nhãn "Chờ duyệt" và số đếm', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'pending_review' } } })

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })

  it('tờ chưa nộp hiển thị số đếm 0/n', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 0,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung()

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })
})

describe('Bảo vệ tờ đã duyệt', () => {
  it('tờ đã duyệt ẩn nút tải lên và dùng lại', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'approved' } } })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.queryByRole('button', { name: /Tải lên/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dùng lại/ })).not.toBeInTheDocument()
  })

  it('tờ bị từ chối VẪN hiện nút tải lên (có thể nộp lại)', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'rejected', rejection_reason: 'Ảnh mờ' } } })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.getByRole('button', { name: /Tải lên/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dùng lại/ })).toBeInTheDocument()
  })
})

describe('Cổng quyền — chỉ xem', () => {
  it('chỉ xem ẩn tất cả nút hành động cho mọi tờ', async () => {
    mockApi({
      documents: [
        {
          template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
          min_count: 1, current_count: 1,
          required_before_submit: true, needs_director_approval: false,
        },
        {
          template_id: 'TPL_ANH_CHUP', slot_name: 'Ảnh chụp',
          min_count: 1, current_count: 0,
          required_before_submit: true, needs_director_approval: false,
        },
      ],
    })
    dung({ editable: false })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.queryByRole('button', { name: /Tải lên/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dùng lại/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đề xuất loại tài liệu/ })).not.toBeInTheDocument()
  })
})

describe('Xáo trộn lý do từ chối khi nộp lại', () => {
  it('tờ đã duyệt trước đó, bị trả, rồi nộp lại → hiện "Chờ duyệt", không hiện lý do cũ', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1,
        required_before_submit: true, needs_director_approval: false,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1-new', review_status: 'pending_review' } } })

    expect(await screen.findByText('Bản kỹ thuật gốc')).toBeInTheDocument()
    expect(screen.queryByText(/Ảnh mờ/)).not.toBeInTheDocument()
  })
})

describe('Phán quyết từ caller qua reviewByTemplate', () => {
  const CAU_HINH_2 = [
    { template_id: 'TPL_BAN_KY_THUAT_GOC', min_count: 1, required_before_submit: true, needs_director_approval: false },
    { template_id: 'TPL_ANH_CHUP', min_count: 1, required_before_submit: true, needs_director_approval: false },
  ]

  it('cả bốn trạng thái approved/rejected/pending/missing hiển thị đúng trên cùng một danh sách', async () => {
    mockApi({
      documents: [
        { template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc', min_count: 1, current_count: 1, required_before_submit: true },
        { template_id: 'TPL_ANH_CHUP', slot_name: 'Ảnh chụp', min_count: 1, current_count: 0, required_before_submit: true },
      ],
    })
    dung({
      outputDocuments: CAU_HINH_2,
      reviewByTemplate: {
        TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'approved' },
        TPL_ANH_CHUP: { document_id: 'd2', review_status: 'rejected', rejection_reason: 'Ảnh mờ' },
      },
    })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument()
    expect(screen.getByText('Bị từ chối')).toBeInTheDocument()
    expect(screen.getByText(/Ảnh mờ/)).toBeInTheDocument()
  })

  it('tờapproved bảo vệ: ẩn nút tải lên/dùng lại, hiện thông báo không thể thay thế', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1, required_before_submit: true,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'approved' } } })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.queryByRole('button', { name: /Tải lên/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dùng lại/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Đã duyệt — không thể thay thế/)).toBeInTheDocument()
  })

  it('tờrejected: hiện nút tải lên và dùng lại (có thể nộp lại)', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1, required_before_submit: true,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'rejected', rejection_reason: 'Sai định dạng' } } })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.getByRole('button', { name: /Tải lên/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dùng lại/ })).toBeInTheDocument()
  })

  it('tờpending: hiện số đếm và nút hành động', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 1, required_before_submit: true,
      }],
    })
    dung({ reviewByTemplate: { TPL_BAN_KY_THUAT_GOC: { document_id: 'd1', review_status: 'pending_review' } } })

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.getByText('1/1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tải lên/ })).toBeInTheDocument()
  })

  it('tờmissing: hiện 0/n và nút hành động', async () => {
    mockApi({
      documents: [{
        template_id: 'TPL_BAN_KY_THUAT_GOC', slot_name: 'Bản kỹ thuật gốc',
        min_count: 1, current_count: 0, required_before_submit: true,
      }],
    })
    dung()

    await screen.findByText('Bản kỹ thuật gốc')
    expect(screen.getByText('0/1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tải lên/ })).toBeInTheDocument()
  })
})
