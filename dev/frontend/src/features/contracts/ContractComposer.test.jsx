import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ContractComposer from './ContractComposer'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(() => 'mock-token'),
}))

describe('ContractComposer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('submits the explicitly chosen template ID', async () => {
    apiFetch.mockImplementation(async (url) => {
      if (url === '/api/catalog/service-packages') {
        return {
          data: [
            {
              id: 'g-1',
              code: 'DO_VE',
              name: 'Đo Vẽ',
              task_types: [{ id: 'tt-1', name: 'Tách thửa' }],
            },
          ],
        }
      }
      return { data: [] }
    })
    vi.stubGlobal('fetch', vi.fn((url) => {
      const normalized = String(url)
      if (normalized === '/api/survey-records/wards/provinces') {
        return Promise.resolve({ ok: true, json: async () => [{ code: '79', name: 'TP. Hồ Chí Minh' }] })
      }
      if (normalized.startsWith('/api/survey-records/wards?province_code=79')) {
        return Promise.resolve({ ok: true, json: async () => [{ code: '26734', name: 'Phường Bến Nghé' }] })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${normalized}`))
    }))
    const onSubmit = vi.fn()

    render(
      <ContractComposer
        open
        code="001/BK-2026"
        services={['Đo đạc']}
        templates={[{ id: 'do-dac-v1', code: 'MAU_HOP_DONG_DO_DAC_BACH_KHOA', version: 1, name: 'Mẫu đo đạc' }]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Mẫu hợp đồng/), { target: { value: 'do-dac-v1' } })
    fireEvent.change(screen.getByLabelText(/Tên khách hàng/), { target: { value: 'Nguyễn Văn An' } })
    fireEvent.change(screen.getByLabelText(/Số điện thoại/), { target: { value: '0901234567' } })
    fireEvent.change(screen.getByLabelText(/Số CCCD/), { target: { value: '079300012345' } })
    await screen.findByRole('option', { name: 'TP. Hồ Chí Minh' })
    fireEvent.change(screen.getByLabelText(/Tỉnh \/ Thành phố/), { target: { value: '79' } })
    await screen.findByRole('option', { name: 'Phường Bến Nghé' })
    fireEvent.change(screen.getByLabelText(/Phường \/ Xã/), { target: { value: '26734' } })
    await screen.findByRole('option', { name: 'Đo Vẽ' })
    fireEvent.change(screen.getByLabelText(/Gói dịch vụ/), { target: { value: 'g-1' } })
    await screen.findByRole('option', { name: 'Tách thửa' })
    fireEvent.change(screen.getByLabelText(/Hạng mục/), { target: { value: 'tt-1' } })
    fireEvent.change(screen.getByLabelText(/Sale \/ nguồn/), { target: { value: 'Trần Minh' } })
    fireEvent.change(screen.getByLabelText(/Giá trị hợp đồng/), { target: { value: '18tr' } })

    fireEvent.click(screen.getByRole('button', { name: 'Lưu hợp đồng' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      contract_template_id: 'do-dac-v1',
      task_type_id: 'tt-1',
    })))
  })
})
