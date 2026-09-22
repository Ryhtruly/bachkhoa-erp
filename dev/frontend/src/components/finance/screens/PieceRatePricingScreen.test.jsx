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

  it('centers the catalog action groups consistently', async () => {
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
      expect(group).toHaveClass('piece-rate-actions-cell')
    })

    const actionsHeader = screen.getByText('Thao tác')
    expect(actionsHeader.closest('th')).toHaveStyle({ textAlign: 'center' })
  })

  it('updates metadata including editable code and unit', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: { ...item, name: 'Tên đã sửa', code: 'SURVEY_NEW', default_unit: 'lần' } })
      .mockResolvedValueOnce({ data: [item] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Đo đạc hiện trạng')
    fireEvent.click(screen.getByTestId('piece-rate-edit-metadata-wi_1'))
    expect(screen.getByLabelText('Đơn vị tính')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Đơn vị tính')).toHaveValue('hồ sơ')
    expect(screen.getByLabelText('Mã hạng mục')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Mã hạng mục')).toHaveValue('K01')

    fireEvent.change(screen.getByLabelText('Mã hạng mục'), { target: { value: 'SURVEY_NEW' } })
    fireEvent.change(screen.getByLabelText('Đơn vị tính'), { target: { value: 'lần' } })
    fireEvent.change(screen.getByLabelText('Tên hạng mục'), { target: { value: 'Tên đã sửa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3))
    const [, options] = apiFetchMock.mock.calls[1]
    expect(options.method).toBe('PATCH')
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      code: 'SURVEY_NEW',
      name: 'Tên đã sửa',
      default_unit: 'lần',
    })
  })

  it('asks for confirmation before deactivating an item', async () => {
    apiFetchMock.mockResolvedValue({ data: [item] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Đo đạc hiện trạng')
    fireEvent.click(screen.getByTestId('piece-rate-deactivate-wi_1'))

    expect(screen.getByText('Ngừng sử dụng hạng mục')).toBeInTheDocument()
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
  })

  it('lets a director assign a department when creating a work item', async () => {
    const departments = [
      { id: 'dept_1', name: 'Phòng Pháp lý', code: 'LEGAL' },
      { id: 'dept_2', name: 'Phòng Kỹ thuật', code: 'TECH' },
    ]
    apiFetchMock
      .mockResolvedValueOnce({ data: [], departments })
      .mockResolvedValueOnce({ data: { work_item_id: 'wi_dept' } })
      .mockResolvedValueOnce({ data: [], departments })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Không tìm thấy hạng mục khoán')
    fireEvent.click(screen.getByTestId('piece-rate-add-item'))

    fireEvent.change(screen.getByLabelText('Mã hạng mục'), { target: { value: 'LEGAL_ITEM' } })
    fireEvent.change(screen.getByLabelText('Tên hạng mục'), { target: { value: 'Xin phép xây dựng' } })
    fireEvent.change(screen.getByLabelText('Đơn vị tính'), { target: { value: 'bộ' } })

    const deptTrigger = screen.getByRole('button', { name: 'Phòng ban phụ trách' })
    fireEvent.click(deptTrigger)
    fireEvent.click(screen.getByRole('option', { name: 'Phòng Pháp lý' }))

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hạng mục' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3))
    const [, options] = apiFetchMock.mock.calls[1]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({
      code: 'LEGAL_ITEM',
      name: 'Xin phép xây dựng',
      default_unit: 'bộ',
      department_id: 'dept_1',
    })
  })

  it('lets a director change the assigned department of an existing work item', async () => {
    const departments = [
      { id: 'dept_1', name: 'Phòng Pháp lý', code: 'LEGAL' },
      { id: 'dept_2', name: 'Phòng Đo đạc', code: 'SURVEY' },
    ]
    const itemWithDept = {
      ...item,
      department_id: 'dept_1',
      department_name: 'Phòng Pháp lý',
    }
    apiFetchMock
      .mockResolvedValueOnce({ data: [itemWithDept], departments })
      .mockResolvedValueOnce({ data: { ...itemWithDept, department_id: 'dept_2', department_name: 'Phòng Đo đạc' } })
      .mockResolvedValueOnce({ data: [itemWithDept], departments })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Đo đạc hiện trạng')
    expect(screen.getByText('Phòng Pháp lý')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('piece-rate-edit-metadata-wi_1'))

    const deptTrigger = screen.getByRole('button', { name: 'Phòng ban phụ trách' })
    fireEvent.click(deptTrigger)
    fireEvent.click(screen.getByRole('option', { name: 'Phòng Đo đạc' }))

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3))
    const [, options] = apiFetchMock.mock.calls[1]
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({
      department_id: 'dept_2',
    })
  })

  it('displays "Chưa gán" when work item has no department assigned', async () => {
    const unassignedItem = { ...item, department_id: null, department_name: null }
    apiFetchMock.mockResolvedValue({ data: [unassignedItem] })

    render(<PieceRatePricingScreen isDirector={false} />)
    await screen.findByText('Đo đạc hiện trạng')
    expect(screen.getByText('Chưa gán')).toBeInTheDocument()
  })

  it('shows all rate roles when editing an item that only had a main rate initially', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: [item] })

    render(<PieceRatePricingScreen isDirector />)
    await screen.findByText('Đo đạc hiện trạng')

    fireEvent.click(screen.getByTitle('Sửa đơn giá'))
    expect(screen.getByLabelText('Đơn giá chính (VNĐ)')).toHaveValue(1000000)
    expect(screen.getByLabelText('Phụ đo / hỗ trợ (VNĐ)')).toBeInTheDocument()
    expect(screen.getByLabelText('Người đi nộp (VNĐ)')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Phụ đo / hỗ trợ (VNĐ)'), { target: { value: '250000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật & áp dụng' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(3))
    const [, options] = apiFetchMock.mock.calls[1]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      work_item_id: 'wi_1',
      role_code: 'ASSISTANT',
      amount: 250000,
    })
  })
})

