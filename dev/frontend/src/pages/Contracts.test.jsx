import React from 'react'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Contracts from './Contracts'

const { addToast } = vi.hoisted(() => ({ addToast: vi.fn() }))

vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast }) }))

describe('Contracts', () => {
  afterEach(() => vi.unstubAllGlobals())

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
})
