import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { apiFetchMock, addToastMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn(), addToastMock: vi.fn() }))

vi.mock('../../../lib/api', () => ({ apiFetch: apiFetchMock }))
vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import PieceRatePricingScreen from './PieceRatePricingScreen'

const item = {
  work_item_id: 'wi_1',
  code: 'K01',
  name: 'Đo đạc hiện trạng',
  unit: 'hồ sơ',
  is_active: true,
  rates: { MAIN: { rate_id: 'rate_1', amount: 1_000_000 } },
  pending: {},
}

afterEach(() => {
  cleanup()
  apiFetchMock.mockReset()
})

describe('PieceRatePricingScreen catalog controls', () => {
  it('does not expose catalog mutation controls to non-directors', async () => {
    apiFetchMock.mockResolvedValue({ data: [item] })

    render(<PieceRatePricingScreen isDirector={false} />)

    await screen.findByText('Đo đạc hiện trạng')
    expect(screen.queryByTestId('piece-rate-add-item')).not.toBeInTheDocument()
    expect(screen.queryByTestId('piece-rate-edit-metadata-wi_1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('piece-rate-deactivate-wi_1')).not.toBeInTheDocument()
  })

  it('lets a director create a work item and reloads the catalog', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { work_item_id: 'wi_new' } })
      .mockResolvedValueOnce({ data: [] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Không tìm thấy hạng mục khoán')
    fireEvent.click(screen.getByTestId('piece-rate-add-item'))
    fireEvent.change(screen.getByLabelText('Mã hạng mục'), { target: { value: 'K99' } })
    fireEvent.change(screen.getByLabelText('Tên hạng mục'), { target: { value: 'Hạng mục mới' } })
    fireEvent.change(screen.getByLabelText('Đơn vị tính'), { target: { value: 'hồ sơ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hạng mục' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3))
    const [, options] = apiFetchMock.mock.calls[1]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({ code: 'K99', name: 'Hạng mục mới' })
  })

  it('starts new items with an empty unit and disables browser spellcheck for code fields', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: [] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Không tìm thấy hạng mục khoán')
    fireEvent.click(screen.getByTestId('piece-rate-add-item'))

    const codeInput = screen.getByLabelText('Mã hạng mục')
    const nameInput = screen.getByLabelText('Tên hạng mục')
    const unitInput = screen.getByLabelText('Đơn vị tính')
    const outputInput = screen.getByLabelText('Mô tả đầu ra')
    expect(codeInput).toHaveAttribute('spellcheck', 'false')
    expect(codeInput).toHaveAttribute('placeholder', 'Ví dụ: SURVEY_STAKEOUT')
    expect(nameInput).toHaveAttribute('placeholder', 'Ví dụ: Cắm mốc')
    expect(unitInput).toHaveValue('')
    expect(unitInput).toHaveAttribute('spellcheck', 'false')
    expect(unitInput).toHaveAttribute('placeholder', 'Ví dụ: hồ sơ, lần, bộ, sản phẩm...')
    expect(outputInput).toHaveAttribute('placeholder', 'Mô tả kết quả cần đạt của hạng mục...')
    expect(screen.getByLabelText('Đơn giá khởi tạo MAIN')).toHaveAttribute('placeholder', 'Ví dụ: 500000')
  })

  it('keeps the catalog form sections aligned and responsive', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: [] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Không tìm thấy hạng mục khoán')
    fireEvent.click(screen.getByTestId('piece-rate-add-item'))

    expect(screen.getByTestId('piece-rate-item-form')).toBeInTheDocument()
    expect(screen.getByTestId('piece-rate-item-form-metadata')).toHaveClass('piece-rate-item-form__grid')
    expect(screen.getByTestId('piece-rate-item-form-unit')).toHaveClass('piece-rate-item-form__wide')
    expect(screen.getByTestId('piece-rate-item-form-description')).toHaveClass('piece-rate-item-form__wide')
    expect(screen.getByTestId('piece-rate-item-form-rates')).toHaveClass('piece-rate-item-form__rates')
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3)
  })

  it('left-aligns the catalog action groups consistently', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: [
        item,
        { ...item, work_item_id: 'wi_2', code: 'K02', name: 'Hạng mục có giá chờ duyệt', pending: { MAIN: { rate_id: 'pending_1', amount: 2_000_000 } } },
      ],
    })

    render(<PieceRatePricingScreen isDirector />)

    await screen.findByText('Đo đạc hiện trạng')
    const actionGroups = screen.getAllByTestId(/^piece-rate-actions-/)
    expect(actionGroups).toHaveLength(2)
    actionGroups.forEach((group) => {
      expect(group).toHaveClass('piece-rate-pricing__actions')
    })

    const actionsHeader = screen.getByText('Thao tác')
    expect(actionsHeader.closest('th')).toHaveStyle({ textAlign: 'left' })
  })

  it('updates metadata without sending an editable code', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: { ...item, name: 'Tên đã sửa' } })
      .mockResolvedValueOnce({ data: [item] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Đo đạc hiện trạng')
    fireEvent.click(screen.getByTestId('piece-rate-edit-metadata-wi_1'))
    expect(screen.getByLabelText('Đơn vị tính')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Đơn vị tính')).toHaveValue('hồ sơ')
    fireEvent.change(screen.getByLabelText('Tên hạng mục'), { target: { value: 'Tên đã sửa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3))
    const [, options] = apiFetchMock.mock.calls[1]
    expect(options.method).toBe('PATCH')
    const body = JSON.parse(options.body)
    expect(body).toEqual({ name: 'Tên đã sửa' })
    expect(body).not.toHaveProperty('code')
  })

  it('asks for confirmation before deactivating an item', async () => {
    apiFetchMock.mockResolvedValue({ data: [item] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Đo đạc hiện trạng')
    fireEvent.click(screen.getByTestId('piece-rate-deactivate-wi_1'))

    expect(screen.getByText('Ngừng sử dụng hạng mục')).toBeInTheDocument()
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
  })
})
