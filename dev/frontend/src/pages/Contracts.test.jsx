import React from 'react'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Contracts from './Contracts'
import { clearApiCache } from '../lib/api'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))

describe('Contracts', () => {
  afterEach(() => {
    clearApiCache()
    vi.unstubAllGlobals()
  })

  it('không gọi setter địa chỉ không tồn tại sau khi tạo hợp đồng', () => {
    const source = readFileSync('src/pages/Contracts.jsx', 'utf8')
    expect(source).not.toContain('setAddressLocation(')
  })

  it('đánh dấu toàn dòng hợp đồng còn nợ để chạy viền cảnh báo đỏ', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{
              id: '003/BK-2026',
              customer_name: 'Nguyễn Văn A',
              total_value: 10_000_000,
              remaining_amount: 2_000_000,
              service_lines: [{ name: 'Cắm mốc' }],
              status: 'active',
            }],
            pagination: {},
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (u === '/api/catalog/service-packages') return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts />)

    await screen.findAllByText('003/BK-2026')
    expect(container.querySelector('tr.contract-debt-row')).toBeInTheDocument()
    expect(screen.getByText(/còn 2\.000\.000/)).toBeInTheDocument()
  })

  // Địa chỉ bất động sản phải chọn từ danh mục địa giới, không gõ tay — gõ tay
  // thì mỗi người viết một kiểu và không bao giờ lọc hay đối chiếu được.
  it('bắt chọn tỉnh/phường từ danh mục, phường khoá cho tới khi chọn tỉnh', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: ['Tách thửa'] }) })
      if (u === '/api/contracts/templates') {
        return Promise.resolve({ ok: true, json: async () => ([{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }]) })
      }
      if (u === '/api/contracts/next-code') return Promise.resolve({ ok: true, json: async () => ({ contract_id: '001/BK-2026' }) })
      if (u === '/api/survey-records/wards/provinces') {
        return Promise.resolve({ ok: true, json: async () => ([{ code: '79', name: 'TP. Hồ Chí Minh' }]) })
      }
      if (u.startsWith('/api/survey-records/wards?')) {
        return Promise.resolve({ ok: true, json: async () => ([{ code: '760', name: 'Phường Bến Nghé' }]) })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts />)
    await waitFor(() => expect(container.querySelector('.contract-add-button')).toBeInTheDocument())
    fireEvent.click(container.querySelector('.contract-add-button'))

    const provinceSelect = await screen.findByLabelText(/Tỉnh \/ Thành phố/)
    const wardSelect = screen.getByLabelText(/Phường \/ Xã/)
    expect(wardSelect).toBeDisabled()

    fireEvent.click(provinceSelect)
    await waitFor(() => expect(screen.getByRole('button', { name: /TP\. Hồ Chí Minh/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /TP\. Hồ Chí Minh/ }))

    expect(wardSelect).not.toBeDisabled()
    fireEvent.click(wardSelect)
    await waitFor(() => expect(screen.getByRole('button', { name: /Phường Bến Nghé/ })).toBeInTheDocument())
  })

  it('đọc số tiền thành chữ để bắt lỗi gõ thừa hoặc thiếu số 0', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (u === '/api/contracts/templates') {
        return Promise.resolve({ ok: true, json: async () => ([{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }]) })
      }
      if (u === '/api/contracts/next-code') return Promise.resolve({ ok: true, json: async () => ({ contract_id: '001/BK-2026' }) })
      if (u === '/api/survey-records/wards/provinces') return Promise.resolve({ ok: true, json: async () => ([]) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts />)
    await waitFor(() => expect(container.querySelector('.contract-add-button')).toBeInTheDocument())
    fireEvent.click(container.querySelector('.contract-add-button'))

    const priceInput = await screen.findByLabelText(/Giá trị hợp đồng/)
    fireEvent.change(priceInput, { target: { value: '18500000' } })

    expect(priceInput.value).toBe('18.500.000')
    expect(screen.getByText('Mười tám triệu năm trăm nghìn đồng')).toBeInTheDocument()
  })

  it('cho phép Giám đốc chuyển sang màn quản lý mẫu và quay lại danh sách hợp đồng (true -> tab/click manager/back)', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (u === '/api/catalog/service-packages') return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (u.startsWith('/api/contracts/templates/manage')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([{
            code: 'HD_DODAC',
            name: 'Mẫu đo đạc địa chính',
            latest_version: 1,
            active_template: {
              id: 'tpl-1',
              code: 'HD_DODAC',
              version: 1,
              name: 'Mẫu đo đạc địa chính',
              status: 'published',
              upload_state: 'ready',
              template_file_name: 'dodac_v1.docx',
              can_retry: false,
            },
            display_template: {
              id: 'tpl-1',
              code: 'HD_DODAC',
              version: 1,
              name: 'Mẫu đo đạc địa chính',
              status: 'published',
              upload_state: 'ready',
              template_file_name: 'dodac_v1.docx',
              can_retry: false,
            },
            versions: [{
              id: 'tpl-1',
              code: 'HD_DODAC',
              version: 1,
              name: 'Mẫu đo đạc địa chính',
              status: 'published',
              upload_state: 'ready',
              template_file_name: 'dodac_v1.docx',
              can_retry: false,
            }],
          }]),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts isDirector={true} />)

    // Verify view switcher tabs for isDirector
    const templatesTab = await screen.findByRole('tab', { name: /Mẫu hợp đồng/i })
    const listTab = screen.getByRole('tab', { name: /Danh sách hợp đồng/i })
    expect(templatesTab).toBeInTheDocument()
    expect(listTab).toBeInTheDocument()
    expect(container.querySelector('.contract-add-button')).toBeInTheDocument()

    // Click manager tab to open ContractTemplateManager
    fireEvent.click(templatesTab)

    // Manager should be displayed
    expect(await screen.findByText('HD_DODAC')).toBeInTheDocument()
    expect(screen.getByText('Quản lý tài liệu Word mẫu DOCX, kiểm soát các phiên bản và ban hành hợp đồng')).toBeInTheDocument()
    // Composer add button must not appear in manager view
    expect(container.querySelector('.contract-add-button')).not.toBeInTheDocument()

    // Click back button inside manager (onClose)
    const backBtn = screen.getByRole('button', { name: /Quay lại danh sách/i })
    fireEvent.click(backBtn)

    // Should return to list view
    await waitFor(() => {
      expect(container.querySelector('.contract-add-button')).toBeInTheDocument()
    })
    expect(screen.queryByText('Quản lý tài liệu Word mẫu DOCX, kiểm soát các phiên bản và ban hành hợp đồng')).not.toBeInTheDocument()
  })

  it('không hiển thị tab chuyển đổi và không cho truy cập quản lý mẫu đối với người dùng không phải Giám đốc (false -> neither tab nor manager)', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (u === '/api/catalog/service-packages') return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts isDirector={false} />)

    await waitFor(() => {
      expect(container.querySelector('.contract-add-button')).toBeInTheDocument()
    })

    // Neither switcher tab nor manager should be present
    expect(screen.queryByRole('tab', { name: /Mẫu hợp đồng/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Danh sách hợp đồng/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Quản lý mẫu hợp đồng')).not.toBeInTheDocument()
    expect(screen.queryByText('Quản lý tài liệu Word mẫu DOCX, kiểm soát các phiên bản và ban hành hợp đồng')).not.toBeInTheDocument()
  })

  it('khi đang ở màn quản lý mẫu mà quyền Giám đốc bị thu hồi, tự động trở về danh sách hợp đồng (rerender true to false while templates selected -> list only)', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (u === '/api/catalog/service-packages') return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (u.startsWith('/api/contracts/templates/manage')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([{
            code: 'HD_TEST',
            name: 'Mẫu test rerender',
            latest_version: 1,
            active_template: null,
            display_template: { id: 'tpl-test', code: 'HD_TEST', version: 1, name: 'Mẫu test rerender', status: 'draft', upload_state: 'ready', template_file_name: 'test.docx' },
            versions: [],
          }]),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container, rerender } = render(<Contracts isDirector={true} />)

    // Navigate to templates view
    const templatesTab = await screen.findByRole('tab', { name: /Mẫu hợp đồng/i })
    fireEvent.click(templatesTab)
    expect(await screen.findByText('HD_TEST')).toBeInTheDocument()

    // Rerender with isDirector=false while templates view is active
    rerender(<Contracts isDirector={false} />)

    // Should immediately show list only, no manager, no tabs
    await waitFor(() => {
      expect(screen.queryByText('HD_TEST')).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: /Mẫu hợp đồng/i })).not.toBeInTheDocument()
      expect(container.querySelector('.contract-add-button')).toBeInTheDocument()
    })
  })

  it('chuyển qua lại giữa danh sách và mẫu hợp đồng bảo lưu hợp đồng đang chọn và bộ lọc', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 'HD-001', customer_name: 'Khách Một', total_value: 5000000, status: 'active', service_lines: [] },
              { id: 'HD-002', customer_name: 'Khách Hai', total_value: 8000000, status: 'active', service_lines: [] },
            ],
            pagination: { total_contracts: 2 },
          }),
        })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: [] }) })
      if (u === '/api/catalog/service-packages') return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (u.startsWith('/api/contracts/templates/manage')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([{
            code: 'TPL_SWITCH',
            name: 'Mẫu kiểm tra switch',
            latest_version: 1,
            active_template: null,
            display_template: { id: 't-1', code: 'TPL_SWITCH', version: 1, name: 'Mẫu kiểm tra switch', status: 'draft', upload_state: 'ready', template_file_name: 't.docx' },
            versions: [],
          }]),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts isDirector={true} />)

    // Wait for contract HD-002 and click to select it
    const row2 = await screen.findByText('HD-002')
    fireEvent.click(row2)

    // Detail pane should show HD-002 as selected
    expect(screen.getByRole('heading', { level: 3, name: 'HD-002' })).toBeInTheDocument()

    // Switch to templates view
    const templatesTab = screen.getByRole('tab', { name: /Mẫu hợp đồng/i })
    fireEvent.click(templatesTab)
    expect(await screen.findByText('TPL_SWITCH')).toBeInTheDocument()

    // Switch back to list view via tab
    const listTab = screen.getByRole('tab', { name: /Danh sách hợp đồng/i })
    fireEvent.click(listTab)

    // Selected contract HD-002 should still be selected in detail pane
    expect(await screen.findByRole('heading', { level: 3, name: 'HD-002' })).toBeInTheDocument()
    expect(container.querySelector('.contract-add-button')).toBeInTheDocument()
  })

  it('openContractModal nạp danh mục mẫu ban hành mới nhất và mở modal soạn hợp đồng', async () => {
    const templatesCatalog = [
      { id: 'tpl-pub-1', code: 'MAU_CHUAN_V1', version: 1, name: 'Mẫu chuẩn ban hành v1' },
      { id: 'tpl-pub-2', code: 'MAU_CHUAN_V2', version: 2, name: 'Mẫu chuẩn ban hành v2' },
    ]

    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.startsWith('/api/contracts/workspace-list')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [], pagination: {} }) })
      }
      if (u === '/api/config') return Promise.resolve({ ok: true, json: async () => ({ personnel: [], services: ['Đo đạc'] }) })
      if (u === '/api/catalog/service-packages') return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
      if (u === '/api/contracts/templates') {
        return Promise.resolve({ ok: true, json: async () => templatesCatalog })
      }
      if (u === '/api/contracts/next-code') return Promise.resolve({ ok: true, json: async () => ({ contract_id: '099/BK-2026' }) })
      if (u === '/api/survey-records/wards/provinces') return Promise.resolve({ ok: true, json: async () => ([]) })
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))

    const { container } = render(<Contracts isDirector={true} />)

    const addButton = await waitFor(() => container.querySelector('.contract-add-button'))
    expect(addButton).toBeInTheDocument()

    fireEvent.click(addButton)

    // Modal should open with contract code and published template choices
    expect(await screen.findByText(/099\/BK-2026/)).toBeInTheDocument()
    expect(await screen.findByText(/Mẫu chuẩn ban hành v1/)).toBeInTheDocument()
  })
})
