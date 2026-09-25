import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContractTemplateManager from './ContractTemplateManager'
import { apiFetch, downloadFile } from '../../lib/api'
import { fetchProtectedDocumentFile } from '../../lib/fileSave'

const mockAddToast = vi.fn()

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  downloadFile: vi.fn(),
}))

vi.mock('../../lib/fileSave', () => ({
  fetchProtectedDocumentFile: vi.fn(),
}))

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))

describe('ContractTemplateManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddToast.mockClear()
    fetchProtectedDocumentFile.mockReset()
  })

  const v0 = {
    id: 'v0',
    code: 'TEST_CODE',
    version: 0,
    name: 'Mẫu test gốc',
    description: 'Bản cũ',
    status: 'archived',
    upload_state: 'ready',
    template_file_name: 'v0.docx',
    can_retry: false,
    created_at: '2026-01-01T00:00:00Z',
    created_by_name: 'Nguyễn Văn A',
  }

  const v1 = {
    id: 'v1',
    code: 'TEST_CODE',
    version: 1,
    name: 'Mẫu test v1',
    description: 'Bản ban hành',
    status: 'published',
    upload_state: 'ready',
    template_file_name: 'v1.docx',
    can_retry: false,
    created_at: '2026-02-01T00:00:00Z',
    created_by_name: 'Trần Thị B',
  }

  const v2 = {
    id: 'v2',
    code: 'TEST_CODE',
    version: 2,
    name: 'Mẫu test v2 lỗi',
    description: 'Bản lỗi upload',
    status: 'draft',
    upload_state: 'failed',
    template_file_name: 'v2.docx',
    can_retry: true,
    created_at: '2026-03-01T00:00:00Z',
    created_by_name: 'Lê Văn C',
  }

  const v3 = {
    id: 'v3',
    code: 'TEST_CODE',
    version: 3,
    name: 'Mẫu test v3',
    description: 'Bản nháp mới',
    status: 'draft',
    upload_state: 'ready',
    template_file_name: 'v3.docx',
    can_retry: false,
    created_at: '2026-04-01T00:00:00Z',
    created_by_name: 'Phạm Thị D',
  }

  const groupTest = {
    code: 'TEST_CODE',
    name: 'Mẫu test v3',
    latest_version: 3,
    active_template: v1,
    display_template: v3,
    versions: [v3, v2, v1, v0],
  }

  const groupNoPublished = {
    code: 'NO_PUB',
    name: 'Mẫu chưa ban hành',
    latest_version: 1,
    active_template: null,
    display_template: {
      id: 'np-v1',
      code: 'NO_PUB',
      version: 1,
      name: 'Mẫu chưa ban hành',
      description: 'Chỉ có nháp',
      status: 'draft',
      upload_state: 'ready',
      template_file_name: 'no_pub_v1.docx',
      can_retry: false,
      created_at: '2026-05-01T00:00:00Z',
      created_by_name: 'Hoàng Văn E',
    },
    versions: [
      {
        id: 'np-v1',
        code: 'NO_PUB',
        version: 1,
        name: 'Mẫu chưa ban hành',
        description: 'Chỉ có nháp',
        status: 'draft',
        upload_state: 'ready',
        template_file_name: 'no_pub_v1.docx',
        can_retry: false,
        created_at: '2026-05-01T00:00:00Z',
        created_by_name: 'Hoàng Văn E',
      },
    ],
  }

  it('shows failed-version recovery while keeping the published version usable', async () => {
    apiFetch.mockResolvedValue([
      {
        code: 'TEST_CODE',
        name: 'Mẫu test',
        latest_version: 2,
        active_template: v1,
        display_template: v2,
        versions: [v2, v1],
      },
    ])

    render(<ContractTemplateManager />)
    expect(await screen.findByText('Tải lên thất bại')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thử tải lại cùng tệp v2/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Tải file DOCX v1/i }))
    await waitFor(() =>
      expect(downloadFile).toHaveBeenCalledWith('/api/contracts/templates/v1/download', 'v1.docx'),
    )
  })

  it('opens a DOCX preview modal for each ready version', async () => {
    apiFetch.mockResolvedValue([groupTest])
    const blob = new Blob(['docx bytes'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    fetchProtectedDocumentFile.mockResolvedValue({
      blob,
      fileName: 'v1.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:template-preview')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Xem trước v1/i }))

    await waitFor(() => {
      expect(fetchProtectedDocumentFile).toHaveBeenCalledWith('/api/contracts/templates/v1/download')
    })
    expect(createObjectUrl).toHaveBeenCalledWith(blob)
    expect(screen.getByRole('heading', { name: 'Xem tài liệu v1.docx' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Xem tài liệu v1.docx' })).not.toBeInTheDocument())
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:template-preview')

    createObjectUrl.mockRestore()
    revokeObjectUrl.mockRestore()
  })

  it('displays groups with published v1, failed v2, ready draft v3, archived v0, and a group without published', async () => {
    apiFetch.mockResolvedValue([groupTest, groupNoPublished])

    render(<ContractTemplateManager />)

    expect(await screen.findByText('TEST_CODE')).toBeInTheDocument()
    expect(screen.getByText('NO_PUB')).toBeInTheDocument()

    // Group 1: active template is v1
    expect(screen.getByText(/Đang ban hành: v1/i)).toBeInTheDocument()
    // Group 2: active template is null
    expect(screen.getByText(/Chưa có bản ban hành/i)).toBeInTheDocument()

    // Status badges & text
    expect(screen.getByRole('heading', { level: 2, name: 'Mẫu test v3' })).toBeInTheDocument()
    expect(screen.getByText('Tải lên thất bại')).toBeInTheDocument()
    expect(screen.getByText('Lưu trữ')).toBeInTheDocument()
  })

  it('filters and searches templates with proper query parameters', async () => {
    apiFetch.mockResolvedValue([groupTest])

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    // Filter by status 'draft'
    const statusSelect = screen.getByRole('combobox', { name: /Trạng thái/i })
    fireEvent.change(statusSelect, { target: { value: 'draft' } })

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/contracts/templates/manage?status=draft&q='),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    // Search query
    const searchInput = screen.getByRole('searchbox', { name: /Tìm kiếm/i })
    fireEvent.change(searchInput, { target: { value: 'Hợp đồng & Đo đạc' } })

    const expectedQuery = new URLSearchParams({
      status: 'draft',
      q: 'Hợp đồng & Đo đạc',
    }).toString()

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/contracts/templates/manage?${expectedQuery}`),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
  })

  it('validates file extension and size before upload request', async () => {
    apiFetch.mockResolvedValue([groupTest])
    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thêm mẫu mới/i }))

    // Fill valid code and name
    fireEvent.change(screen.getByLabelText(/Mã mẫu/i), { target: { value: 'MAU_MOI' } })
    fireEvent.change(screen.getByLabelText(/Tên mẫu/i), { target: { value: 'Hợp đồng mới' } })

    // Non-docx file
    const invalidFile = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' })
    const fileInput = screen.getByLabelText(/Tệp DOCX/i)
    fireEvent.change(fileInput, { target: { files: [invalidFile] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))

    expect(mockAddToast).toHaveBeenCalledWith('Chọn tệp DOCX không quá 20 MiB', 'error')
    expect(apiFetch).not.toHaveBeenCalledWith(
      '/api/contracts/templates/upload',
      expect.anything(),
    )

    // Oversized docx file (> 20 MiB)
    const bigFile = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    fireEvent.change(fileInput, { target: { files: [bigFile] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))
    expect(mockAddToast).toHaveBeenCalledWith('Chọn tệp DOCX không quá 20 MiB', 'error')
  })

  it('validates code format on new template upload', async () => {
    apiFetch.mockResolvedValue([groupTest])
    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thêm mẫu mới/i }))

    // Invalid code with special characters or too short
    fireEvent.change(screen.getByLabelText(/Mã mẫu/i), { target: { value: 'ab' } })
    fireEvent.change(screen.getByLabelText(/Tên mẫu/i), { target: { value: 'Mẫu hợp lệ' } })
    const validFile = new File(['valid docx bytes'], 'valid.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    fireEvent.change(screen.getByLabelText(/Tệp DOCX/i), { target: { files: [validFile] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))

    expect(mockAddToast).toHaveBeenCalledWith(
      'Mã mẫu phải gồm 3-50 ký tự (chữ hoa, số, gạch dưới)',
      'error',
    )
    expect(apiFetch).not.toHaveBeenCalledWith(
      '/api/contracts/templates/upload',
      expect.anything(),
    )
  })

  it('submits new template upload with correct FormData and handles success', async () => {
    apiFetch.mockImplementation(async (path, options) => {
      if (path.startsWith('/api/contracts/templates/manage')) {
        return [groupTest]
      }
      if (path === '/api/contracts/templates/upload') {
        return {
          status: 'success',
          data: { id: 'new-v1', version: 1 },
          publication_skipped: false,
        }
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thêm mẫu mới/i }))

    fireEvent.change(screen.getByLabelText(/Mã mẫu/i), { target: { value: 'new_code' } })
    fireEvent.change(screen.getByLabelText(/Tên mẫu/i), { target: { value: 'Mẫu mới tạo' } })
    fireEvent.change(screen.getByLabelText(/Mô tả/i), { target: { value: 'Ghi chú cho mẫu' } })

    const file = new File(['docx content'], 'new_code.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    fireEvent.change(screen.getByLabelText(/Tệp DOCX/i), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/contracts/templates/upload', {
        method: 'POST',
        body: expect.any(FormData),
        timeout: 60000,
      })
    })

    // Inspect the FormData sent
    const uploadCall = apiFetch.mock.calls.find((c) => c[0] === '/api/contracts/templates/upload')
    const formData = uploadCall[1].body
    expect(formData.get('code')).toBe('NEW_CODE')
    expect(formData.get('name')).toBe('Mẫu mới tạo')
    expect(formData.get('description')).toBe('Ghi chú cho mẫu')
    expect(formData.get('publish_immediately')).toBe('true')
    expect(formData.get('file')).toBe(file)

    expect(mockAddToast).toHaveBeenCalledWith('Đã lưu mẫu hợp đồng', 'success')
  })

  it('prevents double submission while upload is in-flight', async () => {
    let resolveUpload
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/upload') {
        return new Promise((resolve) => {
          resolveUpload = resolve
        })
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thêm mẫu mới/i }))
    fireEvent.change(screen.getByLabelText(/Mã mẫu/i), { target: { value: 'TEST_DOUBLE' } })
    fireEvent.change(screen.getByLabelText(/Tên mẫu/i), { target: { value: 'Double Submit Test' } })
    const file = new File(['content'], 'test.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    fireEvent.change(screen.getByLabelText(/Tệp DOCX/i), { target: { files: [file] } })

    const submitBtn = screen.getByRole('button', { name: /Tải lên và lưu/i })
    fireEvent.click(submitBtn)
    fireEvent.click(submitBtn)

    const uploadCalls = apiFetch.mock.calls.filter((c) => c[0] === '/api/contracts/templates/upload')
    expect(uploadCalls).toHaveLength(1)

    resolveUpload({ status: 'success', data: { id: 'v1' }, publication_skipped: false })
  })

  it('shows publication_skipped notification when a newer version is already published', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/upload') {
        return {
          status: 'success',
          data: { id: 'v2' },
          publication_skipped: true,
        }
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thêm mẫu mới/i }))
    fireEvent.change(screen.getByLabelText(/Mã mẫu/i), { target: { value: 'TEST_SKIP' } })
    fireEvent.change(screen.getByLabelText(/Tên mẫu/i), { target: { value: 'Skip Test' } })
    const file = new File(['content'], 'test.docx')
    fireEvent.change(screen.getByLabelText(/Tệp DOCX/i), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'Tệp đã sẵn sàng ở bản nháp vì có phiên bản mới hơn đang ban hành',
        'success',
      )
    })
  })

  it('submits upgrade version for existing template and inherits name if blank', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/v1/versions') {
        return { status: 'success', data: { id: 'v4', version: 4 }, publication_skipped: false }
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    // Click "Nâng cấp từ v1"
    const upgradeBtns = screen.getAllByRole('button', { name: /Nâng cấp từ v1/i })
    fireEvent.click(upgradeBtns[0])

    expect(screen.getByText(/Nâng cấp phiên bản cho TEST_CODE/i)).toBeInTheDocument()

    // Name left blank to inherit, description entered
    fireEvent.change(screen.getByLabelText(/Mô tả/i), { target: { value: 'Bản vá điều khoản' } })
    const file = new File(['upgrade content'], 'upgrade.docx')
    fireEvent.change(screen.getByLabelText(/Tệp DOCX/i), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/contracts/templates/v1/versions', {
        method: 'POST',
        body: expect.any(FormData),
        timeout: 60000,
      })
    })

    const uploadCall = apiFetch.mock.calls.find((c) => c[0] === '/api/contracts/templates/v1/versions')
    const formData = uploadCall[1].body
    expect(formData.get('code')).toBeNull() // code is NOT included in upgrade payload
    expect(formData.get('name')).toBe('')
    expect(formData.get('description')).toBe('Bản vá điều khoản')
    expect(formData.get('file')).toBe(file)
  })

  it('retains file and refreshes list when upload encounters error', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/upload') {
        throw new Error('Máy chủ quá tải, vui lòng thử lại')
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thêm mẫu mới/i }))
    fireEvent.change(screen.getByLabelText(/Mã mẫu/i), { target: { value: 'TEST_ERR' } })
    fireEvent.change(screen.getByLabelText(/Tên mẫu/i), { target: { value: 'Error Test' } })
    const file = new File(['content'], 'test.docx')
    fireEvent.change(screen.getByLabelText(/Tệp DOCX/i), { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: /Tải lên và lưu/i }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Máy chủ quá tải, vui lòng thử lại', 'error')
    })

    // Modal stays open and file is retained
    expect(screen.getByLabelText(/Mã mẫu/i)).toHaveValue('TEST_ERR')
    // List reloaded
    expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/contracts/templates/manage'),
      expect.anything(),
    )
  })

  it('submits retry upload with only file payload to the specific version ID', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/v2/retry-upload') {
        return { status: 'success', data: { id: 'v2', version: 2 }, publication_skipped: false }
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    fireEvent.click(screen.getByRole('button', { name: /Thử tải lại cùng tệp v2/i }))

    const modalDialog = screen.getByRole('dialog')
    // Modal should show retry information
    expect(within(modalDialog).getByText(/Thử tải lại tệp cho v2/i)).toBeInTheDocument()
    expect(within(modalDialog).getByText(/v2.docx/i)).toBeInTheDocument()
    expect(
      within(modalDialog).getByText(/Lựa chọn ban hành ban đầu sẽ được giữ nguyên/i),
    ).toBeInTheDocument()

    // Inputs for code, name, description must not exist in retry mode
    expect(within(modalDialog).queryByLabelText(/Mã mẫu/i)).not.toBeInTheDocument()
    expect(within(modalDialog).queryByLabelText(/Tên mẫu/i)).not.toBeInTheDocument()

    const file = new File(['v2 retry content'], 'v2.docx')
    fireEvent.change(within(modalDialog).getByLabelText(/Tệp DOCX/i), { target: { files: [file] } })

    fireEvent.click(within(modalDialog).getByRole('button', { name: /Tải lên và lưu/i }))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/contracts/templates/v2/retry-upload', {
        method: 'POST',
        body: expect.any(FormData),
        timeout: 60000,
      })
    })

    const retryCall = apiFetch.mock.calls.find(
      (c) => c[0] === '/api/contracts/templates/v2/retry-upload',
    )
    const formData = retryCall[1].body
    expect(formData.get('file')).toBe(file)
    expect(formData.get('name')).toBeNull()
    expect(formData.get('code')).toBeNull()
    expect(formData.get('publish_immediately')).toBeNull()
  })

  it('changes version lifecycle status to published or archived', async () => {
    apiFetch.mockImplementation(async (path, options) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path.endsWith('/status')) {
        return { status: 'success', data: {} }
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    // v3 is ready draft: can be published
    const publishBtn = screen.getByRole('button', { name: /Ban hành v3/i })
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/contracts/templates/v3/status', {
        method: 'POST',
        body: JSON.stringify({ status: 'published' }),
      })
    })
    expect(mockAddToast).toHaveBeenCalledWith('Đã cập nhật trạng thái phiên bản', 'success')

    // v1 is published: can be archived
    const archiveBtn = screen.getByRole('button', { name: /Lưu trữ v1/i })
    fireEvent.click(archiveBtn)

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/contracts/templates/v1/status', {
        method: 'POST',
        body: JSON.stringify({ status: 'archived' }),
      })
    })
  })

  it('displays error when attempting to archive the last published template', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/v1/status') {
        const error = new Error('Không thể lưu trữ mẫu hợp đồng ban hành cuối cùng trong hệ thống')
        error.status = 400
        throw error
      }
      return []
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    const archiveBtn = screen.getByRole('button', { name: /Lưu trữ v1/i })
    fireEvent.click(archiveBtn)

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'Không thể lưu trữ mẫu hợp đồng ban hành cuối cùng trong hệ thống',
        'error',
      )
    })
  })

  it('handles download error gracefully with toast', async () => {
    apiFetch.mockResolvedValue([groupTest])
    downloadFile.mockRejectedValue(new Error('Tệp không tồn tại trên bộ lưu trữ'))

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    const downloadBtn = screen.getByRole('button', { name: /Tải file DOCX v1/i })
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Tệp không tồn tại trên bộ lưu trữ', 'error')
    })
  })

  it('disables download and lifecycle actions for pending or failed versions', async () => {
    const pendingVersion = {
      id: 'v_pending',
      code: 'TEST_CODE',
      version: 4,
      name: 'Bản đang xử lý',
      status: 'draft',
      upload_state: 'pending',
      template_file_name: 'pending.docx',
      can_retry: false,
    }
    const groupWithPending = {
      ...groupTest,
      versions: [pendingVersion, v2, v1],
    }
    apiFetch.mockResolvedValue([groupWithPending])

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    // v_pending download button should be disabled
    const downloadPending = screen.getByRole('button', { name: /Tải file DOCX v4/i })
    expect(downloadPending).toBeDisabled()

    // v2 download button should be disabled
    const downloadFailed = screen.getByRole('button', { name: /Tải file DOCX v2/i })
    expect(downloadFailed).toBeDisabled()

    // No publish/archive buttons for pending or failed versions
    expect(screen.queryByRole('button', { name: /Ban hành v4/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ban hành v2/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lưu trữ v4/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lưu trữ v2/i })).not.toBeInTheDocument()
  })

  it('opens placeholder drawer, lazy-fetches placeholders, and copies to clipboard', async () => {
    const mockPlaceholders = [
      {
        category: 'Khách hàng',
        items: [
          { placeholder: 'customer_name', label: 'Tên khách hàng', example: 'Công ty TNHH ABC' },
          { placeholder: 'phone', label: 'Số điện thoại', example: '0901234567' },
        ],
      },
      {
        category: 'Hợp đồng',
        items: [
          { placeholder: 'contract_id', label: 'Số hợp đồng', example: '001/BK-2026' },
        ],
      },
      {
        category: 'Giá trị',
        items: [
          { placeholder: 'total_amount', label: 'Tổng giá trị', example: '50.000.000 đ' },
        ],
      },
    ]

    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/api/contracts/templates/manage')) return [groupTest]
      if (path === '/api/contracts/templates/placeholders') return mockPlaceholders
      return []
    })

    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    render(<ContractTemplateManager />)
    await screen.findByText('TEST_CODE')

    // Cheat sheet drawer initially not open
    expect(screen.queryByText('Ký hiệu thay thế (Placeholders)')).not.toBeInTheDocument()

    // Open drawer
    fireEvent.click(screen.getByRole('button', { name: /Tra cứu placeholder/i }))

    expect(await screen.findByText('Ký hiệu thay thế (Placeholders)')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/contracts/templates/placeholders')

    // Displays categories and items
    expect(screen.getByText('Khách hàng')).toBeInTheDocument()
    expect(screen.getByText('{{customer_name}}')).toBeInTheDocument()
    expect(screen.getByText('Tên khách hàng')).toBeInTheDocument()
    expect(screen.getByText('Công ty TNHH ABC')).toBeInTheDocument()

    // Shows scope and caveats
    expect(
      screen.getByText(/Hệ thống hỗ trợ thay thế placeholder trong các đoạn văn bản/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Header, Footer hoặc Textbox hiện chưa được hỗ trợ/i),
    ).toBeInTheDocument()

    // Copy action
    const copyBtn = screen.getByRole('button', { name: /Sao chép {{customer_name}}/i })
    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('{{customer_name}}')
    })
    expect(mockAddToast).toHaveBeenCalledWith('Đã sao chép {{customer_name}}', 'success')

    // Clipboard error handling
    writeTextMock.mockRejectedValueOnce(new Error('Permission denied'))
    const copyPhoneBtn = screen.getByRole('button', { name: /Sao chép {{phone}}/i })
    fireEvent.click(copyPhoneBtn)

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Không thể sao chép vào bộ nhớ tạm', 'error')
    })

    // Close drawer
    fireEvent.click(screen.getByRole('button', { name: /Đóng bảng tra cứu/i }))
    await waitFor(() => {
      expect(screen.queryByText('Ký hiệu thay thế (Placeholders)')).not.toBeInTheDocument()
    })
  })

  it('renders loading, empty, and fetch error states properly', async () => {
    // 1. Loading state
    let resolveTemplates
    apiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTemplates = resolve
        }),
    )

    const { rerender } = render(<ContractTemplateManager />)
    expect(screen.getByText(/Đang tải danh sách mẫu hợp đồng/i)).toBeInTheDocument()

    // 2. Empty state
    resolveTemplates([])
    expect(await screen.findByText('Chưa có mẫu hợp đồng nào')).toBeInTheDocument()

    // 3. Error state with retry
    apiFetch.mockRejectedValue(new Error('Lỗi kết nối máy chủ'))
    rerender(<ContractTemplateManager />)

    // Trigger filter change to force reload
    const statusSelect = screen.getByRole('combobox', { name: /Trạng thái/i })
    fireEvent.change(statusSelect, { target: { value: 'published' } })

    expect(await screen.findByText('Lỗi kết nối máy chủ')).toBeInTheDocument()
    const retryFetchBtn = screen.getByRole('button', { name: /Thử lại/i })
    expect(retryFetchBtn).toBeInTheDocument()
  })

  it('calls onClose when back/close button is clicked', async () => {
    apiFetch.mockResolvedValue([groupTest])
    const handleClose = vi.fn()

    render(<ContractTemplateManager onClose={handleClose} />)
    await screen.findByText('TEST_CODE')

    const backBtn = screen.getByRole('button', { name: /Quay lại danh sách/i })
    fireEvent.click(backBtn)

    expect(handleClose).toHaveBeenCalledTimes(1)
  })
})
